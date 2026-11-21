import test from 'node:test';
import assert from 'node:assert/strict';
import {createConversationProviders,modelReservation} from '../src/bhs/conversation-providers.mjs';
import {advanceConversation,readConversation,persistConversationResult} from '../src/bhs/conversation-engine.mjs';
import {conversationKeys} from '../src/bhs/conversation-contract.mjs';
import {emptyResearchProgress,updateResearchProgress,collectSourceViews,researchCoverage,researchClosureIssues,researchStatus} from '../src/bhs/conversation-progress.mjs';
import {presentConversationSource} from '../src/bhs/conversation-source.mjs';
import {conversationAuditResult} from '../src/bhs/conversation-report.mjs';
import {brief,source,peerSource,researchSources,researchProgressInput,completeResearchProgress,fixtureSourceResults,researchedReport,
 memoryLedger,assistantCall,scriptedProviders,semanticApproval} from './fixtures/bhs-conversation.mjs';

const id='b'.repeat(64),now=()=>Date.parse('2026-11-21T10:00:00Z');
const reply=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const config=(ledger,fetchImpl)=>({ledger,fetchImpl,researchFx:async()=>({usdTry:50,publishedAt:'2026-11-21'}),
 anthropicKey:'synthetic-claude',tavilyKey:'synthetic-tavily',geminiKey:null,apifyToken:null,navigationReader:async()=>({status:'unavailable',links:[]})});
const question=()=>({id:'brand',question:'Markanın ürünü ve mevcut satış kanalı nedir?',access:'public',important:true,status:'open',answer:'',sourceIds:[],attemptedUrls:[],rationale:''});
const plan=()=>({objective:'Ürün ve kanal kararını anlayıp dış pazar ve rekabet araştırmasına devam et.',questions:[question()],sources:[],
 candidates:[{url:source.url,questionId:'brand',status:'selected',reason:'Markanın kendi sayfası incelenecek.'}]});
const context=(sources=[])=>({sources,knownUrls:new Set([source.url,...sources.map(row=>row.url)]),readAttempts:new Set(),
 views:collectSourceViews({results:[{content:JSON.stringify({sources:sources.map(row=>presentConversationSource(row))})}]},new Map(sources.map(row=>[row.id,row])))});

test('Kuatra-shaped budget regression continues a useful read with the full prior conversation instead of forced writing',async()=>{
 const {ledger,total}=memoryLedger({charged:1062}),opaque={type:'thinking',thinking:'Synthetic prior decision; preserve exactly.',signature:'synthetic-signature'};
 const archived={...source,links:[peerSource.url]},observation={type:'tool_result',tool_use_id:'read-home',content:JSON.stringify({sources:[presentConversationSource(archived)]})};
 await ledger.once(conversationKeys.turn(id,0),{},0,async()=>({sources:[archived],researchProgress:emptyResearchProgress(),toolIssues:[],
  assistant:{role:'assistant',content:[opaque,{type:'tool_use',id:'read-home',name:'read_pages',input:{urls:[source.url],purpose:'Markayı anla'}}]},results:[observation]}));
 const requests=[];
 const providers=createConversationProviders(config(ledger,async(url,init)=>{
  const body=JSON.parse(init.body);requests.push({url,body});
  if(url.endsWith('/count_tokens'))return reply({input_tokens:20002}); // saved run's 21,515-token upper bound
  if(url.endsWith('/messages'))return reply({model:'claude-sonnet-5-5',...assistantCall('read_pages',{urls:[peerSource.url],purpose:'Gözlemlenen rakip ürününü oku'}),stop_reason:'tool_use',
   usage:{input_tokens:100,cache_read_input_tokens:19902,output_tokens:400}});
  if(url.endsWith('/extract'))return reply({results:[{url:peerSource.url,title:peerSource.title,raw_content:peerSource.text}],usage:{credits:0}});
  throw Error('Unplanned provider operation');
 }));
 const turn=await advanceConversation({brief,ledger,id,providers,now});
 assert.deepEqual(turn.toolIssues,[]);assert.equal(turn.finishRequested,false);assert.equal(turn.closed,undefined);
 assert.equal(turn.sources[0].url,peerSource.url);
 const frozen=await ledger.get('audit:conversation:request:'+id+':1');
 assert.equal(frozen.value.finalMode,false);assert.equal(frozen.value.quote.output,1800);
 assert.equal(frozen.value.quote.finalReservation,modelReservation('analyst',21515,20000));
 assert.ok(frozen.value.quote.reviewOutput>=1000&&frozen.value.quote.reviewOutput<6000);
 assert.ok(frozen.value.quote.requiredKurus<=5000-1062);assert.equal(frozen.value.quote.followingReserveKurus,600);
 const request=requests.find(row=>row.url.endsWith('/messages')).body;
 assert.deepEqual(request.messages[1].content[0],opaque);
 assert.ok(request.messages.some(row=>typeof row.content==='string'&&row.content.includes(brief.meetingNotes)));
 assert.ok(request.messages.some(row=>Array.isArray(row.content)&&row.content.some(block=>block.content===observation.content)));
 assert.ok(!JSON.stringify(request.messages.at(-1)).includes('Araştırma penceresi kapandı'));
 assert.equal(request.max_tokens,1800);assert.equal(requests.filter(row=>row.url.endsWith('/extract')).length,1);assert.ok(total()<=5000);
});

test('adaptive quotes keep the full narrative ceiling, fund a next read and both following worker envelopes without assumed cache hits',async()=>{
 const {ledger}=memoryLedger(),providers=createConversationProviders(config(ledger,async()=>reply({input_tokens:20002})));
 const messages=[{role:'user',content:'Sentetik korunmuş konuşma.'}];
 const ample=await providers.analystQuote(messages);assert.equal(ample.reviewOutput,6000);
 const quote=await providers.analystQuote(messages,{availableKurus:3938});
 assert.equal(quote.inputUpper,21515);assert.equal(quote.funded,true);assert.equal(quote.toolReserveKurus,62);
 assert.equal(quote.completionReservation,quote.finalReservation+quote.reviewReservation);
 assert.equal(quote.requiredKurus,quote.reservation+quote.completionReservation+600+62);
 assert.equal(quote.finalReservation,modelReservation('analyst',quote.inputUpper,20000));
 assert.equal(quote.reviewReservation,modelReservation('analyst',quote.inputUpper+20512,quote.reviewOutput));
 const blocked=await providers.analystQuote(messages,{availableKurus:3000});assert.equal(blocked.funded,false);
});

test('additional preserved questions and warning context can fit a shorter research decision without shrinking the report',async()=>{
 const {ledger}=memoryLedger(),providers=createConversationProviders(config(ledger,async()=>reply({input_tokens:20940})));
 const quote=await providers.analystQuote([{role:'user',content:'Sorular, uyarılar ve önceki bütün kaynaklar korunuyor.'}],{availableKurus:3938});
 assert.equal(quote.funded,true);assert.ok(quote.inputUpper>22000);
 assert.ok(quote.output>=1000&&quote.output<1800);assert.equal(quote.finalReservation,modelReservation('analyst',quote.inputUpper,20000));
 assert.ok(quote.requiredKurus<=3938);
});

test('a scoped review sends precisely its affordable frozen output ceiling and cannot reuse an uncertain purchase',async()=>{
 const {ledger,total}=memoryLedger({charged:4300});let paid=0,generated;
 const providers=createConversationProviders(config(ledger,async(url,init)=>{
  if(url.endsWith('/count_tokens'))return reply({input_tokens:20002});
  paid++;generated=JSON.parse(init.body);throw Error('Synthetic lost response');
 }));
 const messages=[{role:'user',content:'Taslağı koruyarak hedefli denetle.'}],quote=await providers.analystQuote(messages,{review:true,hasDraft:true,availableKurus:700});
 assert.equal(quote.funded,true);assert.ok(quote.output>=1000&&quote.output<6000);
 await assert.rejects(providers.analyst(messages,{review:true,hasDraft:true,quote,receiptKey:'model:adaptive-review'}),e=>e.code==='provider_timeout');
 assert.equal(generated.max_tokens,quote.output);assert.equal(total(),4300+quote.reservation);
 await assert.rejects(providers.analyst(messages,{review:true,hasDraft:true,quote,receiptKey:'model:adaptive-review'}));
 assert.equal(paid,1);assert.ok(total()<=5000);
});

test('insufficient review funding preserves an affordable entire draft allowance and never borrows another account',async()=>{
 const {ledger}=memoryLedger(),providers=createConversationProviders(config(ledger,async()=>reply({input_tokens:20002})));
 const quote=await providers.analystQuote([{role:'user',content:'Eldeki kaynaklardan tam raporu koru.'}],{final:true,availableKurus:2000});
 assert.equal(quote.output,20000);assert.equal(quote.reviewDeferred,true);assert.equal(quote.reviewReservation,0);
 assert.equal(quote.followingReserveKurus,0);assert.equal(quote.reservation,1885);assert.equal(quote.funded,true);
});

test('a truncated review cannot approve a preserved full draft even if the returned decision is valid JSON',async()=>{
 const {ledger}=memoryLedger(),draft=researchedReport();
 await ledger.once(conversationKeys.turn(id,0),{},0,async()=>({sources:researchSources,results:fixtureSourceResults(),researchProgress:completeResearchProgress(),
  reportDraft:draft,semanticReview:{status:'pending',attempts:0},toolIssues:[]}));
 const providers=scriptedProviders(ledger,Array.from({length:2},()=>({...assistantCall('review_bhs',semanticApproval(draft)),stopReason:'max_tokens'})));
 const first=await advanceConversation({brief,ledger,id,providers,now});assert.equal(first.semanticReview.status,'pending');
 assert.equal(first.toolIssues[0].code,'semantic_review_invalid');assert.deepEqual(first.reportDraft,draft);
 const second=await advanceConversation({brief,ledger,id,providers,now});assert.equal(second.reason,'semantic_review_unavailable');
 const saved=await persistConversationResult({brief,ledger,id,now});assert.equal(saved.conversationReport.reportMarkdown,draft.reportMarkdown);
 assert.equal(conversationAuditResult(brief,saved).data.quality.contentComplete,false);
});

test('an unread selected candidate keeps valid research questions and becomes pending without fabricated read proof',()=>{
 const result=updateResearchProgress(emptyResearchProgress(),plan(),context());
 assert.equal(result.objective,plan().objective);assert.deepEqual(result.questions,[question()]);
 assert.equal(result.candidates[0].status,'pending');assert.deepEqual(result.proofs,[]);
 assert.equal(researchCoverage(result,[]).count,0);assert.ok(researchClosureIssues(result,[]).includes('important_public_questions_open'));
 assert.equal(researchStatus(result,[]).candidateIssues[0].code,'candidate_read_pending');
});

test('malformed and unknown candidates cannot erase valid questions, valid source proofs or earlier pending candidates',()=>{
 const previous=completeResearchProgress();previous.candidates=[{url:source.url,questionId:'brand',status:'pending',reason:'Önceki karar korunacak.'}];
 const input=researchProgressInput();input.candidates=[{url:'https://unknown.example.com/',questionId:'brand',status:'selected',reason:'Bilinmeyen adres'},
  {url:source.url}, {url:peerSource.url,questionId:'competition',status:'selected',reason:'Okunan ve ilgili rakip kaynağı.'}];
 const result=updateResearchProgress(previous,input,context(researchSources));
 assert.deepEqual(result.questions,input.questions);assert.equal(researchCoverage(result,researchSources).count,4);
 assert.equal(result.candidates.find(row=>row.url===source.url).status,'pending');
 assert.equal(result.candidates.find(row=>row.url===peerSource.url).status,'selected');assert.equal(result.candidateIssues.length,2);
 assert.ok(researchClosureIssues(result,researchSources).includes('relevant_candidates_unread'));
});

test('an invalid candidate list is reported separately while evidence assertions remain strict and atomic',()=>{
 const input=plan();input.candidates=null;
 const result=updateResearchProgress(emptyResearchProgress(),input,context());assert.deepEqual(result.questions,[question()]);
 assert.equal(result.candidateIssues[0].code,'candidate_format_invalid');
 const fabricated=researchProgressInput();fabricated.sources[0].quote='Bu pasaj hiçbir zaman okunmadı.';
 const previous=emptyResearchProgress();assert.throws(()=>updateResearchProgress(previous,fabricated,context(researchSources)),e=>e.code==='research_progress_invalid');
 assert.deepEqual(previous,emptyResearchProgress());
});

test('candidate repair and pending questions survive durable reload and do not grant early report writing',async()=>{
 const {ledger}=memoryLedger(),review=assistantCall('review_research',plan(),'plan'),read=assistantCall('read_pages',{urls:[source.url],purpose:'Ürünü oku'},'read');
 const providers=scriptedProviders(ledger,[{content:[...review.content,...read.content],stopReason:'tool_use'},assistantCall('begin_report',{reason:'Ana sayfa okundu.'})]);
 const first=await advanceConversation({brief,ledger,id,providers,now});assert.deepEqual(first.toolIssues,[]);
 assert.equal(first.researchProgress.questions.length,1);assert.equal(first.researchProgress.candidates[0].status,'pending');
 const restored=await readConversation(ledger,id);assert.deepEqual(restored.researchProgress,JSON.parse(JSON.stringify(first.researchProgress)));
 const early=await advanceConversation({brief,ledger,id,providers,now});assert.equal(early.finishRequested,false);assert.equal(early.closed,undefined);
 assert.equal(early.toolIssues[0].code,'research_needed');assert.match(early.results[0].content,/important_public_questions_open/);
});

test('a pending selection becomes selected only after a seen related body is actually reviewed',()=>{
 const pending=updateResearchProgress(emptyResearchProgress(),plan(),context());
 const input=plan();input.questions[0]={...question(),status:'answered',answer:'Ürün ve sipariş yolu okunan sayfada açıklanıyor.',sourceIds:[source.id]};
 input.sources=[{sourceId:source.id,questionId:'brand',related:true,quote:source.text,reason:'Ürün ve satış kanalı sorusunu cevaplıyor.'}];
 const result=updateResearchProgress(pending,input,context([source]));
 assert.equal(result.candidates[0].status,'selected');assert.equal(result.questions[0].status,'answered');assert.equal(result.candidateIssues.length,0);
 assert.equal(researchCoverage(result,[source]).count,1);
});
