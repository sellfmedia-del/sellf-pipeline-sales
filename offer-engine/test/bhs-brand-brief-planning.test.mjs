import assert from 'node:assert/strict';
import test from 'node:test';
import {brandSourceExcerpts} from '../src/bhs/brand-review-state.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {understandScopedBrand,understandScopedBrief,planScopedResearch,reviewScopedResearch} from '../src/bhs/scoped-research.mjs';
import {assertSchema} from '../src/bhs/schema.mjs';

const brief=snapshotBrief({brandName:'Pati Care',website:'https://pati.example/',segment:'kobi',
 goals:'Türkiye perakende pazarında bakım ürünü satışını büyütmek.',
 needs:'Türkiye online satış kanallarını yönetecek partner arıyoruz.',
 services:'Web sitesi ve perakende kanal yönetimi.',meetingNotes:'Amazon kanalını mevcut bir partner yönetiyor.'});
const productText='Kıtık açıcı tüy bakım spreyi ve kedi kumu spreyi. Ürünler Shopier mağazasında satılır; iletişim WhatsApp üzerinden sağlanır.';
const pageText='Marka tanıtımı ve genel açıklamalar. '.repeat(17)+productText;
const source={id:'home',url:brief.website,finalUrl:brief.website,title:'Pati Care',method:'html',
 excerpts:[{id:'p0',text:pageText,offset:0}],technicalSignals:{navigation:[]}};
const packet={asOf:'2026-11-20',entities:[{id:'brand',role:'brand',name:brief.brandName,website:brief.website}],sources:[source]};
const identity={understanding:'Kedi ve köpek bakım spreyleri; Shopier satışı ve WhatsApp iletişimi. Satış hacmi bilinmiyor.'};
const scope={market:'Türkiye',audience:'Perakende alıcıları',objective:brief.goals,fulfilment:'local',
 decisions:[{id:'channels',decision:'Türkiye online satış kanalları nasıl yönetilmeli?',field:'needs',quote:brief.needs}]};
const interpretation={understanding:'Marka kendi perakende kanallarının yönetimi için hizmet istiyor.',scope};
const need=overrides=>({id:'web',section:'digital',sectionTitle:'Satış yolu',target:'Pati Care ürünleri',market:'Türkiye',country:'TR',language:'tr',
 metric:'Ürün sayfasından satın alma yönlendirmesi',expected:'Resmî sayfadaki ürün ve sipariş bağlantısı',period:'güncel',quantity:1,
 query:'Pati Care Türkiye bakım spreyi ürün satın alma resmî mağaza',first:'tavily',since:'',
 comparisonProduct:'',comparisonRole:'none',buyerSegment:'',buyerSourceSegment:'',buyingDimension:'none',
 decisionId:'channels',tradeResearch:false,tradeEvidenceId:'',...overrides});
function plannedData(rows){
 return {needs:rows.map(row=>{
  const {section,sectionTitle,target,market,country,language,...measurement}=row;
  return {section,sectionTitle,target,market,country,language,measurements:[measurement]};
 })};
}
const unexpected=()=>assert.fail('No network, search, scraper or extra model call is authorized by this offline fixture');

test('brand discovery sees concrete products after character 520 without another source or model call',async()=>{
 assert.ok(pageText.indexOf(productText)>520);assert.ok(pageText.length<1560);
 const original=structuredClone(packet);let calls=0;
 const result=await understandScopedBrand({brief,packet:structuredClone(packet),readPages:unexpected,
  providers:{managedBudgetVersion:24,modelHandoff:true,search:unexpected,searchGemini:unexpected,
   async manager(stage,input,contract,options){
    calls++;assert.equal(stage,'bhs-scoped-brand');
    assert.equal(input.card,undefined);assert.equal(input.brief,undefined);
    assert.ok(!JSON.stringify(input).includes(brief.needs));
    assert.equal(input.sources[0].excerpts.join(''),pageText);
    assert.match(input.instruction,/somut ürünü genel sektör tahminiyle değiştirme/);
    assert.equal(options.maxOutputTokens,1400);assert.equal(options.minimumOutputTokens,700);
    const data={...identity,pages:[],searches:[],publishers:[]};assertSchema(data,contract);return {data};
   }}});
 assert.equal(calls,1);assert.equal(result.done,true);assert.deepEqual(result.packet,original);
 assert.equal(result.value.understanding,identity.understanding);
});

test('brand source transport shares the existing allowance and preserves later excerpts and the archive',()=>{
 for(const texts of [[],['a'.repeat(2400)],['a'.repeat(1200),'b'.repeat(60),'c'.repeat(60)],
  ['a'.repeat(20),'b'.repeat(2000),'c'.repeat(2000)],['a'.repeat(1200),'b'.repeat(1200),'c'.repeat(1200),'not selected']]){
  const input={excerpts:texts.map(text=>({text}))},before=structuredClone(input),result=brandSourceExcerpts(input);
  assert.ok(result.length<=3);assert.ok(result.join('').length<=1560);assert.deepEqual(input,before);
  for(let i=0;i<result.length;i++){
   assert.ok(texts[i].startsWith(result[i]));
   assert.ok(result[i].length>=Math.min(texts[i].length,520));
  }
 }
 const short={excerpts:[{text:'Short page with all its products and channels.'}]};
 assert.deepEqual(brandSourceExcerpts(short),short.excerpts.map(row=>row.text));
});

test('legacy discovery keeps its source projection while current discovery uses the complete compact paragraph',async()=>{
 for(const version of [23,24]){
  let count=0;
  await understandScopedBrand({brief,packet:structuredClone(packet),providers:{managedBudgetVersion:version,manager:async(_stage,input)=>{
   count++;assert.equal(input.sources[0].excerpts[0],version===23?pageText.slice(0,520):pageText);
   return {data:{...identity,pages:[],searches:[],publishers:[]}};
  }}});
  assert.equal(count,1);
 }
});

test('brief interpretation preserves customer, provider and offered-work roles in its separate existing call',async()=>{
 let calls=0;
 const result=await understandScopedBrief({brief,identity,providers:{managedBudgetVersion:24,modelHandoff:true,
  async manager(stage,input,contract,options){
   calls++;assert.equal(stage,'bhs-scoped-brief');assert.deepEqual(input.identity,identity);
   assert.equal(input.card.needs,brief.needs);assert.equal(input.card.meetingNotes,brief.meetingNotes);
   assert.match(input.instruction,/Müşterinin alıcısını, mevcut hizmet sağlayıcısını ve bizden istediği işi ayır/);
   assert.match(input.instruction,/açıkça sağlayıcı listesi veya ihale kıyası istenmedikçe/);
   assert.match(input.instruction,/Bu adımda sorgu, görev veya araç seçme/);
   assert.equal(options.maxOutputTokens,1500);assertSchema(interpretation,contract);return {data:interpretation};
  },search:unexpected,searchGemini:unexpected}});
 assert.equal(calls,1);assert.deepEqual(result.value,interpretation);
});

test('planning carries product scope and decision coverage into the same call without inserting fixed tasks',async()=>{
 for(const rows of [[need()],
  [need(),need({id:'prices',section:'pricing',metric:'Aynı bakım spreyi varyantının yerel fiyatı',query:'Pati Care Türkiye bakım spreyi 100 ml fiyat'}),
   need({id:'reviews',section:'experience',metric:'Satın alınan bakım spreyi hakkındaki ürün deneyimi',query:'Pati Care Türkiye bakım spreyi müşteri deneyimi'})]]){
  let calls=0;
  const result=await planScopedResearch({brief,identity,briefUnderstanding:interpretation,asOf:packet.asOf,packet,
   providers:{managedBudgetVersion:24,modelHandoff:true,search:unexpected,searchGemini:unexpected,
    async manager(stage,input,contract,options){
     calls++;assert.equal(stage,'bhs-scoped-plan');assert.deepEqual(input.briefScope,scope);
     assert.match(input.instruction,/Müşterinin işini yönetecek partner ihtiyacını başka ajansların listesine çevirme/);
     assert.match(input.instruction,/Üst sektörün veya komşu ürün grubunun büyüklüğünü bu alt pazarın büyüklüğü yerine isteme/);
     assert.match(input.instruction,/ürün, fiyat, rakip alternatifleri, satış kanalı, müşteri deneyimi veya dijital satış yolu/);
     assert.match(input.instruction,/zorunlu başlıklar veya görev kotası değildir/);
     assert.match(input.instruction,/bütçeye sığan çağrı varsa araştırmayı sürdür/);
     assert.equal(options.maxOutputTokens,3800);
     const data=plannedData(rows);assertSchema(data,contract);return {data:options.normalizeData(data)};
    }}});
  assert.equal(calls,1);assert.deepEqual(result.needs.map(row=>row.id),rows.map(row=>row.id));
 }
});

test('explicit provider comparison remains eligible, including a different sector and target market',async()=>{
 const request='Compare French CRM integration providers for our SaaS product.';
 const otherBrief={...brief,brandName:'Cloud Desk',website:'https://cloud.example/',needs:request,goals:'Grow French B2B SaaS sales.'};
 const otherScope={...scope,market:'France',audience:'B2B SaaS buyers',objective:otherBrief.goals,
  decisions:[{id:'providers',decision:'Compare CRM integration providers',field:'needs',quote:request}]};
 const comparison=need({id:'providers',decisionId:'providers',target:'CRM integration providers',market:'France',country:'FR',language:'fr',
  section:'partners',sectionTitle:'CRM integration providers',metric:'CRM integration provider capabilities',
  expected:'Integration services for B2B SaaS teams',query:'France prestataires intégration CRM SaaS B2B services'});
 let calls=0;
 const result=await planScopedResearch({brief:otherBrief,identity:{understanding:'CRM SaaS software for businesses.'},
  briefUnderstanding:{understanding:request,scope:otherScope},asOf:packet.asOf,packet:{...packet,sources:[]},
  providers:{managedBudgetVersion:24,modelHandoff:true,async manager(stage,input,contract,options){
   calls++;assert.equal(stage,'bhs-scoped-plan');assert.equal(input.briefScope.market,'France');
   const data=plannedData([comparison]);assertSchema(data,contract);return {data:options.normalizeData(data)};
  }}});
 assert.equal(calls,1);assert.deepEqual(result.needs.map(row=>row.id),['providers']);
});

test('the existing controller can add an important missing decision question without a separate planning pass',async()=>{
 const first=need({id:'first'}),followup=need({id:'buy',metric:'Resmî mağazadaki ürün satın alma yönlendirmesi'});
 let models=0;const searches=[];
 const result=await reviewScopedResearch({brief,identity,briefUnderstanding:interpretation,packet,
  plan:{needs:[first],briefScope:scope,tradeEvidence:[],scopedResearch:true,orderedResearch:true,reportOnlyAfterResearch:true,
   targetedEvidence:true,taskReporting:true,questionEvidence:true,focusedProductComparison:true,procurementResearch:true},
  rounds:[{receipts:[{id:first.id,query:first.query,defaultAttempt:true,attempts:[{tool:'tavily'}],facts:[],urls:[]}]}],readPages:unexpected,
  providers:{managedBudgetVersion:24,modelHandoff:true,
   researchCapacity:async()=>({remainingKurus:900,capKurus:3000,quotes:{tavily:62,gemini:1044},
    defaults:['tavily'],configuredDefaults:['tavily','gemini'],actors:[],minimumDefaultKurus:62}),
   async manager(stage,input,contract,options){
    models++;assert.equal(stage,'bhs-scoped-review');
    assert.match(input.instruction,/Eksik önemli karar sorusunu newNeeds ile ekle/);
    assert.match(input.instruction,/Ürün sınıfı, alıcı, pazar, dönem ve ölçüm kapsamını koru/);
    const data={approve:false,newNeeds:plannedData([followup]).needs,decisions:[],peers:[],
     commands:[{id:followup.id,tool:'tavily',query:followup.query,url:'',mode:'default',limit:1}]};
    assertSchema(data,contract);return {data:options.normalizeData(data)};
   },search:async(query,options)=>{searches.push([query,options.maxResults]);return {results:[]};},searchGemini:unexpected}});
 assert.equal(models,1);assert.deepEqual(result.newNeeds.map(row=>row.id),['buy']);
 assert.deepEqual(searches,[[followup.query,1]]);assert.equal(result.approved,false);
});
