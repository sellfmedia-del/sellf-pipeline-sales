import test from 'node:test';
import assert from 'node:assert/strict';
import {BudgetError,hash} from '../src/budget/ledger.mjs';
import {applySemanticDecision,semanticReviewVersion,semanticReviewIssues} from '../src/bhs/conversation-semantic.mjs';
import {advanceConversation,readConversation,persistConversationResult,readConversationResult} from '../src/bhs/conversation-engine.mjs';
import {conversationKeys} from '../src/bhs/conversation-contract.mjs';
import {conversationAuditResult,validateConversationReport} from '../src/bhs/conversation-report.mjs';
import {createConversationProviders,modelReservation} from '../src/bhs/conversation-providers.mjs';
import {repairConversationReport,reportRepairKey} from '../src/bhs/conversation-repair.mjs';
import {createResearchSnapshot,readResearchSnapshot} from '../src/bhs/research-snapshot.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {assertResult} from '../src/contracts.mjs';
import {brief,source,peerSource,researchSources,researchSummary,researchProgressInput,completeResearchProgress,fixtureSourceResults,memoryLedger,assistantCall,scriptedProviders,semanticApproval} from './fixtures/bhs-conversation.mjs';
import {strongNarrativeReport,weakClaim,correctedClaim} from './fixtures/bhs-strong-narrative.mjs';
import {canonicalConversationHash} from '../src/bhs/conversation-context.mjs';

const id='f'.repeat(64),now=()=>Date.parse('2026-11-20T16:00:00Z');
const issue=()=>({id:'performance',reason:'Görülemeyen ölçüm etiketi reklam verimsizliğini kanıtlamaz.',resolution:'Kesin kayıp iddiasını doğrulanacak hipotez ve olay testi olarak düzelt.',sourceIds:[source.id],question:'',access:'analysis'});
const patchDecision=report=>({draftDigest:hash(report),verdict:'patch',rationale:'Yalnız kanıtsız performans iddiası değişmeli; güçlü analiz ve uygulama planı korunmalı.',issues:[issue()],
 patches:[{issueId:'performance',path:'reportMarkdown',operation:'replace_text',before:weakClaim,after:correctedClaim}]});
async function seed(ledger,{draft,thinking}={}){
 await ledger.once(conversationKeys.turn(id,0),{},0,async()=>({sources:researchSources,researchSummary:researchSummary(),researchProgress:completeResearchProgress(),
  assistant:{role:'assistant',content:assistantCall('read_pages',{urls:researchSources.map(row=>row.url),purpose:'Araştırma gövdesi'},'synthetic-read').content},results:fixtureSourceResults(),toolIssues:[],semanticReviewVersion}));
 if(draft)await ledger.once(conversationKeys.turn(id,1),{},0,async()=>({reportDraft:draft,semanticReview:{version:semanticReviewVersion,status:'pending',draftDigest:hash(draft),reportDigest:hash(draft),attempts:0},semanticReviewVersion,
  assistant:{role:'assistant',content:[...(thinking?[thinking]:[]),...assistantCall('finish_bhs',draft,'synthetic-draft').content]},
  results:[{type:'tool_result',tool_use_id:'synthetic-draft',content:JSON.stringify({draftSaved:true,reviewRequired:true})}],toolIssues:[]}));
}
test('an approved rich narrative keeps every original character, SWOT, eight actions, alternatives and timeline',()=>{
 const draft=strongNarrativeReport(),before=structuredClone(draft),assessed=applySemanticDecision(draft,semanticApproval(draft),{sources:researchSources});
 assert.deepEqual(assessed.report,before);assert.deepEqual(draft,before);assert.equal(assessed.review.reportDigest,canonicalConversationHash(before));
 assert.deepEqual(semanticReviewIssues(assessed.review,assessed.report),[]);assert.match(assessed.report.reportMarkdown,/8\. Büyütme/);assert.match(assessed.report.reportMarkdown,/90 günlük/);
});
test('one targeted semantic patch preserves the whole good SWOT, action/measurement plan, alternatives and compatibility fields',()=>{
 const draft=strongNarrativeReport({flawed:true}),before=structuredClone(draft),assessed=applySemanticDecision(draft,patchDecision(draft),{sources:researchSources});
 assert.equal(assessed.report.reportMarkdown,draft.reportMarkdown.replace(weakClaim,correctedClaim));
 assert.equal(assessed.report.reportMarkdown.split('## SWOT')[1],before.reportMarkdown.split('## SWOT')[1]);
 for(const key of ['summary','highlights','competitors','sourceQuotes','questions','limitations'])assert.deepEqual(assessed.report[key],before[key]);
 assert.deepEqual(draft,before);assert.equal(assessed.review.status,'approved');
});
test('whole-report, multiple-section, stale, ambiguous and unrelated-field rewrites are rejected transactionally',()=>{
 const draft=strongNarrativeReport({flawed:true}),original=structuredClone(draft);
 for(const change of [
  d=>{d.patches[0].before=draft.reportMarkdown;},
  d=>{d.patches[0].before=draft.reportMarkdown.slice(draft.reportMarkdown.indexOf('## SWOT'),draft.reportMarkdown.indexOf('## Karar mantığı'));},
  d=>{d.draftDigest='0'.repeat(64);},d=>{d.patches[0].path='pricing.monthlyAmount';},d=>{d.patches[0].path='__proto__.polluted';},
  d=>{d.patches[0].path='highlights';},d=>{d.patches[0].before='aynı metin';}
 ]){const decision=patchDecision(draft);change(decision);assert.throws(()=>applySemanticDecision(draft,decision,{sources:researchSources}),e=>e.code==='semantic_review_invalid');assert.deepEqual(draft,original);}
 const repeated={...draft,reportMarkdown:draft.reportMarkdown+'\n'+weakClaim};assert.throws(()=>applySemanticDecision(repeated,patchDecision(repeated),{sources:researchSources}));
});
test('approvals cannot hide unresolved issues and client margin questions cannot open paid public research',()=>{
 const draft=strongNarrativeReport(),approve=semanticApproval(draft);approve.issues=[issue()];assert.throws(()=>applySemanticDecision(draft,approve,{sources:researchSources}));
 const research={draftDigest:hash(draft),verdict:'research_needed',rationale:'İç marj bilgisi isteniyor.',issues:[{...issue(),question:'Gerçek brüt marj nedir?',access:'client',resolution:''}],patches:[]};
 assert.throws(()=>applySemanticDecision(draft,research,{sources:researchSources}),e=>e.code==='semantic_review_invalid');
});
test('a genuine source link can be added to the single affected compatibility finding without replacing its analysis',()=>{
 const draft=strongNarrativeReport();draft.highlights[0].sourceIds=[];
 const decision={...patchDecision(draft),patches:[{issueId:'performance',path:'highlights.0.sourceIds',operation:'append',before:'',after:JSON.stringify(source.id)}]};
 const assessed=applySemanticDecision(draft,decision,{sources:researchSources});assert.deepEqual(assessed.report.highlights[0].sourceIds,[source.id]);
 assert.equal(assessed.report.highlights[0].analysis,draft.highlights[0].analysis);assert.equal(assessed.report.reportMarkdown,draft.reportMarkdown);
});
test('an empty summary can be repaired without regenerating its complete strong narrative',async()=>{
 const {ledger}=memoryLedger(),draft=strongNarrativeReport(),summary=draft.summary;draft.summary='';await seed(ledger,{draft});
 const decision={...patchDecision(draft),patches:[{issueId:'performance',path:'summary',operation:'replace_text',before:'',after:summary}]};
 const providers=scriptedProviders(ledger,[assistantCall('review_bhs',decision)]),final=await advanceConversation({brief,ledger,id,providers,now});
 assert.equal(final.closed,true);assert.equal(final.conversationReport.summary,summary);assert.equal(final.conversationReport.reportMarkdown,draft.reportMarkdown);
 assert.equal(final.semanticReview.status,'approved');
});
test('an entirely empty narrative is not frozen as a good draft that targeted patches can never repair',async()=>{
 const {ledger}=memoryLedger(),draft=strongNarrativeReport(),empty={...draft,reportMarkdown:''};await seed(ledger);
 const providers=scriptedProviders(ledger,[assistantCall('begin_report',researchSummary()),assistantCall('finish_bhs',empty),assistantCall('finish_bhs',draft),assistantCall('review_bhs',semanticApproval(draft))]);
 await advanceConversation({brief,ledger,id,providers,now});const rejected=await advanceConversation({brief,ledger,id,providers,now});
 assert.equal(rejected.toolIssues[0].code,'report_validation');assert.equal(rejected.reportDraft,undefined);
 await advanceConversation({brief,ledger,id,providers,now});const final=await advanceConversation({brief,ledger,id,providers,now});
 assert.equal(final.closed,true);assert.equal(final.conversationReport.reportMarkdown,draft.reportMarkdown);assert.equal(final.semanticReview.status,'approved');
});
test('semantic approval accepts equivalent section language without a keyword-based quality gate',()=>{
 const report=strongNarrativeReport();report.reportMarkdown=report.reportMarkdown.replaceAll('SWOT','İç ve dış koşullar').replaceAll('Güçlü yönler','İç avantajlar').replaceAll('Zayıf yönler','İç sınırlamalar');
 assert.ok(validateConversationReport(report,researchSources).includes('missing_swot'));assert.deepEqual(validateConversationReport(report,researchSources,{semantic:true}),[]);
 const assessed=applySemanticDecision(report,semanticApproval(report),{sources:researchSources}),audit=conversationAuditResult(brief,{conversationReport:report,conversationSources:researchSources,semanticReview:assessed.review});
 assert.equal(audit.data.quality.contentComplete,true);assertResult('audit',audit);
});
test('the reviewer sees the same full brief, source observations, draft and opaque thinking; it applies only the faulty claim',async()=>{
 const {ledger}=memoryLedger(),draft=strongNarrativeReport({flawed:true}),thinking={type:'thinking',thinking:'',signature:'synthetic-signed-context'};await seed(ledger);
 const writing=assistantCall('finish_bhs',draft);writing.content.unshift(thinking);
 const providers=scriptedProviders(ledger,[assistantCall('begin_report',researchSummary()),writing,assistantCall('review_bhs',patchDecision(draft))]);
 for(let at=0;at<3;at++)await advanceConversation({brief,ledger,id,providers,now});
 const review=providers.calls[2];assert.equal(review.options.review,true);assert.equal(review.options.final,false);
 const history=JSON.stringify(review.messages);assert.match(history,/Amazon tarafında mevcut bir partner var/);assert.match(history,/Örnek Rakip/);assert.ok(history.includes('90 günlük'));
 assert.deepEqual(review.messages.flatMap(message=>Array.isArray(message.content)?message.content:[]).find(block=>block.type==='thinking'),thinking);
 const saved=await persistConversationResult({brief,ledger,id,now}),audit=conversationAuditResult(brief,saved);
 assert.equal(audit.data.quality.contentComplete,true);assert.equal(audit.data.fullReport,draft.reportMarkdown.replace(weakClaim,correctedClaim));assertResult('audit',audit);
});
test('a draft stays partial until semantic review and its approved bytes survive saved-offer reuse',async()=>{
 const {ledger}=memoryLedger(),draft=strongNarrativeReport();await seed(ledger);
 const providers=scriptedProviders(ledger,[assistantCall('begin_report',researchSummary()),assistantCall('finish_bhs',draft),assistantCall('review_bhs',semanticApproval(draft))]);
 await advanceConversation({brief,ledger,id,providers,now});const written=await advanceConversation({brief,ledger,id,providers,now});
 assert.equal(written.closed,undefined);assert.deepEqual(written.reportDraft,draft);
 const pending=conversationAuditResult(brief,{conversationReport:draft,conversationSources:researchSources,semanticReview:written.semanticReview});
 assert.equal(pending.status,'ready');assert.equal(pending.data.quality.contentComplete,false);assert.equal(pending.data.fullReport,draft.reportMarkdown);
 await advanceConversation({brief,ledger,id,providers,now});const saved=await persistConversationResult({brief,ledger,id,now}),audit=conversationAuditResult(brief,saved);
 const snapshot=createResearchSnapshot(audit.data,brief),reused=directAuditResult(brief,readResearchSnapshot(snapshot));
 assert.equal(reused.data.fullReport,draft.reportMarkdown);assert.equal(reused.data.quality.contentComplete,true);
 const tampered=structuredClone(saved);tampered.conversationReport.reportMarkdown+='\nYetkisiz yeni iddia.';
 assert.equal(conversationAuditResult(brief,tampered).data.quality.contentComplete,false);
});
test('a second whole-report generation is rejected while a later valid review preserves the original draft',async()=>{
 const {ledger}=memoryLedger(),draft=strongNarrativeReport();await seed(ledger,{draft});
 const replacement={...draft,reportMarkdown:'# Baştan yazılmış kısa rapor'};
 const providers=scriptedProviders(ledger,[assistantCall('finish_bhs',replacement),assistantCall('review_bhs',semanticApproval(draft))]);
 const rejected=await advanceConversation({brief,ledger,id,providers,now});assert.equal(rejected.toolIssues[0].code,'draft_preserved');assert.deepEqual(rejected.reportDraft,draft);
 const final=await advanceConversation({brief,ledger,id,providers,now});assert.equal(final.closed,true);assert.deepEqual(final.conversationReport,draft);assert.equal(final.semanticReview.attempts,2);
});
test('two invalid reviews stop with the useful original and never buy an unlimited repair loop',async()=>{
 const {ledger,total}=memoryLedger(),draft=strongNarrativeReport({flawed:true});await seed(ledger,{draft});
 const invalid=patchDecision(draft);invalid.draftDigest='0'.repeat(64);
 const providers=scriptedProviders(ledger,[assistantCall('review_bhs',invalid),assistantCall('review_bhs',invalid)]);
 await advanceConversation({brief,ledger,id,providers,now});const final=await advanceConversation({brief,ledger,id,providers,now}),before=total();
 assert.equal(final.closed,true);assert.equal(final.reason,'semantic_review_unavailable');assert.deepEqual(final.conversationReport,draft);
 await advanceConversation({brief,ledger,id,providers,now});assert.equal(providers.calls.length,2);assert.equal(total(),before);
});
test('a review cannot launch an unplanned paid search instead of a semantic decision',async()=>{
 const {ledger}=memoryLedger(),draft=strongNarrativeReport();await seed(ledger,{draft});let searches=0;
 const providers=scriptedProviders(ledger,[assistantCall('search_web',{query:'Kontrolsüz yeni arama',maxResults:3,purpose:'Denetimde doğrudan çağrı'}),assistantCall('review_bhs',semanticApproval(draft))]);
 providers.search=async()=>{searches++;throw Error('Unexpected paid source call');};
 const first=await advanceConversation({brief,ledger,id,providers,now});assert.equal(first.toolIssues[0].code,'semantic_review_invalid');assert.deepEqual(first.reportDraft,draft);
 const final=await advanceConversation({brief,ledger,id,providers,now});assert.equal(final.closed,true);assert.equal(searches,0);assert.equal(final.semanticReview.status,'approved');
});
test('a patch introducing an unread factual source is rejected before it can degrade a valid original',async()=>{
 const {ledger}=memoryLedger(),draft=strongNarrativeReport();await seed(ledger,{draft});
 const discovery={...source,id:'S99999999',url:'https://discovery.example.com/',method:'search-snippet',text:'Kedi bakım ürünlerinin satış kanalları için araştırılabilecek kısa arama sonucu açıklaması.'};
 await ledger.once(conversationKeys.turn(id,2),{},0,async()=>({sources:[discovery],results:[],toolIssues:[],semanticReviewVersion}));
 const decision=patchDecision(draft);decision.patches=[{...decision.patches[0],before:correctedClaim,after:correctedClaim+' Yeni iddia ['+discovery.id+'].'},
  {issueId:'performance',path:'sourceQuotes',operation:'append',before:'',after:JSON.stringify({sourceId:discovery.id,quote:discovery.text})}];
 const providers=scriptedProviders(ledger,[assistantCall('review_bhs',decision),assistantCall('review_bhs',semanticApproval(draft))]);
 const refused=await advanceConversation({brief,ledger,id,providers,now});assert.equal(refused.toolIssues[0].code,'semantic_review_invalid');assert.deepEqual(refused.reportDraft,draft);
 const final=await advanceConversation({brief,ledger,id,providers,now});assert.deepEqual(final.conversationReport,draft);assert.equal(final.semanticReview.status,'approved');
});
test('a semantic research gap reopens only the targeted work and the second review patches the preserved draft',async()=>{
 const {ledger}=memoryLedger(),draft=strongNarrativeReport({flawed:true});await seed(ledger,{draft});
 const need={draftDigest:hash(draft),verdict:'research_needed',rationale:'Yalnız rakibin sipariş yolu netleştirilmeli.',issues:[{...issue(),id:'peer_order',access:'public',question:'Rakibin ürün sayfasında doğrudan sipariş var mı?',resolution:''}],patches:[]};
 const q={id:'semantic_peer_order',question:need.issues[0].question,access:'public',important:true,status:'answered',answer:'Okunan sayfada doğrudan sipariş seçeneği var.',sourceIds:[peerSource.id],attemptedUrls:[],rationale:''};
 const delta={objective:researchProgressInput().objective,questions:[q],sources:[],candidates:[]};
 const providers=scriptedProviders(ledger,[assistantCall('review_bhs',need),assistantCall('read_saved_source',{sourceId:peerSource.id,offset:0}),assistantCall('review_research',delta),assistantCall('review_bhs',patchDecision(draft))]);
 providers.search=()=>assert.fail('Gereksiz yeni arama');providers.extract=()=>assert.fail('Tekrar satın alınan kaynak');
 const first=await advanceConversation({brief,ledger,id,providers,now});assert.equal(first.closed,undefined);assert.deepEqual(first.reportDraft,draft);
 for(let at=0;at<3;at++)await advanceConversation({brief,ledger,id,providers,now});
 const saved=await persistConversationResult({brief,ledger,id,now});assert.equal(saved.semanticReview.status,'approved');assert.equal(saved.semanticReview.attempts,2);
 assert.equal(saved.conversationReport.reportMarkdown,draft.reportMarkdown.replace(weakClaim,correctedClaim));assert.equal(providers.calls[1].options.review,false);
});
test('native review is counted, funded and dispatched with visible patch capacity without unsupported forced tools',async()=>{
 const {ledger}=memoryLedger(),draft=strongNarrativeReport();let generated;
 const providers=createConversationProviders({ledger,anthropicKey:'synthetic',researchFx:async()=>({usdTry:50}),fetchImpl:async(url,init)=>{
  const body=JSON.parse(init.body);assert.equal(body.tool_choice.type,'auto');assert.equal(body.thinking.type,'between_tools');
  if(url.endsWith('/count_tokens'))return new Response(JSON.stringify({input_tokens:1000}));generated=body;
  return new Response(JSON.stringify({model:'claude-sonnet-5-5',content:assistantCall('review_bhs',semanticApproval(draft)).content,stop_reason:'tool_use',usage:{input_tokens:1000,output_tokens:200}}));
 }});
 await providers.analyst([{role:'user',content:'Aynı taslağı denetle.'}],{review:true,hasDraft:true});
 assert.equal(generated.max_tokens,6000);assert.equal(generated.output_config.effort,'medium');assert.equal(generated.tools.find(tool=>tool.name==='review_bhs').strict,true);
});
test('writing cannot spend the review reserve even when the writing request alone would fit',async()=>{
 const probe=memoryLedger(),messages=[{role:'user',content:'Taslak ve anlam denetimi.'}];let generation=0;
 const config=ledger=>({ledger,anthropicKey:'synthetic',researchFx:async()=>({usdTry:50}),fetchImpl:async url=>{
  if(url.endsWith('/count_tokens'))return new Response(JSON.stringify({input_tokens:1000}));generation++;throw Error('No dispatch');
 }});
 const quote=await createConversationProviders(config(probe.ledger)).analystQuote(messages,{final:true});
 assert.equal(quote.completionReservation,quote.finalReservation+quote.reviewReservation);
 assert.ok(quote.reviewReservation>=modelReservation('analyst',quote.inputUpper+20000,6000));
 const {ledger,total}=memoryLedger({charged:5000-quote.reservation-quote.reviewReservation+1}),before=total();
 await assert.rejects(createConversationProviders(config(ledger)).analyst(messages,{final:true,quote,remainingReserve:quote.reviewReservation}),e=>e.code==='budget_limit');
 assert.equal(generation,0);assert.equal(total(),before);
});
test('an unfunded native review preserves the draft and cannot report successful quality',async()=>{
 const {ledger,total}=memoryLedger({charged:4900}),draft=strongNarrativeReport();await seed(ledger,{draft});let generation=0;
 const providers=createConversationProviders({ledger,anthropicKey:'synthetic',researchFx:async()=>({usdTry:50}),fetchImpl:async url=>{
  if(url.endsWith('/count_tokens'))return new Response(JSON.stringify({input_tokens:1000}));generation++;throw Error('No paid generation');
 }});
 const final=await advanceConversation({brief,ledger,id,providers,now});assert.equal(final.closed,true);assert.deepEqual(final.conversationReport,draft);
 const saved=await persistConversationResult({brief,ledger,id,now});assert.equal(conversationAuditResult(brief,saved).data.quality.contentComplete,false);
 assert.equal(generation,0);assert.equal(total(),4900);
});
test('a fallback draft cannot consume the reserved Claude review allowance',async()=>{
 const {ledger,total}=memoryLedger({charged:3000});let generation=0;
 const providers=createConversationProviders({ledger,geminiKey:'synthetic',researchFx:async()=>({usdTry:50}),fetchImpl:async url=>{
  if(url.endsWith(':countTokens'))return new Response(JSON.stringify({totalTokens:1000}));generation++;throw Error('No fallback generation');
 }});
 await assert.rejects(providers.fallbackReport({brief,sources:researchSources,previous:[]},{remainingReserve:1500}),e=>e.code==='budget_limit');
 assert.equal(generation,0);assert.equal(total(),3000);
});
test('a lost free review checkpoint reuses the immutable paid decision and frozen context without another purchase',async()=>{
 const {ledger,rows,total}=memoryLedger(),draft=strongNarrativeReport();await seed(ledger,{draft});let generations=0,counts=0,fail=true;
 const providers=createConversationProviders({ledger,anthropicKey:'synthetic',researchFx:async()=>({usdTry:50}),fetchImpl:async url=>{
  if(url.endsWith('/count_tokens')){counts++;return new Response(JSON.stringify({input_tokens:1000}));}generations++;
  return new Response(JSON.stringify({model:'claude-sonnet-5-5',content:assistantCall('review_bhs',semanticApproval(draft)).content,stop_reason:'tool_use',usage:{input_tokens:1000,output_tokens:200}}));
 }});
 const flaky={...ledger,once:(key,input,amount,run,options)=>{
  if(key===conversationKeys.turn(id,2)&&fail){fail=false;return ledger.once(key,input,0,()=>{throw Error('lost free acknowledgement');});}
  return ledger.once(key,input,amount,run,options);
 }};
 await assert.rejects(advanceConversation({brief,ledger:flaky,id,providers,now}),/lost free acknowledgement/);const committed=total();
 await advanceConversation({brief,ledger,id,providers,now});assert.equal(generations,1);assert.equal(counts,1);assert.equal(total(),committed);
 assert.equal(rows.get(conversationKeys.turn(id,2)).state,'uncertain');assert.equal((await readConversation(ledger,id)).final.semanticReview.status,'approved');
});
test('new report-only recovery retains the full conversation, checkpoints the good draft, reviews it once and never rewrites on reconnect',async()=>{
 const {ledger}=memoryLedger(),draft=strongNarrativeReport(),thinking={type:'thinking',thinking:'',signature:'retained-recovery-context'};await seed(ledger);
 await ledger.once(conversationKeys.turn(id,1),{},0,async()=>({assistant:{role:'assistant',content:[thinking,{type:'text',text:'Korunmuş ticari değerlendirme.'}]},results:[],toolIssues:[],semanticReviewVersion,closed:true,reason:'provider_error'}));
 const original={reason:'provider_error',conversationSources:researchSources};await ledger.once(conversationKeys.result(id),{},0,async()=>original);
 let writes=0,reviews=0;
 const getProviders=()=>({analystQuote:async(_messages,options)=>({reservation:100,reviewReservation:100,output:options.review?6000:8000}),analyst:async(messages,options)=>{
  assert.match(JSON.stringify(messages),/retained-recovery-context/);assert.match(JSON.stringify(messages),/Amazon tarafında mevcut bir partner var/);
  if(options.review){reviews++;return assistantCall('review_bhs',semanticApproval(draft));}writes++;return assistantCall('finish_bhs',draft);
 }});
 const options={brief,job:{researchRunId:'synthetic'},ledger,id,getProviders,now,meter:async({run})=>run()};
 const result=await repairConversationReport(options);assert.equal(result.semanticReview.status,'approved');assert.equal(result.conversationReport.reportMarkdown,draft.reportMarkdown);
 assert.equal(conversationAuditResult(brief,result).data.quality.contentComplete,true);assert.ok(await ledger.get(reportRepairKey(id)+':semantic-draft'));
 await repairConversationReport(options);assert.equal(writes,1);assert.equal(reviews,1);assert.deepEqual((await ledger.get(conversationKeys.result(id))).value,original);
 assert.equal((await readConversationResult(ledger,id)).value.semanticReview.status,'approved');
});
test('an uncertain free recovery completion exposes the preserved draft without replaying its writing or review',async()=>{
 const {ledger}=memoryLedger(),draft=strongNarrativeReport();await seed(ledger);let calls=0;
 await ledger.once(conversationKeys.result(id),{},0,async()=>({reason:'provider_error',conversationSources:researchSources}));
 const getProviders=()=>({analystQuote:async()=>({reservation:100,reviewReservation:100}),analyst:async(_messages,options)=>{
  calls++;return options.review?assistantCall('review_bhs',semanticApproval(draft)):assistantCall('finish_bhs',draft);
 }});
 const flaky={...ledger,once:(key,input,amount,run,options)=>ledger.once(key,input,amount,key===reportRepairKey(id)?async()=>{await run();throw Error('lost recovery completion');}:run,options)};
 const base={brief,job:{researchRunId:'synthetic'},id,getProviders,now,meter:async({run})=>run()};
 await assert.rejects(repairConversationReport({...base,ledger:flaky}),/lost recovery completion/);
 const retained=await readConversationResult(ledger,id);assert.equal(retained.value.repair.semanticDraft,true);assert.equal(retained.value.conversationReport.reportMarkdown,draft.reportMarkdown);
 assert.equal(conversationAuditResult(brief,retained.value).data.quality.contentComplete,false);
 await assert.rejects(repairConversationReport({...base,ledger}),e=>e.code==='budget_pending');assert.equal(calls,2);
});
