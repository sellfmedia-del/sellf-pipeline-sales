import {sourceId} from '../../src/bhs/conversation-contract.mjs';
import {presentConversationSource} from '../../src/bhs/conversation-source.mjs';
import {collectSourceViews,emptyResearchProgress,updateResearchProgress} from '../../src/bhs/conversation-progress.mjs';

export const brief={brandName:'Örnek İkili',website:'https://dual.example.com/',segment:'kobi',goals:'Profesyonel ve bireysel kanalları birlikte büyüt.',
 needs:'İki alıcı grubunu ve gerçek alternatiflerini değerlendir.',services:'',meetingNotes:'Mevcut yazılım partneri korunmalı.',budget:null};
const page=(url,text)=>({id:sourceId(url),url,title:'Sentetik ürün/pazar kaydı',text,method:'extracted',links:[],retrievedAt:'2026-11-22T12:00:00Z'});
export const pro=page(brief.website+'products/pro','Profesyonel P modeli kuruluşlara fiyat talebi ile sunulur. Kurulum ve ilk kullanım yazılım desteği pakete dahildir; gerçekleşen ciro ve marj bu sayfada yoktur.');
export const home=page(brief.website+'products/home','Ev tipi H modeli bireysel alıcılara doğrudan siparişle sunulur. Bluetooth ile uygulamaya veri aktarımı ve kullanım kılavuzu ürün sayfasında açıklanır.');
export const proPeer=page('https://peer.example.com/products/pro','Rakip Kurumsal R modeli aynı ülkedeki kuruluşlara teklif yoluyla sunulur. Yazılım paketinin ülke kullanımı ayrıca doğrulanmalıdır; sayfada satış tutarı açıklanmaz.');
export const homePeer=page('https://other.example.com/products/home','Rakip Ev E modeli aynı ülkedeki bireylere doğrudan siparişle sunulur. Uygulama bağlantısı ve kullanım bilgileri seçili ürün sayfasında açıklanır.');
export const market=page('https://market.example.com/selected-buyers','Seçili ülkede kuruluşların ürün karşılaştırmasında kurulum ve destek koşulları; bireylerin karşılaştırmasında kullanım deneyimi ve sipariş yolu değerlendirilir.');
export const sources=[pro,home,proPeer,homePeer,market];
const q=(id,source)=>({id,question:id+' için ürün, alıcı ve sipariş yolu ne?',access:'public',important:true,status:'answered',answer:source.text,sourceIds:[source.id],attemptedUrls:[],rationale:''});
export const progressInput=()=>({objective:brief.goals,questions:[q('pro',pro),q('home',home),q('pro_peer',proPeer),q('home_peer',homePeer),q('market',market),
 {id:'margin',question:'İç kanal marjı nedir?',access:'client',important:true,status:'open',answer:'',sourceIds:[],attemptedUrls:[],rationale:'Müşterinin iç kaydı.'}],
 sources:sources.map((source,index)=>({sourceId:source.id,questionId:['pro','home','pro_peer','home_peer','market'][index],related:true,quote:source.text,reason:'Seçili ürün/alıcı sorusunun gövde dayanağı.'})),candidates:[]});
export const views=()=>[{type:'tool_result',tool_use_id:'read_seed',content:JSON.stringify({sources:sources.map(row=>presentConversationSource(row))})}];
export function progress(){return updateResearchProgress(emptyResearchProgress(),progressInput(),{sources,views:collectSourceViews({results:views()},new Map(sources.map(row=>[row.id,row]))),knownUrls:new Set(sources.map(row=>row.url)),readAttempts:new Set(),toolIssues:[]});}
export function summary(){return {reason:'Seçili ürünler ve iki alıcı grubu için karşılaştırma sonuçları hazır.',
 market:{channels:{analysis:'Teklif talebi ve doğrudan sipariş farklı satış yollarıdır.',sourceIds:[market.id]},customerBehavior:{analysis:'Satın alma nedeni ve destek beklentisi alıcı grubuna göre değerlendirilmeli.',sourceIds:[market.id]},competitionDynamics:{analysis:'Teklifli ürün ile doğrudan sipariş ürünü kendi alternatifleriyle karşılaştırıldı.',sourceIds:[proPeer.id,homePeer.id]}},
 offeringScope:'Briefteki profesyonel ve bireysel kanalın iki temsilî ürünü seçildi; bütün katalog veya sabit rakip kotası yok.',
 offerings:[{id:'pro',label:'Profesyonel çözüm',audience:'Kuruluşlar',need:'Kurulum ve raporlama',market:'Seçili ülke',channel:'Fiyat talebi ve satış görüşmesi',commercialRole:'Teklif hattı; satış ve marjı iç veridir.',productQuestionId:'pro',competitionQuestionId:'pro_peer',products:[{name:'P',url:pro.url,analysis:'Kurulum ve yazılım paketi satın alma sonrası deneyimle birlikte değerlendirilmeli.',sourceIds:[pro.id]}]},
 {id:'home',label:'Bireysel çözüm',audience:'Ev kullanıcıları',need:'Uygulamayla kişisel takip',market:'Seçili ülke',channel:'Doğrudan sipariş',commercialRole:'Ürün açıklaması ve sipariş deneyimi pilotu.',productQuestionId:'home',competitionQuestionId:'home_peer',products:[{name:'H',url:home.url,analysis:'Bağlantı ve kullanım anlatımı satın alma kararındaki belirsizliği azaltma hipotezidir.',sourceIds:[home.id]}]}],
 competitors:[{name:'Rakip Kurumsal',url:proPeer.url,reason:'Aynı ülkede aynı kurumsal ihtiyacın alternatifi.',comparison:'İki çözüm de tekliflidir; yazılım ülke kapsamı doğrulanmadan üstünlük iddiası yok.',implication:'Teklif pilotunda kurulum ve destek koşullarını açıkla.',sourceIds:[pro.id,proPeer.id],offeringId:'pro',alternativeName:'R',alternativeUrl:proPeer.url},
 {name:'Rakip Ev',url:homePeer.url,reason:'Aynı ülkede aynı bireysel ihtiyacın alternatifi.',comparison:'Uygulama ve doğrudan sipariş iki üründe de incelendi; farklılaşma hipotezi kullanım açıklamasında.',implication:'Ürün sayfası ve sipariş geçişini kontrollü pilotla ölç.',sourceIds:[home.id,homePeer.id],offeringId:'home',alternativeName:'E',alternativeUrl:homePeer.url}]};}
export function report(){const handoff=summary();return {summary:'İki kanal için ürün, alıcı ve gerçek alternatifin ticari anlamı ayrı değerlendirildi.',
 reportMarkdown:`# Örnek İkili BHS
## Marka ve hedef
P ürünü kuruluşlara teklif ile; H ürünü bireylere doğrudan sipariş ile sunuluyor. İki kanalı büyütme hedefi ve mevcut yazılım partneri birlikte korunmalı. [${pro.id}] [${home.id}]
## Ürün ve alıcı
P için kurulum ve yazılım paketi, nitelikli teklif görüşmesinin içeriğine bağlanmalı. H için Bluetooth bağlantısı ve kullanım açıklaması sipariş öncesi belirsizliği azaltma pilotunda değerlendirilebilir. Bunlar performans sonucu değil, kaynaklı koşullar üzerinden ticari çıkarımdır. [${pro.id}] [${home.id}]
## Pazar ve müşteri
Kuruluş ile birey aynı fiyat veya satın alma sürecine zorlanmamalı. Kesin pazar hacmi bilinmeden hedefe yönelik pilot kurulabilir. [${market.id}]
## Rekabet
Kurumsal R aynı teklif ihtiyacında alternatiftir; ülke kullanımı doğrulanmadan yazılım üstünlüğü ileri sürülemez. Bireysel E de doğrudan sipariş ve uygulama sunar; H için kullanım anlatımı ve sipariş yolu pilotu düşünülebilir. [${proPeer.id}] [${homePeer.id}]
## SWOT
### Güçlü yönler
İki alıcı grubuna ayrı ürün ve satış yolu sunulması mevcut bir başlangıç varlığıdır.
### Zayıf yönler
Kanallar arası mesaj karışması yalnız bir hipotezdir; mevcut kanıtlardan düşük dönüşüm veya yönetim kusuru çıkarılamaz.
### Fırsatlar
Teklif hattı ile doğrudan sipariş için ayrı açıklama ve ölçüm pilotları yapılabilir.
### Tehditler
Rakiplerin benzer kullanım ve destek unsurları sunması farklılaşma varsayımının karşılaştırılmasını gerektirir.
## Aksiyon ve ölçüm
Kurumsal tekliflerde kurulum/destek koşullarını; bireysel sayfada uygulama kullanımını açıklayan pilotu ölç. Nitelikli tekliften kazanıma ve sipariş geçişine bak; satış ve marjı müşteriden al. İyi anlatım ve kaynaklar yeni araştırmada korunmalı.`,
 highlights:[{statement:'P için teklif, H için doğrudan sipariş yolu var.',analysis:'Alıcı grupları farklı satış geçişleri gerektirebilir.',action:'İki kanal için açıklama ve ölçüm pilotu yap.',measurement:'Nitelikli teklif kazanımı ve ürün sayfasından siparişe geçiş.',kind:'observation',dimension:'funnel',quadrant:'strength',sourceIds:[pro.id,home.id]}],
 competitors:handoff.competitors.map(({name,url,reason,sourceIds})=>({name,url,reason,sourceIds})),sourceQuotes:sources.map(row=>({sourceId:row.id,quote:row.text})),questions:['Gerçekleşen kanal marjları nedir?'],limitations:['Sentetik kayıt ve yanıtlar; gerçek analist kalitesi için kabul kanıtı değildir.']};}
