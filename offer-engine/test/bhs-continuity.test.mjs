import test from 'node:test';
import assert from 'node:assert/strict';
import {createLedger,hash} from '../src/budget/ledger.mjs';
import {createBoundedProviders} from '../src/budget/providers.mjs';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {createPricingHandler} from '../api/pricing.js';
import {createProposalHandler} from '../api/proposal.js';
import {logoProof} from '../src/proposal/logo-proof.mjs';
import {recoverModelStage} from '../src/budget/model-recovery.mjs';
import {continuationAudit,canContinue} from '../src/bhs/continuity.mjs';
import {context} from './fixtures/evidence.mjs';
import {brief as rawBrief} from './fixtures/bhs.mjs';
import {offerFixture,response} from './fixtures/offer.mjs';
const host='continuity.preview.example',secret='isolated-continuity-secret',time=Date.parse('2026-11-04T12:00:00Z');
function memory(initial=500){
 let charged=initial;const rows=new Map();
 const ledger=createLedger(async(op,a={})=>{
  if(['begin','status'].includes(op))return {chargedKurus:charged,capKurus:5000};
  if(op==='get')return rows.get(a.step)||null;
  const old=rows.get(a.step);
  if(op==='reserve'){
   if(old){assert.equal(old.input_hash,a.hash);if(!(old.state==='uncertain'&&old.charge_kurus===0&&a.amount===0))return {claimed:false,step:old};}
   if(charged+a.amount>5000)return {blocked:true};
   charged+=a.amount;rows.set(a.step,{input_hash:a.hash,claim_token:a.token,charge_kurus:a.amount,state:'reserved',created_at:new Date(time).toISOString()});return {claimed:true};
  }
  assert.equal(old.claim_token,a.token);if(old.state==='complete')return old;
  if(op==='complete')charged-=old.charge_kurus-a.amount;
  const row={...old,state:op,charge_kurus:op==='complete'?a.amount:old.charge_kurus,value:a.value};rows.set(a.step,row);return row;
 });return {ledger,rows,cost:()=>charged};
}
function client(handler){
 let cookie;return async body=>{const res=response();await handler({method:'POST',headers:{host,origin:'https://'+host,cookie},body},res);if(res.headers['Set-Cookie'])cookie=res.headers['Set-Cookie'][0].split(';')[0];return {...res,cookie};};
}
test('parallel paid reservations stop at the 30 TRY target while completed data remains reusable above it',async()=>{
 const db=memory(2900);let calls=0,release;const gate=new Promise(resolve=>{release=resolve;});
 const one=db.ledger.once('search:one',{},100,async()=>{calls++;await gate;return {ok:true};},{limitKurus:3000});
 const two=db.ledger.once('search:two',{},100,async()=>{calls++;return {};},{limitKurus:3000});
 await assert.rejects(two,e=>e.code==='budget_limit');assert.equal(calls,1);assert.equal(db.cost(),3000);release();await one;
 await db.ledger.once('manual:extra',{},100,async()=>({ok:true}));
 assert.deepEqual(await db.ledger.once('search:one',{},100,async()=>assert.fail(),{limitKurus:3000}),{ok:true});assert.equal(db.cost(),3100);
});
test('invalid content is never labelled a provider capacity outage',async()=>{
 await assert.rejects(recoverModelStage(async()=>{throw Object.assign(Error(),{code:'model_output_invalid'});},'source_plan',{model:'gemini-3.1-pro-preview'},{wait:async()=>{}}),e=>e.code==='model_content_invalid'&&e.modelAttempts.length===2);
});
test('an empty rejected model report is not promoted to a useful partial analysis',async()=>{
 let calls=0;
 await assert.rejects(recoverModelStage(async()=>{if(++calls===1)throw Object.assign(Error(),{code:'model_output_invalid',safeResult:{data:{findings:[],researchCoverage:[],sources:[]}}});throw Object.assign(Error(),{providerStatus:503});},'synthesis',{model:'gemini-3.1-pro-preview'},{wait:async()=>{}}),e=>e.code==='model_content_invalid');
 assert.equal(calls,2);
});
test('two real provider-shaped 503 failures still reach signed pricing/proposal via explicit zero-cost continuation',async()=>{
 const env=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const db=memory(),brief=snapshotBrief({...rawBrief,services:'Meta ve Google Ads'});let generations=0;
  const provider=()=>createBoundedProviders({ledger:db.ledger,geminiKey:secret,tavilyKey:'test',now:()=>time,fetchImpl:async(url)=>{
   if(url.includes('tcmb'))return new Response('<Tarih_Date Tarih="04.11.2026"><Currency CurrencyCode="USD"><ForexSelling>40</ForexSelling></Currency></Tarih_Date>');
   if(url.endsWith('/search'))return Response.json({results:[]});
   if(url.endsWith(':countTokens'))return Response.json({totalTokens:100});
   generations++;return Response.json({error:{status:'UNAVAILABLE',message:'high demand'}},{status:503});
  }});
  const handler=createBoundedAuditHandler({getLedger:async()=>db.ledger,getSecret:()=>secret,getProviders:provider,validateWebsite:async()=>{},now:()=>time,logger:{},runStage:runBoundedStage}),call=client(handler);
  const start={action:'start',requestId:'request_1234567890',brief,context:{leadId:'lead',spaceId:'space'}};
  const started=await call(start),ticket=started.data.ticket;assert.equal(started.code,200);
  const premature=await call({...start,action:'continue',ticket});assert.equal(premature.code,422);
  const failed=await call({...start,action:'advance',ticket});assert.equal(failed.data.code,'model_temporarily_unavailable');assert.equal(failed.data.continuationAvailable,true);assert.equal(generations,2);
  const reopened=await call(start);assert.equal(reopened.code,422);assert.equal(reopened.data.continuationAvailable,true);assert.equal(generations,2);
  const before=db.cost();assert.ok(before<=3000);
  assert.equal((await call({...start,action:'continue',ticket,brief:{...brief,goals:'changed'}})).code,422);
  const done=await call({...start,action:'continue',ticket});assert.equal(done.code,200);
  const audit=done.data.result;assert.equal(audit.data.researchContinuity.status,'unavailable');assert.equal(audit.data.quality.contentComplete,false);assert.equal(audit.data.scoring.total,null);assert.deepEqual(audit.data.findings,[]);assert.deepEqual(audit.data.sources,[]);
  assert.equal(db.cost(),before);assert.equal(generations,2);
  const again=await call({...start,action:'continue',ticket});assert.equal(again.code,200);assert.equal(db.cost(),before);assert.equal(generations,2);
  const resumed=await call(start);assert.equal(resumed.code,200);assert.equal(resumed.data.result.data.researchContinuity.status,'unavailable');assert.equal(generations,2);assert.equal(db.cost(),before);
  const req=body=>({method:'POST',headers:{host,origin:'https://'+host,cookie:done.cookie},body});
  const price=response();await createPricingHandler({getSecret:()=>secret,now:()=>time})(req({action:'start',brief,audit,pricingProof:done.data.pricingProof}),price);assert.equal(price.code,200);assert.equal(price.data.result.status,'review');assert.equal(price.data.result.data.alternatives.length,2);
  const logoData=(await offerFixture()).logo.data,logo={...logoData,logoProof:logoProof(secret,host,logoData)};
  const proposal=response();await createProposalHandler({getSecret:()=>secret,now:()=>time,getProviders:()=>assert.fail('no extra model')})(req({action:'start',brief,audit,pricing:price.data.result,proposalProof:price.data.proposalProof,logo,context:start.context}),proposal);
  assert.equal(proposal.code,200);assert.equal(proposal.data.result.status,'review');assert.ok(proposal.data.saveProof);assert.match(proposal.data.result.data.bhs.summary,/tamamlanamadı/);assert.deepEqual(proposal.data.result.data.bhs.findings,[]);
  const changed=structuredClone(audit);changed.data.findings.push({id:'fabricated'});const bad=response();await createPricingHandler({getSecret:()=>secret,now:()=>time})(req({action:'start',brief,audit:changed,pricingProof:done.data.pricingProof}),bad);assert.equal(bad.code,422);
  const wrong=response();await handler({method:'POST',headers:{host,origin:'https://'+host,cookie:'__Host-offer-research='+'x'.repeat(43)},body:{...start,action:'continue',ticket}},wrong);assert.equal(wrong.code,422);
  assert.equal(generations,2);assert.equal(db.cost(),before);
 }finally{if(env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=env;}
});
test('partial continuation rechecks the original evidence and does not promote unsupported stored claims',()=>{
 const c=context(),brief=snapshotBrief(rawBrief);c.report.findings[0].statement='Revenue 999999';
 const audit=continuationAudit(brief,{synthesis:{report:c.report,analysisPacket:c.packet},reason:'quota'});
 assert.equal(audit.data.researchContinuity.status,'partial');assert.ok(audit.data.findings.length>0);assert.ok(!audit.data.findings.some(f=>f.statement.includes('999999')));assert.ok(audit.data.sources.every(s=>s.verification.status==='quote_matched'));assert.equal(audit.data.scopePlan.fallback,true);
});
test('exhausted/stale research can hand off, while active, paid, foreign and unfinished records cannot',()=>{
 for(const code of ['budget_limit','quota','model_content_invalid','stage_failed'])assert.equal(canContinue({state:'uncertain',charge_kurus:0,value:{code}},time),true);
 assert.equal(canContinue({state:'reserved',charge_kurus:0,created_at:new Date(time-360001).toISOString()},time),true);
 for(const row of [null,{state:'reserved',charge_kurus:0,created_at:new Date(time).toISOString()},{state:'uncertain',charge_kurus:100,value:{code:'budget_limit'}},{state:'complete',charge_kurus:0},{state:'uncertain',charge_kurus:0,value:{code:'changed_brief'}}])assert.equal(canContinue(row,time),false);
});
test('reopening an abandoned coordinator at the hard cap still permits only a zero-cost handoff',async()=>{
 const env=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const db=memory(5000),brief=snapshotBrief(rawBrief),phase='source_plan';
  db.rows.set(stageKey(brief,phase,'v5'),{state:'reserved',charge_kurus:0,input_hash:hash({brief,phase,version:'bounded-bhs-v1'}),created_at:new Date(time-360001).toISOString()});
  const handler=createBoundedAuditHandler({getLedger:async()=>db.ledger,getSecret:()=>secret,getProviders:()=>assert.fail('no new provider'),validateWebsite:async()=>{},now:()=>time,logger:{}}),call=client(handler);
  const start={action:'start',requestId:'request_1234567890',brief,context:{leadId:'lead',spaceId:'space'}};
  const stopped=await call(start);assert.equal(stopped.data.code,'stage_abandoned');assert.equal(stopped.data.continuationAvailable,true);assert.equal(stopped.data.recoveryAvailable,undefined);
  const result=await call({...start,action:'continue',ticket:stopped.data.ticket});assert.equal(result.code,200);assert.equal(result.data.result.data.researchContinuity.status,'unavailable');assert.equal(db.cost(),5000);
 }finally{if(env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=env;}
});
