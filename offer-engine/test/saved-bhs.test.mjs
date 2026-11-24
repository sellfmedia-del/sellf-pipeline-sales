import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createReuseHandler} from '../api/offer-reuse.js';
import {createPricingHandler} from '../api/pricing.js';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {stageKey} from '../src/bhs/direct-research.mjs';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {memoryLedger,offerFixture,response,runId} from './fixtures/offer.mjs';

const host='saved-bhs.preview.example',secret='synthetic-archive-secret',session='s'.repeat(43),jwt='j'.repeat(40);
const context={leadId:'lead-1',spaceId:'space-1'};
const req=(body,cookie=session)=>({method:'POST',headers:{host,origin:'https://'+host,authorization:'Bearer '+jwt,...(cookie?{cookie:'__Host-offer-research='+cookie}:{})},body});

test('completing a Pipeline analysis saves it before pricing and a storage failure leaves the paid result usable',async()=>{
 const old=process.env.VERCEL_ENV,oldProduction=process.env.OFFER_PRODUCTION_ENABLED;
 process.env.VERCEL_ENV='production';process.env.OFFER_PRODUCTION_ENABLED='true';
 try{
  const f=await offerFixture();
  const completed=memoryLedger(['source_plan','evidence','synthesis','scope'].map(phase=>[
   stageKey(f.brief,phase,'v5'),{state:'complete',value:phase==='synthesis'?f.synthesis:phase==='scope'?{scopePlan:f.scope,proposalCopy:f.copy}:{}}
  ]));
  for(const storageAvailable of [true,false]){
   let saved=0;
   const handler=createBoundedAuditHandler({
    getLedger:async()=>completed,getSecret:()=>secret,getResearchVersion:()=>'v5',
    validateWebsite:async()=>{},getProviders:()=>assert.fail('no new research'),runStage:()=>assert.fail('no paid stage replay'),logger:{},
    getArchiveStore:()=>({call:async(action,record)=>{
     assert.equal(action,'saved_bhs_save');assert.equal(record.spaceId,context.spaceId);assert.equal(record.leadId,context.leadId);
     assert.equal(record.jwt,jwt);assert.ok(record.audit.data.findings.length);saved++;
     if(!storageAvailable)throw Error('Unavailable storage');
     return {id:record.id};
    }})
   });
   const res=response();
   await handler(req({action:'start',brief:f.brief,requestId:'recoverable-bhs-test',context:{...context,researchRunId:runId}}),res);
   assert.equal(res.code,200,JSON.stringify(res.data));assert.equal(saved,1);
   assert.equal(res.data.savedBhs.status,storageAvailable?'saved':'retry');
   assert.equal(res.data.result.status,'ready');assert.ok(res.data.pricingProof);
  }
 }finally{
  if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;
  if(oldProduction===undefined)delete process.env.OFFER_PRODUCTION_ENABLED;else process.env.OFFER_PRODUCTION_ENABLED=oldProduction;
 }
});

test('signed BHS recovery survives a new session and returns to pricing without a budget or provider',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const f=await offerFixture(),archive=new Map();
  const getStore=()=>({call:async(action,body)=>{
   if(body.leadId!==context.leadId||body.spaceId!==context.spaceId)throw Error('BHS farklı karta ait.');
   assert.equal(body.jwt,jwt);
   if(action==='saved_bhs_save'){
    if(!archive.has(body.id)){
     // Postgres jsonb can change property order, including the archived brief.
     const brief=Object.fromEntries(Object.entries(body.brief).reverse());
     archive.set(body.id,{id:body.id,brief,audit:structuredClone(body.audit),created_at:'2026-11-20T12:00:00.000Z'});
    }
    return {id:body.id};
   }
   if(action==='saved_bhs_list')return [...archive.values()].map(row=>({id:row.id,created_at:row.created_at}));
   assert.equal(action,'saved_bhs_detail');
   if(!archive.has(body.id))throw Error('BHS bulunamadı.');
   return structuredClone(archive.get(body.id));
  }});
  const handler=createReuseHandler({getStore,getSecret:()=>secret,getLedger:()=>assert.fail('no BHS budget'),getProviders:()=>assert.fail('no model provider')});
  const codec=createPricingProof(secret);
  const pricingProof=codec.encode({kind:'audit_ready',createdAt:Date.now(),briefHash:f.hash,auditHash:digest(f.audit),budgetLeadId:context.leadId},session,host);
  const saveBody={action:'saved-save',context,brief:f.brief,audit:f.audit,pricingProof};
  const tampered=response();
  await handler(req({...saveBody,audit:{...f.audit,stage:'other'}}),tampered);
  assert.equal(tampered.code,422);
  assert.equal(archive.size,0);
  for(let i=0;i<2;i++){
   const saved=response();await handler(req(saveBody),saved);
   assert.equal(saved.code,200,JSON.stringify(saved.data));
  }
  assert.equal(archive.size,1);
  const listed=response();await handler(req({action:'saved-list',context},null),listed);
  const [{id:savedReportId}]=listed.data.reports;
  const info=response();await handler(req({action:'saved-info',savedReportId,context},null),info);
  assert.deepEqual(snapshotBrief(info.data.brief),f.brief);
  const brief={...f.brief,needs:'Çalışma kapsamı güncellendi.'};
  const body={action:'saved-prepare',context,savedReportId,researchRunId:runId,brief};
  const wrong=response();await handler(req({...body,context:{...context,spaceId:'space-2'}},null),wrong);
  assert.equal(wrong.code,422);
  const wrongBrand=response();await handler(req({...body,brief:{...brief,brandName:'Başka marka'}},null),wrongBrand);
  assert.equal(wrongBrand.code,422);
  const reused=response();await handler(req(body,null),reused);
  assert.equal(reused.code,200,JSON.stringify(reused.data));
  assert.equal(reused.data.cost.chargedKurus,0);
  assert.equal(reused.data.result.data.researchReuse.contextNeedsConfirmation,true);
  assert.deepEqual(reused.data.result.data.findings,f.audit.data.findings);
  const newSession=reused.headers['Set-Cookie'].split(';')[0].split('=')[1],priced=response();
  await createPricingHandler({getSecret:()=>secret})(req({
   action:'start',brief,audit:reused.data.result,pricingProof:reused.data.pricingProof,
   serviceSelection:{alternatives:[{id:'growth_operations',services:[{serviceId:'meta'}]},{id:'operations_bundle',services:[]}]}
  },newSession),priced);
  assert.equal(priced.code,200,JSON.stringify(priced.data));
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});

test('isolated migration keeps BHS private and repeated saves leave one immutable report',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key)');
  const migration=await readFile(new URL('../../supabase/migrations/20261124121000_pipeline_saved_bhs.sql',import.meta.url),'utf8');
  await db.exec(migration);
  await db.exec('set role service_role');
  const id='f'.repeat(64);
  const insert="insert into public.pipeline_saved_bhs(id,lead_id,space_id,brief,audit) values ($1,'lead-1','space-1',$2,$3) on conflict (id) do nothing";
  await db.query(insert,[id,{brandName:'Örnek Marka'},{status:'ready'}]);
  await db.query(insert,[id,{brandName:'Değişen marka'},{status:'ready'}]);
  const {rows}=await db.query('select brand_name from public.pipeline_saved_bhs where id=$1',[id]);
  assert.deepEqual(rows,[{brand_name:'Örnek Marka'}]);
  await db.exec('set role authenticated');
  await assert.rejects(()=>db.query('select * from public.pipeline_saved_bhs'),/permission denied/);
 }finally{await db.close();}
});
