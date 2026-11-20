import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../src/budget/ledger.mjs';
import {sourceId,conversationKeys} from '../src/bhs/conversation-contract.mjs';
import {objectiveValidationVersion,sourceIdentityIssues} from '../src/bhs/conversation-objective.mjs';
import {ensureConversationContext,contextKey} from '../src/bhs/conversation-context.mjs';
import {validateConversationReport,conversationAuditResult} from '../src/bhs/conversation-report.mjs';
import {advanceConversation,persistConversationResult} from '../src/bhs/conversation-engine.mjs';
import {createConversationProviders} from '../src/bhs/conversation-providers.mjs';
import {semanticReviewVersion,applySemanticDecision} from '../src/bhs/conversation-semantic.mjs';
import {researchClosureVersion} from '../src/bhs/conversation-progress.mjs';
import {researchOutcomeVersion} from '../src/bhs/conversation-research.mjs';
import {createResearchSnapshot,readResearchSnapshot} from '../src/bhs/research-snapshot.mjs';
import {inspectConversationAcceptance} from '../src/bhs/conversation-acceptance.mjs';
import {assertResult} from '../src/contracts.mjs';
import {brief,source,researchSources,researchSummary,completeResearchProgress,fixtureSourceResults,memoryLedger,assistantCall,scriptedProviders,semanticApproval} from './fixtures/bhs-conversation.mjs';
import {strongNarrativeReport} from './fixtures/bhs-strong-narrative.mjs';

const id='e'.repeat(64),options={semantic:true,objective:true};
const check=(report=strongNarrativeReport(),sources=researchSources)=>validateConversationReport(report,sources,options);
const stored=()=>{const report=strongNarrativeReport();return {conversationReport:report,conversationSources:researchSources,objectiveValidationVersion,
 semanticReview:applySemanticDecision(report,semanticApproval(report),{sources:researchSources}).review,
 researchOutcomeVersion,researchSummary:researchSummary(),researchClosure:{version:researchClosureVersion,progress:completeResearchProgress(),issues:[]}};};
async function seed(ledger){await ledger.once(conversationKeys.turn(id,0),{},0,async()=>({sources:researchSources,researchSummary:researchSummary(),
 researchProgress:completeResearchProgress(),results:fixtureSourceResults(),toolIssues:[],semanticReviewVersion,objectiveValidationVersion}));}

test('objective validation accepts strong prose and equivalent section names without assessing meaning through keywords',()=>{
 const report=strongNarrativeReport();report.reportMarkdown=report.reportMarkdown.replaceAll('SWOT','İç ve dış koşullar').replaceAll('Güçlü yönler','Avantajlar');
 assert.deepEqual(check(report),[]);
});
test('source identity cannot borrow another URL, duplicate a used identifier, or mutate the original read body',()=>{
 const report=strongNarrativeReport();
 for(const changed of [
  [...researchSources.map(row=>row===source?{...row,url:'https://different.example/'}:row)],
  [...researchSources,{...source}],
  researchSources.map(row=>row===source?{...row,contentDigest:hash(row.text),text:row.text+' Changed body.'}:row)
 ])assert.ok(check(report,changed).some(code=>/source_(?:identity|content)|duplicate_source/u.test(code)));
});
test('discovery-only, metadata-title and navigation quotations cannot support narrative facts',()=>{
 const report=strongNarrativeReport();
 const snippets=researchSources.map(row=>row===source?{...row,method:'search-snippet'}:row);
 assert.ok(check(report,snippets).includes('unread_report_citation'));
 const title=structuredClone(report);title.sourceQuotes[0].quote=source.title;
 assert.ok(check(title).includes('quote_not_read_body'));
 const menu=researchSources.map(row=>row===source?{...row,text:'Home\nProducts\nContact'}:row);
 assert.ok(check(report,menu).includes('quote_not_read_body'));
});
test('malformed source tokens and a valid ID linked to a different URL cannot evade objective checks',()=>{
 for(const citation of ['[S123]','[S1234567Z]','[S1234567890]',`[${source.id}](https://wrong.example/)`]){
  const report=strongNarrativeReport();report.reportMarkdown+='\nA source-backed statement. '+citation;
  assert.ok(check(report).some(code=>['unknown_citation','citation_url_mismatch'].includes(code)));
 }
});
test('empty leaf headings fail while useful children and prose-only reports remain valid',()=>{
 const report=strongNarrativeReport();report.reportMarkdown+='\n## Empty heading\n';assert.ok(check(report).includes('empty_report_section'));
 report.reportMarkdown+='### Child\nThis is a concrete analytical explanation.';assert.ok(!check(report).includes('empty_report_section'));
 report.reportMarkdown=report.reportMarkdown.replace(/^#{1,6} .*$/gmu,'');assert.ok(!check(report).includes('empty_report_section'));
});
test('compatibility records require measurements and named, reasoned competitors without narrative substring gates',()=>{
 const report=strongNarrativeReport();report.highlights[0].measurement='';report.competitors[0].reason='';
 assert.ok(check(report).includes('incomplete_highlight'));assert.ok(check(report).includes('incomplete_competitor'));
});
test('new saved-offer passage captures bind their text while preserving original source identities and report bytes',()=>{
 const input=stored(),audit=conversationAuditResult(brief,input);assert.equal(audit.data.quality.contentComplete,true);
 assertResult('audit',audit);
 assert.ok(audit.data.conversationSources.every(row=>row.capture?.kind==='verified-passages'&&!sourceIdentityIssues(row).length));
 const snapshot=createResearchSnapshot(audit.data,brief),read=readResearchSnapshot(snapshot);
 assert.equal(read.report.conversation.reportMarkdown,input.conversationReport.reportMarkdown);
 const tampered=structuredClone(audit.data);tampered.report.conversationSources[0].text+=' Added invented quote.';
 assert.equal(createResearchSnapshot(tampered,brief),null);
 assert.throws(()=>assertResult('audit',{...audit,data:tampered}),/doğrulanamadı/u);
});
test('a conversation binds its full brief to one existing capped account; neither a changed brief nor account can dispatch a model',async()=>{
 const {ledger,total}=memoryLedger();await ensureConversationContext({brief,ledger,id});const before=total();
 const providers={analystQuote:()=>assert.fail('No model or token-count request is authorized')};
 await assert.rejects(()=>advanceConversation({brief:{...brief,goals:'A different market'},ledger,id,providers}),{code:'budget_context'});
 const other={...ledger,status:async()=>({...await ledger.status(),id:'different-account'})};
 await assert.rejects(()=>advanceConversation({brief,ledger:other,id,providers}),{code:'budget_context'});
 assert.equal(total(),before);assert.equal((await ledger.get(contextKey(id))).value.briefDigest,hash(brief));
});
test('an interrupted free context checkpoint recovers without replacing or refunding its first record',async()=>{
 const {ledger,rows,total}=memoryLedger();try{await ledger.once(contextKey(id),{},0,async()=>{throw Error('Lost free write');});}catch{}
 const before=structuredClone(rows.get(contextKey(id))),context=await ensureConversationContext({brief,ledger,id});
 assert.equal(context.budgetId,(await ledger.status()).id);assert.deepEqual(rows.get(contextKey(id)),before);assert.equal(total(),500);
 assert.equal((await ledger.get(contextKey(id)+':recovered')).state,'complete');
});
test('reconnect retains progress, candidates, the full draft and its account without another provider dispatch or fresh budget',async()=>{
 const {ledger,total}=memoryLedger();await seed(ledger);const providers=scriptedProviders(ledger,[assistantCall('begin_report',researchSummary()),assistantCall('finish_bhs',strongNarrativeReport())]);
 for(let at=0;at<3;at++)await advanceConversation({brief,ledger,id,providers});
 const one=await persistConversationResult({brief,ledger,id}),before=total();
 const two=await persistConversationResult({brief,ledger,id});await advanceConversation({brief,ledger,id,providers});
 assert.deepEqual(two,one);assert.equal(total(),before);assert.equal(providers.calls.length,3);
 assert.deepEqual(one.researchClosure.progress,completeResearchProgress());assert.equal(one.conversationContext.budgetId,(await ledger.status()).id);
});
test('Gemini fallback sees every prior tool observation and unresolved decision in the same frozen context',async()=>{
 const {ledger}=memoryLedger();await seed(ledger);let fallback;
 const providers={analystQuote:async()=>{throw Object.assign(Error('Outage'),{code:'provider_error'});},fallbackReport:async input=>{fallback=input;return {data:strongNarrativeReport()};}};
 await advanceConversation({brief,ledger,id,providers});
 assert.ok(JSON.stringify(fallback.conversation).includes(source.text));assert.ok(JSON.stringify(fallback.conversation).includes(brief.meetingNotes));
 assert.deepEqual(fallback.researchProgress,completeResearchProgress());assert.deepEqual(fallback.researchSummary,researchSummary());
 assert.deepEqual((await ledger.get('audit:conversation:request:'+id+':1:fallback')).value,fallback);
});
test('adding full fallback context cannot repurchase completed or uncertain legacy Gemini work',async()=>{
 for(const uncertain of [false,true]){
  const {ledger,total}=memoryLedger();let generated=0;
  const config={ledger,geminiKey:'synthetic',researchFx:async()=>({usdTry:40}),fetchImpl:async(url)=>{
   if(String(url).endsWith(':countTokens'))return new Response(JSON.stringify({totalTokens:100}));
   generated++;if(uncertain)throw Error('Lost paid reply');
   return new Response(JSON.stringify({modelVersion:'gemini-3.8-flash',usageMetadata:{promptTokenCount:100,candidatesTokenCount:100},candidates:[{content:{parts:[{text:JSON.stringify(strongNarrativeReport())}]}}]}));
  }};
  const legacy={brief,sources:researchSources,previous:[]};let original;
  try{original=await createConversationProviders(config).fallbackReport(legacy);}catch(error){assert.equal(uncertain,true);}
  const before=total(),next=createConversationProviders({...config,fetchImpl:()=>assert.fail('No repeated network dispatch')});
  const request={...legacy,conversation:[{role:'user',content:'Full retained observations'}],researchProgress:completeResearchProgress()};
  if(uncertain)await assert.rejects(()=>next.fallbackReport(request),error=>['budget_uncertain','provider_timeout'].includes(error.code));else assert.deepEqual(await next.fallbackReport(request),original);
  assert.equal(generated,1);assert.equal(total(),before);
 }
});
test('offline acceptance checks real retained payloads mechanically but always leaves business quality to the user',async()=>{
 const {ledger}=memoryLedger(),input=stored();input.conversationContext=await ensureConversationContext({brief,ledger,id});
 const before=structuredClone(input),result=inspectConversationAcceptance({brief,stored:input,cost:await ledger.status(),reference:strongNarrativeReport()});
 assert.equal(result.status,'technical_pass_human_pending');assert.equal(result.humanAcceptance.status,'pending');assert.equal(result.reference.available,true);
 assert.equal(result.paidCalls,0);assert.equal(result.productionWrites,0);assert.equal(result.report.readSources,4);assert.deepEqual(input,before);
 const bad=inspectConversationAcceptance({brief,stored:input,cost:{id:'different-account',capKurus:5000,chargedKurus:5001}});
 assert.ok(bad.issues.includes('acceptance_cost_unverified'));assert.ok(bad.issues.includes('acceptance_account_unverified'));
});
