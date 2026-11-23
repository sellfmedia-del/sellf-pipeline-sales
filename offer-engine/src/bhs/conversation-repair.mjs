import {BudgetError} from '../budget/ledger.mjs';
import {readConversation,conversationMessages} from './conversation-engine.mjs';
import {conversationKeys,conversationVersion} from './conversation-contract.mjs';
import {validateConversationReport} from './conversation-report.mjs';
import {createConversationProviders} from './conversation-providers.mjs';
import {meteredBhsStage} from './job-infrastructure.mjs';
import {presentConversationSource,usableConversationSource} from './conversation-source.mjs';
import {researchReportIssues} from './conversation-research.mjs';
import {researchClosureVersion,researchClosureIssues,collectSourceViews} from './conversation-progress.mjs';
import {semanticReviewVersion,semanticReviewInstruction,applySemanticDecision,introducedReadIssues} from './conversation-semantic.mjs';
import {hash} from '../budget/ledger.mjs';
import {objectiveValidationVersion} from './conversation-objective.mjs';
import {ensureConversationContext} from './conversation-context.mjs';
import {projectModelBrief,protectConversationMessages,ensureModelInputContext} from './conversation-input.mjs';
import {outcomeOptions} from './conversation-offerings.mjs';
import {researchWorkPolicyVersion} from './conversation-work.mjs';
import {createConversationTransfer} from './conversation-transfer.mjs';

export const reportRepairKey=id=>conversationKeys.result(id)+':writing-repair-v1';
export const repairableReport=value=>!value?.conversationReport&&['provider_error','report_review_required'].includes(value?.reason);

// Optional validation-only costs stay outside the customer ledger. Enforce
// their combined ceiling before reserve, without rewriting historical rows.
export function reportRepairLedger(ledger,runId,env=process.env){
 const selected=typeof runId==='string'&&env.OFFER_BHS_VALIDATION_RUN_ID===runId;
 const external=selected?Number(env.OFFER_BHS_VALIDATION_EXTERNAL_KURUS):0;
 if(!Number.isSafeInteger(external)||external<0||external>4500)throw new BudgetError('budget_context','Doğrulama maliyet hesabı geçersiz.');
 const ceiling=5000-external;
 return {ledger:{...ledger,status:async()=>{const status=await ledger.status();return {...status,chargedKurus:status.chargedKurus+external};},
  once:(key,input,amount,run,options={})=>ledger.once(key,input,amount,run,{...options,limitKurus:Math.min(ceiling,options.limitKurus??ceiling)})},external};
}

export async function repairConversationReport({brief,job,ledger,id,getProviders=createConversationProviders,meter=meteredBhsStage,now=Date.now}){
 const conversationContext=await ensureConversationContext({brief,ledger,id});
 const key=reportRepairKey(id),existing=await ledger.get(key);
 if(existing?.state==='complete')return existing.value;
 if(existing)throw new BudgetError('budget_pending','Kayıtlı rapor tamamlama isteği yeniden satın alınmadı.');
 const state=await readConversation(ledger,id),sources=state.sources.filter(usableConversationSource);
 const activeReviewVersion=state.reviewPolicyVersion||semanticReviewVersion;
 const outcomeVersion=state.turns.findLast(turn=>turn.researchOutcomeVersion)?.researchOutcomeVersion;
 if(!sources.length)throw new BudgetError('recovery_unavailable','Rapor için korunmuş okunabilir kaynak yok.');
 const scoped=reportRepairLedger(ledger,job.researchRunId);
 const needsSemantic=state.turns.some(turn=>turn.semanticReviewVersion);
 const needsObjective=state.turns.some(turn=>turn.objectiveValidationVersion);
 return ledger.once(key,{version:conversationVersion,id,mode:'retained-source-writing-v1'},0,async()=>{
  let report,reason,issues=[],closureIssues=[],semanticReview=needsSemantic?{version:activeReviewVersion,status:'pending',attempts:0}:undefined;
  try{
   await meter({job:{id:job.backgroundJobId||id,phase:'conversation_report_repair',briefHash:id},ledger:scoped.ledger,shortResearch:true,run:async()=>{
    const providers=getProviders({ledger:scoped.ledger,executionDeadline:now()+90000});
    const request=await ledger.once(key+':request',{id},0,async()=>{
     await ensureModelInputContext({brief,ledger,id});
     const projection=projectModelBrief(brief);
     // Match the normal source presentation window; the complete originals
     // remain in the original ledger and in the repaired result's archive.
     const presented=sources.map(source=>presentConversationSource(source,{purpose:brief.goals+' '+brief.needs}));
     const views=collectSourceViews({results:[{content:JSON.stringify({sources:presented})}]},new Map(sources.map(source=>[source.id,source])),new Map(state.sourceViews));
     let messages=[{role:'user',content:JSON.stringify({brief:projection.brief,sources:presented,researchSummary:state.researchSummary,researchProgress:state.researchProgress,
      priorDecisions:state.turns.flatMap(turn=>(turn.assistant?.content||[]).filter(block=>block.type==='text').map(block=>block.text))})+
      '\nAraştırma tamamlandı. Yeni kaynak veya araç isteme. Bu korunmuş bağlamdan doğrudan bütün Türkçe BHS raporunu finish_bhs ile yaz. highlights yalnız en önemli dört bulgu olsun. Kaynak sınırlarını açıkla; moreAvailable olan kaynağın yalnız sunulan bölümünü değerlendirdiğini belirt. Sunulmayan bölümde bir bilginin bulunmadığını iddia etme; bilinmeyenleri olgu gibi yazma.'}];
     if(needsSemantic){
      messages=conversationMessages(brief,state,{forceFinish:true,cost:await scoped.ledger.status()});
      const last=messages.at(-1),text='Yeni kaynak veya araç isteme. Açıkça istenen rapor kurtarmasında aynı konuşma ve korunmuş kaynaklarla finish_bhs taslağını tamamla. '+JSON.stringify({sources:presented});
      last.content=typeof last.content==='string'?last.content+'\n'+text:[...last.content,{type:'text',text}];
     }
     messages=protectConversationMessages(messages,{privateValues:projection.privateValues});
     return {messages,sourceViews:[...views],quote:await providers.analystQuote(messages,{final:true,writingOnly:true,analysisVersion:state.analysisVersion,reviewPolicyVersion:state.reviewPolicyVersion}),providerReceiptKey:key+':writing-provider'};
    });
    const answer=await providers.analyst(request.messages,{final:true,writingOnly:true,quote:request.quote,receiptKey:request.providerReceiptKey,remainingReserve:needsSemantic?(request.quote.reviewReservation||0)+400:0});
    const candidate=answer.content?.find(block=>block.type==='tool_use'&&block.name==='finish_bhs')?.input;
    issues=candidate?validateConversationReport(candidate,sources,{semantic:needsSemantic,objective:needsObjective}):['report_unavailable'];
    if(!issues.includes('report_format')&&!issues.includes('report_size')&&typeof candidate?.reportMarkdown==='string'&&candidate.reportMarkdown.trim())report=candidate;
    if(needsSemantic&&report){
     await ledger.once(key+':semantic-draft',{draftDigest:hash(report)},0,async()=>({conversationReport:report,conversationSources:sources,semanticReview,conversationContext,...(needsObjective?{objectiveValidationVersion}:{}),reason:'semantic_review_unavailable',
      ...(state.reviewPolicyVersion===researchWorkPolicyVersion?{conversationTransfer:createConversationTransfer(report,sources,{progress:state.researchProgress})}:{}),
      ...(outcomeVersion?{researchOutcomeVersion:outcomeVersion}:{}),researchSummary:state.researchSummary,researchClosure:{version:researchClosureVersion,progress:state.researchProgress,issues:closureIssues},repair:{kind:'retained-source-writing',semanticDraft:true,newResearchCalls:0}}));
     const reviewRequest=await ledger.once(key+':semantic-request',{draftDigest:hash(report)},0,async()=>{
      const assistant={role:'assistant',content:(answer.content||[]).filter(block=>['text','tool_use','thinking','redacted_thinking'].includes(block.type))};
      const results=(answer.content||[]).filter(block=>block.type==='tool_use').map(block=>({type:'tool_result',tool_use_id:block.id,content:JSON.stringify({draftSaved:true,issues})}));
      const messages=[...request.messages,assistant,{role:'user',content:[...results,{type:'text',text:semanticReviewInstruction(report,0,{analysisVersion:state.analysisVersion,reviewPolicyVersion:state.reviewPolicyVersion})+' Bu kurtarma yalnız yazım/denetim içindir; yeni araştırma çağırma.'}]}];
      return {messages,quote:await providers.analystQuote(messages,{review:true,hasDraft:true,analysisVersion:state.analysisVersion,reviewPolicyVersion:state.reviewPolicyVersion}),providerReceiptKey:key+':review-provider'};
     });
     const reviewed=await providers.analyst(reviewRequest.messages,{review:true,hasDraft:true,quote:reviewRequest.quote,receiptKey:reviewRequest.providerReceiptKey});
     const decision=reviewed.content?.find(block=>block.type==='tool_use'&&block.name==='review_bhs')?.input;
     semanticReview={...semanticReview,attempts:1};
     const assessed=applySemanticDecision(report,decision,{sources,attempts:1,brief,progress:state.researchProgress,reviewPolicyVersion:state.reviewPolicyVersion});
     const checked=validateConversationReport(assessed.report,sources,{semantic:true,objective:needsObjective});
     if(checked.length)throw new BudgetError('semantic_review_invalid',checked.join(', '));
     const proofIssues=introducedReadIssues(report,assessed.report,{sources,progress:state.researchProgress,views:new Map(request.sourceViews||state.sourceViews)});
     if(proofIssues.length&&(state.reviewPolicyVersion||assessed.review.status!=='research_needed'))throw new BudgetError('semantic_review_invalid',proofIssues.join(', '));
     report=assessed.report;semanticReview=assessed.review;issues=checked;
     if(semanticReview.status!=='approved')reason='semantic_research_needed';
    }
    if(issues.length)reason='report_review_required';
    else if(outcomeVersion&&researchReportIssues(report,state.researchSummary,sources,brief,outcomeOptions(outcomeVersion,state.researchProgress)).length)reason='research_incomplete';
    if(state.turns.some(turn=>turn.researchClosureVersion)){
     closureIssues=researchClosureIssues(state.researchProgress,sources,{report,views:new Map(request.sourceViews||state.sourceViews),includeUnavailable:true});
     if(closureIssues.length)reason||='research_incomplete';
    }
   }});
  }catch(error){reason=error.code||'provider_error';if(semanticReview)semanticReview={...semanticReview,status:'pending',lastError:reason};}
  return {...(report?{conversationReport:report}:{}),conversationSources:sources,conversationContext,...(needsObjective?{objectiveValidationVersion}:{}),researchedAt:new Date(now()).toISOString(),reason,
   ...(report&&state.reviewPolicyVersion===researchWorkPolicyVersion?{conversationTransfer:createConversationTransfer(report,sources,{progress:state.researchProgress})}:{}),
   ...(outcomeVersion?{researchOutcomeVersion:outcomeVersion,researchSummary:state.researchSummary}:{}),
   ...(state.turns.some(turn=>turn.researchClosureVersion)?{researchClosure:{version:researchClosureVersion,progress:state.researchProgress,issues:closureIssues}}:{}),
   ...(semanticReview?{semanticReview}:{}),
   toolIssues:issues.map(code=>({tool:'report',code})),researchContext:{brief},
   repair:{kind:'retained-source-writing',newResearchCalls:0,externalCommittedKurus:scoped.external}};
 });
}
