// Preview-only minimal provider isolation; two calls maximum, no user data or DB.
import {offerGeminiKey} from '../src/config.mjs';
import {quoteModel} from '../src/budget/ledger.mjs';
if(process.env.VERCEL_ENV!=='preview'||process.argv[2]!=='--run')throw Error('Explicit preview diagnostic required');
const key=offerGeminiKey();if(!key)throw Error('Provider not configured');
const models=['gemini-3.1-pro-preview','gemini-4-argon'];let reserved=0;const results=[];
const redact=text=>String(text||'').replaceAll(key,'[credential]').replace(/AIza[A-Za-z0-9_-]+/g,'[credential]').slice(0,600);
for(const model of models){
 const base='https://generativelanguage.googleapis.com/v1beta/models/'+model;
 try{
  const metadata=await fetch(base,{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(20000)});const info=await metadata.json();
  const row={model,metadataStatus:metadata.status,methods:info.supportedGenerationMethods||null};
  const contents=[{role:'user',parts:[{text:'Reply with the single word OK.'}]}];
  const count=await fetch(base+':countTokens',{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({contents}),signal:AbortSignal.timeout(20000)});const counted=await count.json();
  row.countStatus=count.status;row.inputTokens=counted.totalTokens;
  if(!count.ok||!Number.isSafeInteger(counted.totalTokens)||counted.totalTokens>256)throw Error('Minimal token count not confirmed');
  const amount=quoteModel(model,Math.ceil(counted.totalTokens*1.2)+4096,128);
  if(reserved+amount>500)throw Error('5 TRY diagnostic allowance exhausted');
  reserved+=amount;
  const response=await fetch(base+':generateContent',{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({contents,generationConfig:{maxOutputTokens:128,thinkingConfig:{thinkingLevel:'LOW'}}}),signal:AbortSignal.timeout(45000)});
  const body=await response.json();Object.assign(row,{generationStatus:response.status,providerCode:body.error?.status||null,message:body.error?redact(body.error.message):null,finishReason:body.candidates?.[0]?.finishReason||null,reservedKurus:amount});
  results.push(row);
 }catch(error){results.push({model,error:redact(error.message)});}
}
console.log('BHS_MINIMAL_DIAGNOSTIC '+JSON.stringify({results,reservedKurus:reserved,capKurus:500,databaseWrites:0}));
