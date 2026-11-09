import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createLedger} from '../../src/budget/ledger.mjs';
const owner='11111111-1111-4111-8111-111111111111';
export async function localBudget({dataDir,lead='synthetic-bhs',seed}={}){
 const db=new PGlite(dataDir);
 if(!(await db.query("select to_regclass('public.pipeline_offer_preview_budgets') as table_name")).rows[0].table_name){
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table public.pipeline_offer_preview_leads(owner_id uuid,id text);grant select on public.pipeline_offer_preview_leads to service_role;');
  await db.exec(await readFile(new URL('../../schema/preview-budget.sql',import.meta.url),'utf8'));
 }
 await db.query('insert into public.pipeline_offer_preview_leads(owner_id,id) select $1,$2 where not exists(select 1 from public.pipeline_offer_preview_leads where owner_id=$1 and id=$2)',[owner,lead]);
 await db.exec('set role service_role;');
 const call=async(op,a={})=>(await db.query('select public.pipeline_offer_budget_op($1,$2,$3,$4,$5,$6,$7,$8) as value',[owner,lead,op,a.step||null,a.hash||null,a.amount||0,a.token||null,a.value===undefined?null:JSON.stringify(a.value)])).rows[0].value;
 const ledger=createLedger(call);await ledger.begin();
 if(seed){
  const budget=await ledger.status(),existing=await db.query('select count(*)::integer as count from public.pipeline_offer_preview_budget_steps where budget_id=$1',[budget.id]);
  if(existing.rows[0].count)throw Error('QA seed cannot overwrite an existing budget.');
  const charged=500+seed.reduce((sum,r)=>sum+r.charge_kurus,0);
  if(!Number.isSafeInteger(charged)||charged>5000||seed.some(r=>!['complete','uncertain','reserved'].includes(r.state)||!Number.isSafeInteger(r.charge_kurus)||r.charge_kurus<0))throw Error('Invalid QA budget seed.');
  for(const r of seed)await db.query('insert into public.pipeline_offer_preview_budget_steps(budget_id,step_key,input_hash,charge_kurus,claim_token,state,value) values($1,$2,$3,$4,$5,$6,$7)',[budget.id,r.step_key,r.input_hash,r.charge_kurus,r.claim_token,r.state,JSON.stringify(r.value)]);
  await db.query('update public.pipeline_offer_preview_budgets set charged_kurus=$1 where id=$2',[charged,budget.id]);
 }
 return {db,ledger,call,close:()=>db.close(),receipts:async()=>{
  const status=await ledger.status();return (await db.query('select * from public.pipeline_offer_preview_budget_steps where budget_id=$1 order by created_at,step_key',[status.id])).rows;
 }};
}
