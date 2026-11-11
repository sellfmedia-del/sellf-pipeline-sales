import {BudgetError,hash,tariff} from '../budget/ledger.mjs';
import {gzipSync} from 'node:zlib';
import {briefHash} from './brief.mjs';
import {evidenceExcerpts,evidenceHash} from './evidence.mjs';
import {expertInstruction,projectExpertReport} from './expert-report.mjs';
import {methodologyAreas} from './methodology-areas.mjs';
import {actorInput,observedActorTargets} from './apify-inputs.mjs';
import {researchHost,researchUrl} from './research-url.mjs';
import {arr,finalSchema,obj,qualityAcceptance,sequentialContext,stageModelInput,str} from './sequential-contracts.mjs';
import {requireGroundedResearch} from './research-content.mjs';

export const collectionBudgetKurus=2500;
const searchStages=['sector_sources','sector_draft','sector_review'];
const readStages=['sector_correction_sources','sector_correction_draft','sector','sector_validation','competition_plan','competition_sources'];
const scrapeStages=['competition_draft','competition_review','competition_correction_sources'];
const inventoryStages=['competition_correction_draft','competition','swot_sources','swot_draft','swot_review','swot_correction_sources','swot_correction_draft','swot'];
const quadrants=['strength','weakness','opportunity','threat'];
const markets=[[/Türkiye|Turkey/iu,'Türkiye','TR','tr'],[/United Kingdom|Birleşik Krallık|\bUK\b/iu,'United Kingdom','GB','en'],[/United States|Amerika Birleşik Devletleri|\bUSA\b/iu,'United States','US','en'],[/Germany|Almanya/iu,'Germany','DE','de'],[/France|Fransa/iu,'France','FR','fr']];
const schema=obj({
 observations:arr(obj({area:str(80),text:str(350),sourceIds:arr(str(80))})),
 organizations:arr(obj({name:str(120),sourceId:str(80)}))
});
const collectionErrors=new Set(['budget_limit','budget_uncertain','budget_pending','provider_rejected','provider_error','provider_timeout','incomplete','model_output_invalid','invalid_report','actor_source_unverified','actor_locale_unverified']);

async function collectAttempt(run){
 try{return await run();}
 catch(error){
  if(!collectionErrors.has(error.code))throw error;
  return {unavailable:true,reason:error.code};
 }
}

const shard=(rows,index,count)=>rows.filter((_,i)=>i%count===index);
const unique=items=>[...new Set(items)];
const sourcesFrom=async(previous,stages,key)=>(await Promise.all(stages.map(previous))).flatMap(s=>s[key]||[]);
const canonicalSources=rows=>[...new Map(rows.map(s=>[s.finalUrl+' '+s.contentHash,s])).values()].map((s,i)=>({...s,id:'ev'+(i+1)}));

function providerSource({url,title,text,method,asOf,scope,provenance}){
 if(!url||typeof text!=='string'||text.trim().length<24)return null;
 return {url,finalUrl:url,title:title||url,method,retrievedAt:asOf,scope,provenance,contentHash:hash(text),excerpts:evidenceExcerpts(text,{maxChunks:40})};
}

async function corpus(previous){
 const brand=await previous('brand');
 const [searches,pages,scrapes]=await Promise.all([
  sourcesFrom(previous,searchStages,'searches'),
  sourcesFrom(previous,readStages,'pages'),
  sourcesFrom(previous,scrapeStages,'scrapes')
 ]);
 const asOf=brand.packet.asOf;
 const searchSources=searches.flatMap(s=>(s.results||[]).map(r=>providerSource({url:researchUrl(r.url),title:r.title,text:r.content,method:'search-snippet',asOf,scope:'Tavily arama alıntısı'}))).filter(Boolean);
 const actorSources=scrapes.flatMap(s=>(s.pages||[]).map(r=>providerSource({url:researchUrl(r.url),title:s.actor,text:r.text,method:'extracted',asOf,scope:'Apify structured sample; only the captured item.',provenance:{actor:s.actor,runId:s.runId}}))).filter(Boolean);
 return {searches,scrapes,packet:{...brand.packet,sources:canonicalSources([...brand.packet.sources,...pages,...actorSources,...searchSources])}};
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

// Research receipts remain intact. This packet is a compact index for Claude,
// with each entry pointing back to a read paragraph, not a replacement archive.
function proofIndex(context,inventory){
 const indexed=inventory.flatMap(i=>i.observations||[]).filter(row=>row.sourceIds?.some(id=>context.known.has(id)));
 const bySource=new Map();
 for(const row of indexed)for(const id of row.sourceIds){
  if(!context.known.has(id))continue;
  const source=context.known.get(id);
  if(!bySource.has(source.url))bySource.set(source.url,[]);
  bySource.get(source.url).push([id,row.area,row.text]);
 }
 return [...bySource].map(([url,rows])=>[url,rows]);
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

export async function runCollectionFirstStage({phase,brief,providers,previous,collect,finish}){
 const searchIndex=searchStages.indexOf(phase),readIndex=readStages.indexOf(phase),scrapeIndex=scrapeStages.indexOf(phase),inventoryIndex=inventoryStages.indexOf(phase);
 const funding=phase===searchStages[0]?await providers.checkpoint('collection-first-funding',brief,async()=>{
  const {chargedKurus,capKurus}=await providers.costStatus();
  const startKurus=Math.max(tariff.infraKurus,chargedKurus-(providers.infrastructureOffsetKurus||0));
  return {startKurus,capKurus:Math.min(capKurus,startKurus+collectionBudgetKurus)};
 }):(await previous(searchStages[0])).funding;
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
  if(!targets.length)return save({pages:[],unavailable:[]});
  const packet=await collect(brief,brand.plan,{extraSources:targets,prioritySources:targets,explicitSourcesOnly:true,sourceLimit:targets.length,archivePages:async pages=>{
   for(const page of pages){
    const input={url:page.finalUrl,method:page.method,contentHash:hash(page.text)};
    await providers.checkpoint('collection-raw-page',input,async()=>({encoding:'gzip-base64',data:gzipSync(JSON.stringify(page)).toString('base64')}));
   }
  }});
  return save({pages:packet.sources,unavailable:packet.unavailable});
 }
 if(scrapeIndex>=0){
  const brand=await previous('brand');
  const market=markets.find(([pattern])=>pattern.test(brand.review?.marketContext?.description||brief.goals));
  const [searches,pages]=await Promise.all([sourcesFrom(previous,searchStages,'searches'),sourcesFrom(previous,readStages,'pages')]);
  const scrapes=await actorRequest({brief,searches,packet:{...brand.packet,sources:[...brand.packet.sources,...pages]}},scoped(1900),scrapeIndex,market);
  return save({scrapes});
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
  if(committedKurus>collectionBudgetKurus)throw new BudgetError('provider_accounting','Araştırma hesabının 25 TL tavanı doğrulanamadı.');
  return save({collectionClosed:true,researchAccount:{...funding,committedKurus}});
 }
 if(phase!=='synthesis')return save({});
 const brand=await previous('brand'),closed=await previous('coverage_plan');
 if(!closed.collectionClosed)throw new BudgetError('research_stage_incomplete','Kanıt toplama tamamlanmadan Claude değerlendirmesi başlatılamaz.');
 const [{packet},inventory]=await Promise.all([corpus(previous),sourcesFrom(previous,inventoryStages,'inventory')]);
 const context=sequentialContext(brief,{packet,searches:[],peerDiscoveryVersion:'product-v2'});
 const entities=comparisonEntities(context,inventory);
 context.input.entities=entities;
 const index=proofIndex(context,inventory);
 const selectedIds=unique(index.flatMap(([,rows])=>rows.map(r=>r[0])));
 const originalQuotes=Object.fromEntries(selectedIds.map(id=>[id,context.known.get(id).quote]));
 const indexedUrls=new Set(index.map(([url])=>url));
 const unindexedSources=context.input.sources.filter(source=>!indexedUrls.has(source.url)&&source.sections.length).map(source=>[source.url,source.title,source.method,source.sections[0].proofIds[0],source.sections[0].text]);
 const completion=await providers.manager('v8-collection-final-bhs',{
  instruction:expertInstruction()+'\nMarka kimliği onaylandıktan sonra tüm kanıtlar tek araştırma bütçesiyle toplandı. Şimdi araştırma bulgularını ilk kez değerlendir. Kesin biçimde çürütülen iddiaları rapora alma. Belirsiz veya çelişkili bilgi varsa, doğrulanmış gerçek gibi yazmadan kapsamını ve görüşmede doğrulanacak noktayı belirt. Ham kanıt arşivi korunur. Her metodoloji alanı ve SWOT kolu için en önemli en fazla dört destekli bulguyu önem sırasına göre seç; veri yokken sayı doldurma. Raporu kendi iş yorumlarınla yaz. Aynı ürün ve pazarda üç kaynaklı doğrudan rakibi değerlendirmeye çalış. Sahiplik, operasyon, algı, pazar, marka ve dijital gözlemlerini ayrı tut. Sadece verilen özgün proofId değerlerini kullan. Ölçülmeyen sayı ve performansı üretme.',
  brief,entities,areas:methodologyAreas,approvedIdentity:brand.facts,index,originalQuotes,unindexedSources
 },finalSchema,{maxOutputTokens:8192,minimumOutputTokens:4096,compactReview:true});
 const data=completion.data;
 for(const area of Object.values(data.coverage))area.findingIds=area.findingIds.slice(0,4);
 for(const dimension of data.dimensions)dimension.findingIds=dimension.findingIds.slice(0,4);
 for(const key of quadrants)data.swot[key]=data.swot[key].slice(0,4);
 const report=requireGroundedResearch(projectExpertReport(data,context));
 const citedUrls=new Set(report.sources.map(source=>source.url));
 const analysisPacket={...context.packet,sources:context.packet.sources.filter(source=>citedUrls.has(source.finalUrl)),citationCards:context.packet.citationCards.filter(source=>citedUrls.has(source.url))};
 const swot=Object.entries(data.swot).flatMap(([quadrant,ids])=>ids.flatMap(id=>{
  const finding=report.findings.find(f=>f.id===id);
  return finding?[{...finding,quadrant}]:[];
 }));
 const stages=[{phase:'brand',decision:brand.decision},{phase:'collection',decision:'accepted'}];
 const budget=await providers.costStatus();
 const acceptance=qualityAcceptance(report,{stages,swot,budget,reviewMode:'collection-first'});
 return save({report,analysisPacket,searchEvidence:[],model:completion.model,usage:completion.usage,fullPacketHash:evidenceHash(context.packet),researchContext:{brief,briefHash:briefHash(brief)},supervision:{reviewMode:'collection-first',manager:completion.model,worker:'gemini-3.1-flash-lite',stageOrder:['brand','collection','synthesis'],stageDecisions:stages,swot,acceptance,finalDecision:'accepted',researchAccount:closed.researchAccount,costUpperBound:budget,qualityStatus:acceptance.passed?'passed':'requires_content_review'}});
}
