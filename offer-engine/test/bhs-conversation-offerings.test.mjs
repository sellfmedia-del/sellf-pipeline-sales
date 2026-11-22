import test from 'node:test';
import assert from 'node:assert/strict';
import {offeringAnalysisVersion,offeringOutcomeVersion,offeringHandoffSchema,conversationToolsFor,outcomeOptions} from '../src/bhs/conversation-offerings.mjs';
import {researchOutcomeIssues,researchReportIssues,researchOutcomeVersion} from '../src/bhs/conversation-research.mjs';
import {conversationTools,conversationKeys,conversationVersion} from '../src/bhs/conversation-contract.mjs';
import {advanceConversation,persistConversationResult,readConversation,conversationMessages} from '../src/bhs/conversation-engine.mjs';
import {conversationAuditResult} from '../src/bhs/conversation-report.mjs';
import {createConversationProviders,conversationModels} from '../src/bhs/conversation-providers.mjs';
import {repairConversationReport} from '../src/bhs/conversation-repair.mjs';
import {memoryLedger,assistantCall,scriptedProviders} from './fixtures/bhs-conversation.mjs';
import {brief,sources,pro,home,proPeer,homePeer,progress,summary,report,views} from './fixtures/bhs-offerings.mjs';

const version={analysisVersion:offeringAnalysisVersion},id='synthetic-product-competition',now=()=>Date.parse('2026-11-22T12:00:00Z');
const issues=(value=summary(),rows=sources,p=progress())=>researchOutcomeIssues(value,rows,brief,{progress:p,...version});
async function seed(ledger,{handoff,policy=true,turnMetadata={}}={}){
 if(policy)await ledger.once(conversationKeys.policy(id),{id},0,async()=>({engine:conversationVersion,...version}));
 await ledger.once(conversationKeys.turn(id,0),{},0,async()=>({index:0,version:conversationVersion,...(policy?version:{}),sources,researchProgress:progress(),results:views(),toolIssues:[],...(handoff?{researchSummary:handoff,finishRequested:true}:{}),...turnMetadata}));
}
test('chosen dual product/buyer/channel groups require their own read product and actual alternative; private margins stay client questions',()=>{
 assert.deepEqual(issues(),[]);assert.ok(progress().questions.some(q=>q.access==='client'&&q.status==='open'));
 const value=summary();value.competitors.forEach(row=>row.name='Same rival brand');assert.deepEqual(issues(value),[]);
});
test('a list of product names cannot replace actual selected product analysis',()=>{
 const value=summary();delete value.offerings;delete value.offeringScope;
 assert.ok(issues(value).includes('offering_scope_missing'));
 const listed=summary();listed.offerings[0].products[0].analysis='';assert.ok(issues(listed).includes('offering_product_unread'));
});
test('a downloaded or snippet-only own product cannot become reviewed product evidence',()=>{
 assert.ok(issues(summary(),sources.map(row=>row.id===pro.id?{...row,method:'search-snippet'}:row)).includes('offering_product_unread'));
 const p=progress();p.proofs=p.proofs.filter(row=>row.sourceId!==home.id);assert.ok(issues(summary(),sources,p).includes('offering_product_unread'));
 const value=summary();value.offerings[0].products[0].url=brief.website;assert.ok(issues(value).includes('offering_product_unread'));
});
test('product and competitor proof must answer the actual selected public question rather than an unrelated approved page',()=>{
 const value=summary();value.offerings[0].productQuestionId='margin';assert.ok(issues(value).includes('offering_product_question_open'));
 const p=progress();p.proofs.find(row=>row.sourceId===proPeer.id).questionId='market';assert.ok(issues(summary(),sources,p).includes('competitor_product_unread'));
});
test('a sector-level rival name or the other segment cannot close an uninvestigated buyer group',()=>{
 const value=summary();value.competitors=value.competitors.filter(row=>row.offeringId==='pro');assert.ok(issues(value).includes('offering_competition_missing'));
 value.competitors[0].offeringId='unknown';assert.ok(issues(value).includes('competitor_offering_unknown'));
 const candidate=summary();candidate.competitors[0].alternativeUrl='https://peer.example.com/';assert.ok(issues(candidate).includes('competitor_product_unread'));
 assert.ok(issues(summary(),sources.map(row=>row.id===homePeer.id?{...row,method:'search-snippet'}:row)).includes('competitor_product_unread'));
});
test('an honestly unavailable alternative remains an explicit partial group, never a fabricated peer quota',()=>{
 const value=summary();value.competitors=value.competitors.filter(row=>row.offeringId!=='home');
 const p=progress();Object.assign(p.questions.find(row=>row.id==='home_peer'),{status:'unavailable',rationale:'Sentetik denemede gövde erişimi yok.'});
 assert.ok(issues(value,sources,p).includes('offering_competition_unavailable'));
});
test('one selected service/product group with one relevant peer is sufficient without a fixed buyer or competitor quota',()=>{
 const value=summary();value.offerings=value.offerings.slice(0,1);value.competitors=value.competitors.slice(0,1);
 value.offeringScope='Bu farklı brief yalnız kuruluşların seçili çözümüne odaklanır.';assert.deepEqual(issues(value),[]);
});
test('the final named comparison must retain the actual alternative page rather than citing only our own product',()=>{
 const draft=report();draft.competitors[0].sourceIds=[pro.id];
 assert.ok(researchReportIssues(draft,summary(),sources,brief,{progress:progress(),...version}).includes('researched_alternative_omitted'));
});
test('legacy handoffs, native tool schemas and completed old policies are not retroactively given new requirements',async()=>{
 const value=summary();delete value.offerings;delete value.offeringScope;
 value.competitors=value.competitors.map(({offeringId,alternativeName,alternativeUrl,...row})=>row);
 assert.deepEqual(researchOutcomeIssues(value,sources,brief,{progress:progress()}),[]);
 assert.deepEqual(conversationToolsFor(),conversationTools);assert.deepEqual(outcomeOptions('outcomes-v1',progress()),{});
 const {ledger}=memoryLedger();await seed(ledger,{handoff:value,policy:false});
 const state=await readConversation(ledger,id);assert.equal(state.analysisVersion,undefined);
 assert.doesNotMatch(conversationMessages(brief,state)[0].content,/ÜRÜN VE ALTERNATİF ANALİZİ/);
 assert.equal(researchOutcomeVersion,'adjudicated-market-competition-outcomes-v2');
});
test('native token counting and generation use the same new schema and preserve old frozen quotes and receipts',async()=>{
 const {ledger}=memoryLedger(),requests=[];
 const provider=createConversationProviders({ledger,anthropicKey:'synthetic',geminiKey:null,tavilyKey:null,apifyToken:null,
 researchFx:async()=>({usdTry:50,publishedAt:'2026-11-22'}),fetchImpl:async(url,init)=>{
  const body=JSON.parse(init.body);requests.push({url,body});
  return new Response(JSON.stringify(url.endsWith('count_tokens')?{input_tokens:1000}:{model:conversationModels.analyst,content:[],stop_reason:'end_turn',usage:{input_tokens:1000,output_tokens:100}}),{headers:{'content-type':'application/json'}});
 }});
 const messages=[{role:'user',content:'Sentetik ürün ve gerçek alternatif soruları.'}],quote=await provider.analystQuote(messages,version);
 await provider.analyst(messages,{quote,receiptKey:'model:new'});
 assert.equal(quote.analysisVersion,offeringAnalysisVersion);assert.deepEqual(requests[0].body.tools,requests[1].body.tools);
 assert.deepEqual(requests[0].body.tools.find(t=>t.name==='begin_report').input_schema,offeringHandoffSchema);
 const oldQuote=await provider.analystQuote(messages);await provider.analyst(messages,{quote:oldQuote,...version,receiptKey:'model:old'});
 assert.deepEqual(requests[2].body.tools,requests[3].body.tools);
 assert.deepEqual(requests[2].body.tools.find(t=>t.name==='begin_report').input_schema,conversationTools.find(t=>t.name==='begin_report').input_schema);
 const count=requests.length;await provider.analyst(messages,{quote,...version,receiptKey:'model:new'});assert.equal(requests.length,count);
});
test('unknown or changed policy versions stop before counting instead of silently downgrading the new contract',async()=>{
 const {ledger}=memoryLedger();await ledger.once(conversationKeys.policy(id),{},0,async()=>({engine:conversationVersion,analysisVersion:'unknown'}));
 await assert.rejects(readConversation(ledger,id),e=>e.code==='budget_context');
 let calls=0;const provider=createConversationProviders({ledger,anthropicKey:'synthetic',fetchImpl:()=>{calls++;assert.fail('No HTTP');}});
 await assert.rejects(provider.analystQuote([],{analysisVersion:'unknown'}),e=>e.code==='budget_context');assert.equal(calls,0);
});
test('an uncertain new native request stays owned without recount, generation replay or a new budget',async()=>{
 const {ledger,total}=memoryLedger();let calls=0;
 const provider=createConversationProviders({ledger,anthropicKey:'synthetic',researchFx:async()=>({usdTry:50}),fetchImpl:async(url)=>{
  calls++;if(url.endsWith('count_tokens'))return new Response(JSON.stringify({input_tokens:1000}));throw Error('Synthetic uncertain transport');
 }});
 const messages=[{role:'user',content:'Seçili ürün ve alternatif bağlamı.'}],quote=await provider.analystQuote(messages,version);
 await assert.rejects(provider.analyst(messages,{quote,receiptKey:'model:offering-uncertain'}),e=>e.code==='provider_timeout');
 const charged=total(),count=calls;await assert.rejects(provider.analyst(messages,{quote,receiptKey:'model:offering-uncertain'}),e=>['budget_uncertain','provider_timeout'].includes(e.code));
 assert.equal(calls,count);assert.equal(total(),charged);assert.ok(total()<=5000);
});
test('incomplete product handoff retains valid market results and returns to the same natural conversation before writing',async()=>{
 const originals=structuredClone(sources);
 const {ledger,total}=memoryLedger();await seed(ledger);
 const incomplete=summary();incomplete.offerings[0].products=[];
 const draft=report(),providers=scriptedProviders(ledger,[assistantCall('begin_report',incomplete),assistantCall('begin_report',summary()),assistantCall('finish_bhs',draft)]);
 const first=await advanceConversation({brief,ledger,id,providers,now});
 assert.ok(first.toolIssues.some(row=>row.code==='research_needed'));assert.deepEqual(first.researchSummary.market,incomplete.market);
 assert.equal(first.reportDraft,undefined);
 for(let at=0;at<3;at++)await advanceConversation({brief,ledger,id,providers,now});
 const saved=await persistConversationResult({brief,ledger,id,now}),audit=conversationAuditResult(brief,saved);
 assert.equal(saved.researchOutcomeVersion,offeringOutcomeVersion);assert.equal(saved.researchSummary.offerings.length,2);
 assert.equal(audit.data.quality.contentComplete,true,JSON.stringify(audit.data.quality.issues));
 assert.equal(audit.data.fullReport,draft.reportMarkdown);assert.ok(total()<=5000);
 const context=JSON.stringify(providers.calls.at(-1).messages);assert.ok(context.includes(brief.goals));assert.ok(context.includes(pro.text));assert.ok(context.includes(homePeer.text));assert.match(context,/ÜRÜN VE ALTERNATİF ANALİZİ/);
 assert.deepEqual(sources,originals);
});
test('hard closure preserves the useful full report with missing product scope explicitly partial and no extra research',async()=>{
 const {ledger}=memoryLedger();await seed(ledger);const draft=report(),providers=scriptedProviders(ledger,[assistantCall('finish_bhs',draft)]);
 providers.search=()=>assert.fail('No forced research');providers.extract=()=>assert.fail('No forced research');
 for(let at=0;at<2;at++)await advanceConversation({brief,ledger,id,providers,now,deadline:now()+10000});
 const saved=await persistConversationResult({brief,ledger,id,now}),audit=conversationAuditResult(brief,saved);
 assert.equal(audit.status,'ready');assert.equal(audit.data.quality.contentComplete,false);assert.equal(audit.data.fullReport,draft.reportMarkdown);
 assert.ok(saved.researchIssues.includes('offering_scope_missing'));assert.equal(saved.researchOutcomeVersion,offeringOutcomeVersion);
});
test('malformed offering and peer records return scoped issues instead of crashing the current conversation',()=>{
 for(const change of [value=>value.offerings=[null],value=>value.competitors=[null],value=>value.offerings[0].products=[null],value=>value.offerings[0].products[0].sourceIds=null]){
  const value=summary();change(value);assert.ok(issues(value).length);
 }
});
test('saved verified passages retain the chosen product/alternative outcomes and cannot be relabelled as the legacy contract',async()=>{
 const {ledger}=memoryLedger();await seed(ledger,{handoff:summary()});
 const draft=report(),providers=scriptedProviders(ledger,[assistantCall('finish_bhs',draft)]);
 for(let at=0;at<2;at++)await advanceConversation({brief,ledger,id,providers,now});
 const saved=await persistConversationResult({brief,ledger,id,now}),audit=conversationAuditResult(brief,saved);
 const reused=conversationAuditResult(brief,{report:audit.data.report});
 assert.equal(reused.data.quality.contentComplete,true,JSON.stringify(reused.data.quality.issues));
 assert.equal(reused.data.fullReport,draft.reportMarkdown);assert.equal(reused.data.researchOutcomeVersion,offeringOutcomeVersion);
 const incomplete=structuredClone(audit.data.report);incomplete.researchSummary.offerings=[];
 assert.equal(conversationAuditResult(brief,{report:incomplete}).data.quality.contentComplete,false);
});
test('new writing-only recovery retains the versioned product context and whole draft without research or reconnect replay',async()=>{
 const {ledger}=memoryLedger();await seed(ledger,{handoff:summary(),turnMetadata:{researchOutcomeVersion:offeringOutcomeVersion,semanticReviewVersion:'same-conversation-targeted-review-v1',researchClosureVersion:'read-source-coverage-and-public-gaps-v1',objectiveValidationVersion:'source-identity-and-report-structure-v1'}});
 const providers=scriptedProviders(ledger,[assistantCall('finish_bhs',report())]),quotes=[];
 const quote=providers.analystQuote;providers.analystQuote=(messages,options)=>{quotes.push(options);return quote(messages,options);};
 providers.search=()=>assert.fail('No recovery research');providers.extract=()=>assert.fail('No recovery research');
 const options={brief,ledger,id,job:{researchRunId:'synthetic-run'},now,getProviders:()=>providers,meter:({run})=>run()};
 const recovered=await repairConversationReport(options);assert.equal(recovered.researchOutcomeVersion,offeringOutcomeVersion);
 assert.equal(recovered.conversationReport.reportMarkdown,report().reportMarkdown);assert.equal(conversationAuditResult(brief,recovered).data.quality.contentComplete,true,JSON.stringify(recovered));
 assert.ok(quotes.every(row=>row.analysisVersion===offeringAnalysisVersion));const count=providers.calls.length;
 await repairConversationReport(options);assert.equal(providers.calls.length,count);
});
