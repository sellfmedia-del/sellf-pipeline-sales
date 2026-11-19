import assert from 'node:assert/strict';
import test from 'node:test';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {BudgetError} from '../src/budget/ledger.mjs';
import {reviewScopedResearch} from '../src/bhs/scoped-research.mjs';
import {researchCommandKey,queuedResearchCommands,decideQueuedCommands} from '../src/bhs/research-command-queue.mjs';
import {assertSchema} from '../src/bhs/schema.mjs';

const brief=snapshotBrief({brandName:'Example Brand',website:'https://brand.example/',segment:'corporate',
 goals:'UK nursery pilot',needs:'Start with Royal set',services:'B2B',meetingNotes:''});
const identity={understanding:'The brand makes modular activity mats.'};
const briefUnderstanding={understanding:brief.goals};
const about='https://brand.example/about',product='https://brand.example/products/royal';
const need={id:'royal',section:'product',target:'Royal set',market:'United Kingdom',metric:'Royal product class',
 expected:'The actual product class and use',query:'Example Brand Royal product United Kingdom',quantity:1,
 country:'GB',language:'en',period:'last month',since:'2026-10-19',first:'tavily'};
const packet={asOf:'2026-11-19',entities:[{id:'brand',role:'brand',website:brief.website}],sources:[]};
const plan={needs:[need],orderedResearch:true,reportOnlyAfterResearch:true,targetedEvidence:true,readEvidenceOnly:true};
const exact={id:need.id,tool:'tavily',query:'site:brand.example "Royal set"',url:'',mode:'default',limit:2};
const read={id:need.id,tool:'read',query:'',url:about,mode:'default',limit:1};
const fresh=data=>JSON.parse(JSON.stringify(data));
const answer=extra=>({approve:false,newNeeds:[],decisions:[],commands:[],peers:[],...extra});
const snippet={id:'snippet',url:about,title:'About the brand',quote:'The company offers modular products to nurseries.',method:'search-snippet',item:'Brand'};
const initial=()=>[{receipts:[{id:need.id,query:need.query,defaultAttempt:true,attempts:[{tool:'tavily'}],
 urls:[about,product],facts:[snippet]}],reviewedProofIds:[snippet.id]}];
const deferred=(c=exact,status='not_dispatched')=>({...c,key:researchCommandKey(c),status});
function fixture(overrides={}){
 const calls=[];
 const providers={managedBudgetVersion:24,researchCapacity:async()=>({remainingKurus:1800,capKurus:3000,
  defaults:['tavily','gemini'],configuredDefaults:['tavily','gemini'],actors:[],configuredActors:[]}),
  manager:async()=>({data:answer()}),worker:async()=>({data:{decisions:[]}}),
  search:async(query,options)=>{calls.push({query,options});return {results:[]};},
  searchGemini:async()=>({results:[]}),...overrides};
 const run=(rounds,extra={})=>reviewScopedResearch({brief,identity,briefUnderstanding,packet,plan,rounds,providers,
  readPages:async urls=>({sources:urls.map(url=>({url,title:'Read publisher',method:'html',
   excerpts:[{text:'The publisher describes its company and current activity products.'}]}))}),...extra});
 return {calls,providers,run};
}

test('a deferred exact search survives a publisher read, JSON reload and a failed controller without another planning call',async()=>{
 let reviews=0;
 const f=fixture({manager:async()=>{reviews++;return {data:answer({decisions:[{id:need.id,sufficient:true,proofs:[snippet.id]}],commands:[exact]})};}});
 const rounds=initial(),first=await f.run(rounds);
 assert.deepEqual(first.commandResults.map(row=>[row.tool,row.status]),[['read','executed'],['tavily','not_dispatched']]);
 assert.equal(first.commandResults[1].reason,'ordered_turn');
 rounds.push(first);
 f.providers.manager=async()=>{reviews++;throw new BudgetError('provider_unavailable','mock outage');};
 const second=await f.run(fresh(rounds));
 assert.deepEqual(f.calls,[{query:exact.query,options:{depth:'basic',maxResults:2,countryCode:'GB',language:'en',since:need.since}}]);
 assert.equal(second.commandResults.find(row=>row.key===researchCommandKey(exact)).status,'executed');
 assert.deepEqual(queuedResearchCommands([...first.commandResults,...second.commandResults]),[]);
 assert.equal(second.issue,'provider_unavailable');
 rounds.push(second,{issue:'budget_limit',commandResults:[deferred({...exact,query:exact.query+' contents'})]});
 const third=await f.run(fresh(rounds));
 assert.equal(f.calls.at(-1).query,exact.query+' contents');
 assert.equal(reviews,2,'a known controller outage must replay its saved instruction without purchasing another plan');
 assert.equal(third.commandResults.find(row=>row.query===exact.query+' contents').status,'executed');
});

test('the controller sees pending command keys and an empty next choice replays the original parameters',async()=>{
 const rounds=[...initial(),{commandResults:[deferred()]}];
 const f=fixture({manager:async(_stage,input,contract)=>{
  assert.deepEqual(input.pendingCommands.map(row=>[row.key,row.query,row.limit]),[[researchCommandKey(exact),exact.query,2]]);
  assert.ok(!input.commandHistory.some(row=>row.query===exact.query));
  assert.match(input.instruction,/seçmediğin emir kuyrukta korunur/);
  const data=answer();assertSchema(data,contract);return {data};
 }});
 const result=await f.run(fresh(rounds));
 assert.deepEqual(f.calls.map(row=>row.query),[exact.query]);
 assert.equal(result.commandResults[0].status,'executed');
});

test('Claude can replace a queued instruction with a scoped command for the same question and retain its reason',async()=>{
 const replacement={...exact,query:'site:brand.example Royal mat set pieces',limit:3};
 const f=fixture({manager:async(_stage,_input,contract)=>{
  const data=answer({commands:[replacement],commandDecisions:[{key:researchCommandKey(exact),action:'replace',reason:'The product wording was refined after the company read.'}]});
  assertSchema(data,contract);return {data};
 }});
 const result=await f.run([...initial(),{commandResults:[deferred()]}]);
 assert.deepEqual(f.calls.map(row=>row.query),[replacement.query]);
 const event=result.commandResults.find(row=>row.status==='replaced');
 assert.equal(event.key,researchCommandKey(exact));assert.equal(event.replacementKey,researchCommandKey(replacement));
 assert.match(event.reason,/wording was refined/);
 assert.deepEqual(queuedResearchCommands([deferred(),...result.commandResults]),[]);
});

test('cancelling a stale read also prevents the automatic source-read hint from restoring it',async()=>{
 const alternate={...exact,query:'UK Royal activity mat product specification',limit:1};
 const saved=[...initial(),{decisions:[{id:need.id,sufficient:false,proofs:[],read:about}],commandResults:[deferred(read)]}];
 const f=fixture({manager:async()=>({data:answer({commands:[alternate],commandDecisions:[
  {key:researchCommandKey(read),action:'cancel',reason:'The company page cannot establish this product.'}]})})});
 const result=await f.run(saved,{readPages:()=>assert.fail('the cancelled read must not be restored by an automatic hint')});
 assert.deepEqual(f.calls.map(row=>row.query),[alternate.query]);
 assert.equal(result.commandResults.find(row=>row.key===researchCommandKey(read)).status,'cancelled');
 assert.deepEqual(queuedResearchCommands([deferred(read),...result.commandResults]),[]);
});

test('missing reasons, unknown keys and replacement commands for another question cannot erase queued work',()=>{
 const pending=[deferred()];
 for(const decisions of [
  [{key:pending[0].key,action:'cancel',reason:' '}],
  [{key:'unknown',action:'cancel',reason:'Not the queued key.'}],
  [{key:pending[0].key,action:'replace',reason:'A different question is not a replacement.'}]
 ]){
  const result=decideQueuedCommands(pending,decisions,[{...exact,id:'another',query:'Other question'}],()=>true);
  assert.deepEqual(result.pending,pending);assert.deepEqual(result.events,[]);
 }
});

test('a denied budget admission remains queued instead of becoming an executed command',async()=>{
 let attempts=0;
 const f=fixture({manager:async()=>({data:answer({commands:[exact]})}),search:async()=>{
  attempts++;if(attempts===1)throw new BudgetError('budget_limit','mock admission refusal');return {results:[]};
 }});
 const first=await f.run(initial());
 assert.deepEqual(first.commandKeys,[]);
 assert.equal(first.commandResults[0].status,'budget_limit');
 assert.equal(queuedResearchCommands(first.commandResults).length,1);
 f.providers.manager=async()=>({data:answer()});
 const second=await f.run([...initial(),fresh(first)]);
 assert.equal(attempts,2);
 assert.equal(second.commandResults.find(row=>row.key===researchCommandKey(exact)).status,'executed');
});

test('an uncertain paid attempt is never automatically replayed as an unstarted command',async()=>{
 let attempts=0;
 const f=fixture({manager:async()=>({data:answer({commands:[exact]})}),search:async()=>{
  attempts++;throw new BudgetError('budget_uncertain','mock connection lost after dispatch');
 }});
 const result=await f.run(initial());
 assert.deepEqual(result.commandKeys,[researchCommandKey(exact)]);
 assert.deepEqual(queuedResearchCommands(result.commandResults),[]);
 assert.equal(attempts,1);
});

test('fulfilled needs and commands with an existing paid receipt settle without purchasing the deferred call',async()=>{
 for(const kind of ['confirmed','already-dispatched']){
  const proof={...snippet,id:'read-proof',method:'html'};
  const receipt={id:need.id,query:kind==='confirmed'?need.query:exact.query,defaultAttempt:true,
   attempts:[{tool:'tavily'}],facts:[proof],urls:[about]};
  const rounds=[{receipts:[receipt],decisions:kind==='confirmed'?[{id:need.id,sufficient:true,proofs:[proof.id]}]:[],
   commandResults:[deferred()]}];
  const f=fixture({researchCapacity:async()=>({remainingKurus:0,defaults:[],configuredDefaults:['tavily'],actors:[],workerBudgetExhausted:true}),
   manager:async()=>({data:answer({approve:kind==='confirmed'})}),search:()=>assert.fail('recorded work cannot be purchased again')});
  const result=await f.run(fresh(rounds));
  assert.equal(result.commandResults.find(row=>row.key===researchCommandKey(exact)).status,kind==='confirmed'?'need_unavailable':'duplicate');
  assert.deepEqual(queuedResearchCommands([...rounds[0].commandResults,...result.commandResults]),[]);
 }
});

test('a saved command is rechecked against the current brief and cannot replay a foreign-market query',async()=>{
 const scopedNeed={...need,decisionId:'d1',tradeResearch:false,tradeEvidenceId:''};
 const scoped={...plan,needs:[scopedNeed],briefScope:{market:'United Kingdom',audience:'UK nurseries',objective:brief.goals,
  fulfilment:'unspecified',decisions:[{id:'d1',decision:'UK nursery pilot',field:'goals',quote:brief.goals}]},tradeEvidence:[]};
 const foreign={...exact,query:'France nursery distributors Royal set'};
 const f=fixture({researchCapacity:async()=>({remainingKurus:0,defaults:[],configuredDefaults:[],actors:[],workerBudgetExhausted:true}),
  manager:async()=>{throw new BudgetError('provider_unavailable','mock outage');},search:()=>assert.fail('foreign-market instruction must not run')});
 const result=await f.run([...initial(),{commandResults:[deferred(foreign)]}],{plan:scoped});
 assert.equal(result.commandResults.find(row=>row.key===researchCommandKey(foreign)).status,'brief_scope_mismatch');
 assert.deepEqual(queuedResearchCommands(result.commandResults),[]);
});

test('an exhausted worker budget preserves the instruction and its reason without making a free unmetered read',async()=>{
 const f=fixture({researchCapacity:async()=>({remainingKurus:0,defaults:[],configuredDefaults:['tavily'],actors:[],workerBudgetExhausted:true}),
  manager:async()=>({data:answer()}),search:()=>assert.fail('no research budget')});
 const result=await f.run([...initial(),{commandResults:[deferred(read)]}],
  {readPages:()=>assert.fail('a queued read still requires funded worker time')});
 assert.equal(result.stopReason,'research_budget_exhausted');
 const saved=result.commandResults.find(row=>row.key===researchCommandKey(read));
 assert.equal(saved.status,'budget_limit');assert.equal(saved.reason,'budget_limit');
 assert.equal(queuedResearchCommands(result.commandResults).length,1);
});

test('a deferred rival instruction waits for the brand product proof and then keeps its original query',async()=>{
 const reference={...need,id:'reference',comparisonRole:'reference',comparisonProduct:'Royal set'};
 const rivals={...need,section:'competition',comparisonRole:'rivals',comparisonProduct:'Royal set'};
 const scopedPlan={...plan,needs:[reference,rivals],focusedProductComparison:true};
 const pending={...exact,query:'UK nursery tactile activity mat kit alternatives'};
 const rounds=[...initial(),{receipts:[{id:reference.id,query:reference.query,defaultAttempt:true,attempts:[{tool:'tavily'}],facts:[],urls:[]}],
  commandResults:[deferred(pending)]}];
 const f=fixture();
 const blocked=await f.run(rounds,{plan:scopedPlan});
 assert.equal(blocked.commandResults.find(row=>row.key===researchCommandKey(pending)).status,'waiting_reference');
 assert.deepEqual(f.calls,[]);
 const proof={...snippet,id:'product-proof',url:product,title:'Royal set',method:'html',quote:'Royal set is an orthopedic mat set for nursery activity.'};
 rounds.push(blocked,{receipts:[{id:reference.id,query:reference.query,facts:[proof],urls:[product]}],
  decisions:[{id:reference.id,sufficient:true,proofs:[proof.id]}]});
 const released=await f.run(fresh(rounds),{plan:scopedPlan});
 assert.deepEqual(f.calls.map(row=>row.query),[pending.query]);
 assert.equal(released.commandResults.find(row=>row.key===researchCommandKey(pending)).status,'executed');
});

test('a cancelled query is not restored by generic fallback on the same turn or after reload',async()=>{
 const cancelled={...exact,query:need.query};
 const rounds=initial();rounds[0].receipts[0].attempts=[{tool:'gemini'}];
 rounds.push({commandResults:[deferred(cancelled)]});
 const f=fixture({manager:async()=>({data:answer({commandDecisions:[
  {key:researchCommandKey(cancelled),action:'cancel',reason:'This question needs a different source and query.'}]})}),
  search:()=>assert.fail('the cancelled query cannot be restored by fallback'),
  searchGemini:()=>assert.fail('changing the tool cannot restore the cancelled query')});
 const result=await f.run(rounds);
 assert.equal(result.commandResults.find(row=>row.key===researchCommandKey(cancelled)).status,'cancelled');
 f.providers.manager=async()=>({data:answer()});
 const next=await f.run(fresh([...rounds,result]));
 assert.deepEqual(queuedResearchCommands([...result.commandResults,...(next.commandResults||[])]),[]);
});

test('a saved scraper instruction remains queued through the required Gemini search and runs only afterwards',async()=>{
 const actor='apify/instagram-scraper',url='https://www.instagram.com/examplebrand/';
 const instruction={id:need.id,tool:actor,query:'',url,mode:'posts',limit:2};
 const rounds=initial();rounds[0].receipts[0].urls.push(url);
 const order=[];
 const f=fixture({researchCapacity:async()=>({remainingKurus:1800,capKurus:3000,
  defaults:['tavily','gemini'],configuredDefaults:['tavily','gemini'],actors:[actor],configuredActors:[actor]}),
  manager:async()=>({data:answer({commands:[instruction]})}),
  worker:async stage=>({data:stage==='bhs-scoped-extract'?{results:[]}:{decisions:[]}}),
  searchGemini:async requested=>{order.push('gemini');assert.equal(requested.id,need.id);return {results:[]};},
  enrich:async request=>{order.push('scraper');assert.equal(request.maxResults,2);assert.equal(request.url,url);
   return {status:'complete',runId:'synthetic',pages:[{url,text:'The account published an activity product demonstration.'}]};}
 });
 const first=await f.run(rounds);
 assert.deepEqual(order,['gemini']);
 assert.equal(first.commandResults[0].status,'default_searched_first');
 f.providers.manager=async()=>({data:answer()});
 const second=await f.run(fresh([...rounds,first]));
 assert.deepEqual(order,['gemini','scraper']);
 assert.equal(second.commandResults.find(row=>row.key===researchCommandKey(instruction)).status,'executed');
});
