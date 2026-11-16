import {searchActors} from './apify-inputs.mjs';
import {BudgetError,hash} from '../budget/ledger.mjs';
import {researchUrl,researchHost} from './research-url.mjs';
import {arr,obj,str} from './sequential-contracts.mjs';
import {assertSchema} from './schema.mjs';
import {managedSections} from './managed-report.mjs';

const sections=Object.keys(managedSections);
const section=str(100);
const queryActors=new Set([...searchActors,'damilo/google-shopping-apify','harvestapi/linkedin-company-search']);
const text=n=>({...str(n),minLength:1});
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
const compact=s=>String(s||'').replace(/\s+/g,' ').trim();
const uniqueBy=(rows,key)=>[...new Map(rows.map(row=>[key(row),row])).values()];
const siteLinks=s=>[...(s.technicalSignals?.identityLinks||[]),...(s.technicalSignals?.navigation||[])];
const comparisonNeed=need=>/rakip|rekabet|competit/iu.test(need.section);
const peerHosts=(peers,website,targeted=false)=>new Set(uniqueBy(peers,p=>researchHost(p.url))
 .filter(p=>!targeted||p.relationship==='direct').map(p=>researchHost(p.url)).filter(host=>host&&host!==researchHost(website)));
const publisherRead=fact=>!['search-snippet','html-signals'].includes(fact.method)&&!fact.metadataOnly;
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
  ...controllerOptions,maxOutputTokens,minimumOutputTokens:Math.ceil(maxOutputTokens*.50),...options
 }));
 return result.value?.data?{value:result.value.data}:result;
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
 const taskSchema=guarded?orderedNeedSchema:needSchema;
 const contract=guarded?orderedPlanSchema:planSchema;
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
 const normalizeData=data=>{
  if(!Array.isArray(data?.needs))return data;
  const needs=data.needs.flatMap(need=>{
   if(!need||typeof need!=='object')return [];
   const fields=Object.fromEntries(Object.entries(taskSchema.properties).map(([key,field])=>{
    const value=need[key];
    if(field.type==='string'&&typeof value==='string')return [key,value.trim().slice(0,field.maxLength).toWellFormed()];
    return [key,value];
   }));
   try{assertSchema(fields,taskSchema);return [fields];}catch{return [];}
  });
  if(!needs.length&&data.needs.length)throw new BudgetError('model_output_invalid','Claude’un araştırma emri doğrulanamadı.');
  return {needs:needs.slice(0,planSchema.properties.needs.maxItems)};
 };
 let result=await ask(providers,'bhs-scoped-plan',request,contract,3800,{normalizeData});
 if(['incomplete','invalid_report','model_output_invalid'].includes(result.issue)||guarded&&(!result.value?.needs?.length))
  result=await ask(providers,'bhs-scoped-plan-compact',{...request,instruction:request.instruction+' Yalnız hemen başlayacağın en öncelikli ilk işleri kısa ifadelerle yaz. Tüm olası sorguları listeleme. Tek bir tamamlanmış JSON döndür.'},contract,guarded?2400:3500,{normalizeData,plainJson:true});
 const needs=uniqueBy(result.value?.needs||[],n=>n.id);
 const issue=result.issue||(guarded&&!needs.length?'research_plan_empty':undefined);
 return {needs,...(issue?{issue}:{})};
}

function evidenceRows(result,limit,method){
 return (result||[]).flatMap(row=>{
  const url=researchUrl(row.finalUrl||row.url);
  const content=compact(row.text||row.content).slice(0,950);
  return url&&content.length>=24?[{url,title:compact(row.title).slice(0,150),content,method,...(row.metadataOnly?{metadataOnly:true}:{})}]:[];
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
  const read=await readSearchEvidence(toRead,readPages,providers.managedBudgetVersion>=14?need:undefined);
  return {need,rows:uniqueBy([...read,...rows],row=>row.url+' '+row.content),urls,
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
 if(need)return sources.flatMap(source=>{
  const wordScore=text=>focus.filter(word=>text.toLocaleLowerCase('tr').includes(word)).length;
  const slices=(source.excerpts||[]).flatMap(({text})=>{
   const rows=[];for(let i=0;i<text.length;i+=480)rows.push(text.slice(i,i+950));return rows;
  }).filter(text=>text.trim().length>=24).sort((a,b)=>wordScore(b)-wordScore(a));
  return evidenceRows(slices.slice(0,2).map(text=>({...source,text})),2,source.method||'extracted');
 });
 return evidenceRows(sources.map(source=>({...source,text:source.excerpts?.map(e=>e.text).join(' ')})),sources.length,'extracted');
}

async function extractFacts(searches,providers,{excerptsOnly=false}={}){
 const inputs=searches.map(search=>({...search,rows:search.rows.map((row,i)=>({...row,proof:'p'+(i+1)}))}));
 // The controller reviews these publisher excerpts itself. Gemini-grounded
 // searches and specialist datasets still use the extraction worker.
 const withRows=excerptsOnly?[]:inputs.filter(input=>input.rows.length&&input.rows.length<=input.need.quantity*2&&
  !(providers.managedBudgetVersion>=13&&input.attempts?.length===1&&input.attempts[0].tool==='tavily'));
 const worker=providers.managedBudgetVersion>=12&&providers.modelHandoff?providers.worker:providers.geminiWorker||providers.worker;
 const result=withRows.length?await attempt(()=>worker('bhs-scoped-extract',{
  instruction:'Her iş için yalnız talep edilen metriği karşılayan kaynak kimliklerini seç. Bir öğeyi iki kez sayma. Her öğe için ayırt edici ad ve kaynağın proof kimliğini ver. Özgün alıntıyı aynen kopyalayabiliyorsan quote içine yaz, yoksa boş bırak. Eksik veri varsa bir sonraki hedefli aramaya aday ad veya sorgu öner. Harici bilgi ve kaynak URL uydurma.',
  requests:withRows.map(({need,rows})=>({need,sources:rows.map(({proof,url,content})=>({proof,url,content}))}))
 },workerSchema,{maxOutputTokens:1800,minimumOutputTokens:760,compactWorker:true,generationTimeoutMs:28000})):{};
 return inputs.map(({need,rows,issue,attempts=[],urls=[]})=>{
  const output=result.value?.data?.results.find(r=>r.id===need.id);
  const makeFact=(source,quote,item)=>({id:'q'+hash([need.id,source.url,quote,item]).slice(0,18),quote,item,url:source.url,title:source.title,method:source.method,
   ...(source.metadataOnly?{metadataOnly:true}:{})});
  const extracted=(output?.facts||[]).flatMap(fact=>{
   const source=rows.find(r=>r.proof===fact.proof);
   const quote=compact(fact.quote),item=compact(fact.item);
   if(!source||!item)return [];
   return [makeFact(source,quote.length>=24&&source.content.includes(quote)?quote:source.content.slice(0,420),item)];
  });
  const candidates=rows.map(source=>({...makeFact(source,source.content,source.title||source.url),preliminary:true}));
  const facts=uniqueBy([...candidates,...extracted],row=>row.id+' '+row.item);
  return {id:need.id,query:need.query,facts,urls:[...new Set([...urls,...rows.map(r=>r.url)])],attempts,nextQuery:output?.nextQuery||'',
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
  round.closed===true&&['research_budget_exhausted','research_tools_unavailable'].includes(round.stopReason);
}

const defaultDenied=(receipts,tool)=>receipts.some(r=>r.attempts?.some(a=>a.tool===tool&&
 (['not_configured','tariff_expired','fx_limit'].includes(a.issue)||[401,402,403,404,429,432,433,434].includes(a.providerStatus))));

async function openingSearchPlan({plan,receipts,providers}){
 // Claude supplies the topics, priority and exact query. Each original topic
 // gets its first funded search before the controller can deepen another topic.
 const topics=new Map();
 for(const need of plan.needs){
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
 const available=defaultTools.filter(tool=>capacity.defaults.includes(tool)&&!defaultDenied(receipts,tool));
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
 return {selected,pool,searchFloor:floor-nextInfrastructure};
}

// An empty or unusable controller response is not a budget decision. Reuse
// Claude's open need and focused query while an independent search still fits.
async function keepResearchOpen({needs,receipts,providers,readPages,issue,ordered=false,allowDispatch=true,targeted=false,nextQueries}){
 const capacity=(await attempt(()=>providers.researchCapacity?.())).value;
 if(!capacity)return {closed:false,issue:issue||'research_capacity_unknown'};
 const defaults=capacity.defaults.filter(tool=>!defaultDenied(receipts,tool));
 if(!defaults.length&&!capacity.actors.length){
  const budget=capacity.workerBudgetExhausted||capacity.remainingKurus<=0||
   capacity.configuredDefaults.some(tool=>!defaultDenied(receipts,tool))||capacity.configuredActors?.length;
  const stopReason=budget?'research_budget_exhausted':'research_tools_unavailable';
  return {closed:true,stopReason,issue:stopReason};
 }
 const orderedNeeds=targeted?[...needs.filter(n=>!receipts.some(r=>r.id===n.id&&r.defaultAttempt)),...needs.filter(n=>receipts.some(r=>r.id===n.id&&r.defaultAttempt))]:needs;
 for(const need of allowDispatch?orderedNeeds:[]){
  const saved=receipts.filter(r=>r.id===need.id);
  const queries=uniqueBy([nextQueries?.get(need.id)?.nextQuery,...(ordered?[]:saved.map(r=>r.nextQuery).reverse()),need.query].filter(Boolean),query=>compact(query).toLocaleLowerCase('tr'));
  const preferred=defaults.includes(need.first)?[need.first,...defaults.filter(tool=>tool!==need.first)]:defaults;
  const tools=ordered&&!targeted?defaults.filter(tool=>tool===need.first):preferred;
  for(const query of queries)for(const tool of tools){
   if(saved.some(r=>compact(r.query||need.query).toLocaleLowerCase('tr')===compact(query).toLocaleLowerCase('tr')&&
    r.attempts?.some(a=>a.tool===tool&&a.issue!=='budget_limit')))continue;
   const [result]=await runScopedDefaults([{...need,query,first:tool}],providers,readPages);
   return {closed:false,issue:issue||'research_needs_open',receipts:[{...result,defaultAttempt:true}]};
  }
 }
 if(targeted&&allowDispatch&&['budget_limit','provider_unavailable','claude_spend_limit','not_configured','input_budget','tariff_expired'].includes(issue)){
  const stopReason=['budget_limit','input_budget'].includes(issue)?'research_budget_exhausted':'research_tools_unavailable';
  return {closed:true,stopReason,issue};
 }
 return {closed:false,issue:issue||'research_needs_open'};
}

function receiptFacts(receipts){
 return uniqueBy(receipts.flatMap(r=>(r.facts||[]).map(f=>({...f,needId:r.id}))),f=>f.id);
}

async function reviewNewEvidence({needs,facts,checked,seen,rivalHosts,providers,reserveForFollowingKurus=0}){
 const tasks=needs.map(({id,target,market,metric,period,expected,quantity})=>{
  const saved=facts.filter(f=>f.needId===id);
  const incoming=saved.filter(f=>!seen.has(f.id)).slice(0,8);
  const previous=checked.get(id)?.proofs||[];
  const context=saved.filter(f=>seen.has(f.id)).sort((a,b)=>Number(previous.includes(b.id))-Number(previous.includes(a.id))).slice(0,4);
  const sources=[...incoming,...context].map(({id,url,title,quote,method,metadataOnly})=>({id,url,title,quote:quote.slice(0,950),method,metadataOnly}));
  return {id,target,market,metric,period,expected,quantity,sources,incoming,
   previousProofs:previous.filter(proof=>sources.some(f=>f.id===proof))};
 }).filter(task=>task.incoming.length).slice(0,3);
 if(!tasks.length)return {};
 const worker=providers.worker||providers.geminiWorker;
 if(!worker)return {issue:'not_configured'};
 const result=await attempt(()=>worker('bhs-scoped-evidence-check',{
  tasks:tasks.map(({incoming,...task})=>({...task,newProofs:incoming.map(f=>f.id)})),
  instruction:'Her iş için yeni kaynakları istenen ürün, pazar, dönem ve metrik bakımından denetle. Her iş için bir karar yaz. Önceki geçerli kanıtı koru. Yalnız o işte görülen ilgili kaynak kimliklerini proofs alanına koy. Kısmi kanıtı sakla ve açık bırak. Bir arama alıntısı yalnız rapor adı veya sonuç bağlantısı gösteriyorsa yeterli sayma. Resmî raporun ilgili tablosu, dönemi, birimi ve kapsamı veya ürün sayfasındaki fiyat doğrulanacaksa read alanına açılacak kaynağın kimliğini yaz. İki kanalda fiyat kıyaslanacaksa aynı ürün kodu veya ayırt edilebilir tam varyantı iki gerçek kaynakta eşleştir. Fiyat, para birimi, satış birimi ve dönem bağlamını kontrol et. Pazar, kanal veya eşleşme belirsizse açık bırak. Başka kaynağa ihtiyaç varsa nextQuery alanına aynı iş için tek dar, farklı sorgu yaz. Gerek yoksa read ve nextQuery boş olsun. Kaynak veya olgu uydurma.'
 },evidenceReviewSchema,{maxOutputTokens:840,minimumOutputTokens:530,compactWorker:true,compactVerdicts:true,
  reserveForFollowingKurus,generationTimeoutMs:22000}));
 if(!result.value?.data)return {issue:result.issue||'research_clearance_unavailable'};
 const decisions=[];
 for(const task of tasks){
  const row=result.value.data.decisions.find(r=>r.id===task.id);
  if(!row)continue;
  const proofs=uniqueBy(row.proofs.filter(id=>task.sources.some(f=>f.id===id&&!f.metadataOnly)),id=>id);
  const read=task.sources.find(f=>f.id===row.read&&!publisherRead(f));
  const saved=checked.get(task.id);
  const candidate={id:task.id,sufficient:row.sufficient&&proofs.length>0&&!read,proofs,nextQuery:compact(row.nextQuery),...(read?{read:read.url}:{})};
  // An incremental slice may add evidence without re-adjudicating an earlier
  // confirmed decision. The controller can revisit it with the full context.
  const need=needs.find(n=>n.id===task.id);
  const decision=confirmed(need,saved,facts,rivalHosts)?{...saved,proofs:[...new Set([...saved.proofs,...proofs])]}:candidate;
  for(const f of task.incoming)seen.add(f.id);
  checked.set(decision.id,decision);
  decisions.push(decision);
 }
 return decisions.length?{decisions}:{issue:'research_clearance_unavailable'};
}

export async function reviewScopedResearch({identity,briefUnderstanding,plan,rounds,providers,brief,packet,readPages,last=false,eligibleSections=sections,existing=[],gap=false,acquisition=providers}){
 const guarded=plan.reportOnlyAfterResearch===true&&!gap;
 const ordered=plan.orderedResearch===true&&!gap;
 const targeted=plan.targetedEvidence===true;
 const incremental=ordered&&guarded&&providers.managedBudgetVersion>=16;
 const priorNeeds=uniqueBy([...plan.needs,...rounds.flatMap(round=>round.newNeeds||[])],n=>n.id);
 const receipts=rounds.flatMap(round=>round.receipts||[]);
 let facts=receiptFacts(receipts);
 const checked=new Map(rounds.flatMap(round=>round.decisions||[]).map(row=>[row.id,row]));
 const seen=new Set(rounds.flatMap(round=>round.reviewedProofIds||[]));
 const reviewedBefore=new Set(seen);
 let rivalHosts=plan.qualityReport?peerHosts(rounds.flatMap(r=>r.peers||[]),brief.website,targeted):undefined;
 const open=need=>!confirmed(need,checked.get(need.id),facts,rivalHosts);
 const inScope=need=>!gap||eligibleSections.includes(need.section);
 const checkNew=(reserveForFollowingKurus,needs=priorNeeds)=>reviewNewEvidence({needs,facts,checked,seen,rivalHosts,providers,reserveForFollowingKurus});
 const checkBeforeWorkerEnds=async(added,needs)=>{
  if(!incremental||!acquisition.infrastructureOffsetKurus||!added.some(r=>r.facts.length))return {};
  const remaining=(await attempt(()=>acquisition.researchCapacity?.({includeActors:false}))).value?.remainingKurus;
  if(!(remaining<acquisition.infrastructureOffsetKurus))return {};
  facts=receiptFacts([...receipts,...added]);
  return checkNew(0,needs);
 };
 const proofCheckpoint=()=>incremental?{reviewedProofIds:[...seen].filter(id=>!reviewedBefore.has(id))}:{};
 if(ordered&&!last&&providers.managedBudgetVersion>=15){
  const openingArgs={plan,receipts,providers:acquisition};
  const opening=await openingSearchPlan(openingArgs);
  if(opening){
   const results=(await runScopedDefaults(opening.selected,opening.pool,readPages)).map(result=>({...result,defaultAttempt:true}));
   let check={};
   if(incremental){
    const combined=[...receipts,...results];
    facts=receiptFacts(combined);
    // Review in the same metered invocation while retaining the floor for
    // pending opening topics. Deferred proof stays eligible for the next check.
    const pending=await openingSearchPlan({...openingArgs,receipts:combined});
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
 const denied=tool=>defaultDenied(receipts,tool);
 const available=tool=>!denied(tool)&&(!capacity||capacity.defaults.includes(tool));
 const attempted=new Set(rounds.flatMap(r=>r.commandKeys||[]));
 const waitingNeeds=priorNeeds.filter(n=>!receipts.some(receipt=>receipt.id===n.id&&receipt.defaultAttempt)).map(n=>n.id);
 const observedUrls=[...receipts.flatMap(r=>r.urls),...packet.sources.flatMap(s=>[s.finalUrl||s.url,
  ...(targeted?siteLinks(s):s.technicalSignals?.navigation||[]).map(l=>l.url)])];
 const knownUrls=[...new Set(targeted?observedUrls.map(researchUrl):observedUrls)].filter(Boolean);
 const history=rounds.flatMap(r=>r.commandResults||[]);
 const alreadyRead=(id,url)=>history.some(r=>r.id===id&&r.tool==='read'&&researchUrl(r.url)===researchUrl(url)&&r.status==='executed');
 const recoverReview=async issue=>{
  if(!incremental)return keepResearchOpen({needs:priorNeeds.filter(open),receipts,providers:acquisition,readPages,issue,ordered,targeted});
  const added=[];
  const commandResults=[];
  let check=await checkNew();
  const need=!last&&!capacity?.workerBudgetExhausted&&priorNeeds.find(n=>open(n)&&checked.get(n.id)?.read&&!alreadyRead(n.id,checked.get(n.id).read));
  if(need){
   const url=checked.get(need.id).read;
   const command={id:need.id,tool:'read',query:'',url,mode:'default',limit:1};
   const rows=await readSearchEvidence([url],readPages,need);
   added.push(...await extractFacts([{need,rows,urls:[url]}],acquisition,{excerptsOnly:true}));
   commandResults.push({...command,key:commandSignature(command),status:'executed'});
   facts=receiptFacts([...receipts,...added]);
   const rereview=await checkNew();
   if(rereview.issue||rereview.decisions)check=rereview;
  }
  const openNeeds=priorNeeds.filter(open);
  const saved=()=>({decisions:[...checked.values()],...proofCheckpoint(),commandResults,
   ...(check.issue?{evidenceReviewIssue:check.issue}:{})});
  if(!openNeeds.length)return {...saved(),approved:true,stopReason:'evidence_confirmed',receipts:added};
  const moreChecks=seen.size>reviewedBefore.size&&!check.issue&&facts.some(f=>!seen.has(f.id));
  const moreReads=commandResults.length&&openNeeds.some(n=>checked.get(n.id)?.read&&!alreadyRead(n.id,checked.get(n.id).read)&&!commandResults.some(c=>c.id===n.id&&c.url===checked.get(n.id).read));
  if(!last&&(moreChecks||moreReads))return {...saved(),closed:false,issue,receipts:added};
  const continuation=await keepResearchOpen({needs:openNeeds,receipts:[...receipts,...added],providers:acquisition,readPages,issue,
   ordered,targeted,allowDispatch:!last,nextQueries:checked});
  const updated=[...added,...(continuation.receipts||[])];
  if(continuation.receipts?.length){
   const finalCheck=await checkBeforeWorkerEnds(updated);
   if(finalCheck.decisions||finalCheck.issue)check=finalCheck;
  }
  if(!priorNeeds.some(open))return {...saved(),approved:true,stopReason:'evidence_confirmed',receipts:updated};
  return {...saved(),...continuation,receipts:updated};
 };
 if(targeted&&guarded&&!last&&['budget_limit','input_budget','provider_unavailable','not_configured','tariff_expired'].includes(latest?.issue))
  return recoverReview(latest.issue);
 const result=await ask(providers,last?'bhs-scoped-clearance':'bhs-scoped-review',{
  identity,briefUnderstanding,asOf:packet.asOf,needs:priorNeeds,waitingNeeds,findings:facts,checked:[...checked.values()],tools:actors,last,knownUrls,...(gap?{existing,eligibleSections}:{}),
  defaults:{tavily:available('tavily'),gemini:available('gemini')},
  ...(guarded?{researchRound:rounds.length,previousIssue:latest?.issue}:{}),
  previous:receipts.map(r=>({id:r.id,query:r.query,attempts:r.attempts,issues:r.issues,missingDefaults:r.missingDefaults,nextQuery:r.nextQuery,...(!targeted?{urls:r.urls}:{})})),
  ...(targeted?{commandHistory:uniqueBy(history,r=>r.key).map(({key,...r})=>r)}:{}),
  instruction:'Dördüncü adım. Dönen bütün kaynakları doğru ürün, pazar, metrik ve dönem bakımından değerlendir. Proof kimlikleri ile geçerli kanıtları seç. Önceki geçerli kararları tekrar yazma. Her farklı öğeyi bir kez say. Numune sayısı ile metriğin yeterliliğini ayırt et. Tavily alıntısı doğrulama için yetersizse, özellikle rakibin kendi ürün sayfası için, commands içinde read aracına gözlemlenmiş URL’yi ver. Ek arama için tavily veya gemini aracına net sorgu ve limit ver. Varsayılan araçlar yeterliyse scraper çağırma. Yetersizse yalnız açık ihtiyaç için uygun scraper, gözlemlenen URL veya hedefli sorgu, mod ve örneklemi seç. Önceki çağrıyı tekrarlama. Bir sonraki ihtiyaç ortaya çıktıysa newNeeds ile ekle. Rakipleri ürün, pazar, fiyat bandı ve kanalla karşılaştır. Peers alanında kaynaklı adayları ve özgün ürün URL’sini göster. last doğruysa yeni komut ekleme. Bütün görevler tamamlandı ve kanıt yeterliyse approve true. Ticari teşhisi beşinci adıma bırak.'+
   (!guarded?' Kalan araştırma faydasızsa yeni komut ekleme ve boşlukları açık bırak.':'')+
   (ordered?' Bu turda yalnız tek bir sonraki işi seç. Önce son emrin sonucuna bak; ona bağlı iş ve sorguyu şimdi belirle. Bir araç hata verdiyse veya metrik için veri yetersizse sıradaki uygun aracı kendin seç. Yeni ihtiyaçları öncelik sırasıyla kaydet. Bir sonraki çağrı için genel araştırma verme; tek metrik, hedef, dönem ve gerekli en küçük örneklemi belirt.':'')+
   ' Her ihtiyacın yeterli olup olmadığına sufficient alanında sen karar ver; örneklem sayısını bulgu kotası olarak kullanma. Uygun bir ihtiyacın kanıtı Gemini ve Tavily birlikte denendikten sonra hâlâ yetersizse scraper kullan. missingDefaults varsa o iş için önce oradaki varsayılan aracı hedefli bir emirle çağır. Seçilen scraper istenen dönem, mod veya kayıt sayısını desteklemiyorsa talebi genişletmeden uygun bir başka araç seç. waitingNeeds planlanıp henüz çalıştırılmamış işlerdir. Hâlâ gereklilerse commands alanında aracı ve net sorguyu seç.'+
   (guarded?' Bilgi eksikse ve yeni bir araştırma çağrısı bütçeye sığıyorsa yazıma geçme. Açık kalan ölçüm için önceki çağrılardan farklı, uygulanabilir bir sonraki hedefli sorguyu seç. Bir komutun çalışmaması veya hiç komut üretmemek araştırmayı bitirme gerekçesi değildir. approve ancak bütün açık ihtiyaçlar kaynakla karşılandığında true olabilir.':'')+
   (plan.qualityReport?' Bir rakip ihtiyacını ancak rakibin kendi sitesinden okunmuş ilgili ürün veya satış kanalı kanıtıyla yeterli say. Arama alıntısında aday bulunmuşsa gözlemlenen ürün sayfasını read ile aç. Adayı peers alanına ekle. Aynı metriğe tekrar dönmeden önce henüz çalışılmamış gerekli ihtiyaçları değerlendir.':'')+
   (targeted?' commands.id aynen needs veya bu turdaki newNeeds kimliği olmalı. commandHistory içindeki uygulanmış komutu tekrarlama. Aynı URL okunmuşsa yeni ilgili sayfa veya başka bir ihtiyaç seç. Rakip için ürün ve hedef pazar kadar bağımsızlığı, satış kanalını ve fiyat örtüşmesini değerlendir. peers.relationship değerini doğrudan kaynakla kıyaslanan bağımsız rakip için direct, belirsiz aday için candidate, bağlantılı marka için related yaz. Bir adayın ürünü görülünce bütün rakip planı bitmiş sayılmaz. Resmi tablo veya rapor bulunduysa ölçümün birimini, dönemini ve kapsamını başlıkla birlikte okumak için URL’yi read aracına ver. Zayıf sonuçta bir sonraki emri farklı kaynakla veya daha dar metrikle ver.':'')+
   (incremental?' Son aramadaki kanıtın hangi ihtiyacı karşıladığını bir sonraki sorgudan önce decisions alanında kaydet. İki kanalda fiyat kıyaslanacaksa aynı ürün kodu veya tam varyantı iki gerçek kaynakta eşleştir. Para birimini, satış birimini ve dönemi doğrula. İlgili sayfa zaten bulunmuşsa önce read ile doğrudan kaynağı oku.':'')+
   (gap?' Kullanıcı açıkça eksik kısımları tamamlamayı seçti. Yalnız eligibleSections içindeki eksikleri, existing ve kaydedilmiş kaynakları kullanarak tamamla. Gerekli ek işleri kendin belirle. Daha önce aranan metrik ve kaynakları yeniden satın alma.':'')
 },targeted&&ordered?targetedReviewSchema:ordered?orderedReviewSchema:reviewSchema,last?1150:1700,targeted&&capacity?.minimumDefaultKurus?
  {reserveForFollowingKurus:capacity.minimumDefaultKurus}:{});
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
  checked.set(row.id,{...row,proofs:row.proofs.filter(id=>related.some(f=>f.id===id))});
  if(incremental)for(const fact of related)seen.add(fact.id);
 }
 const peers=uniqueBy([...(latest?.peers||[]),...data.peers].filter(p=>researchUrl(p.url)&&researchHost(p.url)!==researchHost(brief.website)),p=>researchHost(p.url));
 if(rivalHosts)rivalHosts=peerHosts([...rounds.flatMap(r=>r.peers||[]),...peers],brief.website,targeted);
 const omitted=incremental?await checkNew(capacity?.minimumDefaultKurus||0):{};
 const decisions=[...checked.values()];
 const openNeeds=priorNeeds.filter(open);
 const actionable=ordered?[...openNeeds,...newNeeds]:openNeeds;
 const approved=data.approve&&!data.commands.length&&!data.newNeeds.length&&(!guarded||!openNeeds.length);
 if(last||approved)return {approved,decisions,peers,openNeeds:openNeeds.map(n=>n.id),...proofCheckpoint(),
  ...(approved&&guarded?{stopReason:'evidence_confirmed'}:{}),...(!approved?{issue:'research_needs_open'}:{})};

 const commandKey=targeted?commandSignature:c=>hash([c.id,c.tool,c.query,c.url,c.mode,c.limit]);
 const commandState=c=>!actionable.some(n=>n.id===c.id&&inScope(n))?'need_unavailable':
  attempted.has(commandKey(c))||targeted&&c.tool==='read'&&alreadyRead(c.id,c.url)?'duplicate':
  c.tool==='read'&&!knownUrls.includes(researchUrl(c.url))?'unknown_url':null;
 const pendingCommands=uniqueBy(data.commands.filter(c=>targeted?!commandState(c):!attempted.has(commandKey(c))),commandKey);
 const commands=ordered?pendingCommands.slice(0,1):pendingCommands;
 const requests=ordered?[]:[...newNeeds];
 const used=[];
 for(const c of commands.filter(c=>['default','tavily','gemini'].includes(c.tool)&&c.query.trim())){
  const need=actionable.find(n=>n.id===c.id&&inScope(n));
  const tool=c.tool==='default'?(need?.first||'tavily'):c.tool;
  if(!need||!available(tool))continue;
  if(gap&&previouslyAsked.has(compact(c.query).toLocaleLowerCase('tr')))continue;
  requests.push({...need,first:tool,query:c.query,quantity:c.limit});
  used.push(c);
 }
 const tried=(id,tool)=>!available(tool)||receipts.some(r=>r.id===id&&r.attempts?.some(a=>a.tool===tool));
 const requestedIds=new Set(requests.map(r=>r.id));
 const selected=[];
 const deferred=new Map();
 for(const command of commands.filter(c=>actors.includes(c.tool)&&!requestedIds.has(c.id))){
  const need=openNeeds.find(n=>n.id===command.id&&inScope(n));
  if(!need)continue;
  if(ordered&&queryActors.has(command.tool)&&!command.query.trim())continue;
  const missing=defaultTools.filter(tool=>!tried(need.id,tool));
  if(missing.length){
   if(!receipts.some(r=>r.id===need.id&&r.missingDefaults?.join()===missing.join()))
    deferred.set(need.id,{id:need.id,facts:[],urls:[],issues:['scraper_requires_default_tools'],missingDefaults:missing});
  }else{
   selected.push(command);
  }
 }
 const next=[...deferred.values(),...(await runScopedDefaults(requests,acquisition,readPages)).map(r=>({...r,defaultAttempt:true}))];
 const readers=commands.filter(c=>c.tool==='read'&&(ordered?actionable:priorNeeds).some(n=>n.id===c.id&&inScope(n))&&knownUrls.includes(researchUrl(c.url)));
 used.push(...readers);
 const byNeed=new Map();
 for(const c of readers){
  const urls=byNeed.get(c.id)||[];
  urls.push(researchUrl(c.url));
  byNeed.set(c.id,urls);
 }
 for(const [id,urls] of byNeed){
  const need=(ordered?actionable:priorNeeds).find(n=>n.id===id);
  const records=await readSearchEvidence([...new Set(urls)],readPages,targeted?need:undefined);
  next.push(...await extractFacts([{need,rows:records,urls}],acquisition,{excerptsOnly:incremental}));
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
  const records=evidenceRows(actorResult?.pages,c.limit,'extracted');
  const search=evidenceRows((actorResult?.searches||[]).flatMap(s=>s.results||[]),c.limit,'search-snippet');
  const read=await readSearchEvidence([...new Set(search.map(r=>r.url))],readPages);
  return {need,rows:[...records,...read,...search],issue:found.issue||actorResult?.reason,actorTarget:actorResult?.status==='complete'?{actor:c.tool,status:'complete',pages:records.map(({url})=>({url}))}:null};
 }));
 for(let i=0;i<scraped.length;i+=3)next.push(...await extractFacts(scraped.slice(i,i+3),acquisition));
 const issue=!next.length&&data.commands.length?'no_executable_research_command':undefined;
 const advanced=next.some(r=>r.facts.length||r.urls.length||r.missingDefaults?.length||
  r.attempts?.some(a=>!a.issue));
 const continuation=guarded&&!advanced?await keepResearchOpen({needs:[...openNeeds,...newNeeds],receipts:[...receipts,...next],
  providers:acquisition,readPages,issue,ordered,targeted,allowDispatch:!ordered||!next.length&&!used.length}):{closed:guarded?false:!next.length,issue};
 const {receipts:extra=[],...completion}=continuation;
 const followUpCheck=await checkBeforeWorkerEnds([...next,...extra],[...priorNeeds,...newNeeds]);
 return {approved:false,decisions:followUpCheck.decisions?[...checked.values()]:decisions,peers,newNeeds,receipts:[...next,...extra],commandKeys:used.map(commandKey),...completion,...proofCheckpoint(),
  ...(followUpCheck.issue||omitted.issue?{evidenceReviewIssue:followUpCheck.issue||omitted.issue}:{}),
  ...(targeted?{commandResults:data.commands.map(c=>({...c,key:commandKey(c),status:used.includes(c)?'executed':commandState(c)||'not_dispatched'}))}:{}),
  actorTargets:scraped.map(s=>s.actorTarget).filter(Boolean)};
}

function countProofs(need,proofs=[],facts){
 const ids=new Set(proofs);
 return new Set(facts.filter(f=>f.needId===need.id&&ids.has(f.id)).map(f=>f.item.toLocaleLowerCase('tr'))).size;
}
function confirmed(need,decision,facts,rivalHosts){
 if(rivalHosts&&comparisonNeed(need)&&!facts.some(f=>f.needId===need.id&&decision?.proofs?.includes(f.id)&&rivalHosts.has(researchHost(f.url))&&publisherRead(f)))return false;
 if(typeof decision?.sufficient==='boolean')return decision.sufficient&&decision.proofs.length>0;
 return countProofs(need,decision?.proofs,facts)>=need.quantity;
}

export function scopedEvidence(brand,plan,rounds){
 const needs=uniqueBy([...plan.needs,...rounds.flatMap(r=>r.newNeeds||[])],n=>n.id);
 const facts=uniqueBy(rounds.flatMap(r=>(r.receipts||[]).flatMap(row=>row.facts.map(f=>({...f,needId:row.id})))),f=>f.id);
 const checked=new Map(rounds.flatMap(r=>r.decisions||[]).map(row=>[row.id,row]));
 const clearance=rounds.findLast(r=>typeof r.approved==='boolean')||{};
 const peers=uniqueBy(rounds.flatMap(r=>r.peers||[]),p=>researchHost(p.url));
 const rivalHosts=plan.qualityReport?peerHosts(peers,brand.packet.entities.find(e=>e.role==='brand')?.website,plan.targetedEvidence):undefined;
 const coverage=needs.map(n=>({id:n.id,section:n.section,name:n.metric,status:confirmed(n,checked.get(n.id),facts,rivalHosts)?'confirmed':'open',
  ...(rivalHosts&&comparisonNeed(n)?{requiresPeer:true}:{}),
  proofs:facts.filter(f=>f.needId===n.id&&checked.get(n.id)?.proofs.includes(f.id))}));
 const accepted=coverage.flatMap(c=>c.proofs.map(f=>({...f,section:c.section})));
 const entities=peers.flatMap(p=>{
  const url=researchUrl(p.url);
  const host=researchHost(url);
  if(rivalHosts&&!rivalHosts.has(host)||!facts.some(f=>researchHost(f.url)===host&&(rivalHosts?publisherRead(f):f.method!=='search-snippet')))return [];
  return [{id:'peer_'+hash(researchHost(url)).slice(0,16),role:'competitor',name:p.name,website:url,scope:p.product,
   geographyReason:p.market,audienceReason:p.channel,scaleReason:p.priceBand}];
 });
 const sources=uniqueBy(facts,f=>f.url+' '+f.quote).map((f,i)=>({id:'ev'+(i+1),url:f.url,finalUrl:f.url,title:f.title||f.url,
  method:f.method,retrievedAt:brand.packet.asOf,scope:'Hedefli araştırma örneği.',...(f.metadataOnly?{metadataOnly:true}:{}),
  excerpts:[{id:'p0',text:f.quote,offset:0}],contentHash:hash(f.quote)}));
 return {packet:{...brand.packet,entities:[...brand.packet.entities,...entities],sources:[...brand.packet.sources,...sources]},accepted,coverage,needs,
  approved:clearance.approved===true&&(!rivalHosts||coverage.every(metric=>metric.status==='confirmed'))};
}
