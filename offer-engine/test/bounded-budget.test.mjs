import test from 'node:test';
import assert from 'node:assert/strict';
import {createLedger,quoteModel,quoteSearch,tariff} from '../src/budget/ledger.mjs';
import {createBoundedProviders} from '../src/budget/providers.mjs';

// Two worker instances share the same durable-store contract. The SQL lock is
// independently checked against Postgres; this fixture tests caller behaviour.
function store(){
 let charged=500;const steps=new Map();
 const call=async(op,a={})=>{
  if(op==='begin'||op==='status')return {chargedKurus:charged,capKurus:5000};
  if(op==='get')return steps.get(a.step)||null;
  const prior=steps.get(a.step);
  if(op==='reserve'){
   if(prior){assert.equal(prior.input_hash,a.hash);return {claimed:false,step:prior};}
   if(charged+a.amount>5000)return {blocked:true};
   charged+=a.amount;steps.set(a.step,{state:'reserved',input_hash:a.hash,claim_token:a.token,charge_kurus:a.amount});return {claimed:true};
  }
  assert.equal(prior.claim_token,a.token);assert.equal(prior.input_hash,a.hash);
  if(op==='complete'){assert.ok(a.amount>=0&&a.amount<=prior.charge_kurus);charged-=prior.charge_kurus-a.amount;}
  steps.set(a.step,{...prior,state:op,value:a.value});return steps.get(a.step);
 };
 return {call,steps};
}
const time=Date.parse('2026-10-20T12:00:00Z');
const fx=rate=>new Response(`<Tarih_Date Tarih="20.10.2026"><Currency CurrencyCode="USD"><ForexSelling>${rate}</ForexSelling></Currency></Tarih_Date>`);
const json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
test('shared budget prevents concurrent duplicate paid work and caches completion',async()=>{
 const db=store(),one=createLedger(db.call),two=createLedger(db.call);let release,calls=0;
 const pending=one.once('same',{a:1},1000,async()=>{calls++;await new Promise(r=>release=r);return {ok:true};});
 await new Promise(r=>setImmediate(r));
 await assert.rejects(two.once('same',{a:1},1000,async()=>{calls++;}),e=>e.code==='budget_pending');
 release();assert.deepEqual(await pending,{ok:true});
 assert.deepEqual(await two.once('same',{a:1},1000,()=>assert.fail('must reuse')),{ok:true});
 assert.equal(calls,1);assert.equal((await two.status()).chargedKurus,1500);
});
test('failed or ambiguous paid work stays charged and cannot replay',async()=>{
 const db=store(),ledger=createLedger(db.call);
 await assert.rejects(ledger.once('failed',{},1200,async()=>{throw Error('network lost');}));
 await assert.rejects(createLedger(db.call).once('failed',{},1200,()=>assert.fail()),e=>e.code==='budget_uncertain');
 assert.equal((await ledger.status()).chargedKurus,1700);
});
test('only verified successful usage releases unused reservation and concurrent workers share the settled balance',async()=>{
 const db=store(),ledger=createLedger(db.call);
 await ledger.once('pro',{},4000,async()=>({actual:1200}),{settle:x=>x.actual});
 assert.equal((await createLedger(db.call).status()).chargedKurus,1700);
 await createLedger(db.call).once('review',{},3000,async()=>({ok:true}));
 assert.equal((await ledger.status()).chargedKurus,4700);
 await assert.rejects(ledger.once('bad-usage',{},200,async()=>({actual:500}),{settle:x=>x.actual}),e=>e.code==='provider_accounting');
 assert.equal((await ledger.status()).chargedKurus,4900);
});
test('a documented non-billed rejection releases its reservation but cannot replay the same request',async()=>{
 const db=store(),ledger=createLedger(db.call),error=Object.assign(Error('rejected'),{code:'provider_error',definitelyNotBilled:true,providerStatus:400});
 await assert.rejects(ledger.once('rejected',{},1000,async()=>{throw error;}));
 assert.equal((await ledger.status()).chargedKurus,500);
 await assert.rejects(createLedger(db.call).once('rejected',{},1000,()=>assert.fail('must not replay')),e=>e.code==='provider_rejected');
});
test('50 TL ceiling blocks work before executing, including distinct concurrent steps',async()=>{
 const db=store(),a=createLedger(db.call),b=createLedger(db.call);let executed=0;
 const result=await Promise.allSettled([a.once('a',{},3000,async()=>++executed),b.once('b',{},3000,async()=>++executed)]);
 assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(executed,1);
 assert.ok((await a.status()).chargedKurus<=5000);
});
test('a rejected nested provider cannot mark the free coordinator successful',async()=>{
 const db=store(),ledger=createLedger(db.call),error=Object.assign(Error('rejected'),{definitelyNotBilled:true,providerStatus:400});
 await assert.rejects(ledger.once('coordinator',{},0,()=>ledger.once('provider',{},1000,async()=>{throw error;})));
 assert.equal(db.steps.get('provider').state,'complete');
 assert.equal(db.steps.get('provider').value.rejected,true);
 assert.equal(db.steps.get('coordinator').state,'uncertain');
 assert.equal((await ledger.status()).chargedKurus,500);
});
test('reviewed tariffs reject unknown models and expired rates',()=>{
 assert.equal(quoteSearch(),116);
 assert.equal(quoteModel('gemini-3.1-pro-preview',20000,16384,time),1704);
 assert.throws(()=>quoteModel('deep-research-max-preview-04-2026',1000,1000,time));
 assert.throws(()=>quoteModel('gemini-3.1-pro-preview',1000,1000,Date.parse(tariff.expires)));
});
test('provider reserves complete output ceiling, uses countTokens, never starts an autonomous agent',async()=>{
 const db=store(),ledger=createLedger(db.call),requests=[];
 const fetchImpl=async(url,options)=>{
  requests.push({url,body:options?.body&&JSON.parse(options.body)});
  if(url.includes('tcmb'))return fx(46);
  if(url.endsWith(':countTokens'))return json({totalTokens:1000});
  assert.ok(url.endsWith(':generateContent'));return json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"ok":true}'}]}}],usageMetadata:{promptTokenCount:1000,candidatesTokenCount:10,thoughtsTokenCount:20,totalTokenCount:1030}});
 };
 const provider=createBoundedProviders({ledger,fetchImpl,now:()=>time,geminiKey:'test',tavilyKey:'test'});
 const result=await provider.generate('synthesis',{source:'text'},{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false},{model:'gemini-3.1-pro-preview',maxOutputTokens:16384});
 assert.equal(result.reservedKurus,quoteModel(result.model,5296,16384,time));
 assert.deepEqual(result.data,{ok:true});
 await provider.generate('synthesis',{source:'text'},{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false},{model:'gemini-3.1-pro-preview',maxOutputTokens:16384});
 assert.equal(requests.filter(x=>x.url.endsWith(':generateContent')).length,1);
 assert.ok(requests.every(x=>!x.url.includes('interactions')));
});
test('exchange-rate and unavailable-FX checks stop before any paid request',async()=>{
 for(const response of [()=>fx(61),()=>new Response('',{status:503}),()=>new Response('<bad/>')]){
  let paid=0;const provider=createBoundedProviders({ledger:createLedger(store().call),geminiKey:'test',tavilyKey:'test',now:()=>time,fetchImpl:async url=>{if(url.includes('tcmb'))return response();paid++;return json({});}});
  await assert.rejects(provider.search('brand'));assert.equal(paid,0);
 }
});
test('oversized generation is blocked by ledger before billable POST',async()=>{
 let generated=0;const provider=createBoundedProviders({ledger:createLedger(store().call),geminiKey:'test',tavilyKey:'test',now:()=>time,fetchImpl:async url=>{
  if(url.includes('tcmb'))return fx(46);
  if(url.endsWith(':countTokens'))return json({totalTokens:180000});
  generated++;return json({});
 }});
 await assert.rejects(provider.generate('synthesis',{}, {type:'object'},{model:'gemini-3.1-pro-preview',maxOutputTokens:16384}),e=>e.code==='input_budget');assert.equal(generated,0);
});
test('Tavily advanced search is bounded, cached, and charged without free-quota assumptions',async()=>{
 const db=store();let paid=0;
 const provider=createBoundedProviders({ledger:createLedger(db.call),geminiKey:'test',tavilyKey:'test',now:()=>time,fetchImpl:async(url,options)=>{
  if(url.includes('tcmb'))return fx(46);paid++;const body=JSON.parse(options.body);assert.equal(body.search_depth,'advanced');assert.equal(body.auto_parameters,false);assert.equal(body.max_results,6);return json({results:[{url:'https://example.com',content:'evidence'}]});
 }});
 await provider.search('brand');await provider.search('brand');assert.equal(paid,1);assert.equal((await createLedger(db.call).status()).chargedKurus,616);
});
test('parallel discovery shares a single FX lookup and still reserves every paid search',async()=>{
 const db=store();let fxCalls=0,paid=0,release;const ready=new Promise(r=>release=r);
 const provider=createBoundedProviders({ledger:createLedger(db.call),geminiKey:'test',tavilyKey:'test',now:()=>time,fetchImpl:async url=>{
  if(url.includes('tcmb')){fxCalls++;await ready;return fx(46);}paid++;return json({results:[]});
 }});
 const pending=Promise.all(['brand finance','brand reviews','brand competitors'].map(q=>provider.search(q)));
 await new Promise(r=>setImmediate(r));assert.equal(fxCalls,1);release();await pending;
 assert.equal(paid,3);assert.equal((await createLedger(db.call).status()).chargedKurus,848);
});

test('logo pixels are included in token counting and generation under the same card ledger',async()=>{
 const db=store(),seen=[];const provider=createBoundedProviders({ledger:createLedger(db.call),now:()=>time,geminiKey:'test',fetchImpl:async(url,options)=>{
  if(url.includes('tcmb'))return fx(46);const body=JSON.parse(options.body);seen.push(body);
  if(url.endsWith(':countTokens'))return json({totalTokens:1200});
  return json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"found":true}'}]}}],usageMetadata:{promptTokenCount:1200,candidatesTokenCount:20,totalTokenCount:1220}});
 }});
 await provider.generate('logo-region',{instruction:'Locate only.'},{type:'object'},{image:{mimeType:'image/png',data:'AAAA'},maxOutputTokens:1024,jsonMode:true});
 assert.deepEqual(seen[0].generateContentRequest.contents[0].parts[1],{inlineData:{mimeType:'image/png',data:'AAAA'}});assert.deepEqual(seen[1].contents[0].parts[1],seen[0].generateContentRequest.contents[0].parts[1]);assert.ok((await createLedger(db.call).status()).chargedKurus>500);
});
test('synthesis reserves room for scope, adapts only inside the substantial output envelope, and stops before spending when exhausted',async()=>{
 for(const charged of [2800,3900]){
  const db=store(),ledger=createLedger(db.call);await ledger.once('prior',{},charged-500,async()=>({}));let generated=0;
  const provider=createBoundedProviders({ledger,now:()=>time,geminiKey:'test',fetchImpl:async(url,options)=>{
   if(url.includes('tcmb'))return fx(46);if(url.endsWith(':countTokens'))return json({totalTokens:18000});generated++;const body=JSON.parse(options.body);assert.ok(body.generationConfig.maxOutputTokens>=12288);assert.ok(body.generationConfig.maxOutputTokens<=16384);
   return json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"ok":true}'}]}}],usageMetadata:{promptTokenCount:18000,candidatesTokenCount:9000,totalTokenCount:27000}});
  }});
  const run=()=>provider.generate('synthesis',{}, {type:'object'},{model:'gemini-3.1-pro-preview',maxOutputTokens:16384,minOutputTokens:12288,reserveForFollowingKurus:100});
  if(charged===3900){await assert.rejects(run,e=>e.code==='budget_limit');assert.equal(generated,0);}else{await run();assert.equal(generated,1);assert.ok((await ledger.status()).chargedKurus<=4900);}
 }
});
