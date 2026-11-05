import test from 'node:test';
import assert from 'node:assert/strict';
import {createGatewayTransport,gatewayRequest} from '../src/budget/gateway-transport.mjs';
import {createBoundedProviders} from '../src/budget/providers.mjs';
import {createLedger} from '../src/budget/ledger.mjs';
const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
const body={systemInstruction:{parts:[{text:'Original system instruction'}]},contents:[{role:'user',parts:[{text:'Exact brief and read-source context'},{inlineData:{mimeType:'image/png',data:'AAA'}}]}],generationConfig:{maxOutputTokens:16384,thinkingConfig:{thinkingLevel:'MEDIUM'}}};
test('same-model Vertex request preserves instructions, context, image bytes, reasoning and output limits with a provider allowlist',()=>{
 const req=gatewayRequest('gemini-3.1-pro-preview',body,schema);
 assert.equal(req.model,'google/gemini-3.1-pro-preview');assert.equal(req.max_tokens,16384);assert.equal(req.reasoning.effort,'medium');
 assert.equal(req.messages[0].content,'Original system instruction');assert.equal(req.messages[1].content[0].text,'Exact brief and read-source context');assert.equal(req.messages[1].content[1].image_url.url,'data:image/png;base64,AAA');
 assert.deepEqual(req.providerOptions.gateway.only,['vertex']);assert.equal(req.providerOptions.gateway.models,undefined);assert.equal(req.response_format.json_schema.schema.type,'object');
 assert.equal(JSON.stringify(req).includes('gateway-secret'),false);
});
function fixture({balance=500,mode='ok'}={}){
 let charged=balance;const steps=new Map(),calls=[];
 const ledger=createLedger(async(op,a={})=>{
  if(['begin','status'].includes(op))return {chargedKurus:charged,capKurus:5000};
  const old=steps.get(a.step);if(op==='get')return old||null;
  if(op==='reserve'){if(old)return {claimed:false,step:old};if(charged+a.amount>5000)return {blocked:true};charged+=a.amount;const row={state:'reserved',input_hash:a.hash,claim_token:a.token,charge_kurus:a.amount};steps.set(a.step,row);return {claimed:true,step:row};}
  assert.equal(old.claim_token,a.token);if(old.state==='complete')return old;
  if(op==='complete')charged-=old.charge_kurus-a.amount;
  const row={...old,state:op,value:a.value,charge_kurus:op==='complete'?a.amount:old.charge_kurus};steps.set(a.step,row);return row;
 });
 const fetchImpl=async(url,init={})=>{
  calls.push({url,init});
  if(url.includes('tcmb'))return new Response('<Tarih_Date Tarih="05.11.2026"><Currency CurrencyCode="USD"><ForexSelling>40</ForexSelling></Currency></Tarih_Date>');
  if(url.endsWith(':countTokens'))return Response.json({totalTokens:100});
  assert.ok(url.startsWith('https://ai-gateway.vercel.sh/v1/'),'paid Google generation must not be called');
  if(url.endsWith('/credits'))return Response.json(mode==='no-credit'?{balance:'0'}:{balance:'5'});
  if(url.endsWith('/endpoints'))return Response.json({data:{endpoints:[{provider_name:'vertex',pricing:{prompt:mode==='price-rise'?'0.000003':'0.000002',completion:mode==='price-rise'?'0.00002':'0.00001',request:'0'}}]}});
  assert.ok(url.endsWith('/chat/completions'));assert.equal(init.headers.Authorization,'Bearer gateway-secret');
  const req=JSON.parse(init.body);
  if(mode==='timeout')throw new DOMException('Timed out','TimeoutError');
  const routing={resolvedProvider:mode==='wrong-provider'?'google':'vertex',originalModelId:req.model,totalProviderAttemptCount:mode==='access-denied'?0:1};
  if(mode==='access-denied')return Response.json({error:{type:'no_providers_available'},providerMetadata:{gateway:{routing}}},{status:403});
  return Response.json({id:'gen-test',model:mode==='wrong-model'?'google/another-model':req.model,providerMetadata:{gateway:{routing}},choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}],usage:{prompt_tokens:100,completion_tokens:10,total_tokens:110,completion_tokens_details:{reasoning_tokens:2},prompt_tokens_details:{cached_tokens:0}}});
 };
 const provider=createBoundedProviders({ledger,transport:'vertex',gatewayToken:'gateway-secret',geminiKey:'google-secret',tavilyKey:'search-test',fetchImpl,now:()=>Date.parse('2026-11-05T08:00:00Z')});
 return {ledger,steps,calls,run:()=>provider.generate('provider_preflight',{instruction:'Return JSON.'},schema,{model:'gemini-3.1-pro-preview',maxOutputTokens:1024}),charged:()=>charged};
}
test('Vertex generation settles verified usage in the same bounded ledger and never repeats after reload',async()=>{
 const f=fixture(),result=await f.run();assert.equal(result.data.ok,true);assert.equal(result.gatewayReceipt.provider,'vertex');
 assert.equal(result.usage.thoughtsTokenCount,2);assert.equal(result.usage.candidatesTokenCount,8);assert.ok(f.charged()>500&&f.charged()<1000);
 const cost=f.charged();assert.deepEqual(await f.run(),result);assert.equal(f.charged(),cost);assert.equal(f.calls.filter(c=>c.url.endsWith('/chat/completions')).length,1);
 assert.equal(f.steps.values().next().value.state,'complete');
});
test('unavailable account access records a confirmed zero-provider-attempt result without reserving phantom spend',async()=>{
 const f=fixture({mode:'access-denied'});await assert.rejects(f.run(),e=>e.code==='not_configured');
 assert.equal(f.charged(),500);const row=[...f.steps.values()][0];assert.equal(row.state,'complete');assert.equal(row.charge_kurus,0);assert.equal(row.value.accountedKurus,0);
 await assert.rejects(f.run());assert.equal(f.calls.filter(c=>c.url.endsWith('/chat/completions')).length,1);
});
test('empty credits, rising rates and an exhausted offer cap block generation before a paid provider request',async()=>{
 for(const options of [{mode:'no-credit'},{mode:'price-rise'},{balance:4990}]){
  const f=fixture(options);await assert.rejects(f.run());assert.equal(f.charged(),options.balance||500);assert.equal(f.calls.filter(c=>c.url.endsWith('/chat/completions')).length,0);
 }
});
test('a different returned model/provider cannot be accepted; uncertain consumed requests retain their reservation',async()=>{
 for(const mode of ['wrong-model','wrong-provider']){
  const f=fixture({mode});await assert.rejects(f.run(),e=>e.code==='provider_accounting');assert.ok(f.charged()>500&&f.charged()<5000);assert.equal([...f.steps.values()][0].state,'uncertain');
 }
});
test('ambiguous Vertex timeouts keep both reservations and bounded fallback never repeats on reload',async()=>{
 const f=fixture({mode:'timeout'});await assert.rejects(f.run(),e=>e.code==='model_temporarily_unavailable');const cost=f.charged();assert.ok(cost>500&&cost<=5000);
 await assert.rejects(f.run());assert.equal(f.charged(),cost);assert.equal(f.calls.filter(c=>c.url.endsWith('/chat/completions')).length,2);
});
