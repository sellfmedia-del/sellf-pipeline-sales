import {createLedger} from '../../src/budget/ledger.mjs';
import {sourceId} from '../../src/bhs/conversation-contract.mjs';

export const brief={brandName:'Örnek Pet',segment:'kobi',website:'https://pet.example.com/',
 goals:'Türkiye pazarında büyümek ve ciro artışı.',needs:'Web sitesi ve online satış kanallarının yönetimi. Amazon tarafında mevcut bir partner var.',
 services:'Markalaşma ve perakende için iki alternatif değerlendirilecek.',meetingNotes:'Türkiye öncelikli; ABD ve UK sonraki aşamada değerlendirilecek.',budget:null};
export const source={id:sourceId(brief.website),url:brief.website,title:'Örnek Pet',method:'extracted',
 text:'Kıtık açıcı tüy bakım spreyi ve kedi kumu spreyi. Sipariş için Shopier mağazamızı veya WhatsApp hattını kullanabilirsiniz.',retrievedAt:'2026-11-20T10:00:00.000Z',links:[]};
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
export function scriptedProviders(ledger,replies){
 const calls=[];let index=0;
 return {calls,analystQuote:async()=>({reservation:100,finalReservation:800,inputUpper:1000,output:10000}),
  analyst:async(messages,options)=>{calls.push({messages:structuredClone(messages),options});return ledger.once('model:test:'+index,{index},100,async()=>({...replies[index++],accountedKurus:20}),{settle:v=>v.accountedKurus});},
  search:async()=>({results:[{...source,method:'search-snippet'}]}),extract:async()=>({results:[source],failures:[]}),
  consult:async()=>({answer:'Kaynak, iki örnek ürünü ve sipariş yönlendirmesini gösterir; toplam SKU sayısını kanıtlamaz.'})};
}
