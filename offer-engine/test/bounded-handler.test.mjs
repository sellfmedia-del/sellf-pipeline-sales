import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {stageKey,seedQueries,phases} from '../src/bhs/direct-research.mjs';
import {context} from './fixtures/evidence.mjs';
import {createPricingProof} from '../src/pricing/proof.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {brief as fixture} from './fixtures/bhs.mjs';
const brief=snapshotBrief(fixture),host='preview.vercel.app',secret='bounded-handler-test';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(n){this.code=n;return this;},json(x){this.body=x;return this;}});
const request=(body,cookie)=>({method:'POST',headers:{host,origin:'https://'+host,cookie},body});
test('budgeted audit resumes durable completed stages across handlers and signs the budget card',async()=>{
 const prior=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const steps=new Map();let stages=0,begins=0;
  const ledger={begin:async()=>{begins++;},get:async k=>steps.get(k),status:async()=>({chargedKurus:900,capKurus:5000})};
  const dependencies={getSecret:()=>secret,getLedger:async(_req,_res,lead)=>{assert.equal(lead,'lead1');return ledger;},getProviders:()=>({configured:()=>true}),validateWebsite:async()=>{},logger:{},runStage:async({phase,brief})=>{stages++;assert.notEqual(phase,'semantic');steps.set(stageKey(brief,phase),{state:'complete',value:phase==='synthesis'?{report:context().report}:{}});}};
  let handler=createBoundedAuditHandler(dependencies),res=response();
  const start={action:'start',requestId:'request_1234567890',brief,context:{leadId:'lead1',spaceId:'space1'}};
  await handler(request(start),res);assert.equal(res.code,200);assert.equal(res.body.nextAction,'advance');
  const cookie=res.headers['Set-Cookie'].find(x=>x.startsWith('__Host-offer-research')).split(';')[0];let ticket=res.body.ticket;
  for(let i=0;i<phases.length-1;i++){
   handler=createBoundedAuditHandler(dependencies);res=response();
   await handler(request({...start,action:'advance',ticket},cookie),res);
   if(i===phases.length-2){assert.equal(res.code,200);assert.equal(res.body.phase,'complete');assert.equal(res.body.result.status,'ready');assert.ok(res.body.pricingProof);}
   else{assert.equal(res.code,202);assert.notEqual(res.body.phase,'complete');ticket=res.body.ticket;}
  }
  res=response();await handler(request({...start,action:'status',ticket},cookie),res);assert.equal(res.body.phase,'complete');
  const session=cookie.split('=')[1],proof=createPricingProof(secret).decode(res.body.pricingProof,session,host);assert.equal(proof.budgetLeadId,'lead1');assert.equal(stages,phases.length-1);
  res=response();await handler(request(start,cookie),res);assert.equal(res.body.phase,'complete');assert.equal(stages,phases.length-1);assert.equal(begins,2);
  const invalid=response();await handler(request({...start,action:'status',ticket,brief:{...brief,goals:'changed'}},cookie),invalid);assert.equal(invalid.code,422);
 }finally{if(prior===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=prior;}
});
test('reserved or uncertain stages cannot launch another paid worker',async()=>{
 const prior=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  for(const state of ['reserved','uncertain']){
   const h=createBoundedAuditHandler({getSecret:()=>secret,getLedger:async()=>({begin:async()=>{},status:async()=>({chargedKurus:5000,capKurus:5000}),get:async()=>({state})}),validateWebsite:async()=>{},getProviders:()=>({configured:()=>true}),runStage:()=>assert.fail('must not start'),logger:{}});
   const res=response();await h(request({action:'start',requestId:'request_1234567890',brief,context:{leadId:'lead1'}}),res);
   assert.equal(res.code,state==='reserved'?200:422);if(state==='uncertain')assert.equal(res.body.code,'budget_uncertain');
  }
 }finally{if(prior===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=prior;}
});
test('seed discovery covers company, competitors, finance, market, reputation, and channels',()=>{
 const queries=seedQueries(brief);assert.equal(queries.length,8);assert.ok(queries.every(x=>x.includes(brief.brandName)));
 assert.ok(queries.some(x=>x.includes('finansal')));assert.ok(queries.some(x=>x.includes('yorum')));
});
