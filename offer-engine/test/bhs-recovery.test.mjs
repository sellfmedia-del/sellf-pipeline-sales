import test from 'node:test';
import assert from 'node:assert/strict';
import {createLedger,hash} from '../src/budget/ledger.mjs';
import {createBoundedProviders} from '../src/budget/providers.mjs';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {stageKey} from '../src/bhs/direct-research.mjs';
import {recoveryKey,recoveryRound} from '../src/budget/recovery.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {brief as base} from './fixtures/bhs.mjs';

export function recoveryStore(initial=500){
 let charged=initial;const rows=new Map();
 const call=async(op,a={})=>{
  if(['begin','status'].includes(op))return {chargedKurus:charged,capKurus:5000};
  if(op==='get')return rows.get(a.step)||null;
  const prior=rows.get(a.step);
  if(op==='reserve'){
   if(prior){assert.equal(prior.input_hash,a.hash);if(!(prior.state==='uncertain'&&prior.charge_kurus===0&&a.amount===0))return {claimed:false,step:prior};}
   if(charged+a.amount>5000)return {blocked:true};
   charged+=a.amount;rows.set(a.step,{input_hash:a.hash,charge_kurus:a.amount,claim_token:a.token,state:'reserved'});return {claimed:true};
  }
  assert.equal(prior.claim_token,a.token);
  if(prior.state==='complete')return prior;
  if(op==='complete')charged-=prior.charge_kurus-a.amount;
  const row={...prior,state:op,value:a.value,charge_kurus:op==='complete'?a.amount:prior.charge_kurus};rows.set(a.step,row);return row;
 };
 return {rows,ledger:()=>createLedger(call),cost:()=>charged};
}
const now=()=>Date.parse('2026-11-04T12:00:00Z');
test('a lost recovery-marker completion resumes the authorised batch while foreign or paid markers cannot grant recovery',()=>{
 const claims={briefHash:'brief',phase:'source_plan'},input_hash=hash({...claims,round:1});
 for(const state of ['reserved','uncertain','complete'])assert.equal(recoveryRound({state,charge_kurus:0,input_hash},claims),1);
 for(const row of [{state:'complete',charge_kurus:1,input_hash},{state:'complete',charge_kurus:0,input_hash:'other'},null])assert.equal(recoveryRound(row,claims),0);
});
test('incident balance can explicitly use the planning hold without cheaper models, shorter output, refunds or exceeding the cap',async()=>{
 const db=recoveryStore(2232),bodies=[];
 const fetchImpl=async(url,init)=>{
  if(url.includes('tcmb'))return new Response('<Tarih_Date Tarih="04.11.2026"><Currency CurrencyCode="USD"><ForexSelling>50</ForexSelling></Currency></Tarih_Date>');
  if(url.endsWith(':countTokens'))return Response.json({totalTokens:8721});
  bodies.push({url,body:JSON.parse(init.body)});
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"plan":"unchanged quality contract"}'}]}}],usageMetadata:{promptTokenCount:8721,candidatesTokenCount:1000,totalTokenCount:9721}});
 };
 const options={model:'gemini-3.1-pro-preview',maxOutputTokens:4096,thinkingLevel:'LOW',jsonMode:true};
 const original=createBoundedProviders({ledger:db.ledger(),geminiKey:'private',fetchImpl,now});
 await assert.rejects(original.generate('source_plan',{instruction:'full methodology'},{type:'object'},options),e=>{assert.equal(e.budgetDiagnostic.availableKurus,268);assert.equal(e.budgetDiagnostic.followingReserveKurus,2500);return e.code==='budget_limit';});
 assert.equal(bodies.length,0);assert.equal(db.cost(),2232);
 const recover=()=>createBoundedProviders({ledger:db.ledger(),geminiKey:'private',fetchImpl,now,manualRecoveryRound:1});
 const result=await recover().generate('source_plan',{instruction:'full methodology'},{type:'object'},options);
 assert.equal(result.model,'gemini-3.1-pro-preview');assert.equal(bodies[0].body.generationConfig.maxOutputTokens,4096);assert.equal(bodies[0].body.generationConfig.thinkingConfig.thinkingLevel,'LOW');
 assert.ok(db.cost()>2232&&db.cost()<=5000);const cost=db.cost();
 assert.deepEqual(await recover().generate('source_plan',{instruction:'full methodology'},{type:'object'},options),result);assert.equal(bodies.length,1);assert.equal(db.cost(),cost);
 const exhausted=recoveryStore(4999),blocked=createBoundedProviders({ledger:exhausted.ledger(),geminiKey:'private',fetchImpl,now,manualRecoveryRound:1});
 await assert.rejects(blocked.generate('source_plan',{}, {type:'object'},options),e=>e.code==='budget_limit');assert.equal(bodies.length,1);assert.equal(exhausted.cost(),4999);
});

test('partial receipt breakdown never calls historical reservations verified spending',async()=>{
 const db=recoveryStore(900),ledger=db.ledger();
 await ledger.once('paid',{},200,async()=>({accountedKurus:60}),{settle:x=>x.accountedKurus});
 await assert.rejects(ledger.once('model:test:uncertain',{},300,async()=>{throw Object.assign(Error('private'),{code:'provider_error',providerStatus:503,providerOperation:'generateContent'});}));
 const detail=ledger.describe(await ledger.status());
 assert.deepEqual(detail,{verifiedUsageKurus:60,knownReservationKurus:300,historicalCommittedKurus:400,infraReserveKurus:500});
 assert.equal(Object.values(detail).reduce((a,b)=>a+b),db.cost());
 assert.deepEqual(db.rows.get('model:test:uncertain').value,{code:'provider_error',providerStatus:503,providerOperation:'generateContent'});
 const reloaded=db.ledger();assert.equal(reloaded.describe(await reloaded.status()).verifiedUsageKurus,0);
});

test('signed explicit recovery claims a single extra phase batch; concurrent clicks/reloads cannot allocate more or restart completed stages',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const db=recoveryStore(2232),brief=snapshotBrief(base),host='preview.vercel.app',secret='test-recovery-secret';let round=0,runs=0;
  const dependencies={getLedger:async()=>db.ledger(),getSecret:()=>secret,validateWebsite:async()=>{},logger:{},getProviders:options=>{round=options.manualRecoveryRound;return {configured:()=>true};},runStage:async({phase,ledger})=>ledger.once(stageKey(brief,phase,'v5'),{brief,phase,version:'bounded-bhs-v1'},0,async()=>{runs++;if(!round)throw Object.assign(Error('unavailable'),{code:'model_temporarily_unavailable'});return {plan:'retained'};})};
  const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(n){this.code=n;return this;},json(value){this.data=value;return this;}});
  let cookie;const request=body=>({method:'POST',headers:{host,origin:'https://'+host,cookie},body});
  const call=async body=>{const res=response();await createBoundedAuditHandler(dependencies)(request(body),res);return res;};
  const start={action:'start',requestId:'request_1234567890',brief,context:{leadId:'lead',spaceId:'space'}};
  const started=await call(start);cookie=started.headers['Set-Cookie'][0].split(';')[0];const ticket=started.data.ticket;
  const failed=await call({...start,action:'advance',ticket});assert.equal(failed.code,422);assert.equal(failed.data.recoveryAvailable,true);assert.ok(failed.data.ticket);assert.equal(runs,1);
  const tampered=await call({...start,action:'recover',ticket,brief:{...brief,goals:'changed'}});assert.equal(tampered.code,422);assert.equal(db.rows.has(recoveryKey(brief,'source_plan')),false);
  const accepted=await Promise.all([call({...start,action:'recover',ticket}),call({...start,action:'recover',ticket})]);
  assert.ok(accepted.some(r=>r.code===202));assert.equal(runs,1);assert.equal(db.cost(),2232);
  assert.equal(db.rows.get(recoveryKey(brief,'source_plan')).value.round,1);
  const result=await call({...start,action:'advance',ticket});assert.equal(result.code,202);assert.equal(result.data.phase,'evidence');assert.equal(round,1);assert.equal(runs,2);
  const repeated=await call({...start,action:'status',ticket});assert.equal(repeated.data.phase,'evidence');assert.equal(runs,2);
  // A completed stage cannot be changed into a recovery target by the client.
  const illegal=await call({...start,action:'recover',ticket});assert.equal(illegal.code,422);assert.equal(db.rows.has(recoveryKey(brief,'evidence')),false);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});

test('an exhausted explicit batch stays exhausted after closing/reopening; arbitrary client round values grant no extra calls',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const db=recoveryStore(),brief=snapshotBrief(base),host='preview.vercel.app';let cookie,runs=0;
  const dependencies={getLedger:async()=>db.ledger(),getSecret:()=>'test-exhaustion-secret',validateWebsite:async()=>{},logger:{},getProviders:()=>({configured:()=>true}),runStage:async({phase,ledger})=>ledger.once(stageKey(brief,phase,'v5'),{brief,phase,version:'bounded-bhs-v1'},0,async()=>{runs++;throw Object.assign(Error('unavailable'),{code:'model_temporarily_unavailable'});})};
  const call=async body=>{const res={headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(n){this.code=n;return this;},json(value){this.data=value;return this;}};await createBoundedAuditHandler(dependencies)({method:'POST',headers:{host,origin:'https://'+host,cookie},body},res);if(res.headers['Set-Cookie'])cookie=res.headers['Set-Cookie'][0].split(';')[0];return res;};
  const start={action:'start',requestId:'request_1234567890',brief,context:{leadId:'lead',spaceId:'space'}};
  let ticket=(await call(start)).data.ticket;
  await call({...start,action:'advance',ticket});await call({...start,action:'recover',ticket});
  const failed=await call({...start,action:'advance',ticket});assert.equal(failed.code,422);assert.equal(failed.data.recoveryAvailable,undefined);
  ticket=(await call(start)).data.ticket;
  const blocked=await call({...start,action:'recover',ticket,manualRecoveryRound:999});assert.equal(blocked.data.code,'recovery_exhausted');assert.equal(runs,2);
  assert.equal([...db.rows.keys()].filter(k=>k.startsWith('audit:recovery:')).length,1);assert.equal(db.cost(),500);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
