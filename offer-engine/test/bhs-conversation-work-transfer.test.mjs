import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../src/budget/ledger.mjs';
import {researchWorkPolicyVersion} from '../src/bhs/conversation-work.mjs';
import {reviewPolicyVersion,researchWorkReviewSchema,claimReviewSchema} from '../src/bhs/conversation-review-contract.mjs';
import {applySemanticDecision,semanticReviewIssues,semanticReviewInstruction} from '../src/bhs/conversation-semantic.mjs';
import {createConversationTransfer,conversationTransferIssues,conversationTransferVersion} from '../src/bhs/conversation-transfer.mjs';
import {advanceConversation,readConversation,persistConversationResult} from '../src/bhs/conversation-engine.mjs';
import {conversationKeys,conversationVersion,sourceId} from '../src/bhs/conversation-contract.mjs';
import {conversationAuditResult} from '../src/bhs/conversation-report.mjs';
import {createConversationProviders,conversationModels} from '../src/bhs/conversation-providers.mjs';
import {createResearchSnapshot,readResearchSnapshot} from '../src/bhs/research-snapshot.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {repairConversationReport} from '../src/bhs/conversation-repair.mjs';
import {objectiveValidationVersion} from '../src/bhs/conversation-objective.mjs';
import {researchClosureVersion} from '../src/bhs/conversation-progress.mjs';
import {assertResult} from '../src/contracts.mjs';
import {brief,source,peerSource,marketSource,usageSource,researchSources,researchSummary,researchProgressInput,completeResearchProgress,fixtureSourceResults,
 report as minimalReport,memoryLedger,assistantCall,scriptedProviders,semanticApproval} from './fixtures/bhs-conversation.mjs';
import {strongNarrativeReport} from './fixtures/bhs-strong-narrative.mjs';

const version={reviewPolicyVersion:researchWorkPolicyVersion},id='synthetic-work-transfer',now=()=>Date.parse('2026-11-23T08:00:00Z');
const task='Rakibin ürün sayfasındaki sipariş koşullarını daha sonra inceleyin.',placeholder='Bu seçili karşılaştırma henüz tamamlanmadı.';
const conclusion='Okunan rakip sayfası doğrudan sipariş ve uygulama videosu sunuyor. Mevcut ürün anlatımı ve sipariş geçişi bu somut farkla pilotlanabilir. ['+peerSource.id+']';
const options=(p=completeResearchProgress())=>({brief,sources:researchSources,progress:p,...version});
function deferredDraft(){const draft=strongNarrativeReport();draft.questions.push(task);draft.reportMarkdown+='\n## Seçili araştırmanın sonucu\n'+placeholder;return draft;}
const work=(draft,changes={})=>({path:'questions.'+(draft.questions.length-1),text:task,access:'public',status:'open',questionId:'',issueId:'peer_work',sourceIds:[],reason:'Bu gerçek kamu karşılaştırması BHS içinde yapılabilir.',...changes});
const issue=()=>({id:'peer_work',reason:'Kamu sipariş koşulu analizin sonraki müşteriye bırakılmamalı.',resolution:'',sourceIds:[],question:'Rakibin seçili ürün sayfasında sipariş yolu nasıl açıklanıyor?',access:'public'});
const need=draft=>({...semanticApproval(draft,version),verdict:'research_needed',issues:[issue()],workReview:{rationale:'Bu araştırma BHS işidir; müşteri iç verisi veya uygulama pilotu değildir.',items:[work(draft)]}});
function resolved(draft,questionId='competition'){
 const decision={...semanticApproval(draft,version),verdict:'patch',issues:[{...issue(),resolution:'Okunan sonucu rapora taşı ve kamu sorusunu müşteriye devreden kaydı kaldır.'}],
  patches:[{issueId:'peer_work',path:'questions.'+(draft.questions.length-1),operation:'remove',before:JSON.stringify(task),after:''},
   {issueId:'peer_work',path:'reportMarkdown',operation:'replace_text',before:placeholder,after:conclusion}],
  workReview:{rationale:'Kamu işi aynı konuşmanın okunmuş kaynağıyla sonuçlandı; geleceğe bırakılan görev somut analize çevrildi.',items:[work(draft,{status:'answered',questionId,sourceIds:[peerSource.id]})]}};
 return decision;
}
async function seed(ledger,{draft=deferredDraft(),thinking}={}){
 await ledger.once(conversationKeys.policy(id),{},0,async()=>({engine:conversationVersion,...version}));
 await ledger.once(conversationKeys.turn(id,0),{},0,async()=>({sources:researchSources,researchSummary:researchSummary(),researchProgress:completeResearchProgress(),
  results:fixtureSourceResults(),toolIssues:[],semanticReviewVersion:researchWorkPolicyVersion,researchClosureVersion,objectiveValidationVersion}));
 await ledger.once(conversationKeys.turn(id,1),{},0,async()=>({reportDraft:draft,semanticReview:{version:researchWorkPolicyVersion,status:'pending',attempts:0},
  assistant:{role:'assistant',content:[...(thinking?[thinking]:[]),...assistantCall('finish_bhs',draft).content]},results:[],toolIssues:[]}));return draft;
}
function stored(draft=strongNarrativeReport(),sources=researchSources,p=completeResearchProgress()){
 return {conversationReport:draft,conversationSources:sources,conversationTransfer:createConversationTransfer(draft,sources,{progress:p}),
  semanticReview:applySemanticDecision(draft,semanticApproval(draft,version),{...options(p),sources}).review,objectiveValidationVersion,
  researchOutcomeVersion:'adjudicated-market-competition-outcomes-v2',researchSummary:researchSummary(),researchClosure:{version:researchClosureVersion,progress:p,issues:[]}};
}

test('an identified open public BHS task cannot be approved as future client work',()=>{
 const draft=deferredDraft(),decision=semanticApproval(draft,version);decision.workReview.items=[work(draft)];
 assert.throws(()=>applySemanticDecision(draft,decision,options()),e=>e.reviewFeedback.category==='research');
 const misclassified=need(draft);misclassified.workReview.items[0].access='client';
 assert.throws(()=>applySemanticDecision(draft,misclassified,options()),e=>e.reviewFeedback.category==='research');
});
test('the same analyst can complete deferred work immediately from an already answered question and its archived body',async()=>{
 const {ledger}=memoryLedger(),draft=await seed(ledger),providers=scriptedProviders(ledger,[assistantCall('review_bhs',resolved(draft))]);
 providers.search=()=>assert.fail('No repeated search');providers.extract=()=>assert.fail('No repurchased body');
 const final=await advanceConversation({brief,ledger,id,providers,now});assert.equal(final.closed,true);assert.equal(final.semanticReview.status,'approved');
 assert.equal(final.conversationReport.questions.includes(task),false);assert.equal(final.conversationReport.reportMarkdown,draft.reportMarkdown.replace(placeholder,conclusion));
 assert.equal(providers.calls.length,1);assert.ok(final.conversationReport.reportMarkdown.includes('90 günlük karar çerçevesi'));
});
test('a declared missing public result returns to the same conversation and only the affected report section is patched',async()=>{
 const {ledger,total}=memoryLedger(),thinking={type:'thinking',thinking:'',signature:'same-natural-conversation'},draft=await seed(ledger,{thinking});
 const first=need(draft),q={id:'semantic_peer_work',question:first.issues[0].question,access:'public',important:true,status:'answered',
  answer:'Okunan sayfada uygulama videosu ve doğrudan sipariş var.',sourceIds:[peerSource.id],attemptedUrls:[],rationale:''};
 const providers=scriptedProviders(ledger,[assistantCall('review_bhs',first),assistantCall('read_saved_source',{sourceId:peerSource.id,offset:0}),
  assistantCall('review_research',{objective:researchProgressInput().objective,questions:[q],sources:[],candidates:[]}),assistantCall('review_bhs',resolved(draft,q.id))]);
 providers.search=()=>assert.fail('No repeated search');providers.extract=()=>assert.fail('No repeated body purchase');
 const held=await advanceConversation({brief,ledger,id,providers,now});assert.equal(held.semanticReview.status,'research_needed');assert.deepEqual(held.reportDraft,draft);
 for(let i=0;i<3;i++)await advanceConversation({brief,ledger,id,providers,now});
 const saved=await persistConversationResult({brief,ledger,id,providers,now});assert.equal(saved.semanticReview.attempts,2);assert.equal(saved.semanticReview.status,'approved');
 assert.equal(saved.conversationReport.reportMarkdown,draft.reportMarkdown.replace(placeholder,conclusion));assert.equal(saved.conversationReport.questions.includes(task),false);
 assert.equal(conversationAuditResult(brief,saved).data.quality.contentComplete,true);assert.ok(JSON.stringify(providers.calls.at(-1).messages).includes(thinking.signature));
 assert.ok(JSON.stringify(providers.calls.at(-1).messages).includes(brief.meetingNotes));assert.ok(total()<=5000);
});
test('already answered or genuinely unavailable question IDs cannot be silently put back on the paid research queue',()=>{
 const draft=deferredDraft(),decision=need(draft);decision.workReview.items[0].questionId='competition';
 assert.throws(()=>applySemanticDecision(draft,decision,options()),e=>e.reviewFeedback.category==='research');
 const p=completeResearchProgress();Object.assign(p.questions.find(row=>row.id==='competition'),{status:'unavailable',rationale:'Gerçek erişim denemesi başarısız.'});
 assert.throws(()=>applySemanticDecision(draft,decision,options(p)),e=>e.reviewFeedback.category==='research');
});
test('claiming public completion needs the selected answered question, an adjudicated body and an actual targeted correction',()=>{
 const draft=deferredDraft(),decision=resolved(draft);decision.workReview.items[0].questionId='margin';
 assert.throws(()=>applySemanticDecision(draft,decision,options()),e=>e.reviewFeedback.category==='research');
 decision.workReview.items[0].questionId='competition';decision.workReview.items[0].sourceIds=[marketSource.id];
 assert.throws(()=>applySemanticDecision(draft,decision,options()),e=>e.reviewFeedback.category==='research');
 const unpatched=semanticApproval(draft,version);unpatched.workReview.items=[work(draft,{status:'answered',questionId:'competition',sourceIds:[peerSource.id],issueId:''})];
 assert.throws(()=>applySemanticDecision(draft,unpatched,options()),e=>e.reviewFeedback.category==='research');
});
test('an actual unavailable public result remains a partial limitation and never requests a replacement quota',()=>{
 const draft=deferredDraft(),p=completeResearchProgress();Object.assign(p.questions.find(row=>row.id==='competition'),{status:'unavailable',answer:'',sourceIds:[],attemptedUrls:[peerSource.url],rationale:'Kaynak denendi; ilgili koşul alınamadı.'});
 const decision=semanticApproval(draft,version);decision.workReview.items=[work(draft,{status:'unavailable',questionId:'competition',issueId:''})];
 const assessed=applySemanticDecision(draft,decision,options(p));assert.equal(assessed.review.status,'approved');
 assert.ok(semanticReviewIssues(assessed.review,assessed.report).includes('deferred_public_research_unavailable'));
 assert.equal(assessed.report.reportMarkdown,draft.reportMarkdown);
});
test('client internal data and implementation pilots can remain future work without a public-research gate or fixed task quota',()=>{
 const draft=strongNarrativeReport(),decision=semanticApproval(draft,version);
 decision.workReview.items=[{path:'questions.0',text:draft.questions[0],access:'client',status:'open',questionId:'margin',issueId:'',sourceIds:[],reason:'Gerçekleşen sipariş ve maliyet hesabı müşterinin iç bilgisidir.'}];
 assert.equal(applySemanticDecision(draft,decision,options()).review.status,'approved');
 decision.workReview.items=[];assert.equal(applySemanticDecision(draft,decision,options()).review.status,'approved');
 const unfinished=semanticApproval(draft,version);unfinished.workReview.items=[{...decision.workReview.items[0],path:'summary',text:draft.summary,access:'analysis',status:'open',questionId:'',issueId:'',sourceIds:[],reason:'Bu değerlendirme aynı analistçe tamamlanmalı.'}];
 assert.throws(()=>applySemanticDecision(draft,unfinished,options()),e=>e.reviewFeedback.category==='research');
});
test('insufficient original funds preserve the whole report and explicit public gap without another source or native turn',async()=>{
 const {ledger,total}=memoryLedger({charged:4700}),draft=await seed(ledger),providers=scriptedProviders(ledger,[assistantCall('review_bhs',need(draft))]);
 const final=await advanceConversation({brief,ledger,id,providers,now});assert.equal(final.closed,true);assert.equal(final.reason,'semantic_research_needed');
 const saved=await persistConversationResult({brief,ledger,id,now});assert.deepEqual(saved.conversationReport,draft);assert.equal(saved.conversationTransfer.narrativeDigest,createConversationTransfer(draft,researchSources,{progress:completeResearchProgress()}).narrativeDigest);
 assert.equal(conversationAuditResult(brief,saved).data.quality.contentComplete,false);const spent=total();await advanceConversation({brief,ledger,id,providers,now});assert.equal(providers.calls.length,1);assert.equal(total(),spent);
});
test('full narrative, summary and every selected highlight have one transfer identity, independent of the summary length',()=>{
 const draft=strongNarrativeReport();draft.reportMarkdown+='\n## Geç eklenen önemli karar\n'+('Korunacak gerekçe ve ölçüm ilişkisi. '.repeat(200));
 const saved=stored(draft),audit=conversationAuditResult(brief,saved);assert.equal(audit.data.fullReport,draft.reportMarkdown);assert.equal(audit.data.summary,draft.summary);
 assert.equal(audit.data.findings.length,draft.highlights.length);assert.equal(audit.data.quality.contentComplete,true);
 assert.deepEqual(conversationTransferIssues(draft,researchSources,saved.conversationTransfer),[]);assert.equal(saved.conversationTransfer.version,conversationTransferVersion);
});
test('changed authoritative narrative or summary cannot masquerade as the reviewed full report, while useful content still reaches the offer',()=>{
 for(const key of ['reportMarkdown','summary']){
  const saved=stored();saved.conversationReport[key]+=' Değişmiş metin.';const audit=conversationAuditResult(brief,saved);
  assert.equal(audit.status,'ready');assert.equal(audit.data.quality.contentComplete,false);assert.ok(audit.data.quality.issues.some(row=>row.reason==='conversation_report_changed'));
  assert.equal(audit.data.fullReport,saved.conversationReport.reportMarkdown);
 }
});
test('a clipped projection is detected and rebuilt deterministically from the same intact answer before saved-offer capture',()=>{
 const saved=stored(),audit=conversationAuditResult(brief,saved),full=audit.data.fullReport,summary=audit.data.summary;
 audit.data.fullReport='Kısaltılmış görünüm';audit.data.report.summary='Yanlış kısa özet';audit.data.report.findings[0].reportExcerpt='Kaybolmuş bulgu';
 const snapshot=readResearchSnapshot(createResearchSnapshot(audit.data,brief)),reused=directAuditResult(brief,snapshot);
 assert.equal(reused.data.fullReport,full);assert.equal(reused.data.summary,summary);assert.equal(reused.data.findings[0].reportExcerpt,saved.conversationReport.highlights[0].statement);
 assert.equal(reused.data.quality.contentComplete,true);assert.equal(snapshot.transferRestoration.additionalPaidCalls,0);
 assert.ok(snapshot.transferRestoration.issues.includes('narrative_projection_mismatch'));assert.ok(snapshot.transferRestoration.issues.includes('summary_projection_mismatch'));assert.ok(snapshot.transferRestoration.issues.includes('highlights_projection_mismatch'));
 assertResult('audit',reused);
});
test('normal JSON key ordering and historical verified-passage capture preserve the same report and provenance identity',()=>{
 const saved=stored(),audit=conversationAuditResult(brief,saved),reverse=value=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reverse(v)])):value;
 assert.deepEqual(conversationTransferIssues(reverse(saved.conversationReport),[...researchSources].reverse(),reverse(saved.conversationTransfer)),[]);
 const reused=directAuditResult(brief,readResearchSnapshot(createResearchSnapshot(audit.data,brief)));assert.equal(reused.data.quality.contentComplete,true);assert.deepEqual(reused.data.conversationTransfer,saved.conversationTransfer);
});
test('one read homepage and five discovery summaries remain one read plus five discoveries through partial report and saved-offer reuse',()=>{
 const discovery=[marketSource,peerSource,usageSource,...[1,2].map(n=>({id:sourceId('https://discovery.example.com/'+n),url:'https://discovery.example.com/'+n,title:'Sentetik keşif',text:'Dar soruya ait arama sonucu açıklaması; sayfa gövdesi okunmadı.'}))].map(row=>({...row,method:'search-snippet'}));
 const sources=[source,...discovery],p=completeResearchProgress();p.proofs=p.proofs.filter(row=>row.sourceId===source.id);p.questions=p.questions.map(row=>row.access==='public'&&row.id!=='brand'?{...row,status:'open',answer:'',sourceIds:[]}:row);
 const draft=minimalReport(),saved=stored(draft,sources,p),audit=conversationAuditResult(brief,{...saved,reason:'budget_limit'});
 assert.equal(audit.status,'ready');assert.equal(audit.data.quality.contentComplete,false);assert.equal(audit.data.conversationTransfer.counts.bodyAvailable,1);assert.equal(audit.data.conversationTransfer.counts.discoveryOnly,5);
 assert.equal(audit.data.sources.length,1);assert.equal(audit.data.sources[0].verification.method,'extracted');
 const reused=directAuditResult(brief,readResearchSnapshot(createResearchSnapshot(audit.data,brief)));
 assert.equal(reused.data.fullReport,draft.reportMarkdown);assert.equal(reused.data.conversationTransfer.counts.discoveryOnly,5);assert.equal(reused.data.sources.length,1);assert.equal(reused.data.quality.contentComplete,false);
});
test('a source retrieval method or identity cannot be relabelled in transfer and malformed receipts remain a partial usable report',()=>{
 const saved=stored(),changed=researchSources.map(row=>row.id===peerSource.id?{...row,method:'search-snippet'}:row);
 assert.ok(conversationTransferIssues(saved.conversationReport,changed,saved.conversationTransfer).includes('conversation_source_provenance_changed'));
 for(const receipt of [null,{}, {...saved.conversationTransfer,sources:[null]}]){
  const audit=conversationAuditResult(brief,{...saved,conversationTransfer:receipt});assert.equal(audit.status,'ready');assert.equal(audit.data.quality.contentComplete,false);assert.equal(audit.data.fullReport,saved.conversationReport.reportMarkdown);
 }
});
test('malformed derived findings cannot crash transfer or replace the intact natural report',()=>{
 const saved=stored(),report=conversationAuditResult(brief,saved).data.report;report.findings=[null];
 const audit=conversationAuditResult(brief,{report});assert.equal(audit.status,'ready');assert.equal(audit.data.fullReport,saved.conversationReport.reportMarkdown);
 assert.equal(audit.data.quality.contentComplete,false);assert.ok(audit.data.quality.issues.some(row=>row.reason==='highlights_projection_mismatch'));
});
test('no fixed section wording or extra task count is imposed on the same analyst natural narrative',()=>{
 const draft=strongNarrativeReport();draft.reportMarkdown=draft.reportMarkdown.replaceAll('SWOT','İç ve dış koşullar').replaceAll('Güçlü yönler','İç avantajlar');
 const audit=conversationAuditResult(brief,stored(draft));assert.equal(audit.data.quality.contentComplete,true);assert.equal(audit.data.fullReport,draft.reportMarkdown);
});
test('missing work-review metadata cannot approve a new-policy report, and a truncated response stays partial within the existing cap',async()=>{
 const draft=strongNarrativeReport(),bad=semanticApproval(draft,version);delete bad.workReview;
 assert.throws(()=>applySemanticDecision(draft,bad,options()),e=>e.reviewFeedback.category==='format');
 const {ledger,total}=memoryLedger();await seed(ledger,{draft});
 const answer={...assistantCall('review_bhs',semanticApproval(draft,version)),stopReason:'max_tokens'},providers=scriptedProviders(ledger,[answer,answer]);
 await advanceConversation({brief,ledger,id,providers,now});const final=await advanceConversation({brief,ledger,id,providers,now});assert.equal(final.reason,'semantic_review_unavailable');
 const saved=await persistConversationResult({brief,ledger,id,now});assert.equal(saved.conversationReport.reportMarkdown,draft.reportMarkdown);assert.equal(conversationAuditResult(brief,saved).data.quality.contentComplete,false);
 assert.equal(providers.calls.length,2);assert.ok(total()<=5000);
});
test('a lost free result write reconstructs the exact full transfer without repurchasing any analyst response',async()=>{
 const {ledger,total}=memoryLedger(),draft=strongNarrativeReport();await seed(ledger,{draft});const providers=scriptedProviders(ledger,[assistantCall('review_bhs',semanticApproval(draft,version))]);
 await advanceConversation({brief,ledger,id,providers,now});let fail=true;
 const flaky={...ledger,once:(key,input,amount,run,opts)=>ledger.once(key,input,amount,key===conversationKeys.result(id)&&fail?async()=>{fail=false;throw Error('Lost free transfer acknowledgement');}:run,opts)};
 await assert.rejects(persistConversationResult({brief,ledger:flaky,id,now}),/Lost free transfer acknowledgement/);const spent=total();
 const result=await persistConversationResult({brief,ledger,id,now});assert.equal(result.conversationReport.reportMarkdown,draft.reportMarkdown);
 assert.deepEqual(conversationTransferIssues(result.conversationReport,result.conversationSources,result.conversationTransfer),[]);assert.equal(total(),spent);assert.equal(providers.calls.length,1);
});
test('the new review schema is frozen identically for counting/generation and the older claim quote keeps its exact native schema',async()=>{
 const {ledger}=memoryLedger(),requests=[],messages=[{role:'user',content:'Sentetik doğal aynı sohbet'}];
 const provider=createConversationProviders({ledger,anthropicKey:'synthetic',geminiKey:null,tavilyKey:null,apifyToken:null,researchFx:async()=>({usdTry:50}),fetchImpl:async(url,init)=>{
  const body=JSON.parse(init.body);requests.push(body);return new Response(JSON.stringify(url.endsWith('/count_tokens')?{input_tokens:1000}:{model:conversationModels.analyst,content:[],stop_reason:'end_turn',usage:{input_tokens:1000,output_tokens:20}}));
 }});
 const quote=await provider.analystQuote(messages,{review:true,...version});await provider.analyst(messages,{review:true,quote,receiptKey:'model:v3-work'});
 assert.deepEqual(requests[0].tools,requests[1].tools);assert.deepEqual(requests[1].tools.find(row=>row.name==='review_bhs').input_schema,researchWorkReviewSchema);
 const old=await provider.analystQuote(messages,{review:true,reviewPolicyVersion});await provider.analyst(messages,{review:true,quote:old,...version,receiptKey:'model:v2-work'});
 assert.deepEqual(requests[2].tools,requests[3].tools);assert.deepEqual(requests[3].tools.find(row=>row.name==='review_bhs').input_schema,claimReviewSchema);
 const count=requests.length;await provider.analyst(messages,{review:true,quote,receiptKey:'model:v3-work'});assert.equal(requests.length,count);
});
test('work receipt and transfer identity survive writing-only recovery without research or replay on reconnect',async()=>{
 const {ledger}=memoryLedger(),draft=await seed(ledger,{draft:strongNarrativeReport()});await ledger.once(conversationKeys.result(id),{},0,async()=>({reason:'provider_error',conversationSources:researchSources}));
 const providers=scriptedProviders(ledger,[assistantCall('finish_bhs',draft),assistantCall('review_bhs',semanticApproval(draft,version))]);
 providers.search=()=>assert.fail('No recovery research');providers.extract=()=>assert.fail('No recovery extraction');
 const config={brief,ledger,id,job:{researchRunId:'synthetic-work-run'},getProviders:()=>providers,meter:({run})=>run(),now};
 const result=await repairConversationReport(config);assert.equal(result.semanticReview.version,researchWorkPolicyVersion);assert.equal(result.conversationTransfer.version,conversationTransferVersion);
 assert.equal(result.conversationReport.reportMarkdown,draft.reportMarkdown);assert.equal(result.repair.newResearchCalls,0);assert.equal(conversationAuditResult(brief,result).data.quality.contentComplete,true);
 const count=providers.calls.length;await repairConversationReport(config);assert.equal(providers.calls.length,count);
});
test('an uncertain new-policy native request keeps its frozen schema ownership and is never counted or generated again',async()=>{
 const {ledger,total}=memoryLedger(),messages=[{role:'user',content:'Sentetik tek sohbet ve tek bütçe'}];let calls=0;
 const provider=createConversationProviders({ledger,anthropicKey:'synthetic',geminiKey:null,tavilyKey:null,apifyToken:null,researchFx:async()=>({usdTry:50}),fetchImpl:async url=>{
  calls++;if(url.endsWith('/count_tokens'))return new Response(JSON.stringify({input_tokens:1000}));throw Error('Synthetic uncertain native response');
 }});
 const quote=await provider.analystQuote(messages,{review:true,...version});await assert.rejects(provider.analyst(messages,{review:true,quote,receiptKey:'model:v3-uncertain'}),e=>e.code==='provider_timeout');
 const count=calls,spent=total();await assert.rejects(provider.analyst(messages,{review:true,quote,receiptKey:'model:v3-uncertain'}));assert.equal(calls,count);assert.equal(total(),spent);assert.ok(spent<=5000);
});
test('legacy claim policies require no new work receipt or transfer migration and preserve their native result',()=>{
 const draft=strongNarrativeReport(),decision=semanticApproval(draft,{reviewPolicyVersion}),review=applySemanticDecision(draft,decision,{...options(),reviewPolicyVersion}).review;
 const audit=conversationAuditResult(brief,{conversationReport:draft,conversationSources:researchSources,semanticReview:review});
 assert.equal(audit.data.quality.contentComplete,true);assert.equal(audit.data.conversationTransfer,undefined);
 assert.doesNotMatch(semanticReviewInstruction(draft,0,{reviewPolicyVersion}),/BHS İŞİNİ SONRAYA BIRAKMA/);
 assert.match(semanticReviewInstruction(draft,0,version),/BHS İŞİNİ SONRAYA BIRAKMA/);
});
