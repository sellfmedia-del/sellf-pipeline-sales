import {BudgetError,hash} from '../budget/ledger.mjs';
import {conversationKeys,conversationVersion,publicResearchUrl,sourceId} from './conversation-contract.mjs';
import {validateConversationReport} from './conversation-report.mjs';
import {presentConversationSource,usableConversationSource,sourceReadingStatus} from './conversation-source.mjs';
import {researchOutcomeVersion as legacyResearchOutcomeVersion,researchOutcomeIssues,researchCompletionIssues,researchReportIssues,researchOutcomeStatus,marketResearchGuidance} from './conversation-research.mjs';
import {samplingGuidance} from './conversation-sampling.mjs';
import {assertSchema} from './schema.mjs';
import {researchClosureVersion,emptyResearchProgress,collectSourceViews,updateResearchProgress,researchClosureIssues,researchStatus,sourceReadIdentity} from './conversation-progress.mjs';
import {semanticReviewVersion,semanticReviewOutputTokens,maximumSemanticReviews,semanticReviewInstruction,semanticResearchReady,applySemanticDecision,introducedReadIssues} from './conversation-semantic.mjs';
import {objectiveValidationVersion} from './conversation-objective.mjs';
import {ensureConversationContext} from './conversation-context.mjs';
import {sourceNavigation,navigationVersion,existingAssetGuidance,navigationGuidance} from './conversation-navigation.mjs';
import {evidenceGuidance,sourceEvidenceBoundary,failedEvidenceBoundary} from './conversation-evidence.mjs';
import {conversationQuote} from './conversation-providers.mjs';
import {workerInfraReservationKurus} from './job-infrastructure.mjs';
import {projectModelBrief,protectConversationMessages,protectModelValue,ensureModelInputContext,crmContextGuidance} from './conversation-input.mjs';
import {checkedOfferingVersion,offeringOutcomeFor,researchSchemaFor,offeringAnalysisGuidance,outcomeOptions} from './conversation-offerings.mjs';
import {marketAnalysisVersion,marketAnalysisGuidance} from './conversation-market.mjs';
import {compactBudgetText,currentBudgetStatus} from './conversation-budget.mjs';

export const maximumConversationTurns=16;
const complete=row=>row?.state==='complete';
const safeIssue=(error,tool)=>({tool,code:/^[a-z0-9_]{1,80}$/u.test(error.code||'')?error.code:'provider_error',
 ...(error.code==='report_validation'?{validationIssues:error.message.split(', ').filter(value=>/^[a-z0-9_]{1,80}$/u.test(value))}:{}),
 ...(Number.isInteger(error.providerStatus)?{providerStatus:error.providerStatus}:{})});

export async function readConversation(ledger,id){
 const policy=await ledger.get(conversationKeys.policy(id));
 const analysisVersion=checkedOfferingVersion(complete(policy)?policy.value?.analysisVersion:undefined);
 const pairs=await Promise.all(Array.from({length:maximumConversationTurns},async(_,index)=>{
  const key=conversationKeys.turn(id,index);return Promise.all([ledger.get(key),ledger.get(key+':recovered')]);
 }));
 const rows=pairs.map(([original,recovered])=>complete(original)?original:complete(recovered)?recovered:original||recovered);
 const turns=[];
 for(const row of rows){if(!complete(row))break;turns.push(row.value);}
 const sources=new Map(),knownUrls=new Set(),readAttempts=new Set(),toolIssues=[],sourceViews=new Map();
 for(const turn of turns){
  for(const source of turn.sources||[]){sources.set(source.id,{...source,...sourceReadIdentity(source),readingStatus:sourceReadingStatus(source)});knownUrls.add(source.url);
   if(publicResearchUrl(source.navigationFinalUrl))knownUrls.add(source.navigationFinalUrl);
   for(const url of source.links||[])knownUrls.add(url);}
  for(const url of turn.readAttempts||[])readAttempts.add(url);
  toolIssues.push(...(turn.toolIssues||[]));
  collectSourceViews(turn,sources,sourceViews);
 }
 const final=turns.findLast(t=>t.conversationReport||t.closed);
 const pending=pairs[turns.length];
 if(turns.some(turn=>turn.analysisVersion&&turn.analysisVersion!==analysisVersion))throw new BudgetError('budget_context','Korunmuş ürün/rakip araştırma sürümü bu oturumla eşleşmiyor.');
 return {turns,index:turns.length,sources:[...sources.values()],knownUrls,readAttempts,toolIssues,final,analysisVersion,
  researchSummary:turns.findLast(turn=>turn.researchSummary)?.researchSummary,
  researchProgress:turns.findLast(turn=>turn.researchProgress)?.researchProgress||emptyResearchProgress(),sourceViews,
  reportDraft:turns.findLast(turn=>turn.reportDraft)?.reportDraft,semanticReview:turns.findLast(turn=>turn.semanticReview)?.semanticReview,
  interrupted:rows[turns.length]&&!complete(rows[turns.length]),
  recoverFreeTurn:Boolean(pending?.[0]&&!complete(pending[0])&&pending[0].charge_kurus===0&&!pending[1])};
}
function archiveSource(value,now){
 const url=publicResearchUrl(value.url);
 if(!url||typeof value.text!=='string')return null;
 const navigation=sourceNavigation({...value,url});
 const source={id:sourceId(url),url,title:String(value.title||url),text:value.text,method:value.method,
  links:navigation.links.map(row=>row.url),navigation:navigation.links,navigationVersion,navigationTruncated:navigation.truncated,
  ...(value.navigationStatus?{navigationStatus:value.navigationStatus}:{}),...(value.navigationIssue?{navigationIssue:value.navigationIssue}:{}),
  ...(value.navigationFinalUrl?{navigationFinalUrl:value.navigationFinalUrl}:{}),...(value.sample?{sample:value.sample}:{}),retrievedAt:new Date(now).toISOString()};
 const readingStatus=sourceReadingStatus(source);
 return {...source,...sourceReadIdentity(source),readingStatus,evidenceBoundary:sourceEvidenceBoundary(source,readingStatus)};
}

export function conversationMessages(brief,state,{forceFinish=false,review=false,cost,finalReserve=0,outputTokens}={}){
 const projection=projectModelBrief(brief);
 const messages=[{role:'user',content:'BHS hazırlaman gereken marka ve görüşme bağlamı aşağıdaki JSONdur. Marka ve hedefi bütün olarak değerlendir.\n'+JSON.stringify(projection.brief)+'\n'+existingAssetGuidance+'\n'+navigationGuidance+'\n'+marketResearchGuidance+'\n'+samplingGuidance+'\n'+evidenceGuidance+'\n'+crmContextGuidance+
  (state.analysisVersion?'\n'+offeringAnalysisGuidance:'')+
  (state.analysisVersion===marketAnalysisVersion?'\n'+marketAnalysisGuidance:'')+
  (projection.boundary.redactions||projection.boundary.crmExcluded?'\nModel girdi sınırı: '+JSON.stringify(projection.boundary):'')}];
 const addBudget=text=>{
  if(messages.at(-1).role==='user'){
   const last=messages.at(-1);last.content=typeof last.content==='string'?last.content+'\n'+text:[...last.content,{type:'text',text}];
  }else messages.push({role:'user',content:text});
 };
 for(const turn of state.turns){
  if(turn.budgetText)addBudget(compactBudgetText(turn.budgetText,state.analysisVersion));
  if(turn.assistant?.content?.length)messages.push(turn.assistant);
  if(turn.results?.length)messages.push({role:'user',content:turn.results});
 }
 if(state.reportDraft&&!state.turns.some(turn=>turn.assistant?.content?.some(block=>block.type==='tool_use'&&block.name==='finish_bhs')))
  addBudget('Korunmuş taslak: '+JSON.stringify(state.reportDraft));
 const budget={committedKurus:cost?.chargedKurus,capKurus:5000,finalReportReserveKurus:finalReserve,
  ...(outputTokens?{currentTurnOutputTokens:outputTokens}:{}),
  searchMaximumKurus:62,extractUpToFivePagesMaximumKurus:62,
  ...currentBudgetStatus(researchStatus(state.researchProgress,state.sources),
   researchOutcomeStatus(state.researchSummary,state.sources,brief,state.researchProgress,state.analysisVersion),state.analysisVersion),
  instruction:review?semanticReviewInstruction(state.reportDraft,state.semanticReview?.attempts||0,{researchIssues:[...researchOutcomeIssues(state.researchSummary,state.sources,brief,{progress:state.researchProgress,analysisVersion:state.analysisVersion}),...researchClosureIssues(state.researchProgress,state.sources)],questions:state.researchProgress?.questions||[],analysisVersion:state.analysisVersion}):state.reportDraft?
   state.semanticReview?.researchHold?'Taslağı koru. Açık kamu sorusu/okunacak aday veya pazar-rakip sonucu hâlâ eksik. Gerçek dar soruyu sen seç; gerekirse review_research ile kaydet, ilgili mevcut gövdeyi ücretsiz kullan veya uygun kaynağı oku. Geçerli sonuçları silmeden begin_report ile eksik pazar/rakip sonucunu güncelle; sonra review_bhs ile yalnız etkilenen kısmı düzelt. Yeni finish_bhs yazma.':
    'Önceki taslak korunuyor. Yalnız denetimin işaretlediği kamu sorusunu tamamla; bütün raporu yeniden yazma. Yeni kanıtla review_bhs kullanarak etkilenen kısmı düzelt.':
   forceFinish?'Araştırma penceresi kapandı. Yeni araştırma yapmadan mevcut kanıt, brief ve açıkça işaretli analizle bütün raporu finish_bhs ile tamamla.':'Önemli eksik bilgi için sıradaki yararlı işi seç. İlgili bulunan sayfayı oku; rapor ve anlam denetimi rezervini koru.'};
 addBudget('Sistem bütçe bilgisi: '+JSON.stringify(budget));
 return protectConversationMessages(messages,{privateValues:projection.privateValues});
}

// One durable assistant turn at a time. Provider receipts are committed before
// the zero-cost turn checkpoint, so a lost queue acknowledgement cannot buy it twice.
export async function advanceConversation({brief,ledger,id,providers,now=Date.now,deadline=Infinity}){
 await ensureConversationContext({brief,ledger,id});
 const state=await readConversation(ledger,id);
 const researchOutcomeVersion=state.analysisVersion?offeringOutcomeFor(state.analysisVersion):legacyResearchOutcomeVersion;
 if(state.final)return state.final;
 if(state.interrupted&&!state.recoverFreeTurn)throw new BudgetError('stage_paused','Önceki konuşma kaydı kesildi; ücretli çağrı tekrarlanmadı.');
 if(state.index>=maximumConversationTurns)throw new BudgetError('conversation_limit','Analiz tur sınırına ulaştı.');
 const cost=await ledger.status();
 const hardFinish=state.index>=maximumConversationTurns-2||now()>=deadline-45000;
 const closureReady=!researchCompletionIssues(state.researchSummary,state.sources,brief,{progress:state.researchProgress,analysisVersion:state.analysisVersion}).length&&!researchClosureIssues(state.researchProgress,state.sources).length;
 const forceFinish=hardFinish||closureReady&&state.turns.some(t=>t.finishRequested);
 let reviewMode=Boolean(state.reportDraft)&&(semanticResearchReady(state.semanticReview,state.researchProgress,closureReady)||hardFinish);
 let messages,quote,answer,providerReceiptKey,finalMode=forceFinish&&!state.reportDraft,providerIssue;
 const recoverySources=[],recoveryReads=[],fallbackViews=new Map(state.sourceViews);let observedSourceViews,fallbackObservations=[];
 try{
  let requestKey='audit:conversation:request:'+id+':'+state.index;
  let request=await ledger.get(requestKey);
  if(request&&!complete(request)&&request.charge_kurus===0){requestKey+=':recovered';request=await ledger.get(requestKey);}
  if(request&&!complete(request))throw new BudgetError('stage_paused','Kaydedilmemiş model isteği yeniden başlatılmadı.');
  if(complete(request)){
   ({messages,quote,finalMode,reviewMode=false,providerReceiptKey}=request.value);
   if(!providerReceiptKey)throw new BudgetError('stage_paused','Eski isteğin ücretli kimliği doğrulanamadı; tekrar başlatılmadı.');
  }
  else{
   await ensureModelInputContext({brief,ledger,id});
   if(reviewMode&&(state.semanticReview?.attempts||0)>=maximumSemanticReviews)throw new BudgetError('semantic_review_limit','Anlam denetimi sınırına ulaşıldı; taslak korundu.');
   messages=conversationMessages(brief,state,{forceFinish:finalMode,review:reviewMode,cost});
   const availableKurus=Math.max(0,5000-cost.chargedKurus);
   quote=await providers.analystQuote(messages,{final:finalMode,review:reviewMode,hasDraft:Boolean(state.reportDraft),availableKurus,analysisVersion:state.analysisVersion});
  // Fund a complete answer before authorizing further discovery. Its quote
  // uses this actual conversation's token count, not a fixed 20 TRY partition.
   if(!finalMode&&!reviewMode&&(quote.funded===false||cost.chargedKurus+quote.reservation+(quote.completionReservation??quote.finalReservation)+(quote.followingReserveKurus??400)+(quote.toolReserveKurus??0)>5000)){
    if(state.reportDraft)reviewMode=true;else finalMode=true;
    messages=conversationMessages(brief,state,{forceFinish:finalMode,review:reviewMode,cost});
    quote=await providers.analystQuote(messages,{final:finalMode,review:reviewMode,hasDraft:Boolean(state.reportDraft),availableKurus,analysisVersion:state.analysisVersion});
   }
   // Only the reserve's digits change after counting; the quote already has
   // 512 tokens of input headroom. Freeze the truthful reserve with the request.
   messages=conversationMessages(brief,state,{forceFinish:finalMode,review:reviewMode,cost,finalReserve:quote.completionReservation??quote.finalReservation,outputTokens:quote.output});
   providerReceiptKey='model:conversation:claude-request:'+id+':'+state.index;
   await ledger.once(requestKey,{id,index:state.index},0,async()=>({messages,quote,finalMode,reviewMode,providerReceiptKey}));
  }
  messages=protectConversationMessages(messages,{privateValues:projectModelBrief(brief).privateValues});
  answer=await providers.analyst(messages,{final:finalMode,review:reviewMode,hasDraft:Boolean(state.reportDraft),quote,receiptKey:providerReceiptKey,
   analysisVersion:state.analysisVersion,remainingReserve:reviewMode?0:finalMode?(quote.reviewReservation||0)+(quote.followingReserveKurus??400):(quote.completionReservation??quote.finalReservation??0)+(quote.followingReserveKurus??400)});
 }catch(error){
  providerIssue=safeIssue(error,'claude');
  if(state.reportDraft)return save({closed:true,conversationReport:state.reportDraft,reportDraft:state.reportDraft,reason:'semantic_review_unavailable',
   semanticReview:{...state.semanticReview,version:semanticReviewVersion,status:'pending',lastError:providerIssue.code},toolIssues:[providerIssue],results:[]});
  if(error.code==='stage_paused')return save({closed:true,reason:'stage_paused',toolIssues:[providerIssue],results:[]});
  if(error.code==='input_privacy')return save({closed:true,reason:'input_privacy',toolIssues:[providerIssue],results:[]});
  // A reserved/uncertain request remains charged. A separate provider may
  // complete the answer only inside the same remaining capped account.
  if(providers.fallbackReport){
   try{
    if(!state.sources.some(usableConversationSource)&&providers.extract){
     recoveryReads.push(brief.website);
     const seed=await providers.extract({urls:[brief.website],purpose:'Ana analist erişilemedi; yedek analiz için markanın kendi sayfasını oku.'},
      {remainingReserve:quote?.finalReservation||1000});
     for(const row of seed.results||[]){const source=archiveSource(row,now());if(source)recoverySources.push(source);}
    }
    const fallbackKey='audit:conversation:request:'+id+':'+state.index+':fallback';
    const fallbackInput=await ledger.once(fallbackKey,{id,index:state.index},0,async()=>protectModelValue({brief,sources:[...state.sources,...recoverySources],
     previous:state.turns.map(t=>t.assistant?.content).filter(Boolean),conversation:messages||conversationMessages(brief,state,{forceFinish:true,cost}),
     researchSummary:state.researchSummary,researchProgress:state.researchProgress},{privateValues:projectModelBrief(brief).privateValues}));
    const report=await providers.fallbackReport(fallbackInput,
     {remainingReserve:quote?.reviewReservation||0,receiptKey:'model:conversation:gemini-request:'+id+':'+state.index});
    if(report.observedSources){
     fallbackObservations=report.observedSources.filter(source=>source.passages?.some(range=>!state.sourceViews.get(source.id)?.ranges.some(seen=>seen.start<=range.start&&seen.end>=range.end)));
     collectSourceViews({results:[{content:JSON.stringify({sources:report.observedSources})}]},new Map([...state.sources,...recoverySources].map(source=>[source.id,source])),fallbackViews);
     observedSourceViews=[...fallbackViews].map(([sourceId,view])=>({sourceId,...view}));
    }
    if(report.data)answer={content:[{type:'tool_use',id:'gemini_final_'+state.index,name:'finish_bhs',input:report.data}],stopReason:'tool_use',fallback:true};
   }catch{/* The free, explicitly partial handoff below preserves all receipts. */}
  }
  if(!answer)return save({closed:true,reason:providerIssue.code,toolIssues:[providerIssue],sources:recoverySources,readAttempts:recoveryReads,results:[]});
 }
 const calls=(answer.content||[]).filter(block=>block.type==='tool_use');
 const assistant={role:'assistant',content:(answer.content||[]).filter(b=>['text','tool_use','thinking','redacted_thinking'].includes(b.type))};
 const results=[],newSources=[...recoverySources],readAttempts=[...recoveryReads],toolIssues=providerIssue?[providerIssue]:[];
 let report,reportCandidate,terminalReason,researchSummary=state.researchSummary,researchIssues,
  researchProgress=state.researchProgress,closureIssues,finishRequested=finalMode,reportDraft=state.reportDraft,
  semanticReview=state.semanticReview;
 if(reviewMode)semanticReview={...state.semanticReview,version:semanticReviewVersion,status:'pending',attempts:(state.semanticReview?.attempts||0)+1};
 const sourceMap=new Map([...state.sources,...recoverySources].map(s=>[s.id,s])),knownUrls=new Set([...state.knownUrls,brief.website]);
 const add=(rows,purpose)=>rows.flatMap(row=>{
  const source=archiveSource(row,now());if(!source)return [];
  const previous=sourceMap.get(source.id);
  if(previous&&previous.method!=='search-snippet'&&source.method==='search-snippet')return [presentConversationSource(previous,{purpose})];
  sourceMap.set(source.id,source);knownUrls.add(source.url);for(const url of source.links)knownUrls.add(url);
  if(publicResearchUrl(source.navigationFinalUrl))knownUrls.add(source.navigationFinalUrl);
  newSources.push(source);return [presentConversationSource(source,{purpose})];
 });
 const finalReserve=(quote?.completionReservation??quote?.finalReservation??0)+(quote?.followingReserveKurus??400);
 const toolOptions={remainingReserve:finalReserve};
 for(let index=0;index<calls.length;index++){
  const call=calls[index];let value,error;
  try{
   if(index>=4)throw new BudgetError('tool_batch_limit','Bu turdaki ek emir sonraki karara bırakıldı.');
   if(reviewMode&&call.name!=='review_bhs')throw new BudgetError(call.name==='finish_bhs'?'draft_preserved':'semantic_review_invalid',
    'Denetimde yalnız review_bhs kullan. Taslağı yeniden yazma veya doğrudan ücretli araştırma açma; gereken dar kamu sorusunu research_needed ile belirt.');
   if(call.name==='review_bhs'){
    if(answer.stopReason==='max_tokens')throw new BudgetError('semantic_review_invalid','Denetim çıktı sınırında kesildi; taslak korundu, kalite onayı verilmedi.');
    if(!reviewMode)throw new BudgetError('research_needed','Denetimin açtığı önemli kamu sorusu hâlâ açık; önce o araştırmayı tamamla.');
    if(!reportDraft||calls.length!==1)throw new BudgetError('semantic_review_invalid','Önce korunmuş tek taslağı ayrı bir denetim yanıtında değerlendir.');
    const attempts=reviewMode?semanticReview.attempts:(state.semanticReview?.attempts||0)+1;
    if(attempts>maximumSemanticReviews)throw new BudgetError('semantic_review_invalid','Denetim tur sınırı aşılamaz.');
    const assessed=applySemanticDecision(reportDraft,call.input,{sources:[...sourceMap.values()],attempts});
    const mechanical=validateConversationReport(assessed.report,[...sourceMap.values()],{semantic:true,objective:true});
    if(mechanical.length&&assessed.review.status!=='research_needed')throw new BudgetError('semantic_review_invalid',mechanical.join(', '));
    const proofIssues=introducedReadIssues(reportDraft,assessed.report,{sources:[...sourceMap.values()],progress:researchProgress,views:state.sourceViews});
    if(proofIssues.length&&assessed.review.status!=='research_needed')throw new BudgetError('semantic_review_invalid',proofIssues.join(', '));
    semanticReview={...assessed.review,researchCycles:state.semanticReview?.researchCycles||0};reportDraft=assessed.report;
    // A mechanically incomplete research handoff is not completed by an
    // honest approval. One affordable reopening can preserve this draft and
    // the remaining scoped review, without another full-report generation.
    const gaps=[...researchCompletionIssues(researchSummary,[...sourceMap.values()],brief,{progress:researchProgress,analysisVersion:state.analysisVersion}),...researchClosureIssues(researchProgress,[...sourceMap.values()])];
    if(semanticReview.status==='approved'&&gaps.length&&!hardFinish&&state.index<=maximumConversationTurns-6&&attempts<maximumSemanticReviews&&!semanticReview.researchCycles){
     const balance=await ledger.status(),availableKurus=Math.max(0,5000-balance.chargedKurus-workerInfraReservationKurus);
     let affordable=false;
     try{affordable=conversationQuote(quote.inputUpper+(answer.usage?.output_tokens||quote.output||semanticReviewOutputTokens)+2048,
      {hasDraft:true,availableKurus,analysisVersion:state.analysisVersion}).funded;}catch{/* Real admission still re-counts and checks the same ledger on the next turn. */}
     if(affordable)semanticReview={...semanticReview,status:'research_needed',researchCycles:1,researchHold:{reason:'objective_research_gaps',issues:[...new Set(gaps)],approvalRationale:assessed.review.rationale}};
    }
    if(semanticReview.status==='research_needed'){
     const questions=new Map(researchProgress.questions.map(row=>[row.id,row]));
     if(!semanticReview.researchHold){semanticReview.researchCycles++;for(const issue of semanticReview.issues)questions.set('semantic_'+issue.id,{id:'semantic_'+issue.id,question:issue.question,access:'public',important:true,status:'open',answer:'',sourceIds:[],attemptedUrls:[],rationale:issue.reason});}
     researchProgress={...researchProgress,questions:[...questions.values()]};finishRequested=false;
     if(hardFinish||attempts>=maximumSemanticReviews){report=reportDraft;terminalReason='semantic_research_needed';}
     value={accepted:true,draftPreserved:true,semanticReview,instruction:semanticReview.researchHold?
      'Taslağı ve geçerli sonuçları koru. İşaretli araştırma açığı için dar soruyu sen seç; mevcut gövdeyi ücretsiz kullan veya ilgili kaynağı oku. review_research/begin_report ile eksik sonucu tamamlayıp hedefli review_bhs denetimine dön.':
      'Taslağı koru; yalnız belirtilen kamu sorusunu araştır ve ardından hedefli denetime dön.'};
    }else{
     researchIssues=researchReportIssues(reportDraft,researchSummary,[...sourceMap.values()],brief,{progress:researchProgress,analysisVersion:state.analysisVersion});
     closureIssues=researchClosureIssues(researchProgress,[...sourceMap.values()],{report:reportDraft,views:state.sourceViews,includeUnavailable:true});
     report=reportDraft;if(researchIssues.length||closureIssues.length)terminalReason='research_incomplete';
     value={accepted:true,semanticReview};
    }
   }else if(call.name==='finish_bhs'&&reportDraft)throw new BudgetError('draft_preserved','Taslağı bütünüyle yeniden yazma. review_bhs ile yalnız işaretlenen kısmı düzelt.');
   else if(call.name==='review_research'){
    researchProgress=updateResearchProgress(researchProgress,call.input,{sources:[...sourceMap.values()],views:state.sourceViews,knownUrls,
     readAttempts:state.readAttempts,toolIssues:state.toolIssues});
    value={accepted:true,...researchStatus(researchProgress,[...sourceMap.values()])};
   }else if(call.name==='begin_report'){
    // A missing peer comparison cannot erase valid market results. Keep the
    // typed handoff in the same context while completion remains blocked.
    try{assertSchema(call.input,researchSchemaFor(state.analysisVersion));researchSummary=call.input;}catch{/* Malformed input remains visible in its original tool turn. */}
    const missing=[...researchCompletionIssues(call.input,[...sourceMap.values()],brief,{progress:researchProgress,analysisVersion:state.analysisVersion}),...researchClosureIssues(researchProgress,[...sourceMap.values()])];
    if(typeof call.input.reason!=='string'||!call.input.reason.trim())missing.push('research_completion_reason_missing');
    if(calls.some(other=>!['begin_report','review_research'].includes(other.name)))missing.push('research_observations_pending');
    if(missing.length&&!finalMode)throw new BudgetError('research_needed',missing.join(', '));
    researchSummary=call.input;
    finishRequested=true;value={accepted:true,instruction:reportDraft?'Araştırma sonucu kaydedildi. Korunmuş taslağı yeniden yazmadan review_bhs ile yalnız etkilenen kısmı denetle ve düzelt.':
     'Aynı konuşmadaki bütün kaynaklar ve değerlendirmeyle şimdi finish_bhs kullan.'};
   }else if(call.name==='finish_bhs'&&!finalMode&&!answer.fallback){
    const missing=[...researchCompletionIssues(researchSummary,[...sourceMap.values()],brief,{progress:researchProgress,analysisVersion:state.analysisVersion}),...researchClosureIssues(researchProgress,[...sourceMap.values()])];
    if(missing.length)throw new BudgetError('research_needed',missing.join(', '));
    finishRequested=true;value={accepted:false,instruction:'Tam rapor için çıktı alanı şimdi ayrılacak. Sonraki yanıtta bütün raporu finish_bhs ile tamamla.'};
   }else if(call.name==='finish_bhs'){
    const issues=validateConversationReport(call.input,[...sourceMap.values()],{semantic:true,objective:true});
    const unusable=issues.includes('report_format')||issues.includes('report_size')||typeof call.input?.reportMarkdown!=='string'||!call.input.reportMarkdown.trim();
    if(!unusable)reportCandidate=call.input;
    if(unusable)throw new BudgetError('report_validation',issues.join(', '));
    if(calls.length!==1)throw new BudgetError('report_validation','Araştırma sonuçlarını aldıktan sonra raporu ayrı bir yanıtta tamamla.');
    researchIssues=researchReportIssues(call.input,researchSummary,[...sourceMap.values()],brief,{progress:researchProgress,analysisVersion:state.analysisVersion});
    closureIssues=researchClosureIssues(researchProgress,[...sourceMap.values()],{report:call.input,views:answer.fallback?fallbackViews:state.sourceViews,includeUnavailable:true});
    reportDraft=call.input;semanticReview={version:semanticReviewVersion,status:'pending',draftDigest:hash(reportDraft),reportDigest:hash(reportDraft),attempts:0,mechanicalIssues:issues};
    value={accepted:true,draftSaved:true,reviewRequired:true,draftDigest:hash(reportDraft),issues,
     ...(answer.fallback?{sources:fallbackObservations}:{}),
     instruction:'Tam taslak kaydedildi. Şimdi aynı konuşmada review_bhs ile anlam denetimi yap; yalnız sorunlu bölümü düzelt, iyi anlatımı aynen koru.'};
   }else if(finalMode)throw new BudgetError('research_closed','Kalan bütçe ve süre tam rapor için korundu.');
   else if(call.name==='search_web')value={sources:add((await providers.search(call.input,toolOptions)).results,call.input.purpose)};
   else if(call.name==='read_pages'){
    const urls=call.input.urls?.map(publicResearchUrl);
    if(!urls?.length||urls.some(u=>!u||!knownUrls.has(u)))throw new BudgetError('unknown_source','Briefte veya sonuçlarda gözlemlenen bir URL seç.');
    const cached=[],fresh=[];
    for(const url of urls){
     const existing=sourceMap.get(sourceId(url));
     if(existing&&existing.method!=='search-snippet')cached.push(presentConversationSource(existing,{purpose:call.input.purpose}));
     else if(state.readAttempts.has(url))throw new BudgetError('source_already_failed','Bu URL daha önce okunamadı; başka kaynak veya uygun scraper seç.');
     else fresh.push(url);
    }
    readAttempts.push(...fresh);
    const extracted=fresh.length?await providers.extract({...call.input,urls:fresh},toolOptions):{results:[],failures:[]};
    value={sources:[...cached,...add(extracted.results,call.input.purpose)],failures:(extracted.failures||[]).map(failure=>({...failure,evidenceBoundary:failedEvidenceBoundary}))};
   }else if(call.name==='read_saved_source'){
    const source=sourceMap.get(call.input.sourceId),offset=call.input.offset;
    if(!source||!Number.isSafeInteger(offset)||offset<0)throw new BudgetError('unknown_source','Arşiv kaynağı veya metin aralığı geçersiz.');
     const linkOffset=call.input.linkOffset??0;
     if(!Number.isSafeInteger(linkOffset)||linkOffset<0)throw new BudgetError('unknown_source','Bağlantı aralığı geçersiz.');
     value={...presentConversationSource(source,{offset,linkOffset}),offset};
   }else if(call.name==='consult_gemini'){
    if(!Array.isArray(call.input.sourceIds)||!call.input.sourceIds.length||call.input.sourceIds.some(id=>!sourceMap.has(id)))throw new BudgetError('unknown_source','Gemini için bilinen kaynakları seç.');
    value=await providers.consult({question:call.input.question,sources:call.input.sourceIds.map(id=>sourceMap.get(id))},toolOptions);
   }else if(call.name==='specialist_read'){
    const url=publicResearchUrl(call.input.url);
    if(!url||!knownUrls.has(url))throw new BudgetError('unknown_source','Scraper için gözlemlenen kaynak gerekli.');
    if(['page','product'].includes(call.input.mode)&&![...state.readAttempts,...readAttempts].includes(url))throw new BudgetError('source_not_tried','Sayfa veya ürün için önce Tavily okumasını dene.');
    if(!providers.specialist)throw new BudgetError('not_configured','Uygun maliyeti doğrulanmış scraper bu ortamda yok.');
    const extracted=await providers.specialist(call.input,{brief,sources:[...sourceMap.values()]},toolOptions);
    const {results:extractedRows,...details}=extracted;
    value={...details,sources:add(extractedRows||[],call.input.purpose)};
   }else throw new BudgetError('unknown_tool','Bilinmeyen araştırma aracı.');
  }catch(failure){error=safeIssue(failure,call.name);toolIssues.push(error);value={...error,...(['search_web','read_pages','specialist_read','consult_gemini'].includes(call.name)?{evidenceBoundary:failedEvidenceBoundary}:{}),message:['report_validation','research_needed','research_progress_invalid','semantic_review_invalid','draft_preserved'].includes(failure.code)?failure.message:'Bu emir tamamlanmadı. Başka uygun kaynak veya mevcut bilgilerle devam et.',
    ...(['research_needed','research_progress_invalid','budget_limit','input_budget'].includes(failure.code)?{research:researchStatus(researchProgress,[...sourceMap.values()]),outcomes:researchOutcomeStatus(researchSummary,[...sourceMap.values()],brief,researchProgress,state.analysisVersion),instruction:'Önemli public soruyu veya ilgili kaynak okumasını tamamla; review_research ile gerçek ilerlemeyi kaydet. Bir aracın reddi tüm araştırmayı bitirmez; daha dar veya ücretsiz arşiv okumasını değerlendir. Müşteriden alınacak iç bilgiler araştırmayı kilitlemez. Bütçe/süre sınırında eldeki rapor korunacak.'}:{})};
   if(error.code==='report_validation'&&(answer.fallback||state.turns.some(turn=>turn.toolIssues?.some(issue=>issue.code==='report_validation'))))terminalReason='report_review_required';}
  results.push({type:'tool_result',tool_use_id:call.id,content:JSON.stringify(value),...(error?{is_error:true}:{})});
 }
 if(!calls.length)finishRequested=closureReady||finalMode;
 if(reviewMode&&(!report&&semanticReview?.status==='pending')){
  semanticReview={...semanticReview,lastError:toolIssues.at(-1)?.code||'semantic_review_missing'};
  if(semanticReview.attempts>=maximumSemanticReviews){report=reportDraft;terminalReason='semantic_review_unavailable';}
 }
 return save({assistant,results,sources:newSources,readAttempts,toolIssues,finishRequested,
  ...(researchSummary?{researchSummary}:{}),...(researchIssues?{researchIssues}:{}),researchOutcomeVersion,
  researchProgress,...(closureIssues?{closureIssues}:{}),
  ...(reportDraft?{reportDraft}:{}),...(semanticReview?{semanticReview}:{}),
  ...(observedSourceViews?{observedSourceViews}:{}),
  ...(report?{closed:true,conversationReport:report,...(terminalReason?{reason:terminalReason}:{})}:{}),...(answer.fallback?{fallbackProvider:'gemini'}:{}),
  ...(terminalReason&&!report?{closed:true,reason:terminalReason}:{}),
  ...(!report&&reportCandidate?{reportCandidate}:{}),
  ...(answer.stopReason==='max_tokens'?{outputInterrupted:true}:{})});

 async function save(turn){
  const last=messages?.at(-1)?.content;
  const budgetText=typeof last==='string'?last.match(/Sistem bütçe bilgisi: .*$/su)?.[0]:last?.findLast(block=>block.type==='text'&&block.text.startsWith('Sistem bütçe bilgisi: '))?.text;
  const value={...turn,...(budgetText?{budgetText}:{}),index:state.index,version:conversationVersion,...(state.analysisVersion?{analysisVersion:state.analysisVersion}:{}),researchOutcomeVersion,researchClosureVersion,semanticReviewVersion,objectiveValidationVersion,recordedAt:new Date(now()).toISOString()};
  return ledger.once(conversationKeys.turn(id,state.index)+(state.recoverFreeTurn?':recovered':''),{version:conversationVersion,id,index:state.index},0,async()=>value);
 }
}

export async function readConversationResult(ledger,id){
 const repaired=await ledger.get(conversationKeys.result(id)+':writing-repair-v1');
 if(complete(repaired))return repaired;
 if(repaired?.state==='uncertain'){
  const draft=await ledger.get(conversationKeys.result(id)+':writing-repair-v1:semantic-draft');
  if(complete(draft))return draft;
 }
 const key=conversationKeys.result(id),[original,recovered]=await Promise.all([ledger.get(key),ledger.get(key+':recovered')]);
 return complete(original)?original:complete(recovered)?recovered:original||recovered;
}

export async function persistConversationResult({brief,ledger,id,reason,now=Date.now}){
 const conversationContext=await ensureConversationContext({brief,ledger,id});
 const existing=await readConversationResult(ledger,id);if(complete(existing))return existing.value;
 const state=await readConversation(ledger,id);
 const outcomeVersion=state.turns.findLast(turn=>turn.researchOutcomeVersion)?.researchOutcomeVersion;
 const conversationReport=state.final?.conversationReport||state.reportDraft||state.turns.findLast(turn=>turn.reportCandidate)?.reportCandidate;
 const result={conversationReport,conversationSources:state.sources,conversationContext,
  ...(state.turns.some(turn=>turn.objectiveValidationVersion)?{objectiveValidationVersion}:{}),
  ...(state.turns.some(turn=>turn.semanticReviewVersion)?{semanticReview:state.semanticReview||{version:semanticReviewVersion,status:'pending'}}:{}),
  ...(state.turns.some(turn=>turn.researchClosureVersion)?{researchClosure:{version:researchClosureVersion,progress:state.researchProgress,
   issues:state.final?.closureIssues||researchClosureIssues(state.researchProgress,state.sources,{report:conversationReport,views:state.sourceViews,includeUnavailable:true})}}:{}),
  ...(outcomeVersion?{researchOutcomeVersion:outcomeVersion,researchSummary:state.researchSummary,
   researchIssues:state.final?.researchIssues||researchOutcomeIssues(state.researchSummary,state.sources,brief,outcomeOptions(outcomeVersion,state.researchProgress))}:{}),
  toolIssues:state.toolIssues,reason:reason||state.final?.reason,researchedAt:new Date(now()).toISOString(),
  researchContext:{brief,briefHash:hash(brief)}};
 // Result transport is free and can be reconstructed without replaying a
 // provider call. Keep the abandoned row and all paid reservations intact.
 const key=conversationKeys.result(id)+(existing&&existing.charge_kurus===0?':recovered':'');
 return ledger.once(key,{version:conversationVersion,id},0,async()=>result);
}
