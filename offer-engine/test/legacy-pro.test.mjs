import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoundedProviders} from '../src/budget/providers.mjs';
import {createLedger,tariff} from '../src/budget/ledger.mjs';
function fixture({version='gemini-2.5-pro',date='2026-11-05T08:00:00Z'}={}){
 let charged=500;const rows=new Map(),calls=[];
 const ledger=createLedger(async(op,a={})=>{
  if(['begin','status'].includes(op))return {chargedKurus:charged,capKurus:5000};const old=rows.get(a.step);if(op==='get')return old||null;
  if(op==='reserve'){if(old)return {claimed:false,step:old};if(charged+a.amount>5000)return {blocked:true};charged+=a.amount;const row={state:'reserved',input_hash:a.hash,claim_token:a.token,charge_kurus:a.amount};rows.set(a.step,row);return {claimed:true,step:row};}
  assert.equal(old.claim_token,a.token);if(op==='complete')charged-=old.charge_kurus-a.amount;const row={...old,state:op,value:a.value,charge_kurus:op==='complete'?a.amount:old.charge_kurus};rows.set(a.step,row);return row;
 });
 const provider=createBoundedProviders({ledger,defaultModel:'gemini-2.5-pro',geminiKey:'test',tavilyKey:'test',now:()=>Date.parse(date),fetchImpl:async(url,init)=>{
  calls.push({url,body:init?.body?JSON.parse(init.body):null});
  if(url.includes('tcmb'))return new Response('<Tarih_Date Tarih="05.11.2026"><Currency CurrencyCode="USD"><ForexSelling>40</ForexSelling></Currency></Tarih_Date>');
  if(url.endsWith(':countTokens'))return Response.json({totalTokens:100});
  return Response.json({modelVersion:version,candidates:[{finishReason:'STOP',content:{parts:[{text:'{"ok":true}'}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:10,thoughtsTokenCount:36,totalTokenCount:146}});
 }});
 return {provider,calls,rows,cost:()=>charged};
}
const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
test('explicit 2.5 Pro support uses its documented price and native thinking budget without lowering full research output limits',async()=>{
 assert.deepEqual(tariff.models['gemini-2.5-pro'],{input:1.25,output:10,cachedInput:.125});
 const f=fixture(),result=await f.provider.generate('synthesis',{instruction:'Read sources.'},schema,{model:'gemini-2.5-pro',maxOutputTokens:16384,minOutputTokens:12288,thinkingLevel:'MEDIUM'});
 const body=f.calls.find(c=>c.url.endsWith(':generateContent')).body;assert.equal(body.generationConfig.maxOutputTokens,16384);assert.equal(body.generationConfig.thinkingConfig.thinkingBudget,4096);assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,undefined);
 assert.equal(result.model,'gemini-2.5-pro');assert.equal(result.providerModelVersion,'gemini-2.5-pro');assert.ok(f.cost()>500&&f.cost()<5000);
});
test('support/translation may select Pro explicitly; small output limits retain room for the actual answer',async()=>{
 const f=fixture();assert.equal(f.provider.preferredModel,'gemini-2.5-pro');await f.provider.generate('scope',{instruction:'Return JSON.'},schema,{maxOutputTokens:1024,thinkingLevel:'LOW'});
 const config=f.calls.find(c=>c.url.endsWith(':generateContent')).body.generationConfig;assert.equal(config.thinkingConfig.thinkingBudget,256);assert.equal(config.maxOutputTokens,1024);
});
test('automatic aliasing to Flash cannot silently replace Pro, and the published retirement date blocks new paid requests',async()=>{
 for(const version of ['gemini-3.8-flash','']){const f=fixture({version});await assert.rejects(f.provider.generate('scope',{},schema,{model:'gemini-2.5-pro',maxOutputTokens:1024}),e=>e.code==='provider_accounting');assert.equal([...f.rows.values()][0].state,'uncertain');}
 const retired=fixture({date:'2026-12-01T00:00:00Z'});await assert.rejects(retired.provider.generate('scope',{},schema,{model:'gemini-2.5-pro',maxOutputTokens:1024}),e=>e.code==='not_configured');assert.equal(retired.calls.length,0);assert.equal(retired.cost(),500);
});
