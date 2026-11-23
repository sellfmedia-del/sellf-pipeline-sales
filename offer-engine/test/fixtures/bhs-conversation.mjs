import {createLedger,hash} from '../../src/budget/ledger.mjs';
import {sourceId} from '../../src/bhs/conversation-contract.mjs';
import {presentConversationSource} from '../../src/bhs/conversation-source.mjs';
import {collectSourceViews,emptyResearchProgress,updateResearchProgress} from '../../src/bhs/conversation-progress.mjs';
import {researchWorkPolicyVersion} from '../../src/bhs/conversation-work.mjs';

export const brief={brandName:'Örnek Pet',segment:'kobi',website:'https://pet.example.com/',
 goals:'Türkiye pazarında büyümek ve ciro artışı.',needs:'Web sitesi ve online satış kanallarının yönetimi. Amazon tarafında mevcut bir partner var.',
 services:'Markalaşma ve perakende için iki alternatif değerlendirilecek.',meetingNotes:'Türkiye öncelikli; ABD ve UK sonraki aşamada değerlendirilecek.',budget:null};
export const source={id:sourceId(brief.website),url:brief.website,title:'Örnek Pet',method:'extracted',
 text:'Kıtık açıcı tüy bakım spreyi ve kedi kumu spreyi. Sipariş için Shopier mağazamızı veya WhatsApp hattını kullanabilirsiniz.',retrievedAt:'2026-11-20T10:00:00.000Z',links:[]};
export const marketSource={...source,id:sourceId('https://market.example.com/pet-care'),url:'https://market.example.com/pet-care',title:'Sentetik pazar kaynağı',
 text:'Türkiye pet bakım alıcıları ürünü uzman mağazalarda ve çevrim içi pazaryerlerinde karşılaştırır. Bakım ihtiyacına uygun kullanım açıklaması ürün seçimini etkiler.'};
export const peerSource={...source,id:sourceId('https://peer.example.com/coat-care'),url:'https://peer.example.com/coat-care',title:'Sentetik rakip ürün kaynağı',
 text:'Örnek Rakip Türkiye içinde kedi ve köpekler için tüy açıcı bakım spreyi satıyor. Ürün sayfasında uygulama videosu ve doğrudan sipariş seçeneği var.'};
export const usageSource={...source,id:sourceId('https://care.example.com/detangling'),url:'https://care.example.com/detangling',title:'Sentetik kullanım kaynağı',
 text:'Tüy bakım ürünlerinde uygulama miktarı ve kullanım sıklığı ürün seçimini etkileyebilir. Ürünün hayvan türüne uygunluğu ve kullanım adımları anlaşılır biçimde açıklanmalıdır.'};
export const researchSources=[source,marketSource,peerSource,usageSource];
export const researchProgressInput=()=>({objective:'Markanın Türkiye büyüme hedefi için ürün, kanal ve rekabet kararlarını anlamak.',questions:[
 {id:'brand',question:'Marka hangi ürünü ve sipariş yolunu sunuyor?',access:'public',important:true,status:'answered',answer:'Ürün tanıtımı harici sipariş kanallarına yönleniyor.',sourceIds:[source.id],attemptedUrls:[],rationale:''},
 {id:'market',question:'Pazarda kanal ve kullanım davranışının anlamı ne?',access:'public',important:true,status:'answered',answer:'Uzman mağaza ve pazaryerinde karşılaştırma; kullanım anlatımı önemli olabilir.',sourceIds:[marketSource.id,usageSource.id],attemptedUrls:[],rationale:''},
 {id:'competition',question:'Hangi rakip neden alternatif?',access:'public',important:true,status:'answered',answer:'Örnek Rakip aynı ihtiyaca ürün sunuyor; videosu ve sipariş yolu farklı.',sourceIds:[peerSource.id],attemptedUrls:[],rationale:''},
 {id:'margin',question:'Ürünlerin gerçekleşen brüt marjı nedir?',access:'client',important:true,status:'open',answer:'',sourceIds:[],attemptedUrls:[],rationale:'Müşterinin iç finansal verisi.'}],
 sources:researchSources.map(row=>({sourceId:row.id,questionId:row===source?'brand':row===peerSource?'competition':'market',related:true,quote:row.text,reason:'Bu kaynak ilgili ürün, pazar veya karşılaştırma sorusunu yanıtlıyor.'})),candidates:[]});
export const fixtureSourceResults=()=>[{type:'tool_result',tool_use_id:'synthetic-read',content:JSON.stringify({sources:researchSources.map(row=>presentConversationSource(row))})}];
export function completeResearchProgress(){const sources=new Map(researchSources.map(row=>[row.id,row]));return updateResearchProgress(emptyResearchProgress(),researchProgressInput(),{
 sources:researchSources,views:collectSourceViews({results:fixtureSourceResults()},sources),knownUrls:new Set(researchSources.map(row=>row.url)),readAttempts:new Set(),toolIssues:[]});}
export const researchSummary=()=>({reason:'Pazar ve karşılaştırma sonuçları hazır.',market:{
 channels:{analysis:'Uzman mağaza ve pazaryerlerinde keşif; marka için kanal bazlı ürün anlatımı gerekli.',sourceIds:[marketSource.id]},
 customerBehavior:{analysis:'Ürüne uygun kullanım açıklaması seçimi etkileyebilir; etkisi dönüşüm pilotuyla ölçülmeli.',sourceIds:[marketSource.id]},
 competitionDynamics:{analysis:'Rakibin uygulama videosu, marka için anlatımı karşılaştırma fırsatı yaratır.',sourceIds:[peerSource.id]}},
 competitors:[{name:'Örnek Rakip',url:peerSource.url,reason:'Aynı ülke ve tüy bakım ihtiyacında alternatif ürün.',comparison:'Rakip uygulama videosu ve doğrudan sipariş sunarken marka dış kanala yönlendiriyor.',implication:'Ürün açıklaması ve sipariş geçişi kontrollü pilotla karşılaştırılabilir.',sourceIds:[peerSource.id]}]});
export function offeringResearchSummary(){const value=researchSummary();return {...value,
 offeringScope:'Türkiye büyüme hedefi için tüy bakım ürünü seçildi; menüdeki bütün ürünler aynı ihtiyaç veya rakip grubuna zorlanmadı.',
 offerings:[{id:'coat',label:'Tüy bakım ürünü',audience:'Türkiye içindeki kedi/köpek sahipleri',need:'Tüy bakımında uygun kullanım ve sipariş',market:'Türkiye',
  channel:'Shopier ve WhatsApp siparişi',commercialRole:'Ürün açıklaması ve sipariş geçişi pilotunun temsili ürünü; ciro payı bilinmiyor.',productQuestionId:'brand',competitionQuestionId:'competition',
  products:[{name:'Kıtık açıcı tüy bakım spreyi',url:source.url,analysis:'Ana sayfa bu ürünü ve harici sipariş yolunu açıklar; kullanım ve sipariş geçişi birlikte değerlendirilmeli.',sourceIds:[source.id]}]}],
 competitors:value.competitors.map(row=>({...row,offeringId:'coat',alternativeName:'Rakip tüy bakım spreyi',alternativeUrl:peerSource.url}))};}
export function marketResearchSummary(){return {...offeringResearchSummary(),
 marketScope:'Türkiye tüy bakım alıcısının ürün karşılaştırması, kullanım beklentisi ve siparişe geçişi seçildi; genel pet pazarı hacmi kapsamı belirlemiyor.',
 marketDecisions:[{offeringIds:['coat'],questionIds:['market'],analysis:'Okunan dış kaynakta uzman mağaza ve pazaryeri karşılaştırması, kullanım açıklaması ve ürüne uygunluk öne çıkıyor. Bu dar kaynaklar bütün pazarın tercih oranını veya fiyat esnekliğini ölçmüyor.',
  implication:'Mevcut kanallarda kullanım bilgisini ve siparişe geçişi birlikte pilotla; fiyat duyarlılığını gerçekleşmiş bulgu gibi yazma. Gerçekleşen kanal marjını müşteriden al.',sourceIds:[marketSource.id,usageSource.id]}]};}
export function researchedReport(){const value=report();value.competitors=researchSummary().competitors.map(({name,url,reason,sourceIds})=>({name,url,reason,sourceIds}));
 value.reportMarkdown=value.reportMarkdown.replace('Doğrudan rakip seçimi aynı ürün sınıfı, hedef alıcı ve Türkiye satış kanalı üzerinden yapılmalıdır; bu kaynaktan rakip adı doğrulanmadı.',
  `Örnek Rakip aynı ülkede tüy bakım ürünü sunuyor; videosu ve doğrudan sipariş yolu, markanın harici yönlendirmesinden farklı. Ürün anlatımı ve sipariş geçişini pilotla karşılaştır. [${peerSource.id}]`);
 value.reportMarkdown=value.reportMarkdown.replace('## Pazar ve müşteri\n',`## Pazar ve müşteri\nUzman mağaza ve pazaryerinde ürün karşılaştırması, ürün kullanım anlatımını kanal bazında uyarlamayı gerektirebilir. [${marketSource.id}]\n`);
 value.reportMarkdown=value.reportMarkdown.replace('## Rekabet\n',`Kullanım adımlarının anlaşılır sunumu, ürün açıklaması pilotunda değerlendirilebilir; satış etkisi henüz ölçülmedi. [${usageSource.id}]\n## Rekabet\n`);
 value.sourceQuotes.push(...[marketSource,peerSource,usageSource].map(row=>({sourceId:row.id,quote:row.text})));return value;}
export function report(){return {
 summary:'Örnek Pet için büyüme önceliği, ürün keşfini ölçülebilir bir satın alma yoluna bağlamak.',
 reportMarkdown:`# Örnek Pet BHS\n## Marka ve hedef\nAna sayfa ürünleri ve üçüncü taraf sipariş yönlendirmesini birlikte sunuyor. [${source.id}]\n## Pazar ve müşteri\nTürkiye pet kozmetiği alt pazarının büyüklüğü bu kaynakta yok; toplam pet pazarı verisi bunun yerine konamaz. Marka ve ürün stratejisi bu sayıya bağlı olmadan değerlendirilebilir.\n## Rekabet\nDoğrudan rakip seçimi aynı ürün sınıfı, hedef alıcı ve Türkiye satış kanalı üzerinden yapılmalıdır; bu kaynaktan rakip adı doğrulanmadı.\n## SWOT\n### Güçlü yönler\nÜrün faydasının tanımlı olması listeleme çalışmasına başlangıç sağlar; bu ticari bir değerlendirmedir.\n### Zayıf yönler\nSiparişin harici kanallara yönlenmesi ölçümün parçalanması riskini taşıyabilir; düşük dönüşüm yaşandığı kanıtlanmış değildir.\n### Fırsatlar\nÜrün bazlı sayfa ve kanal ölçümü için kontrollü pilot yapılabilir.\n### Tehditler\nRakip fiyat baskısı bir hipotezdir; karşılaştırılabilir fiyat kaydı olmadan gerçekleşmiş sonuç sayılamaz.\n## Öncelikli aksiyonlar\nÖnce ürün sayfasından Shopier/WhatsApp yönlendirmesine kadar olay ölçümünü kur; aynı kanalda önceki dönemle karşılaştır. Amazon partnerinin mevcut olması yeni kapsamdan otomatik dışlama yaratmaz.`,
 highlights:[{statement:'Ana sayfada ürün tanıtımı ile Shopier ve WhatsApp sipariş yönlendirmesi birlikte yer alıyor.',
 analysis:'Sipariş yolunun farklı kanallara dağılımı, ciro hedefi için ölçülebilir bir geçiş planını gerekli kılabilecek bir koşuldur; dönüşüm düşüklüğü henüz ölçülmedi.',
 action:'Ürün sayfası ziyaretini, dış mağaza tıklamasını ve WhatsApp tıklamasını ayrı olaylarla izleyip kanal sorumluluklarını mevcut partnerle netleştir.',
 measurement:'Aynı kanalda ürün ziyaretinden sipariş yönlendirmesine geçiş oranını pilot öncesi ve sonrası dönemlerde karşılaştır.',
 kind:'observation',dimension:'funnel',quadrant:'none',sourceIds:[source.id]}],
 competitors:[],sourceQuotes:[{sourceId:source.id,quote:source.text}],questions:['Hangi kanalın ne kadar sipariş getirdiği mevcut kayıtlardan çıkarılabilir mi?'],
 limitations:['Bu örnek, kayıt tekrarını doğrulayan sentetik test raporudur; gerçek bir model analizi değildir.']
};}

export function memoryLedger({charged=500}={}){
 const rows=new Map();let total=charged;
 const call=async(op,args={})=>{
  if(op==='get')return structuredClone(rows.get(args.step)||null);
  if(op==='status'||op==='begin')return {id:'22222222-2222-4222-8222-222222222222',capKurus:5000,chargedKurus:total};
  if(op==='reserve'){
   if(rows.has(args.step))return {claimed:false,step:structuredClone(rows.get(args.step))};
   if(total+args.amount>5000)return {blocked:true};
   const row={state:'reserved',charge_kurus:args.amount,input_hash:args.hash,claim_token:args.token};rows.set(args.step,row);total+=args.amount;
   return {claimed:true,step:structuredClone(row)};
  }
  const row=rows.get(args.step);if(!row||row.claim_token!==args.token)throw Error('reservation mismatch');
  if(op==='complete'){total-=row.charge_kurus-args.amount;Object.assign(row,{state:'complete',charge_kurus:args.amount,value:structuredClone(args.value)});}
  else if(op==='uncertain')Object.assign(row,{state:'uncertain',value:structuredClone(args.value)});
  else throw Error('unknown operation');
  return structuredClone(row);
 };
 return {ledger:createLedger(call,{reuseCompleted:true}),rows,total:()=>total};
}
export const assistantCall=(name,input,id='tool_1')=>({content:[{type:'tool_use',id,name,input}],stopReason:'tool_use'});
export const semanticApproval=(report,{reviewPolicyVersion}={})=>({draftDigest:hash(report),verdict:'approve',rationale:'Sentetik değerlendirme: marka/hedef, pazar-rakip anlamı, dört SWOT kolu ve aksiyon-ölçüm bağı korunuyor; yeni olgu veya stil değişikliği gerekmiyor.',issues:[],patches:[],
 ...(reviewPolicyVersion?{claimScope:'Sentetik özet, tam rapor/SWOT ve aksiyonların koşullu ticari yorumu birlikte değerlendirildi; gerçek analist kabulü değildir.',
  claimChecks:[{path:'summary',text:report.summary,kind:'hypothesis',basis:'Sentetik brief hedefi ve kaynaklı kanal gözlemiyle geliştirilen stratejik öncelik; gerçekleşmiş sonuç değildir.',sourceIds:[],briefQuote:'',verification:'Mevcut kanalda karşılaştırmalı pilot ve müşterinin gerçekleşen satış verisiyle doğrula.',issueId:''}]}:{}),
 ...(reviewPolicyVersion===researchWorkPolicyVersion?{workReview:{rationale:'Sentetik kapsam incelemesi: kalan pilot/uygulama ve iç veri soruları sonraki müşteri işidir; ertelenmiş önemli BHS kamu işi seçilmedi.',items:[]}}:{})});
export function scriptedProviders(ledger,replies){
 const calls=[];let index=0;
 return {calls,analystQuote:async(_messages,options={})=>({reservation:100,finalReservation:800,reviewReservation:100,completionReservation:options.review?0:options.hasDraft?100:900,inputUpper:1000,output:options.review?6000:10000,...(options.reviewPolicyVersion?{reviewPolicyVersion:options.reviewPolicyVersion}:{})}),
  analyst:async(messages,options)=>{calls.push({messages:structuredClone(messages),options});return ledger.once('model:test:'+index,{index},100,async()=>{
   let response=replies[index++];
   if(!response&&options.review){const draft=messages.flatMap(message=>Array.isArray(message.content)?message.content:[]).findLast(block=>block.type==='tool_use'&&block.name==='finish_bhs')?.input;
    if(draft)response=assistantCall('review_bhs',semanticApproval(draft,{reviewPolicyVersion:options.reviewPolicyVersion||options.quote?.reviewPolicyVersion}),'synthetic-review');}
   if(!response)throw Error('No synthetic response for this model turn');return {...response,accountedKurus:20};},{settle:v=>v.accountedKurus});},
  search:async()=>({results:researchSources.map(row=>({...row,method:'search-snippet'}))}),extract:async({urls})=>({results:researchSources.filter(row=>urls.includes(row.url)),failures:[]}),
  consult:async()=>({answer:'Kaynak, iki örnek ürünü ve sipariş yönlendirmesini gösterir; toplam SKU sayısını kanıtlamaz.'})};
}
