import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceConversation,readConversation,readConversationResult,persistConversationResult,conversationMessages} from '../src/bhs/conversation-engine.mjs';
import {conversationAuditResult,validateConversationReport} from '../src/bhs/conversation-report.mjs';
import {conversationKeys,publicResearchUrl,conversationVersion} from '../src/bhs/conversation-contract.mjs';
import {runConversationJob} from '../src/bhs/conversation-bridge.mjs';
import {assertResult} from '../src/contracts.mjs';
import {createResearchSnapshot,readResearchSnapshot} from '../src/bhs/research-snapshot.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {brief,source,report,memoryLedger,assistantCall,scriptedProviders} from './fixtures/bhs-conversation.mjs';

const id='a'.repeat(64),now=()=>Date.parse('2026-11-20T10:00:00Z');
test('opaque provider thinking blocks are retained unchanged in the next tool-use turn',async()=>{
 const {ledger}=memoryLedger(),thinking={type:'thinking',thinking:'',signature:'synthetic-opaque-signature'};
 const first=assistantCall('read_pages',{urls:[brief.website],purpose:'Kaynağı oku'});first.content.unshift(thinking);
 const providers=scriptedProviders(ledger,[first,assistantCall('begin_report',{reason:'Hazır'})]);
 await advanceConversation({brief,ledger,id,providers,now});await advanceConversation({brief,ledger,id,providers,now});
 const assistant=providers.calls[1].messages.find(row=>row.role==='assistant');assert.deepEqual(assistant.content[0],thinking);
});
test('an early report tool call requests full writing capacity before it can complete the BHS',async()=>{
 const {ledger}=memoryLedger();await ledger.once(conversationKeys.turn(id,0),{id},0,async()=>({sources:[source],readAttempts:[],results:[],toolIssues:[]}));
 const providers=scriptedProviders(ledger,[assistantCall('finish_bhs',report()),assistantCall('finish_bhs',report())]);
 const early=await advanceConversation({brief,ledger,id,providers,now});assert.equal(early.closed,undefined);assert.equal(early.finishRequested,true);
 const final=await advanceConversation({brief,ledger,id,providers,now});assert.equal(final.closed,true);assert.equal(providers.calls[1].options.final,true);
});
test('the same conversation carries the full brief, tool observations and a whole report without the old need gates',async()=>{
 const {ledger}=memoryLedger(),providers=scriptedProviders(ledger,[assistantCall('read_pages',{urls:[brief.website],purpose:'Markayı ve mevcut satın alma yolunu anla.'}),
  assistantCall('begin_report',{reason:'Ürün ve kanal gözlemini sınırlı ama somut aksiyona dönüştür.'}),assistantCall('finish_bhs',report())]);
 for(let i=0;i<3;i++)await advanceConversation({brief,ledger,id,providers,now});
 const saved=await persistConversationResult({brief,ledger,id,now}),audit=conversationAuditResult(brief,saved);
 assert.equal(audit.data.fullReport,report().reportMarkdown);
 assert.equal(audit.data.findings[0].impact,report().highlights[0].analysis);
 assert.equal(audit.data.findings[0].recommendation.action,report().highlights[0].action);
 assert.equal(audit.data.quality.contentComplete,true);assert.equal(audit.data.researchContinuity.status,'complete');
 assert.match(JSON.stringify(providers.calls[2].messages),/Amazon tarafında mevcut bir partner var/);
 assert.match(JSON.stringify(providers.calls[2].messages),/Kıtık açıcı/);assert.equal(providers.calls[2].options.final,true);
 assertResult('audit',audit);
});
test('cached source reads do not call the source provider again and the full archive remains accessible',async()=>{
 const {ledger}=memoryLedger(),providers=scriptedProviders(ledger,Array.from({length:2},()=>assistantCall('read_pages',{urls:[brief.website],purpose:'Ürün ve kanal'})));
 let reads=0;providers.extract=async()=>{reads++;return {results:[{...source,text:source.text+'x'.repeat(15000)}],failures:[]};};
 await advanceConversation({brief,ledger,id,providers,now});await advanceConversation({brief,ledger,id,providers,now});
 const state=await readConversation(ledger,id);assert.equal(reads,1);assert.ok(state.sources[0].text.length>15000);
 const result=JSON.parse(state.turns[0].results[0].content);assert.equal(result.sources[0].moreAvailable,true);
});
test('web discovery becomes a read source and every previous request remains a stable prefix of the next conversation',async()=>{
 const {ledger}=memoryLedger(),providers=scriptedProviders(ledger,[assistantCall('search_web',{query:'Örnek Pet ürünleri',maxResults:1,purpose:'Doğru ürünü bul'}),
  assistantCall('read_pages',{urls:[brief.website],purpose:'Kaynağı oku'}),assistantCall('begin_report',{reason:'Hazır'}),assistantCall('finish_bhs',report())]);
 for(let at=0;at<4;at++)await advanceConversation({brief,ledger,id,providers,now});
 const state=await readConversation(ledger,id);assert.equal(state.sources[0].method,'extracted');assert.equal(state.final.conversationReport.reportMarkdown,report().reportMarkdown);
 for(let at=1;at<providers.calls.length;at++){
  const previous=providers.calls[at-1].messages,next=providers.calls[at].messages;
  assert.deepEqual(next.slice(0,previous.length),previous);
 }
});
test('a source failure stays a source failure, supports another path, and cannot become a brand deficiency',async()=>{
 const {ledger}=memoryLedger(),providers=scriptedProviders(ledger,[assistantCall('read_pages',{urls:[brief.website],purpose:'Kaynağı oku'}),assistantCall('read_pages',{urls:[brief.website],purpose:'Aynı sayfayı yeniden oku'})]);
 let reads=0;providers.extract=async()=>{reads++;return {results:[],failures:[{url:brief.website,code:'source_unreadable'}]};};
 await advanceConversation({brief,ledger,id,providers,now});const second=await advanceConversation({brief,ledger,id,providers,now});
 assert.equal(reads,1);assert.equal(second.toolIssues[0].code,'source_already_failed');assert.equal(second.conversationReport,undefined);
});
test('a free untried source cannot be fetched unless the URL was actually observed',async()=>{
 const {ledger}=memoryLedger(),providers=scriptedProviders(ledger,[assistantCall('read_pages',{urls:['https://unknown.example.com/'],purpose:'Oku'})]);
 providers.extract=()=>{throw Error('unobserved URL executed');};
 const turn=await advanceConversation({brief,ledger,id,providers,now});assert.equal(turn.toolIssues[0].code,'unknown_source');
});
test('an interrupted acknowledgement reuses the frozen paid request despite the changed ledger balance',async()=>{
 const {ledger}=memoryLedger();let paid=0,quotes=0;
 const providers={analystQuote:async()=>{quotes++;return {reservation:100,finalReservation:800};},
  analyst:async(messages)=>ledger.once('model:fixed-request',{messages},100,async()=>{paid++;return assistantCall('begin_report',{reason:'Hazır'});})};
 let disconnect=true;
 const flaky={...ledger,once:(key,...args)=>{if(key===conversationKeys.turn(id,0)&&disconnect){disconnect=false;throw Error('lost ack');}return ledger.once(key,...args);}};
 await assert.rejects(advanceConversation({brief,ledger:flaky,id,providers,now}),/lost ack/);
 await advanceConversation({brief,ledger,id,providers,now});assert.equal(paid,1);assert.equal(quotes,1);
});
test('research is converted to a whole-report call while a final answer still fits the shared budget',async()=>{
 const {ledger}=memoryLedger({charged:4100});let searched=false,final;
 const providers={analystQuote:async(_,{final:f})=>({reservation:f?800:100,finalReservation:800}),
  analyst:async(_,{final:f})=>{final=f;return assistantCall('finish_bhs',report());},search:()=>{searched=true;}};
 // The fixture source is retained from an earlier turn in the same account.
 await ledger.once(conversationKeys.turn(id,0),{id},0,async()=>({sources:[source],readAttempts:[],results:[],toolIssues:[]}));
 await advanceConversation({brief,ledger,id,providers,now});assert.equal(final,true);assert.equal(searched,false);
});
test('a failed zero-cost turn checkpoint is reconstructed from immutable paid receipts while its abandoned row stays intact',async()=>{
 const {ledger,rows,total}=memoryLedger();let paid=0,breakCheckpoint=true;
 const providers={analystQuote:async()=>({reservation:100,finalReservation:800}),
  analyst:async messages=>ledger.once('model:immutable',{messages},100,async()=>{paid++;return {...assistantCall('read_pages',{urls:[brief.website],purpose:'Kaynağı oku'}),accountedKurus:20};},{settle:v=>v.accountedKurus}),
  extract:async()=>ledger.once('extract:immutable',{},62,async()=>({results:[source],failures:[],accountedKurus:10}),{settle:v=>v.accountedKurus})};
 const interrupted={...ledger,once:(key,input,amount,run,options)=>{
  if(key===conversationKeys.turn(id,0)&&breakCheckpoint){breakCheckpoint=false;return ledger.once(key,input,0,()=>{throw Error('checkpoint lost');});}
  return ledger.once(key,input,amount,run,options);
 }};
 await assert.rejects(advanceConversation({brief,ledger:interrupted,id,providers,now}),/checkpoint lost/);
 const before=total();assert.equal(rows.get(conversationKeys.turn(id,0)).state,'uncertain');
 await advanceConversation({brief,ledger,id,providers,now});const restored=await readConversation(ledger,id);
 assert.equal(paid,1);assert.equal(total(),before);assert.equal(restored.sources[0].text,source.text);
 assert.equal(rows.get(conversationKeys.turn(id,0)).state,'uncertain');assert.equal(restored.index,1);
});
test('unknown citations, invented quotations and unread factual highlights are rejected individually with explicit reasons',()=>{
 const wrong=report();wrong.sourceQuotes[0].quote='Kaynakta bulunmayan alıntı.';
 assert.ok(validateConversationReport(wrong,[source]).includes('quote_mismatch'));
 const unread={...source,method:'search-snippet'};assert.ok(validateConversationReport(report(),[unread]).includes('unread_observation'));
 const missing=report();missing.highlights[0].sourceIds=['S00000000'];assert.ok(validateConversationReport(missing,[source]).includes('unknown_citation'));
});
test('an abandoned free result write is recoverable without another provider purchase',async()=>{
 const {ledger,rows,total}=memoryLedger();
 await ledger.once(conversationKeys.turn(id,0),{id},0,async()=>({closed:true,conversationReport:report(),sources:[source],toolIssues:[]}));
 await assert.rejects(ledger.once(conversationKeys.result(id),{id},0,()=>{throw Error('lost result write');}),/lost result write/);
 const before=total(),saved=await persistConversationResult({brief,ledger,id,now});
 assert.equal(saved.conversationReport.reportMarkdown,report().reportMarkdown);
 assert.equal((await readConversationResult(ledger,id)).state,'complete');assert.equal(total(),before);
 assert.equal(rows.get(conversationKeys.result(id)).state,'uncertain');
});
test('a syntactically valid but incomplete BHS cannot be marked complete by only supplying a source',()=>{
 const incomplete=report();incomplete.reportMarkdown='Marka ve pazar hakkında kısa bir cümle. [S00000000]';
 const issues=validateConversationReport(incomplete,[source]);assert.ok(issues.includes('missing_swot'));assert.ok(issues.includes('missing_actions'));
});
test('the complete narrative and qualified analysis survive pricing snapshots and saved-offer reuse unchanged',()=>{
 const audit=conversationAuditResult(brief,{conversationReport:report(),conversationSources:[source],researchedAt:'2026-11-20T10:00:00Z'});
 const snapshot=createResearchSnapshot(audit.data,brief);assert.ok(snapshot);
 const saved=readResearchSnapshot(snapshot),reused=directAuditResult(brief,{report:saved.report,reuse:{researchedAt:saved.researchedAt}});
 assert.equal(reused.data.fullReport,report().reportMarkdown);assert.equal(reused.data.findings[0].impact,report().highlights[0].analysis);
 assert.equal(reused.data.researchAsOf,saved.researchedAt);
 assertResult('audit',reused);
});
test('source problems permit an honest pricing handoff but never become successful quality checks',()=>{
 const audit=conversationAuditResult(brief,{conversationSources:[],toolIssues:[]},{reason:'provider_error'});
 assert.equal(audit.status,'ready');assert.equal(audit.data.quality.checksPassed,false);assert.equal(audit.data.researchContinuity.status,'unavailable');assertResult('audit',audit);
});
test('the installed queue lease/checkpoint contract is retained without invoking a legacy research stage',async()=>{
 const {ledger}=memoryLedger();await ledger.once(conversationKeys.policy(id),{id},0,async()=>({engine:conversationVersion}));
 const events=[],job={id:'job',brief,briefHash:id,queueBriefHash:id,researchVersion:'v8',phase:'sector_sources',compactQueue:true,leaseToken:'a'.repeat(32),leaseUntil:now()+60000};
 const result=await runConversationJob({job,ledger,queue:{advance:async(_,{nextPhase,checkpointKey})=>events.push({nextPhase,checkpointKey})},getProviders:()=>{throw Error('legacy research must not execute');},now});
 assert.equal(result.nextPhase,'report_draft');assert.match(events[0].checkpointKey,/sector_sources-v8-r3/);
});
test('secret-bearing and private source URLs never become research targets',()=>{
 for(const url of ['http://127.0.0.1/','https://user:password@example.com/','https://example.com/?api_key=secret','https://foo.internal/'])assert.equal(publicResearchUrl(url),null);
 assert.equal(publicResearchUrl('https://example.com/article#title'),'https://example.com/article');
});
