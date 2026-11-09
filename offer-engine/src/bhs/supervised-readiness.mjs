import {supervisedModels} from './supervised-providers.mjs';
import {inspectApifyPolicies} from './apify-policy.mjs';

export function createSupervisedReadiness({env=process.env,fetchImpl=fetch}={}){
 let pending;
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(env.VERCEL_ENV!=='preview')return res.status(404).json({error:'Not found'});
  if(req.method!=='GET')return res.status(405).json({error:'GET required'});
  // Catalogues only: never generate, crawl, run Actors or access CRM records.
  pending??=(async()=>{
   const probe=async(url,headers)=>{try{const r=await fetchImpl(url,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});return {authenticated:r.ok,status:r.status};}catch{return {authenticated:false,status:'unavailable'};}};
   const [manager,worker,apify]=await Promise.all([
    env.ANTHROPIC_API_KEY?probe('https://api.anthropic.com/v1/models/'+supervisedModels.manager,{'x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'}):{authenticated:false,status:'missing_key'},
    (env.OFFER_GEMINI_API_KEY||env.GEMINI_API_KEY)?probe('https://generativelanguage.googleapis.com/v1beta/models/'+supervisedModels.worker,{'x-goog-api-key':env.OFFER_GEMINI_API_KEY||env.GEMINI_API_KEY}):{authenticated:false,status:'missing_key'},
    inspectApifyPolicies({token:env.APIFY_API_TOKEN,fetchImpl}).catch(()=>({configured:Boolean(env.APIFY_API_TOKEN),complete:false}))
   ]);
   return {manager:{model:supervisedModels.manager,...manager},worker:{model:supervisedModels.worker,...worker},apify:{configured:apify.configured,authenticated:apify.authenticated||false,savedTaskCount:apify.savedTaskCount||0,taskPolicies:apify.taskPolicies||0,complete:apify.complete},tavilyConfigured:Boolean(env.OFFER_TAVILY_API_KEY||env.TAVILY_API_KEY),storageConfigured:Boolean(env.OFFER_STORAGE_GATEWAY_URL&&env.OFFER_STORAGE_GATEWAY_KEY&&env.OFFER_PORTAL_SECRET),backgroundWorkerReady:false,paidCalls:0};
  })();
  return res.status(200).json(await pending);
 };
}
