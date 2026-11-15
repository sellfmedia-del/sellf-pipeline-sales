import {searchActors} from './apify-inputs.mjs';
import {BudgetError,hash} from '../budget/ledger.mjs';
import {researchUrl,researchHost} from './research-url.mjs';
import {arr,obj,str} from './sequential-contracts.mjs';
import {assertSchema} from './schema.mjs';
import {managedSections} from './managed-report.mjs';

const sections=Object.keys(managedSections);
const section=str(100);
const text=n=>({...str(n),minLength:1});
const number=(min,max)=>({type:'integer',minimum:min,maximum:max});
const understandingSchema=obj({understanding:text(2200)});
const brandSchema=obj({understanding:text(2200),pages:arr(text(2048),6),
 searches:arr(obj({query:text(340),tool:{type:'string',enum:['tavily','gemini']},limit:number(1,6)}),4)});
const needSchema=obj({id:text(20),section,target:text(150),market:text(100),metric:text(180),period:str(80),
 expected:text(240),quantity:number(1,12),query:text(340),country:str(2),language:str(2),
 first:{type:'string',enum:['tavily','gemini','both']},since:str(10)});
const planSchema=obj({needs:arr(needSchema,32)});
const factSchema=obj({proof:text(12),quote:str(420),item:text(180)});
const workerSchema=obj({results:arr(obj({id:text(20),facts:arr(factSchema,12),nextQuery:str(340)}),6)});
const commandSchema=obj({id:text(20),tool:text(90),query:str(340),url:str(2048),mode:{type:'string',enum:['default','posts','profile','reviews','engagement']},limit:number(1,12)});
const reviewSchema=obj({approve:{type:'boolean'},newNeeds:arr(needSchema,12),
 decisions:arr(obj({id:text(20),sufficient:{type:'boolean'},proofs:arr(text(28),24)}),48),commands:arr(commandSchema,16),peers:arr(obj({name:text(100),url:text(2048),product:text(160),market:text(110),priceBand:str(110),channel:str(110)}),10)});
const compact=s=>String(s||'').replace(/\s+/g,' ').trim();
const uniqueBy=(rows,key)=>[...new Map(rows.map(row=>[key(row),row])).values()];
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

export async function understandScopedBrand({brief,packet,providers,prior,readPages}){
 const brand={name:brief.brandName,website:brief.website};
 const observed=new Set(packet.sources.flatMap(s=>[s.finalUrl||s.url,...(s.technicalSignals?.navigation||[]).map(l=>l.url)]).map(researchUrl).filter(Boolean));
 const lookedUp=new Set(prior?.lookedUp||[]),visited=new Set(prior?.visited||packet.sources.map(s=>researchUrl(s.finalUrl||s.url)));
 const hints=[...(prior?.hints||[])];
 if(prior){
  const targets=(prior.value?.pages||[]).map(researchUrl).filter(url=>observed.has(url)&&!visited.has(url));
  for(const {query,tool,limit} of prior.value?.searches||[]){
   const key=hash([tool,query,limit]);
   if(lookedUp.has(key))continue;
   lookedUp.add(key);
   const search=await attempt(()=>tool==='gemini'
    ?providers.searchGemini?.({query,quantity:limit,target:brand.name,metric:'Markanın kimliği, ürün grubu ve faaliyet pazarı'},{maxResults:limit})
    :providers.search(query,{depth:'basic',maxResults:limit}));
   for(const row of (search.value?.results||[]).slice(0,limit)){
    const url=researchUrl(row.url);
    if(!url||visited.has(url))continue;
    targets.push(url);
    hints.push({url,title:row.title});
   }
  }
  if(!targets.length&&lookedUp.size===(prior.lookedUp||[]).length)return {...prior,done:true};
  const additions=[];
  for(const url of new Set(targets)){
   visited.add(url);
   const answer=await attempt(()=>readPages([url]));
   additions.push(...(answer.value?.sources||[]));
  }
  packet={...packet,sources:uniqueBy([...packet.sources,...additions],s=>s.finalUrl||s.url)
   .map((source,index)=>({...source,id:'ev'+(index+1)}))};
 }
 const sources=packet.sources.filter(s=>!s.metadataOnly).map(s=>({url:s.finalUrl||s.url,title:s.title,
  excerpts:s.excerpts.slice(0,3).map(e=>e.text.slice(0,520)),
  links:(s.technicalSignals?.navigation||[]).map(({url,label})=>({url,label}))}));
 const result=await ask(providers,'bhs-scoped-brand',{brand,sources,hints,priorUnderstanding:prior?.value?.understanding,instruction:
  'Birinci adım. Önce markayı tespit et ve anla. Ne sattığını, ürün veya hizmet gruplarını, kurumsal kimliğini, gelir modelini, ölçeğini, faaliyet pazarını ve sektörünü birlikte kavra. Önemli gördüğün diğer bilgileri kendin belirle. Mevcut bilgiler yeterliyse anlayışını özetle ve pages ile searches boş kalsın. Bilgi eksikse yalnız doğrudan gerekli, gördüğün bağlantıları pages alanında veya Gemini/Tavily için marka kimliğine yönelik kısa sorguyu searches alanında seç. Belirsizlikleri belirt. Kart briefi ve teklif bu adımdan sonra gelir.'},brandSchema,1400);
 const value=result.value||prior?.value;
 return {...result,value,packet,hints,lookedUp:[...lookedUp],visited:[...visited],
  done:!result.value||!result.value.pages?.length&&!result.value.searches?.length};
}

export async function understandScopedBrief({brief,identity,providers}){
 if(!identity)return {issue:'brand_understanding_unavailable'};
 const {brandName,website,...card}=brief;
 return ask(providers,'bhs-scoped-brief',{identity,card,instruction:
  'İkinci adım. Şimdi BHS öncesinde karta girilen briefi oku. Birinci adımda oluşturduğun marka anlayışını bağlam olarak kullan. Markanın ne istediğini, başarıdan ne anladığını ve teklifin hangi işleri kapsaması gerektiğini açıkla. Önemli gördüğün koşulları kendin belirle. Bu adımda araştırma planı ya da teşhis yazma.'},understandingSchema,1500);
}

export async function planScopedResearch({brief,identity,briefUnderstanding,asOf,providers}){
 if(!identity||!briefUnderstanding)return {needs:[],issue:'brief_understanding_unavailable'};
 const request={brand:brief.brandName,identity,briefUnderstanding,asOf,instruction:
  'Üçüncü adım. Marka anlayışı ve brief değerlendirmesinden araştırma planını çıkar. Hedef Avrupa pazarına girmekse gümrük süreçleri, aktif distribütörler ve pazar doygunluğu gibi karar sorularını seç. Hedef ciro artırmaksa fiyat, rakip satışı, müşteri memnuniyeti ve erişilebilir pazarlama ve satış verimine odaklan. Bunlar örnektir. Konu ve görev sayısına sen karar ver. İlk gönderimde teklif kararını en çok değiştiren ve doğrudan çalışılabilir ihtiyaçlara öncelik ver. Bir önceki aramanın sonucuna bağlı sonraki işleri sonuç geldiğinde belirle. Örneğin önce doğru rakipleri bul, sonra onların metriklerini iste. Her işe tek bir net emir yaz. Hedefi, platformu, dönemi, metriği ve gereken en küçük örneklemi ver. On aktif distribütör isteniyorsa quantity 10. Instagram son bir ay isteniyorsa since alanı YYYY-MM-DD, quantity gerekli gönderi sayısı olsun. Gerekli olmayan tarih boş olsun. Gemini, Tavily veya ikisini seç. İkisini yalnız kanıt türleri birbirini tamamlayacaksa seç. Pazar ve dili sorguda koru. Bölüm kodları rapor aktarımı içindir.'};
 const normalizeData=data=>{
  if(!Array.isArray(data?.needs))return data;
  const needs=data.needs.flatMap(need=>{
   if(!need||typeof need!=='object')return [];
   const fields=Object.fromEntries(Object.entries(needSchema.properties).map(([key,field])=>{
    const value=need[key];
    if(field.type==='string'&&typeof value==='string')return [key,value.trim().slice(0,field.maxLength).toWellFormed()];
    return [key,value];
   }));
   try{assertSchema(fields,needSchema);return [fields];}catch{return [];}
  });
  if(!needs.length&&data.needs.length)throw new BudgetError('model_output_invalid','Claude’un araştırma emri doğrulanamadı.');
  return {needs:needs.slice(0,planSchema.properties.needs.maxItems)};
 };
 let result=await ask(providers,'bhs-scoped-plan',request,planSchema,3800,{normalizeData});
 if(['incomplete','invalid_report','model_output_invalid'].includes(result.issue))
  result=await ask(providers,'bhs-scoped-plan-compact',{...request,instruction:request.instruction+' Yalnız hemen başlayacağın en öncelikli ilk işleri kısa ifadelerle yaz. Tüm olası sorguları listeleme. Tek bir tamamlanmış JSON döndür.'},planSchema,3500,{normalizeData,plainJson:true});
 const needs=uniqueBy(result.value?.needs||[],n=>n.id);
 return {needs,...(result.issue?{issue:result.issue}:{})};
}

function evidenceRows(result,limit,method){
 return (result||[]).flatMap(row=>{
  const url=researchUrl(row.finalUrl||row.url);
  const content=compact(row.text||row.content).slice(0,950);
  return url&&content.length>=24?[{url,title:compact(row.title).slice(0,150),content,method}]:[];
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
  const rows=attempts.flatMap(({value})=>evidenceRows(value?.results,need.quantity,'search-snippet'));
  const urls=[...new Set(attempts.flatMap(({value})=>(value?.results||[]).map(row=>researchUrl(row.url)).filter(Boolean)))];
  // Tavily already provides excerpts. Resolve grounded publisher links, whose
  // Gemini-generated summaries are discovery hints rather than source text.
  const toRead=[...new Set(attempts.filter(({tool})=>tool==='gemini').flatMap(({value})=>
   (value?.results||[]).map(row=>researchUrl(row.url)).filter(Boolean)))];
  const read=await readSearchEvidence(toRead,readPages);
  return {need,rows:uniqueBy([...read,...rows],row=>row.url+' '+row.content),urls,
   attempts:attempts.map(({tool,issue,providerStatus})=>({tool,issue,providerStatus}))};
 }));
 return extractFacts(searches,providers);
}

async function readSearchEvidence(urls,readPages){
 const sources=[];
 for(let i=0;i<urls.length;i+=5){
  const read=await attempt(()=>readPages(urls.slice(i,i+5)));
  sources.push(...(read.value?.sources||[]));
 }
 return evidenceRows(sources.map(source=>({...source,text:source.excerpts?.map(e=>e.text).join(' ')})),sources.length,'extracted');
}

async function extractFacts(searches,providers){
 const inputs=searches.map(search=>({...search,rows:search.rows.map((row,i)=>({...row,proof:'p'+(i+1)}))}));
 const withRows=inputs.filter(input=>input.rows.length&&input.rows.length<=input.need.quantity*2);
 const result=withRows.length?await attempt(()=>(providers.geminiWorker||providers.worker)('bhs-scoped-extract',{
  instruction:'Her iş için yalnız talep edilen metriği karşılayan kaynak kimliklerini seç. Bir öğeyi iki kez sayma. Her öğe için ayırt edici ad ve kaynağın proof kimliğini ver. Özgün alıntıyı aynen kopyalayabiliyorsan quote içine yaz, yoksa boş bırak. Eksik veri varsa bir sonraki hedefli aramaya aday ad veya sorgu öner. Harici bilgi ve kaynak URL uydurma.',
  requests:withRows.map(({need,rows})=>({need,sources:rows.map(({proof,url,content})=>({proof,url,content}))}))
 },workerSchema,{maxOutputTokens:1800,minimumOutputTokens:760,compactWorker:true,generationTimeoutMs:28000})):{};
 return inputs.map(({need,rows,issue,attempts=[],urls=[]})=>{
  const output=result.value?.data?.results.find(r=>r.id===need.id);
  const makeFact=(source,quote,item)=>({id:'q'+hash([need.id,source.url,quote,item]).slice(0,18),quote,item,url:source.url,title:source.title,method:source.method});
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
 for(let i=0;i<needs.length;i+=3)results.push(...await seekDefault(needs.slice(i,i+3),providers,readPages));
 return results;
}

export function scopedResearchClosed(round,guarded=false){
 if(!guarded)return Boolean(round.approved||round.closed);
 return round.approved===true&&round.stopReason==='evidence_confirmed'||
  round.closed===true&&['research_budget_exhausted','research_tools_unavailable'].includes(round.stopReason);
}

const defaultDenied=(receipts,tool)=>receipts.some(r=>r.attempts?.some(a=>a.tool===tool&&
 (['not_configured','tariff_expired','fx_limit'].includes(a.issue)||[401,402,403,404,429,432,433,434].includes(a.providerStatus))));

// An empty or unusable controller response is not a budget decision. Reuse
// Claude's open need and focused query while an independent search still fits.
async function keepResearchOpen({needs,receipts,providers,readPages,issue}){
 const capacity=(await attempt(()=>providers.researchCapacity?.())).value;
 if(!capacity)return {closed:false,issue:issue||'research_capacity_unknown'};
 const defaults=capacity.defaults.filter(tool=>!defaultDenied(receipts,tool));
 if(!defaults.length&&!capacity.actors.length){
  const budget=capacity.workerBudgetExhausted||capacity.remainingKurus<=0||
   capacity.configuredDefaults.some(tool=>!defaultDenied(receipts,tool))||capacity.configuredActors?.length;
  const stopReason=budget?'research_budget_exhausted':'research_tools_unavailable';
  return {closed:true,stopReason,issue:stopReason};
 }
 for(const need of needs){
  const saved=receipts.filter(r=>r.id===need.id);
  const queries=uniqueBy([...saved.map(r=>r.nextQuery).filter(Boolean).reverse(),need.query],query=>compact(query).toLocaleLowerCase('tr'));
  const tools=defaults.includes(need.first)?[need.first,...defaults.filter(tool=>tool!==need.first)]:defaults;
  for(const query of queries)for(const tool of tools){
   if(saved.some(r=>compact(r.query||need.query).toLocaleLowerCase('tr')===compact(query).toLocaleLowerCase('tr')&&
    r.attempts?.some(a=>a.tool===tool&&a.issue!=='budget_limit')))continue;
   const [result]=await runScopedDefaults([{...need,query,first:tool}],providers,readPages);
   return {closed:false,issue:issue||'research_needs_open',receipts:[{...result,defaultAttempt:true}]};
  }
 }
 return {closed:false,issue:issue||'research_needs_open'};
}

export async function reviewScopedResearch({identity,briefUnderstanding,plan,rounds,providers,brief,packet,readPages,last=false,eligibleSections=sections,existing=[],gap=false,acquisition=providers}){
 const guarded=plan.reportOnlyAfterResearch===true&&!gap;
 const priorNeeds=uniqueBy([...plan.needs,...rounds.flatMap(round=>round.newNeeds||[])],n=>n.id);
 const receipts=rounds.flatMap(round=>round.receipts||[]);
 const facts=uniqueBy(receipts.flatMap(r=>r.facts.map(f=>({...f,needId:r.id}))),f=>f.id);
 const checked=new Map(rounds.flatMap(round=>round.decisions||[]).map(row=>[row.id,row]));
 const open=need=>!confirmed(need,checked.get(need.id),facts);
 const inScope=need=>!gap||eligibleSections.includes(need.section);
 const actors=!last&&priorNeeds.some(n=>open(n)&&inScope(n))?(await attempt(()=>acquisition.availableActors?.())).value||[]:[];
 const latest=rounds.at(-1);
 const denied=tool=>defaultDenied(receipts,tool);
 const attempted=new Set(rounds.flatMap(r=>r.commandKeys||[]));
 const waitingNeeds=priorNeeds.filter(n=>!receipts.some(receipt=>receipt.id===n.id&&receipt.defaultAttempt)).map(n=>n.id);
 const knownUrls=[...new Set([...receipts.flatMap(r=>r.urls),...packet.sources.flatMap(s=>[s.finalUrl||s.url,
  ...(s.technicalSignals?.navigation||[]).map(l=>l.url)])])].filter(Boolean);
 const result=await ask(providers,last?'bhs-scoped-clearance':'bhs-scoped-review',{
  identity,briefUnderstanding,asOf:packet.asOf,needs:priorNeeds,waitingNeeds,findings:facts,checked:[...checked.values()],tools:actors,last,knownUrls,...(gap?{existing,eligibleSections}:{}),
  defaults:{tavily:!denied('tavily'),gemini:!denied('gemini')},
  ...(guarded?{researchRound:rounds.length,previousIssue:latest?.issue}:{}),
  previous:receipts.map(r=>({id:r.id,attempts:r.attempts,issues:r.issues,missingDefaults:r.missingDefaults,nextQuery:r.nextQuery,urls:r.urls})),
  instruction:'Dördüncü adım. Dönen bütün kaynakları doğru ürün, pazar, metrik ve dönem bakımından değerlendir. Proof kimlikleri ile geçerli kanıtları seç. Önceki geçerli kararları tekrar yazma. Her farklı öğeyi bir kez say. Numune sayısı ile metriğin yeterliliğini ayırt et. Tavily alıntısı doğrulama için yetersizse, özellikle rakibin kendi ürün sayfası için, commands içinde read aracına gözlemlenmiş URL’yi ver. Ek arama için tavily veya gemini aracına net sorgu ve limit ver. Varsayılan araçlar yeterliyse scraper çağırma. Yetersizse yalnız açık ihtiyaç için uygun scraper, gözlemlenen URL veya hedefli sorgu, mod ve örneklemi seç. Önceki çağrıyı tekrarlama. Bir sonraki ihtiyaç ortaya çıktıysa newNeeds ile ekle. Rakipleri ürün, pazar, fiyat bandı ve kanalla karşılaştır. Peers alanında kaynaklı adayları ve özgün ürün URL’sini göster. last doğruysa yeni komut ekleme. Bütün görevler tamamlandı ve kanıt yeterliyse approve true. Kalan araştırma faydasızsa yeni komut ekleme ve boşlukları açık bırak. Ticari teşhisi beşinci adıma bırak.'+
   ' Her ihtiyacın yeterli olup olmadığına sufficient alanında sen karar ver; örneklem sayısını bulgu kotası olarak kullanma. Uygun bir ihtiyacın kanıtı Gemini ve Tavily birlikte denendikten sonra hâlâ yetersizse scraper kullan. missingDefaults varsa o iş için önce oradaki varsayılan aracı hedefli bir emirle çağır. Seçilen scraper istenen dönem, mod veya kayıt sayısını desteklemiyorsa talebi genişletmeden uygun bir başka araç seç. waitingNeeds planlanıp henüz çalıştırılmamış işlerdir. Hâlâ gereklilerse commands alanında aracı ve net sorguyu seç.'+
   (guarded?' Bilgi eksikse ve yeni bir araştırma çağrısı bütçeye sığıyorsa yazıma geçme. Açık kalan ölçüm için önceki çağrılardan farklı, uygulanabilir bir sonraki hedefli sorguyu seç. Bir komutun çalışmaması veya hiç komut üretmemek araştırmayı bitirme gerekçesi değildir. approve ancak bütün açık ihtiyaçlar kaynakla karşılandığında true olabilir.':'')+
   (gap?' Kullanıcı açıkça eksik kısımları tamamlamayı seçti. Yalnız eligibleSections içindeki eksikleri, existing ve kaydedilmiş kaynakları kullanarak tamamla. Gerekli ek işleri kendin belirle. Daha önce aranan metrik ve kaynakları yeniden satın alma.':'')
 },reviewSchema,last?1150:1700);
 if(!result.value&&guarded)return keepResearchOpen({needs:priorNeeds.filter(open),receipts,providers:acquisition,readPages,
  issue:result.issue||'research_clearance_unavailable'});
 if(!result.value)return {issue:result.issue||'research_clearance_unavailable',
  ...(['budget_limit','input_budget','provider_unavailable','claude_spend_limit','not_configured'].includes(result.issue)?{closed:true}:{})};
 const data=result.value;
 const ids=new Set(priorNeeds.map(n=>n.id));
 const previouslyAsked=new Set(priorNeeds.map(n=>compact(n.query).toLocaleLowerCase('tr')));
 const newNeeds=last?[]:uniqueBy(data.newNeeds.filter(n=>!ids.has(n.id)&&inScope(n)&&
  (!gap||!previouslyAsked.has(compact(n.query).toLocaleLowerCase('tr')))),n=>n.id);
 for(const row of data.decisions)if(ids.has(row.id))checked.set(row.id,{...row,proofs:row.proofs.filter(id=>facts.some(f=>f.id===id&&f.needId===row.id))});
 const decisions=[...checked.values()];
 const openNeeds=priorNeeds.filter(open);
 const approved=data.approve&&!data.commands.length&&!data.newNeeds.length&&(!guarded||!openNeeds.length);
 const peers=uniqueBy([...(latest?.peers||[]),...data.peers].filter(p=>researchUrl(p.url)&&researchHost(p.url)!==researchHost(brief.website)),p=>researchHost(p.url));
 if(last||approved)return {approved,decisions,peers,openNeeds:openNeeds.map(n=>n.id),
  ...(approved&&guarded?{stopReason:'evidence_confirmed'}:{}),...(!approved?{issue:'research_needs_open'}:{})};

 const commandKey=c=>hash([c.id,c.tool,c.query,c.url,c.mode,c.limit]);
 const commands=uniqueBy(data.commands.filter(c=>!attempted.has(commandKey(c))),commandKey);
 const requests=[...newNeeds];
 const used=[];
 for(const c of commands.filter(c=>['default','tavily','gemini'].includes(c.tool)&&c.query.trim())){
  const need=openNeeds.find(n=>n.id===c.id&&inScope(n));
  const tool=c.tool==='default'?(need?.first||'tavily'):c.tool;
  if(!need||denied(tool))continue;
  if(gap&&previouslyAsked.has(compact(c.query).toLocaleLowerCase('tr')))continue;
  requests.push({...need,first:tool,query:c.query,quantity:c.limit});
  used.push(c);
 }
 const defaultTools=['tavily','gemini'];
 const tried=(id,tool)=>denied(tool)||receipts.some(r=>r.id===id&&r.attempts?.some(a=>a.tool===tool));
 const requestedIds=new Set(requests.map(r=>r.id));
 const selected=[];
 const deferred=new Map();
 for(const command of commands.filter(c=>actors.includes(c.tool)&&!requestedIds.has(c.id))){
  const need=openNeeds.find(n=>n.id===command.id&&inScope(n));
  if(!need)continue;
  const missing=defaultTools.filter(tool=>!tried(need.id,tool));
  if(missing.length){
   if(!receipts.some(r=>r.id===need.id&&r.missingDefaults?.join()===missing.join()))
    deferred.set(need.id,{id:need.id,facts:[],urls:[],issues:['scraper_requires_default_tools'],missingDefaults:missing});
  }else{
   selected.push(command);
  }
 }
 const next=[...deferred.values(),...(await runScopedDefaults(requests,acquisition,readPages)).map(r=>({...r,defaultAttempt:true}))];
 const readers=commands.filter(c=>c.tool==='read'&&priorNeeds.some(n=>n.id===c.id&&inScope(n))&&knownUrls.includes(researchUrl(c.url)));
 used.push(...readers);
 const byNeed=new Map();
 for(const c of readers){
  const urls=byNeed.get(c.id)||[];
  urls.push(researchUrl(c.url));
  byNeed.set(c.id,urls);
 }
 for(const [id,urls] of byNeed){
  const need=priorNeeds.find(n=>n.id===id);
  const records=await readSearchEvidence([...new Set(urls)],readPages);
  next.push(...await extractFacts([{need,rows:records,urls}],acquisition));
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
  providers:acquisition,readPages,issue}):{closed:guarded?false:!next.length,issue};
 const {receipts:extra=[],...completion}=continuation;
 return {approved:false,decisions,peers,newNeeds,receipts:[...next,...extra],commandKeys:used.map(commandKey),...completion,
  actorTargets:scraped.map(s=>s.actorTarget).filter(Boolean)};
}

function countProofs(need,proofs=[],facts){
 const ids=new Set(proofs);
 return new Set(facts.filter(f=>f.needId===need.id&&ids.has(f.id)).map(f=>f.item.toLocaleLowerCase('tr'))).size;
}
function confirmed(need,decision,facts){
 if(typeof decision?.sufficient==='boolean')return decision.sufficient&&decision.proofs.length>0;
 return countProofs(need,decision?.proofs,facts)>=need.quantity;
}

export function scopedEvidence(brand,plan,rounds){
 const needs=uniqueBy([...plan.needs,...rounds.flatMap(r=>r.newNeeds||[])],n=>n.id);
 const facts=uniqueBy(rounds.flatMap(r=>(r.receipts||[]).flatMap(row=>row.facts.map(f=>({...f,needId:row.id})))),f=>f.id);
 const checked=new Map(rounds.flatMap(r=>r.decisions||[]).map(row=>[row.id,row]));
 const clearance=rounds.findLast(r=>typeof r.approved==='boolean')||{};
 const coverage=needs.map(n=>({id:n.id,section:n.section,name:n.metric,status:confirmed(n,checked.get(n.id),facts)?'confirmed':'open',
  proofs:facts.filter(f=>f.needId===n.id&&checked.get(n.id)?.proofs.includes(f.id))}));
 const accepted=coverage.flatMap(c=>c.proofs.map(f=>({...f,section:c.section})));
 const peers=uniqueBy(rounds.flatMap(r=>r.peers||[]),p=>researchHost(p.url));
 const entities=peers.flatMap(p=>{
  const url=researchUrl(p.url);
  if(!facts.some(f=>researchHost(f.url)===researchHost(url)&&f.method!=='search-snippet'))return [];
  return [{id:'peer_'+hash(researchHost(url)).slice(0,16),role:'competitor',name:p.name,website:url,scope:p.product,
   geographyReason:p.market,audienceReason:p.channel,scaleReason:p.priceBand}];
 });
 const sources=uniqueBy(facts,f=>f.url+' '+f.quote).map((f,i)=>({id:'ev'+(i+1),url:f.url,finalUrl:f.url,title:f.title||f.url,
  method:f.method,retrievedAt:brand.packet.asOf,scope:'Hedefli araştırma örneği.',
  excerpts:[{id:'p0',text:f.quote,offset:0}],contentHash:hash(f.quote)}));
 return {packet:{...brand.packet,entities:[...brand.packet.entities,...entities],sources:[...brand.packet.sources,...sources]},accepted,coverage,needs,
  approved:clearance.approved===true};
}
