import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {localBudget} from './fixtures/local-budget.mjs';
import {brief,packet,fakeCollector,modelAnswer} from './fixtures/sequential.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {createSequentialProviders,stageBudgetLedger} from '../src/bhs/sequential-providers.mjs';
import {sequentialPhases,logicalPhases,sequentialContext,qualityAcceptance,sequentialVersion} from '../src/bhs/sequential-contracts.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {createResearchSnapshot,readResearchSnapshot} from '../src/bhs/research-snapshot.mjs';
import {hash} from '../src/budget/ledger.mjs';
const now=()=>Date.parse('2026-11-10T12:00:00Z');
const json=v=>new Response(JSON.stringify(v));
function modelTransport({mutate,fail}={}){
 const events=[];
 const fetchImpl=async(url,options)=>{
  if(url.includes('tcmb'))return new Response('<Tarih_Date Tarih="10.11.2026"><Currency CurrencyCode="USD"><ForexSelling>44</ForexSelling></Currency></Tarih_Date>');
  const b=JSON.parse(options.body);
  if(url.includes('tavily.com/search')){events.push({type:'search',query:b.query});return json({results:packet().sources.map(s=>({url:s.url,title:s.title,content:s.excerpts[0].text})),usage:{credits:1}});}
  const manager=url.includes('anthropic'),context=manager?JSON.parse(b.messages[0].content):JSON.parse(b.contents?.[0]?.parts[0]?.text||b.generateContentRequest.contents[0].parts[0].text);
  const inputTokens=Math.ceil(JSON.stringify(b).length/4);
  if(url.includes('count_tokens'))return json({input_tokens:inputTokens});if(url.endsWith(':countTokens'))return json({totalTokens:inputTokens});
  const stage=context.qaStage;events.push({type:manager?'manager':'worker',stage});
  if(fail?.(stage))throw new DOMException('Synthetic provider timeout','TimeoutError');
  const answer=modelAnswer(stage,context),data=mutate?mutate(stage,answer,context):answer,text=JSON.stringify(data),outputTokens=Math.ceil(text.length/4)+128;
  if(manager)return json({model:'claude-sonnet-5-5',stop_reason:'end_turn',usage:{input_tokens:inputTokens,output_tokens:outputTokens},content:[{type:'text',text}]});
  return json({modelVersion:'gemini-3.1-flash-lite',usageMetadata:{promptTokenCount:inputTokens,candidatesTokenCount:outputTokens,thoughtsTokenCount:0,totalTokenCount:inputTokens+outputTokens},candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]});
 };
 return {events,fetchImpl};
}
function providerFor(db,phase,transport){
 const p=createSequentialProviders({ledger:db.ledger,phase,geminiKey:'test-worker',anthropicKey:'test-manager',tavilyKey:'test-search',fetchImpl:transport.fetchImpl,now,apify:{availableActors:async()=>[],enrich:async()=>{throw Error('Unexpected actor');},mergeEvidence:p=>p}});
 return {...p,manager:(stage,input,schema,opts)=>p.manager(stage,{...input,qaStage:stage},schema,opts),worker:(stage,input,schema,opts)=>p.worker(stage,{...input,qaStage:stage},schema,opts)};
}
async function run(db,phase,transport){return runBoundedStage({phase,brief,ledger:db.ledger,providers:providerFor(db,phase,transport),collect:fakeCollector(),researchVersion:'v8',researchModel:'claude-sonnet-5-5'});}
test('six logical stages run in order through real PostgreSQL receipts and provider accounting',async()=>{
 const db=await localBudget(),t=modelTransport();
 try{
  let synthesis;for(const phase of sequentialPhases.slice(0,-2))synthesis=await run(db,phase,t);
  const report=directAuditResult(brief,synthesis);
  assert.deepEqual(synthesis.supervision.stageOrder,logicalPhases);
  assert.deepEqual(synthesis.supervision.stageDecisions.map(s=>s.phase),logicalPhases.slice(0,5));
  assert.equal(report.status,'ready');assert.equal(report.data.researchCoverage.length,24);assert.equal(report.data.competitors.length,3);assert.ok(report.data.findings.length>=12);assert.equal(report.data.quality.checksPassed,true);
  assert.deepEqual(new Set(synthesis.supervision.swot.map(s=>s.quadrant)),new Set(['strength','weakness','opportunity','threat']));
  assert.ok(t.events.findIndex(e=>e.stage==='v8-sector-extract')>t.events.findIndex(e=>e.stage==='v8-brand-review'));
  assert.ok(t.events.findIndex(e=>e.stage==='v8-swot-draft')>t.events.findIndex(e=>e.stage==='v8-competition-review'));
  const cost=await db.ledger.status();assert.ok(cost.chargedKurus<=4400);assert.ok(cost.chargedKurus>500);
  const count=t.events.length;
  for(const phase of sequentialPhases.slice(0,-2))await run(db,phase,t);
  assert.equal(t.events.length,count);assert.deepEqual(await db.ledger.status(),cost);
  const snap=readResearchSnapshot(createResearchSnapshot(report.data,brief));assert.equal(snap.methodologyVersion,sequentialVersion);assert.equal(snap.supervision.acceptance.passed,true);
 }finally{await db.close();}
});
test('a limited brand understanding blocks sector search and every subsequent paid operation',async()=>{
 const db=await localBudget(),t=modelTransport({mutate:(stage,data)=>stage==='v8-brand-review'?{...data,decision:'limited',missing:['Hedef pazar doğrulanmadı.']}:data});
 try{
  for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('brand')+1))await run(db,phase,t);
  const count=t.events.length,cost=await db.ledger.status();await assert.rejects(run(db,'sector_sources',t),e=>e.code==='research_stage_incomplete');
  assert.equal(t.events.length,count);assert.deepEqual(await db.ledger.status(),cost);
 }finally{await db.close();}
});
test('a revenue topic label on historical growth cannot pass the industry-understanding gate',async()=>{
 const db=await localBudget(),t=modelTransport({mutate:(stage,data)=>stage.startsWith('v8-sector-')&&data.facts?{...data,facts:data.facts.map(f=>f.topic==='revenue_drivers'?{...f,statement:'Management reported historical turnover growth.'}:f)}:data});
 try{
  for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('sector')+1))await run(db,phase,t);
  assert.equal((await db.ledger.get(stageKey(brief,'sector','v8'))).value.decision,'limited');
  await run(db,'sector_validation',t);const count=t.events.length;await assert.rejects(run(db,'competition_plan',t),e=>e.code==='research_stage_incomplete');assert.equal(t.events.length,count);
 }finally{await db.close();}
});
test('new process resumes the committed stage without duplicating model or search fees',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'bhs-restart-')),t=modelTransport();let db;
 try{
  db=await localBudget({dataDir:dir});await run(db,'brand_plan',t);const cost=await db.ledger.status(),count=t.events.length;await db.close();
  db=await localBudget({dataDir:dir});await run(db,'brand_plan',t);assert.equal(t.events.length,count);assert.deepEqual(await db.ledger.status(),cost);
  await run(db,'brand_sources',t);assert.equal((await db.ledger.get(stageKey(brief,'brand_sources','v8'))).state,'complete');
 }finally{await db?.close();await rm(dir,{recursive:true,force:true});}
});
test('fabricated evidence in a worker response cannot reach a manager approval',async()=>{
 const db=await localBudget(),t=modelTransport({mutate:(stage,data)=>stage==='v8-brand-extract'?{...data,facts:data.facts.map(f=>({...f,sourceIds:['invented-proof']}))}:data});
 try{
  await run(db,'brand_plan',t);await run(db,'brand_sources',t);
  await assert.rejects(run(db,'brand_draft',t),e=>e.code==='model_output_invalid');assert.ok(!t.events.some(e=>e.stage==='v8-brand-review'));
 }finally{await db.close();}
});
test('Claude can order one targeted operator correction, while a second repair cannot buy more calls',async()=>{
 const db=await localBudget(),t=modelTransport({mutate:(stage,data,context)=>stage==='v8-brand-review'&&!context.repairRound||stage==='v8-sector-review'?{...data,decision:'limited',missing:['Kaynaklı hedef davranış netleşmeli.']}:data});
 try{
  for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('sector')+1))await run(db,phase,t);
  assert.equal((await db.ledger.get(stageKey(brief,'brand','v8'))).value.decision,'accepted');
  assert.equal((await db.ledger.get(stageKey(brief,'sector','v8'))).value.decision,'limited');
  assert.equal(t.events.filter(e=>e.stage==='v8-brand-repair-extract').length,1);
  assert.equal(t.events.filter(e=>e.stage==='v8-sector-repair-extract').length,0);
  assert.ok((await db.ledger.status()).chargedKurus<5000);
 }finally{await db.close();}
});
test('the same original paragraph keeps its identity when a new source is inserted first',()=>{
 const original=packet(),a=sequentialContext(brief,{packet:original,searches:[]});
 const changed=packet();changed.sources.unshift({...changed.sources[1],id:'ev99',url:'https://other.example/',finalUrl:'https://other.example/'});
 const b=sequentialContext(brief,{packet:changed,searches:[]});
 for(const c of a.cards)assert.equal(b.known.get(c.id)?.quote,c.quote);
});
test('quality acceptance rejects shallow dimensions, missing peers, missing SWOT, unapproved stages and excess cost',()=>{
 const report={sources:[{id:'s',verification:{status:'quote_matched'}}],findings:Array.from({length:12},(_,i)=>({id:'f'+i,statement:'Distinct supported observation '+i,kind:'observation',dimension:['financial','operations','funnel','digital','perception','competition'][i%6],sourceIds:['s']})),competitors:[{},{},{}],researchCoverage:Array(24).fill({})};
 const stages=logicalPhases.slice(0,5).map(phase=>({phase,decision:'accepted'})),swot=['strength','weakness','opportunity','threat'].map(quadrant=>({quadrant,sourceIds:['s']})),budget={chargedKurus:4400,capKurus:5000};
 assert.equal(qualityAcceptance(report,{stages,swot,budget}).passed,true);
 for(const args of [{stages:stages.slice(0,4),swot,budget},{stages,swot:swot.slice(0,3),budget},{stages,swot,budget:{chargedKurus:5001,capKurus:5000}}])assert.equal(qualityAcceptance(report,args).passed,false);
 assert.equal(qualityAcceptance({...report,competitors:[{}]},{stages,swot,budget}).passed,false);
 assert.equal(qualityAcceptance({...report,findings:report.findings.slice(0,3)},{stages,swot,budget}).passed,false);
});
test('stage tools cannot spend final-report headroom even through parallel reservations',async()=>{
 const db=await localBudget();try{
  const l=stageBudgetLedger(db.ledger,'coverage_actors');let calls=0;
  await Promise.allSettled(Array.from({length:8},(_,i)=>l.once('tool:'+i,{i},400,async()=>{calls++;return {receipt:hash(i)};})));
  assert.ok((await db.ledger.status()).chargedKurus<=3000);assert.ok(calls<=6);
 }finally{await db.close();}
});
