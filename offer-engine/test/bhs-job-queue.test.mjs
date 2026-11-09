import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {localBudget} from './fixtures/local-budget.mjs';
import {brief,fakeCollector} from './fixtures/sequential.mjs';
import {briefHash} from '../src/bhs/brief.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {runClaimedBhsStage} from '../src/bhs/background-runner.mjs';
import {createBhsJobStore} from '../src/bhs/job-store.mjs';
import {createBhsGatewayActions} from '../../supabase/functions/_shared/bhs-jobs.mjs';
import {createBhsWorkerHandler} from '../src/bhs/job-worker.mjs';
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
test('worker compute reserves its worst-case envelope in the same account, settles usage and retains uncertain cost',async()=>{
 const f=await localBudget();try{
  let time=0,calls=0;const job={id:other,phase:'brand_plan',briefHash:hash},options={job,ledger:f.ledger,region:'iad1',clock:()=>time,cpu:arg=>arg?{user:100000,system:100000}:{user:0,system:0},run:async()=>{calls++;time+=100000;}};
  const result=await meteredBhsStage(options);assert.ok(result.accountedKurus>0&&result.accountedKurus<workerInfraReservationKurus);assert.equal((await f.ledger.status()).chargedKurus,500+result.accountedKurus);
  await meteredBhsStage(options);assert.equal(calls,1);
  await assert.rejects(meteredBhsStage({...options,region:'unknown'}),e=>e.code==='infra_tariff_unverified');
  await assert.rejects(meteredBhsStage({...options,job:{...job,phase:'sector_sources'},run:async()=>{throw Error('lost worker');}}));assert.equal((await f.ledger.status()).chargedKurus,500+result.accountedKurus+workerInfraReservationKurus);
 }finally{await f.close();}
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
