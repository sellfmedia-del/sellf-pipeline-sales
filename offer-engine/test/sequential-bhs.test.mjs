import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {localBudget} from './fixtures/local-budget.mjs';
import {brief,packet,fakeCollector,modelAnswer} from './fixtures/sequential.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {createSequentialProviders,stageBudgetLedger} from '../src/bhs/sequential-providers.mjs';
import {sequentialPhases,logicalPhases,sequentialContext,qualityAcceptance,sequentialVersion,applyFinalReview} from '../src/bhs/sequential-contracts.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {createResearchSnapshot,readResearchSnapshot} from '../src/bhs/research-snapshot.mjs';
import {hash} from '../src/budget/ledger.mjs';
import {balancedSequentialUrls} from '../src/bhs/sequential-research.mjs';
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
  assert.equal(report.status,'ready');const limited=directAuditResult(brief,{...synthesis,supervision:{...synthesis.supervision,finalDecision:'limited'}});assert.equal(limited.status,'review');assert.ok(limited.data.supervision.acceptance.issues.includes('manager_final_limited'));
  const drafted=(await db.ledger.get(stageKey(brief,'report_draft','v8'))).value,review=modelAnswer('v8-final-report',{operatorDraft:drafted.reportDraft});assert.throws(()=>applyFinalReview(drafted.reportDraft,{...review,patches:[{...drafted.reportDraft.findings[0],sourceIds:['fabricated']} ]},sequentialContext(brief,drafted)),e=>e.code==='model_output_invalid');
  assert.equal(report.data.researchCoverage.length,24);assert.equal(report.data.competitors.length,3);assert.ok(report.data.findings.length>=12);assert.equal(report.data.quality.checksPassed,true);
  assert.deepEqual(new Set(synthesis.supervision.swot.map(s=>s.quadrant)),new Set(['strength','weakness','opportunity','threat']));
  assert.ok(t.events.findIndex(e=>e.stage==='v8-sector-extract')>t.events.findIndex(e=>e.stage==='v8-brand-review'));
  assert.ok(t.events.findIndex(e=>e.stage==='v8-swot-draft')>t.events.findIndex(e=>e.stage==='v8-competition-review'));
  const cost=await db.ledger.status();assert.ok(cost.chargedKurus<=5000);assert.ok(cost.chargedKurus>500);
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

test('legacy paid facts receive one source-backed manager amendment without resetting prior charges',async()=>{
 const db=await localBudget(),t=modelTransport();try{
  for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('sector')+1))await run(db,phase,t);
  const key=stageKey(brief,'sector','v8'),row=await db.ledger.get(key),old={...row.value,facts:row.value.facts.map(({kind,...fact})=>fact)};
  await db.db.query('update public.pipeline_offer_preview_budget_steps set value=$1 where budget_id=$2 and step_key=$3',[JSON.stringify(old),row.budget_id,key]);
  const cost=await db.ledger.status(),events=t.events.length;
  const corrected=await run(db,'sector_validation',t);assert.equal(corrected.decision,'accepted');assert.equal(corrected.managerAmendment,true);assert.ok(corrected.facts.every(f=>f.kind==='observation'));assert.ok((await db.ledger.status()).chargedKurus>cost.chargedKurus);
  const after=await db.ledger.status();await run(db,'sector_validation',t);assert.deepEqual(await db.ledger.status(),after);assert.equal(t.events.length,events+1);assert.ok((await db.ledger.get(key)).value.facts.every(f=>f.kind===undefined));
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
test('Claude can order one targeted correction per stage within the same total account',async()=>{
 const db=await localBudget(),t=modelTransport({mutate:(stage,data,context)=>stage==='v8-brand-review'&&!context.repairRound||stage==='v8-sector-review'?{...data,decision:'limited',missing:['Kaynaklı hedef davranış netleşmeli.']}:data});
 try{
  for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('sector')+1))await run(db,phase,t);
  assert.equal((await db.ledger.get(stageKey(brief,'brand','v8'))).value.decision,'accepted');
  assert.equal((await db.ledger.get(stageKey(brief,'sector','v8'))).value.decision,'limited');
  assert.equal(t.events.filter(e=>e.stage==='v8-brand-repair-extract').length,1);
  assert.equal(t.events.filter(e=>e.stage==='v8-sector-repair-extract').length,1);
  const cost=await db.ledger.status(),calls=t.events.length;await run(db,'sector_correction_sources',t);await run(db,'sector_correction_draft',t);await run(db,'sector',t);assert.equal(t.events.length,calls);assert.deepEqual(await db.ledger.status(),cost);
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
  assert.ok((await db.ledger.status()).chargedKurus<=3900);assert.ok(calls<=8);
 }finally{await db.close();}
});

test('source reading balances independent manager questions and sector revisions preserve old receipts',()=>{
 assert.deepEqual(balancedSequentialUrls([{results:[{url:'https://one.example/a'},{url:'https://one.example/b'}]},{results:[{url:'https://two.example/a'},{url:'https://two.example/b'}]}]),['https://one.example/a','https://two.example/a','https://one.example/b','https://two.example/b']);
 assert.match(stageKey(brief,'sector_correction_sources','v8'),/:sector_correction_sources-v8-r2:/);
 assert.match(stageKey(brief,'brand','v8'),/:brand-v8-r3:/);
});

test('a source-backed product-sales inference can explain revenue without private channel turnover',async()=>{
 const db=await localBudget(),t=modelTransport({mutate:(stage,data)=>{
  if(stage==='v8-sector-review')return {...data,decision:'limited'};
  if(stage==='v8-sector-validation')return {...data,facts:data.facts.map(f=>f.topic==='revenue_drivers'?{...f,kind:'inference',statement:'Gelir, kaynakta satışa sunulan ürünlerin satışından oluşuyor olabilir; gerçekleşmiş fiyat, hacim ve ciro bilinmiyor.'}:f)};
  return data;
 }});
 try{for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('sector_validation')+1))await run(db,phase,t);
  const row=await db.ledger.get(stageKey(brief,'sector_validation','v8'));assert.equal(row.value.decision,'accepted');assert.ok(row.value.facts.some(f=>f.kind==='inference'));assert.ok((await db.ledger.status()).chargedKurus<=5000);
 }finally{await db.close();}
});

test('a targeted brand repair retains omitted accepted topics and rechecks replacements against original sources',async()=>{
 const db=await localBudget();let reviews=0;
 const t=modelTransport({mutate:(stage,data)=>{
  if(stage==='v8-brand-review'&&++reviews===1)return {...data,decision:'limited',acceptedIds:['products','business_model','scale','ownership'],rejectedIds:['identity','market'],missing:['Kimlik ve pazar açıklamasını düzelt.']};
  if(stage==='v8-brand-repair-extract')return {...data,facts:data.facts.filter(f=>['identity','market'].includes(f.topic))};
  return data;
 }});
 try{
  for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('brand')+1))await run(db,phase,t);
  const saved=(await db.ledger.get(stageKey(brief,'brand','v8'))).value;
  assert.equal(saved.decision,'accepted');assert.equal(reviews,2);
  assert.ok(['identity','products','business_model','market'].every(topic=>saved.facts.some(f=>f.topic===topic)));
  assert.equal(new Set(saved.facts.map(f=>f.id)).size,saved.facts.length);
 }finally{await db.close();}
});

test('a manager source correction changes the accepted fact itself, while a fabricated patch cannot pass',async()=>{
 for(const mode of ['accepted','rejected','fabricated']){
  const fabricated=mode==='fabricated',db=await localBudget();
  const t=modelTransport({mutate:(stage,data,input)=>stage==='v8-brand-review'?{...data,...(mode==='rejected'?{acceptedIds:data.acceptedIds.filter(id=>id!==input.candidates[0].id),rejectedIds:[input.candidates[0].id]}:{}),patches:[{...input.candidates[0],statement:'Acme Organic organik atıştırmalık ürünleri üreten bir markadır.',...(fabricated?{sourceIds:['invented-paragraph']}:{})}]}:data});
  try{
   const work=async()=>{for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('brand_review')+1))await run(db,phase,t);};
   if(fabricated)await assert.rejects(work,e=>e.code==='model_output_invalid');
   else{await work();const saved=(await db.ledger.get(stageKey(brief,'brand_review','v8'))).value;assert.equal(saved.facts.find(f=>f.id==='identity').statement,'Acme Organic organik atıştırmalık ürünleri üreten bir markadır.');}
  }finally{await db.close();}
 }
});


test('a peer-only plan restores the confirmed subject and schedules original peer sites before contextual reports',async()=>{
 const {parseSequentialPeerPlan}=await import('../src/bhs/sequential-research.mjs');
 const {plan}=await import('./fixtures/sequential.mjs');
 const data={entities:plan.entities.filter(e=>e.role==='competitor'),sources:[{url:'https://industry.example/report',purpose:'Sector context.'}]};
 const parsed=parseSequentialPeerPlan(data,brief);
 assert.equal(parsed.entities.filter(e=>e.role==='brand').length,1);assert.equal(parsed.entities[0].website,brief.website);
 assert.deepEqual(parsed.sources.slice(0,4).map(s=>s.url),[brief.website,...data.entities.map(e=>e.website)]);
 assert.throws(()=>parseSequentialPeerPlan({...data,entities:[...plan.entities,plan.entities[0]]},brief));
});
