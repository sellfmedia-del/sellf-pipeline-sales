import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../src/budget/ledger.mjs';
import {applySemanticDecision,semanticReviewIssues,semanticReviewInstruction} from '../src/bhs/conversation-semantic.mjs';
import {reviewPolicyVersion,claimReviewSchema} from '../src/bhs/conversation-review-contract.mjs';
import {advanceConversation,readConversation,persistConversationResult} from '../src/bhs/conversation-engine.mjs';
import {conversationKeys,conversationVersion,semanticReviewSchema} from '../src/bhs/conversation-contract.mjs';
import {conversationAuditResult} from '../src/bhs/conversation-report.mjs';
import {createConversationProviders,conversationModels} from '../src/bhs/conversation-providers.mjs';
import {repairConversationReport} from '../src/bhs/conversation-repair.mjs';
import {createResearchSnapshot,readResearchSnapshot} from '../src/bhs/research-snapshot.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {assertResult} from '../src/contracts.mjs';
import {brief,source,peerSource,researchSources,researchSummary,completeResearchProgress,fixtureSourceResults,researchProgressInput,
 memoryLedger,assistantCall,scriptedProviders,semanticApproval} from './fixtures/bhs-conversation.mjs';
import {strongNarrativeReport,weakClaim,correctedClaim} from './fixtures/bhs-strong-narrative.mjs';

const version={reviewPolicyVersion},id='synthetic-review-claims',now=()=>Date.parse('2026-11-23T06:00:00Z');
const options=()=>({sources:researchSources,brief,progress:completeResearchProgress(),...version});
const issue=(changes={})=>({id:'measurement',reason:'Görülmeyen etiket gerçekleşmiş verimsizlik kanıtı değildir.',resolution:'İddiayı doğrulanacak koşullu analiz olarak düzelt.',sourceIds:[source.id],question:'',access:'analysis',...changes});
const claim=(changes={})=>({path:'reportMarkdown',text:weakClaim,kind:'hypothesis',basis:'Bu performans sonucu kamu kaynağıyla doğrulanmadı; koşullu analize çevrilecek.',
 sourceIds:[],briefQuote:'',verification:'Hesap erişimi ve olay/sipariş testiyle doğrula.',issueId:'measurement',...changes});
const patch=draft=>({...semanticApproval(draft,version),verdict:'patch',issues:[issue()],patches:[{issueId:'measurement',path:'reportMarkdown',operation:'replace_text',before:weakClaim,after:correctedClaim}],claimChecks:[claim()]});
const mixed=draft=>({...patch(draft),verdict:'research_needed',issues:[issue(),issue({id:'peer_order',reason:'Rakip sipariş koşulu netleştirilmeli.',resolution:'',access:'public',question:'Rakibin okunan ürün sayfasında doğrudan sipariş var mı?'})]});
async function seed(ledger,{draft=strongNarrativeReport({flawed:true}),thinking,policy=reviewPolicyVersion}={}){
 await ledger.once(conversationKeys.policy(id),{},0,async()=>({engine:conversationVersion,...(policy?{reviewPolicyVersion:policy}:{})}));
 await ledger.once(conversationKeys.turn(id,0),{},0,async()=>({sources:researchSources,researchSummary:researchSummary(),researchProgress:completeResearchProgress(),
  results:fixtureSourceResults(),toolIssues:[],semanticReviewVersion:policy||'same-conversation-targeted-review-v1'}));
 await ledger.once(conversationKeys.turn(id,1),{},0,async()=>({reportDraft:draft,semanticReview:{version:policy||'same-conversation-targeted-review-v1',status:'pending',attempts:0},
  assistant:{role:'assistant',content:[...(thinking?[thinking]:[]),...assistantCall('finish_bhs',draft,'draft').content]},results:[],toolIssues:[]}));
 return draft;
}
const response=value=>new Response(JSON.stringify(value));
const provider=(ledger,fetchImpl)=>createConversationProviders({ledger,fetchImpl,anthropicKey:'synthetic',geminiKey:null,tavilyKey:null,apifyToken:null,researchFx:async()=>({usdTry:50})});

test('one review can patch the false claim and return only the unresolved public question without rewriting the strong narrative',()=>{
 const draft=strongNarrativeReport({flawed:true}),result=applySemanticDecision(draft,mixed(draft),options());
 assert.equal(result.report.reportMarkdown,draft.reportMarkdown.replace(weakClaim,correctedClaim));
 assert.equal(result.review.status,'research_needed');assert.deepEqual(result.review.researchIssues.map(row=>row.id),['peer_order']);
 assert.deepEqual(result.report.highlights,draft.highlights);assert.ok(result.report.reportMarkdown.includes('90 günlük karar çerçevesi'));
});
test('a unique whitespace-only difference is resolved to the actual source range, preserving all other original bytes',()=>{
 const draft=strongNarrativeReport({flawed:true});draft.reportMarkdown=draft.reportMarkdown.replace(weakClaim,weakClaim.replaceAll(' ','\n  '));
 const result=applySemanticDecision(draft,patch(draft),options());
 assert.equal(result.report.reportMarkdown,draft.reportMarkdown.replace(weakClaim.replaceAll(' ','\n  '),correctedClaim));
});
test('ambiguous quotes and stale draft digests are rejected with targeted feedback and no partial mutation',()=>{
 const draft=strongNarrativeReport({flawed:true});draft.reportMarkdown+='\n'+weakClaim;const before=structuredClone(draft);
 assert.throws(()=>applySemanticDecision(draft,patch(draft),options()),error=>error.code==='semantic_review_invalid'&&error.reviewFeedback.path==='reportMarkdown');
 assert.deepEqual(draft,before);const stale=patch(draft);stale.draftDigest='0'.repeat(64);
 assert.throws(()=>applySemanticDecision(draft,stale,options()),error=>error.reviewFeedback.category==='format');
});
test('array removals use original indices and equivalent JSON key order rather than failing after the first successful removal',()=>{
 const draft=strongNarrativeReport();draft.questions=['A','B','C'];
 const decision={...semanticApproval(draft,version),verdict:'patch',issues:[issue()],patches:[0,1].map(index=>({issueId:'measurement',path:'questions.'+index,operation:'remove',before:JSON.stringify(draft.questions[index]),after:''}))};
 assert.deepEqual(applySemanticDecision(draft,decision,options()).report.questions,['C']);
 const row=draft.highlights[0],reordered=Object.fromEntries(Object.entries(row).reverse());
 decision.patches=[{issueId:'measurement',path:'highlights.0',operation:'remove',before:JSON.stringify(reordered),after:''}];
 assert.equal(applySemanticDecision(draft,decision,options()).report.highlights.length,0);
});
test('disjoint replacements use original coordinates even when a prior replacement changes the same field length',()=>{
 const draft=strongNarrativeReport({flawed:true}),decision=patch(draft),other='Bu kaynak';
 decision.patches.push({issueId:'measurement',path:'reportMarkdown',operation:'replace_text',before:'İlk 30 gün',after:'Hazırlık döneminin ilk otuz günü'});
 const result=applySemanticDecision(draft,decision,options());
 assert.equal(result.report.reportMarkdown,draft.reportMarkdown.replace(weakClaim,correctedClaim).replace('İlk 30 gün','Hazırlık döneminin ilk otuz günü'));
});
test('a bad second patch, overlapping operations or a whole-report replacement cannot leave a partially edited draft',()=>{
 const draft=strongNarrativeReport({flawed:true}),before=structuredClone(draft),decision=patch(draft);
 decision.patches.push({...decision.patches[0],path:'highlights.999.analysis'});
 assert.throws(()=>applySemanticDecision(draft,decision,options()),e=>e.reviewFeedback.path==='highlights.999.analysis');assert.deepEqual(draft,before);
 decision.patches=[patch(draft).patches[0],patch(draft).patches[0]];assert.throws(()=>applySemanticDecision(draft,decision,options()),e=>e.code==='semantic_review_invalid');
 decision.patches=[{...decision.patches[0],before:draft.reportMarkdown,after:'Yeni kısa rapor'}];assert.throws(()=>applySemanticDecision(draft,decision,options()),e=>e.reviewFeedback.category==='patch');
});
test('a missing brief statement cannot be approved as a sourced company weakness',()=>{
 const draft=strongNarrativeReport();draft.summary='Markanın satış sonrası deneyimi zayıftır.';
 const decision={...semanticApproval(draft,version),claimChecks:[claim({path:'summary',text:draft.summary,kind:'brief_statement',briefQuote:'Satış sonrası deneyim kötüdür.',issueId:''})]};
 assert.throws(()=>applySemanticDecision(draft,decision,options()),e=>e.reviewFeedback.category==='claim');
});
test('a genuine quoted multiline customer statement remains a declaration rather than becoming independent performance evidence',()=>{
 const custom={...brief,meetingNotes:'Marka "kurulum" paketini\n genişletmek istiyor.'},draft=strongNarrativeReport(),decision=semanticApproval(draft,version);
 decision.claimChecks=[claim({path:'summary',text:draft.summary,kind:'brief_statement',basis:'Bu müşterinin hedef beyanıdır; gerçekleşmiş performans değildir.',briefQuote:custom.meetingNotes,issueId:''})];
 assert.equal(applySemanticDecision(draft,decision,{...options(),brief:custom}).review.status,'approved');
});
test('professional-sales policy does not become proven pricing/channel power; the conditional claim needs a verification step',()=>{
 const draft=strongNarrativeReport();draft.summary='Profesyonellere satış kuralı fiyat ve kanal kontrolü sağlıyor.';
 const decision=semanticApproval(draft,version);decision.claimChecks=[claim({path:'summary',text:draft.summary,issueId:'',verification:''})];
 assert.throws(()=>applySemanticDecision(draft,decision,options()),e=>e.reviewFeedback.category==='claim');
 const corrected='Profesyonellere satış kuralının fiyat veya kanal kontrolü sağladığı doğrulanmadı; sözleşme ve gerçekleşen satış koşulları incelenmeli.';
 decision.verdict='patch';decision.issues=[issue({id:'policy',reason:'Satış koşulu tek başına fiyat kontrolü kanıtlamıyor.'})];
 decision.claimChecks=[claim({path:'summary',text:draft.summary,issueId:'policy'})];
 decision.patches=[{issueId:'policy',path:'summary',operation:'replace_text',before:draft.summary,after:corrected}];
 const result=applySemanticDecision(draft,decision,options());assert.equal(result.report.summary,corrected);assert.equal(result.report.reportMarkdown,draft.reportMarkdown);
});
test('a false finding is corrected consistently across summary, SWOT, highlight kind and action while unrelated sections survive',()=>{
 const draft=strongNarrativeReport({flawed:true}),wrong='Brifte açıklanmadığı için satış sonrası süreç yetersizdir.';
 draft.summary=wrong;draft.highlights[0].statement=wrong;draft.highlights[0].kind='observation';
 draft.reportMarkdown=draft.reportMarkdown.replace(weakClaim,wrong);const decision=patch(draft),after='Satış sonrası deneyim bu briefte değerlendirilmedi; süreç akışı ve müşteri geri bildirimiyle doğrulanmalı.';
 decision.patches=['summary','reportMarkdown','highlights.0.statement'].map(path=>({issueId:'measurement',path,operation:'replace_text',before:wrong,after}));
 decision.patches.push({issueId:'measurement',path:'highlights.0.kind',operation:'replace_text',before:'observation',after:'inference'});
 decision.claimChecks=[claim({path:'summary',text:wrong})];
 const result=applySemanticDecision(draft,decision,options());assert.equal(result.report.summary,after);assert.equal(result.report.highlights[0].kind,'inference');
 assert.equal(result.report.reportMarkdown,draft.reportMarkdown.replace(wrong,after));assert.equal(result.report.highlights[0].action,draft.highlights[0].action);
});
test('a source-fact assessment requires an adjudicated read body rather than a snippet, unknown page or unreviewed download',()=>{
 const draft=strongNarrativeReport(),decision=semanticApproval(draft,version);decision.claimChecks=[claim({path:'highlights.0.statement',text:draft.highlights[0].statement,kind:'source_fact',sourceIds:[source.id],issueId:''})];
 assert.equal(applySemanticDecision(draft,decision,options()).review.status,'approved');
 const p=completeResearchProgress();p.proofs=p.proofs.filter(row=>row.sourceId!==source.id);
 assert.throws(()=>applySemanticDecision(draft,decision,{...options(),progress:p}),e=>e.reviewFeedback.category==='claim');
 assert.throws(()=>applySemanticDecision(draft,decision,{...options(),sources:researchSources.map(row=>row.id===source.id?{...row,method:'search-snippet'}:row)}),e=>e.code==='semantic_review_invalid');
});
test('a selected hypothetical highlight cannot remain tagged as a factual observation after review',()=>{
 const draft=strongNarrativeReport(),decision=semanticApproval(draft,version);
 decision.claimChecks=[claim({path:'highlights.0.statement',text:draft.highlights[0].statement,issueId:''})];
 assert.throws(()=>applySemanticDecision(draft,decision,options()),e=>e.reviewFeedback.path==='highlights.0.statement');
 decision.verdict='patch';decision.issues=[issue()];decision.claimChecks[0].issueId='measurement';
 decision.patches=[{issueId:'measurement',path:'highlights.0.kind',operation:'replace_text',before:'observation',after:'inference'}];
 assert.equal(applySemanticDecision(draft,decision,options()).report.highlights[0].kind,'inference');
});
test('a mixed research-needed verdict cannot smuggle an unreviewed factual citation into the preserved report',async()=>{
 const {ledger}=memoryLedger(),draft=await seed(ledger),unread={...source,id:'S99999999',url:'https://unread.example.com/',method:'search-snippet',text:'Sentetik yalnız arama sonucu; ilgili gövde henüz okunmadı.'};
 await ledger.once(conversationKeys.turn(id,2),{},0,async()=>({sources:[unread],results:[],toolIssues:[]}));
 const decision=mixed(draft);decision.patches[0].after=correctedClaim+' Yeni olgu ['+unread.id+'].';
 decision.patches.push({issueId:'measurement',path:'sourceQuotes',operation:'append',before:'',after:JSON.stringify({sourceId:unread.id,quote:unread.text})});
 const providers=scriptedProviders(ledger,[assistantCall('review_bhs',decision)]),turn=await advanceConversation({brief,ledger,id,providers,now});
 assert.equal(turn.toolIssues[0].code,'semantic_review_invalid');assert.deepEqual(turn.reportDraft,draft);assert.equal(turn.semanticReview.status,'pending');
});
test('mixed review reopens only its public question, reuses the archived answer, and reviews the same patched draft in the same conversation',async()=>{
 const {ledger,total}=memoryLedger(),thinking={type:'thinking',thinking:'',signature:'retained-synthetic-thinking'},draft=await seed(ledger,{thinking});
 const first=mixed(draft),patched=applySemanticDecision(draft,first,options()).report;
 const q={id:'semantic_peer_order',question:first.issues[1].question,access:'public',important:true,status:'answered',answer:'Okunan sayfada doğrudan sipariş seçeneği var.',sourceIds:[peerSource.id],attemptedUrls:[],rationale:''};
 const delta={objective:researchProgressInput().objective,questions:[q],sources:[],candidates:[]};
 const providers=scriptedProviders(ledger,[assistantCall('review_bhs',first),assistantCall('read_saved_source',{sourceId:peerSource.id,offset:0}),
  assistantCall('review_research',delta),assistantCall('review_bhs',semanticApproval(patched,version))]);
 providers.search=()=>assert.fail('No repeated search');providers.extract=()=>assert.fail('No repurchased source');
 const turn=await advanceConversation({brief,ledger,id,providers,now});assert.equal(turn.closed,undefined);assert.equal(turn.semanticReview.researchContinuation.funded,true);
 assert.deepEqual(turn.researchProgress.questions.filter(row=>row.id.startsWith('semantic_')).map(row=>row.id),['semantic_peer_order']);
 for(let i=0;i<3;i++)await advanceConversation({brief,ledger,id,providers,now});
 const saved=await persistConversationResult({brief,ledger,id,now});assert.equal(saved.semanticReview.status,'approved');assert.equal(saved.semanticReview.attempts,2);
 assert.equal(saved.conversationReport.reportMarkdown,patched.reportMarkdown);assert.equal(conversationAuditResult(brief,saved).data.quality.contentComplete,true);
 assert.ok(JSON.stringify(providers.calls.at(-1).messages).includes(thinking.signature));assert.ok(JSON.stringify(providers.calls.at(-1).messages).includes(brief.meetingNotes));assert.ok(total()<=5000);
});
test('an unfunded public return keeps the successful patch and honest partial report without buying another research turn',async()=>{
 const {ledger,total}=memoryLedger({charged:4700}),draft=await seed(ledger),providers=scriptedProviders(ledger,[assistantCall('review_bhs',mixed(draft))]);
 providers.search=()=>assert.fail('No unfunded research');providers.extract=()=>assert.fail('No unfunded extraction');
 const closed=await advanceConversation({brief,ledger,id,providers,now});assert.equal(closed.closed,true);assert.equal(closed.reason,'semantic_research_needed');
 assert.equal(closed.semanticReview.researchContinuation.funded,false);assert.equal(closed.conversationReport.reportMarkdown,draft.reportMarkdown.replace(weakClaim,correctedClaim));
 const spent=total();await advanceConversation({brief,ledger,id,providers,now});assert.equal(providers.calls.length,1);assert.equal(total(),spent);assert.ok(spent<=5000);
});
test('a late but fundable mixed review can still read, record its answer and review within the existing turn boundary',async()=>{
 const {ledger}=memoryLedger(),draft=await seed(ledger);for(let at=2;at<11;at++)await ledger.once(conversationKeys.turn(id,at),{},0,async()=>({results:[],toolIssues:[]}));
 const decision=mixed(draft),patched=applySemanticDecision(draft,decision,options()).report;
 const delta={objective:researchProgressInput().objective,questions:[{id:'semantic_peer_order',question:decision.issues[1].question,access:'public',important:true,status:'answered',
  answer:'Okunan rakip sayfasında doğrudan sipariş seçeneği var.',sourceIds:[peerSource.id],attemptedUrls:[],rationale:''}],sources:[],candidates:[]};
 const providers=scriptedProviders(ledger,[assistantCall('review_bhs',decision),assistantCall('read_saved_source',{sourceId:peerSource.id,offset:0}),assistantCall('review_research',delta),assistantCall('review_bhs',semanticApproval(patched,version))]);
 const first=await advanceConversation({brief,ledger,id,providers,now});assert.equal(first.closed,undefined);
 for(let at=0;at<3;at++)await advanceConversation({brief,ledger,id,providers,now});
 const saved=await persistConversationResult({brief,ledger,id,now});assert.equal(saved.semanticReview.status,'approved');assert.equal(saved.semanticReview.attempts,2);
 assert.equal(conversationAuditResult(brief,saved).data.quality.contentComplete,true);
});
test('client-only unknowns are converted to a conditional claim and meeting question without opening public research',async()=>{
 const {ledger}=memoryLedger(),draft=await seed(ledger),decision=patch(draft);decision.issues[0].access='client';
 decision.patches.push({issueId:'measurement',path:'questions',operation:'append',before:'',after:JSON.stringify('Ölçüm ve gerçekleşen satış kayıtlarına erişim sağlanabilir mi?')});
 const providers=scriptedProviders(ledger,[assistantCall('review_bhs',decision)]),turn=await advanceConversation({brief,ledger,id,providers,now});
 assert.equal(turn.closed,true);assert.equal(turn.semanticReview.status,'approved');assert.ok(!turn.researchProgress.questions.some(row=>row.id.startsWith('semantic_')));
 assert.ok(turn.conversationReport.questions.at(-1).includes('erişim'));assert.equal(providers.calls.length,1);
});
test('invalid patch feedback survives reload and the second review repairs only that target without losing the original draft',async()=>{
 const {ledger}=memoryLedger(),draft=await seed(ledger),bad=patch(draft);bad.patches[0].before='Bu metin taslakta bulunmuyor.';
 const providers=scriptedProviders(ledger,[assistantCall('review_bhs',bad),assistantCall('review_bhs',patch(draft))]);
 const first=await advanceConversation({brief,ledger,id,providers,now}),feedback=JSON.parse(first.results[0].content).reviewFeedback;
 assert.equal(feedback.category,'patch');assert.equal(feedback.path,'reportMarkdown');assert.deepEqual((await readConversation(ledger,id)).reportDraft,draft);
 assert.deepEqual((await readConversation(ledger,id)).semanticReview.lastFeedback,feedback);
 const final=await advanceConversation({brief,ledger,id,providers,now});assert.equal(final.semanticReview.status,'approved');assert.equal(final.semanticReview.attempts,2);
 assert.ok(JSON.stringify(providers.calls[1].messages).includes('reviewFeedback'));assert.equal(final.conversationReport.reportMarkdown,draft.reportMarkdown.replace(weakClaim,correctedClaim));
});
test('new native counting and generation freeze identical claim schemas, while an old frozen quote retains its original schema',async()=>{
 const {ledger}=memoryLedger(),requests=[],messages=[{role:'user',content:'Sentetik aynı konuşma denetimi'}];
 const providers=provider(ledger,async(url,init)=>{const body=JSON.parse(init.body);requests.push({url,body});
  return response(url.endsWith('/count_tokens')?{input_tokens:1000}:{model:conversationModels.analyst,content:[],stop_reason:'end_turn',usage:{input_tokens:1000,output_tokens:20}});
 });
 const quote=await providers.analystQuote(messages,{review:true,...version});await providers.analyst(messages,{review:true,quote,receiptKey:'model:new-claims'});
 assert.deepEqual(requests[0].body.tools,requests[1].body.tools);assert.deepEqual(requests[1].body.tools.find(row=>row.name==='review_bhs').input_schema,claimReviewSchema);
 const old=await providers.analystQuote(messages,{review:true});await providers.analyst(messages,{review:true,quote:old,...version,receiptKey:'model:old-claims'});
 assert.deepEqual(requests[2].body.tools,requests[3].body.tools);assert.deepEqual(requests[3].body.tools.find(row=>row.name==='review_bhs').input_schema,semanticReviewSchema);
 const count=requests.length;await providers.analyst(messages,{review:true,quote,receiptKey:'model:new-claims'});assert.equal(requests.length,count);
});
test('unknown review policies stop before native counting and uncertain new requests retain ownership without replay',async()=>{
 const bad=memoryLedger();await seed(bad.ledger,{policy:'unknown'});await assert.rejects(readConversation(bad.ledger,id),e=>e.code==='budget_context');
 let calls=0;const p=provider(bad.ledger,()=>{calls++;assert.fail('No native count');});await assert.rejects(p.analystQuote([],{reviewPolicyVersion:'unknown'}),e=>e.code==='budget_context');assert.equal(calls,0);
 const {ledger,total}=memoryLedger(),native=provider(ledger,async url=>{calls++;if(url.endsWith('/count_tokens'))return response({input_tokens:1000});throw Error('Synthetic uncertain transport');});
 const messages=[{role:'user',content:'Sentetik tek sahipli denetim'}],quote=await native.analystQuote(messages,{review:true,...version});
 await assert.rejects(native.analyst(messages,{review:true,quote,receiptKey:'model:uncertain-claims'}),e=>e.code==='provider_timeout');
 const count=calls,spent=total();await assert.rejects(native.analyst(messages,{review:true,quote,receiptKey:'model:uncertain-claims'}));assert.equal(calls,count);assert.equal(total(),spent);assert.ok(spent<=5000);
});
test('completed claim checks and the full patched narrative survive saved-offer reuse; missing checks cannot become a quality approval',async()=>{
 const {ledger}=memoryLedger(),draft=await seed(ledger),providers=scriptedProviders(ledger,[assistantCall('review_bhs',patch(draft))]);
 await advanceConversation({brief,ledger,id,providers,now});const saved=await persistConversationResult({brief,ledger,id,now}),audit=conversationAuditResult(brief,saved);
 assert.equal(saved.semanticReview.version,reviewPolicyVersion);assert.equal(audit.data.quality.contentComplete,true);
 const reused=conversationAuditResult(brief,{report:audit.data.report});assert.equal(reused.data.fullReport,audit.data.fullReport);assert.equal(reused.data.quality.contentComplete,true);
 const snapshot=readResearchSnapshot(createResearchSnapshot(audit.data,brief)),fromSnapshot=directAuditResult(brief,snapshot);
 assert.equal(fromSnapshot.data.fullReport,audit.data.fullReport);assert.equal(fromSnapshot.data.quality.contentComplete,true);assertResult('audit',fromSnapshot);
 const tampered=structuredClone(saved);delete tampered.semanticReview.claimChecks;assert.ok(semanticReviewIssues(tampered.semanticReview,tampered.conversationReport).includes('claim_review_missing'));
 assert.equal(conversationAuditResult(brief,tampered).data.quality.contentComplete,false);
});
test('two invalid or truncated reviews still stop within the original attempt cap and preserve the whole useful draft',async()=>{
 for(const truncated of [false,true]){
  const {ledger,total}=memoryLedger(),draft=await seed(ledger),bad=patch(draft);bad.draftDigest='0'.repeat(64);
  const answer=truncated?{...assistantCall('review_bhs',patch(draft)),stopReason:'max_tokens'}:assistantCall('review_bhs',bad);
  const providers=scriptedProviders(ledger,[answer,answer]);await advanceConversation({brief,ledger,id,providers,now});
  const final=await advanceConversation({brief,ledger,id,providers,now}),spent=total();assert.equal(final.closed,true);assert.equal(final.reason,'semantic_review_unavailable');
  assert.deepEqual(final.conversationReport,draft);await advanceConversation({brief,ledger,id,providers,now});assert.equal(providers.calls.length,2);assert.equal(total(),spent);
 }
});
test('a lost free claim-review checkpoint reuses the immutable paid decision and exact frozen messages without count or generation replay',async()=>{
 const {ledger,total}=memoryLedger(),draft=await seed(ledger);let counts=0,generations=0,fail=true;
 const providers=provider(ledger,async url=>{if(url.endsWith('/count_tokens')){counts++;return response({input_tokens:1000});}generations++;
  return response({model:conversationModels.analyst,...assistantCall('review_bhs',patch(draft)),stop_reason:'tool_use',usage:{input_tokens:1000,output_tokens:400}});
 });
 const flaky={...ledger,once:(key,input,amount,run,opts)=>ledger.once(key,input,amount,key===conversationKeys.turn(id,2)&&fail?async()=>{fail=false;throw Error('lost free acknowledgement');}:run,opts)};
 await assert.rejects(advanceConversation({brief,ledger:flaky,id,providers,now}),/lost free acknowledgement/);const spent=total();
 const recovered=await advanceConversation({brief,ledger,id,providers,now});assert.equal(recovered.semanticReview.status,'approved');assert.equal(generations,1);assert.equal(counts,1);assert.equal(total(),spent);
});
test('writing-only recovery retains the new native review policy, claim receipt and whole context without researching again',async()=>{
 const {ledger}=memoryLedger(),draft=strongNarrativeReport({flawed:true});await seed(ledger,{draft});
 await ledger.once(conversationKeys.result(id),{},0,async()=>({reason:'provider_error',conversationSources:researchSources}));
 const providers=scriptedProviders(ledger,[assistantCall('finish_bhs',draft),assistantCall('review_bhs',patch(draft))]);
 providers.search=()=>assert.fail('No recovery search');providers.extract=()=>assert.fail('No recovery extraction');
 const config={brief,job:{researchRunId:'synthetic-claim-run'},ledger,id,getProviders:()=>providers,meter:({run})=>run(),now};
 const result=await repairConversationReport(config);assert.equal(result.semanticReview.version,reviewPolicyVersion);assert.equal(result.semanticReview.status,'approved');
 assert.equal(result.conversationReport.reportMarkdown,draft.reportMarkdown.replace(weakClaim,correctedClaim));assert.equal(result.repair.newResearchCalls,0);
 assert.equal(conversationAuditResult(brief,result).data.quality.contentComplete,true);const count=providers.calls.length;await repairConversationReport(config);assert.equal(providers.calls.length,count);
});
test('legacy review contracts and old policy messages keep their original interpretation',async()=>{
 const draft=strongNarrativeReport({flawed:true}),old=semanticApproval(draft);assert.equal(applySemanticDecision(draft,old,{sources:researchSources}).review.status,'approved');
 const {ledger}=memoryLedger();await seed(ledger,{draft,policy:null});const providers=scriptedProviders(ledger,[assistantCall('review_bhs',old)]);
 assert.equal((await advanceConversation({brief,ledger,id,providers,now})).semanticReview.version,'same-conversation-targeted-review-v1');
 assert.doesNotMatch(semanticReviewInstruction(draft,0),/İDDİA VE DÜZELTME DENETİMİ/);assert.match(semanticReviewInstruction(draft,0,version),/profesyonellere|Profesyonellere/);
});
