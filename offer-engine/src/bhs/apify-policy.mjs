import {BudgetError,tariff} from '../budget/ledger.mjs';
import {researchUrl} from './research-url.mjs';
import {actorIds,searchActors} from './apify-inputs.mjs';

export const approvedActors=Object.freeze([
 ...searchActors,'apify/rag-web-browser','apify/instagram-comment-scraper','compass/google-maps-reviews-scraper',
 'harvestapi/linkedin-company-search','harvestapi/linkedin-post-search','curious_coder/linkedin-jobs-scraper',
 'apify/instagram-profile-scraper','apify/instagram-scraper','compass/crawler-google-places',
 'jmlp/meta-ad-library-scraper','logiover/website-seo-audit-crawler','apify/website-content-crawler',
 'clockworks/tiktok-scraper','fatihtahta/trendyol-scraper','junglee/free-amazon-product-scraper','damilo/google-shopping-apify'
]);
// User-authorized BHS ceiling (2026-11-10). Lower saved/server limits win.
// This is a per-Actor ceiling, never an instruction to spend the whole amount.
export const defaultActorMaxUsd=.2;
export const defaultActorPolicies=()=>approvedActors.map(actor=>({id:'bhs-default:'+actorIds[actor],actId:actorIds[actor],options:{maxTotalChargeUsd:defaultActorMaxUsd},policySource:'user-authorized-default'}));
// An explicitly provisioned server snapshot is useful when the Console keeps
// per-Actor run options without saved Tasks. Never infer missing limits or
// accept this configuration from an audit request/model/browser payload.
export function explicitActorPolicies(value){
 if(!value)return [];
 let rows;try{if(typeof value!=='string'||value.length>6000)throw Error();rows=JSON.parse(value);}catch{throw new BudgetError('actor_limit_unverified','Sunucu aktör limitleri okunamadı.');}
 const seen=new Set();
 if(!Array.isArray(rows)||rows.length>approvedActors.length)throw new BudgetError('actor_limit_unverified','Sunucu aktör limit listesi geçersiz.');
 return rows.map(row=>{
  if(!row||typeof row!=='object'||Object.keys(row).sort().join('|')!=='actor|maxTotalChargeUsd'||!approvedActors.includes(row.actor)||seen.has(row.actor)||!Number.isFinite(row.maxTotalChargeUsd)||row.maxTotalChargeUsd<=0||row.maxTotalChargeUsd>.4)throw new BudgetError('actor_limit_unverified','Aktörün özel sunucu harcama limiti geçersiz.');
  seen.add(row.actor);const actId=actorIds[row.actor];
  return {id:'server-policy:'+actId,actId,options:{maxTotalChargeUsd:row.maxTotalChargeUsd},policySource:'explicit-server-policy'};
 });
}
// A console form, a favourite, and an Actor's developer defaults are not a
// verified account-specific spending policy. The explicit user-authorized
// default is .20; saved Tasks/server policies may only reduce that ceiling.
// Actor GET defines this nullable flag as extra usage only when true.
// Current live PPE metadata omits it for standard event-only pricing.
// https://docs.apify.com/api/v2/actor-get (reviewed 2026-11-10)
export const eventOnlyPricing=p=>p?.pricingModel==='PAY_PER_EVENT'&&(p.isPPEPlatformUsagePaidByUser===false||p.isPPEPlatformUsagePaidByUser==null);
export function actorChargeLimit({actor,task,actorId,requestedUsd,remainingKurus,followingKurus=1600,pricing}){
 if(!approvedActors.includes(actor))throw new BudgetError('actor_not_approved','Bu aktör normal BHS kapsamına alınmadı.');
 const cap=task?.options?.maxTotalChargeUsd;
 if(task?.actId!==actorId||!Number.isFinite(cap)||cap<=0||cap>.4)throw new BudgetError('actor_limit_unverified','Aktörün hesapta kaydedilmiş özel harcama limiti doğrulanamadı.');
 // Only standard event-only PPE is supported; usage-priced/rental Actors
 // and explicit extra-platform-usage pricing are never admitted.
 if(!eventOnlyPricing(pricing))throw new BudgetError('actor_pricing_unverified','Aktörün tüm çalışma ücretlerini kapsayan limiti doğrulanmalı.');
 if(!Number.isSafeInteger(remainingKurus)||!Number.isSafeInteger(followingKurus)||remainingKurus<=followingKurus||followingKurus<0||!Number.isFinite(requestedUsd)||requestedUsd<=0)throw new BudgetError('budget_limit','Aktör için kalan BHS bütçesi yetersiz.');
 const remainingUsd=Math.floor((remainingKurus-followingKurus)/(tariff.usdTry*tariff.overhead*100)*1e6)/1e6;
 const maxTotalChargeUsd=Math.min(cap,defaultActorMaxUsd,requestedUsd,remainingUsd);
 if(maxTotalChargeUsd<=0||Number.isFinite(pricing.minimalMaxTotalChargeUsd)&&maxTotalChargeUsd<pricing.minimalMaxTotalChargeUsd)throw new BudgetError('budget_limit','Aktörün minimum ücreti kalan bütçeye sığmıyor.');
 return {maxTotalChargeUsd,reservedKurus:Math.ceil(maxTotalChargeUsd*tariff.usdTry*tariff.overhead*100),capSource:task.policySource||'saved-task',taskId:task.id,actorId};
}
export function safeActorInput(actor,url){
 const safe=researchUrl(url);if(!safe)throw new BudgetError('actor_source_unverified','Aktör kaynağı geçersiz.');
 const parsed=new URL(safe),host=parsed.hostname.replace(/^www\./,'');
 if(actor==='apify/instagram-profile-scraper'&&host==='instagram.com'&&/^\/[\w.]+\/?$/.test(parsed.pathname)&&!['p','reel','explore','accounts'].includes(parsed.pathname.split('/')[1]))return {usernames:[parsed.pathname.split('/')[1]],includeAboutSection:false};
 if(actor==='logiover/website-seo-audit-crawler')return {startUrls:[{url:safe}],crawlScope:'same-hostname',maxPagesToCrawl:5,maxConcurrency:2,useProxy:false};
 // Other schemas need their own bounded inputs and output provenance adapter.
 // Merely being approved in the catalogue must never allow arbitrary inputs.
 throw new BudgetError('actor_adapter_pending','Bu aktörün sınırlandırılmış girdi ve kaynak doğrulama adaptörü henüz hazır değil.');
}
export function matchedActorTasks(actorId,tasks){return tasks.filter(task=>task.actId===actorId&&Number.isFinite(task.options?.maxTotalChargeUsd)&&task.options.maxTotalChargeUsd>0&&task.options.maxTotalChargeUsd<=.4).sort((a,b)=>a.options.maxTotalChargeUsd-b.options.maxTotalChargeUsd);}

// Read-only account inspection. No /runs endpoint, inputs, cookies or actor
// execution is exposed by this adapter. Task options remain server-side.
export async function inspectApifyPolicies({token,fetchImpl=fetch,now=Date.now,deadline=now()+15000,policyJson=process.env.OFFER_BHS_ACTOR_LIMITS_JSON}={}){
 const explicit=explicitActorPolicies(policyJson);
 if(!token)return {configured:false,taskPolicies:0,complete:false};
 let offset=0;const tasks=[];
 while(offset<1000){
  const remaining=deadline-now();if(remaining<=0)return {configured:true,authenticated:true,taskPolicies:0,complete:false,tasks:[]};
  const r=await fetchImpl('https://api.apify.com/v2/actor-tasks?limit=100&offset='+offset,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(Math.min(15000,remaining)),redirect:'error'});
  if(!r.ok)return {configured:true,authenticated:false,taskPolicies:0,complete:false};
  const data=(await r.json()).data;if(!Array.isArray(data?.items))throw Error('Invalid task metadata.');
  tasks.push(...data.items);offset+=data.items.length;
  if(offset>=data.total||data.items.length<100)break;
 }
 // Task lists omit options. Verify the exact saved Task before interpreting
 // an omitted cap as a missing policy; never read inputs or start an Actor.
 const known=new Set(Object.values(actorIds)),relevant=tasks.filter(t=>known.has(t.actId)&&/^[a-zA-Z0-9]{10,30}$/.test(t.id)),resolved=[];
 let complete=offset<1000&&relevant.length<=40;
 for(let start=0;start<Math.min(relevant.length,40);start+=4){
  const batch=await Promise.allSettled(relevant.slice(start,Math.min(start+4,40)).map(async task=>{
   if(task.options)return {id:task.id,actId:task.actId,options:task.options};
   const remaining=deadline-now();if(remaining<=0)throw Error('Task policy deadline');
   const r=await fetchImpl('https://api.apify.com/v2/actor-tasks/'+task.id,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(Math.min(5000,remaining)),redirect:'error'});
   if(!r.ok)throw Error('Task policy unavailable');const detail=(await r.json()).data;
   if(detail?.id!==task.id||detail.actId!==task.actId)throw Error('Task policy identity mismatch');
   return {id:detail.id,actId:detail.actId,options:detail.options};
  }));
  for(const r of batch)if(r.status==='fulfilled')resolved.push(r.value);else complete=false;
 }
 const policies=[...resolved,...explicit,...defaultActorPolicies()];
 return {configured:true,authenticated:true,savedTaskCount:tasks.length,explicitPolicyCount:explicit.length,defaultPolicyCount:approvedActors.length,defaultMaxTotalChargeUsd:defaultActorMaxUsd,taskPolicies:policies.filter(t=>Number.isFinite(t.options?.maxTotalChargeUsd)&&t.options.maxTotalChargeUsd>0&&t.options.maxTotalChargeUsd<=.4).length,complete,tasks:policies};
}
