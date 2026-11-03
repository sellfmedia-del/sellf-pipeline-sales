import test from 'node:test';
import assert from 'node:assert/strict';
import {startLogoDiagnostic} from '../src/budget/logo-diagnostic.mjs';
import {createBoundedProviders} from '../src/budget/providers.mjs';

test('diagnostics log status and classification without copying sensitive errors',()=>{
 const logs=[];let tick=100,watch,cleared=0;
 const logger=Object.fromEntries(['info','warn','error'].map(level=>[level,value=>logs.push({level,...JSON.parse(value)})]));
 const trace=startLogoDiagnostic({stage:'logo-region',model:'gemini-3.8-flash',operation:'generateContent'},{logger,clock:()=>tick,schedule:fn=>{watch=fn;return {unref(){}};},cancel:()=>cleared++});
 tick=60100;watch();trace.response(503);
 const error=Object.assign(Error('private brief API_KEY_SECRET data:image/png;base64,secret'),{code:'provider_error',providerReason:'model_unavailable',headers:{Authorization:'secret'}});
 trace.finish(error);trace.finish(error);
 assert.deepEqual(logs.map(x=>x.phase),['start','still_waiting','response','failed']);
 assert.equal(logs.at(-1).status,503);assert.equal(logs.at(-1).reason,'model_unavailable');assert.equal(logs.at(-1).level,'error');assert.equal(cleared,1);
 assert.doesNotMatch(JSON.stringify(logs),/private|API_KEY_SECRET|base64|Authorization/);
});
test('transport failures and successful completion cancel the diagnostic timer',()=>{
 for(const error of [undefined,Object.assign(Error('secret'),{name:'TimeoutError'})]){
  const logs=[];let cleared=false;
  const logger=Object.fromEntries(['info','warn','error'].map(k=>[k,x=>logs.push(JSON.parse(x))]));
  startLogoDiagnostic({stage:'logo-backdrop',model:'gemini-3.8-flash',operation:'countTokens'},{logger,schedule:()=>({unref(){}}),cancel:()=>cleared=true}).finish(error);
  assert.equal(cleared,true);assert.equal(logs.at(-1).phase,error?'failed':'complete');if(error)assert.equal(logs.at(-1).code,'timeout');
 }
});
test('failed logo calls preserve the original provider error, request count and budget reservation',async()=>{
 const logs=[],calls=[],ops=[];const original={info:console.info,warn:console.warn,error:console.error};
 for(const key of Object.keys(original))console[key]=text=>logs.push(JSON.parse(text));
 try{
  const providers=createBoundedProviders({geminiKey:'SECRET',now:()=>Date.parse('2026-11-03T12:00:00Z'),ledger:{get:async()=>null,status:async()=>({chargedKurus:500}),once:async(key,body,amount,run)=>{ops.push({key,amount});return run();}},fetchImpl:async(url,init)=>{
   calls.push({url,init});
   if(url.includes('tcmb'))return new Response('<Tarih_Date Tarih="03.11.2026"><Currency CurrencyCode="USD"><ForexSelling>40</ForexSelling></Currency></Tarih_Date>');
   if(url.endsWith(':countTokens'))return Response.json({totalTokens:100});
   return Response.json({error:{message:'Model not found SECRET'}},{status:503});
  }});
  await assert.rejects(providers.generate('logo-region',{privateBrief:'PRIVATE'}, {type:'object'},{maxOutputTokens:1024}),e=>e.code==='provider_error'&&e.providerStatus===503&&e.providerReason==='model_unavailable');
  assert.equal(calls.length,3);assert.equal(ops.length,1);assert.ok(ops[0].amount>0);
  assert.equal(logs.at(-1).status,503);assert.equal(logs.at(-1).operation,'generateContent');assert.doesNotMatch(JSON.stringify(logs),/SECRET|PRIVATE/);
 }finally{Object.assign(console,original);}
});
