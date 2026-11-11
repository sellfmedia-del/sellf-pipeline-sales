import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {localBudget} from './fixtures/local-budget.mjs';
import {brief,plan,packet,fakeCollector,modelAnswer} from './fixtures/sequential.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {createSequentialProviders,stageBudgetLedger} from '../src/bhs/sequential-providers.mjs';
import {sequentialPhases,logicalPhases,sequentialContext,stageModelInput,qualityAcceptance,sequentialVersion,applyFinalReview} from '../src/bhs/sequential-contracts.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {createResearchSnapshot,readResearchSnapshot} from '../src/bhs/research-snapshot.mjs';
import {hash} from '../src/budget/ledger.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {completePeerSources,capturedPeerHosts,balancedSequentialUrls} from '../src/bhs/sequential-research.mjs';
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
  const answer=modelAnswer(stage,context);let data=mutate?mutate(stage,answer,context):answer;
  if(manager&&b.output_config.format.schema.properties.verdicts){const {acceptedIds,rejectedIds,...rest}=data;data={...rest,verdicts:Object.fromEntries([...acceptedIds.map(id=>[id,'accepted']),...rejectedIds.map(id=>[id,'rejected'])])};}
  if(manager&&b.output_config.format.schema.properties.fundamentals){const {decision,...rest}=data;data={...rest,fundamentals:Object.fromEntries(b.output_config.format.schema.properties.fundamentals.required.map(t=>[t,decision==='accepted'?'confirmed':'incomplete']))};}
  const text=JSON.stringify(data),outputTokens=Math.ceil(text.length/4)+128;
  if(manager)return json({model:'claude-sonnet-5-5',stop_reason:'end_turn',usage:{input_tokens:inputTokens,output_tokens:outputTokens},content:[{type:'text',text}]});
  return json({modelVersion:'gemini-3.1-flash-lite',usageMetadata:{promptTokenCount:inputTokens,candidatesTokenCount:outputTokens,thoughtsTokenCount:0,totalTokenCount:inputTokens+outputTokens},candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]});
 };
 return {events,fetchImpl};
}
function providerFor(db,phase,transport,apify){
 const p=createSequentialProviders({ledger:db.ledger,phase,geminiKey:'test-worker',anthropicKey:'test-manager',tavilyKey:'test-search',fetchImpl:transport.fetchImpl,now,apify:apify||{availableActors:async()=>[],enrich:async()=>{throw Error('Unexpected actor');},mergeEvidence:p=>p}});
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
test('fabricated operator evidence is discarded and cannot satisfy expert understanding',async()=>{
 const db=await localBudget(),t=modelTransport({mutate:(stage,data)=>stage==='v8-brand-extract'?{...data,facts:data.facts.map(f=>({...f,sourceIds:['invented-proof']}))}:data});
 try{
  await run(db,'brand_plan',t);await run(db,'brand_sources',t);
  const draft=await run(db,'brand_draft',t);assert.deepEqual(draft.workerData.facts,[]);
  const review=await run(db,'brand_review',t);assert.deepEqual(review.facts,[]);assert.equal(review.understandingDecision,'limited');
 }finally{await db.close();}
});
test('a reviewer can recover an operator-omitted market fact from the original company source without another extraction',async()=>{
 for(const invalid of [false,true]){
  const db=await localBudget(),t=modelTransport({mutate:(stage,data,input)=>{
   if(stage==='v8-brand-extract')return {...data,facts:data.facts.filter(f=>f.topic!=='market')};
   if(stage==='v8-brand-review'){
    const fact=modelAnswer('v8-brand-extract',input).facts.find(f=>f.topic==='market');
    assert.ok(fact,'Reviewer must receive the original omitted company paragraph');
    return {...data,additionalFacts:[{...fact,id:'manager_market',...(invalid?{sourceIds:['invented-proof']}: {})}]};
   }
   return data;
  }});
  try{
   for(const phase of ['brand_plan','brand_sources','brand_draft'])await run(db,phase,t);
   if(invalid)await assert.rejects(run(db,'brand_review',t),e=>e.code==='model_output_invalid');
   else{const out=await run(db,'brand_review',t);assert.equal(out.understandingDecision,'accepted');assert.ok(out.facts.some(f=>f.id==='manager_market'));assert.equal(t.events.filter(e=>e.stage==='v8-brand-extract').length,1);}
  }finally{await db.close();}
 }
});
test('an exact client-declared analysis market is separate from sourced sales claims and a fabricated declaration cannot pass',async()=>{
 const auditBrief=snapshotBrief({...brief,goals:'Türkiye pazarında sürdürülebilir büyüme.'});
 for(const invalid of [false,true]){
  const db=await localBudget(),t=modelTransport({mutate:(stage,data)=>{
   if(stage==='v8-brand-extract')return {...data,facts:data.facts.filter(f=>f.topic!=='market')};
   if(stage==='v8-brand-review')return {...data,marketContext:{basis:'brief_declared',description:'Müşterinin beyan ettiği analiz pazarı Türkiye.',sourceIds:[],briefQuote:invalid?'ABD pazarında büyüme.':auditBrief.goals}};
   return data;
  }});
  const advance=phase=>runBoundedStage({phase,brief:auditBrief,ledger:db.ledger,providers:providerFor(db,phase,t),collect:async()=>({...packet(),briefHash:briefHash(auditBrief)}),researchVersion:'v8',researchModel:'claude-sonnet-5-5'});
  try{
   for(const phase of ['brand_plan','brand_sources','brand_draft'])await advance(phase);
   if(invalid)await assert.rejects(advance('brand_review'),e=>e.code==='model_output_invalid');
   else{const out=await advance('brand_review');assert.equal(out.understandingDecision,'accepted');assert.equal(out.review.marketContext.basis,'brief_declared');assert.equal(out.review.marketContext.validated,true);assert.ok(!out.facts.some(f=>f.topic==='market'));}
  }finally{await db.close();}
 }
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
 const many=Array.from({length:120},(_,i)=>({...report.findings[i%12],id:'many_'+i,statement:'Distinct grounded finding '+i}));
 assert.equal(qualityAcceptance({...report,findings:many},{stages,swot,budget}).passed,true);
});
test('phases share the run budget with no smaller phase ceiling, including concurrent reservations',async()=>{
 const db=await localBudget();try{
  const l=stageBudgetLedger(db.ledger,'coverage_actors');let calls=0;
  await Promise.allSettled(Array.from({length:14},(_,i)=>l.once('tool:'+i,{i},400,async()=>{calls++;return {receipt:hash(i)};})));
  const cost=await db.ledger.status();assert.ok(cost.chargedKurus>3900);assert.ok(cost.chargedKurus<=5000);assert.ok(calls>8);assert.ok(calls<14);
 }finally{await db.close();}
});

test('source reading balances independent manager questions and sector revisions preserve old receipts',()=>{
 assert.deepEqual(balancedSequentialUrls([{results:[{url:'https://one.example/a'},{url:'https://one.example/b'}]},{results:[{url:'https://two.example/a'},{url:'https://two.example/b'}]}]),['https://one.example/a','https://two.example/a','https://one.example/b','https://two.example/b']);
 assert.match(stageKey(brief,'sector_correction_sources','v8'),/:sector_correction_sources-v8-r2:/);
 assert.match(stageKey(brief,'brand','v8'),/:brand-v8-r8:/);
});

test('a source-backed product-sales inference passes the sector review without a third paid validation',async()=>{
 const db=await localBudget(),t=modelTransport({mutate:(stage,data)=>{
  if(stage==='v8-sector-extract')return {...data,facts:data.facts.map(f=>f.topic==='revenue_drivers'?{...f,kind:'inference',statement:'Gelir, kaynakta satışa sunulan ürünlerin satışından oluşuyor olabilir; gerçekleşmiş fiyat, hacim ve ciro bilinmiyor.'}:f)};
  return data;
 }});
 try{for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('sector_validation')+1))await run(db,phase,t);
  const row=await db.ledger.get(stageKey(brief,'sector_validation','v8'));assert.equal(row.value.decision,'accepted');assert.ok(row.value.facts.some(f=>f.kind==='inference'));assert.ok((await db.ledger.status()).chargedKurus<=5000);
  assert.ok(!t.events.some(e=>e.stage==='v8-sector-validation'));
 }finally{await db.close();}
});
test('a modern limited sector remains limited without buying a third verdict to override it',async()=>{
 const db=await localBudget(),t=modelTransport({mutate:(stage,data)=>stage==='v8-sector-review'?{...data,decision:'limited'}:data});
 try{for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('sector_validation')+1))await run(db,phase,t);
  assert.equal((await db.ledger.get(stageKey(brief,'sector_validation','v8'))).value.decision,'limited');assert.ok(!t.events.some(e=>e.stage==='v8-sector-validation'));
  await assert.rejects(run(db,'competition_plan',t),e=>e.code==='research_stage_incomplete');
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

test('competition review reads omitted peer sources and preserves honestly unconfirmed peers without fabricated proof',async()=>{
 const db=await localBudget();let inspected=false;
 const t=modelTransport({mutate:(stage,data,input)=>{
  if(stage==='v8-peer-candidates')return {...data,entities:[...data.entities,{...data.entities[1],id:'unknownpeer',name:'Unknown candidate',website:'https://unknownpeer.example/'}]};
  if(stage==='v8-competition-extract')return {...data,facts:data.facts.slice(0,2)};
  if(stage==='v8-competition-review'){
   inspected=true;assert.ok(input.sources.some(s=>s.url==='https://peer2.example/'));
   return {...data,peers:[...data.peers,{entityId:'unknownpeer',sourceIds:[],relationship:'unconfirmed',reason:'No original page could be read.'}]};
  }
  return data;
 }});
 try{
  for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('competition')+1))await run(db,phase,t);
  const result=(await db.ledger.get(stageKey(brief,'competition','v8'))).value;
  assert.equal(inspected,true);assert.equal(result.decision,'accepted');assert.equal(result.peers.filter(p=>p.relationship==='direct').length,3);
  assert.deepEqual(result.peers.find(p=>p.entityId==='unknownpeer').sourceIds,[]);
 }finally{await db.close();}
});

test('every verdict is schema-required and normalization does not mutate a paid manager reply',async()=>{
 const {reviewVerdictSchema,normalizeVerdictReview,factReviewSchema}=await import('../src/bhs/sequential-contracts.mjs');
 const rows=[{id:'product'},{id:'market'}],schema=reviewVerdictSchema(factReviewSchema,rows);
 assert.deepEqual(schema.properties.verdicts.required,['product','market']);assert.equal(schema.properties.acceptedIds,undefined);
 const reply={verdicts:{product:'accepted',market:'rejected'},notes:'Original paid reply'},before=JSON.stringify(reply);
 assert.deepEqual(normalizeVerdictReview(reply,rows).acceptedIds,['product']);assert.deepEqual(normalizeVerdictReview(reply,rows).rejectedIds,['market']);assert.equal(JSON.stringify(reply),before);
 assert.throws(()=>normalizeVerdictReview({verdicts:{product:'accepted'}},rows),e=>e.code==='model_output_invalid');
});

test('a mislabeled repair cannot replace an independently accepted product fact merely by sharing its topic',async()=>{
 const db=await localBudget();
 const t=modelTransport({mutate:(stage,data,input)=>{
  if(stage==='v8-brand-review'&&!input.repairRound)return {...data,decision:'limited',missing:['One detail requires correction.']};
  if(stage==='v8-brand-repair-extract')return {...data,facts:[{...data.facts.find(f=>f.topic==='scale'),id:'new-location',topic:'products'}]};
  if(stage==='v8-brand-review'&&input.repairRound){assert.ok(input.candidates.some(f=>f.id==='products'));return {...data,acceptedIds:data.acceptedIds.filter(id=>id!=='new-location'),rejectedIds:['new-location']};}
  return data;
 }});
 try{
  for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('brand')+1))await run(db,phase,t);
  const result=(await db.ledger.get(stageKey(brief,'brand','v8'))).value;assert.equal(result.decision,'accepted');assert.ok(result.facts.some(f=>f.id==='products'));assert.ok(!result.facts.some(f=>f.id==='new-location'));
 }finally{await db.close();}
});

test('core understanding has an explicit supervisor verdict for each required topic and private unknowns cannot add a hidden gate',async()=>{
 const {reviewVerdictSchema,normalizeVerdictReview,factReviewSchema}=await import('../src/bhs/sequential-contracts.mjs');
 const rows=[{id:'source-backed-fact'}],schema=reviewVerdictSchema(factReviewSchema,rows,{phase:'brand'});
 assert.equal(schema.properties.decision,undefined);assert.deepEqual(schema.properties.fundamentals.required,['identity','products','business_model','market']);
 const reply={verdicts:{'source-backed-fact':'accepted'},fundamentals:{identity:'confirmed',products:'confirmed',business_model:'confirmed',market:'confirmed'},missing:['Private revenue and shareholders unavailable']};
 const original=JSON.stringify(reply);assert.equal(normalizeVerdictReview(reply,rows,{phase:'brand'}).decision,'accepted');assert.equal(JSON.stringify(reply),original);
 assert.equal(normalizeVerdictReview({...reply,fundamentals:{...reply.fundamentals,market:'incomplete'}},rows,{phase:'brand'}).decision,'limited');
 assert.throws(()=>normalizeVerdictReview({...reply,fundamentals:{identity:'confirmed'}},rows,{phase:'brand'}),e=>e.code==='model_output_invalid');
 assert.throws(()=>normalizeVerdictReview({...reply,fundamentals:{...reply.fundamentals,private_revenue:'incomplete'}},rows,{phase:'brand'}),e=>e.code==='model_output_invalid');
});
test('blank operator candidates are rejected while the expert must establish core facts from original sources',async()=>{
 const db=await localBudget();let reviewed=false;
 const t=modelTransport({mutate:(stage,data,input)=>{
  if(stage==='v8-brand-extract')return {...data,facts:[{...data.facts[0],statement:'',sourceIds:[]}]};
  if(stage==='v8-brand-review'){
   reviewed=true;assert.deepEqual(input.candidates,[]);assert.ok(input.sources.some(s=>s.url===brief.website));
   return {...data,additionalFacts:modelAnswer('v8-brand-extract',input).facts};
  }return data;
 }});
 try{
  for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('brand')+1))await run(db,phase,t);
  const draft=(await db.ledger.get(stageKey(brief,'brand_draft','v8'))).value;
  assert.equal(draft.workerData.facts.length,0);assert.equal(draft.operatorValidation.rejectedCandidates[0].reason,'empty_statement');
  const accepted=(await db.ledger.get(stageKey(brief,'brand','v8'))).value;
  assert.equal(reviewed,true);assert.equal(accepted.decision,'accepted');assert.ok(accepted.facts.length>=4);assert.ok(accepted.facts.every(f=>f.sourceIds.length&&f.statement));
 }finally{await db.close();}
});

test('missing candidate addresses use observed exact-name domains and unresolved peers remain unconfirmed',async()=>{
 const {resolvePeerAddresses}=await import('../src/bhs/sequential-research.mjs');
 const queries=[],peers=[{id:'known',name:'Known',role:'competitor',website:'https://known.example/'},{id:'new',name:'Tuğba Kuruyemiş',role:'competitor',website:''},{id:'unresolved',name:'Missing Company',role:'competitor',website:''}];
 const result=await resolvePeerAddresses({entities:peers,sources:[]},{search:async q=>{queries.push(q);return {results:[{url:'https://news.example/tugba'},{url:'https://tugbakuruyemis-fake.example/'},{url:'https://www.tugbakuruyemis.com.tr/urunler'}]};}});
 assert.equal(queries.length,2);assert.equal(result.data.entities.find(e=>e.id==='new').website,'https://www.tugbakuruyemis.com.tr/urunler');assert.equal(result.data.entities.length,2);assert.deepEqual(result.unresolved.map(e=>e.id),['unresolved']);assert.equal(peers[1].website,'');
});

test('gap research accepts every BHS dimension and still rejects an invented source',async()=>{
 const {runSequentialStage}=await import('../src/bhs/sequential-research.mjs');const {assertSchema}=await import('../src/bhs/schema.mjs');
 const prior={packet:packet(),searches:[],facts:[],swot:[],decision:'accepted',coveragePlan:{priorities:[]}};const context=sequentialContext(brief,prior),proof=context.cards[0].id;
 const baseline={...prior,packet:{...prior.packet,sources:prior.packet.sources.slice(0,-1)}};
 for(const invented of [false,true]){
  const facts=['financial','operations','funnel','digital','perception','competition'].map((topic,i)=>({id:'gap_'+i,kind:'observation',topic,statement:'Kaynağın doğrudan desteklediği ek araştırma bulgusu.',sourceIds:[invented?'invented-proof':proof],limitation:'Yalnız incelenen kaynak kapsamı.'}));
  const run=()=>runSequentialStage({phase:'coverage',brief,previous:async phase=>phase==='swot'?baseline:prior,providers:{worker:async(_stage,input,schema,opts)=>{assert.equal(input.areas.length,24);assertSchema({facts,unknowns:[]},schema);opts.validateData({facts,unknowns:[]});return {data:{facts,unknowns:[]}};}}});
  if(invented)await assert.rejects(run());else assert.equal((await run()).correctionCandidates.length,6);
 }
});

test('Claude can dispatch an observed Actor during brand research before Gemini and retain the result in the stage receipt',async()=>{
 const db=await localBudget(),actor='apify/instagram-profile-scraper';let sawExtraction=false;
 const request={actor,url:'https://www.instagram.com/acmeorganic/',purpose:'Marka profilini doğrula.',countryCode:'',language:''};
 const t=modelTransport({mutate:(stage,data,input)=>{
  if(stage==='v8-brand-plan'){assert.ok(input.availableActors.includes(actor));assert.ok(input.observedActorUrls.includes(request.url));data.actorRequests=[request];}
  if(stage==='v8-brand-extract'){sawExtraction=true;assert.ok(JSON.stringify(input.sources).includes('SCRAPER VERIFIED PROFILE'));assert.ok(t.events.some(e=>e.type==='actor'));}
  return data;
 }});
 const apify={availableActors:async()=>[actor],enrich:async(r,c)=>{assert.deepEqual(r,request);assert.equal(c.brief.brandName,brief.brandName);t.events.push({type:'actor'});return {actor,status:'complete'};},mergeEvidence:(p,results)=>({...p,sources:[...p.sources,{...p.sources[0],id:'ev99',url:request.url,finalUrl:request.url,contentHash:hash('actor'),excerpts:[{text:'SCRAPER VERIFIED PROFILE: Acme Organic publishes its organic oat snack product range.'}],provenance:{actor,runId:'SyntheticRun'}}]})};
 try{
  for(const phase of ['brand_plan','brand_sources','brand_draft'])await runBoundedStage({phase,brief,ledger:db.ledger,providers:providerFor(db,phase,t,apify),collect:fakeCollector(),researchVersion:'v8',researchModel:'claude-sonnet-5-5'});
  assert.equal(sawExtraction,true);const receipt=(await db.ledger.get(stageKey(brief,'brand_sources','v8'))).value;
  assert.equal(receipt.actorResults[0].status,'complete');assert.ok(receipt.packet.sources.some(s=>s.provenance?.actor===actor));
 }finally{await db.close();}
});

test('missing official peer pages use one bounded extraction before any paid peer analysis',async()=>{
 const evidence={plan,packet:packet(),searches:[]};evidence.packet.sources=evidence.packet.sources.filter(s=>!s.finalUrl.includes('peer'));let calls=0;
 const read=await completePeerSources(evidence,{extract:async urls=>{calls++;assert.equal(urls.length,3);return{pages:urls.map((url,i)=>({url,text:'Organic '+['Alpha','Beta','Gamma'][i]+" sells organic oat bars in Türkiye through its public product catalogue. Delivery terms and listed prices are disclosed."}))};}});
 assert.equal(calls,1);assert.equal(capturedPeerHosts(read).size,3);
 await completePeerSources(read,{extract:()=>assert.fail('Complete sources need no new extraction')});
 const unavailable=await completePeerSources(evidence,{extract:async()=>({pages:[],failed:[{reason:'unavailable'}]})});assert.equal(capturedPeerHosts(unavailable).size,0);
});

test('competition extraction never buys a model response without three captured candidate domains',async()=>{
 const {runSequentialStage}=await import('../src/bhs/sequential-research.mjs');
 const prior={plan,packet:packet(),searches:[],facts:[],decision:'accepted',repairNeeded:true};
 prior.packet.sources=prior.packet.sources.filter(s=>!s.finalUrl.includes('peer'));
 for(const phase of ['competition_draft','competition_correction_draft']){
  const draft=await runSequentialStage({phase,brief,previous:async()=>prior,providers:{worker:()=>assert.fail('Missing source evidence must precede model purchase')}});
  assert.deepEqual(draft.workerData.facts,[]);
  assert.ok(draft.workerData.unknowns.length);
 }
});

test('targeted competitor reading uses observed product pages before any home navigation',async()=>{
 const {runSequentialStage,selectPeerProductPages}=await import('../src/bhs/sequential-research.mjs');
 const {createEvidenceCollector}=await import('../src/bhs/evidence.mjs');
 const names=plan.entities.filter(e=>e.role==='competitor');
 const product=names.map(e=>({name:e.name,url:new URL('/product/oat-bar',e.website).href}));
 const published=product.map(p=>({url:p.url,title:p.name+' oat bar'}));
 const first=await selectPeerProductPages({brief,plan,focus:'oat bar',searches:[{results:published}],providers:{worker:async()=>({data:{pages:[{name:'Unobserved',url:'https://invented.example/one'},...product]}})}});
 assert.deepEqual(first.prioritySources,product.map(p=>p.url));
 const prior={...first,packet:{...packet(),sources:packet().sources.filter(s=>!s.url.includes('peer'))},searches:[],facts:[],decision:'accepted',review:{nextTask:{actorRequests:[]}}};
 const opened=[];
 const read=async url=>{opened.push(url);return {status:200,headers:{'content-type':'text/html'},body:Buffer.from('<a href="/unrelated">Unrelated product navigation</a><p>'+('Organic oat bar sold in Türkiye. Package and shelf price information. '.repeat(24))+'</p>')};};
 const collected=await runSequentialStage({phase:'competition_sources',brief,previous:async()=>prior,providers:{},collect:createEvidenceCollector({read,allowPartialPlan:true,preferProductLinks:true})});
 assert.deepEqual(opened,product.map(p=>p.url));
 assert.equal(capturedPeerHosts(collected).size,3);
 assert.deepEqual(collected.packet.sources.slice(0,2),prior.packet.sources);
});

test('brand and sector paragraphs cannot crowd competitor product pages out of the model payload',()=>{
 const base=packet(),old=base.sources.slice(0,2),peers=base.sources.slice(2);
 const archives=Array.from({length:10},(_,i)=>({...old[0],id:'ev'+(i+20),url:'https://archive'+i+'.example/',finalUrl:'https://archive'+i+'.example/',excerpts:Array.from({length:7},(_,j)=>({text:Array.from({length:38},(_,k)=>`Archive ${i} part ${j} row ${k} original sales and products`).join(' ').slice(0,1800)}))}));
 const evidence={packet:{...base,sources:[...old,...archives,...peers]},searches:[],peerDiscoveryVersion:'product-v2'};
 const oldContext=sequentialContext(brief,evidence,{completeSources:false});
 const ctx=sequentialContext(brief,evidence);
 const peerProofs=c=>c.cards.filter(card=>peers.some(p=>p.finalUrl===card.url));
 assert.ok(peerProofs(oldContext).length<peerProofs(ctx).length);
 assert.ok(peers.every(p=>ctx.cards.some(c=>c.url===p.finalUrl)));
 const operator=stageModelInput(ctx);
 assert.ok(peers.every(p=>operator.sources.some(s=>s.url===p.finalUrl&&s.sections.length)));
 assert.ok(operator.sources.flatMap(s=>s.sections).reduce((n,p)=>n+(p.text?.length||0),0)<=76000);
 assert.ok(oldContext.cards.every(c=>ctx.known.has(c.id)));
});
