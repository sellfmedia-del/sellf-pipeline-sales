import {BudgetError} from '../budget/ledger.mjs';
import {readConversation} from './conversation-engine.mjs';
import {conversationKeys,conversationVersion} from './conversation-contract.mjs';
import {validateConversationReport} from './conversation-report.mjs';
import {createConversationProviders} from './conversation-providers.mjs';
import {meteredBhsStage} from './job-infrastructure.mjs';

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
 const key=reportRepairKey(id),existing=await ledger.get(key);
 if(existing?.state==='complete')return existing.value;
 if(existing)throw new BudgetError('budget_pending','Kayıtlı rapor tamamlama isteği yeniden satın alınmadı.');
 const state=await readConversation(ledger,id),sources=state.sources.filter(source=>source.method!=='search-snippet');
 if(!sources.length)throw new BudgetError('recovery_unavailable','Rapor için korunmuş okunabilir kaynak yok.');
 const scoped=reportRepairLedger(ledger,job.researchRunId);
 return ledger.once(key,{version:conversationVersion,id,mode:'retained-source-writing-v1'},0,async()=>{
  let report,reason,issues=[];
  try{
   await meter({job:{id:job.backgroundJobId||id,phase:'conversation_report_repair',briefHash:id},ledger:scoped.ledger,shortResearch:true,run:async()=>{
    const providers=getProviders({ledger:scoped.ledger,executionDeadline:now()+90000});
    const request=await ledger.once(key+':request',{id},0,async()=>{
     // Match the normal source presentation window; the complete originals
     // remain in the original ledger and in the repaired result's archive.
     const messages=[{role:'user',content:JSON.stringify({brief,sources:sources.map(({id,url,title,text,method})=>({id,url,title,text:text.slice(0,12000),method,characters:text.length,moreAvailable:text.length>12000})),
      priorDecisions:state.turns.flatMap(turn=>(turn.assistant?.content||[]).filter(block=>block.type==='text').map(block=>block.text))})+
      '\nAraştırma tamamlandı. Yeni kaynak veya araç isteme. Bu korunmuş bağlamdan doğrudan bütün Türkçe BHS raporunu finish_bhs ile yaz. highlights yalnız en önemli dört bulgu olsun. Kaynak sınırlarını açıkla; moreAvailable olan kaynağın yalnız sunulan bölümünü değerlendirdiğini belirt. Sunulmayan bölümde bir bilginin bulunmadığını iddia etme; bilinmeyenleri olgu gibi yazma.'}];
     return {messages,quote:await providers.analystQuote(messages,{final:true,writingOnly:true})};
    });
    const answer=await providers.analyst(request.messages,{final:true,writingOnly:true,quote:request.quote});
    const candidate=answer.content?.find(block=>block.type==='tool_use'&&block.name==='finish_bhs')?.input;
    issues=candidate?validateConversationReport(candidate,sources):['report_unavailable'];
    if(!issues.includes('report_format')&&!issues.includes('report_size'))report=candidate;
    if(issues.length)reason='report_review_required';
   }});
  }catch(error){reason=error.code||'provider_error';}
  return {...(report?{conversationReport:report}:{}),conversationSources:sources,researchedAt:new Date(now()).toISOString(),reason,
   toolIssues:issues.map(code=>({tool:'report',code})),researchContext:{brief},
   repair:{kind:'retained-source-writing',newResearchCalls:0,externalCommittedKurus:scoped.external}};
 });
}
