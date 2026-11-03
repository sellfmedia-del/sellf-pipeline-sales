import test from 'node:test';
import assert from 'node:assert/strict';
import {createLedger} from '../src/budget/ledger.mjs';
import {createBoundedProviders} from '../src/budget/providers.mjs';
import {createLogoRecovery} from '../src/budget/logo-recovery.mjs';
const time=Date.parse('2026-11-03T12:00:00Z');
function fixture({balance=500,failFallback=false,blockPrimary=false}={}){
 let charged=balance;const steps=new Map(),calls=[];
 const ledger=createLedger(async(op,a={})=>{
  if(['begin','status'].includes(op))return {chargedKurus:charged,capKurus:5000};
  if(op==='get')return steps.get(a.step)||null;
  const prior=steps.get(a.step);
  if(op==='reserve'){
   if(prior)return {claimed:false,step:prior};
   if(charged+a.amount>5000)return {blocked:true};
   charged+=a.amount;steps.set(a.step,{state:'reserved',input_hash:a.hash,claim_token:a.token,charge_kurus:a.amount,created_at:new Date(time).toISOString()});return {claimed:true};
  }
  assert.equal(prior.claim_token,a.token);
  if(op==='complete')charged-=prior.charge_kurus-a.amount;
  steps.set(a.step,{...prior,state:op,value:a.value,charge_kurus:op==='complete'?a.amount:prior.charge_kurus});return steps.get(a.step);
 });
 let release;
 const provider=createBoundedProviders({ledger,geminiKey:'test',now:()=>time,fetchImpl:async(url,init)=>{
  if(url.includes('tcmb'))return new Response('<Tarih_Date Tarih="03.11.2026"><Currency CurrencyCode="USD"><ForexSelling>40</ForexSelling></Currency></Tarih_Date>');
  if(url.endsWith(':countTokens'))return Response.json({totalTokens:100});
  calls.push({url,body:JSON.parse(init.body)});
  if(url.includes('3.8-flash')){if(blockPrimary)await new Promise(r=>release=r);return Response.json({error:{message:'Service unavailable'}},{status:503});}
  if(failFallback)return Response.json({error:{message:'Service unavailable'}},{status:503});
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"found":true}'}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,totalTokenCount:120}});
 }});
 const recover=createLogoRecovery(provider,{wait:async()=>{}});
 const run=()=>recover('logo-region',{brandName:'Example'}, {type:'object'},{maxOutputTokens:1024,jsonMode:true});
 return {steps,calls,run,status:()=>ledger.status(),release:()=>release()};
}
test('503 switches models once, preserves the original charge, and caches fallback across reloads',async()=>{
 const f=fixture();const result=await f.run();assert.equal(result.data.found,true);assert.equal(f.calls.length,2);
 assert.deepEqual(f.calls[0].body,f.calls[1].body);assert.equal(result.model,'gemini-4-argon');
 const primary=[...f.steps.values()].find(s=>s.state==='uncertain');assert.equal(primary.value.providerStatus,503);assert.ok(primary.charge_kurus>0);
 const cost=await f.status();assert.ok(cost.chargedKurus>500);assert.ok(cost.chargedKurus<5000);
 assert.deepEqual(await f.run(),result);assert.equal(f.calls.length,2);assert.deepEqual(await f.status(),cost);
});
test('concurrent workers cannot start a duplicate fallback or bypass the original in-flight claim',async()=>{
 const f=fixture({blockPrimary:true}),first=f.run();while(f.calls.length===0)await new Promise(r=>setImmediate(r));
 await assert.rejects(f.run(),e=>e.code==='budget_pending');assert.equal(f.calls.length,1);
 f.release();await first;assert.equal(f.calls.length,2);
});
test('fallback is refused at the hard budget limit',async()=>{
 const f=fixture({balance:4920});await assert.rejects(f.run(),e=>e.code==='budget_limit');assert.equal(f.calls.length,1);assert.ok((await f.status()).chargedKurus<=5000);
});
test('both models unavailable stops without unbounded retries or refunds',async()=>{
 const f=fixture({failFallback:true});await assert.rejects(f.run(),e=>e.code==='logo_temporarily_unavailable');
 assert.equal(f.calls.length,2);const cost=await f.status();await assert.rejects(f.run());assert.equal(f.calls.length,2);assert.deepEqual(await f.status(),cost);
});
test('known legacy provider failures and abandoned workers recover without rewriting the old entry',async()=>{
 for(const state of ['uncertain','reserved']){
  const f=fixture();await f.run();const [key,primary]=[...f.steps.entries()].find(([,s])=>s.state==='uncertain');
  f.steps.set(key,{...primary,state,created_at:new Date(time-301000).toISOString(),value:state==='uncertain'?{code:'provider_error'}:null});
  const previous=structuredClone(f.steps.get(key));await f.run();assert.deepEqual(f.steps.get(key),previous);assert.equal(f.calls.length,2);
 }
});
test('permissions, quota, transport ambiguity and content errors do not cause fallback calls',async()=>{
 for(const error of [Object.assign(Error(),{providerStatus:403}),Object.assign(Error(),{providerStatus:429}),Object.assign(Error(),{code:'budget_uncertain'}),Object.assign(Error(),{name:'TimeoutError'}),Object.assign(Error(),{code:'invalid_report'})]){
  let calls=0;const recover=createLogoRecovery({generate:async()=>{calls++;throw error;}},{wait:async()=>assert.fail()});
  await assert.rejects(recover('logo-region',{},{}),e=>e===error);assert.equal(calls,1);
 }
});
