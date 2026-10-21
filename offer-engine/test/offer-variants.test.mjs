import test from 'node:test';
import assert from 'node:assert/strict';
import {offerFixture,memoryLedger,response,sourceId,runId,fx} from './fixtures/offer.mjs';
import {priceTerms,negotiatedDocument,monetaryAmount} from '../src/proposal/negotiation.mjs';
import {assertQuote,addQuote} from '../src/pricing/currency.mjs';
import {createReuseHandler,loadSavedSynthesis} from '../api/offer-reuse.js';
import {createPricingHandler} from '../api/pricing.js';
import {createProposalHandler} from '../api/proposal.js';
import {createOfferHandler} from '../api/offer.js';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {stageKey} from '../src/bhs/direct-research.mjs';
const host='preview.vercel.app',secret='synthetic-variant-secret',session='s'.repeat(43),jwt='j'.repeat(40);
const req=body=>({method:'POST',headers:{host,origin:'https://'+host,authorization:'Bearer '+jwt,cookie:'__Host-offer-research='+session},body});
function stripPrices(doc){const d=structuredClone(doc);d.alternatives.forEach(a=>delete a.monthlyAmount);d.quote?.alternatives.forEach(a=>delete a.monthlyAmount);if(d.valueSync)delete d.valueSync.amount;return d;}
test('negotiation changes only prices, preserves original cost basis and publication, and requires explicit below-floor acknowledgement',async()=>{
 const f=await offerFixture(),before=structuredClone(f.row);f.row.customer_document.publication={slug:'test-brand-teklifi'};
 const amounts={growth_operations:100000,operations_bundle:40000};
 assert.throws(()=>negotiatedDocument(f.row,amounts),/ayrıca onayla/);
 const result=negotiatedDocument(f.row,amounts,{confirmedBelowMinimum:true});
 assert.deepEqual(stripPrices(result.document),stripPrices(f.row.customer_document));assert.deepEqual(f.row.pricing_snapshot,before.pricing_snapshot);
 assert.equal(result.document.alternatives[0].monthlyAmount,100000);assert.equal(result.document.publication.slug,'test-brand-teklifi');assert.equal(f.row.customer_document.alternatives[0].monthlyAmount,before.customer_document.alternatives[0].monthlyAmount);
 assert.equal(priceTerms(f.row).alternatives[0].recommended,before.pricing_snapshot.alternatives[0].monthlyAmount);
});
test('negotiated USD uses exact customer cents and the original frozen rate without repricing or touching content',async()=>{
 const f=await offerFixture('USD');
 for(const amount of [0.01,1,1234.56,2000.01,1000000000.99]){
  const changed=negotiatedDocument(f.row,{growth_operations:amount,operations_bundle:amount},{confirmedBelowMinimum:true}).document;
  assertQuote(changed,{requireReady:true});assert.deepEqual(changed.quote.exchangeRate,fx);assert.deepEqual(stripPrices(changed),stripPrices(f.row.customer_document));assert.equal(changed.quote.alternatives[0].monthlyAmount,amount);
 }
 for(const value of [0,-1,Infinity,NaN,'1e5','1,2','1.001',{},null,''])assert.throws(()=>monetaryAmount(value));
 assert.throws(()=>negotiatedDocument(f.row,{growth_operations:1,operations_bundle:2,extra:3}));
});
test('explicit saved research can be reused beyond automatic cache age with its original provenance, without editing the stored report',async()=>{
 const f=await offerFixture(),original=structuredClone(f.synthesis),ledger=memoryLedger([['audit:synthesis:synthesis-v5:'+f.hash,{state:'complete',created_at:'2025-01-01T00:00:00Z',value:f.synthesis}]]);
 const saved=await loadSavedSynthesis(f.row,ledger);assert.equal(saved.synthesis.reuse.incrementalResearchCalls,0);assert.equal(saved.synthesis.reuse.researchedAt,'2025-01-01T00:00:00Z');assert.deepEqual(f.synthesis,original);
 f.row.pricing_snapshot.auditOrigin={briefHash:f.hash,researchRunId:runId};assert.equal((await loadSavedSynthesis(f.row,ledger)).origin.researchRunId,runId);
 await assert.rejects(()=>loadSavedSynthesis(f.row,memoryLedger()),/Yeni ücretli analiz otomatik başlatılmadı/);
});
test('saved BHS → fresh full brief → scope → pricing → proposal → separate save carries signed source provenance; no research calls',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const f=await offerFixture(),saved=structuredClone(f.row),sourceLedger=memoryLedger([['audit:synthesis:synthesis-v5:'+f.hash,{state:'complete',value:f.synthesis}]]),scopeLedger=memoryLedger();let scopes=0;
  const handler=createReuseHandler({getStore:()=>({detail:async()=>f.row}),getLedger:async(_q,_s,_id,options)=>options?.researchRunId?scopeLedger:sourceLedger,getSecret:()=>secret,getProviders:()=>({generate:async(stage,input)=>{
   assert.equal(stage,'scope');assert.equal(input.brief.services,'Google Ads Avrupa');assert.ok(input.audit.findings.every(f=>f.kind!=='brief'));scopes++;return {data:{scope:{...f.scope,services:[{...f.scope.services[1],briefQuote:'Google Ads Avrupa'}]},copy:f.copy}};
  },search:()=>assert.fail('Research cannot run'),extract:()=>assert.fail('Extraction cannot run')})});
  const newBrief={...f.brief,currency:'USD',brandName:'Test Alt Marka',services:'Google Ads Avrupa',goals:'Avrupa operasyonunu büyütmek'},body={action:'prepare',sourceOfferId:sourceId,researchRunId:runId,context:{leadId:'lead-1',spaceId:'space-1'},brief:newBrief};
  const reused=response();await handler(req(body),reused);assert.equal(reused.code,200,JSON.stringify(reused.data));assert.equal(scopes,1);assert.equal(reused.data.result.data.researchReuse.incrementalResearchCalls,0);assert.deepEqual(f.row,saved);
  const again=response();await handler(req(body),again);assert.equal(again.code,200);assert.equal(scopes,1);
  const info=response();await handler(req({...body,action:'info'}),info);assert.ok(info.data.logo.logoProof);
  const priced=response();await createPricingHandler({getSecret:()=>secret,getExchangeRate:async()=>fx})(req({action:'start',brief:newBrief,audit:reused.data.result,pricingProof:reused.data.pricingProof}),priced);assert.equal(priced.code,200);
  assert.equal(priced.data.result.data.sourceOfferId,sourceId);assert.equal(priced.data.result.data.auditOrigin.briefHash,f.hash);assert.equal(priced.data.result.data.scope.selected.length,1);assert.equal(priced.data.result.data.scope.selected[0].serviceId,'google_ads');
  const composed=response();await createProposalHandler({getSecret:()=>secret})(req({action:'start',context:body.context,brief:newBrief,audit:reused.data.result,pricing:priced.data.result,proposalProof:priced.data.proposalProof,logo:info.data.logo}),composed);assert.equal(composed.code,200,JSON.stringify(composed.data));
  let writes=0;const store={configured:()=>true,portalConfigured:()=>true,save:()=>assert.fail('Existing save updates card value'),saveVariant:async(token,args,id)=>{writes++;assert.equal(token,jwt);assert.equal(id,sourceId);assert.equal(args.p_document.brand.name,'Test Alt Marka');assert.equal(args.p_pricing.offerBrief.services,'Google Ads Avrupa');return {id:runId,version:2,state:'draft'};}};
  const done=response();await createOfferHandler({getStore:()=>store,getSecret:()=>secret})(req({action:'save',leadId:'lead-1',spaceId:'space-1',logoApproved:true,scopeApproved:true,proposal:composed.data.result,pricing:priced.data.result,saveProof:composed.data.saveProof}),done);assert.equal(done.code,200);assert.equal(writes,1);assert.deepEqual(f.row,saved);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('wrong card or missing saved BHS cannot allocate a new budget or silently start research',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';try{
  const f=await offerFixture();let ledgerCalls=0,begins=0,providers=0;
  const handler=createReuseHandler({getStore:()=>({detail:async()=>f.row}),getSecret:()=>secret,getLedger:async()=>{ledgerCalls++;return {...memoryLedger(),begin:async()=>{begins++;}};},getProviders:()=>{providers++;throw Error();}});
  const b={action:'prepare',sourceOfferId:sourceId,researchRunId:runId,brief:f.brief,context:{leadId:'other',spaceId:'space-1'}};
  const wrong=response();await handler(req(b),wrong);assert.equal(wrong.code,422);assert.equal(ledgerCalls,0);
  const missing=response();await handler(req({...b,context:{leadId:'lead-1',spaceId:'space-1'}}),missing);assert.equal(missing.code,422);assert.equal(begins,0);assert.equal(providers,0);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('explicit new BHS keeps separate run budget and signed source across every stage; cannot reuse old report cache',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';try{
  const f=await offerFixture(),ledger=memoryLedger();const phases=[];let ticket;
  const handler=createBoundedAuditHandler({getSecret:()=>secret,getSourceOffer:async()=>f.row,getLedger:async(_r,_s,id,options)=>{assert.equal(id,'lead-1');assert.equal(options.researchRunId,runId);return ledger;},getProviders:()=>({configured:()=>true}),validateWebsite:async()=>{},logger:{info(){},error(){}},runStage:async options=>{
   assert.equal(options.freshResearch,true);phases.push(options.phase);ledger.rows.set(stageKey(options.brief,options.phase,'v5'),{state:'complete',value:options.phase==='synthesis'?f.synthesis:options.phase==='scope'?{scopePlan:f.scope,proposalCopy:f.copy}:{}});
  }});
  for(let i=0;i<5;i++){
   const r=response();await handler(req({action:i?'advance':'start',requestId:'request-for-new-audit',brief:f.brief,context:{leadId:'lead-1',spaceId:'space-1',sourceOfferId:sourceId,researchRunId:runId},ticket}),r);assert.ok(r.code<300,JSON.stringify(r.data));ticket=r.data.ticket||ticket;
   if(r.data.phase==='complete'){const claims=createPricingProof(secret).decode(r.data.pricingProof,session,host);assert.equal(claims.sourceOfferId,sourceId);assert.equal(claims.auditOrigin.researchRunId,runId);assert.equal(claims.auditOrigin.briefHash,f.hash);}
  }
  assert.deepEqual(phases,['source_plan','evidence','synthesis','scope']);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('lost price-update response is idempotent; changed amounts under the same request cannot pass a stale document',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';try{
  const f=await offerFixture();const terms=priceTerms(f.row),amounts={growth_operations:150000,operations_bundle:70000};let writes=0;
  const store={mode:'pipeline-production',detail:async()=>f.row,call:async()=>({after_prices:amounts,below_minimum_confirmed:false}),updatePrices:async()=>{writes++;f.row.customer_document=negotiatedDocument(f.row,amounts).document;}};
  const handler=createOfferHandler({getStore:()=>store});const body={action:'prices',offerId:sourceId,requestId:runId,expectedDocumentHash:terms.documentHash,amounts};
  for(let i=0;i<2;i++){const r=response();await handler(req(body),r);assert.equal(r.code,200,JSON.stringify(r.data));}assert.equal(writes,1);
  const invalid=response();await handler(req({...body,amounts:{...amounts,operations_bundle:70001}}),invalid);assert.equal(invalid.code,422);assert.equal(writes,1);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
