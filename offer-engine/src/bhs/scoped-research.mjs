import {searchActors} from './apify-inputs.mjs';
import {BudgetError,hash} from '../budget/ledger.mjs';
import {researchUrl,researchHost} from './research-url.mjs';
import {arr,obj,str} from './sequential-contracts.mjs';
import {assertSchema} from './schema.mjs';
import {managedSections} from './managed-report.mjs';
import {marketMeasureInstruction,marketMeasureMatchesScope,marketMeasureNeed,verifyMarketMeasures} from './scoped-market.mjs';
import {salesMetricName,salesTaskSectionTitle} from './sales-research-labels.mjs';
import {SourcePlanValidationError} from './source-plan.mjs';
import {isReadEvidence} from './research-content.mjs';
import {supportsBuyerDemand} from './scoped-findings.mjs';
import {comparisonCanStart,comparisonFields,comparisonReferenceVerified,productComparisonPlanInstruction,productComparisonReviewInstruction,qualifyProductPeers} from './product-comparison.mjs';
import {buyerNeed,buyerDimensions,buyerPlanInstruction,buyerReviewInstruction,buyerProcessDecision,buyerProcurementRow,verifiedBuyerProcess} from './buyer-procurement.mjs';

const sections=Object.keys(managedSections);
const section=str(100);
const queryActors=new Set([...searchActors,'damilo/google-shopping-apify','harvestapi/linkedin-company-search']);
const text=n=>({...str(n),minLength:1});
const marketMeasuresSchema=arr(obj({proof:str(28),amount:str(32),unit:str(48),year:str(4),category:str(110),passage:str(240)}),4);
const number=(min,max)=>({type:'integer',minimum:min,maximum:max});
const understandingSchema=obj({understanding:text(2200)});
const brandSchema=obj({understanding:text(2200),pages:arr(text(2048),6),
 searches:arr(obj({query:text(340),tool:{type:'string',enum:['tavily','gemini']},limit:number(1,6)}),4)});
const orderedBrandSchema=obj({...brandSchema.properties,pages:arr(text(2048),1),searches:arr(brandSchema.properties.searches.items,1)});
const needSchema=obj({id:text(20),section,target:text(150),market:text(100),metric:text(180),period:str(80),
 expected:text(240),quantity:number(1,12),query:text(340),country:str(2),language:str(2),
 first:{type:'string',enum:['tavily','gemini','both']},since:str(10)});
const planSchema=obj({needs:arr(needSchema,32)});
const orderedNeedSchema=obj({...needSchema.properties,first:{type:'string',enum:['tavily','gemini']}});
const orderedPlanSchema=obj({needs:arr(orderedNeedSchema,planSchema.properties.needs.maxItems)});
const factSchema=obj({proof:text(12),quote:str(420),item:text(180)});
const workerSchema=obj({results:arr(obj({id:text(20),facts:arr(factSchema,12),nextQuery:str(340)}),6)});
const evidenceReviewSchema=obj({decisions:arr(obj({id:text(20),sufficient:{type:'boolean'},proofs:arr(text(28),8),read:str(28),nextQuery:str(340)}),3)});
const commandSchema=obj({id:text(20),tool:text(90),query:str(340),url:str(2048),mode:{type:'string',enum:['default','posts','profile','reviews','engagement']},limit:number(1,12)});
const reviewSchema=obj({approve:{type:'boolean'},newNeeds:arr(needSchema,12),
 decisions:arr(obj({id:text(20),sufficient:{type:'boolean'},proofs:arr(text(28),24)}),48),commands:arr(commandSchema,16),peers:arr(obj({name:text(100),url:text(2048),product:text(160),market:text(110),priceBand:str(110),channel:str(110)}),10)});
const orderedReviewSchema=obj({...reviewSchema.properties,newNeeds:arr(orderedNeedSchema,12),commands:arr(commandSchema,1)});
const targetedReviewSchema=obj({...orderedReviewSchema.properties,peers:arr(obj({
 ...reviewSchema.properties.peers.items.properties,relationship:{type:'string',enum:['direct','candidate','related']}
}),10)});
const {section:reportSection,target,market,country,language,...measurementFields}=orderedNeedSchema.properties;
const measurementScope={section:reportSection,target,market,country,language};
const measurementSchema=obj(measurementFields);
const withTaskTitles=(schema,key)=>obj({...schema.properties,[key]:arr(obj({
 ...schema.properties[key].items.properties,sectionTitle:text(100)
}),schema.properties[key].maxItems)});
const withProductScope=(schema,key)=>obj({...schema.properties,[key]:arr(obj({
 ...schema.properties[key].items.properties,comparisonProduct:str(100),comparisonRole:{type:'string',enum:['none','reference','rivals']}
}),schema.properties[key].maxItems)});
const withBuyerScope=(schema,key)=>obj({...schema.properties,[key]:arr(obj({
 ...schema.properties[key].items.properties,buyerSegment:str(100),buyerSourceSegment:str(100),buyingDimension:{type:'string',enum:['none',...buyerDimensions]}
}),schema.properties[key].maxItems)});
const withBuyerProof=schema=>obj({...schema.properties,decisions:arr(obj({
 ...schema.properties.decisions.items.properties,buyerProcess:obj({proof:str(28),segment:str(100),market:str(80),value:str(120),passage:str(300)})
}),schema.properties.decisions.maxItems)});
const offerFields=arr(obj({field:{type:'string',enum:Object.keys(comparisonFields)},value:text(120),proof:text(28)}),7);
const withProductPeers=schema=>obj({...schema.properties,peers:arr(obj({
 ...schema.properties.peers.items.properties,productMatch:obj({referenceProof:str(28),candidateProof:str(28),referenceClass:str(110),candidateClass:str(110),
  referenceFields:offerFields,candidateFields:offerFields})
}),schema.properties.peers.maxItems)});
const withMeasurementGroups=(schema,key)=>{
 const {maxItems,items}=schema.properties[key];
 const title=items.properties.sectionTitle;
 const {comparisonProduct,comparisonRole,buyerSegment,buyerSourceSegment,buyingDimension}=items.properties;
 const measurements=obj({...measurementSchema.properties,...(comparisonProduct?{comparisonProduct,comparisonRole}:{}),
  ...(buyerSegment?{buyerSegment,buyerSourceSegment,buyingDimension}:{})});
 return obj({...schema.properties,[key]:arr(obj({...measurementScope,...(title?{sectionTitle:title}:{}),measurements:arr(measurements,maxItems)}),maxItems)});
};
const measurementInstruction='İhtiyaçları bölüm, hedef, pazar ve dile göre gruplandırabilirsin. Her measurements satırı tek ölçüm veya tek somut karar sorusudur. Bir ölçümün sonucu diğerini doğrulamıyorsa ayrı kimlik, sorgu, beklenen kanıt, dönem ve örneklem ver. Pazar büyüklüğü, büyüme ve eczane kanalının payı ayrı ölçümlerdir. Instagram takipçi sayısı, paylaşım sıklığı ve etkileşim de ayrı ölçümlerdir. Geçerli bir ölçümün birimi, dönemi ve kapsamı o ölçümün parçasıdır. Aynı kararın birbirine bağlı doğrulamalarını tek soruda tutabilirsin. Örneğin iki fiyatın aynı ürün varyantına ait olduğunu doğrulamak tek kıyas kararıdır. Bir sonraki iş rakibin kimliğine bağlıysa önce kimliği doğrula, ardından gerekli fiyat veya sosyal medya ölçümlerini ayrı işler olarak aç.';
const taskTitleInstruction='sectionTitle görevin satış ekranındaki başlığıdır. Araştırılan konuyu anlaşılır ve somut adlandır. İlgisiz ölçümleri aynı section kodunda toplama. Mevcut bir başlıkla tam eşleşme gerekmiyorsa görevin gerçek konusu için kısa bir başlık yaz. Genel “Araştırma konusu” etiketini ve sadece teknik kodu kullanma. metric alanında ölçümün ekranda görülecek adını yaz.';
const withMarketMeasures=schema=>obj({...schema.properties,decisions:arr(obj({
 ...schema.properties.decisions.items.properties,marketMeasures:marketMeasuresSchema
}),schema.properties.decisions.maxItems)});
const compact=s=>String(s||'').replace(/\s+/g,' ').trim();
const uniqueBy=(rows,key)=>[...new Map(rows.map(row=>[key(row),row])).values()];
const siteLinks=s=>[...(s.technicalSignals?.identityLinks||[]),...(s.technicalSignals?.navigation||[])];
const comparisonNeed=need=>/rakip|rekabet|competit/iu.test([need.section,need.sectionTitle].filter(Boolean).join(' '));
const quantitativeMarketNeed=(need,counts)=>!buyerNeed(need)&&marketMeasureNeed(need,counts);
const peerHosts=(peers,website,targeted=false)=>new Set(peers.filter(p=>!targeted||p.relationship==='direct')
 .map(p=>researchHost(p.url)).filter(host=>host&&host!==researchHost(website)));
const publisherRead=fact=>!['search-snippet','html-signals'].includes(fact.method)&&!fact.metadataOnly;
const readEvidenceInstruction='Arama alıntısı ve sayfa meta verisi yalnız kaynak bulmak içindir. proof olarak yalnız doğrudan okunmuş sayfa, belge veya platform kaydındaki ilgili özgün metni seç. İstenen ürün/varyantı ve hedef coğrafyayı karşılaştır. Metrik gerektiriyorsa veri dönemi ile yayın ve erişim tarihini ayır; ölçüm birimini doğrula. Fiyatta para birimi ve satış birimini, dozda miktar ve formu, mevzuatta yetkili kurum, yürürlük tarihi ve geçerli coğrafyayı, sosyal veride hesap, örneklem ve dönemi kontrol et. Yalnız gerçekten desteklenen kısmın kanıtını seç; kapsamı belirsiz ihtiyaç açık kalır. Sayfa henüz okunmadıysa ilgili gözlemlenmiş URL’yi read için seç.';
function reviewProofs(ids,sources,readEvidenceOnly){
 const byId=new Map(sources.filter(f=>!f.metadataOnly).map(f=>[f.id,f]));
 const selected=[...new Set(ids)].map(id=>byId.get(id)).filter(Boolean);
 return {
  proofs:selected.filter(f=>!readEvidenceOnly||isReadEvidence(f)).map(f=>f.id),
  ...(readEvidenceOnly?{unread:selected.find(f=>f.method==='search-snippet')?.url}:{})
 };
}
const commandSignature=c=>hash([c.id,c.tool,compact(c.query).toLocaleLowerCase('tr'),researchUrl(c.url),c.mode,c.limit]);
const defaultTools=['tavily','gemini'];
const defaultConcurrency=3;
const errors=new Set(['budget_limit','budget_pending','budget_uncertain','input_budget','not_configured','model_budget','fx_limit','fx_unavailable','tariff_expired','quota','incomplete','invalid_report','token_count','model_deadline','claude_spend_limit','cancelled']);
async function attempt(run){
 try{return {value:await run()};}
 catch(error){
  if(error instanceof BudgetError||errors.has(error.code)||['AbortError','TimeoutError'].includes(error.name)||error instanceof TypeError&&error.message==='fetch failed')
   return {issue:error.code||'provider_timeout',providerStatus:error.providerStatus};
  throw error;
 }
}
const controllerOptions={compactReview:true,lowEffort:true,generationTimeoutMs:34000};
async function ask(providers,stage,request,schema,maxOutputTokens,options={}){
 const manager=providers.modelHandoff?providers.manager:providers.claudeManager||providers.manager;
 const result=await attempt(()=>manager(stage,request,schema,{
  ...controllerOptions,maxOutputTokens,minimumOutputTokens:Math.ceil(maxOutputTokens*.50),signal:providers.executionSignal,...options
 }));
 return result.value?.data?{value:result.value.data}:result;
}

function normalizeNeeds(rows,schema,useMeasurements){
 if(!Array.isArray(rows))return rows;
 const {items,maxItems}=schema;
 const needs=rows.flatMap(row=>{
  if(!row||typeof row!=='object')return [];
  let candidates=[row];
  if(useMeasurements&&Object.hasOwn(row,'measurements')){
   if(!Array.isArray(row.measurements))return [];
   const scope=Object.fromEntries(Object.keys(measurementScope).map(key=>[key,row[key]]));
   if(items.properties.sectionTitle)scope.sectionTitle=row.sectionTitle;
   candidates=row.measurements.filter(m=>m&&typeof m==='object').map(m=>({...m,...scope}));
  }
  return candidates.flatMap(need=>{
   const fields=Object.fromEntries(Object.entries(items.properties).map(([key,field])=>{
    const value=key==='sectionTitle'?salesTaskSectionTitle(need.section,need.sectionTitle,salesMetricName(need)):
     key==='comparisonProduct'?need.comparisonProduct||'':key==='comparisonRole'?need.comparisonRole||'none':
     key==='buyerSegment'||key==='buyerSourceSegment'?need[key]||'':key==='buyingDimension'?need.buyingDimension||'none':need[key];
    if(field.type==='string'&&typeof value==='string')return [key,value.trim().slice(0,field.maxLength).toWellFormed()];
    return [key,value];
   }));
   try{assertSchema(fields,items);return [fields];}catch{return [];}
  });
 });
 if(!needs.length&&rows.length)throw new BudgetError('model_output_invalid','Araştırma emri doğrulanamadı.');
 return (useMeasurements?uniqueBy(needs,n=>n.id):needs).slice(0,maxItems);
}

export async function understandScopedBrand({brief,packet,providers,prior,readPages,final=false}){
 const brand={name:brief.brandName,website:brief.website};
 const ordered=providers.managedBudgetVersion>=12;
 const targeted=providers.managedBudgetVersion>=14;
 const observed=new Set(packet.sources.flatMap(s=>[s.finalUrl||s.url,...(targeted?siteLinks(s):s.technicalSignals?.navigation||[]).map(l=>l.url)]).map(researchUrl).filter(Boolean));
 const lookedUp=new Set(prior?.lookedUp||[]),visited=new Set(prior?.visited||packet.sources.map(s=>researchUrl(s.finalUrl||s.url)));
 const hints=[...(prior?.hints||[])];
 if(targeted)for(const hint of hints)observed.add(hint.url);
 const lookupReceipts=[...(prior?.lookupReceipts||[])];
 const readReceipts=[...(prior?.readReceipts||[])];
 if(prior){
  const targets=(prior.value?.pages||[]).map(researchUrl).filter(url=>observed.has(url)&&!visited.has(url));
  const searches=prior.value?.searches||[];
  for(const {query,tool,limit} of ordered?searches.slice(0,targets.length?0:1):searches){
   const key=hash([tool,query,limit]);
   if(lookedUp.has(key))continue;
   lookedUp.add(key);
   const search=await attempt(()=>tool==='gemini'
    ?providers.searchGemini?.({query,quantity:limit,target:brand.name,metric:'Markanın kimliği, ürün grubu ve faaliyet pazarı'},{maxResults:limit})
    :providers.search(query,{depth:'basic',maxResults:limit}));
   if(ordered)lookupReceipts.push({query,tool,issue:search.issue||(!search.value?.results?.length?'no_results':undefined)});
   for(const row of (search.value?.results||[]).slice(0,limit)){
    const url=researchUrl(row.url);
    if(!url||visited.has(url))continue;
    if(!targeted)targets.push(url);
    hints.push({url,title:row.title});
   }
   if(targeted){
    const candidates=hints.filter(h=>!visited.has(h.url));
    const identity=candidates.find(h=>/\/(?:about|contact|iletisim|kurumsal|hakkimizda|production)(?:[-/]|$)/i.test(h.url));
    if(identity||candidates[0])targets.push((identity||candidates[0]).url);
   }
  }
  if(!targets.length&&lookedUp.size===(prior.lookedUp||[]).length)return {...prior,packet,done:true};
  const additions=[];
  for(const url of new Set(targets)){
   visited.add(url);
   const answer=await attempt(()=>readPages([url]));
   additions.push(...(answer.value?.sources||[]));
   if(targeted)readReceipts.push({url,status:answer.issue||answer.value?.unavailable?.find(u=>u.url===url)?.reason||
    (answer.value?.sources?.some(s=>!s.metadataOnly)?'read':'no_readable_text')});
  }
  packet={...packet,sources:uniqueBy([...packet.sources,...additions],s=>s.finalUrl||s.url)
   .map((source,index)=>({...source,id:'ev'+(index+1)}))};
 }
 const sources=packet.sources.filter(s=>!s.metadataOnly).map(s=>({url:s.finalUrl||s.url,title:s.title,
  excerpts:s.excerpts.slice(0,3).map(e=>e.text.slice(0,520)),
  links:uniqueBy(targeted?siteLinks(s):s.technicalSignals?.navigation||[],l=>l.url).map(({url,label})=>({url,label}))}));
 const result=await ask(providers,'bhs-scoped-brand',{brand,sources,hints,priorUnderstanding:prior?.value?.understanding,
  ...(ordered?{lookupReceipts,final}:{}),...(targeted?{readReceipts}:{}),instruction:
  'Birinci adım. Önce markayı tespit et ve anla. Ne sattığını, ürün veya hizmet gruplarını, kurumsal kimliğini, gelir modelini, ölçeğini, faaliyet pazarını ve sektörünü birlikte kavra. Önemli gördüğün diğer bilgileri kendin belirle. Mevcut bilgiler yeterliyse anlayışını özetle ve pages ile searches boş kalsın. Bilgi eksikse yalnız doğrudan gerekli, gördüğün bağlantıları pages alanında veya Gemini/Tavily için marka kimliğine yönelik kısa sorguyu searches alanında seç. Belirsizlikleri belirt. Kart briefi ve teklif bu adımdan sonra gelir.'+
  (ordered?' Tek seferde yalnız bir sayfa ya da tek, somut kimlik sorusu için bir araç seç. Önceki çağrıların sonuçlarını dikkate al. Bir araç hata verdiyse ve bilgi gerekliyse aynı dar soruyu uygun diğer araca kendin ver. final doğruysa ek istek gönderme ve belirsizlikleri yazarak marka anlayışını tamamla.':'')+
  (targeted?' Kimlik ve gelir modeli için resmi iletişim/kurumsal sayfaları karşılaştır. Alan adları farklıysa ticari unvanı ve adresi kontrol et. Aynı unvan ve adresi doğrulayan kurumsal siteyi üretim ve pazar araştırmasına dahil et. Doğrudan satış, üretim, B2B ve ihracat kanallarını kendi kaynaklarına göre değerlendir. Marka hesabı bağlantısını takipçi verisi olarak kullanma. hints içinde daha önce okunmamış sayfaları da pages alanında seçebilirsin.':'')},ordered?orderedBrandSchema:brandSchema,1400);
 const value=result.value||prior?.value;
 return {...result,value,packet,hints,lookedUp:[...lookedUp],visited:[...visited],...(ordered?{lookupReceipts}:{}),...(targeted?{readReceipts}:{}),
  done:final||!result.value||!result.value.pages?.length&&!result.value.searches?.length};
}

export async function understandScopedBrief({brief,identity,providers,compactRetry=false}){
 if(!identity)return {issue:'brand_understanding_unavailable'};
 const {brandName,website,...card}=brief;
 return ask(providers,compactRetry?'bhs-scoped-brief-compact':'bhs-scoped-brief',{identity,card,instruction:
  'İkinci adım. Şimdi BHS öncesinde karta girilen briefi oku. Birinci adımda oluşturduğun marka anlayışını bağlam olarak kullan. Markanın ne istediğini, başarıdan ne anladığını ve teklifin hangi işleri kapsaması gerektiğini açıkla. Önemli gördüğün koşulları kendin belirle. Bu adımda araştırma planı ya da teşhis yazma.'+
  (compactRetry?' Hedefi ve teklif kapsamını kısa ve eksiksiz bir paragrafta belirt.':'')},understandingSchema,compactRetry?850:1500);
}

export async function planScopedResearch({brief,identity,briefUnderstanding,asOf,providers,packet}){
 if(!identity||!briefUnderstanding)return {needs:[],issue:'brief_understanding_unavailable'};
 const guarded=providers.managedBudgetVersion>=12;
 const useMeasurements=providers.managedBudgetVersion>=19;
 const taskReporting=providers.managedBudgetVersion>=22;
 const baseContract=guarded?orderedPlanSchema:planSchema;
 const contract=taskReporting?withBuyerScope(withProductScope(withTaskTitles(baseContract,'needs'),'needs'),'needs'):baseContract;
 const request={brand:brief.brandName,identity,briefUnderstanding,asOf,instruction:
  'Üçüncü adım. Marka anlayışı ve brief değerlendirmesinden araştırma planını çıkar. Hedef Avrupa pazarına girmekse gümrük süreçleri, aktif distribütörler ve pazar doygunluğu gibi karar sorularını seç. Hedef ciro artırmaksa fiyat, rakip satışı, müşteri memnuniyeti ve erişilebilir pazarlama ve satış verimine odaklan. Bunlar örnektir. Konu ve görev sayısına sen karar ver. İlk gönderimde teklif kararını en çok değiştiren ve doğrudan çalışılabilir ihtiyaçlara öncelik ver. Bir önceki aramanın sonucuna bağlı sonraki işleri sonuç geldiğinde belirle. Örneğin önce doğru rakipleri bul, sonra onların metriklerini iste. Her işe tek bir net emir yaz. Hedefi, platformu, dönemi, metriği ve gereken en küçük örneklemi ver. On aktif distribütör isteniyorsa quantity 10. Instagram son bir ay isteniyorsa since alanı YYYY-MM-DD, quantity gerekli gönderi sayısı olsun. Gerekli olmayan tarih boş olsun. Pazar ve dili sorguda koru. Bölüm kodları rapor aktarımı içindir.'+
  (guarded?'':' Gemini, Tavily veya ikisini seç. İkisini yalnız kanıt türleri birbirini tamamlayacaksa seç.')};
 if(guarded)request.instruction+=' Görevleri yapılma sırasına koy. Bir görev, bir metrik veya tek somut karar sorusu içersin. Her görev için ilk aracı tek başına seç. Başlangıçta yalnız sonucu başka bir sorguya bağlı olmayan, hemen çalıştırılabilecek görevler ver. Sonuç gelince devamını belirle. Bölüm veya bulgu kotası yoktur.';
 if(providers.managedBudgetVersion>=14){
  request.publisherLinks=uniqueBy((packet?.sources||[]).filter(s=>researchHost(s.finalUrl||s.url)===researchHost(brief.website))
   .flatMap(s=>s.technicalSignals?.identityLinks||[]),l=>l.url);
  request.instruction+=' Yayıncıdan gelen bağlantılar varsa ilgili hesabı ve kuruluşu doğrudan hedefle. Birden çok platform ve ölçümü tek genel sorguda toplama. Her işi somut bir metrik veya doğrulama olarak yaz.';
 }
 if(providers.managedBudgetVersion>=15)request.instruction+=' İlk planda teklif kararını etkileyen her bağımsız başlık için bir açılış sorgusu yaz ve başlıkları karar önceliğine göre sırala. Bu sorgular ilk turda çalıştırılabilir olmalı. Aynı başlık için farklı kaynak arama veya bir sonuca bağlı ayrıntı isteme işlerini, ilk kanıtlar geldikten sonra belirle.';
 if(useMeasurements)request.instruction+=' '+measurementInstruction;
 if(taskReporting){
  request.instruction+=' '+taskTitleInstruction+' '+productComparisonPlanInstruction+' '+buyerPlanInstruction;
  request.commercialBrief={goals:brief.goals,needs:brief.needs,services:brief.services,meetingNotes:brief.meetingNotes};
 }
 const normalizeData=data=>Array.isArray(data?.needs)?{needs:normalizeNeeds(data.needs,contract.properties.needs,useMeasurements)}:data;
 const outputContract=useMeasurements?withMeasurementGroups(contract,'needs'):contract;
 const options={normalizeData,responseSchema:contract};
 let result=await ask(providers,'bhs-scoped-plan',request,outputContract,3800,options);
 if(['incomplete','invalid_report','model_output_invalid'].includes(result.issue)||guarded&&(!result.value?.needs?.length))
  result=await ask(providers,'bhs-scoped-plan-compact',{...request,instruction:request.instruction+' Yalnız hemen başlayacağın en öncelikli ilk işleri kısa ifadelerle yaz. Tüm olası sorguları listeleme. Tek bir tamamlanmış JSON döndür.'},outputContract,guarded?2400:3500,{...options,plainJson:true});
 const needs=uniqueBy(result.value?.needs||[],n=>n.id);
 const issue=result.issue||(guarded&&!needs.length?'research_plan_empty':undefined);
 return {needs,...(issue?{issue}:{})};
}

function evidenceRows(result,limit,method){
 return (result||[]).flatMap(row=>{
  const url=researchUrl(row.finalUrl||row.url);
  const content=compact(row.text||row.content).slice(0,950);
  return url&&content.length>=24?[{url,title:compact(row.title).slice(0,150),content,method,...(row.metadataOnly?{metadataOnly:true}:{}),
   ...(row.retrievedAt?{retrievedAt:row.retrievedAt}:{})}]:[];
 }).slice(0,limit);
}

async function seekDefault(needs,providers,readPages){
 const searches=await Promise.all(needs.map(async need=>{
  const options={depth:'basic',maxResults:need.quantity,countryCode:need.country.toUpperCase(),language:need.language,since:need.since};
  const calls=[];
  if(need.first!=='gemini')calls.push(['tavily',()=>providers.search(need.query,options)]);
  if(need.first==='gemini'||need.first==='both')calls.push(['gemini',()=>{
   if(!providers.searchGemini)throw new BudgetError('not_configured','Gemini araması yapılandırılmadı.');
   return providers.searchGemini(need,options);
  }]);
  const attempts=await Promise.all(calls.map(async ([tool,run])=>({tool,...await attempt(run)})));
  const rows=attempts.filter(({tool})=>!(providers.managedBudgetVersion>=13)||tool==='tavily')
   .flatMap(({value})=>evidenceRows(value?.results,need.quantity,'search-snippet'));
  const urls=[...new Set(attempts.flatMap(({value})=>(value?.results||[]).map(row=>researchUrl(row.url)).filter(Boolean)))];
  // Tavily already provides excerpts. Resolve grounded publisher links, whose
  // Gemini-generated summaries are discovery hints rather than source text.
  const toRead=[...new Set(attempts.filter(({tool})=>tool==='gemini').flatMap(({value})=>
   (value?.results||[]).map(row=>researchUrl(row.url)).filter(Boolean)))];
  const {rows:read,sourceReads}=await readSearchEvidence(toRead,readPages,providers.managedBudgetVersion>=14?need:undefined);
  return {need,rows:uniqueBy([...read,...rows],row=>row.url+' '+row.content),urls,sourceReads,
   attempts:attempts.map(({tool,issue,providerStatus})=>({tool,issue,providerStatus}))};
 }));
 return extractFacts(searches,providers);
}

async function readSearchEvidence(urls,readPages,need){
 const focus=need?[...new Set([need.metric,need.target,need.period,need.market].join(' ').toLocaleLowerCase('tr').match(/[\p{L}\p{N}-]{4,}/gu)||[])]
  .filter(word=>!['için','kendi','olan','veya','yapan','gösteren','sonrası','bilinen'].includes(word)).slice(0,14):undefined;
 const sources=[];
 for(let i=0;i<urls.length;i+=5){
  const read=await attempt(()=>readPages(urls.slice(i,i+5),focus));
  sources.push(...(read.value?.sources||[]));
 }
 const rows=need?sources.flatMap(source=>{
  const wordScore=text=>focus.filter(word=>text.toLocaleLowerCase('tr').includes(word)).length;
  const slices=(source.excerpts||[]).flatMap(({text})=>{
   const rows=[];for(let i=0;i<text.length;i+=480)rows.push(text.slice(i,i+950));return rows;
  }).filter(text=>text.trim().length>=24).sort((a,b)=>wordScore(b)-wordScore(a));
  return evidenceRows(slices.slice(0,2).map(text=>({...source,text})),2,source.method||'extracted');
 }):evidenceRows(sources.map(source=>({...source,text:source.excerpts?.map(e=>e.text).join(' ')})),sources.length,'extracted');
 const readable=new Set(rows.filter(isReadEvidence).map(row=>row.url));
 const readUrls=new Set(sources.filter(source=>readable.has(researchUrl(source.finalUrl||source.url)))
  .flatMap(source=>[researchUrl(source.url),researchUrl(source.finalUrl)]).filter(Boolean));
 return {rows,sourceReads:urls.map(url=>({url,readable:readUrls.has(url)}))};
}

async function extractFacts(searches,providers,{excerptsOnly=false}={}){
 const inputs=searches.map(search=>({...search,rows:search.rows.map((row,i)=>({...row,proof:'p'+(i+1)}))}));
 // The controller reviews these publisher excerpts itself. Gemini-grounded
 // searches and specialist datasets still use the extraction worker.
 const withRows=excerptsOnly?[]:inputs.filter(input=>!buyerNeed(input.need)&&input.rows.length&&input.rows.length<=input.need.quantity*2&&
  !(providers.managedBudgetVersion>=13&&input.attempts?.length===1&&input.attempts[0].tool==='tavily'));
 const worker=providers.managedBudgetVersion>=12&&providers.modelHandoff?providers.worker:providers.geminiWorker||providers.worker;
 const result=withRows.length?await attempt(()=>worker('bhs-scoped-extract',{
  instruction:'Her iş için yalnız talep edilen metriği karşılayan kaynak kimliklerini seç. Bir öğeyi iki kez sayma. Her öğe için ayırt edici ad ve kaynağın proof kimliğini ver. Özgün alıntıyı aynen kopyalayabiliyorsan quote içine yaz, yoksa boş bırak. Eksik veri varsa bir sonraki hedefli aramaya aday ad veya sorgu öner. Harici bilgi ve kaynak URL uydurma.',
  requests:withRows.map(({need,rows})=>({need,sources:rows.map(({proof,url,content})=>({proof,url,content}))}))
 },workerSchema,{maxOutputTokens:1800,minimumOutputTokens:760,compactWorker:true,generationTimeoutMs:28000})):{};
 return inputs.map(({need,rows,issue,attempts=[],urls=[],actorStarted,sourceReads=[]})=>{
  const output=result.value?.data?.results.find(r=>r.id===need.id);
  const separateProvenance=providers.managedBudgetVersion>=20;
  const makeFact=(source,quote,item)=>({id:'q'+hash([need.id,source.url,quote,item,...(separateProvenance?[source.method]:[])]).slice(0,18),quote,item,url:source.url,title:source.title,method:source.method,
   ...(source.metadataOnly?{metadataOnly:true}:{}),...(separateProvenance&&source.retrievedAt?{retrievedAt:source.retrievedAt}:{})});
  const extracted=(output?.facts||[]).flatMap(fact=>{
   const source=rows.find(r=>r.proof===fact.proof);
   const quote=compact(fact.quote),item=compact(fact.item);
   if(!source||!item)return [];
   return [makeFact(source,quote.length>=24&&source.content.includes(quote)?quote:source.content.slice(0,420),item)];
  });
  const candidates=rows.map(source=>({...makeFact(source,source.content,source.title||source.url),preliminary:true}));
  const facts=uniqueBy([...candidates,...extracted],row=>row.id+' '+row.item);
  return {id:need.id,query:need.query,facts,urls:[...new Set([...urls,...rows.map(r=>r.url)])],attempts,nextQuery:output?.nextQuery||'',
   ...(providers.managedBudgetVersion>=22&&sourceReads.length?{sourceReads}:{}),
   ...(actorStarted?{actorStarted:true}:{}),
   issues:[issue,result.issue,...attempts.map(a=>a.issue)].filter(Boolean)};
 });
}

export async function runScopedDefaults(needs,providers,readPages){
 // Group independent tasks while bounding provider concurrency.
 const results=[];
 for(let i=0;i<needs.length;i+=defaultConcurrency)results.push(...await seekDefault(needs.slice(i,i+defaultConcurrency),providers,readPages));
 return results;
}

export function scopedResearchClosed(round,guarded=false){
 if(!guarded)return Boolean(round.approved||round.closed);
 return round.approved===true&&round.stopReason==='evidence_confirmed'||
  round.closed===true&&['research_budget_exhausted','research_tools_unavailable','research_source_plan_invalid','research_engine_failure'].includes(round.stopReason);
}

const defaultDenied=(receipts,tool)=>receipts.some(r=>r.attempts?.some(a=>a.tool===tool&&
 (['not_configured','tariff_expired','fx_limit'].includes(a.issue)||[401,402,403,404,429,432,433,434].includes(a.providerStatus))));

function defaultBlocker(tool,{capacity,receipts,readerBlocked}){
 if(tool==='gemini'&&readerBlocked)return 'source_reader_unavailable';
 if(defaultDenied(receipts,tool))return 'provider_unavailable';
 if(capacity?.configuredDefaults&&!capacity.configuredDefaults.includes(tool))return 'not_configured';
 if(capacity&&!capacity.defaults.includes(tool))return 'budget_limit';
}

function priorSearchAttempt(receipts,id,query,tool){
 const key=compact(query).toLocaleLowerCase('tr');
 return receipts.filter(r=>r.id===id&&compact(r.query||query).toLocaleLowerCase('tr')===key)
  .flatMap(r=>r.attempts||[]).findLast(a=>a.tool===tool&&a.issue!=='budget_limit');
}

function defaultReceipt(receipt,requestedTool,reason){
 const selectedTool=receipt.attempts[0]?.tool;
 return {...receipt,defaultAttempt:true,...(reason&&selectedTool&&requestedTool!==selectedTool?
  {toolRouting:{requestedTool,selectedTool,reason}}:{})};
}

async function openingSearchPlan({plan,receipts,providers,readerBlocked,dispatchable}){
 // Claude supplies the topics, priority and exact query. Each original topic
 // gets its first funded search before the controller can deepen another topic.
 const topics=new Map();
 for(const need of plan.needs){
  if(dispatchable&&!dispatchable(need))continue;
  const topic=compact(need.section).toLocaleLowerCase('tr');
  if(!topics.has(topic))topics.set(topic,need);
 }
 const attemptsByNeed=new Map();
 for(const receipt of receipts){
  if(!receipt.defaultAttempt)continue;
  attemptsByNeed.set(receipt.id,[...(attemptsByNeed.get(receipt.id)||[]),...(receipt.attempts||[])]);
 }
 const pending=[...topics.values()].filter(need=>!(attemptsByNeed.get(need.id)||[]).some(a=>!a.issue));
 if(!pending.length)return;
 const capacity=(await attempt(()=>providers.researchCapacity?.({includeActors:false}))).value;
 if(!capacity?.quotes)return;
 const {remainingKurus,capKurus,quotes}=capacity;
 const available=defaultTools.filter(tool=>!defaultBlocker(tool,{capacity,receipts,readerBlocked}));
 const queues=pending.map(need=>{
  const tried=(attemptsByNeed.get(need.id)||[]).map(a=>a.tool);
  const tools=[need.first,...defaultTools.filter(t=>t!==need.first)].filter(t=>available.includes(t)&&!tried.includes(t));
  return {need,tools,min:tools.length?Math.min(...tools.map(t=>quotes[t])):0};
 }).filter(q=>q.tools.length);
 if(!queues.length)return;
 const nextInfrastructure=queues.length>1?providers.infrastructureOffsetKurus||0:0;
 const floor=queues.reduce((sum,q)=>sum+q.min,nextInfrastructure);
 const first=floor<=remainingKurus?queues[0]:queues.reduce((best,q)=>q.min<best.min?q:best);
 const rest=queues.filter(q=>q!==first);
 const reserve=floor-first.min;
 const tool=first.tools.find(t=>quotes[t]<=Math.max(first.min,remainingKurus-reserve));
 const selected=[{...first.need,first:tool}];
 let used=quotes[tool];
 if(tool==='tavily'){
  for(const q of rest){
   // Keep Gemini reads out of the batch. Cheap independent web searches can
   // share one worker reservation and still use the atomic per-call ledger.
   if(q.tools[0]!=='tavily'||selected.length>=defaultConcurrency||used+quotes.tavily>remainingKurus)break;
   selected.push({...q.need,first:'tavily'});
   used+=quotes.tavily;
  }
 }
 const pool=tool==='gemini'&&rest.length&&providers.withCeiling?
  providers.withCeiling(capKurus-Math.min(reserve,remainingKurus-used)):providers;
 const routing=Object.fromEntries(selected.flatMap(need=>{
  const planned=topics.get(compact(need.section).toLocaleLowerCase('tr')).first;
  if(!defaultTools.includes(planned)||planned===need.first)return [];
  const prior=priorSearchAttempt(receipts,need.id,need.query,planned);
  return [[need.id,{requested:planned,reason:defaultBlocker(planned,{capacity,receipts,readerBlocked})||prior?.issue||'opening_budget_reserved'}]];
 }));
 return {selected,pool,routing,searchFloor:floor-nextInfrastructure};
}

// An empty or unusable controller response is not a budget decision. Reuse
// Claude's open need and focused query while an independent search still fits.
async function keepResearchOpen({needs,receipts,providers,readPages,issue,ordered=false,allowDispatch=true,targeted=false,nextQueries,readerBlocked=false,readerWasBlocked=false,focus}){
 const capacity=(await attempt(()=>providers.researchCapacity?.())).value;
 const blocked={closed:true,stopReason:'research_source_plan_invalid',issue:'source_plan_invalid'};
 if(!capacity)return readerBlocked&&allowDispatch?blocked:{closed:false,issue:issue||'research_capacity_unknown'};
 const defaults=capacity.defaults.filter(tool=>!defaultBlocker(tool,{capacity,receipts,readerBlocked}));
 if(!defaults.length&&!capacity.actors.length){
  const budget=capacity.workerBudgetExhausted||capacity.remainingKurus<=0||
   capacity.configuredDefaults.some(tool=>!defaultDenied(receipts,tool))||capacity.configuredActors?.length;
  if(readerBlocked)return blocked;
  const stopReason=budget?'research_budget_exhausted':'research_tools_unavailable';
  return {closed:true,stopReason,issue:stopReason};
 }
 const orderedNeeds=targeted?[...needs.filter(n=>!receipts.some(r=>r.id===n.id&&r.defaultAttempt)),...needs.filter(n=>receipts.some(r=>r.id===n.id&&r.defaultAttempt))]:needs;
 const focusIndex=ordered&&targeted?orderedNeeds.findIndex(need=>need.id===focus?.id):-1;
 if(focusIndex>0)orderedNeeds.unshift(...orderedNeeds.splice(focusIndex,1));
 for(const need of allowDispatch?orderedNeeds:[]){
  const saved=receipts.filter(r=>r.id===need.id);
  const focused=focus?.id===need.id?focus:undefined;
  const command=focused?.command;
  const previous=focused?.attempts?.findLast(a=>defaultTools.includes(a.tool));
  const requested=command?.tool||previous?.tool||need.first;
  const queries=uniqueBy([command?.query,nextQueries?.get(need.id)?.nextQuery,...(ordered?[]:saved.map(r=>r.nextQuery).reverse()),need.query].filter(Boolean),query=>compact(query).toLocaleLowerCase('tr'));
  const preferred=defaults.includes(requested)?[requested,...defaults.filter(tool=>tool!==requested)]:defaults;
  const tools=ordered&&!targeted?defaults.filter(tool=>tool===need.first):preferred;
  for(const query of queries)for(const tool of tools){
   if(priorSearchAttempt(saved,need.id,query,tool))continue;
   const prior=priorSearchAttempt(saved,need.id,query,requested);
   const reason=defaultTools.includes(requested)?defaultBlocker(requested,{capacity,receipts,readerBlocked})||prior?.issue||previous?.issue||((prior||previous)?'insufficient_evidence':undefined):undefined;
   const quantity=query===command?.query?command.limit:need.quantity;
   const [result]=await runScopedDefaults([{...need,query,quantity,first:tool}],providers,readPages);
   return {closed:false,issue:issue||'research_needs_open',receipts:[defaultReceipt(result,requested,reason)]};
  }
 }
 if(readerBlocked&&allowDispatch){
  // An actor can still return its own source text. Let the controller see
  // the reader failure before closing if that independent option remains.
  return !readerWasBlocked&&capacity.actors.length?{closed:false,issue:'source_plan_invalid'}:blocked;
 }
 if(targeted&&allowDispatch&&['budget_limit','provider_unavailable','claude_spend_limit','not_configured','input_budget','tariff_expired'].includes(issue)){
  const stopReason=providers.managedBudgetVersion<18&&['budget_limit','input_budget'].includes(issue)?'research_budget_exhausted':'research_tools_unavailable';
  return {closed:true,stopReason,issue};
 }
 return {closed:false,issue:issue||'research_needs_open'};
}

function receiptFacts(receipts,readEvidenceOnly=false){
 const facts=receipts.flatMap(r=>(r.facts||[]).map(f=>({...f,needId:r.id})));
 // The same quote can arrive from search before or after the page read.
 return uniqueBy(readEvidenceOnly?[...facts.filter(f=>!isReadEvidence(f)),...facts.filter(isReadEvidence)]:facts,f=>f.id);
}

async function reviewNewEvidence({needs,facts,checked,seen,rivalHosts,providers,readEvidenceOnly,scopeMarketCounts,qualifyReportFindings,procurementResearch,reserveForFollowingKurus=0}){
 const tasks=needs.map(({id,target,market,metric,period,expected,quantity,buyerSegment,buyerSourceSegment,buyingDimension})=>{
  const saved=facts.filter(f=>f.needId===id);
  const incoming=saved.filter(f=>!seen.has(f.id)).slice(0,8);
  const previous=checked.get(id)?.proofs||[];
  const context=saved.filter(f=>seen.has(f.id)).sort((a,b)=>Number(previous.includes(b.id))-Number(previous.includes(a.id))).slice(0,4);
  const sources=[...incoming,...context].map(({id,url,title,quote,method,metadataOnly,retrievedAt})=>
   ({id,url,title,quote:quote.slice(0,950),method,metadataOnly,...(readEvidenceOnly?{retrievedAt}:{})}));
  return {id,target,market,metric,period,expected,quantity,sources,incoming,
   ...(procurementResearch&&buyerSegment?{buyerSegment,buyerSourceSegment,buyingDimension}:{}),
   previousProofs:previous.filter(proof=>sources.some(f=>f.id===proof))};
 }).filter(task=>task.incoming.length).slice(0,3);
 if(!tasks.length)return {};
 const worker=providers.worker||providers.geminiWorker;
 if(!worker)return {issue:'not_configured'};
 const scopedMarket=providers.managedBudgetVersion>=17&&needs.some(n=>quantitativeMarketNeed(n,scopeMarketCounts)&&tasks.some(t=>t.id===n.id));
 const scopedBuyer=procurementResearch&&tasks.some(buyerNeed);
 const contract=scopedMarket?withMarketMeasures(evidenceReviewSchema):evidenceReviewSchema;
 const result=await attempt(()=>worker('bhs-scoped-evidence-check',{
  tasks:tasks.map(({incoming,...task})=>({...task,newProofs:incoming.map(f=>f.id)})),
  instruction:'Her iş için yeni kaynakları istenen ürün, pazar, dönem ve metrik bakımından denetle. Her iş için bir karar yaz. Önceki geçerli kanıtı koru. Yalnız o işte görülen ilgili kaynak kimliklerini proofs alanına koy. Kısmi kanıtı sakla ve açık bırak. Bir arama alıntısı yalnız rapor adı veya sonuç bağlantısı gösteriyorsa yeterli sayma. Resmî raporun ilgili tablosu, dönemi, birimi ve kapsamı veya ürün sayfasındaki fiyat doğrulanacaksa read alanına açılacak kaynağın kimliğini yaz. İki kanalda fiyat kıyaslanacaksa aynı ürün kodu veya ayırt edilebilir tam varyantı iki gerçek kaynakta eşleştir. Fiyat, para birimi, satış birimi ve dönem bağlamını kontrol et. Pazar, kanal veya eşleşme belirsizse açık bırak. Başka kaynağa ihtiyaç varsa nextQuery alanına aynı iş için tek dar, farklı sorgu yaz. Gerek yoksa read ve nextQuery boş olsun. Kaynak veya olgu uydurma.'+
   (providers.managedBudgetVersion>=19?' Aynı sayfada başka ölçümün bulunması, bu işte talep edilen ölçümü doğrulamaz. sufficient için bu işin beklenen kanıtını kontrol et.':'')+
   (readEvidenceOnly?' '+readEvidenceInstruction:'')+
   (qualifyReportFindings?' Kullanım kılavuzu ve ürün özelliği talebi doğrulamaz. Talep için alıcı davranışı, sipariş, bütçe veya alıcının bildirdiği tercih gibi gözlenmiş kanıt ara.':'')+
   (scopedMarket?' '+marketMeasureInstruction:'')+(scopedBuyer?' '+buyerReviewInstruction:'')
 },scopedBuyer?withBuyerProof(contract):contract,{maxOutputTokens:840,minimumOutputTokens:530,compactWorker:true,compactVerdicts:true,
  reserveForFollowingKurus,generationTimeoutMs:22000,signal:providers.executionSignal}));
 if(!result.value?.data)return {issue:result.issue||'research_clearance_unavailable'};
 const decisions=[];
 for(const task of tasks){
  const row=result.value.data.decisions.find(r=>r.id===task.id);
  if(!row)continue;
  const {proofs,unread}=reviewProofs(row.proofs,task.sources,readEvidenceOnly);
  const read=task.sources.find(f=>f.id===row.read&&!publisherRead(f))?.url||unread;
  const saved=checked.get(task.id);
  const candidate={id:task.id,sufficient:row.sufficient&&proofs.length>0&&!read,proofs,nextQuery:compact(row.nextQuery),...(read?{read}:{})};
  // An incremental slice may add evidence without re-adjudicating an earlier
  // confirmed decision. The controller can revisit it with the full context.
  const need=needs.find(n=>n.id===task.id);
  const decision=scopedBuyer&&buyerNeed(need)?buyerProcessDecision(need,candidate,row.buyerProcess,facts,saved):
   providers.managedBudgetVersion>=17&&quantitativeMarketNeed(need,scopeMarketCounts)?
   marketDecision(need,{...candidate,sufficient:candidate.sufficient||Boolean(saved?.sufficient)},row.marketMeasures,facts,saved,scopeMarketCounts):
   confirmed(need,saved,facts,rivalHosts,readEvidenceOnly,qualifyReportFindings)?{...saved,proofs:[...new Set([...saved.proofs,...proofs])]}:candidate;
  for(const f of task.incoming)seen.add(f.id);
  checked.set(decision.id,decision);
  decisions.push(decision);
 }
 return decisions.length?{decisions}:{issue:'research_clearance_unavailable'};
}

function marketDecision(need,decision,proposed,facts,saved,scopeMarketCounts){
 const proofs=[...new Set([...(saved?.marketMeasures||[]).map(m=>m.proof),...decision.proofs])];
 const marketMeasures=uniqueBy(verifyMarketMeasures(need,[...(saved?.marketMeasures||[]),...(proposed||[])],proofs,facts,scopeMarketCounts),
  row=>JSON.stringify([row.proof,row.amount,row.unit,row.year,row.category]));
 return {...decision,proofs,marketMeasures,sufficient:Boolean(decision.sufficient&&marketMeasures.some(row=>!scopeMarketCounts||marketMeasureMatchesScope(need,row)))};
}

export async function reviewScopedResearch({identity,briefUnderstanding,plan,rounds,providers,brief,packet,readPages:readPublisherPages,last=false,eligibleSections=sections,existing=[],gap=false,acquisition=providers}){
 const guarded=plan.reportOnlyAfterResearch===true&&!gap;
 const ordered=plan.orderedResearch===true&&!gap;
 const targeted=plan.targetedEvidence===true;
 const incremental=ordered&&guarded&&providers.managedBudgetVersion>=16;
 const useMeasurements=providers.managedBudgetVersion>=19;
 const readEvidenceOnly=plan.readEvidenceOnly===true;
 const readerWasBlocked=guarded&&rounds.some(round=>round.sourceReaderIssue==='source_plan_invalid');
 let readerBlocked=readerWasBlocked;
 const readPages=async (...args)=>{
  if(!readerBlocked){
   try{return await readPublisherPages(...args);}
   catch(error){if(!guarded||!(error instanceof SourcePlanValidationError))throw error;readerBlocked=true;}
  }
  return {sources:[]};
 };
 const priorNeeds=uniqueBy([...plan.needs,...rounds.flatMap(round=>round.newNeeds||[])],n=>n.id);
 const receipts=rounds.flatMap(round=>round.receipts||[]);
 let facts=receiptFacts(receipts,readEvidenceOnly);
 const checked=new Map(rounds.flatMap(round=>round.decisions||[]).map(row=>[row.id,row]));
 const dispatchable=need=>buyerNeed(need)||!plan.focusedProductComparison||comparisonCanStart(need,priorNeeds,facts,checked,brief.website,packet);
 const keepOpen=options=>keepResearchOpen({...options,needs:options.needs.filter(dispatchable),readerBlocked,readerWasBlocked});
 const seen=new Set(rounds.flatMap(round=>round.reviewedProofIds||[]));
 const reviewedBefore=new Set(seen);
 const qualifyPeers=(peers,needs=priorNeeds)=>plan.focusedProductComparison?qualifyProductPeers(peers,needs,facts,checked,brief.website,packet):peers;
 let qualifiedPeers=qualifyPeers(rounds.flatMap(r=>r.peers||[]));
 let rivalHosts=plan.qualityReport?peerHosts(qualifiedPeers,brief.website,targeted):undefined;
 const open=need=>!confirmed(need,checked.get(need.id),facts,rivalHosts,readEvidenceOnly,plan.qualifyReportFindings)||
  !buyerNeed(need)&&plan.focusedProductComparison&&(!focusedNeedSupported(need,qualifiedPeers)||!comparisonReferenceVerified(need,priorNeeds,facts,checked,brief.website,packet));
 const inScope=need=>!gap||eligibleSections.includes(need.section);
 const checkNew=(reserveForFollowingKurus,needs=priorNeeds)=>reviewNewEvidence({needs,facts,checked,seen,rivalHosts,providers,readEvidenceOnly,scopeMarketCounts:plan.scopeMarketCounts,qualifyReportFindings:plan.qualifyReportFindings,procurementResearch:plan.procurementResearch,reserveForFollowingKurus});
 const checkBeforeWorkerEnds=async(added,needs)=>{
  if(!incremental||!acquisition.infrastructureOffsetKurus||!added.some(r=>r.facts.length))return {};
  const remaining=(await attempt(()=>acquisition.researchCapacity?.({includeActors:false}))).value?.remainingKurus;
  if(!(remaining<acquisition.infrastructureOffsetKurus))return {};
  facts=receiptFacts([...receipts,...added],readEvidenceOnly);
  return checkNew(0,needs);
 };
 const proofCheckpoint=()=>({
  ...(incremental?{reviewedProofIds:[...seen].filter(id=>!reviewedBefore.has(id))}:{}),
  ...(readerBlocked?{sourceReaderIssue:'source_plan_invalid'}:{})
 });
 if(ordered&&!last&&providers.managedBudgetVersion>=15){
  const openingArgs={plan,receipts,providers:acquisition,readerBlocked,dispatchable};
  const opening=await openingSearchPlan(openingArgs);
  if(opening){
   const results=(await runScopedDefaults(opening.selected,opening.pool,readPages)).map(result=>{
    const route=opening.routing[result.id];
    return defaultReceipt(result,route?.requested,route?.reason);
   });
   let check={};
   if(incremental){
    const combined=[...receipts,...results];
    facts=receiptFacts(combined,readEvidenceOnly);
    // Review in the same metered invocation while retaining the floor for
    // pending opening topics. Deferred proof stays eligible for the next check.
    const pending=await openingSearchPlan({...openingArgs,receipts:combined,readerBlocked});
    check=await checkNew(pending?pending.searchFloor+(acquisition.infrastructureOffsetKurus||0):0);
   }
   return {closed:false,openingSearch:true,receipts:results,...proofCheckpoint(),
    ...(check.decisions?{decisions:check.decisions}:{}),...(check.issue?{evidenceReviewIssue:check.issue}:{})};
  }
 }
 const hasOpen=!last&&priorNeeds.some(n=>open(n)&&inScope(n));
 const capacity=ordered&&hasOpen?(await attempt(()=>acquisition.researchCapacity?.())).value:undefined;
 const actors=hasOpen?(capacity?.actors??(await attempt(()=>acquisition.availableActors?.())).value??[]):[];
 const latest=rounds.at(-1);
 const blocker=tool=>defaultBlocker(tool,{capacity,receipts,readerBlocked});
 const available=tool=>!blocker(tool);
 const followUp=()=>receipts.findLast(r=>r.defaultAttempt&&priorNeeds.some(n=>n.id===r.id&&open(n)));
 const attempted=new Set(rounds.flatMap(r=>r.commandKeys||[]));
 const waitingNeeds=priorNeeds.filter(n=>!receipts.some(receipt=>receipt.id===n.id&&receipt.defaultAttempt)).map(n=>n.id);
 const observedUrls=[...receipts.flatMap(r=>r.urls),...packet.sources.flatMap(s=>[s.finalUrl||s.url,
  ...(targeted?siteLinks(s):s.technicalSignals?.navigation||[]).map(l=>l.url)])];
 const knownUrls=[...new Set(targeted?observedUrls.map(researchUrl):observedUrls)].filter(Boolean);
 const history=rounds.flatMap(r=>r.commandResults||[]);
 const scopedMarket=plan.verifiedResults===true&&priorNeeds.some(n=>inScope(n)&&quantitativeMarketNeed(n,plan.scopeMarketCounts));
 const baseContract=targeted&&ordered?targetedReviewSchema:ordered?orderedReviewSchema:reviewSchema;
 const titledContract=plan.taskReporting?withTaskTitles(baseContract,'newNeeds'):baseContract;
 const comparisonContract=plan.focusedProductComparison?withProductPeers(withProductScope(titledContract,'newNeeds')):titledContract;
 const marketContract=scopedMarket?withMarketMeasures(comparisonContract):comparisonContract;
 const scopedBuyer=plan.procurementResearch&&priorNeeds.some(n=>inScope(n)&&buyerNeed(n));
 const buyerContract=plan.procurementResearch?withBuyerScope(marketContract,'newNeeds'):marketContract;
 const reviewContract=scopedBuyer?withBuyerProof(buyerContract):buyerContract;
 const normalizeData=data=>Array.isArray(data?.newNeeds)?
  {...data,newNeeds:normalizeNeeds(data.newNeeds,reviewContract.properties.newNeeds,true),
   ...(plan.focusedProductComparison&&Array.isArray(data.peers)?{peers:data.peers.map(peer=>({...peer,productMatch:peer.productMatch||
    {referenceProof:'',candidateProof:'',referenceClass:'',candidateClass:'',referenceFields:[],candidateFields:[]}}))}:{})}:data;
 const reviewOptions=targeted&&capacity?.minimumDefaultKurus?{reserveForFollowingKurus:capacity.minimumDefaultKurus}:{};
 const alreadyRead=(id,url)=>history.some(r=>r.id===id&&r.tool==='read'&&researchUrl(r.url)===researchUrl(url)&&r.status==='executed');
 const recoverReview=async issue=>{
  if(!incremental)return {...await keepOpen({needs:priorNeeds.filter(open),receipts,providers:acquisition,readPages,issue,ordered,targeted,focus:followUp()}),...proofCheckpoint()};
  const added=[];
  const commandResults=[];
  let check=await checkNew();
  const need=!last&&!readerBlocked&&!capacity?.workerBudgetExhausted&&priorNeeds.find(n=>dispatchable(n)&&open(n)&&checked.get(n.id)?.read&&!alreadyRead(n.id,checked.get(n.id).read));
  if(need){
   const url=checked.get(need.id).read;
   const command={id:need.id,tool:'read',query:'',url,mode:'default',limit:1};
   const read=await readSearchEvidence([url],readPages,need);
   added.push(...await extractFacts([{need,...read,urls:[url]}],acquisition,{excerptsOnly:true}));
   commandResults.push({...command,key:commandSignature(command),status:readerBlocked?'source_plan_invalid':'executed'});
   facts=receiptFacts([...receipts,...added],readEvidenceOnly);
   const rereview=await checkNew();
   if(rereview.issue||rereview.decisions)check=rereview;
  }
  const openNeeds=priorNeeds.filter(open);
  const saved=()=>({decisions:[...checked.values()],...proofCheckpoint(),commandResults,
   ...(check.issue?{evidenceReviewIssue:check.issue}:{})});
  if(!openNeeds.length)return {...saved(),approved:true,stopReason:'evidence_confirmed',receipts:added};
  const moreChecks=seen.size>reviewedBefore.size&&!check.issue&&facts.some(f=>!seen.has(f.id));
  const moreReads=commandResults.length&&openNeeds.some(n=>checked.get(n.id)?.read&&!alreadyRead(n.id,checked.get(n.id).read)&&!commandResults.some(c=>c.id===n.id&&c.url===checked.get(n.id).read));
  if(!last&&(moreChecks||!readerBlocked&&moreReads))return {...saved(),closed:false,issue,receipts:added};
  const continuation=await keepOpen({needs:openNeeds,receipts:[...receipts,...added],providers:acquisition,readPages,issue,
   ordered,targeted,allowDispatch:!last,nextQueries:checked,focus:followUp()});
  const updated=[...added,...(continuation.receipts||[])];
  if(continuation.receipts?.length){
   const finalCheck=await checkBeforeWorkerEnds(updated);
   if(finalCheck.decisions||finalCheck.issue)check=finalCheck;
  }
  if(!priorNeeds.some(open))return {...saved(),approved:true,stopReason:'evidence_confirmed',receipts:updated};
  return {...saved(),...continuation,receipts:updated};
 };
 if(targeted&&guarded&&!last&&!readerBlocked&&['budget_limit','input_budget','provider_unavailable','not_configured','tariff_expired'].includes(latest?.issue))
  return recoverReview(latest.issue);
 const result=await ask(providers,last?'bhs-scoped-clearance':'bhs-scoped-review',{
  identity,briefUnderstanding,asOf:packet.asOf,needs:priorNeeds,waitingNeeds,findings:facts,checked:[...checked.values()],tools:actors,last,knownUrls,...(gap?{existing,eligibleSections}:{}),
  defaults:{tavily:available('tavily'),gemini:available('gemini')},
  ...(readerBlocked?{publisherReadAvailable:false}:{}),
  ...(plan.focusedProductComparison?{waitingForReference:priorNeeds.filter(need=>!dispatchable(need)).map(need=>need.id)}:{}),
  ...(guarded?{researchRound:rounds.length,previousIssue:latest?.issue}:{}),
  previous:receipts.map(r=>({id:r.id,query:r.query,attempts:r.attempts,issues:r.issues,missingDefaults:r.missingDefaults,
   nextQuery:r.nextQuery,...(r.toolRouting?{toolRouting:r.toolRouting}:{}),...(!targeted?{urls:r.urls}:{})})),
  ...(targeted?{commandHistory:uniqueBy(history,r=>r.key).map(({key,...r})=>r)}:{}),
  instruction:'Dördüncü adım. Dönen bütün kaynakları doğru ürün, pazar, metrik ve dönem bakımından değerlendir. Proof kimlikleri ile geçerli kanıtları seç. Önceki geçerli kararları tekrar yazma. Her farklı öğeyi bir kez say. Numune sayısı ile metriğin yeterliliğini ayırt et. Tavily alıntısı doğrulama için yetersizse, özellikle rakibin kendi ürün sayfası için, commands içinde read aracına gözlemlenmiş URL’yi ver. Ek arama için tavily veya gemini aracına net sorgu ve limit ver. Varsayılan araçlar yeterliyse scraper çağırma. Yetersizse yalnız açık ihtiyaç için uygun scraper, gözlemlenen URL veya hedefli sorgu, mod ve örneklemi seç. Önceki çağrıyı tekrarlama. Bir sonraki ihtiyaç ortaya çıktıysa newNeeds ile ekle. Rakipleri ürün, pazar, fiyat bandı ve kanalla karşılaştır. Peers alanında kaynaklı adayları ve özgün ürün URL’sini göster. last doğruysa yeni komut ekleme. Bütün görevler tamamlandı ve kanıt yeterliyse approve true. Ticari teşhisi beşinci adıma bırak.'+
   (!guarded?' Kalan araştırma faydasızsa yeni komut ekleme ve boşlukları açık bırak.':'')+
   (ordered?' Bu turda yalnız tek bir sonraki işi seç. Önce son emrin sonucuna bak; ona bağlı iş ve sorguyu şimdi belirle. Bir araç hata verdiyse veya metrik için veri yetersizse sıradaki uygun aracı kendin seç. Yeni ihtiyaçları öncelik sırasıyla kaydet. Bir sonraki çağrı için genel araştırma verme; tek metrik, hedef, dönem ve gerekli en küçük örneklemi belirt.':'')+
   ' Her ihtiyacın yeterli olup olmadığına sufficient alanında sen karar ver; örneklem sayısını bulgu kotası olarak kullanma. Uygun bir ihtiyacın kanıtı Gemini ve Tavily birlikte denendikten sonra hâlâ yetersizse scraper kullan. missingDefaults varsa o iş için önce oradaki varsayılan aracı hedefli bir emirle çağır. Seçilen scraper istenen dönem, mod veya kayıt sayısını desteklemiyorsa talebi genişletmeden uygun bir başka araç seç. waitingNeeds planlanıp henüz çalıştırılmamış işlerdir. Hâlâ gereklilerse commands alanında aracı ve net sorguyu seç.'+
   (guarded?' Bilgi eksikse ve yeni bir araştırma çağrısı bütçeye sığıyorsa yazıma geçme. Açık kalan ölçüm için önceki çağrılardan farklı, uygulanabilir bir sonraki hedefli sorguyu seç. Bir komutun çalışmaması veya hiç komut üretmemek araştırmayı bitirme gerekçesi değildir. approve ancak bütün açık ihtiyaçlar kaynakla karşılandığında true olabilir.':'')+
   (plan.qualityReport?' Bir rakip ihtiyacını ancak rakibin kendi sitesinden okunmuş ilgili ürün veya satış kanalı kanıtıyla yeterli say. Arama alıntısında aday bulunmuşsa gözlemlenen ürün sayfasını read ile aç. Adayı peers alanına ekle. Aynı metriğe tekrar dönmeden önce henüz çalışılmamış gerekli ihtiyaçları değerlendir.':'')+
   (targeted?' commands.id aynen needs veya bu turdaki newNeeds kimliği olmalı. commandHistory içindeki uygulanmış komutu tekrarlama. Aynı URL okunmuşsa yeni ilgili sayfa veya başka bir ihtiyaç seç. Rakip için ürün ve hedef pazar kadar bağımsızlığı, satış kanalını ve fiyat örtüşmesini değerlendir. peers.relationship değerini doğrudan kaynakla kıyaslanan bağımsız rakip için direct, belirsiz aday için candidate, bağlantılı marka için related yaz. Bir adayın ürünü görülünce bütün rakip planı bitmiş sayılmaz. Resmi tablo veya rapor bulunduysa ölçümün birimini, dönemini ve kapsamını başlıkla birlikte okumak için URL’yi read aracına ver. Zayıf sonuçta bir sonraki emri farklı kaynakla veya daha dar metrikle ver.':'')+
   (incremental?' Son aramadaki kanıtın hangi ihtiyacı karşıladığını bir sonraki sorgudan önce decisions alanında kaydet. İki kanalda fiyat kıyaslanacaksa aynı ürün kodu veya tam varyantı iki gerçek kaynakta eşleştir. Para birimini, satış birimini ve dönemi doğrula. İlgili sayfa zaten bulunmuşsa önce read ile doğrudan kaynağı oku.':'')+
   (useMeasurements?' '+measurementInstruction+' newNeeds içindeki her ölçümü ayrı kimlikle yaz. Bir komut yalnız kendi kimliğindeki ölçümü araştırmalı. Bir ölçümün kanıtıyla diğerini kapatma. İlgili yayıncı sayfası önceden bulunduysa aynı aramayı satın almadan read ile açık ölçümü o sayfada doğrula.':'')+
   (plan.taskReporting?' '+taskTitleInstruction:'')+
   (readEvidenceOnly?' '+readEvidenceInstruction+' Adayı ancak kendi kaynağındaki ürün/hizmet ve hedef pazardaki ikame örtüşmesi doğrulanmışsa direct yaz. İlişkili marka veya doğrulanamamış adayı ayrı tut.':'')+
   (plan.qualifyReportFindings?' Kullanım bilgisi, özellik ve faydayı talep kanıtı sayma. Talep için alıcı davranışı, sipariş, bütçe veya alıcı araştırmasına doğrudan dayanan kanıt iste.':'')+
   (plan.focusedProductComparison?' '+productComparisonPlanInstruction+' '+productComparisonReviewInstruction:'')+
   (plan.procurementResearch?' '+buyerPlanInstruction:'')+(scopedBuyer?' '+buyerReviewInstruction:'')+
   (scopedMarket?' '+marketMeasureInstruction:'')+
   (readerBlocked?' Kaynak okuyucusu bu çalışmada kullanılamıyor. Bağımsız olarak kanıt üretebilecek bir Tavily sorgusu veya uygun scraper seç.':'')+
   (gap?' Kullanıcı açıkça eksik kısımları tamamlamayı seçti. Yalnız eligibleSections içindeki eksikleri, existing ve kaydedilmiş kaynakları kullanarak tamamla. Gerekli ek işleri kendin belirle. Daha önce aranan metrik ve kaynakları yeniden satın alma.':'')
 },useMeasurements?withMeasurementGroups(reviewContract,'newNeeds'):reviewContract,last?1150:1700,
 useMeasurements?{...reviewOptions,normalizeData,responseSchema:reviewContract}:reviewOptions);
 if(!result.value&&guarded)return recoverReview(result.issue||'research_clearance_unavailable');
 if(!result.value)return {issue:result.issue||'research_clearance_unavailable',
  ...(['budget_limit','input_budget','provider_unavailable','claude_spend_limit','not_configured'].includes(result.issue)?{closed:true}:{})};
 const data=result.value;
 const ids=new Set(priorNeeds.map(n=>n.id));
 const previouslyAsked=new Set(priorNeeds.map(n=>compact(n.query).toLocaleLowerCase('tr')));
 const newNeeds=last?[]:uniqueBy(data.newNeeds.filter(n=>!ids.has(n.id)&&inScope(n)&&
  (!gap||!previouslyAsked.has(compact(n.query).toLocaleLowerCase('tr')))),n=>n.id);
 for(const row of data.decisions)if(ids.has(row.id)){
  const related=facts.filter(f=>f.needId===row.id);
  const {proofs,unread}=readEvidenceOnly?reviewProofs(row.proofs,related,true):{proofs:row.proofs.filter(id=>related.some(f=>f.id===id))};
  const decision={id:row.id,sufficient:row.sufficient&&(!readEvidenceOnly||proofs.length>0&&!unread),proofs,
   ...(unread?{read:unread}:{})};
  const need=priorNeeds.find(n=>n.id===row.id);
  const saved=checked.get(row.id);
  checked.set(row.id,scopedBuyer&&buyerNeed(need)?buyerProcessDecision(need,decision,row.buyerProcess,related,saved):
   scopedMarket&&quantitativeMarketNeed(need,plan.scopeMarketCounts)?marketDecision(need,decision,row.marketMeasures,related,saved,plan.scopeMarketCounts):decision);
  if(incremental)for(const fact of related)seen.add(fact.id);
 }
 const peers=uniqueBy([...(latest?.peers||[]),...data.peers].filter(p=>researchUrl(p.url)&&researchHost(p.url)!==researchHost(brief.website)),p=>
  plan.focusedProductComparison?researchUrl(p.url):researchHost(p.url));
 qualifiedPeers=qualifyPeers(uniqueBy([...rounds.flatMap(r=>r.peers||[]),...peers],p=>researchUrl(p.url)),[...priorNeeds,...newNeeds]);
 if(rivalHosts)rivalHosts=peerHosts(qualifiedPeers,brief.website,targeted);
 const omitted=incremental?await checkNew(capacity?.minimumDefaultKurus||0):{};
 const decisions=[...checked.values()];
 const openNeeds=priorNeeds.filter(open);
 const actionable=(ordered?[...openNeeds,...newNeeds]:openNeeds).filter(dispatchable);
 const approved=data.approve&&!data.commands.length&&!data.newNeeds.length&&
  (readEvidenceOnly?!openNeeds.some(inScope):!guarded||!openNeeds.length);
 if(last||approved)return {approved,decisions,peers,openNeeds:openNeeds.map(n=>n.id),...proofCheckpoint(),
  ...(approved&&guarded?{stopReason:'evidence_confirmed'}:{}),...(!approved?{issue:'research_needs_open'}:{})};

 const commandKey=targeted?commandSignature:c=>hash([c.id,c.tool,c.query,c.url,c.mode,c.limit]);
 const commandState=c=>!actionable.some(n=>n.id===c.id&&inScope(n))?'need_unavailable':
  readerBlocked&&c.tool==='read'?'source_plan_invalid':
  attempted.has(commandKey(c))||targeted&&c.tool==='read'&&alreadyRead(c.id,c.url)?'duplicate':
  c.tool==='read'&&!knownUrls.includes(researchUrl(c.url))?'unknown_url':null;
 const suggestedRead=readEvidenceOnly&&!readerBlocked&&openNeeds.find(n=>dispatchable(n)&&inScope(n)&&checked.get(n.id)?.read&&
  !alreadyRead(n.id,checked.get(n.id).read));
 const readUrl=suggestedRead&&checked.get(suggestedRead.id).read;
 const readCommand=suggestedRead&&!data.commands.some(c=>c.id===suggestedRead.id&&c.tool==='read'&&researchUrl(c.url)===readUrl)?
  {id:suggestedRead.id,tool:'read',query:'',url:readUrl,mode:'default',limit:1}:null;
 const proposedCommands=readCommand?[...data.commands.filter(c=>c.tool==='read'),readCommand,...data.commands.filter(c=>c.tool!=='read')]:data.commands;
 const pendingCommands=uniqueBy(proposedCommands.filter(c=>targeted?!commandState(c):!attempted.has(commandKey(c))),commandKey);
 const commands=ordered?pendingCommands.slice(0,1):pendingCommands;
 const requests=ordered?[]:newNeeds.filter(dispatchable);
 const used=[];
 const searchRoutes=new Map();
 const routingStatus=new Map();
 let focusedCommand;
 for(const c of commands.filter(c=>['default','tavily','gemini'].includes(c.tool)&&c.query.trim())){
  const need=actionable.find(n=>n.id===c.id&&inScope(n));
  const tool=c.tool==='default'?(need?.first||'tavily'):c.tool;
  if(!need)continue;
  const blocked=blocker(tool);
  const prior=ordered&&targeted&&priorSearchAttempt(receipts,need.id,c.query,tool);
  if(blocked||prior){
   routingStatus.set(c,blocked||'duplicate');
   if(ordered&&targeted)focusedCommand={id:need.id,command:{...c,tool}};
   continue;
  }
  if(gap&&previouslyAsked.has(compact(c.query).toLocaleLowerCase('tr')))continue;
  requests.push({...need,first:tool,query:c.query,quantity:c.limit});
  used.push(c);
 }
 const tried=(id,tool)=>!available(tool)||receipts.some(r=>r.id===id&&r.attempts?.some(a=>a.tool===tool&&a.issue!=='budget_limit'));
 const requestedIds=new Set(requests.map(r=>r.id));
 const selected=[];
 const deferred=new Map();
 for(const command of commands.filter(c=>actors.includes(c.tool)&&!requestedIds.has(c.id))){
  const need=openNeeds.find(n=>n.id===command.id&&inScope(n));
  if(!need)continue;
  if(ordered&&queryActors.has(command.tool)&&!command.query.trim())continue;
  const missing=defaultTools.filter(tool=>!tried(need.id,tool));
  if(missing.length){
   if(ordered&&targeted){
    const first=missing.includes(need.first)?need.first:missing[0];
    requests.push({...need,first});
    searchRoutes.set(need.id,{requested:command.tool,reason:'required_default_first'});
    routingStatus.set(command,'default_searched_first');
    continue;
   }
   if(!receipts.some(r=>r.id===need.id&&r.missingDefaults?.join()===missing.join()))
    deferred.set(need.id,{id:need.id,facts:[],urls:[],issues:['scraper_requires_default_tools'],missingDefaults:missing});
  }else{
   selected.push(command);
  }
 }
 const next=[...deferred.values(),...(await runScopedDefaults(requests,acquisition,readPages)).map(result=>{
  const route=searchRoutes.get(result.id);
  return defaultReceipt(result,route?.requested,route?.reason);
 })];
 const readers=readerBlocked?[]:commands.filter(c=>c.tool==='read'&&(ordered?actionable:priorNeeds).some(n=>n.id===c.id&&inScope(n)&&dispatchable(n))&&knownUrls.includes(researchUrl(c.url)));
 used.push(...readers);
 const byNeed=new Map();
 for(const c of readers){
  const urls=byNeed.get(c.id)||[];
  urls.push(researchUrl(c.url));
  byNeed.set(c.id,urls);
 }
 for(const [id,urls] of byNeed){
  const need=(ordered?actionable:priorNeeds).find(n=>n.id===id);
  const read=await readSearchEvidence([...new Set(urls)],readPages,targeted?need:undefined);
  next.push(...await extractFacts([{need,...read,urls}],acquisition,{excerptsOnly:incremental}));
 }
 const known=knownUrls.map(url=>({url}));
 used.push(...selected);
 const scraped=await Promise.all(selected.map(async c=>{
  const need=openNeeds.find(n=>n.id===c.id);
  const candidate=peers.find(p=>p.name.toLocaleLowerCase('tr')===need.target.toLocaleLowerCase('tr')&&known.some(row=>row.url===researchUrl(p.url)));
  const targetBrief=candidate?{...brief,brandName:candidate.name,website:candidate.url}:brief;
  const targetPacket=candidate?(await attempt(()=>readPages([candidate.url]))).value||packet:packet;
  const isSearch=searchActors.includes(c.tool);
  const found=await attempt(()=>acquisition.enrich({actor:c.tool,url:isSearch?targetBrief.website:researchUrl(c.url),mode:c.mode,exactScope:true,
   ...(c.query.trim()?{query:c.query,queries:[c.query]}:{}),maxResults:c.limit,since:need.since,period:need.period,countryCode:need.country.toUpperCase(),language:need.language},
  {brief:targetBrief,packet:targetPacket,searches:[{results:known}],scrapes:rounds.flatMap(r=>r.actorTargets||[]),geo:{countryCode:need.country.toUpperCase(),language:need.language}}));
  const actorResult=found.value;
  const records=evidenceRows(actorResult?.pages,c.limit,readEvidenceOnly&&isSearch?'search-snippet':'extracted');
  const search=evidenceRows((actorResult?.searches||[]).flatMap(s=>s.results||[]),c.limit,'search-snippet');
  const {rows:read,sourceReads}=await readSearchEvidence([...new Set(search.map(r=>r.url))],readPages);
  const issue=found.issue||actorResult?.reason;
  return {need,rows:[...records,...read,...search],sourceReads,issue,attempts:[{tool:c.tool,issue,providerStatus:found.providerStatus}],
   actorStarted:Boolean(actorResult?.runId),actorTarget:actorResult?.status==='complete'?{actor:c.tool,status:'complete',pages:records.map(({url})=>({url}))}:null};
 }));
 for(let i=0;i<scraped.length;i+=3)next.push(...await extractFacts(scraped.slice(i,i+3),acquisition));
 const issue=!next.length&&data.commands.length?'no_executable_research_command':undefined;
 const advanced=next.some(r=>r.facts.length||r.urls.length||r.missingDefaults?.length||
  r.attempts?.some(a=>!a.issue));
 const continuation=guarded&&!advanced?await keepOpen({needs:[...openNeeds,...newNeeds],receipts:[...receipts,...next],
  providers:acquisition,readPages,issue,ordered,targeted,allowDispatch:!ordered||!next.length&&!used.length,
  nextQueries:checked,focus:focusedCommand||followUp()}):{closed:guarded?false:!next.length,issue};
 const {receipts:extra=[],...completion}=continuation;
 const followUpCheck=await checkBeforeWorkerEnds([...next,...extra],[...priorNeeds,...newNeeds]);
 return {approved:false,decisions:followUpCheck.decisions?[...checked.values()]:decisions,peers,newNeeds,receipts:[...next,...extra],commandKeys:used.map(commandKey),...completion,...proofCheckpoint(),
  ...(followUpCheck.issue||omitted.issue?{evidenceReviewIssue:followUpCheck.issue||omitted.issue}:{}),
  ...(targeted?{commandResults:proposedCommands.map(c=>({...c,key:commandKey(c),status:readerBlocked&&c.tool==='read'?'source_plan_invalid':used.includes(c)?'executed':routingStatus.get(c)||commandState(c)||'not_dispatched'}))}:{}),
  actorTargets:scraped.map(s=>s.actorTarget).filter(Boolean)};
}

function countProofs(need,proofs=[],facts){
 const ids=new Set(proofs);
 return new Set(facts.filter(f=>f.needId===need.id&&ids.has(f.id)).map(f=>f.item.toLocaleLowerCase('tr'))).size;
}
function focusedNeedSupported(need,peers){
 if(need.comparisonRole!=='rivals')return true;
 const price=/fiyat|price|\bgbp\b/iu.test(need.metric);
 return peers.some(({verifiedProductMatch:m})=>price?m?.candidate.fields.price?.proof.needId===need.id:m?.candidateNeedId===need.id);
}
function confirmed(need,decision,facts,rivalHosts,readEvidenceOnly=false,qualifyReportFindings=false){
 if(buyerNeed(need))return Boolean(decision?.sufficient&&verifiedBuyerProcess(need,decision.buyerProcess,decision.proofs,facts)?.coversTarget);
 const supportsNeed=f=>f.needId===need.id&&decision?.proofs?.includes(f.id)&&(!readEvidenceOnly||isReadEvidence(f));
 if(rivalHosts&&comparisonNeed(need)&&!facts.some(f=>supportsNeed(f)&&rivalHosts.has(researchHost(f.url))&&publisherRead(f)))return false;
 if(readEvidenceOnly&&!facts.some(supportsNeed))return false;
 if(qualifyReportFindings&&!supportsBuyerDemand(need,facts.filter(supportsNeed).map(fact=>fact.quote)))return false;
 if(typeof decision?.sufficient==='boolean')return decision.sufficient&&decision.proofs.length>0;
 return countProofs(need,decision?.proofs,facts)>=need.quantity;
}

const blockedResearch=new Set(['actor_budget_limit','actor_limit_unverified','actor_source_unverified','actor_time_limit','budget_limit','cancelled','claude_spend_limit','fx_limit','fx_unavailable',
 'input_budget','model_budget','model_deadline','not_configured','scraper_requires_default_tools','tariff_expired','token_count']);
function researchAttempted(receipt,executed){
 if(receipt.facts?.length||receipt.urls?.length||receipt.actorStarted)return true;
 if(receipt.attempts?.length)return receipt.attempts.some(({issue})=>!blockedResearch.has(issue));
 return executed&&!receipt.missingDefaults?.length&&!receipt.issues?.some(issue=>blockedResearch.has(issue));
}

export function scopedEvidence(brand,plan,rounds){
 const readEvidenceOnly=plan.readEvidenceOnly===true;
 const taskReporting=plan.taskReporting===true;
 const needs=uniqueBy([...plan.needs,...rounds.flatMap(r=>r.newNeeds||[])],n=>n.id);
 const receipts=rounds.flatMap(r=>r.receipts||[]);
 const facts=receiptFacts(receipts,readEvidenceOnly);
 const interrupted=rounds.some(round=>round.issue==='research_round_interrupted');
 const searched=new Set(rounds.flatMap(round=>{
  const executed=new Set((round.commandResults||[]).filter(c=>c.status==='executed').map(c=>c.id));
  return (round.receipts||[]).filter(r=>researchAttempted(r,executed.has(r.id))).map(r=>r.id);
 }));
 const checked=new Map(rounds.flatMap(r=>r.decisions||[]).map(row=>[row.id,row]));
 const sourceReads=new Map();
 const completedLookups=new Set();
 if(taskReporting)for(const receipt of receipts){
  if(receipt.facts?.length||receipt.attempts?.some(a=>!a.issue||a.issue==='no_results')||receipt.sourceReads?.some(read=>read.readable))
   completedLookups.add(receipt.id);
  for(const read of receipt.sourceReads||[]){
   if(!sourceReads.has(receipt.id))sourceReads.set(receipt.id,new Map());
   sourceReads.get(receipt.id).set(read.url,read.readable);
  }
 }
 const clearance=rounds.findLast(r=>typeof r.approved==='boolean')||{};
 const website=brand.packet.entities.find(e=>e.role==='brand')?.website;
 const proposed=uniqueBy(rounds.flatMap(r=>r.peers||[]),p=>plan.focusedProductComparison?researchUrl(p.url):researchHost(p.url));
 const peers=plan.focusedProductComparison?qualifyProductPeers(proposed,needs,facts,checked,website,brand.packet):proposed;
 const rivalHosts=plan.qualityReport?peerHosts(peers,website,plan.targetedEvidence):undefined;
 const buyerProcurement=plan.procurementResearch?needs.filter(buyerNeed).map(need=>{
  const decision=checked.get(need.id);
  const process=verifiedBuyerProcess(need,decision?.buyerProcess,decision?.proofs||[],facts);
  return buyerProcurementRow(need,process,Boolean(decision?.sufficient&&process?.coversTarget));
 }):[];
 const buyerRows=new Map(buyerProcurement.map(row=>[row.needId,row]));
 const coverage=needs.map(n=>{
  const decision=checked.get(n.id);
  const marketMeasures=plan.verifiedResults&&quantitativeMarketNeed(n,plan.scopeMarketCounts)?verifyMarketMeasures(n,decision?.marketMeasures,decision?.proofs||[],facts,plan.scopeMarketCounts):undefined;
  const buyer=buyerRows.get(n.id);
  const proofs=facts.filter(f=>f.needId===n.id&&(buyer?buyer.process?.proof===f.id:decision?.proofs.includes(f.id))&&(!readEvidenceOnly||isReadEvidence(f)));
  const displayName=salesMetricName(n);
  const status=confirmed(n,decision,facts,rivalHosts,readEvidenceOnly,plan.qualifyReportFindings)&&
   (buyer||!plan.focusedProductComparison||focusedNeedSupported(n,peers)&&comparisonReferenceVerified(n,needs,facts,checked,website,brand.packet))&&
   (!marketMeasures||marketMeasures.some(row=>!plan.scopeMarketCounts||marketMeasureMatchesScope(n,row)))?'confirmed':'open';
  const researchStatus=taskReporting&&status==='open'?(proofs.length?'partially_verified':
   [...(sourceReads.get(n.id)?.values()||[])].includes(false)?'source_unreadable':
   completedLookups.has(n.id)?'searched':searched.has(n.id)?'search_incomplete':interrupted?'interrupted':'not_searched'):undefined;
  return {id:n.id,section:n.section,name:n.metric,status,
   ...(plan.targetedEvidence?{displayName,...(searched.has(n.id)||!interrupted?{searched:searched.has(n.id)}:{})}:{}),
   ...(taskReporting?{sectionTitle:salesTaskSectionTitle(n.section,n.sectionTitle,displayName),...(researchStatus?{researchStatus}:{})}:{}),
   ...(marketMeasures?{marketMeasures}:{}),...(!buyer&&rivalHosts&&(comparisonNeed(n)||n.comparisonRole==='rivals')?{requiresPeer:true}:{}),
   proofs};
 });
 const accepted=coverage.flatMap(c=>c.proofs.map(f=>({...f,section:c.section})));
 const verifiedPeers=[];
 const entities=uniqueBy(peers.filter(p=>!plan.focusedProductComparison||p.relationship==='direct'),p=>researchHost(p.url)).flatMap(p=>{
  const url=researchUrl(p.url);
  const host=researchHost(url);
  if(rivalHosts&&!rivalHosts.has(host)||!facts.some(f=>researchHost(f.url)===host&&(readEvidenceOnly?isReadEvidence(f):rivalHosts?publisherRead(f):f.method!=='search-snippet')))return [];
  const id='peer_'+hash(host).slice(0,16);
  if(plan.verifiedResults&&p.relationship==='direct'){
   const verifiedPages=p.verifiedProductMatch?new Set(peers.filter(peer=>peer.verifiedProductMatch&&researchHost(peer.url)===host).map(peer=>researchUrl(peer.url))):null;
   const proofs=coverage.filter(metric=>metric.requiresPeer).flatMap(metric=>metric.proofs).filter(f=>researchHost(f.url)===host&&
    (!verifiedPages||verifiedPages.has(researchUrl(f.url)))&&publisherRead(f));
   if(proofs.length)verifiedPeers.push({entityId:id,relationship:'direct',reason:p.product,proofs});
   else if(readEvidenceOnly)return [];
  }
  return [{id,role:'competitor',name:p.name,website:url,scope:p.product,
   geographyReason:p.market,audienceReason:p.channel,scaleReason:p.priceBand}];
 });
 const verifiedHosts=new Set(entities.map(e=>researchHost(e.website)));
 const observedHosts=readEvidenceOnly?new Set([...receipts.flatMap(r=>r.urls||[]),...facts.map(f=>f.url)].map(researchHost)):null;
 const competitorCandidates=readEvidenceOnly?peers.filter(p=>p.relationship!=='related'&&!verifiedHosts.has(researchHost(p.url))&&
  observedHosts.has(researchHost(p.url))).map(({name,url})=>({name,url:researchUrl(url)})):[];
 const productComparisons=peers.flatMap(p=>p.verifiedProductMatch?[p.verifiedProductMatch]:[]);
 const indirectAlternatives=plan.focusedProductComparison?peers.filter(p=>p.relationship==='related'&&
  facts.some(f=>researchUrl(f.url)===researchUrl(p.url)&&isReadEvidence(f))).map(({name,url,product})=>({name,url:researchUrl(url),product})):[];
 const sources=uniqueBy(facts,f=>f.url+' '+f.quote+(readEvidenceOnly?' '+f.method:'')).map((f,i)=>({id:'ev'+(i+1),url:f.url,finalUrl:f.url,title:f.title||f.url,
  method:f.method,retrievedAt:readEvidenceOnly?f.retrievedAt||brand.packet.asOf:brand.packet.asOf,scope:'Hedefli araştırma örneği.',...(f.metadataOnly?{metadataOnly:true}:{}),
  excerpts:[{id:'p0',text:f.quote,offset:0}],contentHash:hash(f.quote)}));
 return {packet:{...brand.packet,entities:[...brand.packet.entities,...entities],sources:[...brand.packet.sources,...sources]},accepted,coverage,needs,verifiedPeers,competitorCandidates,productComparisons,indirectAlternatives,buyerProcurement,
  approved:clearance.approved===true&&(!rivalHosts&&!readEvidenceOnly||coverage.every(metric=>metric.status==='confirmed'))};
}
