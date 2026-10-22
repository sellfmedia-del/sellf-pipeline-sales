import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {teamDatabase,users,tokens,gatewayKey,portalSecret} from './fixtures/team-db.mjs';
import {offerFixture,response} from './fixtures/offer.mjs';
import {createPreviewStore} from '../src/proposal/preview-store.mjs';
import {createOfferHandler} from '../api/offer.js';
const snapshot=async db=>Object.fromEntries(await Promise.all(['spaces','leads','pipeline_offer_versions','pipeline_offer_price_history','pipeline_offer_budgets','pipeline_offer_budget_steps'].map(async table=>[table,(await db.query('select to_jsonb(t) as row from '+table+' t order by to_jsonb(t)::text')).rows])));
test('PostgreSQL: shared team reads/publishes/updates/reuses offers, preserves existing rows and rejects invalid actors',async()=>{
 const env={...process.env};process.env.VERCEL_ENV='production';process.env.OFFER_PRODUCTION_ENABLED='true';
 const {db,rpc,gateway,apply}=await teamDatabase();
 try{
  const f=await offerFixture(),args={p_owner:users[0],p_lead_id:'lead-1',p_space_id:'space-1',p_request_id:'synthetic-original-request',p_document:f.row.customer_document,p_pricing:f.pricing.data};
  const saved=await rpc('save_pipeline_offer_production',args);
  const store=createPreviewStore({production:true,enabled:true,url:'https://fixture.supabase.co/functions/v1/pipeline-offer-store',key:gatewayKey,portalSecret,platformJwt:'platform-fixture',fetchImpl:(url,init)=>gateway(new Request(url,init))});
  const handler=createOfferHandler({getStore:()=>store,getPortalSecret:()=>portalSecret});
  const api=async(user,body)=>{const out=response();await handler({method:'POST',headers:{host:'sales.example',origin:'https://sales.example',authorization:'Bearer '+tokens[user]},body},out);return out;};
  // Reproduce the observed drift before migrating. The creator is blocked.
  await db.query('update spaces set user_id=$1',[users[1]]);
  await assert.rejects(()=>rpc('publish_pipeline_offer_link',{p_owner:users[1],p_offer:saved.id,p_slug:'brand-teklifi',p_expected_envelope:null,p_token_hash:'a'.repeat(64),p_password_hash:'b'.repeat(64),p_envelope:'fixture'}),/Offer not owned/);
  const before=await snapshot(db);await apply();assert.deepEqual(await snapshot(db),before,'migration must not change any existing row');
  await assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role service_role');await tx.query('select * from auth.users');}),'worker must not get full Auth table access');
  for(const user of [0,1,2]){
   const result=await api(user,{action:'list',leadId:'lead-1'});assert.equal(result.code,200,JSON.stringify(result.data));assert.equal(result.data.offers[0].id,saved.id);
   assert.equal((await api(user,{action:'detail',offerId:saved.id})).data.offer.id,saved.id);
  }
  // A teammate publishes the original draft; everyone recovers the same link.
  const published=await api(1,{action:'publish',offerId:saved.id});assert.equal(published.code,200,JSON.stringify(published.data));
  for(const user of [0,1,2]){
   const offer=(await api(user,{action:'list',leadId:'lead-1'})).data.offers[0];assert.equal(offer.publicUrl,published.data.url);assert.equal(offer.password,published.data.password);
   const again=await api(user,{action:'publish',offerId:saved.id});assert.equal(again.data.url,published.data.url);assert.equal(again.data.password,published.data.password);
  }
  const leadBefore=(await db.query('select * from leads')).rows;
  const detail=await api(2,{action:'detail',offerId:saved.id}),amounts=Object.fromEntries(detail.data.priceTerms.alternatives.map(a=>[a.id,String(a.current+1000)]));
  const input={action:'prices',offerId:saved.id,requestId:'22222222-2222-4222-8222-222222222222',expectedDocumentHash:detail.data.priceTerms.documentHash,amounts};
  const updated=await api(2,input);assert.equal(updated.code,200,JSON.stringify(updated.data));assert.equal((await api(2,input)).code,200,'retry remains idempotent');
  assert.equal((await api(0,input)).code,422,'a different actor cannot reuse a stale write proof');
  for(const user of [0,1])assert.equal((await api(user,{action:'price_history',offerId:saved.id})).data.changes.length,1);
  assert.deepEqual((await db.query('select * from leads')).rows,leadBefore);
  const row=(await db.query('select * from pipeline_offer_versions where id=$1',[saved.id])).rows[0];assert.equal(row.owner_id,users[0]);assert.equal(row.state,'published');
  const relisted=(await api(0,{action:'list',leadId:'lead-1'})).data.offers[0];assert.equal(relisted.publicUrl,published.data.url);assert.equal(relisted.password,published.data.password);
  const reuseArgs={...args,p_owner:users[1],p_source_offer:saved.id,p_request_id:'synthetic-variant-request',p_pricing:{...f.pricing.data,sourceOfferId:saved.id}};
  const variant=await rpc('save_pipeline_offer_variant',reuseArgs);assert.equal(variant.version,2);assert.equal((await api(0,{action:'catalog',leadId:'lead-1'})).data.offers.length,2);
  assert.deepEqual((await db.query('select * from leads')).rows,leadBefore);
  for(const p_owner of [users[0],users[1]]){
   assert.equal((await rpc('pipeline_offer_production_budget_op',{p_owner,p_lead:'lead-1',p_op:'begin'})).chargedKurus,500);
   assert.equal((await rpc('pipeline_offer_additional_budget_op',{p_owner,p_lead:'lead-1',p_research_run:'33333333-3333-4333-8333-333333333333',p_op:'begin'})).chargedKurus,500);
  }
  // Stale clients cannot transfer space authorship. All other space fields save.
  await db.query("update spaces set user_id=$1,name='Sales updated'",[users[0]]);
  const space=(await db.query('select * from spaces')).rows[0];assert.equal(space.user_id,users[1]);assert.equal(space.name,'Sales updated');
  await db.query('update auth.users set is_anonymous=true where id=$1',[users[2]]);
  assert.equal((await api(2,{action:'list',leadId:'lead-1'})).code,422);
  await assert.rejects(()=>rpc('pipeline_offer_production_budget_op',{p_owner:users[2],p_lead:'lead-1',p_op:'begin'}));
  await assert.rejects(()=>rpc('publish_pipeline_offer_link',{p_owner:'44444444-4444-4444-8444-444444444444',p_offer:saved.id,p_slug:'brand-teklifi',p_expected_envelope:row.operator_link_envelope,p_token_hash:'a'.repeat(64),p_password_hash:'b'.repeat(64),p_envelope:'fake'}));
  // Browser roles still have no direct access to private offers or worker RPCs.
  for(const role of ['anon','authenticated']){
   await assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query('select * from pipeline_offer_versions');}));
   await assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query('select public.pipeline_offer_team_user($1)',[users[0]]);}));
  }
  const beforeRollback=await snapshot(db);await db.exec(await readFile(new URL('../schema/shared-team-offers-rollback.sql',import.meta.url),'utf8'));assert.deepEqual(await snapshot(db),beforeRollback,'rollback must preserve all rows');
 }finally{await db.close();for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
});
test('CRM saves preserve space creator and all other card state',async()=>{
 const html=await readFile(new URL('../../index.html',import.meta.url),'utf8'),source=html.slice(html.indexOf('async function save(){'),html.indexOf('// --- SUPABASE VERİ ÇEKME ---'));
 const calls=[],state={spaces:{s:{id:'s',userId:users[0],name:'Sales',color:'blue',createdAt:1}},columns:{s:[{id:'col',title:'Won',dot:'green'}]},leads:{s:[{id:'lead',colId:'col',name:'Contact',company:'Company',value:'150000',notes:'Notes',docUrl:'https://example.invalid',lastContact:123,contacts:[{name:'Name'}],timeline:[{type:'Meeting'}]}]}};
 const context={db:state,localStorage:{setItem(){}},console,supabaseClient:{auth:{getUser:async()=>({data:{user:{id:users[1]}}})},from:table=>({upsert:async rows=>{calls.push({table,rows});return {};}})}};
 vm.runInNewContext(source,context);await context.save();assert.equal(calls[0].rows[0].user_id,users[0]);assert.equal(calls[2].rows[0].notes,'Notes');assert.equal(calls[2].rows[0].value,'150000');assert.deepEqual(calls[2].rows[0].contacts,state.leads.s[0].contacts);assert.deepEqual(calls[2].rows[0].timeline,state.leads.s[0].timeline);
});
