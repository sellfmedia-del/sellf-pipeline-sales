import {readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {localizeProposal} from '../proposal/language.mjs';
import {addQuote} from '../pricing/currency.mjs';
const translations=[
 ['Net hedefler.','Clear goals.'],['Birlikte büyüme.','Growing together.'],
 ['Örnek Marka için strateji, uygulama ve ölçümü bir araya getiren işbirliği teklifimiz.','Our partnership proposal brings strategy, execution and measurement together for Example Brand.'],
 ['Growth + Operasyon','Growth + Operations'],['Growth danışmanlığı ve strateji','Growth consulting and strategy'],['Tam BHS, onaylanan strateji ve uygulama planıyla Growth danışmanlığı.','Growth consulting with a full BHS, approved strategy and implementation plan.'],
 ['Meta Reklam Yönetimi','Meta Ads Management'],['Örnek kapsam: uygulama, ölçüm ve düzenli iyileştirme.','Example scope: implementation, measurement and ongoing improvement.'],['Google Ads Reklam Yönetimi','Google Ads Management'],['Statik ve Motion Tasarım','Static and Motion Design'],['Aylık 25 statik + 5 motion; tasarım başına 2 revize.','Monthly: 25 static + 5 motion designs; 2 revisions per design.'],['Operasyon Paketi','Operations Package'],['Meta Reklam Yönetimi · Google Ads Reklam Yönetimi · Statik ve Motion Tasarım','Meta Ads Management · Google Ads Management · Static and Motion Design'],
 ['Başlangıç','Getting started'],['Hedefler, erişimler ve veri paylaşımı','Goals, access and data sharing'],['İlk 2 hafta','First 2 weeks'],['Tam BHS ve iç verilerle doğrulama','Full BHS and validation with internal data'],['BHS onayından sonra 4–6 hafta','4–6 weeks after BHS approval'],['Strateji, öncelikler ve uygulama takvimi','Strategy, priorities and implementation schedule'],['Plan onayıyla','Following plan approval'],['Seçili operasyonlar, ölçüm ve takip','Selected operations, measurement and monitoring'],['Seçili hizmetler için erişim ve kurulum','Access and setup for selected services'],['Kurulum sonrası','After setup'],['Ölçüm doğrulaması ve uygulama takvimi','Measurement validation and implementation schedule'],['Takvim onayıyla','Following schedule approval'],['Seçili operasyonların başlatılması','Launching selected operations'],['Aylık','Monthly'],['Raporlama ve iyileştirme','Reporting and improvement'],
 ['Bu bulgular yalnızca şablonu göstermek için hazırlanmış sentetik örneklerdir.','These synthetic findings illustrate the template only.'],['Gerçek şirket araştırması ve iç veriler olmadan puan üretilmez.','Scores are not assigned without actual company research and internal data.'],['Ölçüm akışını doğrula.','Validate the measurement flow.'],['Edinim kanallarını birlikte değerlendir.','Evaluate acquisition channels together.'],['Kreatif test takvimini kur.','Establish a creative testing schedule.'],['Başlangıç öncesinde dönüşüm olayları ve veri erişimleri kontrol edilir.','Conversion events and data access are checked before launch.'],['Meta ve Google kampanya öğrenimleri ortak takvimle takip edilir.','Insights from Meta and Google campaigns are monitored on a shared schedule.'],['Seçili tasarım kapsamı düzenli testlerle geliştirilir.','The selected design scope is improved through regular testing.'],['Reklam harcamaları ve üçüncü taraf bedelleri kapsam dışıdır.','Advertising spend and third-party fees are excluded.'],['Tutarlar aylık Sellf hizmet bedelleridir. Reklam harcaması, üçüncü taraf bedelleri ve KDV bu hesapta ayrıca hesaplanmadı.','Amounts are monthly Sellf service fees. Advertising spend, third-party fees and VAT are excluded from this calculation.'],['BHS yatırım önerileri fiyat veya müşteri bütçesi olarak kullanılmadı.','BHS investment recommendations were not used as prices or client budgets.']
];
export async function buildLanguageReview(publicDir,{production=false}={}){
 const file=path.join(publicDir,'offers/language-review.html');
 if(production){await rm(file,{force:true});for(const name of ['plan-evidence-review.html','assessment-review.html'])await rm(path.join(publicDir,'offers',name),{force:true});return;}
 const tr=JSON.parse(await readFile(path.join(publicDir,'examples/proposal.json'),'utf8')).document,map=new Map(translations);
 const en=await localizeProposal(tr,'en',{providers:{async generate(stage,{texts}){return {model:'synthetic-human-reviewed',data:{translations:texts.map(t=>{if(!map.has(t))throw Error('Missing preview translation: '+t);return map.get(t);})}};}}});
 const fx={provider:'TCMB',kind:'ForexSelling',base:'USD',quote:'TRY',rate:44,publishedAt:'2026-11-04',checkedAt:'2026-11-04T08:00:00Z',source:'https://www.tcmb.gov.tr/kurlar/today.xml'};
 const docs={tr:{TRY:tr,USD:addQuote({data:tr},{currency:'USD',exchangeRate:fx}).data},en:{TRY:en,USD:addQuote({data:en},{currency:'USD',exchangeRate:fx}).data}};
 const page=docs=>`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Teklif dili · Önizleme</title><link rel="stylesheet" href="/offers/proposal.css"><style>body{margin:0;background:#f7f6f2;font-family:Arial,sans-serif}nav{padding:16px;display:flex;gap:16px;flex-wrap:wrap}select{padding:10px}#offer{max-width:1200px;margin:auto}</style><nav><span>Sentetik örnek · Gerçek müşteri verisi, kayıt veya ücretli AI çağrısı kullanılmaz. Kur örnektir.</span><label>Teklif dili <select id="language"><option value="tr">Türkçe</option><option value="en" selected>English</option></select></label><label>Para birimi <select id="currency"><option>TRY</option><option>USD</option></select></label></nav><main id="offer"></main><script src="/offers/proposal.js"></script><script>const docs=${JSON.stringify(docs).replace(/</g,'\\u003c')};function render(){PipelineProposal.mount(document.querySelector('#offer'),docs[document.querySelector('#language').value][document.querySelector('#currency').value]);}document.querySelectorAll('select').forEach(s=>s.onchange=render);render();</script></html>`;
 await writeFile(file,page(docs));
 // This separate review page uses reserved example domains and local fixtures
 // only. It does not change the normal language sandbox or call a provider.
 const evidenceDocs=structuredClone(docs);
 for(const [language,quotes] of Object.entries(evidenceDocs))for(const doc of Object.values(quotes)){
  const en=language==='en';
  doc.bhs.sources.push(
   {id:'demo-events',title:en?'Synthetic measurement document':'Sentetik ölçüm dokümanı',url:'https://example.com/measurement'},
   {id:'demo-product',title:en?'Synthetic product document':'Sentetik ürün dokümanı',url:'https://example.com/product'},
   {id:'demo-product-repeat',title:en?'Same synthetic product document':'Aynı sentetik ürün dokümanı',url:'https://example.com/product?utm_source=review#usage'});
  doc.bhs.findings.push(
   {id:'demo-event-observation',kind:'observation',dimension:'digital',priority:'high',statement:en?'The synthetic measurement document defines the enquiry event.':'Sentetik ölçüm dokümanında talep olayı tanımlı.',sourceIds:['demo-events']},
   {id:'demo-product-observation',kind:'observation',dimension:'digital',priority:'medium',statement:en?'The synthetic product document describes how the product is used.':'Sentetik ürün dokümanında ürünün kullanım biçimi açıklanıyor.',sourceIds:['demo-product','demo-product-repeat']});
  for(const plan of Object.values(doc.plans))plan.steps=[
   {time:en?'Step 1':'Adım 1',title:en?'Match conversion events to the measurement plan.':'Dönüşüm olaylarını ölçüm planıyla eşleştir.',measurement:en?'Check that a test enquiry reaches the event record.':'Test talebinin olay kaydına ulaştığını kontrol et.',findingIds:['demo-event-observation'],sourceIds:['demo-events']},
   {time:en?'Step 2':'Adım 2',title:en?'Match selected Meta and Google campaigns to product usage information.':'Seçili Meta ve Google kampanyalarını ürün kullanım bilgisiyle eşleştir.',measurement:en?'Compare campaign messages with product usage information.':'Kampanya mesajlarını ürün kullanım bilgisiyle karşılaştır.',findingIds:['demo-product-observation'],sourceIds:['demo-product','demo-product-repeat']},
   {time:en?'Step 3':'Adım 3',title:en?'Prepare design variations using product usage information.':'Tasarım varyasyonlarını ürün kullanım bilgisine göre hazırla.',measurement:en?'Check that the variations are consistent with the product information.':'Varyasyonların ürün bilgisiyle tutarlılığını kontrol et.',findingIds:['demo-product-observation'],sourceIds:['demo-product','demo-product-repeat']},
   {time:en?'Step 4':'Adım 4',title:en?'Review campaign and design test results.':'Kampanya ve tasarım testlerinin sonuçlarını değerlendir.',measurement:en?'Compare campaign and design variation records.':'Kampanya ve tasarım varyasyonu kayıtlarını karşılaştır.',findingIds:[]}
  ];
 }
 await writeFile(path.join(publicDir,'offers/plan-evidence-review.html'),page(evidenceDocs));
 const assessmentDocs=structuredClone(evidenceDocs);
 for(const [language,quotes] of Object.entries(assessmentDocs))for(const doc of Object.values(quotes)){
  const en=language==='en',event=doc.bhs.findings.find(f=>f.id==='demo-event-observation'),product=doc.bhs.findings.find(f=>f.id==='demo-product-observation');
  event.impact=en?'Hypothesis: enquiry records can inform a pilot decision. Limitation: defining an event does not establish that it is recorded correctly.':'Hipotez: Talep kayıtları pilot kararına dayanak olabilir. Sınır: Olayın tanımlanması doğru kaydedildiğini kanıtlamaz.';
  event.recommendation={action:en?'Validate enquiry tracking before assessing the pilot.':'Pilotu değerlendirmeden önce talep takibini doğrula.',measurement:en?'Check that a test enquiry reaches the record.':'Test talebinin kayda ulaştığını kontrol et.'};
  product.impact=en?'Hypothesis: usage information can shape campaign messages. Limitation: product usage information does not establish buyer demand.':'Hipotez: Kullanım bilgisi kampanya mesajını şekillendirebilir. Sınır: Ürün kullanım bilgisi satın alma talebini kanıtlamaz.';
  doc.bhs.bhsSections=[{id:'pilot',title:en?'Pilot rationale and decision conditions':'Pilot gerekçesi ve karar koşulları',findingIds:[event.id,product.id],complete:false}];
  doc.bhs.meetingQuestions=[en?'Does a test enquiry reach the CRM record?':'Test talebi CRM kaydına ulaşıyor mu?',en?'What did the pilot establish about buyer interest?':'Pilot, alıcı ilgisi hakkında hangi kanıtı sağladı?'];
  for(const plan of Object.values(doc.plans)){
   plan.steps[0].title=en?'Validate enquiry tracking before using pilot results.':'Pilot sonuçlarını kullanmadan önce talep takibini doğrula.';
   plan.steps[3].title=en?'Decide whether to expand or revise after reviewing recorded pilot enquiries.':'Kayıtlı pilot taleplerini değerlendirdikten sonra genişletme veya revizyon kararı ver.';
   plan.steps[3].measurement=en?'Review enquiry records and agree the next test before expanding activity.':'Talep kayıtlarını inceleyip faaliyeti genişletmeden önce sıradaki testi belirle.';
  }
 }
 await writeFile(path.join(publicDir,'offers/assessment-review.html'),page(assessmentDocs));
}
