import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverModelStage,recoveryStages} from '../src/budget/model-recovery.mjs';
import {createBoundedProviders} from '../src/budget/providers.mjs';
import {createLedger} from '../src/budget/ledger.mjs';

test('every AI stage keeps its contract/token limits and switches to one permitted alternate model',async()=>{
 for(const stage of recoveryStages)for(const model of ['gemini-3.8-flash','gemini-3.1-pro-preview','gemini-4-argon']){
  const options={model,maxOutputTokens:16384,minOutputTokens:12288,reserveForFollowingKurus:100,thinkingLevel:'MEDIUM',jsonMode:true,recoveryAttempt:true};const calls=[];
  const result=await recoverModelStage(async next=>{calls.push(next);if(calls.length===1)throw Object.assign(Error(),{providerStatus:503});return {ok:true};},stage,options,{wait:async()=>{}});
  assert.deepEqual(result,{ok:true});assert.equal(calls.length,2);
  assert.deepEqual(calls[1],{...options,model:model==='gemini-4-argon'?'gemini-3.1-pro-preview':'gemini-4-argon',modelFallback:true});
 }
});
test('no retry on success, validation, quota, auth, budget or ambiguous transport failures',async()=>{
 for(const code of ['invalid_report','budget_limit','budget_uncertain','budget_pending','quota']){
  const failure=Object.assign(Error(),{code});let calls=0;
  await assert.rejects(recoverModelStage(async()=>{calls++;throw failure;},'scope',{}, {wait:async()=>assert.fail()}),e=>e===failure);assert.equal(calls,1);
 }
 for(const providerStatus of [400,401,403,404,429]){
  let calls=0;await assert.rejects(recoverModelStage(async()=>{calls++;throw Object.assign(Error(),{providerStatus});},'scope',{}, {wait:async()=>assert.fail()}));assert.equal(calls,1);
 }
});
function fixture({balance=500,failFallback=false,html=false}={}){
 let charged=balance;const steps=new Map(),calls=[];let clock=Date.parse('2026-11-03T12:00:00Z');
 const ledger=createLedger(async(op,a={})=>{
  if(['begin','status'].includes(op))return {chargedKurus:charged,capKurus:5000};
  if(op==='get')return steps.get(a.step)||null;
  const prior=steps.get(a.step);
  if(op==='reserve'){
   if(prior)return {claimed:false,step:prior};
   if(charged+a.amount>5000)return {blocked:true};
   charged+=a.amount;steps.set(a.step,{state:'reserved',input_hash:a.hash,claim_token:a.token,charge_kurus:a.amount});return {claimed:true};
  }
  assert.equal(prior.claim_token,a.token);
  if(op==='complete')charged-=prior.charge_kurus-a.amount;
  steps.set(a.step,{...prior,state:op,value:a.value,charge_kurus:op==='complete'?a.amount:prior.charge_kurus});return steps.get(a.step);
 });
 const provider=createBoundedProviders({ledger,geminiKey:'test',now:()=>clock,fetchImpl:async(url,init)=>{
  if(url.includes('tcmb'))return new Response('<Tarih_Date Tarih="03.11.2026"><Currency CurrencyCode="USD"><ForexSelling>40</ForexSelling></Currency></Tarih_Date>');
  if(url.endsWith(':countTokens'))return Response.json({totalTokens:100});
  calls.push({url,body:JSON.parse(init.body)});
  if(url.includes('3.1-pro-preview')||failFallback)return html?new Response('Service unavailable',{status:503}):Response.json({error:{message:'Unavailable'}},{status:503});
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"summary":"same report"}'}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,totalTokenCount:120}});
 }});
 return {run:()=>provider.generate('source_plan',{instruction:'unchanged',brief:'private'},{type:'object'},{model:'gemini-3.1-pro-preview',maxOutputTokens:1024}),calls,steps,cost:()=>ledger.status(),advance:()=>clock+=300000};
}
test('full provider fallback preserves payload, separate cost reservations and reuses durable successful output',async()=>{
 const f=fixture(),result=await f.run();assert.equal(result.model,'gemini-4-argon');assert.equal(f.calls.length,2);assert.deepEqual(f.calls[0].body,f.calls[1].body);
 assert.equal([...f.steps.values()].find(s=>s.state==='uncertain').value.providerStatus,503);
 const cost=await f.cost();assert.ok(cost.chargedKurus>500&&cost.chargedKurus<=5000);
 f.advance();assert.deepEqual(await f.run(),result);assert.equal(f.calls.length,2);assert.deepEqual(await f.cost(),cost);
});
test('503 with a non-JSON body also selects the fallback',async()=>{const f=fixture({html:true});assert.equal((await f.run()).model,'gemini-4-argon');assert.equal(f.calls.length,2);});
test('fallback cannot exceed the shared cap or refund an uncertain primary',async()=>{
 const f=fixture({balance:4800});await assert.rejects(f.run(),e=>e.code==='budget_limit');assert.equal(f.calls.length,1);assert.ok((await f.cost()).chargedKurus<=5000);
});
test('two unavailable models stop after exactly two calls across workers and reloads',async()=>{
 const f=fixture({failFallback:true});await assert.rejects(f.run(),e=>e.code==='model_temporarily_unavailable');const cost=await f.cost();
 await assert.rejects(f.run(),e=>e.code==='model_temporarily_unavailable');assert.equal(f.calls.length,2);assert.deepEqual(await f.cost(),cost);
});
