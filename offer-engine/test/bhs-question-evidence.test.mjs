import assert from 'node:assert/strict';
import test from 'node:test';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {BudgetError} from '../src/budget/ledger.mjs';
import {reviewScopedResearch,scopedEvidence} from '../src/bhs/scoped-research.mjs';
import {runSequentialStage} from '../src/bhs/sequential-research.mjs';
import {assertSchema} from '../src/bhs/schema.mjs';
import {questionEvidenceDecision} from '../src/bhs/question-evidence.mjs';

const brief=snapshotBrief({brandName:'Example Brand',website:'https://brand.example/',segment:'corporate',
 goals:'Evaluate a UK nursery equipment sales pilot.',needs:'Identify the equipment purchasing decision maker.',services:'B2B',meetingNotes:''});
const packet={asOf:'2026-11-19',entities:[{id:'brand',role:'brand',website:brief.website}],sources:[]};
const identity={understanding:'The brand supplies sensory play equipment.'};
const understanding={understanding:brief.goals};
const need={id:'buyer',section:'buying',target:'UK independent nurseries',market:'United Kingdom',
 metric:'Equipment purchasing decision maker',expected:'Who decides to buy sensory play equipment for a nursery.',
 query:'UK independent nurseries sensory play equipment purchasing decision maker',quantity:1,
 country:'GB',language:'en',period:'current',since:'',first:'tavily'};
const plan={needs:[need],orderedResearch:true,reportOnlyAfterResearch:true,targetedEvidence:true,
 readEvidenceOnly:true,taskReporting:true,questionEvidence:true};
const fact=(id,quote)=>({id,quote,url:'https://buyers.example/'+id,title:'Independent nursery purchasing',item:id,method:'html'});
const acquisition=fact('acquisition','In the United Kingdom, independent nurseries appoint advisers responsible for purchasing a nursery business.');
const equipment=fact('equipment','In the United Kingdom, independent nurseries give their managers responsibility for purchasing sensory play equipment.');
const fit=(status,reason)=>({status,reason});
const direct=fit('direct','The passage identifies who buys the requested equipment.');
const unrelated=fit('unrelated','This is acquisition of a nursery business, not a nursery buying equipment.');
const clone=data=>JSON.parse(JSON.stringify(data));
const receipt=(facts,query=need.query)=>({id:need.id,query,defaultAttempt:true,attempts:[{tool:'tavily'}],urls:facts.map(f=>f.url),facts});
const answer=decisions=>({approve:true,newNeeds:[],decisions,commands:[],peers:[]});
const decision=(proofs,answerFit,sufficient=true)=>({id:need.id,proofs,sufficient,...(answerFit?{answerFit}:{})});
const capacity=async()=>({remainingKurus:2000,capKurus:3000,defaults:['tavily','gemini'],configuredDefaults:['tavily','gemini'],actors:[],configuredActors:[]});
async function review({facts=[acquisition],assessment=unrelated,worker=false,prior=[],savedPlan=plan,savedNeed=need,extraDecision={}}={}){
 const calls=[];
 const providers={managedBudgetVersion:24,researchCapacity:capacity,
  manager:async(stage,input,contract)=>{
   calls.push(stage);
   assert.match(input.instruction,/öznesini, eylemini ve nesnesini/);
   if(worker)throw new BudgetError('provider_unavailable','Mock controller outage');
   const data=answer([{...decision(facts.map(f=>f.id),assessment),...extraDecision}]);
   // Missing assessment intentionally simulates a malformed saved/mock result.
   if(assessment)assertSchema(data,contract);
   return {data};
  },worker:async(stage,input,contract)=>{
   calls.push(stage);assert.equal(stage,'bhs-scoped-evidence-check');
   assert.equal(input.tasks[0].query,savedNeed.query);
   assert.equal(input.tasks[0].expected,savedNeed.expected);
   assert.match(input.instruction,/işletmenin şirket olarak satın alınması/);
   const data={decisions:[{...decision(facts.map(f=>f.id),assessment),read:'',nextQuery:'',...extraDecision}]};
   assertSchema(data,contract);return {data};
  },search:()=>assert.fail('No paid search in a final evidence check'),searchGemini:()=>assert.fail('No paid search'),
  availableActors:async()=>[]};
 const rounds=[...prior,{receipts:[receipt(facts,savedNeed.query)]}];
 const result=await reviewScopedResearch({brief,identity,briefUnderstanding:understanding,packet,
  plan:savedPlan,rounds,providers,last:true,readPages:()=>assert.fail('Do not open unrelated sources')});
 const evidence=scopedEvidence({packet},savedPlan,clone([...rounds,result]));
 return {result,evidence,calls,rounds};
}

test('the controller rejects nursery-business acquisition as equipment procurement without discarding its receipt',async()=>{
 const {result,evidence}=await review();
 assert.equal(result.approved,false);
 assert.equal(result.decisions[0].sufficient,false);
 assert.deepEqual(result.decisions[0].proofs,[]);
 assert.deepEqual(result.decisions[0].answerFit,unrelated);
 assert.equal(evidence.coverage[0].status,'open');
 assert.equal(evidence.accepted.length,0);
 assert.equal(evidence.receipts[0].facts[0].quote,acquisition.quote);
 assert.ok(evidence.packet.sources.some(source=>source.url===acquisition.url));
});

test('the existing fallback worker performs the same semantic check with the full original query',async()=>{
 const {result,evidence,calls}=await review({worker:true});
 assert.deepEqual(calls,['bhs-scoped-clearance','bhs-scoped-evidence-check']);
 assert.notEqual(result.approved,true, 'An unrelated result must not approve a partial worker recovery');
 assert.equal(evidence.coverage[0].status,'open');
 assert.deepEqual(result.decisions[0].proofs,[]);
});

test('correct equipment evidence closes the original question in either existing model path',async()=>{
 for(const worker of [false,true]){
  const {result,evidence}=await review({facts:[equipment],assessment:direct,worker});
  assert.equal(result.approved,true);
  assert.equal(evidence.coverage[0].status,'confirmed');
  assert.deepEqual(evidence.accepted.map(row=>row.id),[equipment.id]);
 }
});

test('related partial evidence remains useful without becoming a complete answer',async()=>{
 const partial=fact('partial','Independent nurseries in the United Kingdom buy sensory play equipment through supplier catalogues.');
 const {result,evidence}=await review({facts:[partial],assessment:fit('partial','The channel is identified, but the person making the decision is not.')});
 assert.equal(result.decisions[0].sufficient,false);
 assert.equal(evidence.coverage[0].status,'open');
 assert.equal(evidence.coverage[0].researchStatus,'partially_verified');
 assert.deepEqual(evidence.accepted.map(row=>row.id),[partial.id]);
});

test('semantic assessment follows the question rather than a nursery or acquisition blacklist',async()=>{
 const acquisitionNeed={...need,metric:'Nursery business acquisition advisers',expected:'Who advises the purchase of a nursery business.',
  query:'UK independent nursery business acquisition purchasing adviser'};
 const {evidence}=await review({savedNeed:acquisitionNeed,savedPlan:{...plan,needs:[acquisitionNeed]},
  assessment:fit('direct','The requested transaction is acquisition of a nursery business.')});
 assert.equal(evidence.coverage[0].status,'confirmed');
 assert.equal(evidence.accepted[0].quote,acquisition.quote);
});

test('a source-backed negative answer can be relevant and sufficient',async()=>{
 const negative=fact('negative','In the United Kingdom, independent nurseries do not require a central purchasing office to buy sensory play equipment.');
 const {evidence}=await review({facts:[negative],assessment:fit('direct','The source directly answers whether a central purchasing office is required.')});
 assert.equal(evidence.coverage[0].status,'confirmed');
});

test('an absent, unknown or empty assessment cannot silently confirm a question or schedule a source read',()=>{
 for(const assessment of [undefined,{},fit('wrong','A reason'),fit('direct',' '),fit('direct','x'.repeat(181))]){
  const row=questionEvidenceDecision({...decision(['source'],assessment),read:'https://buyers.example/page'},assessment);
  assert.equal(row.sufficient,false);assert.deepEqual(row.proofs,[]);
  assert.equal(row.answerFit.status,'unreviewed');assert.ok(!row.read);
 }
 const row=questionEvidenceDecision({...decision(['source'],unrelated),read:'https://buyers.example/unrelated'},unrelated);
 assert.ok(!row.read);
});

test('persisted semantic decisions survive reload and raw unassessed decisions cannot enter a new guarded report',async()=>{
 const {result,rounds}=await review();
 const restored=scopedEvidence({packet},plan,clone([...rounds,result]));
 assert.equal(restored.coverage[0].status,'open');
 const unassessed=scopedEvidence({packet},plan,[{receipts:[receipt([equipment])],decisions:[decision([equipment.id])]}]);
 assert.equal(unassessed.coverage[0].status,'open');assert.equal(unassessed.accepted.length,0);
 // Existing saved runs retain their original protocol and do not lose evidence.
 const legacy=scopedEvidence({packet},{...plan,questionEvidence:false},[{receipts:[receipt([equipment])],decisions:[decision([equipment.id])]}]);
 assert.equal(legacy.coverage[0].status,'confirmed');
});

test('an incremental unrelated slice cannot replace an earlier confirmed answer',async()=>{
 const prior=[{receipts:[receipt([equipment])],decisions:[decision([equipment.id],direct)],reviewedProofIds:[equipment.id]}];
 const {result,evidence}=await review({worker:true,prior});
 assert.equal(result.approved,true);
 assert.deepEqual(result.decisions[0].proofs,[equipment.id]);
 assert.deepEqual(evidence.accepted.map(row=>row.id),[equipment.id]);
 assert.ok(evidence.packet.sources.some(source=>source.url===acquisition.url));
});

test('semantic rejection also overrides a mechanically valid buyer-process statement about a different transaction',async()=>{
 const buyerNeed={...need,buyerSegment:'Independent nurseries',buyerSourceSegment:'independent nurseries',buyingDimension:'decisionMaker'};
 const process={proof:acquisition.id,segment:'independent nurseries',market:'United Kingdom',
  value:'advisers responsible for purchasing a nursery business',passage:acquisition.quote};
 const {evidence}=await review({savedNeed:buyerNeed,savedPlan:{...plan,needs:[buyerNeed],procurementResearch:true},extraDecision:{buyerProcess:process}});
 assert.equal(evidence.coverage[0].status,'open');assert.equal(evidence.accepted.length,0);
 assert.ok(!evidence.buyerProcurement[0].process);
});

test('new general BHS plans persist semantic review and disambiguate queries without adding a model call',async()=>{
 const scope={market:'United Kingdom',audience:'Independent nurseries',objective:'Equipment sales pilot',fulfilment:'local',
  decisions:[{id:'pilot',decision:'Who buys the equipment?',field:'goals',quote:brief.goals}]};
 const group={section:need.section,sectionTitle:'Buyer research',target:need.target,market:need.market,country:need.country,language:need.language};
 const measurement={...need,decisionId:'pilot',tradeResearch:false,tradeEvidenceId:'',comparisonProduct:'',comparisonRole:'none',
  buyerSegment:'',buyerSourceSegment:'',buyingDimension:'none'};
 for(const key of Object.keys(group))delete measurement[key];
 let calls=0;
 const providers={collectionFirst:true,managedAudit:true,managedBudgetVersion:24,withCeiling(){return this;},
  manager:async(stage,input,contract,options)=>{
   calls++;assert.equal(stage,'bhs-scoped-plan');
   assert.match(input.instruction,/şirketin devralınmasını/);
   const data={needs:[{...group,measurements:[measurement]}]};assertSchema(data,contract);
   return {data:options.normalizeData(data)};
  }};
 const previous=async stage=>stage==='brand'?{decision:'accepted',collectionFirst:true,packet,plan:{},brandUnderstanding:identity,briefUnderstanding:{...understanding,scope}}:undefined;
 const saved=await runSequentialStage({phase:'sector_sources',brief,providers,previous,collect:()=>assert.fail('Planning is not a paid search')});
 assert.equal(saved.managedPlan.questionEvidence,true);
 assert.equal(saved.managedPlan.decisionTurns,true);
 assert.equal(saved.managedPlan.classifyReportFindings,true);
 assert.equal(saved.managedPlan.needs[0].query,need.query);assert.equal(calls,1);
});
