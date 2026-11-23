import test from 'node:test';
import assert from 'node:assert/strict';
import {marketAnalysisVersion,marketOutcomeVersion} from '../src/bhs/conversation-market.mjs';
import {offeringAnalysisVersion,marketHandoffSchema,conversationToolsFor,outcomeOptions} from '../src/bhs/conversation-offerings.mjs';
import {researchOutcomeIssues,researchCompletionIssues,researchReportIssues,researchOutcomeStatus} from '../src/bhs/conversation-research.mjs';
import {conversationQuote,modelReservation,createConversationProviders,conversationModels} from '../src/bhs/conversation-providers.mjs';
import {conversationMessages,advanceConversation,readConversation,persistConversationResult} from '../src/bhs/conversation-engine.mjs';
import {compactBudgetText} from '../src/bhs/conversation-budget.mjs';
import {conversationKeys,conversationVersion} from '../src/bhs/conversation-contract.mjs';
import {conversationAuditResult} from '../src/bhs/conversation-report.mjs';
import {semanticReviewInstruction} from '../src/bhs/conversation-semantic.mjs';
import {repairConversationReport} from '../src/bhs/conversation-repair.mjs';
import {memoryLedger,assistantCall,scriptedProviders} from './fixtures/bhs-conversation.mjs';
import {brief,sources,market,progress,progressInput,summary,report,views} from './fixtures/bhs-offerings.mjs';

const id='synthetic-market-budget',version={analysisVersion:marketAnalysisVersion},now=()=>Date.parse('2026-11-23T00:00:00Z');
const marketSummary=()=>({...summary(),marketScope:'Seçili ülkedeki kurumsal teklif ve bireysel sipariş süreçleri ayrı kararlarla değerlendirildi.',
 marketDecisions:[{offeringIds:['pro','home'],questionIds:['market'],
  analysis:'Kuruluşlarda kurulum ve destek, bireylerde kullanım ve sipariş yolu seçili dış kaynakta karşılaştırılıyor. Bu kaynaktan pazar hacmi veya gerçekleşmiş fiyat esnekliği çıkarılamaz.',
  implication:'Teklif sürecinde kurulum/destek koşullarını; bireysel siparişte kullanım anlatımını ayrı pilotla değerlendir. Kanal kârlılığı müşteriden alınacak iç veridir.',sourceIds:[market.id]}]});
const issues=(value=marketSummary(),rows=sources,p=progress())=>researchOutcomeIssues(value,rows,brief,{progress:p,...version});
async function seed(ledger,{handoff,progressValue=progress(),extra={}}={}){
 await ledger.once(conversationKeys.policy(id),{},0,async()=>({engine:conversationVersion,...version}));
 await ledger.once(conversationKeys.turn(id,0),{},0,async()=>({...version,sources,researchProgress:progressValue,results:views(),toolIssues:[],
  ...(handoff?{researchSummary:handoff,finishRequested:true}:{}),...extra}));
}
const reply=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const providerConfig=(ledger,fetchImpl)=>({ledger,fetchImpl,anthropicKey:'synthetic',geminiKey:null,tavilyKey:null,apifyToken:null,
 researchFx:async()=>({usdTry:50}),navigationReader:async()=>({status:'unavailable',links:[]})});

test('selected market decisions bind real public questions and external read bodies without a fixed segment or metric quota',()=>{
 assert.deepEqual(issues(),[]);
 const value=marketSummary();value.offerings=value.offerings.slice(0,1);value.competitors=value.competitors.slice(0,1);
 value.marketDecisions[0].offeringIds=['pro'];assert.deepEqual(issues(value),[]);
 assert.ok(progress().questions.some(q=>q.access==='client'&&q.status==='open'));
});
test('a repeated channel list and general market paragraphs do not close missing selected market decisions',()=>{
 assert.ok(issues(summary()).includes('market_decision_scope_missing'));
 const value=marketSummary();value.marketDecisions[0].offeringIds=['pro'];assert.ok(issues(value).includes('market_offering_missing'));
 value.marketDecisions[0].offeringIds=['imaginary'];assert.ok(issues(value).includes('market_offering_unknown'));
});
test('malformed market handoffs remain incomplete and expose feedback instead of crashing status or discarding prior results',()=>{
 for(const change of [{offerings:{}},{marketDecisions:'invalid'},{marketDecisions:[null]},{marketDecisions:[{}]}]){
  const value={...marketSummary(),...change};assert.ok(issues(value).length);
  assert.ok(researchOutcomeStatus(value,sources,brief,progress(),marketAnalysisVersion).issues.length);
 }
});
test('wrong questions, own-only bodies and snippets cannot become external market decision evidence',()=>{
 for(const questionId of ['margin','unknown']){const value=marketSummary();value.marketDecisions[0].questionIds=[questionId];assert.ok(issues(value).includes('market_question_missing'));}
 const value=marketSummary();value.marketDecisions[0].questionIds=['pro'];value.marketDecisions[0].sourceIds=[sources[0].id];
 assert.ok(issues(value).includes('market_decision_unread'));
 assert.ok(issues(marketSummary(),sources.map(row=>row.id===market.id?{...row,method:'search-snippet'}:row)).includes('market_decision_unread'));
 const p=progress();p.proofs.find(row=>row.sourceId===market.id).questionId='pro';assert.ok(issues(marketSummary(),sources,p).includes('market_decision_unread'));
});
test('an open public market question keeps research open and retains valid product and competitor results',async()=>{
 const {ledger}=memoryLedger(),p=progress();p.questions.find(q=>q.id==='market').status='open';await seed(ledger,{progressValue:p});
 const providers=scriptedProviders(ledger,[assistantCall('begin_report',marketSummary())]);
 const turn=await advanceConversation({brief,ledger,id,providers,now});
 assert.equal(turn.finishRequested,false);assert.equal(turn.toolIssues[0].code,'research_needed');
 assert.ok(issues(marketSummary(),sources,p).includes('market_question_open'));
 assert.deepEqual((await readConversation(ledger,id)).researchSummary,marketSummary());
});
test('actually unavailable market work allows honest partial delivery without a replacement quota or another research budget',async()=>{
 const {ledger,total}=memoryLedger(),p=progress(),value=marketSummary();
 Object.assign(p.questions.find(q=>q.id==='market'),{status:'unavailable',answer:'',sourceIds:[],attemptedUrls:[market.url],rationale:'Sentetik kaynak erişimi başarısız.'});
 value.marketDecisions[0].sourceIds=[];value.marketDecisions[0].analysis='Satın alma süreci doğrulanamadı; kesin sonuç yerine sınırlı analiz korunuyor.';
 assert.ok(issues(value,sources,p).includes('market_question_unavailable'));
 assert.deepEqual(researchCompletionIssues(value,sources,brief,{progress:p,...version}),[]);
 await seed(ledger,{progressValue:p,extra:{readAttempts:[market.url]}});
 const draft=report(),providers=scriptedProviders(ledger,[assistantCall('begin_report',value),assistantCall('finish_bhs',draft)]);
 providers.search=()=>assert.fail('No new search');providers.extract=()=>assert.fail('No new extraction');
 for(let n=0;n<3;n++)await advanceConversation({brief,ledger,id,providers,now});
 const saved=await persistConversationResult({brief,ledger,id,now}),audit=conversationAuditResult(brief,saved);
 assert.equal(saved.researchOutcomeVersion,marketOutcomeVersion);assert.equal(audit.data.fullReport,draft.reportMarkdown);
 assert.equal(audit.data.quality.contentComplete,false);assert.ok(total()<=5000);
});
test('market evidence remains in the final report while meaning stays an explicit same-analyst review responsibility',()=>{
 assert.deepEqual(researchReportIssues(report(),marketSummary(),sources,brief,{progress:progress(),...version}),[]);
 const draft=report();draft.reportMarkdown=draft.reportMarkdown.replaceAll('['+market.id+']','');
 assert.ok(researchReportIssues(draft,marketSummary(),sources,brief,{progress:progress(),...version}).includes('researched_market_source_omitted'));
 assert.match(semanticReviewInstruction(report(),0,version),/gerçek satın alma süreci/);
});
test('new market count and generation schemas match and old frozen schema still owns replay',async()=>{
 const {ledger}=memoryLedger(),requests=[];
 const providers=createConversationProviders(providerConfig(ledger,async(url,init)=>{const body=JSON.parse(init.body);requests.push({url,body});
  return reply(url.endsWith('count_tokens')?{input_tokens:1000}:{model:conversationModels.analyst,content:[],stop_reason:'end_turn',usage:{input_tokens:1000,output_tokens:10}});
 }));
 const messages=[{role:'user',content:'Sentetik pazar bağlamı'}],quote=await providers.analystQuote(messages,version);
 await providers.analyst(messages,{quote,receiptKey:'model:market'});
 assert.deepEqual(requests[0].body.tools,requests[1].body.tools);
 assert.deepEqual(requests[1].body.tools.find(row=>row.name==='begin_report').input_schema,marketHandoffSchema);
 const old=await providers.analystQuote(messages,{analysisVersion:offeringAnalysisVersion});
 await providers.analyst(messages,{quote:old,...version,receiptKey:'model:old-offering'});
 assert.deepEqual(requests[2].body.tools,requests[3].body.tools);assert.notDeepEqual(requests[1].body.tools,requests[3].body.tools);
 const count=requests.length;await providers.analyst(messages,{quote,...version,receiptKey:'model:market'});assert.equal(requests.length,count);
 assert.deepEqual(outcomeOptions(marketOutcomeVersion,progress()),{progress:progress(),...version});
 assert.notDeepEqual(conversationToolsFor(offeringAnalysisVersion),conversationToolsFor(marketAnalysisVersion));
});
test('historical policies keep their old market and native contracts with no retroactive migration',()=>{
 assert.deepEqual(researchOutcomeIssues(summary(),sources,brief,{progress:progress(),analysisVersion:offeringAnalysisVersion}),[]);
 const oldBudget='Sistem bütçe bilgisi: '+JSON.stringify({research:{questions:progressInput().questions},outcomes:{retained:{market:['channels']}},committedKurus:1175});
 assert.equal(compactBudgetText(oldBudget,offeringAnalysisVersion),oldBudget);
 assert.equal(compactBudgetText('Unknown non-JSON context',marketAnalysisVersion),'Unknown non-JSON context');
});
test('only repeated derived status is compacted; the full brief, every question/source observation and signed thinking stay intact',()=>{
 const opaque={type:'thinking',thinking:'Synthetic retained reasoning',signature:'synthetic-signature'},call=assistantCall('review_research',progressInput()).content[0];
 const budgetText='Sistem bütçe bilgisi: '+JSON.stringify({committedKurus:1175,capKurus:5000,finalReportReserveKurus:2900,currentTurnOutputTokens:1800,
  research:{questions:progressInput().questions},outcomes:{retained:marketSummary()},instruction:'Keep this historical decision instruction.'});
 const state={turns:[{budgetText,assistant:{role:'assistant',content:[opaque,call]},results:views()}],sources,researchProgress:progress(),researchSummary:marketSummary(),...version};
 const messages=conversationMessages(brief,state),serialized=JSON.stringify(messages);
 assert.ok(messages.some(m=>Array.isArray(m.content)&&m.content.some(block=>JSON.stringify(block)===JSON.stringify(opaque))));
 assert.ok(messages.some(m=>Array.isArray(m.content)&&m.content.some(block=>JSON.stringify(block)===JSON.stringify(call))));
 assert.ok(messages.some(m=>Array.isArray(m.content)&&m.content.some(block=>block.content===views()[0].content)));
 assert.match(serialized,/Keep this historical decision instruction/);assert.match(serialized,/1175/);assert.match(serialized,/2900/);
 assert.match(serialized,/Mevcut yazılım partneri korunmalı/);assert.match(serialized,/PAZARDA SATIN ALMA KARARI/);
 assert.ok(serialized.length<JSON.stringify(conversationMessages(brief,{...state,analysisVersion:offeringAnalysisVersion})).length);
});
test('a narrower research decision is attempted before early writing while report, review, next read and worker reserves stay funded',()=>{
 const old=conversationQuote(20000,{availableKurus:3770,analysisVersion:offeringAnalysisVersion});assert.equal(old.funded,false);
 const quote=conversationQuote(20000,{availableKurus:3770,...version});assert.equal(quote.funded,true);
 assert.ok(quote.output>=512&&quote.output<1000);assert.ok(quote.reviewOutput>=1000);
 assert.equal(quote.finalReservation,modelReservation('analyst',20000,20000));assert.equal(quote.followingReserveKurus,600);
 assert.equal(quote.toolReserveKurus,62);assert.ok(quote.requiredKurus<=3770);
 assert.equal(conversationQuote(20000,{final:true,availableKurus:5000,...version}).output,20000);
 assert.equal(conversationQuote(20000,{availableKurus:3000,...version}).funded,false);
});
test('the affordable native continuation sends its exact frozen ceiling and uncertain work never gets repurchased',async()=>{
 const {ledger,total}=memoryLedger({charged:1230}),requests=[];await seed(ledger);
 const providers=createConversationProviders(providerConfig(ledger,async(url,init)=>{const body=JSON.parse(init.body);requests.push({url,body});
  if(url.endsWith('count_tokens'))return reply({input_tokens:18560}); // upper=20,000
  throw Error('Synthetic lost native response');
 }));
 await advanceConversation({brief,ledger,id,providers,now});
 const saved=await ledger.get('audit:conversation:request:'+id+':1');assert.equal(saved.value.finalMode,false);
 assert.ok(saved.value.quote.output<1000);assert.equal(requests.find(r=>r.url.endsWith('/messages')).body.max_tokens,saved.value.quote.output);
 const cost=total(),count=requests.length;
 await assert.rejects(providers.analyst(saved.value.messages,{quote:saved.value.quote,receiptKey:saved.value.providerReceiptKey}),e=>['provider_timeout','budget_uncertain'].includes(e.code));
 assert.equal(requests.length,count);assert.equal(total(),cost);assert.ok(cost<=5000);
});
test('a truncated narrow decision cannot mark unfinished research complete or lose the original sources',async()=>{
 const {ledger}=memoryLedger({charged:1230});await seed(ledger);
 const providers=createConversationProviders(providerConfig(ledger,async(url)=>url.endsWith('count_tokens')?reply({input_tokens:18560}):
  reply({model:conversationModels.analyst,content:[{type:'text',text:'Sentetik kesilen karar'}],stop_reason:'max_tokens',usage:{input_tokens:1000,output_tokens:512}})));
 const turn=await advanceConversation({brief,ledger,id,providers,now});
 assert.equal(turn.outputInterrupted,true);assert.equal(turn.finishRequested,false);assert.equal(turn.closed,undefined);
 assert.equal(turn.conversationReport,undefined);assert.deepEqual((await readConversation(ledger,id)).sources.map(row=>row.text),sources.map(row=>row.text));
});
test('real remaining-cap and deadline limits still move to a preserved whole report rather than funding an unaffordable decision',async()=>{
 const {ledger,total}=memoryLedger({charged:2500});await seed(ledger);const requests=[];
 const providers=createConversationProviders(providerConfig(ledger,async(url,init)=>{const body=JSON.parse(init.body);requests.push({url,body});
  if(url.endsWith('count_tokens'))return reply({input_tokens:18560});
  return reply({model:conversationModels.analyst,...assistantCall('finish_bhs',report()),stop_reason:'tool_use',usage:{input_tokens:1000,output_tokens:1000}});
 }));
 const turn=await advanceConversation({brief,ledger,id,providers,now});
 const saved=await ledger.get('audit:conversation:request:'+id+':1');assert.equal(saved.value.finalMode,true);assert.equal(saved.value.quote.output,20000);
 assert.equal(turn.reportDraft.reportMarkdown,report().reportMarkdown);assert.ok(total()<=5000);
 const limited=memoryLedger();await seed(limited.ledger);
 const stub=scriptedProviders(limited.ledger,[assistantCall('finish_bhs',report())]);
 await advanceConversation({brief,ledger:limited.ledger,id,providers:stub,now,deadline:now()+44000});assert.equal(stub.calls[0].options.final,true);
});
test('market outcomes survive persistence, ordinary reload, saved-source handoff and writing-only recovery without research',async()=>{
 const {ledger}=memoryLedger(),value=marketSummary();await seed(ledger,{handoff:value});
 const draft=report(),providers=scriptedProviders(ledger,[assistantCall('finish_bhs',draft)]);
 await advanceConversation({brief,ledger,id,providers,now});await advanceConversation({brief,ledger,id,providers,now});
 const saved=await persistConversationResult({brief,ledger,id,now}),audit=conversationAuditResult(brief,JSON.parse(JSON.stringify(saved)));
 assert.equal(saved.researchOutcomeVersion,marketOutcomeVersion);assert.deepEqual(saved.researchSummary,value);
 assert.equal(audit.data.quality.contentComplete,true);assert.equal(audit.data.fullReport,draft.reportMarkdown);
 const reused=conversationAuditResult(brief,{report:audit.data.report});assert.equal(reused.data.quality.contentComplete,true);
 assert.equal(reused.data.researchOutcomeVersion,marketOutcomeVersion);assert.equal(reused.data.fullReport,draft.reportMarkdown);
 const recovered=memoryLedger();await seed(recovered.ledger,{handoff:value,extra:{researchOutcomeVersion:marketOutcomeVersion,
  semanticReviewVersion:'same-conversation-targeted-review-v1',researchClosureVersion:'read-source-coverage-and-public-gaps-v1',objectiveValidationVersion:'source-identity-and-report-structure-v1'}});
 await persistConversationResult({brief,ledger:recovered.ledger,id,reason:'budget_limit',now});
 const writer=scriptedProviders(recovered.ledger,[assistantCall('finish_bhs',draft)]);
 writer.search=()=>assert.fail('No recovery research');writer.extract=()=>assert.fail('No recovery read');
 const recoveryOptions={brief,ledger:recovered.ledger,id,job:{researchRunId:'synthetic-market-run'},getProviders:()=>writer,meter:({run})=>run(),now};
 const result=await repairConversationReport(recoveryOptions);
 assert.equal(result.researchOutcomeVersion,marketOutcomeVersion);assert.equal(result.conversationReport.reportMarkdown,draft.reportMarkdown);
 assert.equal(result.repair.newResearchCalls,0);assert.equal(conversationAuditResult(brief,result).data.quality.contentComplete,true);
 const count=writer.calls.length;await repairConversationReport(recoveryOptions);assert.equal(writer.calls.length,count);
});
