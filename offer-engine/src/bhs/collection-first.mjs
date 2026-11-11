import {BudgetError,hash,tariff} from '../budget/ledger.mjs';
import {gzipSync} from 'node:zlib';
import {briefHash,dimensions} from './brief.mjs';
import {evidenceExcerpts,evidenceHash} from './evidence.mjs';
import {projectExpertReport} from './expert-report.mjs';
import {methodologyAreas} from './methodology-areas.mjs';
import {actorInput,observedActorTargets} from './apify-inputs.mjs';
import {researchHost,researchUrl} from './research-url.mjs';
import {arr,finalSchema,obj,peerSchema,qualityAcceptance,sequentialContext,stageModelInput,str} from './sequential-contracts.mjs';
import {requireGroundedResearch} from './research-content.mjs';
import {quoteSupervised,reserveStageQuote} from './supervised-providers.mjs';

export const collectionBudgetKurus=2500;
const finalCalls={peers:{input:8000,output:600},report:{input:33500,output:4900},repair:{input:10000,output:1550}};
export function planCollectionFunding({chargedKurus,capKurus},infrastructureKurus=0,now=Date.now()){
 const startKurus=Math.max(tariff.infraKurus,chargedKurus-infrastructureKurus);
 const finalQuotes=Object.fromEntries(Object.entries(finalCalls).map(([name,call])=>[name,reserveStageQuote(quoteSupervised('manager',call.input,call.output,now))]));
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
const reservedRepairSchema=obj({findings:arr(reservedReportSchema.properties.findings.items,4)});
const peerVerdictSchema=obj({decisions:arr(obj({id:str(12),verdict:{type:'string',enum:['direct','benchmark','unconfirmed']},proof:str(16),reason:str(95)}),6)});
const peerSearchSchema=obj({queries:arr(obj({name:str(100),query:str(350)}),4)});
const collectionErrors=new Set(['budget_limit','budget_uncertain','budget_pending','provider_rejected','provider_error','quota','provider_timeout','incomplete','model_output_invalid','invalid_report','actor_source_unverified','actor_locale_unverified','actor_api_unavailable','actor_output_limit','actor_time_limit','actor_pricing_unverified','actor_limit_unverified']);

async function collectAttempt(run){
 try{return await run();}
 catch(error){
  if(!collectionErrors.has(error.code))throw error;
  return {unavailable:true,reason:error.code};
 }
}

const shard=(rows,index,count)=>rows.filter((_,i)=>i%count===index);
const unique=items=>[...new Set(items)];
const nameKey=text=>text.toLocaleLowerCase('tr').normalize('NFKD').replace(/\p{M}/gu,'').replace(/ı/g,'i').replace(/[^a-z0-9]/g,'');
const peerGroupKey=name=>nameKey(name.replace(/^(?:atelier|maison)\s+/iu,''));
function publisherMatches(name,url){
 const brand=nameKey(name),domain=researchHost(url)?.split('.')[0];
 return brand.length>2&&[brand,brand+'store',brand+'shop','maison'+brand].includes(domain);
}
const sourcesFrom=async(previous,stages,key)=>(await Promise.all(stages.map(previous))).flatMap(s=>s[key]||[]);
const canonicalSources=rows=>[...new Map(rows.map(s=>[s.finalUrl+' '+s.contentHash,s])).values()].map((s,i)=>({...s,id:'ev'+(i+1)}));

function providerSource({url,title,text,method,asOf,scope,provenance}){
 if(!url||typeof text!=='string'||text.trim().length<24)return null;
 return {url,finalUrl:url,title:title||url,method,retrievedAt:asOf,scope,provenance,contentHash:hash(text),excerpts:evidenceExcerpts(text,{maxChunks:40})};
}

async function corpus(previous){
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

async function actorRequest(context,providers,index,market){
 const available=await providers.availableActors?.()||[];
 const known=observedActorTargets(context);
 const order=['logiover/website-seo-audit-crawler','apify/website-content-crawler','compass/crawler-google-places','apify/instagram-profile-scraper','harvestapi/linkedin-company-search','jmlp/meta-ad-library-scraper'];
 const targets=[];
 const geo=market?{countryCode:market[2],language:market[3]}:null;
 for(const actor of order.filter(name=>available.includes(name))){
  const target=[...known.urls].find(url=>{
   try{actorInput({actor,url,...geo},{...context,geo},known);return true;}
   catch(error){if(['actor_source_unverified','actor_locale_unverified'].includes(error.code))return false;throw error;}
  });
  if(target)targets.push({actor,url:target,purpose:'Marka ve hedef pazar için kamuya açık kaynak.',...geo});
 }
 const scrapes=[];
 for(const request of shard(targets,index,scrapeStages.length))scrapes.push(await collectAttempt(()=>providers.enrich(request,{...context,geo})));
 return scrapes;
}

async function readResearchPages(brief,plan,targets,providers,collect){
 if(!targets.length)return {sources:[],unavailable:[]};
 return collect(brief,plan,{extraSources:targets,prioritySources:targets,explicitSourcesOnly:true,sourceLimit:targets.length,archivePages:async pages=>{
  for(const page of pages){
   const input={url:page.finalUrl,method:page.method,contentHash:hash(page.text)};
   await providers.checkpoint('collection-raw-page',input,async()=>({encoding:'gzip-base64',data:gzipSync(JSON.stringify(page)).toString('base64')}));
  }
 }});
}

async function comparisonResearch(brief,brand,market,pool,providers,collect){
 const plan=await collectAttempt(()=>pool.worker('v8-collection-peer-search',{
  instruction:'Onaylı marka ürünlerinden ana ikame edilebilir ürün veya hizmeti seç. Hedef pazarda o ürünle ilişkili ve kendi resmî ürün sayfası bulunabilecek, birbirinden bağımsız dört marka için birer arama sorgusu yaz. Aynı grubun alt markalarını ayrı sorgulara koyma. Perakendeci, ajans, arama sitesi veya farklı ürün satan markayı aday gösterme. name sadece adayın marka adı, query ise marka + somut ürün + ülke + resmî ürün sayfası kelimeleri olsun. Bunlar araştırma adaylarıdır. Rakip kararı verme, URL uydurma.',
  brand:brief.brandName,market:market?.[1]||'',identity:brand.facts
 },peerSearchSchema,{maxOutputTokens:512}));
 const searches=[],hints=[];
 for(const {name,query} of plan.data?.queries||[]){
  if(!name.trim()||!query.trim()||nameKey(name)===nameKey(brief.brandName))continue;
  const search=await collectAttempt(()=>pool.search(query,{depth:'basic',maxResults:12,retainRaw:true}));
  searches.push(search);
  const urls=(search.results||[]).map(r=>researchUrl(r.url)).filter(url=>url&&publisherMatches(name,url));
  const url=urls.find(url=>/ürün|urun|product|catalog|kategori|category|collections/i.test(new URL(url).pathname))||urls[0];
  if(!url||hints.some(peer=>researchHost(peer.website)===researchHost(url)))continue;
  hints.push({id:'candidate_'+hash(researchHost(url)).slice(0,20),role:'competitor',name,website:url,scope:'Ürün sayfası araştırma adayı.',audienceReason:'Kitle örtüşmesi denetlenecek.',scaleReason:'Ölçek doğrulanmadı.',geographyReason:'Hedef pazar denetlenecek.'});
 }
 const targets=unique([...hints.map(peer=>peer.website),...searches.flatMap(s=>(s.results||[]).map(r=>researchUrl(r.url))).filter(Boolean)]);
 const packet=await readResearchPages(brief,brand.plan,targets,providers,collect);
 return {searches,pages:packet.sources,peerHints:hints};
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

function peerCandidates(context,entities,brand){
 const product=brand.facts.find(f=>f.topic==='products')?.statement||'';
 const brandName=context.input.brief.brandName.toLocaleLowerCase('tr');
 const terms=unique(product.toLocaleLowerCase('tr').match(/[\p{L}]{5,}/gu)||[]).filter(word=>!brandName.includes(word));
 const productPattern=/ürün|product|satın|shop|₺|kategori|category|fiyat|price|sepet|cart/i;
 const scored=new Map();
 for(const candidate of entities.filter(e=>e.role==='competitor'&&nameKey(e.name)!==nameKey(context.input.brief.brandName))){
  for(const source of context.input.sources){
   if(source.metadataOnly||source.method==='search-snippet'||!publisherMatches(candidate.name,source.url))continue;
   const cards=source.sections.flatMap(section=>section.proofIds.map(id=>context.known.get(id))).filter(Boolean).map(card=>{
    const quote=card.quote.toLocaleLowerCase('tr');
    return {card,score:terms.reduce((n,term)=>n+Number(quote.includes(term)),0)*2+Number(productPattern.test(quote))};
   }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score);
   if(!cards.length)continue;
   const key=nameKey(candidate.name),score=cards[0].score;
   if(scored.get(key)?.score>=score)continue;
   const entity={...candidate,website:source.url,scope:product,audienceReason:''};
   scored.set(key,{entity,score,cards:cards.slice(0,2).map(item=>item.card)});
  }
 }
 return [...scored.values()].sort((a,b)=>b.score-a.score).slice(0,6);
}

function reservedOptions(call,reserveForFollowingKurus=0){
 return {maxOutputTokens:call.output,minimumOutputTokens:call.output,maxInputUpperTokens:call.input,reserveForFollowingKurus,compactReview:true,lowEffort:true};
}

async function reviewCollectedPeers(brief,providers,funding,candidates,alias){
 if(!candidates.length)return [];
 const peers=candidates.map(({entity,cards},i)=>({id:'r'+(i+1),entity,cards}));
 const result=await collectAttempt(()=>providers.manager('v8-collection-reserved-peers',{
  instruction:'Marka ile aynı hedef pazarda aynı ürün veya ihtiyaca hitap eden doğrudan rakipleri belirle. Satıcı, ajans, aynı grubun tekrarı veya benzer olmayan ürün doğrudan rakip sayılmaz. Her aday için sadece o adayın altındaki okunan birincil kaynak kimliğini kullan. Açık ürün ve pazar örtüşmesi varsa direct, yalnız kıyas örneğiyse benchmark, kanıt yetersizse unconfirmed. En fazla dört gerçek doğrudan rakip seç. Her kararın gerekçesini tek kısa cümleyle yaz.',
  brand:brief.brandName,market:brief.goals,product:candidates[0].entity.scope,
  candidates:peers.map(({id,entity,cards})=>[id,entity.name,entity.website,cards.map(c=>[alias(c.id),c.quote])])
 },peerVerdictSchema,reservedOptions(finalCalls.peers,funding.finalQuotes.report+funding.finalQuotes.repair)));
 const decisions=[];
 for(const row of result.data?.decisions||[]){
  const peer=peers.find(p=>p.id===row.id);
  const card=peer?.cards.find(c=>alias(c.id)===row.proof);
  if(!card||decisions.some(d=>d.entityId===peer.entity.id))continue;
  decisions.push({entityId:peer.entity.id,relationship:row.verdict,sourceIds:[card.id],reason:row.reason});
 }
 return decisions;
}

async function fundedReport(providers,funding,base,observations,quotes,sourceSamples){
 // Shorten only the model request on an unbilled input-size rejection. Raw
 // evidence, observations and all source receipts stay in the archive.
 const options=reservedOptions(finalCalls.report,funding.finalQuotes.repair);
 const variants=[{samples:45,keep:observations.length},{samples:20,keep:observations.length},{samples:10,keep:Math.min(observations.length,95)},{samples:0,keep:Math.min(observations.length,55)}];
 let lastError;
 for(const variant of variants){
  const index=observations.slice(0,variant.keep);
  const ids=new Set(index.flatMap(([, ,proofs])=>proofs));
  const originalQuotes=Object.fromEntries(Object.entries(quotes).filter(([id])=>ids.has(id)));
  try{return await providers.manager('v8-collection-reserved-report',{...base,index,originalQuotes,unindexedSources:sourceSamples.slice(0,variant.samples)},reservedReportSchema,options);}
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
 for(const limit of [18,9,4]){
  const chosen=proof.slice(0,limit);
  const sources=chosen.map(card=>[alias(card.id),researchHost(card.url),card.quote]);
  try{
   const result=await collectAttempt(()=>providers.manager('v8-collection-reserved-gaps',{...input,existing:input.existing.slice(0,limit),sources},reservedRepairSchema,reservedOptions(finalCalls.repair)));
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

export async function runCollectionFirstStage({phase,brief,providers,previous,collect,finish}){
 const searchIndex=searchStages.indexOf(phase),readIndex=readStages.indexOf(phase),scrapeIndex=scrapeStages.indexOf(phase),inventoryIndex=inventoryStages.indexOf(phase);
 const funding=phase===searchStages[0]?await providers.checkpoint('collection-first-funding',brief,async()=>planCollectionFunding(await providers.costStatus(),providers.infrastructureOffsetKurus,providers.now?.())):(await previous(searchStages[0])).funding;
 const save=data=>finish({collectionFirst:true,...data});
 const scoped=amount=>providers.withCeiling(Math.min(funding.capKurus,funding.startKurus+amount));
 if(searchIndex>=0){
  const brand=await previous('brand');
  const market=markets.find(([pattern])=>pattern.test(brand.review?.marketContext?.description||brief.goals));
  const pool=scoped(900);
  const topics=shard(methodologyAreas,searchIndex,searchStages.length);
  const searches=[];
  for(let i=0;i<topics.length;i+=3){
   searches.push(...await Promise.all(topics.slice(i,i+3).map(({topic})=>collectAttempt(()=>pool.search(queryFor(brief,topic,market),{depth:'basic',maxResults:12,retainRaw:true})))));
  }
  return save({funding,searches});
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
  const market=markets.find(([pattern])=>pattern.test(brand.review?.marketContext?.description||brief.goals));
  const [searches,pages]=await Promise.all([sourcesFrom(previous,searchStages,'searches'),sourcesFrom(previous,readStages,'pages')]);
  const comparison=scrapeIndex===0?await comparisonResearch(brief,brand,market,scoped(1150),providers,collect):{searches:[],pages:[]};
  // The Actor adapter holds the final 6 TRY of this research account for Gemini.
  const scrapes=await actorRequest({brief,searches:[...searches,...comparison.searches],packet:{...brand.packet,sources:[...brand.packet.sources,...pages,...comparison.pages]}},scoped(collectionBudgetKurus),scrapeIndex,market);
  return save({...comparison,scrapes});
 }
 if(inventoryIndex>=0){
  const {packet}=await corpus(previous);
  const batch=shard(packet.sources,inventoryIndex,inventoryStages.length);
  if(!batch.length)return save({inventory:[]});
  const context=sequentialContext(brief,{packet:{...packet,sources:batch},searches:[],peerDiscoveryVersion:'product-v2'});
  const found=await collectAttempt(()=>scoped(collectionBudgetKurus).worker('v8-collection-index',{
   instruction:'Bu bir kanıt envanteridir. Kaynakların söylediği bütün ayrı gözlemleri kısa biçimde kaydet. Eleme, puanlama, önem sıralaması, uzlaştırma veya tekilleştirme yapma. Birbirine ters iddiaları ayrı kayıtlarla koru. Her iddiaya özgün proofId ver. areas listesindeki ilgili alanı işaretle. Rakipliği henüz değerlendirme; kaynakta kendi ürününü satan kuruluşun adını ve ilgili proofIdyi organizations içinde kaydet.',
   ...stageModelInput(context,{areas:true})
  },schema,{maxOutputTokens:4096}));
  return save({inventory:found.data?[found.data]:[],...(found.unavailable?{unavailable:[found.reason]}:{})});
 }
 if(phase==='coverage_plan'){
  const cost=await providers.costStatus();
  const committedKurus=Math.max(0,cost.chargedKurus-(providers.infrastructureOffsetKurus||0)-funding.startKurus);
  if(committedKurus>(funding.researchLimitKurus??collectionBudgetKurus))throw new BudgetError('provider_accounting','Araştırma harcaması ayrılan bütçeyi aştı.');
  return save({collectionClosed:true,researchAccount:{...funding,committedKurus}});
 }
 if(phase!=='synthesis')return save({});
 const brand=await previous('brand'),closed=await previous('coverage_plan');
 if(!closed.collectionClosed)throw new BudgetError('research_stage_incomplete','Kanıt toplama tamamlanmadan Claude değerlendirmesi başlatılamaz.');
 const [{packet},inventory]=await Promise.all([corpus(previous),sourcesFrom(previous,inventoryStages,'inventory')]);
 const context=sequentialContext(brief,{packet,searches:[],peerDiscoveryVersion:'product-v2'});
 const discovered=comparisonEntities(context,inventory);
 const candidates=funding.finalQuotes?peerCandidates(context,discovered,brand):[];
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
 const focused=await previous(scrapeStages[0]);
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
 if(funding.finalQuotes)context.input.entities=distinctPeerEntities(entities,peers);
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
 const initial=funding.finalQuotes?{...completion.data,peers:peers.map(p=>({...p,sourceIds:p.sourceIds.map(alias)}))}:completion.data;
 let result=await project(initial);
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
    const mergedPeers=[...new Map([...initial.peers,...(patch.peers||[])].map(peer=>[peer.entityId,peer])).values()];
    const questions=Object.fromEntries(Object.entries(initial.questions).map(([key,value])=>[key,patch.questions?.[key]||value]));
    result=await project({...initial,findings:[...initial.findings,...findings],peers:mergedPeers,questions,benchmarks:[...initial.benchmarks,...(patch.benchmarks||[])]});
   }else result.budget=await providers.costStatus();
  }
 }
 const {report,swot,budget,acceptance}=result;
 const citedUrls=new Set(report.sources.map(source=>source.url));
 const analysisPacket={...context.packet,sources:context.packet.sources.filter(source=>citedUrls.has(source.finalUrl)),citationCards:context.packet.citationCards.filter(source=>citedUrls.has(source.url))};
 return save({report,analysisPacket,searchEvidence:[],model:completion.model,usage:completion.usage,fullPacketHash:evidenceHash(context.packet),researchContext:{brief,briefHash:briefHash(brief)},supervision:{reviewMode:'collection-first',manager:completion.model,worker:'gemini-3.1-flash-lite',stageOrder:['brand','collection','synthesis'],stageDecisions:stages,swot,acceptance,finalDecision:'accepted',researchAccount:closed.researchAccount,costUpperBound:budget,qualityStatus:acceptance.passed?'passed':'requires_content_review'}});
}
