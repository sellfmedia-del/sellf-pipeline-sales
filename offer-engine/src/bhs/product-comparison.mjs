import {isReadEvidence} from './research-content.mjs';
import {researchHost,researchUrl} from './research-url.mjs';
import {brandPublisherHosts} from './brand-publishers.mjs';
import {buyerNeed} from './buyer-procurement.mjs';

export const comparisonFields=Object.freeze({
 sku:'SKU',pieces:'Parça adedi',footprint:'Kapladığı alan',age:'Hedef yaş',
 price:'Liste fiyatı',vat:'KDV',delivery:'Teslimat'
});
export const productComparisonPlanInstruction='Briefteki hedef belirli bir ürün, model veya paket üzerinden değerlendirilecekse comparisonProduct alanında ürün adını aynen koru. Önce reference göreviyle markanın kendi ürün sayfasından ürün sınıfı, kullanım biçimi ve hedef alıcıyı doğrula. publisherSources içindeki bilinen ürün bağlantılarını kullan; ilgili ürün sayfası henüz bulunmadıysa ürünün tam adı ve doğrulanmış resmî alan adıyla tek dar arama seç. Hakkımızda, kategori veya genel marka sayfasını tekil ürün doğrulaması sayma. Unconfirmed alan adı önce kurumsal kaynakla doğrulanacak adaydır. Ürün sınıfını belirleme işine tüm fiyat, yaş, ölçü ve teslimat alanlarını zorunlu olarak yükleme; teklif için gerekli diğer alanları ayrıca seç ve bilinmeyeni açık bırak. Ürün sınıfı belirlenmeden rivals fiyat veya rakip sorgusu açma. Sonraki rivals görevinde genel kategori yerine aynı ihtiyaca, ürün formuna, alıcıya ve hedef pazara göre yakın ürünleri ara. Geniş ürün ailesi, genel ekipman veya komşu kategoriyi dolaylı alternatif olarak ayır. Ürüne özel araştırma yoksa comparisonRole none ve comparisonProduct boş olsun.';
export const productComparisonReviewInstruction='Ürüne özel kıyasta reference görevinin doğrudan okunmuş marka kaynağına dön. Karşılaştırılan aynı ihtiyacı, ürün formunu, hedef alıcıyı ve pazarı koru. Bir direct kayıt için productMatch içinde kendi referans ürünü ile rakibin tekil ürün sayfasına ait proof kimliklerini ve iki sayfadaki ürün sınıfı ifadelerini aynen ver. URL rakibin okunan ürün sayfası olmalı. İki ürün için SKU, parça adedi, gerçekten kapladığı alan, hedef yaş, liste fiyatı, KDV ve teslimatı referenceFields ve candidateFields içinde ayrı topla. Her değer ilgili varyantın kendi sayfasındaki özgün ifadeyi ve proof kimliğini taşısın. Birleşik Krallık fiyatında açık GBP veya £ işareti gereklidir. Parça ölçüsünü toplam alan diye yazma. Katalog, eksik kanıt ve genel duyusal oda ekipmanı doğrudan muadil sayılmaz. Dolaylı alternatifi related olarak sakla. Bilinmeyen alanı doldurma.';
export const productComparisonRoleInstruction='Görevin başlığı rakip araştırması ve comparisonProduct doluysa comparisonRole rivals olmalı; none bırakma. Markanın referans ürünü için reference kullan. Satın alma karar vericisi gibi bağımsız sorulara ürün kıyası rolü yükleme.';
export const productComparisonContinuationInstruction=productComparisonRoleInstruction+' sourceReadFailures içindeki URL için okuma çalışmış fakat kullanılabilir kaynak metni alınamamıştır; bu durum ürünün bulunmadığını veya rakip araştırmasının bittiğini göstermez. Aynı sorunun knownUrls ve findings içindeki diğer gözlemlenmiş aday ürün sayfalarını değerlendir. Sıradaki uygun sayfayı aynı ihtiyaç kimliğiyle read komutuna ver; gereksiz yeni arama satın alma. Ürün sınıfı, ürün formu, hedef alıcı, pazar, fiyat bandı ve satış kanalı ölçütlerini koru. Bir adayın okunamaması, bu ölçütleri gevşetme gerekçesi değildir. Okunan ama uygun olmayan ürünü direct yapma; aday veya dolaylı alternatif olarak ayır. Uygun gözlemlenmiş aday kalmadıysa aynı soruya yönelik tek dar sorguyu kendin seç. Daha önce uygulanmış okumayı tekrar etme. Sıradaki adayın seçimi sana aittir; kod otomatik rakip veya araştırma görevi üretmez.';

// Reconcile the two labels the controller already supplied. This does not
// invent a product, infer a reference product or choose a competing company.
export function coherentComparisonRole(need){
 const role=typeof need.comparisonRole==='string'?need.comparisonRole.trim():need.comparisonRole||'none';
 return role==='none'&&typeof need.comparisonProduct==='string'&&need.comparisonProduct.trim()&&
  !(typeof need.buyerSegment==='string'&&buyerNeed(need))&&
  /rakip|rekabet|competit|rival/iu.test([need.section,need.sectionTitle].filter(Boolean).join(' '))?'rivals':role;
}

export function unreadableComparisonSources(needs,receipts){
 const relevant=new Set(needs.filter(n=>n.comparisonProduct&&['reference','rivals'].includes(n.comparisonRole)&&!buyerNeed(n)).map(n=>n.id));
 const reads=new Map();
 const remember=(id,raw,readable)=>{
  const url=researchUrl(raw);if(!url)return;
  if(!reads.has(id))reads.set(id,new Map());
  reads.get(id).set(url,readable);
 };
 for(const receipt of receipts){
  if(!relevant.has(receipt.id))continue;
  for(const row of receipt.sourceReads||[])if(typeof row.readable==='boolean')remember(receipt.id,row.url,row.readable);
  for(const fact of receipt.facts||[])if(isReadEvidence(fact))remember(receipt.id,fact.url,true);
 }
 return [...reads].flatMap(([id,urls])=>{
  const failed=[...urls].filter(([,readable])=>!readable).map(([url])=>url);
  return failed.length?[{id,urls:failed}]:[];
 });
}

const fold=value=>String(value||'').normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replaceAll('ı','i').replace(/\s+/gu,' ').trim();
const words=value=>fold(value).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const includes=(text,value)=>Boolean(words(value))&&(' '+words(text)+' ').includes(' '+words(value)+' ');
const sameFocus=(a,b)=>Boolean(a.comparisonProduct&&a.country&&b.country&&
 words(a.comparisonProduct)===words(b.comparisonProduct)&&a.country.toUpperCase()===b.country.toUpperCase());

const identityText=fact=>{
 const path=new URL(fact.url).pathname;
 let decoded=path;try{decoded=decodeURIComponent(path);}catch{/* Keep a malformed escape literal. */}
 return [fact.title,fact.quote,decoded].join(' ');
};
const productNamed=(fact,product)=>{
 const name=words(product).split(' ').filter(Boolean),source=new Set(words(identityText(fact)).split(' '));
 return name.length>0&&name.every(word=>source.has(word));
};
function referenceProofs(need,needs,facts,decisions,hosts){
 const refs=new Set(needs.filter(n=>n.comparisonRole==='reference'&&sameFocus(need,n)&&decisions.get(n.id)?.sufficient===true).map(n=>n.id));
 return facts.filter(f=>refs.has(f.needId)&&researchUrl(f.url)&&hosts.has(researchHost(f.url))&&isReadEvidence(f)&&
  productPage(f.url)&&decisions.get(f.needId).proofs.includes(f.id)&&productNamed(f,need.comparisonProduct));
}
export function comparisonCanStart(need,needs,facts,decisions,website,packet){
 return need.comparisonRole!=='rivals'||referenceProofs(need,needs,facts,decisions,brandPublisherHosts(website,packet)).length>0;
}
export function comparisonReferenceVerified(need,needs,facts,decisions,website,packet){
 return need.comparisonRole!=='reference'||referenceProofs(need,needs,facts,decisions,brandPublisherHosts(website,packet)).some(f=>f.needId===need.id);
}

function productPage(url){
 const path=new URL(url).pathname;
 return path.length>1&&!/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:collections|categories|category|search|catalog(?:ue)?)(?:\/[^/]+)?\/?$/iu.test(path)&&
  !/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:shop|products)\/?$/iu.test(path)&&
  !/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:about|contact|faq|privacy|terms|delivery|shipping|returns|hakkimizda|iletisim|kurumsal|how-to|guides?|blog|news|help|support)(?:[-/.]|$)/iu.test(path);
}
const tileForm=/\b(?:mats?|floor tiles?|karo\p{L}*|paspa[sz]\p{L}*)\b/u;
const roomEquipment=/\b(?:sensory rooms?|duyusal oda\p{L}*|bubble tubes?|projectors?|projection|lighting|isiklik|aydinlatma)\b/u;
const fieldContext={sku:/\b(?:sku|product code|item number|urun kodu|model code)\b/u,
 pieces:/\b(?:pieces|tiles|mats|parca|adet|puzzles?)\b/u,footprint:/\b(?:cm|mm|ft|m2|m²|metrekare|sq\.? ?ft|metres?)\b/u,
 age:/\b(?:ages?|yas|years?|months?|aylik|preschool)\b/u,vat:/\b(?:vat|kdv)\b/u,
 delivery:/\b(?:delivery|shipping|dispatch|teslimat|kargo|gonderim)\b/u};
function fieldsFor(rows,source,need,facts,decisions,byNeed){
 const fields={};
 const sourceNeed=byNeed.get(source.needId);
 for(const row of Array.isArray(rows)?rows:[]){
  const {field,value,proof}=row||{};
  if(!Object.hasOwn(comparisonFields,field)||Object.hasOwn(fields,field)||typeof value!=='string'||!value.trim()||value.length>120)continue;
  const sameProductNeed=id=>byNeed.get(id)?.comparisonRole===sourceNeed.comparisonRole&&sameFocus(sourceNeed,byNeed.get(id));
  const fact=facts.find(f=>f.id===proof&&sameProductNeed(f.needId)&&researchUrl(f.url)===researchUrl(source.url)&&
   isReadEvidence(f)&&decisions.get(f.needId)?.proofs.includes(f.id));
  if(!fact||!fold(fact.quote).includes(fold(value)))continue;
  if(field==='price'&&(!/\d/u.test(value)||need.country.toUpperCase()==='GB'&&!/(?:£|\bGBP\b)/iu.test(value)))continue;
  if(['pieces','footprint'].includes(field)&&!/\d/u.test(value))continue;
  if(fieldContext[field]&&!fieldContext[field].test(fold(field==='sku'?fact.quote:value)))continue;
  if(field==='footprint'&&!/\b(?:total|covers?|coverage|footprint|assembled|kapladig|toplam)\p{L}*/u.test(fold(value)))continue;
  fields[field]={value:value.trim(),proof:fact};
 }
 return fields;
}

// Claude chooses the product class and peers. Direct status requires two
// reviewed product pages, and each commercial field keeps its own evidence.
export function qualifyProductPeers(peers,needs,facts,decisions,website,packet){
 if(!needs.some(n=>n.comparisonProduct&&n.comparisonRole!=='none'))return peers;
 const byNeed=new Map(needs.map(n=>[n.id,n])),byId=new Map(facts.map(f=>[f.id,f])),hosts=brandPublisherHosts(website,packet);
 return peers.map(peer=>{
  if(peer.relationship!=='direct')return peer;
  const match=peer.productMatch||{};
  const ref=byId.get(match.referenceProof),candidate=byId.get(match.candidateProof),need=byNeed.get(candidate?.needId);
  const referenceUrl=researchUrl(ref?.url),url=researchUrl(peer.url);
  const candidateDescription=words([match.candidateClass,peer.product].join(' '));
  const related=tileForm.test(words(match.referenceClass))&&roomEquipment.test(candidateDescription)&&!tileForm.test(candidateDescription);
  if(need?.comparisonRole!=='rivals'||!ref||!candidate||!url||!referenceUrl||
    !productPage(url)||!productPage(referenceUrl)||researchUrl(candidate.url)!==url||hosts.has(researchHost(url))||
    !isReadEvidence(candidate)||!decisions.get(candidate.needId)?.proofs.includes(candidate.id)||
    !referenceProofs(need,needs,facts,decisions,hosts).some(f=>f.id===ref.id)||
    !includes(identityText(ref),match.referenceClass)||!includes(identityText(candidate),match.candidateClass)||!includes(identityText(candidate),peer.product)||
    !peer.market||!peer.channel||related)return {...peer,relationship:related?'related':'candidate'};
  return {...peer,verifiedProductMatch:{
   referenceNeedId:ref.needId,candidateNeedId:candidate.needId,
   reference:{name:need.comparisonProduct,category:match.referenceClass,proof:ref,fields:fieldsFor(match.referenceFields,ref,need,facts,decisions,byNeed)},
   candidate:{name:peer.product,category:match.candidateClass,proof:candidate,fields:fieldsFor(match.candidateFields,candidate,need,facts,decisions,byNeed)}
  }};
 });
}
