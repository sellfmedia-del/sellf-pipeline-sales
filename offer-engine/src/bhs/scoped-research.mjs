import {searchActors} from './apify-inputs.mjs';
import {BudgetError,hash} from '../budget/ledger.mjs';
import {researchUrl,researchHost} from './research-url.mjs';
import {arr,obj,str} from './sequential-contracts.mjs';
import {assertSchema} from './schema.mjs';
import {managedSections} from './managed-report.mjs';

const sections=Object.keys(managedSections);
const section={type:'string',enum:sections};
const text=n=>({...str(n),minLength:1});
const number=(min,max)=>({type:'integer',minimum:min,maximum:max});
const understandingSchema=obj({understanding:text(2200)});
const needSchema=obj({id:text(20),section,target:text(150),market:text(100),metric:text(180),period:str(80),
 expected:text(240),quantity:number(1,12),query:text(340),country:str(2),language:str(2),
 first:{type:'string',enum:['tavily','gemini','both']},since:str(10)});
const planSchema=obj({needs:arr(needSchema,32)});
const factSchema=obj({proof:text(12),quote:str(420),item:text(180)});
const workerSchema=obj({results:arr(obj({id:text(20),facts:arr(factSchema,12),nextQuery:str(340)}),6)});
const commandSchema=obj({id:text(20),tool:text(90),query:str(340),url:str(2048),mode:{type:'string',enum:['default','posts','profile','reviews','engagement']},limit:number(1,12)});
const reviewSchema=obj({approve:{type:'boolean'},newNeeds:arr(needSchema,12),
 decisions:arr(obj({id:text(20),proofs:arr(text(28),24)}),48),commands:arr(commandSchema,16),peers:arr(obj({name:text(100),url:text(2048),product:text(160),market:text(110),priceBand:str(110),channel:str(110)}),10)});
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

export async function understandScopedBrand({brief,packet,providers}){
 const brand={name:brief.brandName,website:brief.website};
 const sources=packet.sources.filter(s=>!s.metadataOnly).slice(0,3).map(s=>({url:s.finalUrl||s.url,
  excerpts:s.excerpts.slice(0,3).map(e=>e.text.slice(0,520))}));
 return ask(providers,'bhs-scoped-brand',{brand,sources,instruction:
  'Birinci adım. Önce markayı tespit et ve anla. Ne sattığını, ürün veya hizmet gruplarını, kurumsal kimliğini, gelir modelini, ölçeğini, faaliyet pazarını ve sektörünü birlikte kavra. Markayı tanımak için önemli bulduğun diğer bilgileri kendin belirle. Anlayışını tek bir metinde özetle. Belirsiz olguları belirt ve görünmeyen olgu icat etme. Bu aşamada kart briefine bakma, araştırma planı veya teklif kapsamı hazırlama.'},understandingSchema,1400);
}

export async function understandScopedBrief({brief,identity,providers}){
 if(!identity)return {issue:'brand_understanding_unavailable'};
 const {brandName,website,...card}=brief;
 return ask(providers,'bhs-scoped-brief',{identity,card,instruction:
  'İkinci adım. Şimdi BHS öncesinde karta girilen briefi oku. Birinci adımda oluşturduğun marka anlayışını bağlam olarak kullan. Markanın ne istediğini, başarıdan ne anladığını ve teklifin hangi işleri kapsaması gerektiğini açıkla. Önemli gördüğün koşulları kendin belirle. Bu adımda araştırma planı ya da teşhis yazma.'},understandingSchema,1500);
}

export async function planScopedResearch({brief,identity,briefUnderstanding,asOf,providers}){
 if(!identity||!briefUnderstanding)return {needs:[],issue:'brief_understanding_unavailable'};
 const request={brand:brief.brandName,identity,briefUnderstanding,sections:managedSections,asOf,instruction:
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
  return {id:need.id,facts,urls:[...new Set([...urls,...rows.map(r=>r.url)])],attempts,nextQuery:output?.nextQuery||'',
   issues:[issue,result.issue,...attempts.map(a=>a.issue)].filter(Boolean)};
 });
}

export async function runScopedDefaults(needs,providers,readPages){
 // Group independent tasks while bounding provider concurrency.
 const results=[];
 for(let i=0;i<needs.length;i+=3)results.push(...await seekDefault(needs.slice(i,i+3),providers,readPages));
 return results;
}

export async function reviewScopedResearch({identity,briefUnderstanding,plan,rounds,providers,brief,packet,readPages,last=false,eligibleSections=sections,existing=[],gap=false,acquisition=providers}){
 const priorNeeds=uniqueBy([...plan.needs,...rounds.flatMap(round=>round.newNeeds||[])],n=>n.id);
 const receipts=rounds.flatMap(round=>round.receipts||[]);
 const facts=uniqueBy(receipts.flatMap(r=>r.facts.map(f=>({...f,needId:r.id}))),f=>f.id);
 const checked=new Map(rounds.flatMap(round=>round.decisions||[]).map(row=>[row.id,row.proofs]));
 const open=need=>countProofs(need,checked.get(need.id),facts)<need.quantity;
 const actors=!last&&priorNeeds.some(n=>open(n)&&eligibleSections.includes(n.section))?(await attempt(()=>acquisition.availableActors?.())).value||[]:[];
 const latest=rounds.at(-1);
 const denied=tool=>receipts.some(r=>r.attempts?.some(a=>a.tool===tool&&[401,403,404,429,432,433,434].includes(a.providerStatus)));
 const attempted=new Set(rounds.flatMap(r=>r.commandKeys||[]));
 const waitingNeeds=priorNeeds.filter(n=>!receipts.some(receipt=>receipt.id===n.id&&receipt.defaultAttempt)).map(n=>n.id);
 const knownUrls=[...new Set([...receipts.flatMap(r=>r.urls),...packet.sources.flatMap(s=>[s.finalUrl||s.url,
  ...(s.technicalSignals?.navigation||[]).map(l=>l.url)])])].filter(Boolean);
 const result=await ask(providers,last?'bhs-scoped-clearance':'bhs-scoped-review',{
  identity,briefUnderstanding,asOf:packet.asOf,needs:priorNeeds,waitingNeeds,findings:facts,checked:[...checked],tools:actors,last,eligibleSections,knownUrls,...(gap?{existing}:{}),
  defaults:{tavily:!denied('tavily'),gemini:!denied('gemini')},
  previous:receipts.map(r=>({id:r.id,attempts:r.attempts,issues:r.issues,nextQuery:r.nextQuery,urls:r.urls})),
  instruction:'Dördüncü adım. Dönen bütün kaynakları doğru ürün, pazar, metrik ve dönem bakımından değerlendir. Proof kimlikleri ile geçerli kanıtları seç. Önceki geçerli kararları tekrar yazma. Her farklı öğeyi bir kez say. Numune sayısı ile metriğin yeterliliğini ayırt et. Tavily alıntısı doğrulama için yetersizse, özellikle rakibin kendi ürün sayfası için, commands içinde read aracına gözlemlenmiş URL’yi ver. Ek arama için tavily veya gemini aracına net sorgu ve limit ver. Varsayılan araçlar yeterliyse scraper çağırma. Yetersizse yalnız açık ihtiyaç için uygun scraper, gözlemlenen URL veya hedefli sorgu, mod ve örneklemi seç. Önceki çağrıyı tekrarlama. Bir sonraki ihtiyaç ortaya çıktıysa newNeeds ile ekle. Rakipleri ürün, pazar, fiyat bandı ve kanalla karşılaştır. Peers alanında kaynaklı adayları ve özgün ürün URL’sini göster. last doğruysa yeni komut ekleme. Bütün görevler tamamlandı ve kanıt yeterliyse approve true. Kalan araştırma faydasızsa yeni komut ekleme ve boşlukları açık bırak. Ticari teşhisi beşinci adıma bırak.'+
   ' waitingNeeds henüz başlamamış plan öğeleridir. Hâlâ gereklilerse commands alanında ilgili aracı ve net sorguyu seç. Bir araç erişilemezse diğer varsayılan aracı veya doğrulanmış hedefli scraper’ı değerlendir.'+
   (gap?' Kullanıcı açıkça eksik kısımları tamamlamayı seçti. Yalnız eligibleSections içindeki eksikleri, existing ve kaydedilmiş kaynakları kullanarak tamamla. Gerekli ek işleri kendin belirle. Daha önce aranan metrik ve kaynakları yeniden satın alma.':'')
 },reviewSchema,last?1150:1700);
 if(!result.value)return {issue:result.issue||'research_clearance_unavailable',
  ...(['provider_unavailable','claude_spend_limit','not_configured'].includes(result.issue)?{closed:true}:{})};
 const data=result.value;
 const ids=new Set(priorNeeds.map(n=>n.id));
 const previouslyAsked=new Set(priorNeeds.map(n=>compact(n.query).toLocaleLowerCase('tr')));
 const newNeeds=last?[]:uniqueBy(data.newNeeds.filter(n=>!ids.has(n.id)&&eligibleSections.includes(n.section)&&
  (!gap||!previouslyAsked.has(compact(n.query).toLocaleLowerCase('tr')))),n=>n.id);
 for(const row of data.decisions)if(ids.has(row.id))checked.set(row.id,row.proofs);
 const decisions=[...checked].map(([id,proofs])=>({id,proofs}));
 const openNeeds=priorNeeds.filter(open);
 const approved=data.approve&&!data.commands.length&&!data.newNeeds.length;
 const peers=uniqueBy([...(latest?.peers||[]),...data.peers].filter(p=>researchUrl(p.url)&&researchHost(p.url)!==researchHost(brief.website)),p=>researchHost(p.url));
 if(last||approved)return {approved,decisions,peers,openNeeds:openNeeds.map(n=>n.id),...(!approved?{issue:'research_needs_open'}:{})};

 const defaulted=new Set(receipts.filter(r=>r.defaultAttempt).map(r=>r.id));
 const commandKey=c=>hash([c.id,c.tool,c.query,c.url,c.mode,c.limit]);
 const commands=uniqueBy(data.commands.filter(c=>!attempted.has(commandKey(c))),commandKey);
 const requests=[...newNeeds];
 const used=[];
 for(const c of commands.filter(c=>['default','tavily','gemini'].includes(c.tool)&&c.query.trim())){
  const need=openNeeds.find(n=>n.id===c.id&&eligibleSections.includes(n.section));
  const tool=c.tool==='default'?(need?.first||'tavily'):c.tool;
  if(!need||denied(tool))continue;
  if(gap&&previouslyAsked.has(compact(c.query).toLocaleLowerCase('tr')))continue;
  requests.push({...need,first:tool,query:c.query,quantity:c.limit});
  used.push(c);
 }
 const next=(await runScopedDefaults(requests,acquisition,readPages)).map(r=>({...r,defaultAttempt:true}));
 const readers=commands.filter(c=>c.tool==='read'&&ids.has(c.id)&&knownUrls.includes(researchUrl(c.url)));
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
 const eligible=new Set(openNeeds.filter(n=>eligibleSections.includes(n.section)).map(n=>n.id));
 const requestIds=new Set(requests.map(r=>r.id));
 const selected=commands.filter(c=>actors.includes(c.tool)&&defaulted.has(c.id)&&eligible.has(c.id)&&!requestIds.has(c.id));
 used.push(...selected);
 const scraped=await Promise.all(selected.map(async c=>{
  const need=openNeeds.find(n=>n.id===c.id);
  const candidate=peers.find(p=>p.name.toLocaleLowerCase('tr')===need.target.toLocaleLowerCase('tr')&&known.some(row=>row.url===researchUrl(p.url)));
  const targetBrief=candidate?{...brief,brandName:candidate.name,website:candidate.url}:brief;
  const targetPacket=candidate?(await attempt(()=>readPages([candidate.url]))).value||packet:packet;
  const isSearch=searchActors.includes(c.tool);
  const found=await attempt(()=>acquisition.enrich({actor:c.tool,url:isSearch?targetBrief.website:researchUrl(c.url),mode:c.mode,
   ...(c.query.trim()?{query:c.query,queries:[c.query]}:{}),maxResults:c.limit,since:need.since,countryCode:need.country.toUpperCase(),language:need.language},
  {brief:targetBrief,packet:targetPacket,searches:[{results:known}],scrapes:rounds.flatMap(r=>r.actorTargets||[]),geo:{countryCode:need.country.toUpperCase(),language:need.language}}));
  const actorResult=found.value;
  const records=evidenceRows(actorResult?.pages,c.limit,'extracted');
  const search=evidenceRows((actorResult?.searches||[]).flatMap(s=>s.results||[]),c.limit,'search-snippet');
  const read=await readSearchEvidence([...new Set(search.map(r=>r.url))],readPages);
  return {need,rows:[...records,...read,...search],issue:found.issue||actorResult?.reason,actorTarget:actorResult?.status==='complete'?{actor:c.tool,status:'complete',pages:records.map(({url})=>({url}))}:null};
 }));
 for(let i=0;i<scraped.length;i+=3)next.push(...await extractFacts(scraped.slice(i,i+3),acquisition));
 return {approved:false,decisions,peers,newNeeds,receipts:next,commandKeys:used.map(commandKey),closed:!data.commands.length&&!newNeeds.length,
  actorTargets:scraped.map(s=>s.actorTarget).filter(Boolean)};
}

function countProofs(need,proofs=[],facts){
 const ids=new Set(proofs);
 return new Set(facts.filter(f=>f.needId===need.id&&ids.has(f.id)).map(f=>f.item.toLocaleLowerCase('tr'))).size;
}

export function scopedEvidence(brand,plan,rounds){
 const needs=uniqueBy([...plan.needs,...rounds.flatMap(r=>r.newNeeds||[])],n=>n.id);
 const facts=uniqueBy(rounds.flatMap(r=>(r.receipts||[]).flatMap(row=>row.facts.map(f=>({...f,needId:row.id})))),f=>f.id);
 const checked=new Map(rounds.flatMap(r=>r.decisions||[]).map(row=>[row.id,row.proofs]));
 const clearance=rounds.findLast(r=>typeof r.approved==='boolean')||{};
 const coverage=needs.map(n=>({id:n.id,section:n.section,name:n.metric,status:clearance.approved||countProofs(n,checked.get(n.id),facts)>=n.quantity?'confirmed':'open',
  proofs:facts.filter(f=>f.needId===n.id&&checked.get(n.id)?.includes(f.id))}));
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
