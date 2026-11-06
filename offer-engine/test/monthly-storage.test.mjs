import test from 'node:test';
import assert from 'node:assert/strict';
import {pricingEngine} from '../src/engines/pricing-engine.mjs';
import {proposalEngine} from '../src/engines/proposal-engine.mjs';
import {createPreviewStore} from '../src/proposal/preview-store.mjs';
import {createOfferHandler} from '../api/offer.js';
import {teamDatabase,users,tokens,gatewayKey,portalSecret} from './fixtures/team-db.mjs';
import {offerFixture,response} from './fixtures/offer.mjs';

test('existing PostgreSQL schema saves/publishes/opens a monthly variant without modifying old offers, leads, contacts, notes, history or budgets',async()=>{
 const env={...process.env};process.env.VERCEL_ENV='production';process.env.OFFER_PRODUCTION_ENABLED='true';
 const {db,rpc,gateway,apply}=await teamDatabase();
 try{
  await apply();const f=await offerFixture(),args={p_owner:users[0],p_lead_id:'lead-1',p_space_id:'space-1',p_request_id:'original-monthly-fixture',p_document:f.row.customer_document,p_pricing:f.pricing.data};
  const old=await rpc('save_pipeline_offer_production',args);
  const snapshot=async()=>Object.fromEntries(await Promise.all(['spaces','leads','pipeline_offer_price_history','pipeline_offer_budgets','pipeline_offer_budget_steps'].map(async table=>[table,(await db.query('select to_jsonb(t) as row from '+table+' t order by to_jsonb(t)::text')).rows])));
  const before=await snapshot(),oldBefore=(await db.query('select * from pipeline_offer_versions where id=$1',[old.id])).rows[0];
  const monthlyPlan={months:[{month:1,services:[{serviceId:'webmaster'}]},{month:2,services:[{serviceId:'brand_marketing'}]},{month:3,services:[{serviceId:'social'},{serviceId:'meta'}]}]};
  const pricing={stage:'pricing',...await pricingEngine.run({brief:f.brief,pricingMode:'monthly',monthlyPlan},{audit:f.audit})};
  pricing.data.sourceOfferId=old.id;
  const doc=(await proposalEngine.run({brief:f.brief,copy:f.copy},{...f,pricing})).data;doc.logo.reviewed=true;
  const variantArgs={...args,p_owner:users[1],p_source_offer:old.id,p_request_id:'new-monthly-fixture',p_document:doc,p_pricing:pricing.data};
  const saved=await rpc('save_pipeline_offer_variant',variantArgs);assert.equal(saved.version,2);assert.equal((await rpc('save_pipeline_offer_variant',variantArgs)).id,saved.id,'lost-response retry must not create another version');
  const store=createPreviewStore({production:true,enabled:true,url:'https://fixture.supabase.co/functions/v1/pipeline-offer-store',key:gatewayKey,portalSecret,platformJwt:'platform-fixture',fetchImpl:(url,init)=>gateway(new Request(url,init))});
  const handler=createOfferHandler({getStore:()=>store,getPortalSecret:()=>portalSecret});
  const api=async(body,user=2)=>{const out=response();await handler({method:'POST',headers:{host:'sales.example',origin:'https://sales.example',authorization:'Bearer '+tokens[user]},body},out);return out;};
  const detail=await api({action:'detail',offerId:saved.id});assert.equal(detail.code,200,JSON.stringify(detail.data));assert.equal(detail.data.priceTerms.readOnly,true);assert.deepEqual(detail.data.offer.customer_document.monthlyPlan,doc.monthlyPlan);
  const published=await api({action:'publish',offerId:saved.id});assert.equal(published.code,200,JSON.stringify(published.data));
  const link=await api({action:'list',leadId:'lead-1'},0);assert.equal(link.data.offers[0].publicUrl,published.data.url);
  const accessed=await api({action:'access',slug:new URL(published.data.url).pathname.slice(1),password:published.data.password});assert.equal(accessed.code,200,JSON.stringify(accessed.data));assert.deepEqual(accessed.data.document.monthlyPlan,doc.monthlyPlan);
  const bad=await api({action:'prices',offerId:saved.id,requestId:'22222222-2222-4222-8222-222222222222',expectedDocumentHash:detail.data.priceTerms.documentHash,amounts:{growth_operations:1,operations_bundle:1}});assert.equal(bad.code,422);
  assert.deepEqual(await snapshot(),before);
  assert.deepEqual((await db.query('select * from pipeline_offer_versions where id=$1',[old.id])).rows[0],oldBefore);
  assert.equal((await db.query('select count(*)::integer as count from pipeline_offer_versions')).rows[0].count,2);
 }finally{await db.close();for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);}
});
