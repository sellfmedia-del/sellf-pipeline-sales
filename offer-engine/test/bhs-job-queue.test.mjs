import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {localBudget} from './fixtures/local-budget.mjs';
import {brief,fakeCollector,packet,modelAnswer,plan} from './fixtures/sequential.mjs';
import {sequentialContext,stageModelInput,sequentialVersion,sequentialPhases} from '../src/bhs/sequential-contracts.mjs';
import {projectExpertReport} from '../src/bhs/expert-report.mjs';
import {briefHash} from '../src/bhs/brief.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {runClaimedBhsStage} from '../src/bhs/background-runner.mjs';
import {createLedger} from '../src/budget/ledger.mjs';
import {createBhsJobStore,queuedBhsBrief} from '../src/bhs/job-store.mjs';
import {createBhsGatewayActions} from '../../supabase/functions/_shared/bhs-jobs.mjs';
import {runMeteredBhsPhase,createBhsWorkerHandler} from '../src/bhs/job-worker.mjs';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {meteredBhsStage,workerInfraReservationKurus} from '../src/bhs/job-infrastructure.mjs';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',token='33333333-3333-4333-8333-333333333333',secret='s'.repeat(43),hash=briefHash(brief);
const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
async function fixture(){
 const db=await localBudget();
 await db.db.exec('reset role;');
 await db.db.exec(await readFile(new URL('../schema/bhs-sequential-jobs.sql',import.meta.url),'utf8'));
 await db.db.exec('set role service_role;');
 const calls=[];
 const rpc=async(path,{body})=>{
  calls.push({path,body});assert.equal(path,'/rest/v1/rpc/pipeline_bhs_job_op');
  return (await db.db.query('select public.pipeline_bhs_job_op($1,$2,$3,$4,$5,$6,$7) as value',[body.p_mode,body.p_op,body.p_owner,body.p_lead,body.p_id,body.p_token,JSON.stringify(body.p_data)])).rows[0].value;
 };
 const gateway=createBhsGatewayActions({mode:'preview',env:k=>k==='BHS_WORKER_SECRET'?secret:undefined,db:rpc,user:async jwt=>{assert.equal(jwt,'synthetic-jwt');return{id:owner};},validateLead:async id=>assert.equal(id,'synthetic-bhs'),cryptoImpl:webcrypto});
 const queue=createBhsJobStore({store:{call:(action,body)=>gateway({action,...body})},jwt:'synthetic-jwt',workerSecret:secret});
 return {...db,queue,calls,gateway,enqueue:async()=>queue.enqueue({leadId:'synthetic-bhs',researchVersion:'v8',researchModel:'claude-sonnet-5-5'},brief,await db.ledger.status()),op:async(op,data={},extra={})=>(await db.db.query('select public.pipeline_bhs_job_op($1,$2,$3,$4,$5,$6,$7) as value',['preview',op,owner,'synthetic-bhs',extra.id||null,extra.token||null,JSON.stringify(data)])).rows[0].value};
}
test('private queue deduplicates jobs, binds budget/owner/brief and requires a committed checkpoint',async()=>{
 const f=await fixture();try{
  const job=await f.enqueue();assert.equal((await f.enqueue()).id,job.id);assert.equal((await f.queue.find('synthetic-bhs',hash)).id,job.id);
  await assert.rejects(f.gateway({action:'bhs_job_claim',leaseToken:token,workerSecret:'x'.repeat(43)}));
  await assert.rejects(f.op('enqueue',{budgetId:other,briefText:JSON.stringify(brief),briefHash:hash,spec:{researchVersion:'v8',researchModel:'claude-sonnet-5-5'}}),/budget binding/);
  await assert.rejects(f.op('enqueue',{budgetId:job.budgetId,briefText:JSON.stringify({...brief,brandName:'changed'}),briefHash:hash,spec:{researchVersion:'v8',researchModel:'claude-sonnet-5-5'}}));
  const claim=await f.queue.claim();assert.equal(claim.id,job.id);assert.equal(await f.queue.claim(),null);
  await assert.rejects(f.queue.advance({...claim,leaseToken:token},{nextPhase:'brand_sources',checkpointKey:stageKey(brief,'brand_plan','v8')}),/lease/);
  await assert.rejects(f.queue.advance(claim,{nextPhase:'swot',checkpointKey:stageKey(brief,'brand_plan','v8')}),/checkpoint mismatch/);
  await assert.rejects(f.queue.advance(claim,{nextPhase:'brand_sources',checkpointKey:stageKey(brief,'brand_plan','v8')}),/not committed/);
  const ledger=await f.queue.getLedger(claim);await ledger.once(stageKey(brief,'brand_plan','v8'),{brief,phase:'brand_plan',version:'bounded-bhs-v1'},0,async()=>({completed:true}));
  await f.queue.advance(claim,{nextPhase:'brand_sources',checkpointKey:stageKey(brief,'brand_plan','v8')});
  await assert.rejects(ledger.once('late-paid-call',{},100,async()=>assert.fail()),/lease/);
  await f.db.exec('reset role;set role anon;');await assert.rejects(f.db.query('select * from public.pipeline_bhs_jobs'));await assert.rejects(f.op('claim',{}, {token}));
 }finally{await f.close();}
});
test('worker advances persisted BHS without browser/JWT state and never repeats a committed stage',async()=>{
 const f=await fixture();try{
  await f.enqueue();const job=await f.queue.claim();let paid=0;
  const providers={checkpoint:(name,input,run)=>run(),manager:async()=>{paid++;return{data:{instruction:'Kaynaklarla markayı anla.',queries:[]}};}};
  const runStage=opts=>runBoundedStage({...opts,providers,collect:fakeCollector()});
  await runClaimedBhsStage({job,queue:f.queue,getLedger:f.queue.getLedger,getProviders:async()=>providers,runStage});
  assert.equal(paid,1);assert.equal((await f.queue.read(job)).phase,'brand_sources');
  await f.db.query("update public.pipeline_bhs_jobs set phase='brand_plan',state='queued' where id=$1",[job.id]);
  const retry=await f.queue.claim();await runClaimedBhsStage({job:retry,queue:f.queue,getLedger:f.queue.getLedger,getProviders:()=>assert.fail('no providers on replay'),runStage});assert.equal(paid,1);
  assert.ok(!JSON.stringify(f.calls.filter(c=>c.body.p_op==='enqueue')).includes('synthetic-jwt'));
 }finally{await f.close();}
});
test('production additional-run binding cannot read a Preview job or attach another owner budget',async()=>{
 const f=await fixture();try{
  const preview=await f.enqueue();await f.db.exec('reset role;create table public.pipeline_offer_budgets (like public.pipeline_offer_preview_budgets including all);create table public.pipeline_offer_budget_steps (like public.pipeline_offer_preview_budget_steps including all);grant select,update on public.pipeline_offer_budgets,public.pipeline_offer_budget_steps to service_role;');
  const b=(await f.db.query('insert into public.pipeline_offer_budgets(owner_id,lead_id) values($1,$2) returning id',[owner,'synthetic-bhs:audit:'+other])).rows[0].id;
  await f.db.exec('set role service_role;');
  const data={briefHash:hash,briefText:JSON.stringify(brief),budgetId:b,spec:{researchVersion:'v8',researchModel:'claude-sonnet-5-5',researchRunId:other}};
  const op=async(operation,data={},id=null,who=owner)=>(await f.db.query('select public.pipeline_bhs_job_op($1,$2,$3,$4,$5,$6,$7) as value',['production',operation,who,'synthetic-bhs',id,null,JSON.stringify(data)])).rows[0].value;
  const job=await op('enqueue',data);assert.notEqual(job.id,preview.id);assert.equal(job.budget_lead,'synthetic-bhs:audit:'+other);
  await assert.rejects(op('read',{},preview.id),/not found/);await assert.rejects(op('read',{},job.id,other),/owner mismatch/);
  await assert.rejects(op('enqueue',{...data,budgetId:preview.budgetId}),/budget binding/);
 }finally{await f.close();}
});
test('expired workers and finite claim limit pause while retaining all paid amounts',async()=>{
 const f=await fixture();try{
  const job=await f.enqueue(),claim=await f.queue.claim(),ledger=await f.queue.getLedger(claim);await ledger.once('synthetic-paid-call',{},100,async()=>({saved:true}));const cost=await f.ledger.status();
  await f.db.query("update public.pipeline_bhs_jobs set lease_until=now()-interval '1 second' where id=$1",[job.id]);assert.equal(await f.queue.claim(),null);assert.equal((await f.queue.read(job)).state,'paused');assert.deepEqual(await f.ledger.status(),cost);
  await f.db.query("update public.pipeline_bhs_jobs set state='queued',claims=40 where id=$1",[job.id]);assert.equal(await f.queue.claim(),null);assert.equal((await f.queue.read(job)).diagnostic.code,'job_execution_limit');
 }finally{await f.close();}
});
test('cancelling an active job permits the in-flight receipt to settle but prevents another paid call',async()=>{
 const f=await fixture();try{
  await f.enqueue();const job=await f.queue.claim(),ledger=await f.queue.getLedger(job);let release;
  const pending=ledger.once('inflight-paid',{},100,async()=>new Promise(resolve=>{release=resolve;}));
  while(!release)await new Promise(resolve=>setTimeout(resolve,1));
  await f.queue.cancel(job);release({saved:true});await pending;
  const cost=await f.ledger.status();await assert.rejects(ledger.once('next-paid',{},100,async()=>assert.fail()),/cancellation/);assert.deepEqual(await f.ledger.status(),cost);
  await f.queue.pause(job,{code:'cancelled'});assert.equal((await f.queue.read(job)).state,'cancelled');assert.equal(await f.queue.claim(),null);
 }finally{await f.close();}
});
test('worker endpoint denies unauthenticated or disabled calls before touching jobs',async()=>{
 let claims=0;const handler=createBhsWorkerHandler({enabled:()=>true,secret:()=>secret,getQueue:()=>({claim:async()=>{claims++;return null;}}),logger:{}});
 let r=res();await handler({method:'POST',headers:{}},r);assert.equal(r.code,401);assert.equal(claims,0);
 r=res();await handler({method:'POST',headers:{authorization:'Bearer '+secret}},r);assert.equal(r.body.status,'idle');assert.equal(claims,1);
 r=res();await createBhsWorkerHandler({enabled:()=>false,secret:()=>secret,getQueue:()=>assert.fail()})({method:'POST',headers:{authorization:'Bearer '+secret}},r);assert.equal(r.code,503);
});
test('worker compute settles measured failures and retains the ceiling only when measurement is unknown',async()=>{
 const f=await localBudget();try{
  let time=0,calls=0;const job={id:other,phase:'brand_plan',briefHash:hash},options={job,ledger:f.ledger,region:'iad1',clock:()=>time,cpu:arg=>arg?{user:600000000,system:0}:{user:0,system:0},run:async()=>{calls++;time+=300000;}};
  const result=await meteredBhsStage(options);assert.ok(result.accountedKurus>0&&result.accountedKurus<workerInfraReservationKurus);assert.equal((await f.ledger.status()).chargedKurus,500+result.accountedKurus);
  await meteredBhsStage(options);assert.equal(calls,1);
  await assert.rejects(meteredBhsStage({...options,region:'unknown'}),e=>e.code==='infra_tariff_unverified');
  await assert.rejects(meteredBhsStage({...options,job:{...job,phase:'sector_sources'},run:async()=>{time+=10000;throw Object.assign(Error('admission blocked'),{code:'budget_limit'});}}),e=>e.code==='budget_limit');
  const failed=await f.ledger.get('infra:v8:sector_sources:'+hash);assert.equal(failed.state,'complete');assert.equal(failed.value.failed,true);assert.ok(failed.charge_kurus>0&&failed.charge_kurus<workerInfraReservationKurus);
  assert.equal((await f.ledger.status()).chargedKurus,500+result.accountedKurus+failed.charge_kurus);
  await assert.rejects(meteredBhsStage({...options,job:{...job,phase:'swot_sources'},cpu:()=>({user:NaN,system:0}),run:async()=>{throw Error('unmeasured failure');}}),e=>e.code==='infra_accounting');
  assert.equal((await f.ledger.status()).chargedKurus,500+result.accountedKurus+failed.charge_kurus+workerInfraReservationKurus);
 }finally{await f.close();}
});

test('a completed BHS can reach the deterministic scope fallback even below one worker reservation',async()=>{
 const f=await localBudget();try{
  await f.ledger.once('prior-public-research',{},4200,async()=>({retained:true}));
  await f.ledger.once(stageKey(brief,'synthesis','v8'),{brief,phase:'synthesis',version:'bounded-bhs-v1'},0,async()=>({report:{summary:'',sources:[],findings:[]}}));
  const cost=await f.ledger.status(),job={id:other,phase:'scope',briefHash:hash};
  const result=await runMeteredBhsPhase(job,{phase:'scope',brief,ledger:f.ledger,researchVersion:'v8',researchModel:'claude-sonnet-5-5',providers:{generate:()=>assert.fail('no paid scope call')}});
  assert.equal(result.costFallback,true);assert.equal(result.scopePlan.fallback,true);assert.deepEqual(await f.ledger.status(),cost);
 }finally{await f.close();}
});
test('the managed report can pass reviewed evidence to the offer when a paid worker reservation cannot fit',async()=>{
 const job={phase:'synthesis'};
 const options={phase:'synthesis',phaseCeiling:4621,ledger:{status:async()=>({chargedKurus:4222,capKurus:5000})},
  providers:{manager:()=>assert.fail('a paid writer must not run without the reservation')}};
 const result=await runMeteredBhsPhase(job,options,{meter:()=>assert.fail('the worker reservation does not fit'),runStage:async({providers})=>{
  await assert.rejects(providers.manager(),error=>error.code==='budget_limit');
  return 'reviewed evidence handoff';
 }});
 assert.equal(result,'reviewed evidence handoff');
});
test('existing audit endpoint queues v8 and reconnects to the original budget without running a browser-paid phase',async()=>{
 const env=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';let enqueues=0,finds=0;
 try{
  const job={id:other,leadId:'lead1',budgetId:token,briefHash:hash,state:'queued',phase:'sector_sources',researchRunId:owner};
  const queue={find:async()=>++finds===1?null:job,enqueue:async()=>{enqueues++;return job;},read:async()=>job};
  const ledger={begin:async()=>{},status:async()=>({id:token,capKurus:5000,chargedKurus:500}),get:()=>assert.fail('browser must not read all phase blobs')};
  const h=createBoundedAuditHandler({getQueue:async()=>queue,isBackgroundEnabled:()=>true,getResearchVersion:()=>'v8',getResearchModel:()=>'claude-sonnet-5-5',getSecret:()=>secret,getLedger:async(req,res,id,options)=>{if(finds===2)assert.equal(options.researchRunId,owner);return ledger;},validateWebsite:async()=>{},runStage:()=>assert.fail('no browser-paid research'),logger:{}});
  const body={action:'start',brief,requestId:'synthetic_request_12345',context:{leadId:'lead1',researchRunId:other}},request={method:'POST',headers:{host:'preview.vercel.app',origin:'https://preview.vercel.app'},body};
  let r=res();await h(request,r);assert.equal(r.code,202);assert.equal(r.body.execution,'background');assert.equal(enqueues,1);
  r=res();await h(request,r);assert.equal(r.code,202);assert.equal(enqueues,1);assert.equal(r.body.phase,'sector_sources');
 }finally{if(env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=env;}
});
test('a paused background job automatically keeps the offer open without misrepresenting incomplete research',async()=>{
 const env=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const job={id:other,leadId:'lead1',budgetId:token,briefHash:hash,state:'paused',phase:'sector_gate',diagnostic:{code:'research_stage_incomplete'}};
  const queue={find:async()=>job,read:async()=>job},ledger={begin:async()=>{},status:async()=>({id:token,capKurus:5000,chargedKurus:1300}),get:async()=>null,once:async(key,input,amount,run)=>{assert.equal(amount,0);return run();}};
  const h=createBoundedAuditHandler({getQueue:async()=>queue,isBackgroundEnabled:()=>true,getResearchVersion:()=>'v8',getResearchModel:()=>'claude-sonnet-5-5',getSecret:()=>secret,getLedger:async()=>ledger,validateWebsite:async()=>{},getProviders:()=>assert.fail('no paid provider'),logger:{}});
  const request={method:'POST',headers:{host:'preview.vercel.app',origin:'https://preview.vercel.app'},body:{action:'start',brief,requestId:'synthetic_request_12345',context:{leadId:'lead1'}}};
  const r=res();await h(request,r);
  assert.equal(r.code,200);assert.equal(r.body.phase,'complete');assert.equal(r.body.result.data.researchContinuity.status,'unavailable');assert.equal(r.body.result.data.quality.contentComplete,false);assert.equal(r.body.result.cost.chargedKurus,1300);assert.ok(r.body.pricingProof);
 }finally{if(env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=env;}
});

test('an active background job can hand off to the offer and refuses any subsequent paid reservation',async()=>{
 const env=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 const f=await fixture();
 try{
  await f.enqueue();
  const job=await f.queue.claim(),workerLedger=await f.queue.getLedger(job);
  const h=createBoundedAuditHandler({getQueue:async()=>f.queue,isBackgroundEnabled:()=>true,getResearchVersion:()=>'v8',getResearchModel:()=>'claude-sonnet-5-5',getSecret:()=>secret,getLedger:async()=>f.ledger,validateWebsite:async()=>{},getProviders:()=>assert.fail('continuation cannot open a paid provider'),logger:{}});
  const request={method:'POST',headers:{host:'preview.vercel.app',origin:'https://preview.vercel.app'},body:{action:'start',brief,requestId:'synthetic_request_12345',context:{leadId:'synthetic-bhs'}}};
  let r=res();await h(request,r);assert.equal(r.code,202);assert.equal(r.body.continuationAvailable,true);
  const ticket=r.body.ticket,cookie=r.headers['Set-Cookie'][0].split(';')[0],cost=await f.ledger.status();
  r=res();await h({...request,headers:{...request.headers,cookie},body:{...request.body,action:'continue',ticket}},r);
  assert.equal(r.code,200);assert.equal(r.body.result.data.quality.contentComplete,false);assert.ok(r.body.pricingProof);
  assert.equal((await f.queue.read(job)).cancelRequested,true);
  await assert.rejects(workerLedger.once('new-paid-call',{},100,async()=>assert.fail()),/cancellation/);
  assert.deepEqual(await f.ledger.status(),cost);
 }finally{await f.close();if(env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=env;}
});

test('lost queue acknowledgements and expired leases recover committed phases without another provider call',async()=>{
 for(const expires of [false,true]){
  const f=await fixture();try{
   await f.enqueue();const job=await f.queue.claim();let paid=0;
   const providers={checkpoint:(name,input,run)=>run(),manager:async()=>{paid++;return{data:{instruction:'Kaynaklarla markayı anla.',queries:[]}};}};
   const runStage=opts=>runBoundedStage({...opts,providers,collect:fakeCollector()});
   const failedQueue={...f.queue,advance:async()=>{throw Error('synthetic lost ack');},...(expires?{pause:async()=>{throw Error('synthetic process terminated');}}:{})};
   await assert.rejects(runClaimedBhsStage({job,queue:failedQueue,getLedger:f.queue.getLedger,getProviders:async()=>providers,runStage}),/lost ack/);
   if(expires)await f.db.query("update public.pipeline_bhs_jobs set lease_until=now()-interval '1 second' where id=$1",[job.id]);
   const cost=await f.ledger.status(),retry=await f.queue.claim();assert.equal(retry.phase,'brand_plan');
   await runClaimedBhsStage({job:retry,queue:f.queue,getLedger:f.queue.getLedger,getProviders:()=>assert.fail('committed replay must not open providers'),runStage});
   assert.equal((await f.queue.read(job)).phase,'brand_sources');assert.equal(paid,1);assert.deepEqual(await f.ledger.status(),cost);
  }finally{await f.close();}
 }
});
test('a concurrent background enqueue reconnects its winning account and ticket',async()=>{
 const env=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';try{
  const winning={id:other,leadId:'lead1',budgetId:token,briefHash:hash,state:'queued',phase:'sector_sources',researchRunId:owner};
  let binds=0;const initial={begin:async()=>{},status:async()=>({id:other,chargedKurus:500,capKurus:5000})},original={status:async()=>({id:token,chargedKurus:1500,capKurus:5000})};
  const h=createBoundedAuditHandler({getQueue:async()=>({find:async()=>null,enqueue:async()=>winning,read:async()=>winning}),isBackgroundEnabled:()=>true,getResearchVersion:()=>'v8',getResearchModel:()=>'claude-sonnet-5-5',getSecret:()=>secret,getLedger:async(req,res,id,options)=>{binds++;if(binds===1)return initial;assert.equal(options.researchRunId,owner);return original;},validateWebsite:async()=>{},logger:{}});
  const r=res();await h({method:'POST',headers:{host:'preview.vercel.app',origin:'https://preview.vercel.app'},body:{action:'start',brief,requestId:'synthetic_request_12345',context:{leadId:'lead1',researchRunId:other}}},r);
  assert.equal(r.code,202);assert.equal(binds,2);assert.equal(r.body.cost.id,token);assert.equal(r.body.cost.chargedKurus,1500);
 }finally{if(env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=env;}
});
test('completed research requiring content review advances with grounded findings and checked scope at zero extra cost',async()=>{
 const env=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';try{
  const context=sequentialContext(brief,{packet:packet(),searches:[]});
  const input={...stageModelInput(context),peerReview:plan.entities.filter(e=>e.role==='competitor').map(e=>({entityId:e.id,relationship:'direct',sourceIds:[[...context.known.keys()].find(id=>context.known.get(id).url===e.website)],reason:'Same product and market.'}))};
  const report=projectExpertReport(modelAnswer('v8-report-draft',input),context),synthesis={report,methodologyVersion:sequentialVersion,analysisPacket:packet(),model:'claude-sonnet-5-5',supervision:{acceptance:{passed:false},finalDecision:'limited',stageDecisions:[],swot:[]}};
  const job={id:other,leadId:'lead1',budgetId:token,briefHash:hash,state:'complete',phase:'complete'};
  const scope={scopePlan:{},proposalCopy:{}},ledger={begin:async()=>{},status:async()=>({id:token,capKurus:5000,chargedKurus:2200}),get:async key=>({state:'complete',value:key===stageKey(brief,'synthesis','v8')?synthesis:scope}),once:()=>assert.fail('completed research already persisted')};
  const h=createBoundedAuditHandler({getQueue:async()=>({find:async()=>job,read:async()=>job}),isBackgroundEnabled:()=>true,getResearchVersion:()=>'v8',getResearchModel:()=>'claude-sonnet-5-5',getSecret:()=>secret,getLedger:async()=>ledger,validateWebsite:async()=>{},getProviders:()=>assert.fail('no paid provider'),logger:{}});
  const request={method:'POST',headers:{host:'preview.vercel.app',origin:'https://preview.vercel.app'},body:{action:'start',brief,requestId:'synthetic_request_12345',context:{leadId:'lead1'}}};
  const r=res();await h(request,r);
  const {result,pricingProof}=r.body;
  assert.equal(r.code,200);assert.equal(result.data.researchContinuity.reason,'quality_review');assert.equal(result.data.quality.contentComplete,false);assert.equal(result.cost.chargedKurus,2200);assert.ok(pricingProof);
  assert.ok(result.data.findings.length>0);assert.ok(result.data.sources.every(source=>source.verification.status==='quote_matched'));
 }finally{if(env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=env;}
});

test('every queue phase acknowledges the same versioned key as the research journal',async()=>{
 const f=await fixture();try{
  const job=await f.enqueue();
  for(const phase of sequentialPhases.slice(0,-1)){
   const claim=await f.queue.claim();assert.equal(claim.phase,phase);
   const ledger=await f.queue.getLedger(claim),key=stageKey(brief,phase,'v8');
   await ledger.once(key,{phase},0,async()=>({phase}));
   await f.queue.advance(claim,{nextPhase:sequentialPhases[sequentialPhases.indexOf(phase)+1],checkpointKey:key});
  }
  assert.equal((await f.queue.read(job)).state,'complete');
 }finally{await f.close();}
});

test('Vault authorization never exposes the worker credential and denies jobs when the private RPC rejects it',async()=>{
 for(const authorized of [true,false]){
  const paths=[];const gateway=createBhsGatewayActions({mode:'production',env:()=>undefined,db:async(path,{body})=>{paths.push(path);if(path.endsWith('pipeline_bhs_worker_authorized')){assert.equal(body.p_secret,secret);return authorized;}return null;},user:async()=>assert.fail('Worker has no browser user'),validateLead:async()=>assert.fail('Worker has no browser lead')});
  const run=()=>gateway({action:'bhs_job_claim',workerSecret:secret,leaseToken:token});
  if(authorized){assert.equal(await run(),null);assert.equal(paths.length,2);}else{await assert.rejects(run(),/authorization/);assert.equal(paths.length,1);}
 }
});

test('private production readiness cannot claim a job and requires the same worker authorization',async()=>{
 const h=createBhsWorkerHandler({enabled:()=>true,secret:()=>secret,getQueue:()=>assert.fail('No job may be claimed'),readiness:()=>async(_req,r)=>r.status(200).json({paidCalls:0,configured:true})});
 const r=res();await h({method:'POST',headers:{authorization:'Bearer '+secret},body:{action:'readiness'}},r);assert.equal(r.code,200);assert.equal(r.body.paidCalls,0);
 const denied=res();await h({method:'POST',headers:{authorization:'Bearer '+'x'.repeat(43)},body:{action:'readiness'}},denied);assert.equal(denied.code,401);
});

test('an explicit phase-bound budget recovery resumes only the free coordinator and reuses earlier paid work',async()=>{
 const f=await fixture();try{
  await f.enqueue();const job=await f.queue.claim(),ledger=await f.queue.getLedger(job),key=stageKey(brief,job.phase,'v8');let purchases=0;
  const execute=opts=>opts.ledger.once(key,{brief,phase:job.phase,version:'bounded-bhs-v1'},0,async()=>{await opts.ledger.once('already-paid',{},100,async()=>{purchases++;return {saved:true};});return {phase:job.phase};});
  await assert.rejects(ledger.once(key,{brief,phase:job.phase,version:'bounded-bhs-v1'},0,async()=>{await ledger.once('already-paid',{},100,async()=>{purchases++;return {saved:true};});throw Object.assign(Error('preflight blocked'),{code:'budget_limit'});}));
  await assert.rejects(runClaimedBhsStage({job,queue:f.queue,getLedger:f.queue.getLedger,getProviders:async()=>({}),runStage:execute}),e=>e.code==='stage_paused');
  const before=await f.ledger.status();
  await f.db.query("update public.pipeline_bhs_jobs set state='queued',spec=spec||$2::jsonb where id=$1",[job.id,JSON.stringify({budgetRecoveryVersion:'shared-budget-v1',budgetRecoveryPhase:job.phase})]);
  const authorized=await f.queue.claim();await runClaimedBhsStage({job:authorized,queue:f.queue,getLedger:f.queue.getLedger,getProviders:async()=>({}),runStage:execute});
  assert.equal(purchases,1);assert.deepEqual(await f.ledger.status(),before);assert.equal((await f.queue.read(authorized)).phase,'brand_sources');
 }finally{await f.close();}
});
test('recovering measured compute never erases an older unmeasured commitment',async()=>{
 const f=await localBudget();try{
  const job={id:other,phase:'competition_review',briefHash:hash};
  await assert.rejects(f.ledger.once('infra:v8:competition_review:'+hash,{jobId:other,phase:job.phase,region:'iad1'},400,async()=>{throw Object.assign(Error('old admission failure'),{code:'budget_limit'});}));
  const before=await f.ledger.status();let time=0;
  const recovered={...job,budgetRecoveryVersion:'shared-budget-v1',budgetRecoveryPhase:job.phase};
  const result=await meteredBhsStage({job:recovered,ledger:f.ledger,region:'iad1',clock:()=>time,cpu:()=>({user:0,system:0}),run:async()=>{time+=1000;}});
  assert.equal((await f.ledger.get('infra:v8:competition_review:'+hash)).state,'uncertain');assert.equal((await f.ledger.status()).chargedKurus,before.chargedKurus+result.accountedKurus);assert.ok(result.accountedKurus>0);
 }finally{await f.close();}
});

test('production starts a new background BHS with the same brief without resuming or charging the paused run',async()=>{
 const f=await fixture(),env=process.env.VERCEL_ENV,enabled=process.env.OFFER_PRODUCTION_ENABLED;
 process.env.VERCEL_ENV='production';process.env.OFFER_PRODUCTION_ENABLED='true';
 try{
  await f.db.exec('reset role; create table public.pipeline_offer_budgets (like public.pipeline_offer_preview_budgets including all); create table public.pipeline_offer_budget_steps (like public.pipeline_offer_preview_budget_steps including all); create table public.spaces(id text primary key,user_id uuid); create table public.leads(id text primary key,space_id text); grant select on public.spaces,public.leads to service_role; grant select,insert,update on public.pipeline_offer_budgets,public.pipeline_offer_budget_steps to service_role;');
  await f.db.exec(await readFile(new URL('../schema/offer-variants-budget.sql',import.meta.url),'utf8'));
  await f.db.query('insert into public.spaces values($1,$2)',['space',owner]);
  await f.db.query('insert into public.leads values($1,$2)',['synthetic-bhs','space']);
  await f.db.exec('set role service_role;');
  const gateway=createBhsGatewayActions({mode:'production',env:k=>k==='BHS_WORKER_SECRET'?secret:undefined,
   user:async jwt=>{assert.equal(jwt,'synthetic-jwt');return {id:owner};},validateLead:async lead=>assert.equal(lead,'synthetic-bhs'),cryptoImpl:webcrypto,
   db:async(_path,{body})=>(await f.db.query('select public.pipeline_bhs_job_op($1,$2,$3,$4,$5,$6,$7) as value',
    [body.p_mode,body.p_op,body.p_owner,body.p_lead,body.p_id,body.p_token,JSON.stringify(body.p_data)])).rows[0].value});
  const queue=createBhsJobStore({store:{call:(action,body)=>gateway({action,...body})},jwt:'synthetic-jwt',workerSecret:secret});
  const budget=runId=>createLedger(async(op,args={})=>(await f.db.query('select public.pipeline_offer_additional_budget_op($1,$2,$3,$4,$5,$6,$7,$8,$9) as value',
   [owner,'synthetic-bhs',runId,op,args.step||null,args.hash||null,args.amount||0,args.token||null,JSON.stringify(args.value??null)])).rows[0].value);
  const firstId=other,nextId=token,oldLedger=budget(firstId),newLedger=budget(nextId);
  await oldLedger.begin();
  await oldLedger.once('prior-paid-research',{},1485,async()=>({retained:true}));
  const old=await queue.enqueue({leadId:'synthetic-bhs',researchVersion:'v8',researchModel:'claude-sonnet-5-5',researchRunId:firstId},brief,await oldLedger.status());
  await queue.pause(await queue.claim(),{code:'incomplete'});
  const h=createBoundedAuditHandler({getQueue:async()=>queue,isBackgroundEnabled:()=>true,getResearchVersion:()=>'v8',getResearchModel:()=>'claude-sonnet-5-5',
   getSecret:()=>secret,getLedger:async(_req,_res,_lead,{researchRunId})=>{assert.equal(researchRunId,nextId);return newLedger;},
   validateWebsite:async()=>{},getProviders:()=>assert.fail('no browser-side research'),logger:{}});
  const request={method:'POST',headers:{host:'sales.example.com',origin:'https://sales.example.com',cookie:'__Host-offer-research='+secret},
   body:{action:'start',brief,requestId:'synthetic_fresh_start',context:{leadId:'synthetic-bhs',researchRunId:nextId}}};
  let r=res();await h(request,r);assert.equal(r.code,202,JSON.stringify(r.body));assert.equal(r.body.cost.chargedKurus,500);assert.equal(r.body.cost.capKurus,5000);
  const fresh=await queue.find('synthetic-bhs',queuedBhsBrief(brief,nextId).hash);
  assert.notEqual(fresh.id,old.id);assert.notEqual(fresh.budgetId,old.budgetId);assert.equal(fresh.briefHash,hash);assert.deepEqual(fresh.brief,brief);
  r=res();await h(request,r);assert.equal(r.code,202);assert.equal((await queue.find('synthetic-bhs',fresh.queueBriefHash)).id,fresh.id);
  const claim=await queue.claim();assert.equal(claim.id,fresh.id);
  await runClaimedBhsStage({job:claim,queue,getLedger:queue.getLedger,
   runStage:opts=>runBoundedStage({...opts,collect:fakeCollector()}),
   getProviders:()=>({checkpoint:(_name,_input,run)=>run(),manager:async(_stage,input)=>{
    assert.deepEqual(input.brief,brief);
    return {data:{instruction:'Kaynaklarla markayı anla.',queries:[]}};
   }})});
  assert.equal((await queue.read(fresh)).phase,'brand_sources');
  assert.equal((await newLedger.get(stageKey(brief,'brand_plan','v8',fresh.queueBriefHash))).state,'complete');
  const statusRequest={...request,body:{action:'status',brief,ticket:r.body.ticket}};
  r=res();await h(statusRequest,r);assert.equal(r.code,202);assert.equal(r.body.phase,'brand_sources');
  await queue.pause(await queue.claim(),{code:'incomplete'});
  r=res();await h(statusRequest,r);assert.equal(r.code,200);assert.equal(r.body.result.data.briefHash,hash);assert.ok(r.body.pricingProof);
  assert.equal((await queue.read(old)).state,'paused');
  assert.equal((await oldLedger.status()).chargedKurus,1985);
 }finally{
  if(env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=env;
  if(enabled===undefined)delete process.env.OFFER_PRODUCTION_ENABLED;else process.env.OFFER_PRODUCTION_ENABLED=enabled;
  await f.close();
 }
});
