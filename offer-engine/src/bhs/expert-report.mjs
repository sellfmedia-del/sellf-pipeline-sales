import {readFileSync} from 'node:fs';
import {dimensions} from './brief.mjs';
import {methodologyAreas} from './methodology-areas.mjs';
import {technicalCitations,citationChunks} from './citation-cards.mjs';
import {groundOfferReport} from './source-gate.mjs';
import {supportedNumbers} from './numeric-evidence.mjs';
import {researchHost} from './research-url.mjs';
import {hash} from '../budget/ledger.mjs';

export const expertVersion='sellf-pre-bhs-2026-11-09-expert-v6';
export const expertInstruction=()=>readFileSync(new URL('./expert-methodology.txt',import.meta.url),'utf8');
const str=(maxLength=600)=>({type:'string',maxLength});
const arr=(items,maxItems=60)=>({type:'array',items,maxItems});
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const ids=arr(str(80));
const dim={type:'string',enum:dimensions.map(d=>d.id)};
export const expertSchema=obj({
 findings:arr(obj({id:str(80),dimension:dim,kind:{type:'string',enum:['observation','inference']},stance:{type:'string',enum:['positive','risk','neutral']},observation:str(600),sourceIds:ids,commercialHypothesis:str(700),limitation:str(500),question:str(500),priority:{type:'string',enum:['high','medium','low']}})),
 peers:arr(obj({entityId:str(80),relationship:{type:'string',enum:['direct','benchmark','unconfirmed']},sourceIds:ids,reason:str(600)}),5),
 dimensions:arr(obj({id:dim,score:{anyOf:[{type:'number',minimum:0,maximum:100},{type:'null'}]},findingIds:ids,comparisonFindingIds:ids,bandReason:str(600)}),6),
 coverage:obj(Object.fromEntries(methodologyAreas.map(a=>[a.key,obj({status:{type:'string',enum:['observed','partial','unavailable']},findingIds:ids,note:str(400)})]))),
 benchmarks:arr(obj({metric:{type:'string',enum:['webTraffic','domainAuthority','socialAudience','reviews','adActivity','contentMaturity','revenueOrGrowth','differentiator']},entityId:str(80),value:str(300),unit:str(80),period:str(100),sourceIds:ids}),48),
 overviewIds:arr(str(80),4),opportunityId:{anyOf:[str(80),{type:'null'}]},riskId:{anyOf:[str(80),{type:'null'}]}
});
const fold=s=>String(s||'').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
const unique=a=>[...new Set(a)];
const list=v=>Array.isArray(v)?v:[];
const words=s=>fold(s).match(/[a-z]{5,}/g)||[];
const stop=new Set(words('company products product services service website online official brand market customers customer turkey turkiye global international similar digital operations platform shopping ecommerce kurumsal sirket marka urunler hizmetler musteri turkiye pazari hedef kitle pazarlama benzer dogrudan rekabet sitesi kanal satici'));
const topicWords=s=>unique(words(s).filter(w=>!stop.has(w)));
const categories=[/burger|hamburger|smash/,/coffee|kahve|roast/,/planner|planlayici|calendar|takvim/,/carpet|\brug\b|hali/,/travel|seyahat|turizm|ferry|feribot|tour/,/cosmetic|kozmetik|cologne|kolonya|sabun|skincare/,/organic|organik|snack|atistirmalik/];
const terms={financial:/revenue|funding|investment|ciro|yatirim|price|fiyat|growth|buyume/i,operations:/team|employees|ekip|calisan|delivery|kargo|iade|return|crm|platform/i,funnel:/newsletter|bulten|subscribe|abonelik|checkout|teklif|quote|cart|sepet|loyalty/i,digital:/analytics|pixel|piksel|seo|traffic|trafik|mobile|mobil/i,perception:/review|yorum|rating|puan|complaint|sikayet|response|yanit/i,competition:/price|fiyat|subscription|abonelik|differ|fark|shipping|kargo/i};

// Paragraph-sized context is selected once; model only returns immutable IDs.
// The complete original packet stays in the ledger, never in a public bundle.
export function expertContext(brief,evidence){
 const cards=[],sources=[],proofGroups=new Map();let used=0;
 for(const s of evidence.packet.sources||[]){
  const excerpts=list(s.excerpts).map(e=>e.text.replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1'));
  const candidates=excerpts.flatMap(t=>t.split(/\n\s*\n|(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ])/u).flatMap(p=>p.length>1000?Array.from({length:Math.ceil(p.length/800)},(_,i)=>p.slice(i*800,i*800+900)):[p])).map(t=>t.trim()).filter(t=>t.length>=24);
  const picked=[],seen=new Set();
  for(const pattern of Object.values(terms)){const p=candidates.find(t=>pattern.test(fold(t))&&!seen.has(t));if(p){picked.push(p);seen.add(p);}}
  for(const p of candidates)if(picked.length<7&&!seen.has(p)){picked.push(p);seen.add(p);}
  const sections=[];
  for(const paragraph of picked){if(used+paragraph.length>60000)continue;used+=paragraph.length;
   const proofIds=[];for(const quote of citationChunks(paragraph)){const id='e'+(cards.length+1);cards.push({id,url:s.finalUrl||s.url,title:s.title,quote,method:s.method,...(s.metadataOnly?{metadataOnly:true}:{}),scope:s.metadataOnly?'Yalnız yayıncının başlık/açıklama meta verisi; sayfa işlevi veya performans kanıtı değildir.':'Okunmuş sayfanın konuya ilişkin kesiti; tam site veya çalışırlık testi değildir.'});proofIds.push(id);}
   for(const id of proofIds)proofGroups.set(id,proofIds);
   sections.push({text:paragraph,proofIds});
  }
  for(const quote of technicalCitations(s)){const id='e'+(cards.length+1);cards.push({id,url:s.finalUrl||s.url,title:s.title,quote,method:'html-signals',scope:'Yalnız indirilen HTML sinyali; yokluk/çalışırlık/mobil hız testi değildir.'});sections.push({text:quote,proofIds:[id]});}
  sources.push({url:s.finalUrl||s.url,requestedUrl:s.url,title:s.title,method:s.method,...(s.metadataOnly?{metadataOnly:true}:{}),asOf:s.retrievedAt,sections});
 }
 let snippets=0;
 for(const search of evidence.searches||[])for(const s of search.results||[]){
  if(snippets>=6000||sources.some(p=>p.url===s.url))continue;
  const text=String(s.content||'').slice(0,600);if(text.length<24)continue;
  const names=[brief.brandName,...(evidence.packet.entities||[]).map(e=>e.name)];
  if(!names.some(n=>topicWords(n).some(w=>fold(s.title+' '+text).includes(w))))continue;
  snippets+=text.length;const proofIds=[];
  for(const quote of citationChunks(text)){const id='e'+(cards.length+1);cards.push({id,url:s.url,title:s.title,quote,method:'search-snippet',scope:'Arama motorunun kısmi alıntısı; tam sayfa okunmuş değildir.'});proofIds.push(id);}
  for(const id of proofIds)proofGroups.set(id,proofIds);
  sources.push({url:s.url,title:s.title,method:'search-snippet',sections:[{text,proofIds}]});
 }
 // Existing provenance verifier checks each short proof against this exact read
 // paragraph. IDs are server-created; arbitrary model quotes never enter it.
 const packet={...evidence.packet,sources:[...evidence.packet.sources,...sources.filter(s=>s.method==='search-snippet').map((s,i)=>({id:'search'+i,url:s.url,finalUrl:s.url,title:s.title,method:'extracted',excerpts:s.sections.map(x=>({text:x.text}))}))]};
 // Use the existing visible-text provenance verifier for Markdown link labels.
 // The short model IDs stay unchanged; canonical cards prove cleaned quotes
 // against the original read segments before they can enter source records.
 packet.citationCards=cards.map(c=>({...c,id:'proof_'+hash({url:c.url,quote:c.quote}).slice(0,20)}));
 const known=new Map(cards.map(c=>[c.id,c]));
 return {packet,cards,known,proofGroups,input:{brief,asOf:evidence.packet.asOf,entities:evidence.packet.entities,areas:methodologyAreas,sources,unavailable:evidence.packet.unavailable||[]}};
}

// Lossless model transport: repeated page chrome/HTML signals are sent once.
// One visible paragraph ID resolves to all its original proof chunks server-side.
export function expertModelInput(context){
 const input=structuredClone(context.input),counts=new Map(),shared={},ids=new Map();
 for(const source of input.sources)for(const section of source.sections)counts.set(section.text,(counts.get(section.text)||0)+1);
 for(const source of input.sources)for(const section of source.sections){
  section.proofIds=section.proofIds.slice(0,1);
  const count=counts.get(section.text);
  if(count>1&&(count-1)*section.text.length>count*35+50){let id=ids.get(section.text);if(!id){id='paragraph'+(ids.size+1);ids.set(section.text,id);shared[id]=section.text;}delete section.text;section.paragraphRef=id;}
 }
 if(ids.size)input.sharedParagraphs=shared;
 console.info(JSON.stringify({event:'bhs_expert_transport',beforeChars:JSON.stringify(context.input).length,afterChars:JSON.stringify(input).length,sharedParagraphs:ids.size}));
 return input;
}

export function unsafeExpertClaim(f,quotes){
 const t=fold([f.observation,f.commercialHypothesis,f.question].join(' ')),q=fold(quotes);
 const countUnits=['sikayet|complaints?','yorum|reviews?','takipci|followers?','personel|calisan|employees?','franchise|sube|branches','magaza|stores?','liman|ports?'];
 if(/(?:olcum|roas|retarget|yeniden pazarlama|butce|donusum)[^.?!]{0,120}(?:imkansiz|yapilamaz|yapilamiyor|sifira|mahved|mahvol)/.test(t))return 'unmeasured_performance';
 if(/(?:403|ebusy|bot)/.test(q)&&/(?:seo|google|ziyaretci|musteri)[^.?!]{0,100}(?:bozuk|erisem|engell|kritik sorun)/.test(t))return 'reader_failure_not_brand_failure';
 if(/followers|takipci/.test(q)&&!/(?:employees|personel|calisan|team size)/.test(q)&&/(?:\d+[\s\S]{0,30}(?:personel|calisan)|(?:personel|calisan)[\s\S]{0,30}\d+)/.test(t))return 'followers_not_employees';
 if(/tek (?:bir )?(?:fiziksel lokasyon|sube|magaza)/.test(t)&&!/(?:tek|yalnizca bir|sadece bir|single|only one|one (?:store|location|branch))/.test(q))return 'location_total_unconfirmed';
 const countText=q.replace(/(?<=\d)[,.](?=\d{3}(?:\D|$))/g,'');
 for(const unit of countUnits)for(const match of t.matchAll(new RegExp('(?<![a-z0-9])([0-9]+(?:[.,][0-9]+)*)\\s*(?:adet\\s*)?(?:'+unit+')','g'))){
  const literal=match[1].replace(/(?<=\d)[,.](?=\d{3}(?:\D|$))/g,'').replace(/[.*+?^$()|[\]{}\\]/g,'\\$&'),bound='(?<![a-z0-9.,])'+literal+'(?![0-9.,])';
  if(!new RegExp(bound+'\\s*(?:adet\\s*)?(?:'+unit+')|(?:'+unit+')[ :–-]*'+bound).test(countText))return 'quantity_unit_unconfirmed';
 }
 if(/shopify|wordpress|ideasoft|woocommerce/.test(q)&&/(?:geride|mahrum|avantaj|ustun|sorunsuz|iki kat|2x|verimsiz|daha eski|daha modern|yavaslat|hizli operasyon)/.test(t))return 'platform_not_performance';
 if(/(?:price|fiyat|traffic|trafik|followers|takipci)/.test(q)&&!/(?:profit|ebitda|net income|net kar|katki kar)/.test(q)&&/(?:kar marjini artir|yuksek kar marj|gelirde onemli.*artis|finansal olarak saglikli|gelir artisi.*guclu)/.test(t))return 'proxy_not_profit';
 if(/(?:bulten|newsletter|blog|crm|analitik|analytics|pixel|piksel)[^.?!]{0,70}(?:yoktur|yok\b|bulunmamaktadir|kurulu degil|kurulu olmadigi)/.test(t)&&!/(?:indirilen html|kaynak kesit|incelenen sayfa|gorusmede|dogrulan)/.test(t))return 'unproven_absence';
 return null;
}

// Keep an observed signal, but do not turn a technical proxy into a diagnosis.
// These are neutral verification questions, not a second paid content review.
export function qualifyExpertFinding(value,quotes){
 const f={...value},q=fold(quotes),t=fold([f.observation,f.commercialHypothesis].join(' '));
 const qualify=(hypothesis,limit,question)=>{f.stance='neutral';f.commercialHypothesis=hypothesis;f.limitation=limit;f.question=question;};
 if(/internet explorer/.test(q)&&/eski|guncel|modern|teknik borc/.test(t))qualify('Tarayıcı desteği kararının güncel ziyaretçi kitlesi ve test sonuçlarıyla uyumu doğrulanabilir.','Eski tarayıcı desteği uyarısı, altyapının eski veya verimsiz olduğunu kanıtlamaz.','Hangi tarayıcı sürümlerini destekliyorsunuz ve bu kararları hangi güncel kullanım/test verileriyle alıyorsunuz?');
 else if(/"(?:analyticsTags|metaPixelTag|mobileViewport)":false/i.test(quotes)&&/olcum|donusum|yeniden pazarlama|retarget|mobil|viewport/.test(t))qualify('İndirilen HTML sinyali ile gerçek kullanıcı oturumundaki ölçüm ve görünüm davranışı, izin ve çalışma zamanı testleriyle birlikte doğrulanabilir.','Statik HTML sinyali; ölçümün yokluğunu, çalışmadığını, reklam verimsizliğini veya mobil sorun olduğunu göstermez.','Analitik/reklam etiketleri hangi yöntemle ve izin koşullarında tetikleniyor; gerçek mobil oturum ve dönüşüm testlerinin sonuçları nedir?');
 else if(/(?:\/en\/|euro|avro|€)/.test(t)&&/turkiye/.test(t)&&/donusum|terk|kayip|lokal|fiyat/.test(t)){
  f.observation=f.observation.replace(/Türkiye pazarına yönelik/giu,'bu araştırma oturumunda incelenen');
  qualify('İncelenen oturumun dil ve para birimi kapsamı, hedef ülkedeki gerçek kullanıcı oturumuyla karşılaştırılarak doğrulanabilir.','Araştırma oturumu Türkiye kullanıcı deneyimini, yanlış fiyatlandırmayı veya satış kaybını kanıtlamaz.','Hedef ülkelere göre beklenen dil/para birimi yönlendirmeleri nelerdir ve gerçek kullanıcı testlerinde bu kurallar beklendiği gibi çalışıyor mu?');
 }
 else if(/e-posta|e posta|email/.test(t)&&/alan ad|domain/.test(t)&&/seo|otorite|dmarc|spf|teslim edilebilir/.test(t))qualify('Web ve e-posta alan adlarının görevleri netleştirilerek marka iletişimi tercihlerinin gerekçesi anlaşılabilir.','Farklı e-posta alan adı; bölünmüş SEO otoritesi, güvenlik veya teslimat sorunu kanıtı değildir.','Hangi alan adları yalnız e-posta için, hangileri web sitesi veya yönlendirme için kullanılıyor?');
 else if(/shopify|wordpress|ideasoft|woocommerce|platformHints|e-turizm platform/i.test(quotes)&&/platform|altyapi/.test(t)&&/maliyet|hiz|kolay|esnek|olceklen|kontrol|avantaj|yuk|modern|yavas|basitles|sadelest|odaklan|ekosistem/.test(t))qualify('Mevcut platformun operasyon ve entegrasyon ihtiyaçlarına uyumu, somut süre/maliyet ve kullanım verileriyle değerlendirilebilir.','Platform adı veya HTML ipucu; performans, kolaylık, maliyet veya ölçeklenme üstünlüğü kanıtı değildir.','Platformun karşıladığı ihtiyaçları ve varsa entegrasyon/operasyon kısıtlarını hangi somut ölçümlerle değerlendiriyorsunuz?');
 else if(/followers|takipci/.test(q)&&/yeni oldug|aktif.*yonetil|yonetilmed|pasif/.test(t))qualify('İlgili kanalın hedef kitlesi ve ticari katkısı güncel yayın, etkileşim ve yönlendirme verileriyle değerlendirilebilir.','Takipçi sayısı tek başına kanalın aktif yönetilmediğini veya düşük performansı göstermez.','Bu kanal için hedefiniz, güncel yayın/etkileşim ölçümleriniz ve takip edilen ticari katkınız nedir?');
 else if(/kurucu|kardes|founder/.test(t)&&/kisi bagim|asiri bagim|kilit karar|devredile|kuruculara.*bagim/.test(t))qualify('Kurucu hikayesinin marka iletişimindeki rolü ile operasyonel görev dağılımı ayrı konular olarak değerlendirilebilir.','Kurucuların kamuya açık görünürlüğü, operasyonun kuruculara bağımlı olduğunu veya devir sorunu yaşadığını kanıtlamaz.','Kritik görevler, karar yetkileri ve bilgi paylaşımı ekip içinde nasıl düzenleniyor; bu düzeni değerlendirmek için hangi somut göstergeleri kullanıyorsunuz?');
 else if(/holding|ortaklik/.test(t)&&/finansal guc|istikrarli.*kaynak|onemli.*rekabet avantaj|yatirim.*guclu/.test(t))qualify('Ortaklık yapısının yatırım kararlarına ve kaynak tahsisine etkisi güncel şirket verileriyle değerlendirilebilir.','Bir holdinge bağlı olmak, markaya ayrılmış bütçeyi, mevcut yatırım gücünü veya rekabet üstünlüğünü kanıtlamaz.','Ortaklık yapısının yatırım kararları ve kaynak tahsisine etkisini hangi güncel verilerle değerlendirebiliriz?');
 else if(/ihracat|export/.test(t)&&/gelir kaynaklarini cesitlend|bagimliligini azalt|kur.*koruma|guclu ihracat/.test(t))qualify('İhracat yapılan pazarların gelir içindeki payı ve kur riskinin yönetimi, dönemsel verilerle değerlendirilebilir.','Ülke sayısı tek başına gerçekleşmiş gelir çeşitliliği, kârlılık veya kur riskinden korunma kanıtı değildir.','Yurt içi ve yurt dışı gelir dağılımı, pazar yoğunlaşması ve kur riskini hangi dönemsel verilerle izliyorsunuz?');
 else if(/oturum ac|oturum duvar|accounts\/login/.test(t))qualify('Markanın kullandığı dijital kanallar ve erişim davranışı gerçek kullanıcı oturumlarında ayrı ayrı doğrulanabilir.','Platformun bu okuyucuya gösterdiği giriş ekranı; müşterilerin erişemediğini, markanın web sitesi olmadığını veya satış kaybı yaşandığını kanıtlamaz.','Hangi web, sosyal profil, menü ve sipariş kanallarını kullanıyorsunuz; bunların gerçek kullanıcı erişimini ve ticari katkısını nasıl ölçüyorsunuz?');
 else if(/kargo/.test(t)&&/abonelik/.test(t)&&/avantaj|kosulsuz|agresif|daha dusuk/.test(t))qualify('Kargo politikalarının etkisi aynı ürün, sepet ve abonelik koşullarında karşılaştırılarak değerlendirilebilir.','Tek seferlik alışveriş eşiği ile abonelikte ücretsiz kargo aynı koşul değildir; bu veriler doğrudan üstünlük veya müşteri kaybı göstermez.','Benzer ürün, sepet ve abonelik koşullarında müşterinin ödediği toplam tutar ve kargo maliyetinin satın alma davranışıyla ilişkisini nasıl değerlendiriyorsunuz?');
 else if(/yorum/.test(t)&&/hic olmamasi|mekanizma.*eksik|sistem.*eksik|gostermeme|yorum.*etkisiz/.test(t))qualify('İncelenen ürün sayfalarındaki yorum görünümü; satın alma sonrası yorum toplama, moderasyon ve yayınlama kurallarıyla birlikte değerlendirilebilir.','Bazı sayfalardaki yorum yokluğu veya sıfır sayacı, markanın yorum toplamadığını, sistemin etkisiz olduğunu ya da müşteri güveninin düştüğünü kanıtlamaz.','Satın alma sonrası yorum toplama, moderasyon ve yayınlama kurallarınız nelerdir; sayfa, dönem ve sipariş hacmine göre bu mekanizmayı nasıl değerlendiriyorsunuz?');
 else if(/kullanmamasi|kullanmama|one cikarmamasi|belirgin degil|indirimsiz gorunum|mekanizma.*eksik|sistem.*eksik/.test(t))qualify('Gözlemlenen mekanizmanın markadaki karşılığı ve ticari etkisi, mevcut uygulamalar ve deney verileriyle doğrulanabilir.','Sınırlı sayfa gözlemi veya rakipte bir özellik bulunması; markada bu mekanizmanın yokluğunu, etkisizliğini veya müşteri kaybını kanıtlamaz.','Benzer mekanizmaları kullanıyor musunuz? Kullanıyorsanız hangi müşteri gruplarında, hangi deney ve sonuç verileriyle değerlendiriyorsunuz?');
 if(/avantaj sagli|ustunlug|daha rekabetci/.test(fold(f.question))&&!/var mi|olup olmadig|dogrulan|olcumlendi|saglayip saglama/.test(fold(f.question)))f.question='Bu gözlemin müşteri tercihi ve ticari sonuçlarla ilişkisini hangi verilerle değerlendiriyorsunuz?';
 return f;
}
export function labelUnconfirmedComparison(f){
 const statement='Doğrudan rakipliği doğrulanmamış karşılaştırma örneği: '+f.statement.replace(/doğrudan rakip olarak/giu,'karşılaştırma adayı olarak').replace(/doğrudan rakipler/giu,'karşılaştırma adayları').replace(/doğrudan rakip/giu,'karşılaştırma adayı');
 return {...f,statement,reportExcerpt:statement,impact:f.impact.replace(' Sınır: ',' Sınır: Karşılaştırılan işletmenin doğrudan rakipliği doğrulanmadı. ')};
}

export function projectExpertReport(value,context){
 // Only immutable proof IDs from the compact contract are accepted here.
 // A model cannot bypass these semantic guards by returning a legacy report.
 const raw=value||{},cards=context.known,issues=[],sources=new Map();
 // A model ID identifies a bounded paragraph, not a disconnected 200-char
 // slice. Retain its adjacent proof chunks so a cited sentence stays readable.
 const refs=ids=>unique(list(ids).filter(id=>cards.has(id)).flatMap(id=>context.proofGroups?.get(id)||[id]));
 const use=ids=>refs(ids).map(id=>{const c=cards.get(id);sources.set(id,{...c,publishedAt:null,period:null,sourceType:c.method==='search-snippet'?'secondary':'primary'});return id;});
 const findings=[],seenIds=new Set(),qualifiedStances=new Map();
 for(const original of list(raw.findings).filter(f=>f&&typeof f==='object')){
  const sourceIds=refs(original.sourceIds),quotes=sourceIds.map(id=>cards.get(id).quote).join('\n'),f=qualifyExpertFinding(original,quotes);
  const reason=unsafeExpertClaim(f,quotes);
  if(typeof f.id!=='string'||seenIds.has(f.id)||!dimensions.some(d=>d.id===f.dimension)||typeof f.observation!=='string'||!f.observation.trim()||!sourceIds.length||list(f.sourceIds).some(id=>!cards.has(id))||reason){issues.push({path:'findings.'+f.id,reason:reason||'unsupported_finding'});continue;}
  seenIds.add(f.id);
  qualifiedStances.set(f.id,f.stance);
  const locale=sourceIds.map(id=>cards.get(id).url).some(url=>/\/en(?:\/|$)|\.us(?:\/|$)/.test(url));
  if(locale&&/(?:turkiye.*(?:musteri|donusum|satin)|turk lira.*yerine|yurt ici.*(?:bozuk|engell))/i.test(fold(f.observation))){issues.push({path:'findings.'+f.id,reason:'market_scope_mismatch'});continue;}
  const limitation=String(f.limitation||'İç veriler ve hedef pazar deneyimi görüşmede doğrulanacak.');
  findings.push({id:f.id,dimension:f.dimension,kind:f.kind==='observation'?'observation':'inference',statement:f.observation,reportExcerpt:f.observation,sourceIds:use(sourceIds),impact:'Hipotez: '+String(f.commercialHypothesis||'Bu gözlemin ticari etkisi görüşmede değerlendirilecek.')+' Sınır: '+limitation,goalConnection:String(f.question||'Bu gözlemin iş sonuçlarına etkisini hangi verilerle değerlendirebiliriz?'),priority:f.priority||'medium'});
 }
 const findingById=new Map(findings.map(f=>[f.id,f])),entities=context.input.entities||[],brand=entities.find(e=>e.role==='brand'),brandHost=researchHost(context.input.brief.website);
 const competitors=[];
 for(const p of list(raw.peers).filter(p=>p&&typeof p==='object')){
  const e=entities.find(e=>e.id===p.entityId&&e.role==='competitor');if(!e||p.relationship!=='direct')continue;
  const publisher=card=>researchHost(card.url)===researchHost(e.website)||context.input.sources.some(s=>s.url===card.url&&s.requestedUrl&&researchHost(s.requestedUrl)===researchHost(e.website));
  const readProduct=card=>publisher(card)&&!card.metadataOnly&&!['html-signals','search-snippet'].includes(card.method);
  let sourceIds=refs(p.sourceIds).filter(id=>readProduct(cards.get(id)));if(!sourceIds.length)continue;
  const category=topicWords(e.scope+' '+e.audienceReason);
  const expectedCategories=categories.filter(p=>p.test(fold(e.scope+' '+e.audienceReason)));
  // A newsletter citation is not product identity. Reuse a product paragraph
  // already read from that same publisher instead of losing a valid peer or
  // trusting an unrelated same-name business. No new request or model call.
  const productCards=[...cards.values()].filter(c=>readProduct(c)&&(expectedCategories.length?expectedCategories.some(p=>p.test(fold(c.quote))):category.some(w=>fold(c.quote).includes(w))));
  sourceIds=unique([...sourceIds,...refs(productCards.slice(0,3).map(c=>c.id))]);
  const evidence=fold(sourceIds.map(id=>cards.get(id).quote).join(' '));
  if(expectedCategories.length?!expectedCategories.some(p=>p.test(evidence)):category.length&&!category.some(w=>evidence.includes(w))){issues.push({path:'competitors.'+e.id,reason:'entity_product_unconfirmed'});continue;}
  // Bind the displayed peer URL to its verified final host (www redirects are
  // common). The legacy source gate still requires an exact source hostname.
  competitors.push({...e,website:new URL(cards.get(sourceIds[0]).url).origin,sourceIds:use(sourceIds),scaleReason:'Ölçek eşitliği bu araştırmada doğrulanmadı; karşılaştırma ürün ve müşteri ihtiyacı temelindedir.',audienceReason:typeof p.reason==='string'&&p.reason.trim()&&supportedNumbers(p.reason,evidence)?'Kaynaklı ürün/kitle kıyası: '+p.reason:'Ürün ve hedef kitle örtüşmesinin kapsamı görüşmede doğrulanacak.',geographyReason:'Coğrafi kapsam incelenen kaynaklarla sınırlıdır; hedef pazardaki erişim ayrıca doğrulanmalıdır.'});
 }
 // A rejected direct peer can still supply a factual comparison example,
 // but every derived section must preserve its unconfirmed relationship.
 const unconfirmed=entities.filter(e=>e.role==='competitor'&&!competitors.some(p=>p.id===e.id));
 for(const f of findings)if(unconfirmed.some(e=>fold([f.statement,f.impact,f.goalConnection].join(' ')).includes(fold(e.name))))Object.assign(f,labelUnconfirmedComparison(f));
 const hasBrand=f=>f.sourceIds.some(id=>researchHost(cards.get(id).url)===brandHost);
 const relevantIds=(ids,dimension)=>unique(list(ids).filter(id=>findingById.has(id)&&(!dimension||findingById.get(id).dimension===dimension)));
 const researchCoverage=methodologyAreas.map(a=>{
  // One grounded observation can support several methodology areas (for
  // example platform use in both digital and operations). Its primary display
  // dimension must not erase those cross-references or duplicate the finding.
  const v=raw.coverage?.[a.key]||{},ids=relevantIds(v.findingIds),selected=ids.map(id=>findingById.get(id));
  return {dimension:a.dimension,topic:a.topic,status:selected.length&&v.status!=='unavailable'?(v.status==='observed'?'observed':'partial'):'unavailable',observation:selected.length?selected.map(f=>f.statement).join(' '):String(v.note||'Bu araştırmada veri bulunamadı; görüşmede doğrulanacak.'),sourceIds:unique(selected.flatMap(f=>f.sourceIds))};
 });
 const projectedDimensions=dimensions.map(({id})=>{
  const d=list(raw.dimensions).find(d=>d?.id===id)||{},ids=relevantIds(d.findingIds,id),selected=ids.map(id=>findingById.get(id));
  const compared=relevantIds(d.comparisonFindingIds).map(id=>findingById.get(id));
  const peerIds=competitors.filter(p=>compared.some(f=>f.sourceIds.some(sid=>researchHost(cards.get(sid).url)===researchHost(p.website)))).map(p=>p.id);
  const perceptionEvidence=id!=='perception'||selected.some(f=>f.sourceIds.some(sid=>/sikayetvar\.com|trustpilot\.com|google\.[^/]+\/(?:maps|reviews)|maps\.app\.goo\.gl/.test(cards.get(sid).url)));
  const score=perceptionEvidence&&selected.some(hasBrand)&&peerIds.length&&typeof d.bandReason==='string'&&d.bandReason.trim()&&typeof d.score==='number'&&d.score>=0&&d.score<=100&&!issues.some(x=>x.path.startsWith('findings.')&&list(d.findingIds).includes(x.path.split('.').at(-1)))?d.score:null;
  const qs=selected.map(f=>f.goalConnection).filter(Boolean);
  const stance=f=>qualifiedStances.get(f.id);
  return {id,score,dataStatus:selected.length?'partial':'insufficient',rationale:selected.length?selected.map(f=>f.statement).join(' '):'Bu boyut için yeterli kanıt bulunamadı; görüşmede doğrulanacak.',findingIds:ids,comparisonCompetitorIds:peerIds,strengths:selected.filter(f=>stance(f)==='positive').map(f=>f.statement),gaps:selected.filter(f=>stance(f)==='risk').map(f=>f.kind==='inference'?'Doğrulanacak hipotez: '+f.statement:f.statement),onboardingQuestions:qs.length?qs:['Bu boyutun mevcut durumunu hangi güncel verilerle doğrulayabiliriz?']};
 });
 const entityIds=new Set([brand?.id,...competitors.map(e=>e.id)]);
 const benchmarks=[];
 for(const b of list(raw.benchmarks).filter(b=>b&&typeof b==='object')){
  if(!entityIds.has(b.entityId))continue;
  const sourceIds=refs(b.sourceIds),quotes=sourceIds.map(id=>cards.get(id).quote).join('\n');
  if(!sourceIds.length||!supportedNumbers([b.value,b.period].join(' '),quotes)||unsafeExpertClaim({observation:[b.value,b.unit].join(' ')},quotes))continue;
  const expected=entities.find(e=>e.id===b.entityId),identity=s=>fold(s).replace(/[^a-z0-9]/g,'');
  if(!expected||!sourceIds.some(id=>researchHost(cards.get(id).url)===researchHost(expected.website)||identity(cards.get(id).title+' '+cards.get(id).quote).includes(identity(expected.name))))continue;
  if(['webTraffic','domainAuthority','socialAudience','reviews'].includes(b.metric)&&(!/\d/.test(b.value)||!b.unit||!b.period))continue;
  if(b.metric==='revenueOrGrowth'&&/traffic|trafik/i.test(b.value))continue;
  let row=benchmarks.find(row=>row.metric===b.metric);if(!row){row={metric:b.metric,entries:[]};benchmarks.push(row);}
  row.entries.push({entityId:b.entityId,value:b.value,unit:b.unit||null,period:b.period||null,sourceIds:use(sourceIds)});
 }
 for(const metric of expertSchema.properties.benchmarks.items.properties.metric.enum){
  let row=benchmarks.find(b=>b.metric===metric);if(!row){row={metric,entries:[]};benchmarks.push(row);}
  for(const entityId of entityIds)if(entityId&&!row.entries.some(e=>e.entityId===entityId))row.entries.push({entityId,value:null,unit:null,period:null,sourceIds:[]});
 }
 const meetingQuestions=findings.slice().sort((a,b)=>({high:0,medium:1,low:2}[a.priority])-({high:0,medium:1,low:2}[b.priority])).slice(0,8).map(f=>({dimension:f.dimension,question:f.goalConnection,findingIds:[f.id]}));
 for(const d of projectedDimensions)if(meetingQuestions.length<5&&!meetingQuestions.some(q=>q.dimension===d.id))meetingQuestions.push({dimension:d.id,question:d.onboardingQuestions[0],findingIds:d.findingIds});
 const overview=relevantIds(raw.overviewIds).map(id=>findingById.get(id));
 const report={summary:(overview.length?overview:findings.slice(0,4)).map(f=>f.statement).join(' '),sources:[...sources.values()],findings,competitors,dimensions:projectedDimensions,benchmarks,meetingQuestions,serviceRecommendations:[],researchCoverage,criticalOpportunityFindingId:findingById.has(raw.opportunityId)&&qualifiedStances.get(raw.opportunityId)!=='risk'?raw.opportunityId:null,criticalRiskFindingId:findingById.has(raw.riskId)&&qualifiedStances.get(raw.riskId)==='risk'?raw.riskId:null};
 const grounded=groundOfferReport(report,{packet:context.packet,brief:context.input.brief,preserveQualifiedImpacts:true});
 delete grounded.originalReport;
 grounded.transfer.issues.push(...issues);grounded.transfer.contentComplete=!grounded.transfer.issues.length;
 return grounded;
}
