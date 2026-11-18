import assert from 'node:assert/strict';
import test from 'node:test';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {runSequentialStage} from '../src/bhs/sequential-research.mjs';
import {planScopedResearch,reviewScopedResearch,scopedEvidence,understandScopedBrief} from '../src/bhs/scoped-research.mjs';
import {assertSchema} from '../src/bhs/schema.mjs';
import {BudgetError} from '../src/budget/ledger.mjs';
import {resolveManagedGaps} from '../src/bhs/managed-gaps.mjs';

const brief=snapshotBrief({brandName:'Muffik',website:'https://muffik.example/',segment:'corporate',
 goals:'Grow Royal set sales to nurseries in the UK.',needs:'Pilot a UK nursery sales channel.',services:'Royal set landing page and nursery outreach.',
 meetingNotes:'Selected UK nursery pilot only. Earlier Turkey option was not selected.'});
const identity={understanding:'Royal sets for sensory play. Shipment origin is unverified.',sourceStatus:'no_readable_sources'};
const packet={asOf:'2026-11-18',entities:[{id:'brand',role:'brand',website:brief.website}],sources:[]};
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
  const customs={...importTax,metric:'Türkiye çıkışlı numunelerin Fransa ithalat vergisi',
   expected:'Fransız gümrük idaresinin numune vergi usulü',query:'France import VAT for toy samples from Turkey',
   decisionId:'samples',tradeResearch:true,tradeEvidenceId:'brief:samples'};
  return planResponse(contract,options,{...group,target:'Fransa’ya numune sevkiyatı',market:'Fransa',country:'FR'},
   [customs,{...customs,id:'borrowed-decision',decisionId:'nurseries'},
    {...customs,id:'changed-origin',query:'France import VAT for toy samples from Germany'}]);
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

const initial={...group,...sale};
const originalQuery=initial.query;
const newNeed={...sale,id:'buyer',metric:'UK kreşlerinin Royal set satın alma süreci',query:'UK nursery Royal set sensory toys procurement policy'};
const followupPlan={needs:[initial],briefScope:scope,tradeEvidence:[],taskReporting:true,focusedProductComparison:true,procurementResearch:true,
 orderedResearch:true,reportOnlyAfterResearch:true,targetedEvidence:true,readEvidenceOnly:true};
const receipt={id:initial.id,query:originalQuery,defaultAttempt:true,attempts:[{tool:'gemini'}],facts:[],urls:[]};
const reviewed=overrides=>({approve:false,decisions:[],peers:[],newNeeds:[],commands:[],...overrides});
const command=(query,tool='tavily',url='',id=initial.id)=>({id,tool,query,url,mode:'default',limit:1});
const availableTools={capKurus:3000,remainingKurus:800,minimumDefaultKurus:60,defaults:['tavily'],configuredDefaults:['tavily'],
 quotes:{tavily:60,gemini:1000},actors:['apify/instagram-scraper']};
const scopedReview=(providers,options={})=>reviewScopedResearch({identity,briefUnderstanding,brief,packet,plan:followupPlan,providers,
 rounds:[{receipts:[receipt]}],readPages:()=>assert.fail('Unexpected page read'),...options});

test('the review keeps a linked new task and blocks wrong-market, unlinked and unsupported trade work',async()=>{
 const searches=[];
 const result=await scopedReview({managedBudgetVersion:23,researchCapacity:async()=>availableTools,
  async manager(stage,input,contract,options){
   assert.equal(stage,'bhs-scoped-review');
   assert.deepEqual(input.briefScope,scope);
   assert.match(input.instruction,/ayırt edici ürün, alıcı veya metrik/);
   const foreign={...group,market:'Belgium',country:'BE',measurements:[{...newNeed,id:'foreign',query:'Belgium nursery Royal set procurement'}]};
   const response=reviewed({newNeeds:[{...group,measurements:[newNeed,importTax,{...newNeed,id:'unlinked',decisionId:'other'}]},foreign],
    commands:[command(newNeed.query,'tavily','',newNeed.id)]});
   assertSchema(response,contract);
   return {data:options.normalizeData(response)};
  },search:async query=>{searches.push(query);return {results:[]};}});
 assert.deepEqual(searches,[newNeed.query]);
 assert.deepEqual(result.newNeeds.map(need=>need.id),['buyer']);
 assert.equal(result.commandResults[0].status,'executed');
});

test('a valid task id cannot send unrelated, foreign or unapproved trade queries to any tool',async()=>{
 for(const [query,tool] of [[importTax.query,'tavily'],['Germany sensory toys safety requirements','gemini'],
  ['UK music festivals and concert fan pages','apify/instagram-scraper']]){
  const searches=[];
  const providers={managedBudgetVersion:23,researchCapacity:async()=>availableTools,
   manager:async()=>({data:reviewed({commands:[command(query,tool)]})}),
   search:async value=>{searches.push(value);return {results:[]};},searchGemini:()=>assert.fail('Foreign query'),enrich:()=>assert.fail('Unrelated scraper query')};
  const result=await scopedReview(providers);
  assert.deepEqual(searches,[originalQuery]);
  assert.equal(result.commandResults[0].status,'brief_scope_mismatch');
  assert.equal(result.closed,false);
 }
 const query='UK sensory toys safety documentation nursery regulations',sent=[];
 const result=await scopedReview({managedBudgetVersion:23,researchCapacity:async()=>availableTools,
  manager:async()=>({data:reviewed({commands:[command(query)]})}),search:async value=>{sent.push(value);return {results:[]};}});
 assert.deepEqual(sent,[query]);
 assert.equal(result.commandResults[0].status,'executed');
});

test('compact recovery discards a saved out-of-scope follow-up and falls back to the original valid query',async()=>{
 const searches=[],refinement='Germany sensory toys safety requirements';
 const found={id:'f1',url:'https://publisher.example/toys',title:'Toy guidance',quote:'The UK nursery product safety requirements apply to sensory toys.',
  item:'local safety',method:'html'};
 const saved={...receipt,facts:[found],urls:[found.url]};
 const providers={managedBudgetVersion:23,researchCapacity:async()=>availableTools,
  manager:async()=>{throw new BudgetError('budget_limit','Mock controller budget');},
  worker:async(_stage,input)=>{
   assert.match(input.instruction,/aynı pazar/);
   return {data:{decisions:[{id:initial.id,sufficient:false,proofs:[],nextQuery:refinement,read:''}]}};
  },search:async query=>{searches.push(query);return {results:[]};}};
 const result=await scopedReview(providers,{rounds:[{receipts:[saved],decisions:[{id:initial.id,proofs:[],sufficient:false,nextQuery:refinement}]}]});
 assert.deepEqual(searches,[originalQuery]);
 assert.equal(result.decisions[0].nextQuery,'');
});

test('a refinement stays within its own market when several markets are in the brief',async()=>{
 const multiMarketPlan={...followupPlan,briefScope:{...scope,market:'Birleşik Krallık ve Fransa'}};
 const searches=[];
 const result=await scopedReview({managedBudgetVersion:23,researchCapacity:async()=>availableTools,
  manager:async()=>({data:reviewed({commands:[command('French sensory toys safety documentation nursery regulations')]})}),
  search:async value=>{searches.push(value);return {results:[]};}}, {plan:multiMarketPlan});
 assert.deepEqual(searches,[originalQuery]);
 assert.equal(result.commandResults[0].status,'brief_scope_mismatch');
});

test('a source observed for a different decision cannot be opened using the existing task id',async()=>{
 const otherDecision={id:'tracking',decision:'Kreş pilotu erişim ve takip araçlarını incele',field:'services',quote:brief.services};
 const activity={...initial,id:'tracking',decisionId:otherDecision.id};
 const plan={...followupPlan,needs:[initial,activity],briefScope:{...scope,decisions:[...scope.decisions,otherDecision]}};
 const unrelated='https://publisher.example/outreach',related='https://publisher.example/toy-safety';
 const rounds=[{receipts:[{...receipt,urls:[related]},{...receipt,id:activity.id,urls:[unrelated]}]}];
 let read=0;
 const providers={managedBudgetVersion:23,researchCapacity:async()=>({...availableTools,defaults:[],configuredDefaults:[],actors:[]}),
  manager:async()=>({data:reviewed({commands:[command('','read',unrelated)]})})};
 const blocked=await scopedReview(providers,{plan,rounds,readPages:()=>{read++;return {sources:[]};}});
 assert.equal(blocked.commandResults[0].status,'brief_scope_mismatch');
 assert.equal(read,0);
 providers.manager=async()=>({data:reviewed({commands:[command('','read',related)]})});
 const allowed=await scopedReview(providers,{plan,rounds,readPages:urls=>{assert.deepEqual(urls,[related]);read++;return {sources:[]};}});
 assert.equal(allowed.commandResults[0].status,'executed');
 assert.equal(read,1);
});

test('out-of-scope tasks and receipts cannot surface as report metrics or authorize paid completion',async()=>{
 const archived={...group,...importTax,section:'customs'};
 const rounds=[{newNeeds:[archived],receipts:[{...receipt,id:archived.id,query:archived.query},{...receipt,query:archived.query},receipt]}];
 const evidence=scopedEvidence({packet},followupPlan,rounds);
 assert.deepEqual(evidence.coverage.map(metric=>metric.section),[group.section]);
 assert.deepEqual(evidence.receipts,[receipt]);
 const args={brief,synthesis:{report:{},supervision:{reviewMode:'managed-audit',metricCoverage:evidence.coverage,
  researchPlan:{...followupPlan,separateGapCosts:true,directedResearch:true}}},secret:'test-only',
  baseLedger:{status:async()=>({id:'079a9729-bdc4-4c3f-ba8a-b4f2f7522910',chargedKurus:2900}),get:async()=>null,
   once:()=>assert.fail('Rejected sections cannot authorize paid work')},getGapLedger:()=>assert.fail('No paid account')};
 assert.equal(await resolveManagedGaps({...args,action:'complete_gaps',sections:['customs','swot']}),null);
 const available=await resolveManagedGaps({...args,action:'status',sections:['customs',group.section,'swot']});
 assert.equal(available.available,true);
 assert.equal(available.sections.length,1);
});

test('paid completion dispatches only linked open work in its approved section',async()=>{
 const invalidTrade={...group,...importTax};
 const newPrices={...group,...newNeed};
 const searches=[];
 const providers={managedBudgetVersion:23,
  manager:async()=>({data:reviewed({newNeeds:[invalidTrade,newPrices,{...newPrices,id:'other',section:'other'}]})}),
  search:async query=>{searches.push(query);return {results:[]};}};
 const result=await scopedReview(providers,{gap:true,eligibleSections:[group.section]});
 assert.deepEqual(searches,[newPrices.query]);
 assert.deepEqual(result.newNeeds.map(need=>need.id),[newPrices.id]);
});

test('rejected follow-ups cannot keep research open after all approved tasks are confirmed',async()=>{
 const proof={id:'f1',url:'https://publisher.example/safety',title:'Toy safety',quote:'The UK sets toy safety requirements for products sold to UK nurseries.',
  item:'toy safety',method:'html'};
 const providers={managedBudgetVersion:23,researchCapacity:async()=>availableTools,
  manager:async()=>({data:reviewed({newNeeds:[{...group,...importTax}],commands:[command(importTax.query)]})}),
  search:()=>assert.fail('Completed research cannot pay for a rejected task')};
 const result=await scopedReview(providers,{rounds:[{receipts:[{...receipt,facts:[proof],urls:[proof.url]}],
  decisions:[{id:initial.id,sufficient:true,proofs:[proof.id]}],reviewedProofIds:[proof.id]}]});
 assert.equal(result.approved,true);
 assert.equal(result.stopReason,'evidence_confirmed');
 assert.deepEqual(result.openNeeds,[]);
});
