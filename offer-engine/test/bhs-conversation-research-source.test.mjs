import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceConversation,readConversation,persistConversationResult} from '../src/bhs/conversation-engine.mjs';
import {conversationAuditResult,validateConversationReport} from '../src/bhs/conversation-report.mjs';
import {presentConversationSource,sourceReadingStatus,sourceWindowCharacters} from '../src/bhs/conversation-source.mjs';
import {researchOutcomeIssues,researchOutcomeVersion} from '../src/bhs/conversation-research.mjs';
import {conversationKeys,researchHandoffSchema} from '../src/bhs/conversation-contract.mjs';
import {assertSchema} from '../src/bhs/schema.mjs';
import {createResearchSnapshot,readResearchSnapshot} from '../src/bhs/research-snapshot.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {repairConversationReport} from '../src/bhs/conversation-repair.mjs';
import {brief,source,peerSource,usageSource,completeResearchProgress,fixtureSourceResults,researchProgressInput,researchSources,researchSummary,report,researchedReport,memoryLedger,assistantCall,scriptedProviders,semanticApproval} from './fixtures/bhs-conversation.mjs';

const id='c'.repeat(64),now=()=>Date.parse('2026-11-20T14:00:00Z');
const menu=Array.from({length:700},()=>'* [Home](https://pet.example.com/)\n* [Products](https://pet.example.com/products)\n').join('');
async function seed(ledger,{sources=researchSources,summary=researchSummary()}={}){
 await ledger.once(conversationKeys.turn(id,0),{id},0,async()=>({sources,researchSummary:summary,researchOutcomeVersion,researchProgress:completeResearchProgress(),results:fixtureSourceResults(),toolIssues:[]}));
}
test('the actual homepage-only regression cannot enter final writing with a reason or a generic competitor paragraph',async()=>{
 const {ledger}=memoryLedger(),providers=scriptedProviders(ledger,[assistantCall('read_pages',{urls:[brief.website],purpose:'Markayı anla'}),
  assistantCall('begin_report',{reason:'Markayı anladım, rakipler sonra seçilebilir.'}),assistantCall('finish_bhs',report())]);
 await advanceConversation({brief,ledger,id,providers,now});
 for(let at=0;at<2;at++){
  const turn=await advanceConversation({brief,ledger,id,providers,now});
  assert.equal(turn.finishRequested,false);assert.equal(turn.toolIssues[0].code,'research_needed');assert.equal(turn.closed,undefined);
  assert.match(turn.results[0].content,/named_competitors_missing/);
 }
 assert.equal(providers.calls.at(-1).options.final,false);
});
test('market outcomes allow qualified inference but require outside research; a name without comparison is incomplete',()=>{
 const summary=researchSummary();assertSchema(summary,researchHandoffSchema);assert.deepEqual(researchOutcomeIssues(summary,researchSources,brief),[]);
 summary.market.customerBehavior.sourceIds=[];assert.deepEqual(researchOutcomeIssues(summary,researchSources,brief),[]);
 summary.competitors[0].comparison='';assert.ok(researchOutcomeIssues(summary,researchSources,brief).includes('competitor_comparison_missing'));
 const ownOnly=researchSummary();for(const row of Object.values(ownOnly.market))row.sourceIds=[source.id];
 assert.ok(researchOutcomeIssues(ownOnly,[source],brief).includes('market_research_missing'));
});
test('search snippets and menu-only bodies cannot satisfy market/competitor work or factual highlights',()=>{
 const unread=researchSources.map(row=>({...row,method:'search-snippet'}));assert.ok(researchOutcomeIssues(researchSummary(),unread,brief).length);
 const nav=researchSources.map(row=>({...row,text:menu}));assert.equal(sourceReadingStatus(nav[0]),'navigation_only');
 assert.ok(researchOutcomeIssues(researchSummary(),nav,brief).includes('market_research_missing'));
 assert.ok(validateConversationReport(report(),[nav[0]]).includes('unread_observation'));
 const shown=presentConversationSource(nav[0]);assert.equal(shown.text,'');assert.match(shown.instruction,/başarısı değildir/);
});
test('the source view finds the body behind a long menu while preserving original positions and the entire archive',async()=>{
 const text=menu+'\n# Kıtık açıcı bakım spreyi\n\n'+source.text;
 const view=presentConversationSource({...source,text},{purpose:'Kıtık açıcı ürün ve sipariş kanalı'});
 assert.equal(view.readingStatus,'body_available');assert.match(view.text,/Kıtık açıcı/);assert.ok(view.text.length<=sourceWindowCharacters);
 assert.ok(view.passages.some(row=>row.start>12000));assert.equal(view.archiveMoreAvailable,true);assert.equal(view.moreAvailable,false);
 for(const row of view.passages)assert.ok(view.text.includes(text.slice(row.start,row.end)));
 const {ledger}=memoryLedger(),providers=scriptedProviders(ledger,[assistantCall('read_pages',{urls:[source.url],purpose:'Ürün ve sipariş'}),
  assistantCall('read_pages',{urls:[source.url],purpose:'Farklı soru için kaynak'}),assistantCall('read_saved_source',{sourceId:source.id,offset:0})]);
 let reads=0;providers.extract=async()=>{reads++;return {results:[{...source,text}],failures:[]};};
 for(let at=0;at<3;at++)await advanceConversation({brief,ledger,id,providers,now});
 const state=await readConversation(ledger,id);assert.equal(reads,1);assert.equal(state.sources[0].text,text);
 const saved=JSON.parse(state.turns[2].results[0].content);assert.equal(saved.text,text.slice(0,12000));assert.equal(saved.nextOffset,12000);
 assert.equal((await persistConversationResult({brief,ledger,id,now})).conversationSources[0].text,text);
});
test('a relevant late passage is delivered instead of spending the entire input window on early unrelated body prose',()=>{
 const filler=Array.from({length:100},(_,at)=>`Tarihçe ${at}: Şirketin geçmişine ilişkin bu uzun paragraf araştırma sorusundan farklı bir konuyu açıklar.\n`).join('');
 const target='\nTüy bakım spreyinin uygulama videosu, ürün sayfasındaki doğrudan sipariş bağlantısıyla birlikte sunuluyor.\n';
 const view=presentConversationSource({...source,text:filler+target+filler},{purpose:'Tüy bakım spreyi uygulama videosu sipariş'});
 assert.match(view.text,/uygulama videosu/);assert.ok(view.text.length<=12000);assert.ok(view.passages.length>1);
 assert.equal(view.moreAvailable,true);assert.ok(Number.isSafeInteger(view.nextOffset));
});
test('a navigation-only read exposes observed subpage links so the same analyst can read the useful body next',async()=>{
 const url='https://pet.example.com/products',{ledger}=memoryLedger();
 const providers=scriptedProviders(ledger,[assistantCall('read_pages',{urls:[brief.website],purpose:'Ürünleri anla'}),assistantCall('read_pages',{urls:[url],purpose:'Ürün gövdesini oku'})]);
 providers.extract=async({urls})=>({results:urls.map(target=>({...source,url:target,text:target===brief.website?menu:source.text})),failures:[]});
 const nav=await advanceConversation({brief,ledger,id,providers,now});assert.ok(JSON.parse(nav.results[0].content).sources[0].links.includes(url));
 const next=await advanceConversation({brief,ledger,id,providers,now});assert.deepEqual(next.toolIssues,[]);
 assert.equal(JSON.parse(next.results[0].content).sources[0].readingStatus,'body_available');
});
test('a specialist body is archived in full but its raw result is not duplicated into the analyst observation',async()=>{
 const {ledger}=memoryLedger(),text=source.text+'\n'+source.text.repeat(150);
 await ledger.once(conversationKeys.turn(id,0),{},0,async()=>({sources:[{...source,text:menu}],readAttempts:[source.url],results:[],toolIssues:[]}));
 const providers=scriptedProviders(ledger,[assistantCall('specialist_read',{url:source.url,purpose:'Ürün ve sipariş',mode:'page',sampleSize:1})]);
 providers.specialist=async()=>({actor:'synthetic-reader',results:[{...source,text}]});
 const turn=await advanceConversation({brief,ledger,id,providers,now}),shown=JSON.parse(turn.results[0].content);
 assert.equal(shown.results,undefined);assert.ok(shown.sources[0].text.length<=12000);
 assert.equal((await readConversation(ledger,id)).sources[0].text,text);
});
test('the shared cap closes research, retains the useful whole report, and exposes missing work without buying another call',async()=>{
 const {ledger,total}=memoryLedger({charged:4100});await ledger.once(conversationKeys.turn(id,0),{},0,async()=>({sources:[source],results:[],toolIssues:[],researchOutcomeVersion}));
 let research=0;const providers={analystQuote:async(_,{final})=>({reservation:final?800:100,finalReservation:800}),
  analyst:async(_messages,options)=>options.review?assistantCall('review_bhs',semanticApproval(report())):assistantCall('finish_bhs',report()),search:async()=>{research++;throw Error('No new research');}};
 const draft=await advanceConversation({brief,ledger,id,providers,now});assert.equal(draft.closed,undefined);
 const turn=await advanceConversation({brief,ledger,id,providers,now});assert.equal(turn.closed,true);assert.equal(turn.reason,'research_incomplete');
 const saved=await persistConversationResult({brief,ledger,id,now}),audit=conversationAuditResult(brief,saved);
 assert.equal(audit.data.fullReport,report().reportMarkdown);assert.equal(audit.data.quality.contentComplete,false);assert.equal(audit.status,'ready');
 assert.equal(research,0);assert.ok(total()<=5000);
 const snapshot=createResearchSnapshot(audit.data,brief);assert.ok(snapshot);
 const reused=directAuditResult(brief,readResearchSnapshot(snapshot));assert.equal(reused.data.quality.contentComplete,false);
});
test('a final answer cannot silently drop the researched named competitor while claiming complete research',async()=>{
 const {ledger}=memoryLedger();await seed(ledger);
 const providers=scriptedProviders(ledger,[assistantCall('begin_report',researchSummary()),assistantCall('finish_bhs',report())]);
 await advanceConversation({brief,ledger,id,providers,now});await advanceConversation({brief,ledger,id,providers,now});await advanceConversation({brief,ledger,id,providers,now});
 const saved=await persistConversationResult({brief,ledger,id,now});assert.ok(saved.researchIssues.includes('researched_competitor_omitted'));
 assert.equal(conversationAuditResult(brief,saved).data.quality.contentComplete,false);assert.equal(saved.conversationReport.reportMarkdown,report().reportMarkdown);
});
test('a provider outage cannot bypass research status through a later writing-only recovery',async()=>{
 const {ledger}=memoryLedger();
 await ledger.once(conversationKeys.turn(id,0),{},0,async()=>({sources:[source],results:[],toolIssues:[]}));
 const failed=await advanceConversation({brief,ledger,id,now,providers:{analystQuote:async()=>{throw Object.assign(Error('Synthetic outage'),{code:'provider_error'});}}});
 assert.equal(failed.researchOutcomeVersion,researchOutcomeVersion);
 const restored=await repairConversationReport({brief,job:{researchRunId:'synthetic'},ledger,id,now,meter:async({run})=>run(),getProviders:()=>({
  analystQuote:async()=>({reservation:100,output:8000}),analyst:async(_messages,options)=>options.review?assistantCall('review_bhs',semanticApproval(report())):assistantCall('finish_bhs',report())})});
 assert.equal(restored.reason,'research_incomplete');assert.equal(conversationAuditResult(brief,restored).data.quality.contentComplete,false);
 assert.equal(restored.repair.newResearchCalls,0);assert.equal(restored.conversationReport.reportMarkdown,report().reportMarkdown);
});
test('complete research outcomes survive the same durable checkpoint into pricing with the full narrative intact',async()=>{
 const {ledger}=memoryLedger();await seed(ledger);
 const providers=scriptedProviders(ledger,[assistantCall('begin_report',researchSummary()),assistantCall('finish_bhs',researchedReport())]);
 await advanceConversation({brief,ledger,id,providers,now});await advanceConversation({brief,ledger,id,providers,now});await advanceConversation({brief,ledger,id,providers,now});
 const saved=await persistConversationResult({brief,ledger,id,now}),audit=conversationAuditResult(brief,saved);
 assert.equal(saved.researchOutcomeVersion,researchOutcomeVersion);assert.deepEqual(saved.researchSummary,researchSummary());
 assert.equal(audit.data.quality.contentComplete,true);assert.equal(audit.data.competitors[0].website,peerSource.url);
 assert.equal(audit.data.fullReport,researchedReport().reportMarkdown);
 const snapshot=createResearchSnapshot(audit.data,brief),reused=directAuditResult(brief,readResearchSnapshot(snapshot));
 assert.equal(reused.data.quality.contentComplete,true);assert.equal(reused.data.report.researchOutcomeVersion,researchOutcomeVersion);
});
