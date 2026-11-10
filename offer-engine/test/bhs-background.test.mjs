import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {runClaimedBhsStage} from '../src/bhs/background-runner.mjs';
import {stageKey} from '../src/bhs/direct-research.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {brief as raw} from './fixtures/bhs.mjs';
const brief=snapshotBrief(raw),hash=briefHash(brief);
const owner='11111111-1111-4111-8111-111111111111',budget='22222222-2222-4222-8222-222222222222',token='33333333-3333-4333-8333-333333333333';
const job={id:'job1',brief,briefHash:hash,researchVersion:'v7',researchModel:'claude-sonnet-5-5',phase:'workers',leaseToken:token,leaseUntil:999999};
test('background worker completes a phase without browser state and reuses the committed checkpoint after lost ack',async()=>{
 let paid=0;const rows=new Map(),ledger={get:async k=>rows.get(k)},getLedger=async()=>ledger;
 const runStage=async()=>{paid++;rows.set(stageKey(brief,'workers','v7'),{state:'complete',value:{candidates:[]}});};
 const queue={advance:async()=>{throw Error('Ack connection lost');},pause:async()=>{}};
 await assert.rejects(runClaimedBhsStage({job,queue,getLedger,getProviders:async()=>({}),runStage,now:()=>0}));
 const events=[];queue.advance=async(_,v)=>events.push(v);
 const result=await runClaimedBhsStage({job,queue,getLedger,getProviders:async()=>({}),runStage,now:()=>0});
 assert.equal(paid,1);assert.equal(result.nextPhase,'review');assert.equal(events[0].checkpointKey,stageKey(brief,'workers','v7'));
});
test('expired lease, changed brief and abandoned phase cannot restart paid work',async()=>{
 let calls=0;const common={job,queue:{pause:async()=>{},advance:async()=>{}},getLedger:async()=>({get:async()=>({state:'reserved'})}),getProviders:async()=>{calls++;},now:()=>0};
 await assert.rejects(runClaimedBhsStage({...common,job:{...job,leaseUntil:0}}),e=>e.code==='invalid_job');
 await assert.rejects(runClaimedBhsStage({...common,job:{...job,briefHash:'f'.repeat(64)}}),e=>e.code==='changed_brief');
 await assert.rejects(runClaimedBhsStage(common),e=>e.code==='stage_abandoned');assert.equal(calls,0);
});
test('prepared PostgreSQL queue requires private roles, a lease and a committed matching budget checkpoint',async()=>{
 const db=new PGlite();
 try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table public.pipeline_offer_preview_budgets(id uuid primary key,owner_id uuid,lead_id text);create table public.pipeline_offer_preview_budget_steps(budget_id uuid,step_key text,state text);");
  await db.exec('grant select on public.pipeline_offer_preview_budget_steps to service_role;');
  await db.exec(await readFile(new URL('../schema/bhs-supervised-preview-jobs.sql',import.meta.url),'utf8'));
  await db.query('insert into public.pipeline_offer_preview_budgets values($1,$2,$3)',[budget,owner,'synthetic-lead']);
  const inserted=await db.query('insert into public.pipeline_bhs_preview_jobs(budget_id,input_hash,spec) values($1,$2,$3) returning id',[budget,hash,JSON.stringify({brief})]);
  const id=inserted.rows[0].id;
  await db.exec('set role anon;');await assert.rejects(db.query('select * from public.pipeline_bhs_preview_jobs'));await assert.rejects(db.query('select public.pipeline_bhs_preview_job_claim($1)',[token]));await db.exec('reset role;set role service_role;');
  const first=await db.query('select public.pipeline_bhs_preview_job_claim($1) as job',[token]);assert.equal(first.rows[0].job.id,id);
  const duplicate=await db.query('select public.pipeline_bhs_preview_job_claim($1) as job',[owner]);assert.equal(duplicate.rows[0].job,null);
  const checkpoint=stageKey(brief,'source_plan','v7');
  await assert.rejects(db.query('select public.pipeline_bhs_preview_job_advance($1,$2,$3,$4)',[id,owner,'evidence',checkpoint]),/lease mismatch/);
  await assert.rejects(db.query('select public.pipeline_bhs_preview_job_advance($1,$2,$3,$4)',[id,token,'synthesis',checkpoint]),/checkpoint mismatch/);
  await assert.rejects(db.query('select public.pipeline_bhs_preview_job_advance($1,$2,$3,$4)',[id,token,'evidence',checkpoint]),/not committed/);
  await db.exec('reset role;');await db.query('insert into public.pipeline_offer_preview_budget_steps values($1,$2,$3)',[budget,checkpoint,'complete']);await db.exec('set role service_role;');
  const next=await db.query('select public.pipeline_bhs_preview_job_advance($1,$2,$3,$4) as job',[id,token,'evidence',checkpoint]);assert.equal(next.rows[0].job.state,'queued');assert.equal(next.rows[0].job.phase,'evidence');
  await db.query('select public.pipeline_bhs_preview_job_claim($1)',[token]);await db.query("update public.pipeline_bhs_preview_jobs set lease_until=now()-interval '1 minute' where id=$1",[id]);
  const stale=await db.query('select public.pipeline_bhs_preview_job_claim($1) as job',[owner]);assert.equal(stale.rows[0].job,null);assert.equal((await db.query('select state from public.pipeline_bhs_preview_jobs where id=$1',[id])).rows[0].state,'paused');
 }finally{await db.close();}
});
