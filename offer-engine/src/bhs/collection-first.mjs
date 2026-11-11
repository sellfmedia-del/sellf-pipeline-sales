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

export const collectionBudgetKurus=2500;
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
const compactReportSchema=obj({
 findings:arr(obj({a:arr({type:'string',enum:[...areasByKey.keys()]},4),o:str(220),p:arr(str(80)),k:{type:'string',enum:['observation','inference']},h:str(150),l:str(140),w:{type:'string',enum:['none',...quadrants]}})),
 peers:arr(peerSchema,5),
 questions:obj(Object.fromEntries(dimensions.map(({id})=>[id,str(180)]))),
 benchmarks:finalSchema.properties.benchmarks
});
const peerSearchSchema=obj({queries:arr(obj({name:str(100),query:str(350)}),4)});
const collectionErrors=new Set(['budget_limit','budget_uncertain','budget_pending','provider_rejected','provider_error','provider_timeout','incomplete','model_output_invalid','invalid_report','actor_source_unverified','actor_locale_unverified','actor_api_unavailable','actor_output_limit','actor_time_limit','actor_pricing_unverified','actor_limit_unverified']);

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
  instruction:'Onaylı marka ürünlerinden ana ikame edilebilir ürün veya hizmeti seç. Hedef pazarda o ürünün kendi resmî ürün sayfası olabilecek en fazla dört farklı marka için birer arama sorgusu yaz. name sadece adayın marka adı, query ise marka + somut ürün + ülke + resmî ürün sayfası kelimeleri olsun. İnternetten gelen sonuçlar daha sonra kaydedilip doğrulanacak. Rakip kararı verme, URL uydurma.',
  brand:brief.brandName,market:market?.[1]||'',identity:brand.facts
 },peerSearchSchema,{maxOutputTokens:512}));
 const searches=[],hints=[];
 const key=text=>text.toLocaleLowerCase('tr').normalize('NFKD').replace(/\p{M}/gu,'').replace(/ı/g,'i').replace(/[^a-z0-9]/g,'');
 for(const {name,query} of plan.data?.queries||[]){
  if(!name.trim()||!query.trim()||key(name)===key(brief.brandName))continue;
  const search=await collectAttempt(()=>pool.search(query,{depth:'basic',maxResults:12,retainRaw:true}));
  searches.push(search);
  const nameKey=key(name);
  const url=search.results?.map(r=>researchUrl(r.url)).find(url=>url&&nameKey.length>2&&key(researchHost(url).split('.')[0])===nameKey);
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
 const completion=await providers.manager('v8-collection-final-bhs',{
  instruction:'Sellf için Türkçe ön BHS hazırla. Marka kimliği onaylandıktan sonra kanıtlar toplandı. Şimdi ilk kez değerlendir. index satırları [alan, gözlem, proofId listesi], originalQuotes değerleri [yayıncı, özgün alıntı] şeklindedir. Kesin çürütülen iddiayı kullanma. Belirsiz bilgiyi ölçülmüş gerçek olarak yazma; l alanında sınırını açıkla. Ham arşiv korunur. Önce altı boyuta dengeli bak, sonra önem sırasına göre her alan ve SWOT kolu için en fazla dört destekli bulgu seç. Aynı bulguyu çoğaltma; birden fazla alana uyuyorsa a içinde alan kimliklerini birlikte ver. Kısa JSON sözleşmesi: a alan kimlikleri (ana alan önce), o somut gözlem, p özgün proofId dizisi, k gözlem veya çıkarım türü, h kendi ticari yorumun, l kanıtın sınırı, w SWOT yönü veya none. o en fazla 150, h ve l en fazla 90 karakter olsun. questions alanında boyut başına bir somut görüşme sorusu ver. Aynı ürünü aynı pazarda sunan üç doğrudan rakibi kendi ürün kaynağıyla destekle. Kaynaksız sayı ve performans üretme. Açıklamayı tekrar etme ve tam JSON ile bitir.',
  brief,entities:entities.map(e=>[e.id,e.role,e.name,e.website]),areas:methodologyAreas.map(a=>[a.key,a.topic]),approvedIdentity,index:index.map(([area,text,ids])=>[area,text,ids.map(alias)]),originalQuotes,unindexedSources
 },compactReportSchema,{maxOutputTokens:9000,minimumOutputTokens:3000,compactReview:true,lowEffort:true});
 const unalias=ids=>ids.map(id=>byAlias.get(id)).filter(Boolean);
 const reply=completion.data;
 const data=expandCollectedReport({...reply,findings:reply.findings.map(f=>({...f,p:unalias(f.p)})),peers:reply.peers.map(p=>({...p,sourceIds:unalias(p.sourceIds)})),benchmarks:reply.benchmarks.map(b=>({...b,sourceIds:unalias(b.sourceIds)}))});
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
