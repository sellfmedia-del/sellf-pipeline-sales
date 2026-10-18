import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfferWorkflow} from '../src/offer-workflow.mjs';
import {assertResult} from '../src/contracts.mjs';

test('failed stages retry independently; completed stages reuse immutable versioned snapshots',async()=>{
  let auditCalls=0,priceCalls=0;
  const workflow=createOfferWorkflow({audit:{version:'v1',async run(input){auditCalls++;input.services.push('internal');return{status:'ready',data:{findings:[],services:input.services}};}},pricing:{version:'v1',async run(){if(++priceCalls===1)throw Error('temporary');return {status:'ready',data:{currency:'TRY',costVersion:'cost-1',alternatives:[1,2,3].map(id=>({id,billingPeriod:'monthly',monthlyAmount:1000*id}))}};}}});
  const input={services:['growth']};
  const audit=await workflow.run('audit',input);assert.deepEqual(input.services,['growth']);
  await assert.rejects(()=>workflow.run('pricing',{}, {audit}),/temporary/);
  await workflow.run('pricing',{}, {audit});
  audit.data.services.push('caller mutation');
  const again=await workflow.run('audit',input);
  assert.equal(auditCalls,1);assert.equal(priceCalls,2);assert.equal(again.data.services.includes('caller mutation'),false);
  assert.ok(again.runId&&again.inputHash&&again.engineVersion);
});
test('unreviewed logos and missing upstream results cannot reach proposal assembly',async()=>{
  const workflow=createOfferWorkflow();
  await assert.rejects(()=>workflow.run('proposal',{}),/logo/);
  await assert.rejects(()=>workflow.run('pricing',{}),/audit/);
  await assert.rejects(()=>workflow.run('audit',{}),/henüz bağlı değil/);
  assert.throws(()=>assertResult('logo',{status:'ready',data:{generated:false,reviewed:false,candidates:[{image:'data:image/png;base64,AAA',quality:{transparency:true,matteStable:true,touchesEdge:false,changedSolid:0}}]}}),/kontrolü/);
  assert.throws(()=>assertResult('pricing',{status:'ready',data:{currency:'TRY',costVersion:'1',alternatives:[{monthlyAmount:100,billingPeriod:'two-months'}]}}),/aylık/);
});
