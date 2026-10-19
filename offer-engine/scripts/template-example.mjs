// Build-only, clearly labelled synthetic example. No provider calls or CRM reads.
import {readFile,writeFile} from 'node:fs/promises';
import {snapshotBrief,briefHash,dimensions} from '../src/bhs/brief.mjs';
import {pricingEngine} from '../src/engines/pricing-engine.mjs';
import {proposalEngine} from '../src/engines/proposal-engine.mjs';
import {prepareUploadedLogo} from '../src/upload.mjs';
export async function writeTemplateExample(){
 const brief=snapshotBrief({brandName:'Örnek Marka',website:'https://brand.example/',segment:'corporate',goals:'Ölçülebilir büyüme',needs:'Edinim kanalları ve yaratıcı testler',services:'Meta, Google Ads ve tasarım',meetingNotes:'Sentetik tasarım örneği; gerçek marka analizi değildir.',budget:''});
 const samples=[['Ölçüm akışını doğrula.','high','Başlangıç öncesinde dönüşüm olayları ve veri erişimleri kontrol edilir.'],['Edinim kanallarını birlikte değerlendir.','medium','Meta ve Google kampanya öğrenimleri ortak takvimle takip edilir.'],['Kreatif test takvimini kur.','low','Seçili tasarım kapsamı düzenli testlerle geliştirilir.']];
 const findings=samples.map(([statement,priority,impact],i)=>({id:'demo-f'+i,dimension:dimensions[i].id,kind:'inference',statement,priority,impact,sourceIds:[]}));
 const audit={stage:'audit',status:'ready',data:{schemaVersion:'demo-only',briefHash:briefHash(brief),summary:'Bu bulgular yalnızca şablonu göstermek için hazırlanmış sentetik örneklerdir.',findings,services:[],dimensions:dimensions.map(d=>({id:d.id,score:null,dataStatus:'insufficient',rationale:'Gerçek şirket araştırması ve iç veriler olmadan puan üretilmez.',strengths:[],gaps:[],findingIds:[]})),sources:[],scoring:{total:null,note:'Örnek verilerden BHS puanı üretilmedi.'},rawReport:'Bu ekran gerçek marka analizi değildir. Gerçek akışta Gemini Deep Research, kaynak toplama ve ayrı içerik doğrulamasından geçen BHS burada yer alır.',meetingQuestions:[]}};
 const pricing={stage:'pricing',...await pricingEngine.run({brief,scope:{summary:'Örnek aylık başlangıç kapsamı.',budget:{posture:'unspecified',quote:null,targetQuote:null,targetScope:'unspecified'},services:['meta','google_ads','design'].map(serviceId=>({serviceId,phase:'start',priority:1,reason:'Örnek kapsam: uygulama, ölçüm ve düzenli iyileştirme.',briefQuote:brief.services,findingIds:['demo-f1']})),exclusions:['Reklam harcamaları ve üçüncü taraf bedelleri kapsam dışıdır.']}},{audit})};
 const logo={stage:'logo',status:'review',data:await prepareUploadedLogo('data:image/png;base64,'+(await readFile('public/examples/logo-white.png')).toString('base64'))};
 const proposal=await proposalEngine.run({brief,copy:{headline:'Net hedefler.',accent:'Birlikte büyüme.',subtitle:'Örnek Marka için strateji, uygulama ve ölçümü bir araya getiren işbirliği teklifimiz.',findingIds:['demo-f0','demo-f1']}},{audit,pricing,logo});
 await writeFile('public/examples/proposal.json',JSON.stringify({demo:true,document:proposal.data}));
}
