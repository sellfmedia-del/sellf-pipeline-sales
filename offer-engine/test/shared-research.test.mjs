import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {teamDatabase,users} from './fixtures/team-db.mjs';

test('PostgreSQL shared research is same-card, completed and read-only; paid receipts and budgets remain owner-scoped',async()=>{
 const {db,rpc,apply}=await teamDatabase();
 try{
  await apply();const sql=await readFile(new URL('../schema/shared-research-read.sql',import.meta.url),'utf8');
  const call=(owner,op,extra={})=>rpc('pipeline_offer_production_budget_op',{p_owner:owner,p_lead:'lead-1',p_op:op,...extra});
  for(const owner of users.slice(0,2))await call(owner,'begin');
  const key='research:saved:2965:'+('a'.repeat(64)),contextHash='b'.repeat(64);
  async function complete(owner,step,value,amount=0){const token=randomUUID();await call(owner,'reserve',{p_step:step,p_hash:'f'.repeat(64),p_token:token,p_amount:amount});await call(owner,'complete',{p_step:step,p_hash:'f'.repeat(64),p_token:token,p_value:value,p_amount:amount});}
  const cached={step_key:'audit:synthesis:'+contextHash,created_at:'2026-11-04T08:00:00Z',value:{data:{findings:[{id:'filtered'}]},researchContext:{briefHash:contextHash}}};
  await complete(users[1],key,cached);
  await complete(users[1],'model:synthesis:matched',{data:{findings:[{id:'original'}]},researchContext:{briefHash:contextHash}},100);
  await complete(users[1],'model:synthesis:other-brief',{data:{findings:[{id:'wrong-brief'}]},researchContext:{briefHash:'c'.repeat(64)}},100);
  assert.equal(await call(users[0],'get',{p_step:key}),null,'reproduce owner-only cache before the change');
  const snapshot=async()=>Promise.all(['leads','spaces','pipeline_offer_budgets','pipeline_offer_budget_steps'].map(async table=>(await db.query('select to_jsonb(t) as row from '+table+' t order by to_jsonb(t)::text')).rows));
  const before=await snapshot();await db.exec(sql);assert.deepEqual(await snapshot(),before,'install changes no existing rows');
  const restored=await call(users[0],'get',{p_step:key});assert.equal(restored.state,'complete');assert.equal(restored.value.value.data.findings[0].id,'filtered');assert.equal(restored.value.value.originalModelData.findings[0].id,'original');
  assert.equal(await call(users[0],'get',{p_step:'model:synthesis:matched'}),null,'never share a paid step or receipt');
  assert.equal(await call(users[0],'get',{p_step:'research:saved:2965:'+('d'.repeat(64))}),null);
  assert.deepEqual(await snapshot(),before,'cross-user reads mutate no rows, charges or reservations');
  await complete(users[0],key,{...cached,own:true});assert.equal((await call(users[0],'get',{p_step:key})).value.own,true,'own snapshot has priority');
  const failed='research:saved:2965:'+('e'.repeat(64)),token=randomUUID();await call(users[1],'reserve',{p_step:failed,p_hash:'f'.repeat(64),p_token:token,p_amount:0});await call(users[1],'uncertain',{p_step:failed,p_hash:'f'.repeat(64),p_token:token,p_value:{code:'failed'}});assert.equal(await call(users[0],'get',{p_step:failed}),null);
  await db.query("insert into leads(id,space_id) values('lead-2','space-1')");
  await rpc('pipeline_offer_production_budget_op',{p_owner:users[1],p_lead:'lead-2',p_op:'begin'});
  const other='research:saved:2965:'+('9'.repeat(64)),otherToken=randomUUID();for(const op of ['reserve','complete'])await rpc('pipeline_offer_production_budget_op',{p_owner:users[1],p_lead:'lead-2',p_op:op,p_step:other,p_hash:'f'.repeat(64),p_token:otherToken,p_amount:0,...(op==='complete'?{p_value:cached}:{})});
  assert.equal(await call(users[0],'get',{p_step:other}),null,'another lead cannot supply research');
  await assert.rejects(call('11111111-1111-4111-8111-111111111111','get',{p_step:key}),/owned lead required/);
  assert.deepEqual((await call(users[0],'status')).chargedKurus,500);assert.equal((await call(users[1],'status')).chargedKurus,700);
  await db.exec(await readFile(new URL('../schema/shared-research-read-rollback.sql',import.meta.url),'utf8'));
  assert.equal(await call(users[2],'begin').then(()=>call(users[2],'get',{p_step:key})),null,'rollback restores owner-only reads');
 }finally{await db.close();}
});
