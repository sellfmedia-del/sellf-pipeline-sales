import {supervisedModels} from './supervised-providers.mjs';
import {inspectApifyPolicies} from './apify-policy.mjs';
import {actorIds} from './apify-inputs.mjs';

export async function historicalApifyLimits({token,userId,fetchImpl=fetch}={}){
 if(!token||!userId)return [];
 const rows=await Promise.allSettled(Object.entries(actorIds).map(async([actor,actorId])=>{
  const r=await fetchImpl('https://api.apify.com/v2/acts/'+actorId+'/runs/last',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000),redirect:'error'});
  if(!r.ok)return null;const run=(await r.json()).data,cap=run?.options?.maxTotalChargeUsd;
  if(run?.userId!==userId||run.actId!==actorId||run.options?.isMaxTotalChargeUsdSetByUser!==true||!Number.isFinite(cap)||cap<=0||cap>.4)return null;
  return {actor,runId:run.id,startedAt:run.startedAt,origin:run.meta?.origin,maxTotalChargeUsd:cap,basis:'historical_explicit_run_option_not_active_policy'};
 }));
 return rows.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value);
}

export function createSupervisedReadiness({env=process.env,fetchImpl=fetch}={}){
 let pending;
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(env.VERCEL_ENV!=='preview')return res.status(404).json({error:'Not found'});
  if(req.method!=='GET')return res.status(405).json({error:'GET required'});
  // Catalogues only: never generate, crawl, run Actors or access CRM records.
  pending??=(async()=>{
   const probe=async(url,headers)=>{try{const r=await fetchImpl(url,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});return {authenticated:r.ok,status:r.status};}catch{return {authenticated:false,status:'unavailable'};}};
   const identity=async()=>{if(!env.APIFY_API_TOKEN)return null;try{const response=await fetchImpl('https://api.apify.com/v2/users/me',{headers:{Authorization:'Bearer '+env.APIFY_API_TOKEN},signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok)return null;const user=(await response.json())?.data,name=user?.username;return typeof name==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(name)?{username:name,id:user.id}:null;}catch{return null;}};
   const [manager,worker,apify,account]=await Promise.all([
    env.ANTHROPIC_API_KEY?probe('https://api.anthropic.com/v1/models/'+supervisedModels.manager,{'x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'}):{authenticated:false,status:'missing_key'},
    (env.OFFER_GEMINI_API_KEY||env.GEMINI_API_KEY)?probe('https://generativelanguage.googleapis.com/v1beta/models/'+supervisedModels.worker,{'x-goog-api-key':env.OFFER_GEMINI_API_KEY||env.GEMINI_API_KEY}):{authenticated:false,status:'missing_key'},
    inspectApifyPolicies({token:env.APIFY_API_TOKEN,fetchImpl,policyJson:env.OFFER_BHS_ACTOR_LIMITS_JSON}).catch(()=>({configured:Boolean(env.APIFY_API_TOKEN),complete:false})),identity()
   ]);
   return {manager:{model:supervisedModels.manager,...manager},worker:{model:supervisedModels.worker,...worker},apify:{configured:apify.configured,authenticated:apify.authenticated||false,savedTaskCount:apify.savedTaskCount||0,explicitPolicyCount:apify.explicitPolicyCount||0,taskPolicies:apify.taskPolicies||0,complete:apify.complete,accountUsername:account?.username||null,historicalRunLimits:await historicalApifyLimits({token:env.APIFY_API_TOKEN,userId:account?.id,fetchImpl})},tavilyConfigured:Boolean(env.OFFER_TAVILY_API_KEY||env.TAVILY_API_KEY),storageConfigured:Boolean(env.OFFER_STORAGE_GATEWAY_URL&&env.OFFER_STORAGE_GATEWAY_KEY&&env.OFFER_PORTAL_SECRET),backgroundWorkerReady:false,paidCalls:0};
  })();
  return res.status(200).json(await pending);
 };
}
