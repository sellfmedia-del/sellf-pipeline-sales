import assert from 'node:assert/strict';
import test from 'node:test';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {BudgetError} from '../src/budget/ledger.mjs';
import {coherentComparisonRole,unreadableComparisonSources,comparisonCanStart,qualifyProductPeers} from '../src/bhs/product-comparison.mjs';
import {planScopedResearch,reviewScopedResearch,scopedEvidence} from '../src/bhs/scoped-research.mjs';
import {assertSchema} from '../src/bhs/schema.mjs';

const brief=snapshotBrief({brandName:'Example Brand',website:'https://brand.example/',segment:'corporate',
 goals:'Evaluate a UK nursery sales pilot.',needs:'Compare the Royal mat set with alternatives.',services:'B2B',meetingNotes:''});
const identity={understanding:'The brand sells modular play equipment.'},briefUnderstanding={understanding:brief.goals};
const packet={asOf:'2026-11-19',entities:[{id:'brand',role:'brand',website:brief.website}],sources:[]};
const base={section:'product',sectionTitle:'Product verification',target:'Royal set',market:'United Kingdom',country:'GB',language:'en',
 metric:'Product class and use',period:'current',expected:'A named product on a directly read product page.',quantity:2,
 query:'Example Brand Royal mat set product',first:'tavily',since:'',comparisonProduct:'Royal set',comparisonRole:'reference'};
const reference={...base,id:'reference'};
const rivals={...base,id:'rivals',section:'competition',sectionTitle:'Comparable nursery products',target:'Competing tactile mat sets',
 metric:'Comparable products for UK nursery buyers',expected:'A comparable product, UK market and nursery supply channel.',
 query:'UK nursery tactile interlocking mat sets suppliers',comparisonRole:'rivals'};
const source=(id,url,quote,method='html')=>({id,url,quote,method,title:id,item:id});
const own=source('royal','https://brand.example/products/royal-set','Royal set is a tactile mat set for nursery movement. GBP 240.');
const a='https://first.example/products/texture',b='https://second.example/products/tactile';
const second=source('second',b,'Texture Kit is a tactile mat kit for United Kingdom nursery buyers. GBP 180.');
const plan={needs:[reference,rivals],orderedResearch:true,reportOnlyAfterResearch:true,focusedProductComparison:true,
 qualityReport:true,targetedEvidence:true,readEvidenceOnly:true,taskReporting:true,questionEvidence:true};
const fit={status:'direct',reason:'The read source answers the requested product comparison.'};
const selected=(id,proofs)=>({id,sufficient:true,proofs,answerFit:fit});
const receipt=(need,facts,urls=facts.map(f=>f.url))=>({id:need.id,query:need.query,facts,urls,defaultAttempt:true,attempts:[{tool:'tavily'}]});
const read=url=>({id:rivals.id,tool:'read',query:'',url,mode:'default',limit:1});
const answer=extra=>({approve:false,newNeeds:[],decisions:[],commands:[],peers:[],...extra});
const capacity=async()=>({remainingKurus:1900,capKurus:3000,defaults:['tavily','gemini'],configuredDefaults:['tavily','gemini'],actors:[],configuredActors:[]});
const initial=()=>[{receipts:[receipt(reference,[own]),receipt(rivals,[
 source('hint-a',a,'Texture mat product for nursery buyers.','search-snippet'),
 source('hint-b',b,'Texture Kit tactile mat product for nursery buyers.','search-snippet')],[a,b])],
 decisions:[selected(reference.id,[own.id])],reviewedProofIds:['royal','hint-a','hint-b']}];

test('an explicitly product-focused competition task cannot retain a contradictory none role',()=>{
 assert.equal(coherentComparisonRole({...rivals,comparisonRole:'none'}),'rivals');
 assert.equal(coherentComparisonRole({...rivals,comparisonRole:' none '}),'rivals');
 assert.equal(coherentComparisonRole({...rivals,section:'custom',sectionTitle:'Rakip ürün kıyası',comparisonRole:'none'}),'rivals');
 assert.equal(coherentComparisonRole({...rivals,section:'custom',sectionTitle:'Rival products',comparisonRole:'none'}),'rivals');
 assert.equal(coherentComparisonRole(reference),'reference');
 assert.equal(coherentComparisonRole({...rivals,comparisonProduct:'',comparisonRole:'none'}),'none');
 assert.equal(coherentComparisonRole({...rivals,section:'digital',sectionTitle:'Brand account',comparisonRole:'none'}),'none');
 assert.equal(coherentComparisonRole({...rivals,comparisonRole:'none',buyerSegment:'Independent nurseries',
  buyerSourceSegment:'independent nurseries',buyingDimension:'decisionMaker'}),'none');
 for(const malformed of [{comparisonProduct:42},{buyerSegment:42},{comparisonRole:42}])
  assert.doesNotThrow(()=>coherentComparisonRole({...rivals,...malformed}));
});

test('initial normalization preserves Claude order, criteria and query without a repair model call',async()=>{
 let calls=0;
 const proposed=[{...rivals,comparisonRole:'none'},reference],snapshot=structuredClone(proposed);
 const result=await planScopedResearch({brief,identity,briefUnderstanding,packet,asOf:packet.asOf,providers:{managedBudgetVersion:22,
  manager:async(stage,input,_contract,options)=>{
   calls++;assert.equal(stage,'bhs-scoped-plan');
   assert.match(input.instruction,/comparisonRole rivals olmalı/);
   assert.equal(options.maxOutputTokens,3800);
   return {data:options.normalizeData({needs:proposed})};
  }}});
 assert.equal(calls,1);assert.deepEqual(proposed,snapshot);
 assert.deepEqual(result.needs.map(n=>n.id),[rivals.id,reference.id]);
 for(const key of ['id','query','target','market','country','language','quantity','expected'])assert.equal(result.needs[0][key],rivals[key]);
 assert.equal(result.needs[0].comparisonRole,'rivals');
 assert.equal(comparisonCanStart(result.needs[0],result.needs,[],new Map(),brief.website,packet),false);
 assert.equal(comparisonCanStart(result.needs[0],result.needs,[{...own,needId:reference.id}],
  new Map([[reference.id,selected(reference.id,[own.id])]]),brief.website,packet),true);
});

test('a corrected role still waits for the exact official reference rather than widening the comparison',async()=>{
 const misplaced={...rivals,comparisonRole:coherentComparisonRole({...rivals,comparisonRole:'none'})};
 const calls=[];
 const result=await reviewScopedResearch({brief,identity,briefUnderstanding,packet,plan:{...plan,needs:[misplaced,reference]},rounds:[],
  providers:{managedBudgetVersion:24,researchCapacity:async()=>({...await capacity(),quotes:{tavily:62,gemini:1044}}),
   search:async query=>{calls.push(query);return {results:[]};}},
  readPages:()=>assert.fail('No guessed reference URL')});
 assert.deepEqual(calls,[reference.query]);assert.equal(result.openingSearch,true);
});

test('follow-up normalization applies the same role correction without a separate planner call',async()=>{
 let calls=0;const searches=[];
 const rounds=[{receipts:[receipt(reference,[own])],decisions:[selected(reference.id,[own.id])],reviewedProofIds:[own.id]}];
 const result=await reviewScopedResearch({brief,identity,briefUnderstanding,packet,plan:{...plan,needs:[reference]},rounds,
  providers:{managedBudgetVersion:24,researchCapacity:capacity,manager:async(_stage,_input,_contract,options)=>{
    calls++;const data=options.normalizeData(answer({newNeeds:[{...rivals,comparisonRole:'none'}]}));
    assertSchema(data,options.responseSchema);return {data};
   },search:async query=>{searches.push(query);return {results:[]};}},
  readPages:()=>assert.fail('A follow-up task must not guess a product page')});
 assert.equal(calls,1);assert.equal(result.newNeeds[0].comparisonRole,'rivals');
 assert.equal(result.newNeeds[0].query,rivals.query);assert.deepEqual(searches,[rivals.query]);
});

test('source-read failures are deduplicated, scoped and cleared by later readable evidence',()=>{
 const unrelated={...rivals,id:'unrelated',comparisonProduct:'',comparisonRole:'none'};
 const history=[
  {id:rivals.id,sourceReads:[{url:a,readable:false},{url:a,readable:false},{url:'invalid',readable:false}]},
  {id:reference.id,sourceReads:[{url:own.url,readable:false}]},
  {id:unrelated.id,sourceReads:[{url:'https://unrelated.example/a',readable:false}]},
  {id:'unknown',sourceReads:[{url:'https://unknown.example/a',readable:false}]}
 ];
 const snapshot=structuredClone(history);
 assert.deepEqual(unreadableComparisonSources([...plan.needs,unrelated],history),[
  {id:rivals.id,urls:[a]},{id:reference.id,urls:[own.url]}
 ]);
 assert.deepEqual(history,snapshot);
 assert.deepEqual(unreadableComparisonSources(plan.needs,[...history,
  {id:rivals.id,sourceReads:[{url:a,readable:true}]},{id:reference.id,facts:[own]}]),[]);
});

test('after one candidate is unreadable Claude selects the next observed product on the same question with no new search',async()=>{
 const rounds=initial(),readCalls=[],modelCalls=[];
 const providers={managedBudgetVersion:24,researchCapacity:capacity,
  manager:async(stage,input,contract,options)=>{
   modelCalls.push(stage);assert.equal(options.maxOutputTokens,stage==='bhs-scoped-clearance'?1150:1700);
   assert.equal(input.needs.find(n=>n.id===rivals.id).query,rivals.query);
   assert.equal(input.needs.find(n=>n.id===rivals.id).market,rivals.market);
   assert.equal(input.needs.find(n=>n.id===rivals.id).expected,rivals.expected);
   assert.match(input.instruction,/diğer gözlemlenmiş aday ürün sayfalarını/);
   assert.match(input.instruction,/fiyat bandı ve satış kanalı ölçütlerini koru/);
   assert.ok(input.knownUrls.includes(b));
   if(!readCalls.length){const data=answer({commands:[read(a)]});assertSchema(data,contract);return {data};}
   assert.deepEqual(input.sourceReadFailures,[{id:rivals.id,urls:[a]}]);
   if(readCalls.length===1){const data=answer({commands:[read(b)]});assertSchema(data,contract);return {data};}
   const candidate=input.findings.find(f=>f.needId===rivals.id&&f.url===b&&f.method==='html');
   assert.ok(candidate);
   const peer={name:'Comparable Brand',url:b,product:'Texture Kit',market:rivals.market,channel:'UK nursery supply',priceBand:'GBP 180',
    relationship:'direct',productMatch:{referenceProof:own.id,candidateProof:candidate.id,referenceClass:'tactile mat set',candidateClass:'tactile mat kit',
     referenceFields:[],candidateFields:[{field:'price',value:'GBP 180',proof:candidate.id}]}};
   const data=answer({approve:true,decisions:[selected(rivals.id,[candidate.id])],peers:[peer]});
   assertSchema(data,contract);return {data};
  },worker:async(stage,input,contract)=>{
   assert.equal(stage,'bhs-scoped-evidence-check');
   const task=input.tasks[0],proof=task.sources.find(f=>f.url===b&&f.method==='html');assert.ok(proof);
   const data={decisions:[{...selected(rivals.id,[proof.id]),read:'',nextQuery:''}]};assertSchema(data,contract);return {data};
  },search:()=>assert.fail('Observed candidate pages do not require another paid search'),searchGemini:()=>assert.fail('No extra search')};
 const readPages=async urls=>{
  readCalls.push(...urls);
  return urls[0]===a?{sources:[],unavailable:[{url:a,reason:'HTTP_403'}]}:
   {sources:[{url:b,title:'Texture Kit',method:'html',excerpts:[{text:second.quote}]}]};
 };
 const execute=last=>reviewScopedResearch({brief,identity,briefUnderstanding,packet,plan,rounds,providers,readPages,last});
 const first=await execute(false);rounds.push(first);
 assert.deepEqual(first.receipts[0].sourceReads,[{url:a,readable:false}]);
 assert.equal(scopedEvidence({packet},plan,rounds).coverage.find(row=>row.id===rivals.id).status,'open');
 const next=await execute(false);rounds.push(next);
 assert.deepEqual(readCalls,[a,b]);assert.deepEqual(next.receipts[0].sourceReads,[{url:b,readable:true}]);
 assert.equal(next.commandResults.find(c=>c.tool==='read').id,rivals.id);
 const final=await execute(true);rounds.push(final);
 assert.equal(final.approved,true);
 const evidence=scopedEvidence({packet},plan,JSON.parse(JSON.stringify(rounds)));
 assert.equal(evidence.coverage.find(row=>row.id===rivals.id).status,'confirmed');
 assert.deepEqual(evidence.packet.entities.filter(e=>e.role==='competitor').map(e=>e.website),[b]);
 assert.equal(evidence.productComparisons[0].candidate.fields.price.value,'GBP 180');
 assert.equal(evidence.productComparisons[0].reference.fields.price,undefined,'An unrequested field must not be invented');
 assert.deepEqual(modelCalls,['bhs-scoped-review','bhs-scoped-review','bhs-scoped-clearance']);
});

test('a failed page never authorizes an unobserved fallback URL',async()=>{
 let reads=0;
 const unobserved='https://invented.example/products/unknown';
 const rounds=[...initial(),{receipts:[{id:rivals.id,urls:[a],facts:[],sourceReads:[{url:a,readable:false}]}]}];
 const result=await reviewScopedResearch({brief,identity,briefUnderstanding,packet,plan,rounds,
  providers:{managedBudgetVersion:24,researchCapacity:capacity,manager:async()=>({data:answer({commands:[read(unobserved)]})}),
   search:async()=>({results:[]}),searchGemini:async()=>({results:[]})},readPages:()=>{reads++;return {sources:[]};}});
 assert.equal(reads,0);assert.notEqual(result.approved,true);
 assert.equal(result.commandResults.find(c=>c.url===unobserved).status,'unknown_url');
});

test('continuation does not promote a catalogue or adjacent category into a direct product comparison',()=>{
 const adjacent=source('adjacent','https://room.example/products/lights','Light Room is sensory room equipment for nursery buyers.');
 const checked=new Map([[reference.id,selected(reference.id,[own.id])],[rivals.id,selected(rivals.id,[adjacent.id])]]);
 const peer={name:'Rooms',url:adjacent.url,product:'Light Room',market:rivals.market,channel:'Nurseries',priceBand:'',relationship:'direct',
  productMatch:{referenceProof:own.id,candidateProof:adjacent.id,referenceClass:'tactile mat set',candidateClass:'sensory room equipment',referenceFields:[],candidateFields:[]}};
 const result=qualifyProductPeers([peer],plan.needs,[{...own,needId:reference.id},{...adjacent,needId:rivals.id}],checked,brief.website,packet);
 assert.equal(result[0].relationship,'related');assert.ok(!result[0].verifiedProductMatch);
});

test('an exhausted budget cannot turn candidate continuation into an automatic paid retry',async()=>{
 const rounds=[...initial(),{receipts:[{id:rivals.id,urls:[a],facts:[],sourceReads:[{url:a,readable:false}]}]}];
 const result=await reviewScopedResearch({brief,identity,briefUnderstanding,packet,plan,rounds,
  providers:{managedBudgetVersion:24,researchCapacity:async()=>({remainingKurus:0,capKurus:3000,workerBudgetExhausted:true,
    defaults:[],configuredDefaults:['tavily','gemini'],actors:[],configuredActors:[]}),
   manager:async()=>{throw new BudgetError('budget_limit','Mock exhausted manager budget');},
   worker:async()=>{throw new BudgetError('model_budget','Mock exhausted worker budget');},
   search:()=>assert.fail('No paid retry'),searchGemini:()=>assert.fail('No paid retry')},readPages:()=>assert.fail('No automatic page read')});
 assert.equal(result.closed,true);assert.equal(result.stopReason,'research_budget_exhausted');
});
