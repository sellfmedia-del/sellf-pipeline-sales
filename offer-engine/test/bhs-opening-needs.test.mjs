import assert from 'node:assert/strict';
import test from 'node:test';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {reviewScopedResearch,scopedEvidence} from '../src/bhs/scoped-research.mjs';

const brief=snapshotBrief({brandName:'Example Brand',website:'https://brand.example/',segment:'corporate',
 goals:'Evaluate a targeted UK sales pilot.',needs:'Understand the buyers and the sales channel.',services:'B2B',meetingNotes:''});
const identity={understanding:'Example Brand supplies products to business buyers.'};
const briefUnderstanding={understanding:brief.goals};
const packet={asOf:'2026-11-19',entities:[{id:'brand',role:'brand',website:brief.website}],sources:[]};
const makeNeed=(id,metric,extra={})=>({id,section:'buyer',sectionTitle:'Buyer research',target:'UK nurseries',market:'United Kingdom',
 metric,expected:metric,period:'current',quantity:1,query:'UK nurseries '+metric,country:'GB',language:'en',first:'tavily',since:'',...extra});
const buyerNeeds=()=>[
 makeNeed('decision','equipment decision maker',{quantity:2}),
 makeNeed('channel','equipment sourcing channel',{quantity:4}),
 makeNeed('approval','group procurement approvals',{quantity:3})
];
const planFor=needs=>({needs,orderedResearch:true,reportOnlyAfterResearch:true,targetedEvidence:true,readEvidenceOnly:true});

function runner(needs,{remaining=()=>3000,failOnce=[]}={}){
 const calls=[],failures=new Set(failOnce);let reviews=0;
 const providers={managedBudgetVersion:24,infrastructureOffsetKurus:300,researchCapacity:async()=>{
  const quotes={tavily:62,gemini:1044},remainingKurus=remaining();
  return {remainingKurus,capKurus:3000,quotes,defaults:Object.keys(quotes).filter(t=>quotes[t]<=remainingKurus),
   configuredDefaults:Object.keys(quotes),actors:[],configuredActors:[]};
 },manager:async()=>{reviews++;return {data:{approve:false,newNeeds:[],decisions:[],commands:[],peers:[]}};},
 search:async(query,options)=>{
  calls.push({tool:'tavily',query,options});
  if(failures.delete(query))throw Object.assign(Error('mock timeout'),{name:'TimeoutError',code:'provider_timeout'});
  return {results:[]};
 },
 searchGemini:async(need,options)=>{calls.push({tool:'gemini',query:need.query,options});return {results:[]};},
 worker:async()=>({data:{decisions:[]}})};
 const plan=planFor(needs);
 return {calls,plan,get reviews(){return reviews;},run:rounds=>reviewScopedResearch({brief,identity,briefUnderstanding,
  packet,plan,rounds,providers,readPages:()=>assert.fail('these empty search fixtures cannot request a source read')})};
}

test('each buyer question sharing one heading gets its own exact opening search and sample',async()=>{
 const needs=buyerNeeds().map((need,i)=>({...need,buyerSegment:i===2?'Nursery chains':'Independent nurseries',
  buyerSourceSegment:i===2?'UK nursery chains':'UK independent nurseries',buyingDimension:['decisionMaker','channel','approval'][i]}));
 const r=runner(needs);r.plan.procurementResearch=true;
 const result=await r.run([]);
 assert.deepEqual(result.receipts.map(row=>row.id),needs.map(n=>n.id));
 assert.deepEqual(r.calls.map(row=>[row.query,row.options.maxResults,row.options.countryCode,row.options.language]),
  needs.map(n=>[n.query,n.quantity,n.country,n.language]));
 assert.equal(r.reviews,0);
});

test('social metrics sharing one heading retain Claude order, dates and independent receipt identities',async()=>{
 const social=(id,metric,quantity)=>makeNeed(id,metric,{section:'digital',sectionTitle:'Instagram',target:'Example Brand Instagram',
  period:'last month',since:'2026-10-19',quantity});
 const needs=[social('frequency','posting frequency',12),makeNeed('market','current market structure',{section:'market'}),
  social('engagement','post engagement',10),social('comments','product experience comments',4)];
 const r=runner(needs),first=await r.run([]),second=await r.run([first]);
 assert.deepEqual(first.receipts.map(row=>row.id),['frequency','market','engagement']);
 assert.deepEqual(second.receipts.map(row=>row.id),['comments']);
 assert.deepEqual(r.calls.map(row=>[row.query,row.options.maxResults,row.options.since]),
  needs.map(n=>[n.query,n.quantity,n.since]));
 assert.equal(r.reviews,0);
});

test('a successful opening receipt belongs to its need rather than all questions in that heading',async()=>{
 const needs=buyerNeeds(),r=runner(needs);
 const saved={openingSearch:true,receipts:[{id:needs[0].id,query:needs[0].query,defaultAttempt:true,
  facts:[],urls:[],attempts:[{tool:'tavily'}]}]};
 const result=await r.run([saved]);
 assert.deepEqual(result.receipts.map(row=>row.id),['channel','approval']);
 assert.deepEqual(r.calls.map(row=>row.query),needs.slice(1).map(n=>n.query));
 assert.equal(r.reviews,0);
});

test('same-heading needs keep their own Gemini or Tavily preference and routing record',async()=>{
 const needs=buyerNeeds();needs[0].first='gemini';
 const r=runner(needs),first=await r.run([]),second=await r.run([first]);
 assert.deepEqual(first.receipts.map(row=>[row.id,row.attempts[0].tool]),[['decision','gemini']]);
 assert.deepEqual(second.receipts.map(row=>[row.id,row.attempts[0].tool]),[['channel','tavily'],['approval','tavily']]);
 assert.deepEqual([...first.receipts,...second.receipts].map(row=>row.toolRouting),[undefined,undefined,undefined]);
 assert.deepEqual(r.calls.map(row=>row.tool),['gemini','tavily','tavily']);
 assert.equal(r.reviews,0);
});

test('one failed opening retries only that question without hiding or repeating successful siblings',async()=>{
 const needs=buyerNeeds(),r=runner(needs,{failOnce:[needs[0].query]});
 const first=await r.run([]),second=await r.run([first]);
 assert.deepEqual(first.receipts.map(row=>row.id),['decision','channel','approval']);
 assert.equal(first.receipts[0].attempts[0].issue,'provider_timeout');
 assert.deepEqual(second.receipts.map(row=>[row.id,row.attempts[0].tool]),[['decision','gemini']]);
 assert.deepEqual(second.receipts[0].toolRouting,{requestedTool:'tavily',selectedTool:'gemini',reason:'provider_timeout'});
 assert.deepEqual(r.calls.map(row=>[row.tool,row.query]),[
  ...needs.map(need=>['tavily',need.query]),['gemini',needs[0].query]
 ]);
 assert.equal(r.reviews,0);
});

test('a confirmed read is reused while unresolved sibling questions still get their opening searches',async()=>{
 const needs=buyerNeeds(),r=runner(needs);
 const source={id:'confirmed',url:'https://buyers.example/policy',title:'Buyer policy',method:'html',item:'policy',
  quote:'At these UK nurseries the owner approves equipment purchases.'};
 const saved={receipts:[{id:needs[0].id,query:needs[0].query,facts:[source],urls:[source.url]}],
  decisions:[{id:needs[0].id,sufficient:true,proofs:[source.id]}]};
 const result=await r.run([saved]);
 assert.deepEqual(result.receipts.map(row=>row.id),['channel','approval']);
 assert.ok(r.calls.every(row=>row.query!==needs[0].query));
 assert.equal(r.reviews,0);
});

test('a limited budget leaves unfunded same-heading needs visibly unsearched',async()=>{
 const needs=buyerNeeds(),r=runner(needs,{remaining:()=>100});
 const result=await r.run([]);
 assert.deepEqual(result.receipts.map(row=>row.id),['decision']);
 const evidence=scopedEvidence({packet},r.plan,[result]);
 assert.deepEqual(evidence.coverage.map(row=>[row.id,row.searched]),[['decision',true],['channel',false],['approval',false]]);
 assert.equal(r.calls.length,1);
});
