import assert from 'node:assert/strict';
import test from 'node:test';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {runSequentialStage} from '../src/bhs/sequential-research.mjs';
import {planScopedResearch,understandScopedBrief} from '../src/bhs/scoped-research.mjs';
import {assertSchema} from '../src/bhs/schema.mjs';

const brief=snapshotBrief({brandName:'Muffik',website:'https://muffik.example/',segment:'corporate',
 goals:'Grow Royal set sales to nurseries in the UK.',needs:'Pilot a UK nursery sales channel.',services:'Royal set landing page and nursery outreach.',
 meetingNotes:'Selected UK nursery pilot only. Earlier Turkey option was not selected.'});
const identity={understanding:'Royal sets for sensory play. Shipment origin is unverified.',sourceStatus:'no_readable_sources'};
const packet={asOf:'2026-11-18',sources:[]};
const scope={market:'Birleşik Krallık',audience:'Kreşler',objective:'Royal set ile kreş satış pilotu',fulfilment:'local',
 decisions:[{id:'nurseries',decision:'UK kreşlerinde Royal set satış pilotu yapılabilir mi?',field:'goals',quote:brief.goals}]};
const briefUnderstanding={understanding:'Muffik, Royal set ile UK kreş kanalını pilot olarak çalışacak.',scope};
const group={section:'commercial',sectionTitle:'Satış pilotu',target:'Royal set ve UK kreşleri',market:'Birleşik Krallık',country:'GB',language:'en'};
const sale={id:'safety',metric:'UK’de yerel oyuncak güvenliği ve satış şartları',period:'',expected:'Birleşik Krallık resmi ürün güvenliği belgesi',
 quantity:2,query:'UK Toys Safety Regulations requirements selling sensory toys UK importer',first:'tavily',since:'',
 comparisonProduct:'',comparisonRole:'none',buyerSegment:'',buyerSourceSegment:'',buyingDimension:'none',
 decisionId:'nurseries',tradeResearch:false,tradeEvidenceId:''};
const importTax={...sale,id:'import-tax',metric:'Türkiye çıkışlı ürünlerin UK vergi oranı',
 query:'UK import duty VAT toys HS 9503 import from Turkey customs declaration gov.uk'};
const planResponse=(contract,options,group,measurements)=>{
 const data={needs:[{...group,measurements}]};
 assertSchema(data,contract);
 return {data:options.normalizeData(data)};
};

test('brief evidence anchors the saved first UK plan and rejects unsupported imports and unlinked work',async()=>{
 const stages=new Map([['brand_correction_draft',{decision:'accepted',collectionFirst:true,brandUnderstanding:identity,packet}]]),calls=[];
 const providers={collectionFirst:true,managedAudit:true,managedBudgetVersion:23,withCeiling(){return this;},
  async manager(stage,input,contract,options){
   calls.push(stage);
   if(stage==='bhs-scoped-brief'){
    assert.equal(input.card.goals,brief.goals);
    assert.equal(input.identity.sourceStatus,'no_readable_sources');
    assert.match(input.instruction,/önceki veya elenen seçenekleri/);
    const data={...briefUnderstanding,scope:{...scope,decisions:[...scope.decisions,
     {id:'invented',decision:'Türkiye ihracatı',field:'meetingNotes',quote:'Türkiye’den ithalat kabul edildi.'}]}};
    assertSchema(data,contract);
    return {data};
   }
   assert.equal(stage,'bhs-scoped-plan');
   assert.deepEqual(input.briefScope,scope);
   assert.deepEqual(input.tradeEvidence,[]);
   assert.match(input.instruction,/Hedef pazar veya üretim yerinden sevkiyat rotası çıkarma/);
   const analytics={...sale,id:'tracking',metric:'Kreş pilotunda talep ve teklif ölçümü',query:'Export nursery lead analytics data from GA4 to a spreadsheet'};
   return planResponse(contract,options,group,[importTax,{...sale,id:'no-link',decisionId:'invented'},sale,analytics]);
  }};
 for(const phase of ['brand','sector_sources'])stages.set(phase,await runSequentialStage({phase,brief,providers,
  previous:async name=>stages.get(name),collect:()=>assert.fail('Planning must not run a provider search')}));
 const plan=stages.get('sector_sources').managedPlan;
 assert.deepEqual(calls,['bhs-scoped-brief','bhs-scoped-plan']);
 assert.deepEqual(plan.briefScope,scope);
 assert.deepEqual(plan.needs.map(need=>[need.id,need.decisionId]),[['safety','nurseries'],['tracking','nurseries']]);
});

test('a plan containing only unsupported trade takes the existing compact retry without saving that task',async()=>{
 const calls=[];
 const providers={managedBudgetVersion:23,async manager(stage,input,contract,options){
  calls.push(stage);
  assert.deepEqual(input.tradeEvidence,[]);
  return planResponse(contract,options,group,[stage.endsWith('compact')?sale:{...importTax,tradeResearch:true,tradeEvidenceId:'brief:nurseries'}]);
 }};
 const plan=await planScopedResearch({brief,identity,briefUnderstanding,asOf:packet.asOf,packet,providers});
 assert.deepEqual(calls,['bhs-scoped-plan','bhs-scoped-plan-compact']);
 assert.deepEqual(plan.needs.map(need=>need.id),['safety']);
});

test('an explicitly requested Turkey to France sample shipment keeps customs research eligible through its own decision',async()=>{
 const goals='Türkiye’den Fransa’ya numune sevkiyatı ile dağıtıcı pilotu kurulacak.';
 const crossBrief={...brief,goals};
 const crossScope={...scope,market:'Fransa',audience:'Distribütörler',objective:'Fransa’ya numune pilotu',fulfilment:'cross_border',
  decisions:[{id:'samples',decision:'Fransa numune teslimatı ve gümrük hazırlığı',field:'goals',quote:goals},...scope.decisions]};
 crossScope.decisions[1]={...crossScope.decisions[1],field:'services',quote:brief.services};
 const providers={managedBudgetVersion:23,async manager(stage,input,contract,options){
  assert.equal(stage,'bhs-scoped-plan');
  assert.deepEqual(input.tradeEvidence,[{id:'brief:samples',decisionId:'samples',quote:goals}]);
  const customs={...importTax,query:'France import VAT for toy samples from Turkey',decisionId:'samples',tradeResearch:true,tradeEvidenceId:'brief:samples'};
  return planResponse(contract,options,{...group,target:'Fransa’ya numune sevkiyatı',market:'Fransa',country:'FR'},
   [customs,{...customs,id:'borrowed-decision',decisionId:'nurseries'}]);
 }};
 const interpreted={...briefUnderstanding,scope:crossScope};
 const plan=await planScopedResearch({brief:crossBrief,identity,briefUnderstanding:interpreted,asOf:packet.asOf,packet,providers});
 assert.deepEqual(plan.needs.map(need=>need.id),['import-tax']);
 assert.equal(plan.tradeEvidence.length,1);
});

test('a read brand shipment route can support research, unlike metadata or generic customs text',async()=>{
 const departure='Muffik dispatches Royal sets from its warehouse in Turkey to nurseries in the United Kingdom.';
 const publisher=(id,text,properties={})=>({id,method:'html',title:'Muffik',url:brief.website+id,excerpts:[{text}],...properties});
 const evidence={...packet,sources:[publisher('generic','For customs duties, check local official rules.'),publisher('meta',departure,{metadataOnly:true}),
  publisher('declined','Muffik does not ship Royal sets from Turkey to the United Kingdom.'),
  publisher('planned','Muffik might dispatch Royal sets from Germany to the United Kingdom.'),
  publisher('foreign',departure,{url:'https://other.example/terms',title:'Other brand'}),publisher('shipping',departure)]};
 const providers={managedBudgetVersion:23,async manager(stage,input,contract,options){
  assert.equal(stage,'bhs-scoped-plan');
  assert.deepEqual(input.tradeEvidence,[{id:'source:shipping:0',url:brief.website+'shipping',quote:departure}]);
  return planResponse(contract,options,group,[{...importTax,tradeResearch:true,tradeEvidenceId:'source:shipping:0'}]);
 }};
 const interpreted={...briefUnderstanding,scope:{...scope,fulfilment:'unspecified'}};
 const plan=await planScopedResearch({brief,identity,briefUnderstanding:interpreted,asOf:packet.asOf,packet:evidence,providers});
 assert.deepEqual(plan.needs.map(need=>need.id),['import-tax']);
});

test('brief understanding reports missing scope if the only declared decision has no matching brief passage',async()=>{
 const providers={managedBudgetVersion:23,manager:async()=>({data:{...briefUnderstanding,scope:{...scope,
  decisions:[{...scope.decisions[0],field:'services'}]}}})};
 const result=await understandScopedBrief({brief,identity,providers});
 assert.deepEqual(result,{issue:'brief_scope_unavailable'});
});
