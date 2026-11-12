import {BudgetError,hash,tariff} from '../budget/ledger.mjs';
import {gzipSync} from 'node:zlib';
import {briefHash,dimensions} from './brief.mjs';
import {evidenceExcerpts,evidenceHash} from './evidence.mjs';
import {projectExpertReport} from './expert-report.mjs';
import {methodologyAreas} from './methodology-areas.mjs';
import {actorInput,observedActorTargets} from './apify-inputs.mjs';
import {researchHost,researchUrl} from './research-url.mjs';
import {assertSchema} from './schema.mjs';
import {arr,finalSchema,obj,peerSchema,qualityAcceptance,sequentialContext,stageModelInput,str} from './sequential-contracts.mjs';
import {requireGroundedResearch} from './research-content.mjs';
import {quoteSupervised,reserveStageQuote} from './supervised-providers.mjs';
import {researchTariff} from './research-tariff.mjs';
import {managedActors,planManagedResearch} from './managed-research.mjs';
import {managedReportInput,synthesizeManagedReport} from './managed-report.mjs';
import {managedReviewPhases,researchCapKurus} from './managed-budget.mjs';
import {managedReviewUsesHaiku,planManagedEvidenceReview,reviewManagedEvidenceBatch} from './managed-evidence-review.mjs';

export const collectionBudgetKurus=2500;
const finalCalls={peers:{input:8000,output:600},report:{input:33500,output:4900},repair:{input:10000,output:1550}};
const quoteFinalCalls=now=>Object.fromEntries(Object.entries(finalCalls).map(([name,call])=>[name,reserveStageQuote(quoteSupervised('manager',call.input,call.output,now,researchTariff))]));
export function collectionBrandCeiling(capKurus,infrastructureKurus,now){
 return capKurus-infrastructureKurus-Object.values(quoteFinalCalls(now)).reduce((sum,quote)=>sum+quote,0);
}
export function planCollectionFunding({chargedKurus,capKurus},infrastructureKurus=0,now=Date.now()){
 const startKurus=Math.max(tariff.infraKurus,chargedKurus-infrastructureKurus);
 const finalQuotes=quoteFinalCalls(now);
 const finalReserveKurus=Object.values(finalQuotes).reduce((sum,quote)=>sum+quote,0);
 const budgetAfterFinal=capKurus-finalReserveKurus-infrastructureKurus;
 if(startKurus>budgetAfterFinal)throw new BudgetError('budget_limit','Marka ve altyapı sonrasında nihai BHS için gereken bütçe ayrılamadı.');
 const researchLimitKurus=Math.min(collectionBudgetKurus,budgetAfterFinal-startKurus);
 return {startKurus,capKurus:startKurus+researchLimitKurus,researchLimitKurus,finalReserveKurus,finalQuotes,finalInfrastructureKurus:infrastructureKurus};
}
const searchStages=['sector_sources','sector_draft','sector_review'];
const readStages=['sector_correction_sources','sector_correction_draft','sector','sector_validation','competition_plan','competition_sources'];
const scrapeStages=['competition_draft','competition_review','competition_correction_sources'];
const inventoryStages=['competition_correction_draft','competition','swot_sources','swot_draft','swot_review','swot_correction_sources','swot_correction_draft','swot'];
const quadrants=['strength','weakness','opportunity','threat'];
const areasByKey=new Map(methodologyAreas.map(area=>[area.key,area]));
const markets=[[/Türkiye|Turkey/iu,'Türkiye','TR','tr'],[/United Kingdom|Birleşik Krallık|\bUK\b/iu,'United Kingdom','GB','en'],[/United States|Amerika Birleşik Devletleri|\bUSA\b/iu,'United States','US','en'],[/Germany|Almanya/iu,'Germany','DE','de'],[/France|Fransa/iu,'France','FR','fr']];
const schema=obj({
 observations:arr(obj({area:str(80),text:str(350),sourceIds:arr(str(80))})),
 organizations:arr(obj({name:str(120),sourceId:str(80)}))
});
const findingSchema=obj({a:arr({type:'string',enum:[...areasByKey.keys()]},4),o:str(220),p:arr(str(80)),k:{type:'string',enum:['observation','inference']},h:str(150),l:str(140),w:{type:'string',enum:['none',...quadrants]}});
const compactReportSchema=obj({
 findings:arr(findingSchema),
 peers:arr(peerSchema,5),
 questions:obj(Object.fromEntries(dimensions.map(({id})=>[id,str(180)]))),
 benchmarks:finalSchema.properties.benchmarks
});
const reservedReportSchema=obj({
 findings:arr(obj({...findingSchema.properties,o:str(160),p:arr(str(16),3),h:str(95),l:str(85)}),20),
 questions:compactReportSchema.properties.questions,
 benchmarks:arr(finalSchema.properties.benchmarks.items,6)
});
// The paid token envelope caps output size. The final report may retain
// additional valid rows and citations even when Claude exceeds its targets.
const reservedReportResponseSchema=obj({...reservedReportSchema.properties,findings:arr(findingSchema)});
const reservedRepairSchema=obj({findings:arr(reservedReportSchema.properties.findings.items,4)});
const peerVerdictSchema=obj({decisions:arr(obj({id:str(12),verdict:{type:'string',enum:['direct','benchmark','unconfirmed']},proof:str(16),reason:str(95)}),6)});
const peerDecisionResponse=obj({...peerVerdictSchema.properties.decisions.items.properties,reason:str(200)});
const peerVerdictResponseSchema=obj({decisions:arr(peerDecisionResponse,6)});
const peerSearchSchema=obj({product:str(100),candidates:arr(str(100),6)});
const collectionErrors=new Set(['budget_limit','budget_uncertain','budget_pending','provider_rejected','provider_error','quota','provider_timeout','fx_unavailable','incomplete','model_output_invalid','invalid_report','actor_source_unverified','actor_locale_unverified','actor_api_unavailable','actor_output_limit','actor_time_limit','actor_pricing_unverified','actor_limit_unverified']);

async function collectAttempt(run){
 try{return await run();}
 catch(error){
  if(error.name==='TimeoutError'||error instanceof TypeError&&error.message==='fetch failed')return {unavailable:true,reason:'provider_timeout'};
  if(!collectionErrors.has(error.code))throw error;
  return {unavailable:true,reason:error.code};
 }
}

const shard=(rows,index,count)=>rows.filter((_,i)=>i%count===index);
const unique=items=>[...new Set(items)];
const nameKey=text=>text.toLocaleLowerCase('tr').normalize('NFKD').replace(/\p{M}/gu,'').replace(/ı/g,'i').replace(/[^a-z0-9]/g,'');
const peerGroupKey=name=>nameKey(name.replace(/^(?:atelier|maison)\s+/iu,''));
function publisherMatches(name,url,expanded=false){
 const brand=nameKey(name),domain=researchHost(url)?.split('.')[0];
 return brand.length>2&&[brand,brand+'store',brand+'shop','maison'+brand,...(expanded?[brand+'food',brand+'foods',brand+'gida',brand+'snacks',brand+'organic',brand+'organik',brand.repeat(2),brand.repeat(3)]:[])].includes(domain);
}
const sourcesFrom=async(previous,stages,key)=>(await Promise.all(stages.map(previous))).flatMap(s=>s[key]||[]);
const canonicalSources=rows=>[...new Map(rows.map(s=>[s.finalUrl+' '+s.contentHash,s])).values()].map((s,i)=>({...s,id:'ev'+(i+1)}));

function providerSource({url,title,text,method,asOf,scope,provenance}){
 if(!url||typeof text!=='string'||text.trim().length<24)return null;
 return {url,finalUrl:url,title:title||url,method,retrievedAt:asOf,scope,provenance,contentHash:hash(text),excerpts:evidenceExcerpts(text,{maxChunks:40})};
}

export async function collectionCorpus(previous){
 const brand=await previous('brand');
 const [searches,pages,scrapes]=await Promise.all([
  sourcesFrom(previous,[...searchStages,scrapeStages[0]],'searches'),
  sourcesFrom(previous,[...readStages,scrapeStages[0]],'pages'),
  sourcesFrom(previous,scrapeStages,'scrapes')
 ]);
 const {peerHints=[]}=await previous(scrapeStages[0]);
 const asOf=brand.packet.asOf;
 const searchSources=searches.flatMap(s=>(s.results||[]).map(r=>providerSource({url:researchUrl(r.url),title:r.title,text:r.content,method:'search-snippet',asOf,scope:'Tavily arama alıntısı'}))).filter(Boolean);
 const actorSources=scrapes.flatMap(s=>(s.pages||[]).map(r=>providerSource({url:researchUrl(r.url),title:s.actor,text:r.text,method:'extracted',asOf,scope:'Apify structured sample; only the captured item.',provenance:{actor:s.actor,runId:s.runId}}))).filter(Boolean);
 return {searches,scrapes,packet:{...brand.packet,entities:[...brand.packet.entities,...peerHints],sources:canonicalSources([...brand.packet.sources,...pages,...actorSources,...searchSources])}};
}

function queryFor(brief,topic,market){
 const name=brief.brandName.replace(/["\n\r]/g,' ').trim();
 return ('"'+name+'" '+topic+' '+(market?.[1]||'')).trim().slice(0,500);
}

async function actorRequest(context,providers,index,market,managedPlan){
 const available=await providers.availableActors?.()||[];
 const known=observedActorTargets(context);
 const order=managedPlan?[...new Set(managedPlan.actors.map(a=>a.id))]:managedActors;
 const targets=[];
 const geo=market?{countryCode:market[2],language:market[3]}:null;
 const unavailable=managedPlan?shard(order.filter(id=>!available.includes(id)),index,scrapeStages.length).map(()=>({unavailable:true,reason:'actor_api_unavailable'})):[];
 for(const actor of order.filter(name=>available.includes(name))){
  const target=[...known.urls].find(url=>{
   try{actorInput({actor,url,...geo},{...context,geo},known);return true;}
   catch(error){if(['actor_source_unverified','actor_locale_unverified'].includes(error.code))return false;throw error;}
  });
  if(target)targets.push({actor,url:target,purpose:managedPlan?.actors.find(a=>a.id===actor)?.purpose||'Marka ve hedef pazar için kamuya açık kaynak.',...geo});
 }
 const scrapes=[];
 for(const request of shard(targets,index,scrapeStages.length))scrapes.push(await collectAttempt(()=>providers.enrich(request,{...context,geo})));
 return [...scrapes,...unavailable];
}

export async function readResearchPages(brief,plan,targets,providers,collect){
 if(!targets.length)return {sources:[],unavailable:[]};
 return collect(brief,plan,{extraSources:targets,prioritySources:targets,explicitSourcesOnly:true,allowEmpty:true,sourceLimit:targets.length,archivePages:async pages=>{
  for(const page of pages){
   const input={url:page.finalUrl,method:page.method,contentHash:hash(page.text)};
   await providers.checkpoint('collection-raw-page',input,async()=>({encoding:'gzip-base64',data:gzipSync(JSON.stringify(page)).toString('base64')}));
  }
 }});
}

export async function comparisonResearch(brief,brand,market,pool,providers,collect,repair,managedPlan){
 const plan=managedPlan?{data:{product:managedPlan.comparableProduct,candidates:managedPlan.peerNames}}:await collectAttempt(()=>pool.worker('v8-collection-peer-search',{
  instruction:'Onaylı marka ürünlerinden markanın tanındığı tek bir somut ürün veya hizmet kategorisini product olarak seç. Sertifika, değer önermesi veya geniş sektör adı kullanma. Hedef pazarda aynı ürünü veya hizmeti sunan, birbirinden bağımsız en fazla altı marka adını candidates içinde ver. Her aday seçilen tek kategoride satıcıya ikame olabilmeli. Bir grubun alt markaları, perakendeci, ajans ve pazaryeri aday değildir. Yalnızca araştırma adayları üret; rakip kararı verme, URL yazma.',
  brand:brief.brandName,market:market?.[1]||'',identity:brand.facts,
  ...(repair?{previouslyVerified:repair.names,existingProduct:repair.product,additionalTask:'Aynı ürün veya doğrudan ikame ürün için belirtilenlerden farklı üreticileri bul. Mevcut ürün ifadesi genişse kaynaklı marka ürünlerinden tek bir somut format seç ve product alanında yaz. Hedef pazarda ürün sayfası bulunan bağımsız markaları öncele. Aynı kullanıma uygun benzer ürünü olan markalar, sertifika veya içerikleri farklı olsa da araştırma adayı olabilir.'}:{})
 },peerSearchSchema,{maxOutputTokens:512}));
 const searches=[],hints=[],seen=new Set([brief.brandName,...(repair?.names||[])].map(peerGroupKey)),product=plan.data?.product?.trim()||repair?.product;
 const words=product?.toLocaleLowerCase('tr').match(/[\p{L}]{3,}/gu)||[];
 const addHint=(name,url)=>{
  const host=researchHost(url);
  if(!host||host===researchHost(brief.website)||hints.some(peer=>researchHost(peer.website)===host))return;
  hints.push({id:'candidate_'+hash(researchHost(url)).slice(0,20),role:'competitor',name,website:url,scope:'Ürün sayfası araştırma adayı.',audienceReason:'Kitle örtüşmesi denetlenecek.',scaleReason:'Ölçek doğrulanmadı.',geographyReason:'Hedef pazar denetlenecek.'});
 };
 if(repair&&product){
  const format=product.replace(/\b(?:organik|organic|vegan)\b/giu,'').replace(/\s+/g,' ').trim()||product;
  const query=[format,managedPlan?.market||market?.[1],market?.[3]==='tr'?'markalar ürün çeşitleri satın al':'brands product range shop'].filter(Boolean).join(' ');
  const found=await collectAttempt(()=>pool.search(query,{depth:'basic',maxResults:12,retainRaw:true}));
  searches.push(found);
  for(const result of found.results||[]){
   const url=researchUrl(result.url);
   const name=(result.title?.match(/[\p{L}\p{N}]{3,}/gu)||[]).find(word=>publisherMatches(word,url,true));
   if(!name||seen.has(peerGroupKey(name))||!words.some(word=>nameKey((result.title||'')+' '+(result.content||'')).includes(nameKey(word))))continue;
   addHint(name,url);
  }
 }
 for(const name of product?(plan.data?.candidates||[]):[]){
  const group=peerGroupKey(name);
  if(!group||seen.has(group))continue;
  seen.add(group);
  const query=[name,product,managedPlan?.market||market?.[1],'resmî ürün sayfası'].filter(Boolean).join(' ');
  const search=await collectAttempt(()=>pool.search(query,{depth:'basic',maxResults:12,retainRaw:true}));
  searches.push(search);
  const owned=results=>(results||[]).map(r=>researchUrl(r.url)).filter(url=>url&&publisherMatches(name,url,true));
  let urls=owned(search.results);
  if(repair&&!urls.length&&!search.unavailable){
   const publisherSearch=await collectAttempt(()=>pool.search('"'+name.replace(/["\n\r]/g,' ')+'" marka resmi web sitesi online mağaza',{depth:'basic',maxResults:12,retainRaw:true}));
   searches.push(publisherSearch);
   urls=owned(publisherSearch.results);
  }
  const url=urls.find(url=>words.some(word=>new URL(url).pathname.split(/[^\p{L}]+/u).some(part=>nameKey(part)===nameKey(word))))||urls.find(url=>/ürün|urun|product|catalog|kategori|category|collections/i.test(new URL(url).pathname))||urls[0];
  addHint(name,url);
 }
 const targets=unique([...hints.map(peer=>peer.website),...searches.flatMap(s=>(s.results||[]).map(r=>researchUrl(r.url))).filter(Boolean)]);
 const packet=await readResearchPages(brief,brand.plan,targets,providers,collect);
 return {searches,pages:packet.sources,peerHints:hints,peerProduct:product||'',expandedPeerPublishers:true,...(managedPlan?{unavailable:packet.unavailable}:{})};
}

// Research receipts remain intact. This packet is a compact index for Claude,
// with each entry pointing back to a read paragraph, not a replacement archive.
function proofIndex(context,inventory){
 const entries=new Map();
 for(const row of inventory.flatMap(i=>i.observations||[])){
  const ids=row.sourceIds.filter(id=>context.known.has(id));
  if(!ids.length)continue;
  const key=JSON.stringify([row.area,row.text.trim()]);
  const existing=entries.get(key);
  if(existing)for(const id of ids)existing[2].add(id);
  else entries.set(key,[row.area,row.text,new Set(ids)]);
 }
 return [...entries.values()].map(([area,text,ids])=>[area,text,[...ids]]);
}

function comparisonEntities(context,inventory){
 const entities=[...context.packet.entities];
 const hosts=new Set(entities.map(e=>researchHost(e.website)));
 for(const organization of inventory.flatMap(i=>i.organizations||[])){
  const source=context.known.get(organization.sourceId);
  const host=researchHost(source?.url);
  if(!host||hosts.has(host)||source.method==='search-snippet'||!organization.name.trim())continue;
  hosts.add(host);
  entities.push({id:'candidate_'+hash(host).slice(0,20),role:'competitor',name:organization.name,website:source.url,scope:'Kamuya açık kaynakta görülen aday.',audienceReason:'Karşılaştırma Claude denetiminde doğrulanacak.',scaleReason:'Ölçek bilinmiyor.',geographyReason:'Analiz pazarı doğrulanacak.'});
 }
 return entities;
}

export function peerCandidates(context,entities,brand,peerProduct,expandedPublishers=false,limit=6){
 const product=peerProduct||brand.facts.find(f=>f.topic==='products')?.statement||'';
 const brandName=context.input.brief.brandName.toLocaleLowerCase('tr');
 const brandHost=researchHost(context.input.brief.website);
 const preciseProduct=Boolean(peerProduct&&expandedPublishers);
 const terms=unique(product.toLocaleLowerCase('tr').match(preciseProduct?/[\p{L}]{3,}/gu:peerProduct?/[\p{L}]{4,}/gu:/[\p{L}]{5,}/gu)||[]).filter(word=>!brandName.includes(word));
 const format=preciseProduct?terms.at(-1):null;
 const containsFormat=text=>format&&(text.toLocaleLowerCase('tr').match(/[\p{L}]+/gu)||[]).some(word=>word===format||word===format+'i'||word===format+'lar'||word===format+'lari');
 const productPattern=/ürün|product|satın|shop|₺|kategori|category|fiyat|price|sepet|cart/i;
 const scored=new Map();
 for(const candidate of entities.filter(e=>e.role==='competitor'&&nameKey(e.name)!==nameKey(context.input.brief.brandName))){
  for(const source of context.input.sources){
   if(source.metadataOnly||source.method==='search-snippet'||researchHost(source.url)===brandHost||!publisherMatches(candidate.name,source.url,expandedPublishers))continue;
   const cards=source.sections.flatMap(section=>section.proofIds.map(id=>context.known.get(id))).filter(card=>card&&!card.metadataOnly&&!['html-signals','search-snippet'].includes(card.method)).map(card=>{
    const quote=card.quote.toLocaleLowerCase('tr');
    return {card,score:terms.reduce((n,term)=>n+Number(quote.includes(term)),0)*2+Number(productPattern.test(quote))+Number(Boolean(containsFormat(quote)))*4};
   }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score);
   if(!cards.length)continue;
   const key=peerProduct?peerGroupKey(candidate.name):nameKey(candidate.name),score=cards[0].score+Number(Boolean(containsFormat(new URL(source.url).pathname)))*6;
   if(scored.get(key)?.score>=score)continue;
   const entity={...candidate,website:source.url,scope:product,audienceReason:''};
   scored.set(key,{entity,score,cards:cards.slice(0,2).map(item=>item.card)});
  }
 }
 return [...scored.values()].sort((a,b)=>b.score-a.score).slice(0,limit);
}

function reservedOptions(call,reserveForFollowingKurus=0){
 return {maxOutputTokens:call.output,minimumOutputTokens:call.output,maxInputUpperTokens:call.input,reserveForFollowingKurus,compactReview:true,lowEffort:true};
}

function normalizeFindingRows(data,findingsSchema){
 if(!Array.isArray(data?.findings))return data;
 const findings=data.findings.filter(row=>{
  try{assertSchema(row,findingsSchema.items);return true;}
  catch{return false;}
 });
 return {...data,findings:findingsSchema.maxItems===undefined?findings:findings.slice(0,findingsSchema.maxItems)};
}

async function reviewCollectedPeers(brief,providers,funding,candidates,alias,repair=false){
 if(!candidates.length)return [];
 const peers=candidates.map(({entity,cards},i)=>({id:'r'+(i+1),entity,cards}));
 const result=await collectAttempt(()=>providers.manager(repair?'v8-collection-peer-evidence-repair':'v8-collection-reserved-peers',{
  instruction:'Marka ile aynı hedef pazarda aynı ürün veya ihtiyaca hitap eden doğrudan rakipleri belirle. Satıcı, ajans, aynı grubun tekrarı veya benzer olmayan ürün doğrudan rakip sayılmaz. Her aday için sadece o adayın altındaki okunan birincil kaynak kimliğini kullan. Açık ürün ve pazar örtüşmesi varsa direct, yalnız kıyas örneğiyse benchmark, kanıt yetersizse unconfirmed. En fazla dört gerçek doğrudan rakip seç. Her kararın gerekçesini tek kısa cümleyle yaz.'+(repair?' Aynı ürün formatı ve kullanım için somut ikame varsa sertifika veya formül farkını gerekçede belirt. Sertifika eşitliği varsayma ve yalnız geniş kategori ortaklığını doğrudan rakip sayma.':''),
  brand:brief.brandName,market:brief.goals,product:candidates[0].entity.scope,
  candidates:peers.map(({id,entity,cards})=>[id,entity.name,entity.website,cards.map(c=>[alias(c.id),c.quote])])
 },peerVerdictSchema,{...reservedOptions(finalCalls.peers,repair?0:funding.finalQuotes.report+funding.finalQuotes.repair),responseSchema:peerVerdictResponseSchema,normalizeData:data=>{
  if(!Array.isArray(data?.decisions))return data;
  const decisions=data.decisions.filter(row=>{try{assertSchema(row,peerDecisionResponse);return true;}catch{return false;}});
  return {...data,decisions:decisions.slice(0,6)};
 }}));
 const decisions=[];
 for(const row of result.data?.decisions||[]){
  const peer=peers.find(p=>p.id===row.id);
  const proofs=unique(row.proof.split(/[,\s]+/).filter(Boolean));
  const cards=proofs.map(id=>peer?.cards.find(card=>alias(card.id)===id));
  if(!peer||!cards.length||cards.some(card=>!card)||decisions.some(d=>d.entityId===peer.entity.id))continue;
  decisions.push({entityId:peer.entity.id,relationship:row.verdict,sourceIds:cards.map(card=>card.id),reason:row.reason});
 }
 return decisions;
}

async function fundedReport(providers,funding,base,observations,quotes,sourceSamples){
 // Shorten only the model request on an unbilled input-size rejection. Raw
 // evidence, observations and all source receipts stay in the archive.
 const options={...reservedOptions(finalCalls.report,funding.finalQuotes.repair),responseSchema:reservedReportResponseSchema,normalizeData:data=>normalizeFindingRows(data,reservedReportResponseSchema.properties.findings)};
 const variants=[{samples:45,keep:observations.length},{samples:20,keep:observations.length},{samples:10,keep:Math.min(observations.length,95)},{samples:0,keep:Math.min(observations.length,55)}];
 const requests=variants.map(variant=>{
  const index=observations.slice(0,variant.keep);
  const ids=new Set(index.flatMap(([, ,proofs])=>proofs));
  const originalQuotes=Object.fromEntries(Object.entries(quotes).filter(([id])=>ids.has(id)));
  return {...base,index,originalQuotes,unindexedSources:sourceSamples.slice(0,variant.samples)};
 });
 if(providers.readManagerResult){
  // A prior run can have already bought the report before its peer decisions
  // were recovered. Reuse that identical source report and attach the new
  // verified peers during projection, with no second full generation.
  const retained=base.peers.length?[...requests,...requests.map(request=>({...request,peers:[]}))]:requests;
  for(const request of retained){
   const receipt=await providers.readManagerResult('v8-collection-reserved-report',request,reservedReportSchema,options);
   if(receipt)return receipt;
  }
 }
 let lastError;
 for(const request of requests){
  try{return await providers.manager('v8-collection-reserved-report',request,reservedReportSchema,options);}
  catch(error){if(error.code!=='input_budget'||!error.budgetDiagnostic?.maxInputUpperTokens)throw error;lastError=error;}
 }
 throw lastError;
}

function balanceObservations(observations){
 const groups=new Map(dimensions.map(({id})=>[id,[]]));
 const rest=[];
 for(const row of observations)(groups.get(areasByKey.get(row[0])?.dimension)||rest).push(row);
 const buckets=[...groups.values()];
 return [...Array.from({length:Math.max(...buckets.map(rows=>rows.length))},(_,i)=>buckets.flatMap(rows=>rows[i]?[rows[i]]:[])).flat(),...rest];
}

export function expandCollectedReport(data){
 const findings=[],coverage=Object.fromEntries(methodologyAreas.map(({key})=>[key,{status:'unavailable',findingIds:[],note:'Bu konuya ait bilgi görüşmede doğrulanacak.'}]));
 const swot=Object.fromEntries(quadrants.map(key=>[key,[]]));
 for(const row of data.findings){
  const area=areasByKey.get(row.a[0]);
  if(!area||!row.p.length||!row.o.trim())continue;
  const id='collection_'+(findings.length+1),stance=['strength','opportunity'].includes(row.w)?'positive':['weakness','threat'].includes(row.w)?'risk':'neutral';
  findings.push({id,dimension:area.dimension,kind:row.k,stance,observation:row.o,sourceIds:row.p,commercialHypothesis:row.h,limitation:row.l,question:data.questions[area.dimension],priority:findings.length<4?'high':'medium'});
  for(const key of new Set(row.a)){
   const topic=coverage[key];
   if(topic.findingIds.length>=4)continue;
   topic.findingIds.push(id);
   topic.status=row.k==='observation'?'observed':topic.status==='unavailable'?'partial':topic.status;
  }
  if(swot[row.w]?.length<4)swot[row.w].push(id);
 }
 return {findings,coverage,swot,peers:data.peers,benchmarks:data.benchmarks,
  overviewIds:findings.slice(0,4).map(f=>f.id),opportunityId:swot.opportunity[0]||null,riskId:swot.threat[0]||null,
  dimensions:dimensions.map(({id})=>({id,score:null,bandReason:'Kamuya açık sinyaller üzerinden değerlendirildi.',findingIds:findings.filter(f=>f.dimension===id).slice(0,4).map(f=>f.id),comparisonFindingIds:[]}))};
}

function repairSources(context,entities,index,issues){
 const selected=new Set();
 if(issues.includes('direct_competitors_incomplete'))for(const entity of entities.filter(e=>e.role==='competitor')){
  const source=context.input.sources.filter(s=>researchHost(s.url)===researchHost(entity.website)&&s.method!=='search-snippet');
  const passages=source.flatMap(s=>s.sections).filter(section=>/ürün|product|satın|shop|₺|kategori|category|fiyat|price/i.test(section.text));
  for(const passage of passages.slice(0,2))selected.add(passage.proofIds[0]);
 }
 for(const c of context.cards.filter(card=>card.scope?.startsWith('Apify structured sample')).slice(0,8))selected.add(c.id);
 for(const [, ,ids] of index.filter(([area,text])=>/^(financial|funnel|competition)_/.test(area)&&/pazar|müşteri|tüketici|e-ticaret|market|consumer|online/i.test(text)).slice(0,8))selected.add(ids[0]);
 for(const [, ,ids] of index.filter(([area])=>/^(operations|digital)_/.test(area)).slice(0,6))selected.add(ids[0]);
 return [...selected].map(id=>context.known.get(id)).filter(Boolean);
}

function reservedRepairSources(context,index,issues,verifiedPeers){
 const sources=repairSources(context,context.input.entities,index,[]);
 if(!issues.includes('swot_threat_incomplete'))return sources;
 const peerEvidence=verifiedPeers.flatMap(peer=>peer.sourceIds.map(id=>context.known.get(id))).filter(Boolean);
 const riskEvidence=context.cards.filter(card=>!card.metadataOnly&&card.method!=='search-snippet'&&/ham\s?madde|tedarik riski|mevzuat|düzenleyici|ithalat bağımlılığı|fiyat baskısı|regulation|supply risk|price pressure/iu.test(card.quote));
 const riskByPublisher=[...new Map(riskEvidence.map(card=>[researchHost(card.url),card])).values()].slice(0,8);
 return [...new Set([...peerEvidence,...riskByPublisher,...sources])];
}

async function fundedRepair(providers,input,proof,alias){
 const normalizeData=data=>normalizeFindingRows(data,reservedRepairSchema.properties.findings);
 for(const limit of [18,9,4]){
  const chosen=proof.slice(0,limit);
  const sources=chosen.map(card=>[alias(card.id),researchHost(card.url),card.quote]);
  try{
   const result=await collectAttempt(()=>providers.manager('v8-collection-reserved-gaps',{...input,existing:input.existing.slice(0,limit),sources},reservedRepairSchema,{...reservedOptions(finalCalls.repair),normalizeData}));
   return {...result,proof:chosen};
  }catch(error){
   if(error.code!=='input_budget'||!error.budgetDiagnostic?.maxInputUpperTokens)throw error;
  }
 }
 return {unavailable:true,reason:'input_budget'};
}

function distinctPeerEntities(entities,peers){
 const groups=new Set(),duplicates=new Set();
 for(const peer of peers.filter(peer=>peer.relationship==='direct')){
  const entity=entities.find(entity=>entity.id===peer.entityId);
  if(!entity)continue;
  const group=peerGroupKey(entity.name);
  if(groups.has(group))duplicates.add(entity.id);
  else groups.add(group);
 }
 return entities.filter(entity=>!duplicates.has(entity.id));
}

async function repairPeerCoverage({brief,brand,providers,context,funding,product,names,collect,alias,researchSpend}){
 const {chargedKurus,capKurus}=await providers.costStatus();
 const searchCeiling=Math.min(capKurus-funding.finalQuotes.peers,chargedKurus+350,chargedKurus+collectionBudgetKurus-researchSpend);
 if(searchCeiling<=chargedKurus)return {decisions:[],entities:[]};
 const market=markets.find(([pattern])=>pattern.test(brand.review?.marketContext?.description||brief.goals));
 const collected=await comparisonResearch(brief,brand,market,providers.withCeiling(searchCeiling),providers,collect,{product,names});
 const entities=collected.peerHints;
 if(!entities.length||!collected.pages.length)return {decisions:[],entities:[]};
 const fresh=sequentialContext(brief,{packet:{...context.packet,entities,sources:canonicalSources(collected.pages)},searches:[],peerDiscoveryVersion:'product-v2'});
 const candidates=peerCandidates(fresh,entities,brand,collected.peerProduct||product,true);
 if(!candidates.length)return {decisions:[],entities:[]};
 for(const [id,card] of fresh.known)context.known.set(id,card);
 for(const [id,group] of fresh.proofGroups)context.proofGroups.set(id,group);
 context.cards=[...context.known.values()];
 context.input.sources.push(...fresh.input.sources);
 context.packet.sources=canonicalSources([...context.packet.sources,...fresh.packet.sources]);
 context.packet.citationCards=[...new Map([...context.packet.citationCards,...fresh.packet.citationCards].map(card=>[card.id,card])).values()];
 let decisions;
 try{decisions=await reviewCollectedPeers(brief,providers,funding,candidates,alias,true);}
 catch(error){if(error.code!=='input_budget')throw error;decisions=[];}
 return {decisions:decisions.filter(d=>d.relationship==='direct').slice(0,4-names.length),entities:candidates.map(candidate=>candidate.entity)};
}

async function managedCollectionInputs(brief,plan,previous){
 const [brand,{packet},inventory]=await Promise.all([previous('brand'),collectionCorpus(previous),sourcesFrom(previous,inventoryStages,'inventory')]);
 const context=sequentialContext(brief,{packet,searches:[],peerDiscoveryVersion:'product-v2'},{includeTechnicalSignals:true});
 context.collectionFirst=true;
 const discovered=comparisonEntities(context,inventory);
 const candidates=peerCandidates(context,discovered,brand,plan.comparableProduct,true,16);
 context.input.entities=[...discovered.filter(e=>e.role==='brand'),...candidates.map(c=>c.entity)];
 return {brief,brand,plan,context,inventory};
}

export async function runCollectionFirstStage({phase,brief,providers,previous,collect,finish}){
 const searchIndex=searchStages.indexOf(phase),readIndex=readStages.indexOf(phase),scrapeIndex=scrapeStages.indexOf(phase),inventoryIndex=inventoryStages.indexOf(phase);
 const first=phase===searchStages[0];
 const managed=first?providers.managedAudit:(await previous(searchStages[0])).managedPlan;
 const funding=first?await providers.checkpoint(managed?'managed-collection-funding':'collection-first-funding',brief,async()=>{
  const cost=await providers.costStatus();
  if(!managed)return planCollectionFunding(cost,providers.infrastructureOffsetKurus,providers.now?.());
  const startKurus=Math.min(cost.chargedKurus,researchCapKurus);
  return {startKurus,capKurus:researchCapKurus,researchLimitKurus:researchCapKurus-startKurus};
 }):(await previous(searchStages[0])).funding;
 const save=data=>finish({collectionFirst:true,...data});
 const scoped=amount=>providers.withCeiling(Math.min(funding.capKurus,funding.startKurus+amount));
 if(searchIndex>=0){
  const brand=await previous('brand');
  const market=markets.find(([pattern])=>pattern.test(brand.review?.marketContext?.description||brief.goals));
  const pool=managed?scoped(collectionBudgetKurus):scoped(900);
  const sector=first&&managed?await collectAttempt(()=>pool.search(
   [brand.facts.find(f=>f.topic==='products')?.statement||brief.brandName,brand.review?.marketContext?.description||brief.goals,'sektör pazar hacmi gelir kanalları rekabet'].join(' ').slice(0,500),
   {depth:'basic',maxResults:8,retainRaw:true})):null;
  const managedPlan=first&&managed?await planManagedResearch({brief,brand,sector,providers:pool}):managed||null;
  const topics=shard(managedPlan?.tasks||methodologyAreas,searchIndex,searchStages.length);
  const searches=sector?[sector]:[];
  for(let i=0;i<topics.length;i+=3){
   searches.push(...await Promise.all(topics.slice(i,i+3).map(({topic,query})=>collectAttempt(()=>pool.search(query||queryFor(brief,topic,market),{depth:'basic',maxResults:12,retainRaw:true})))));
  }
  return save({funding,searches,...(first&&managedPlan?{managedPlan}: {})});
 }
 if(readIndex>=0){
  const brand=await previous('brand'),searches=await sourcesFrom(previous,searchStages,'searches');
  const urls=unique(searches.flatMap(s=>(s.results||[]).map(r=>researchUrl(r.url))).filter(Boolean));
  const targets=shard(urls,readIndex,readStages.length);
  const packet=await readResearchPages(brief,brand.plan,targets,providers,collect);
  return save({pages:packet.sources,unavailable:packet.unavailable});
 }
 if(scrapeIndex>=0){
  const brand=await previous('brand');
  const market=markets.find(([pattern])=>pattern.test(managed?.market||brand.review?.marketContext?.description||brief.goals));
  const [searches,pages]=await Promise.all([sourcesFrom(previous,searchStages,'searches'),sourcesFrom(previous,readStages,'pages')]);
  const comparison=scrapeIndex===0?await comparisonResearch(brief,brand,market,scoped(managed?collectionBudgetKurus:1650),providers,collect,null,managed||null):{searches:[],pages:[]};
  // The Actor adapter holds the final 6 TRY of this research account for Gemini.
  const scrapes=await actorRequest({brief,searches:[...searches,...comparison.searches],packet:{...brand.packet,sources:[...brand.packet.sources,...pages,...comparison.pages]}},scoped(collectionBudgetKurus),scrapeIndex,market,managed||null);
  return save({...comparison,scrapes});
 }
 if(inventoryIndex>=0){
  const {packet}=await collectionCorpus(previous);
  const batch=shard(packet.sources,inventoryIndex,inventoryStages.length);
  if(!batch.length)return save({inventory:[]});
  const context=sequentialContext(brief,{packet:{...packet,sources:batch},searches:[],peerDiscoveryVersion:'product-v2'},{includeTechnicalSignals:Boolean(managed)});
  const found=await collectAttempt(()=>scoped(collectionBudgetKurus).worker('v8-collection-index',{
   instruction:'Bu bir kanıt envanteridir. Kaynakların söylediği bütün ayrı gözlemleri kısa biçimde kaydet. Eleme, puanlama, önem sıralaması, uzlaştırma veya tekilleştirme yapma. Birbirine ters iddiaları ayrı kayıtlarla koru. Her iddiaya özgün proofId ver. areas listesindeki ilgili alanı işaretle. Rakipliği henüz değerlendirme; kaynakta kendi ürününü satan kuruluşun adını ve ilgili proofIdyi organizations içinde kaydet.',
   ...(managed?{researchTasks:managed.tasks}:{}),...stageModelInput(context,{areas:true})
  },schema,{maxOutputTokens:4096}));
  return save({inventory:found.data?[found.data]:[],...(found.unavailable?{unavailable:[found.reason]}:{})});
 }
 if(phase==='coverage_plan'){
  const cost=await providers.costStatus();
  const committedKurus=Math.max(0,cost.chargedKurus-(managed?0:providers.infrastructureOffsetKurus||0)-funding.startKurus);
  if(committedKurus>(funding.researchLimitKurus??collectionBudgetKurus))throw new BudgetError('provider_accounting','Araştırma harcaması ayrılan bütçeyi aştı.');
  const reviewBatches=managed?planManagedEvidenceReview(managedReportInput(await managedCollectionInputs(brief,managed,previous)).input):null;
  return save({collectionClosed:true,researchAccount:{...funding,committedKurus},...(reviewBatches!==null?{reviewBatches}:{})});
 }
 const reviewIndex=managedReviewPhases.indexOf(phase);
 if(managed&&reviewIndex>=0){
  const {reviewBatches=[]}=await previous('coverage_plan'),reviews=[];
  const focus=managed.understanding||brief,signal=AbortSignal.timeout(250000);
  for(let i=reviewIndex;i<reviewBatches.length;i+=managedReviewPhases.length)
   reviews.push(...await reviewManagedEvidenceBatch(reviewBatches[i],{focus,providers,signal,useHaiku:managedReviewUsesHaiku(reviewBatches)}));
  const issues=unique(reviews.flatMap(review=>review.issue?[review.issue]:[]));
  return save({reviews,...(issues.length?{toolIssues:issues}:{})});
 }
 if(phase!=='synthesis')return save({});
 const closed=await previous('coverage_plan');
 if(!closed.collectionClosed)throw new BudgetError('research_stage_incomplete','Kanıt toplama tamamlanmadan Claude değerlendirmesi başlatılamaz.');
 if(managed){
  const args=await managedCollectionInputs(brief,managed,previous);
  const batchReviews=closed.reviewBatches?await sourcesFrom(previous,managedReviewPhases,'reviews'):undefined;
  const {report,completion,invalidObservations,evidenceCoverage}=await synthesizeManagedReport({...args,providers,batchReviews});
  const {packet}=args.context;
  const urls=new Set(report.sources.map(source=>source.url));
  const analysisPacket={...packet,sources:packet.sources.filter(source=>urls.has(source.finalUrl)),citationCards:packet.citationCards.filter(source=>urls.has(source.url))};
  return save({report,analysisPacket,searchEvidence:[],model:completion.model,usage:completion.usage,
   researchContext:{brief,briefHash:briefHash(brief)},supervision:{reviewMode:'managed-audit',researchPlan:managed,
    researchAccount:closed.researchAccount,invalidObservations,evidenceCoverage}});
 }
 const [brand,{packet},inventory,focused]=await Promise.all([previous('brand'),collectionCorpus(previous),sourcesFrom(previous,inventoryStages,'inventory'),previous(scrapeStages[0])]);
 const context=sequentialContext(brief,{packet,searches:[],peerDiscoveryVersion:'product-v2'});
 context.collectionFirst=true;
 const discovered=comparisonEntities(context,inventory);
 const candidates=funding.finalQuotes?peerCandidates(context,discovered,brand,focused.peerProduct,focused.expandedPeerPublishers):[];
 const entities=funding.finalQuotes?[...discovered.filter(entity=>entity.role==='brand'),...candidates.map(item=>item.entity)]:discovered;
 context.input.entities=entities;
 const index=proofIndex(context,inventory);
 const selectedIds=unique(index.flatMap(([, ,ids])=>ids));
 const byProof=new Map(),byAlias=new Map();
 const alias=id=>{
  if(!context.known.has(id))return null;
  if(!byProof.has(id)){const short='s'+(byProof.size+1);byProof.set(id,short);byAlias.set(short,id);}
  return byProof.get(id);
 };
 const originalQuotes=Object.fromEntries(selectedIds.map(id=>{const card=context.known.get(id);return [alias(id),[researchHost(card.url),card.quote]];}));
 const indexedUrls=new Set(selectedIds.map(id=>context.known.get(id).url));
 const peerHosts=new Set((focused.peerHints||[]).map(e=>researchHost(e.website)));
 const unindexedSources=context.input.sources.filter(source=>source.sections.length&&(!indexedUrls.has(source.url)||peerHosts.has(researchHost(source.url)))).map(source=>{
  const host=researchHost(source.url),peer=peerHosts.has(host);
  const sections=source.sections.slice(0,peer?3:1);
  return [peer?source.url:host,source.method,sections.map(s=>{const id=s.proofIds[0];return [alias(id),context.known.get(id).quote];})];
 });
 const approvedIdentity=brand.facts.map(f=>[f.topic,f.kind,f.statement,f.sourceIds.map(alias).filter(Boolean)]);
 const peers=funding.finalQuotes?await reviewCollectedPeers(brief,providers,funding,candidates,alias):null;
 const completion=funding.finalQuotes?await fundedReport(providers,funding,{
  instruction:'Sellf için Türkçe ön BHS yaz. Önce altı boyutu, dört SWOT yönünü ve doğrulanmış ürün rekabetini kapsa. Kanıt varsa altı boyutun her birinde iki somut ve ayrı bulgu seç. Dijitalde gerçek sayfa veya teknik kayıt, fırsatta dış pazar veya müşteri davranışı kullan. Her alan ve SWOT kolunda en fazla dört bulgu seç. Tek bulgu birden çok alana aitse a alanına birlikte yaz. index satırı [alan,gözlem,kanıt kimlikleri]. originalQuotes [yayıncı,alıntı]. a alan kimlikleri, o kısa bulgu, p kanıt kimlikleri, k gözlem veya çıkarım, h ticari yorum, l sınır, w SWOT yönü veya none. Gözlem 150, yorum ve sınır 80 karakteri geçmesin. Her bulgu için mümkünse bir veya iki doğru kaynak yeterli. Açıkça çürütülen iddiayı kullanma. Kanıt yoksa sayı doldurma. questions içinde boyut başına bir kısa görüşme sorusu, benchmarks içinde yalnız doğrudan doğrulanmış kıyas verisi yaz. Tam JSON ile bitir.',
  brief:{brandName:brief.brandName,website:brief.website,goals:brief.goals},areas:methodologyAreas.map(a=>[a.key,a.topic]),approvedIdentity,
  peers:peers.filter(p=>p.relationship==='direct').map(p=>[p.entityId,entities.find(e=>e.id===p.entityId)?.name,p.reason,p.sourceIds.map(id=>{const card=context.known.get(id);return [alias(id),card.quote];})]),
  priorityEvidence:repairSources(context,entities,index,[]).map(card=>[alias(card.id),researchHost(card.url),card.quote])
 },balanceObservations(index.map(([area,statement,ids])=>[area,statement,ids.map(alias)])),originalQuotes,unindexedSources):await providers.manager('v8-collection-final-bhs',{
  instruction:'Sellf için Türkçe ön BHS hazırla. Marka kimliği onaylandıktan sonra kanıtlar toplandı. Şimdi ilk kez değerlendir. index satırları [alan, gözlem, proofId listesi], originalQuotes değerleri [yayıncı, özgün alıntı] şeklindedir. Kesin çürütülen iddiayı kullanma. Belirsiz bilgiyi ölçülmüş gerçek olarak yazma; l alanında sınırını açıkla. Ham arşiv korunur. Önce altı boyuta dengeli bak, sonra önem sırasına göre her alan ve SWOT kolu için en fazla dört destekli bulgu seç. Aynı bulguyu çoğaltma; birden fazla alana uyuyorsa a içinde alan kimliklerini birlikte ver. Kısa JSON sözleşmesi: a alan kimlikleri (ana alan önce), o somut gözlem, p özgün proofId dizisi, k gözlem veya çıkarım türü, h kendi ticari yorumun, l kanıtın sınırı, w SWOT yönü veya none. o en fazla 150, h ve l en fazla 90 karakter olsun. questions alanında boyut başına bir somut görüşme sorusu ver. Aynı ürünü aynı pazarda sunan üç doğrudan rakibi kendi ürün kaynağıyla destekle. Kaynaksız sayı ve performans üretme. Açıklamayı tekrar etme ve tam JSON ile bitir.',
  brief,entities:entities.map(e=>[e.id,e.role,e.name,e.website]),areas:methodologyAreas.map(a=>[a.key,a.topic]),approvedIdentity,index:index.map(([area,text,ids])=>[area,text,ids.map(alias)]),originalQuotes,unindexedSources
 },compactReportSchema,{maxOutputTokens:9000,minimumOutputTokens:3000,compactReview:true,lowEffort:true});
 const unalias=ids=>ids.map(id=>byAlias.get(id)).filter(Boolean);
 const stages=[{phase:'brand',decision:brand.decision},{phase:'collection',decision:'accepted'}];
 if(funding.finalQuotes){
  const productScope=brand.facts.filter(fact=>fact.topic==='products').map(fact=>fact.statement).join(' ');
  context.input.entities=distinctPeerEntities(entities,peers).map(entity=>entity.role==='competitor'&&productScope?{...entity,scope:productScope}:entity);
 }
 const project=async reply=>{
  const data=expandCollectedReport({...reply,findings:reply.findings.map(f=>({...f,p:unalias(f.p)})),peers:reply.peers.map(p=>({...p,sourceIds:unalias(p.sourceIds)})),benchmarks:reply.benchmarks.map(b=>({...b,sourceIds:unalias(b.sourceIds)}))});
  const report=requireGroundedResearch(projectExpertReport(data,context));
  const swot=Object.entries(data.swot).flatMap(([quadrant,ids])=>ids.flatMap(id=>{
   const finding=report.findings.find(f=>f.id===id);
   return finding?[{...finding,quadrant}]:[];
  }));
  const budget=await providers.costStatus();
  return {report,swot,budget,acceptance:qualityAcceptance(report,{stages,swot,budget,reviewMode:'collection-first'})};
 };
 let reply=funding.finalQuotes?{...completion.data,peers:peers.map(p=>({...p,sourceIds:p.sourceIds.map(alias)}))}:completion.data;
 let result=await project(reply);
 const issues=result.acceptance.issues.filter(issue=>!funding.finalQuotes||issue!=='direct_competitors_incomplete');
 if(issues.length){
  const verifiedPeers=(peers||[]).filter(peer=>result.report.competitors.some(entity=>entity.id===peer.entityId));
  const proof=funding.finalQuotes?reservedRepairSources(context,index,issues,verifiedPeers):repairSources(context,entities,index,issues);
  if(proof.length){
   const focused=funding.finalQuotes?await fundedRepair(providers,{
    instruction:'Listelenen eksikleri tamamlayan en fazla dört kısa bulgu yaz. SWOT tehdidi eksikse önce tek bir dış risk yaz. Bir rakibin aynı ihtiyacı karşılayan somut ürünü varsa bunu gözlem olarak ve olası ikame baskısını koşullu ticari yorum olarak kullanabilirsin. Pazar payı, satış kaybı veya güncel hukuki durum varsayma. Mevcut bulguları tekrarlama. p için yalnız sources içindeki gerçek s kimliklerini kullan. a alan anahtarları, o gözlem, k tür, h ticari yorum, l sınır, w SWOT yönü. Gözlem 150, yorum ve sınır 80 karakteri geçmesin. Kanıt yoksa ilgili bulguyu ekleme. Tam JSON ile bitir.',
    brand:brief.brandName,market:brief.goals,issues,dimensionStatus:result.report.dimensions.map(d=>[d.id,d.findingIds.length]),existing:result.report.findings.map(f=>f.statement),areas:methodologyAreas.map(a=>[a.key,a.topic])
   },proof,alias):await collectAttempt(()=>providers.manager('v8-collection-final-gaps',{
    instruction:'Ön BHS son kontrolündeki açıkları aynı arşivde okunmuş kanıtlarla tamamla. Mevcut bulguları tekrarlama. Açık boyut için markaya özgü, ölçüsü sınırlandırılmış kanıt bul. SWOT fırsatı dış pazar veya müşteri davranışına dayanmalı. Elde kanıt varsa eksik sayı için en az üç kısa somut gözlem ekle. Rakipler yalnız kendi okunan ürün kaynağıyla doğrulanabilir. Ürün ikamesi ve hedef ülke kaynağa uymuyorsa benchmark veya unconfirmed kullan. Olası fırsatı gerçekleşmiş sonuç sayma. finding alanları a metodoloji anahtarları, o gözlem, p verilen kanıt kimlikleri, k tür, h ticari yorum, l sınır, w SWOT yönü veya none. O, h ve l alanlarını kısa tut. JSON dışında yazma.',
    brand:brief.brandName,market:brief.goals,issues:result.acceptance.issues,dimensionStatus:result.report.dimensions.map(d=>[d.id,d.findingIds.length]),existing:result.report.findings.map(f=>f.statement),areas:methodologyAreas.map(a=>[a.key,a.topic]),entities:entities.map(e=>[e.id,e.role,e.name,e.website]),sources:proof.map(c=>[alias(c.id),researchHost(c.url),c.quote])
   },compactReportSchema,{maxOutputTokens:2400,minimumOutputTokens:1300,compactReview:true,lowEffort:true}));
   if(focused.data){
    const patch=focused.data;
    const allowed=new Set((focused.proof||proof).map(card=>alias(card.id)));
    const findings=funding.finalQuotes?patch.findings.filter(row=>row.p.length&&row.p.every(id=>allowed.has(id))):patch.findings;
    const mergedPeers=[...new Map([...reply.peers,...(patch.peers||[])].map(peer=>[peer.entityId,peer])).values()];
    const questions=Object.fromEntries(Object.entries(reply.questions).map(([key,value])=>[key,patch.questions?.[key]||value]));
    reply={...reply,findings:[...reply.findings,...findings],peers:mergedPeers,questions,benchmarks:[...reply.benchmarks,...(patch.benchmarks||[])]};
    result=await project(reply);
   }else result.budget=await providers.costStatus();
  }
 }
 if(funding.finalQuotes&&focused.peerProduct&&result.acceptance.issues.includes('direct_competitors_incomplete')){
  const names=result.report.competitors.map(entity=>entity.name);
  const repaired=await repairPeerCoverage({brief,brand,providers,context,funding,product:focused.peerProduct,names,collect,alias,researchSpend:closed.researchAccount.committedKurus});
  if(repaired.decisions.length){
   const productScope=brand.facts.filter(fact=>fact.topic==='products').map(fact=>fact.statement).join(' ');
   const repairedPeers=[...new Map([...peers,...repaired.decisions].map(peer=>[peer.entityId,peer])).values()];
   const repairedEntities=[...new Map([...context.input.entities,...repaired.entities].map(entity=>[entity.id,entity])).values()];
   context.input.entities=distinctPeerEntities(repairedEntities,repairedPeers).map(entity=>entity.role==='competitor'&&productScope?{...entity,scope:productScope}:entity);
   result=await project({...reply,peers:repairedPeers.map(peer=>({...peer,sourceIds:peer.sourceIds.map(alias)}))});
  }else result.budget=await providers.costStatus();
 }
 const {report,swot,budget,acceptance}=result;
 const citedUrls=new Set(report.sources.map(source=>source.url));
 const analysisPacket={...context.packet,sources:context.packet.sources.filter(source=>citedUrls.has(source.finalUrl)),citationCards:context.packet.citationCards.filter(source=>citedUrls.has(source.url))};
 return save({report,analysisPacket,searchEvidence:[],model:completion.model,usage:completion.usage,fullPacketHash:evidenceHash(context.packet),researchContext:{brief,briefHash:briefHash(brief)},supervision:{reviewMode:'collection-first',manager:completion.model,worker:'gemini-3.1-flash-lite',stageOrder:['brand','collection','synthesis'],stageDecisions:stages,swot,acceptance,finalDecision:'accepted',researchAccount:closed.researchAccount,costUpperBound:budget,qualityStatus:acceptance.passed?'passed':'requires_content_review'}});
}
