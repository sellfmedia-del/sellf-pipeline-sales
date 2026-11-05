import {mkdir,writeFile} from 'node:fs/promises';
if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_PROJECT_ID!=='prj_B6Q6FIgq9NjbBlb6ga03cn6PD3jJ'||process.env.VERCEL_GIT_COMMIT_REF!=='qa/gateway-access-20261105'||Date.now()>Date.parse('2026-11-06T12:00:00Z'))throw Error('Isolated probe required');
const token=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN,summary={configured:Boolean(token),maximumCostTry:2,customerWrites:0,probes:[]};
try{
 if(!token)throw Error('gateway_auth_missing');
 const headers={Authorization:'Bearer '+token};
 const credit=await fetch('https://ai-gateway.vercel.sh/v1/credits',{headers,signal:AbortSignal.timeout(15000)}),balance=await credit.json();
 summary.creditStatus=credit.status;summary.creditAvailable=credit.ok&&Number(balance.balance)>0;
 if(!summary.creditAvailable)summary.code=balance.error?.type||balance.error?.code||'gateway_credit_unavailable';
 else for(const model of ['google/gemini-3.1-pro-preview','google/gemini-4-argon','google/gemini-2.5-pro']){
  const r=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{method:'POST',headers:{...headers,'Content-Type':'application/json'},signal:AbortSignal.timeout(60000),body:JSON.stringify({model,messages:[{role:'user',content:'Return only {"ok":true}.'}],max_tokens:128,reasoning:{effort:'low'},response_format:{type:'json_schema',json_schema:{name:'connection_check',strict:true,schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false}}}})});
  const j=await r.json(),entry={model,status:r.status,id:j.id,returnedModel:j.model,usage:j.usage,code:j.error?.type||j.error?.code,message:j.error?.message?.replaceAll(token,'[credential]').slice(0,300),finishReason:j.choices?.[0]?.finish_reason,content:j.choices?.[0]?.message?.content,metadata:j.provider_metadata||j.providerMetadata};summary.probes.push(entry);
  if(r.ok)break;
 }
}catch(error){summary.code=error.name==='TimeoutError'?'gateway_timeout':String(error.message).replaceAll(token||'NO_SECRET','[credential]').slice(0,100);}
await mkdir('offer-engine/public',{recursive:true});await writeFile('offer-engine/public/qa-gateway.json',JSON.stringify(summary));console.log('GATEWAY_PROBE '+JSON.stringify(summary));
