import {mkdir,writeFile} from 'node:fs/promises';
if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_PROJECT_ID!=='prj_B6Q6FIgq9NjbBlb6ga03cn6PD3jJ'||process.env.VERCEL_GIT_COMMIT_REF!=='qa/gateway-access-20261105'||Date.now()>Date.parse('2026-11-06T12:00:00Z'))throw Error('Isolated probe required');
const token=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN,summary={configured:Boolean(token),generationStarted:false,model:'google/gemini-3.1-pro-preview',providerRequested:'vertex',maximumCostTry:1,customerWrites:0};
try{
 if(!token)throw Error('gateway_auth_missing');
 const headers={Authorization:'Bearer '+token};
 const credit=await fetch('https://ai-gateway.vercel.sh/v1/credits',{headers,signal:AbortSignal.timeout(15000)}),balance=await credit.json();
 summary.creditStatus=credit.status;summary.creditAvailable=credit.ok&&Number(balance.balance)>0;
 if(!summary.creditAvailable){summary.code=balance.error?.type||balance.error?.code||'gateway_credit_unavailable';}
 else{
  summary.generationStarted=true;const r=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{method:'POST',headers:{...headers,'Content-Type':'application/json'},signal:AbortSignal.timeout(90000),body:JSON.stringify({model:summary.model,messages:[{role:'user',content:'Return only the JSON object {"ok":true}.'}],max_tokens:256,reasoning:{effort:'low'},response_format:{type:'json_schema',json_schema:{name:'connection_check',strict:true,schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false}}},providerOptions:{gateway:{only:['vertex']}}})});
  const j=await r.json();summary.status=r.status;summary.id=j.id;summary.returnedModel=j.model;summary.usage=j.usage;summary.code=j.error?.type||j.error?.code;summary.finishReason=j.choices?.[0]?.finish_reason;summary.content=j.choices?.[0]?.message?.content;summary.metadata=j.provider_metadata||j.providerMetadata;summary.responseKeys=Object.keys(j);
  if(j.id){const cost=await fetch('https://ai-gateway.vercel.sh/v1/generation?id='+encodeURIComponent(j.id),{headers,signal:AbortSignal.timeout(15000)});summary.lookupStatus=cost.status;if(cost.ok){const info=await cost.json();summary.generation=info;}}
 }
}catch(error){summary.code=error.name==='TimeoutError'?'gateway_timeout':String(error.message).replaceAll(token||'NO_SECRET','[credential]').slice(0,100);}
await mkdir('offer-engine/public',{recursive:true});await writeFile('offer-engine/public/qa-gateway.json',JSON.stringify(summary));console.log('GATEWAY_PROBE '+JSON.stringify(summary));
