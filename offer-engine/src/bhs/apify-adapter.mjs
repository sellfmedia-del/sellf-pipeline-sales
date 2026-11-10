import {BudgetError,hash} from '../budget/ledger.mjs';
import {actorChargeLimit,eventOnlyPricing,inspectApifyPolicies,matchedActorTasks} from './apify-policy.mjs';
import {actorIds,actorInput} from './apify-inputs.mjs';
import {researchUrl,researchHost} from './research-url.mjs';
import {evidenceExcerpts} from './evidence.mjs';

const terminal=new Set(['SUCCEEDED','FAILED','TIMED-OUT','ABORTED']);
const identifier=s=>typeof s==='string'&&/^[a-zA-Z0-9]{10,30}$/.test(s);
const scalar=v=>typeof v==='string'?v.slice(0,1800):typeof v==='number'&&Number.isFinite(v)?v:typeof v==='boolean'?v:undefined;
const pick=(r,keys)=>Object.fromEntries(keys.flatMap(k=>scalar(r?.[k])===undefined?[]:[[k,scalar(r[k])]]));
const sameUrl=(a,b)=>researchUrl(a)?.replace(/\/$/,'')===researchUrl(b)?.replace(/\/$/,'');
function recordsForEvidence(actor,rows,target,context){
 const result=[];
 for(const r of rows){
  if(!r||typeof r!=='object'||r.error)continue;
  let data,url=researchUrl(r.url||r.linkedinUrl||r.link||r.webVideoUrl);
  if(actor==='apify/instagram-profile-scraper'){
   const expected=new URL(target.url).pathname.split('/').filter(Boolean)[0];
   if(String(r.username).toLowerCase()!==expected.toLowerCase()||!target.official&&researchHost(r.externalUrl)!==researchHost(context.brief.website))continue;
   data=pick(r,['username','fullName','biography','followersCount','postsCount','isBusinessAccount','verified']);url=target.url;
  }else if(actor==='apify/instagram-scraper'){
   const expected=new URL(target.url).pathname.split('/').filter(Boolean)[0];
   if(String(r.ownerUsername).toLowerCase()!==expected.toLowerCase()||!target.official||!url||researchHost(url)!=='instagram.com')continue;
   data=pick(r,['caption','timestamp','likesCount','commentsCount','videoViewCount','type']);
  }else if(actor==='harvestapi/linkedin-company-search'){
   if(researchHost(r.website)!==researchHost(context.brief.website)||!sameUrl(r.linkedinUrl,target.url))continue;
   data={...pick(r,['name','description','industry','employeeCount','followerCount','website','foundedOn']),employeeCountRange:JSON.stringify(r.employeeCountRange||null)};url=target.url;
  }else if(actor==='harvestapi/linkedin-post-search'){
   if(!sameUrl(r.author?.linkedinUrl||r.author?.url,target.url)||!url||researchHost(url)!=='linkedin.com')continue;
   data={...pick(r,['content']),publishedAt:scalar(r.postedAt?.date)||null};
  }else if(actor==='curious_coder/linkedin-jobs-scraper'){
   if(researchHost(r.companyWebsite)!==researchHost(context.brief.website)||!url||researchHost(url)!=='linkedin.com')continue;
   data=pick(r,['companyName','title','descriptionText','location','postedAt','employmentType','companyWebsite']);
  }else if(actor==='logiover/website-seo-audit-crawler'){
   if(researchHost(url)!==researchHost(context.brief.website))continue;
   data={...pick(r,['title','metaDescription','canonical','metaRobots','statusCode','h1Count','imagesCount','imagesMissingAlt','isIndexable','crawledAt']),scope:'Static HTML SEO sample; not traffic, speed or runtime performance.'};
  }else if(actor==='apify/website-content-crawler'){
   if(researchHost(url)!==researchHost(context.brief.website))continue;
   data=pick(r,['text','markdown']);
  }else if(actor==='compass/crawler-google-places'){
   if(researchHost(r.website)!==researchHost(context.brief.website)||context.geo&&r.countryCode!==context.geo.countryCode)continue;
   data={...pick(r,['title','totalScore','reviewsCount','city','countryCode','permanentlyClosed','temporarilyClosed','scrapedAt']),reviews:(r.reviews||[]).slice(0,5).map(v=>pick(v,['text','stars','publishedAtDate','responseFromOwnerText']))};url=researchUrl(r.url)||target.url;
  }else if(actor==='clockworks/tiktok-scraper'){
   const name=new URL(target.url).pathname.replace(/^\/@/,'').replace(/\/$/,'');
   if(String(r.authorMeta?.name).toLowerCase()!==name.toLowerCase()||!target.official||!url||researchHost(url)!=='tiktok.com')continue;
   data={...pick(r,['text','createTimeISO','diggCount','commentCount','playCount','shareCount']),followersCount:r.authorMeta.fans};
  }else if(actor==='fatihtahta/trendyol-scraper'){
   if(!url||!sameUrl(url,target.url)||String(r.brand?.name).toLocaleLowerCase('tr')!==context.brief.brandName.toLocaleLowerCase('tr'))continue;
   data={...pick(r,['title']),brand:r.brand.name,currentPrice:r.pricing?.current_price,averageRating:r.metrics?.rating?.average_rating,reviewCount:r.metrics?.rating?.comment_count,scrapedAt:r.source_context?.scraped_time};
  }else if(actor==='junglee/free-amazon-product-scraper'){
   const asin=new URL(target.url).pathname.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})/i)?.[1];
   if(!asin||r.asin!==asin||String(r.brand).toLowerCase()!==context.brief.brandName.toLowerCase()||context.geo&&r.loadedCountryCode!==context.geo.countryCode)continue;
   data=pick(r,['title','brand','price','stars','reviewsCount','loadedCountryCode','locationText']);url=target.url;
  }else if(actor==='jmlp/meta-ad-library-scraper'){
   if(!target.official||!r.ad_archive_id||!Array.isArray(r.targeted_or_reached_countries)||!r.targeted_or_reached_countries.includes(context.geo?.countryCode))continue;
   data={...pick(r,['ad_archive_id','page_id','page_name','is_active','start_date','end_date']),scope:'Observed ad activity only; no sales, profitability or market share measurement.'};url='https://www.facebook.com/ads/library/?id='+encodeURIComponent(r.ad_archive_id);
  }else if(actor==='damilo/google-shopping-apify'){
   // Search listings are discovery, not proof of company identity or market share.
   continue;
  }
  const labels={followersCount:'followers',followerCount:'followers',employeeCount:'employees',reviewsCount:'reviews',reviewCount:'reviews',postsCount:'posts'};
  if(data&&url&&Object.keys(data).length)result.push({url,text:'Apify structured public-source extraction. '+Object.entries(data).map(([k,v])=>(labels[k]||k)+': '+(typeof v==='object'?JSON.stringify(v):v)).join('\n').slice(0,9000)});
 }
 return result;
}
export function createApifyAdapter({ledger,token=process.env.APIFY_API_TOKEN,fetchImpl=fetch,now=Date.now,getTaskPolicies,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 let policies;const metadata=new Map();
 async function json(path,{body,maxBytes=1000000,deadline=Infinity}={}){
  const remaining=Math.min(12000,deadline-now());if(remaining<=0)throw new BudgetError('actor_time_limit','Apify aşamasının süre sınırına ulaşıldı.');
  const r=await fetchImpl('https://api.apify.com/v2/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(remaining),redirect:'error'});
  if(!r.ok)throw new BudgetError('actor_api_unavailable','Apify isteği tamamlanamadı.');
  if(Number(r.headers.get('content-length'))>maxBytes){await r.body?.cancel();throw new BudgetError('actor_output_limit','Apify yanıtı kayıt sınırını aşıyor.');}
  const reader=r.body.getReader(),chunks=[];let bytes=0;
  try{for(;;){const v=await reader.read();if(v.done)break;bytes+=v.value.byteLength;if(bytes>maxBytes)throw new BudgetError('actor_output_limit','Apify yanıtı kayıt sınırını aşıyor.');chunks.push(v.value);}}finally{await reader.cancel();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }
 async function tasks(){
  if(!token)return [];
  if(!policies)policies=(async()=>{
   const deadline=now()+15000,result=getTaskPolicies?await getTaskPolicies():await inspectApifyPolicies({token,fetchImpl,now,deadline});
   if(!Array.isArray(result)&&!result.complete)return [];
   const rows=Array.isArray(result)?result:result.tasks||[],known=new Set(Object.values(actorIds)),selected=rows.filter(t=>known.has(t.actId));
   if(selected.length>40)return [];
   return (await Promise.all(selected.map(async t=>t.options?t:identifier(t.id)?(await json('actor-tasks/'+t.id,{deadline})).data:null))).filter(Boolean);
  })().catch(()=>[]);
  return policies;
 }
 const infoFor=id=>{if(!metadata.has(id))metadata.set(id,json('acts/'+id).then(r=>r.data));return metadata.get(id);};
 const pricingFor=info=>(info.pricingInfos||[]).filter(p=>Date.parse(p.startedAt)<=now()).sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt))[0];
 return {async availableActors(){
   const saved=await tasks(),names=Object.keys(actorIds).filter(a=>matchedActorTasks(actorIds[a],saved).length);
   const checks=await Promise.allSettled(names.map(async name=>{const p=pricingFor(await infoFor(actorIds[name]));const cap=Math.min(.2,matchedActorTasks(actorIds[name],saved)[0].options.maxTotalChargeUsd);return eventOnlyPricing(p)&&(!Number.isFinite(p.minimalMaxTotalChargeUsd)||p.minimalMaxTotalChargeUsd<=cap)?name:null;}));
   return checks.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value);
  },
  async enrich(request,context){
   if(!token)return {actor:request.actor,status:'not_configured'};
   const deadline=now()+75000;
   const target=actorInput(request,context),actorId=actorIds[request.actor];
   const step='apify:v8:start:'+hash({actorId,input:target.input,maxItems:target.maxItems});
   const existing=await ledger.get(step);
   if(existing&&existing.state!=='complete')throw new BudgetError(existing.state==='reserved'?'budget_pending':'budget_uncertain','Önceki Apify başlatma kaydı korunuyor; yeni çalışma açılmadı.');
   const task=matchedActorTasks(actorId,await tasks())[0];
   if(!task&&!existing)return {actor:request.actor,status:'not_configured',reason:'actor_limit_unverified'};
   const start=existing?.value||await (async()=>{
    const info=await infoFor(actorId),pricing=pricingFor(info);
    const datasetAllowanceKurus=10;
    const status=await ledger.status();
    // Meet a verified minimum only inside the saved individual cap and total account.
    const requestedUsd=Math.min(.4,Math.max(.04,Number.isFinite(pricing?.minimalMaxTotalChargeUsd)?pricing.minimalMaxTotalChargeUsd:0));
    const limit=actorChargeLimit({actor:request.actor,actorId,task,requestedUsd,remainingKurus:status.capKurus-status.chargedKurus-datasetAllowanceKurus,followingKurus:1400,pricing});
    const query=new URLSearchParams({maxTotalChargeUsd:String(limit.maxTotalChargeUsd),maxItems:String(target.maxItems),timeout:'60',waitForFinish:'0'});
    const identity={actorId,input:target.input,capUsd:limit.maxTotalChargeUsd,maxItems:target.maxItems,timeout:60};
    return ledger.once(step,identity,limit.reservedKurus,async()=>{
     const run=(await json('acts/'+actorId+'/runs?'+query,{body:target.input,deadline})).data;
     if(!identifier(run?.id)||!Number.isFinite(run.options?.maxTotalChargeUsd)||run.options.maxTotalChargeUsd>limit.maxTotalChargeUsd){if(identifier(run?.id))await json('actor-runs/'+run.id+'/abort',{body:{}}).catch(()=>{});throw new BudgetError('actor_limit_unverified','Apify çalışma sınırı doğrulanamadı; durdurma istendi.');}
     return {runId:run.id,actorId,capUsd:run.options.maxTotalChargeUsd,reservedKurus:limit.reservedKurus,accounting:'capped_run_commitment',startedAt:new Date(now()).toISOString()};
    });
   })();
   // .0004 USD/1000 reads + .20 USD/GB external transfer, reviewed 2026-11-10.
   // One <=1 MB, <=10-item read is <.00021 USD; ten kurus adds ample headroom.
   const datasetAllowanceKurus=10;
   const stop=async()=>{await json('actor-runs/'+start.runId+'/abort',{body:{}}).catch(()=>{});return {actor:request.actor,status:'unavailable',runId:start.runId,reason:'actor_time_limit',reservedKurus:start.reservedKurus};};
   let run;for(let poll=0;poll<16;poll++){
    if(now()>=deadline)return stop();
    try{run=(await json('actor-runs/'+start.runId,{deadline})).data;}catch(error){if(now()>=deadline||error.name==='TimeoutError'||error.code==='actor_time_limit')return stop();throw error;}
    if(terminal.has(run?.status))break;
    if(poll===15)return stop();
    await delay(Math.min(4000,Math.max(0,deadline-now())));
   }
   if(run.status!=='SUCCEEDED'||!identifier(run.defaultDatasetId))return {actor:request.actor,status:'unavailable',runId:start.runId,reason:'actor_'+String(run.status).toLowerCase(),reservedKurus:start.reservedKurus};
   if(Number.isFinite(run.usageTotalUsd)&&run.usageTotalUsd>start.capUsd+1e-8)throw new BudgetError('actor_accounting','Apify tüketimi doğrulanmış çalışma sınırıyla eşleşmiyor.');
   const output=await ledger.once('apify:v8:dataset:'+start.runId,{runId:start.runId,maxItems:target.maxItems,maxBytes:1000000},datasetAllowanceKurus,async()=>{
    const rows=await json('datasets/'+run.defaultDatasetId+'/items?clean=true&limit='+target.maxItems,{deadline});
    if(!Array.isArray(rows)||rows.length>target.maxItems)throw new BudgetError('actor_output_limit','Apify kayıt sayısı sınırı aşıyor.');
    const discoveryUrls=request.actor==='damilo/google-shopping-apify'?rows.filter(r=>String(r.title).toLocaleLowerCase('tr').includes(context.brief.brandName.toLocaleLowerCase('tr'))).map(r=>researchUrl(r.link)).filter(Boolean).slice(0,2):[];
    return {runId:start.runId,actor:request.actor,pages:recordsForEvidence(request.actor,rows,target,context),discoveryUrls,retrievedAt:new Date(now()).toISOString(),datasetDigest:hash(rows),accounting:'storage_read_allowance',reservedKurus:datasetAllowanceKurus};
   });
   return {...output,status:'complete',runReservedKurus:start.reservedKurus};
  },
  mergeEvidence(packet,results){
   const out=structuredClone(packet);
   for(const r of results.filter(r=>r.status==='complete'))for(const page of r.pages||[]){
    const excerpts=evidenceExcerpts(page.text);if(!excerpts.length||out.sources.length>=24)continue;
    const source={id:'ev'+(Math.max(0,...out.sources.map(s=>Number(s.id.slice(2))))+1),url:page.url,finalUrl:page.url,title:r.actor+' public-source sample',method:'extracted',excerpts,contentHash:hash(page.text),retrievedAt:r.retrievedAt,scope:'Apify structured sample; not a full page, market census or performance test.',provenance:{actor:r.actor,runId:r.runId,datasetDigest:r.datasetDigest}};
    if(!out.sources.some(s=>s.url===source.url&&s.contentHash===source.contentHash))out.sources.push(source);
   }return out;
  }
 };
}
