import assert from 'node:assert/strict';
import test from 'node:test';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {BudgetError} from '../src/budget/ledger.mjs';
import {reviewScopedResearch,scopedEvidence} from '../src/bhs/scoped-research.mjs';
import {queuedResearchCommands,researchCommandKey} from '../src/bhs/research-command-queue.mjs';
import {assertSchema} from '../src/bhs/schema.mjs';

const brief=snapshotBrief({brandName:'Pati Care',website:'https://pati.example/',segment:'kobi',
 goals:'Türkiye bakım spreyi satışlarını büyütmek.',needs:'Ürünü ve yerel fiyatı karşılaştırmak.',services:'Büyüme',meetingNotes:''});
const identity={understanding:'The brand sells pet care sprays.'},briefUnderstanding={understanding:brief.goals};
const packet={asOf:'2026-11-20',entities:[{id:'brand',role:'brand',website:brief.website}],sources:[]};
const product={id:'product',section:'product',target:'Pati Care spray',market:'Türkiye',country:'TR',language:'tr',
 metric:'Ürünün kimliği ve kullanım biçimi',expected:'Resmî ürün sayfasında ürünün tam adı ve kullanım biçimi',
 query:'Pati Care Türkiye bakım spreyi resmî ürün',quantity:1,first:'tavily',period:'güncel',since:''};
const market={...product,id:'market',section:'market',metric:'Bakım spreyi satış kanalı',
 expected:'Türkiye bakım spreyi satış kanalı',query:'Türkiye evcil hayvan bakım spreyi satış kanalı'};
const a='https://pati.example/products/spray',b='https://pati.example/products/100ml';
const title='Care spray',quote='Pati Care sells a grooming spray for cats and dogs. The exact bottle variant is described separately.';
const followup='Pati Care Türkiye bakım spreyi tam varyant 100 ml resmî ürün';
const fit={status:'partial',reason:'The page identifies the product family; the exact variant is still open.'};
const basePlan={needs:[product,market],orderedResearch:true,reportOnlyAfterResearch:true,targetedEvidence:true,
 readEvidenceOnly:true,questionEvidence:true,decisionTurns:true};
const answer=extra=>({approve:false,newNeeds:[],decisions:[],commands:[],peers:[],...extra});
const choice=(id,extra={})=>({id,sufficient:false,proofs:[],read:'',nextQuery:'',answerFit:fit,...extra});
const copy=data=>JSON.parse(JSON.stringify(data));
function fixture(overrides={}){
 const calls=[];
 const providers={managedBudgetVersion:24,
  researchCapacity:async()=>({remainingKurus:2200,capKurus:3000,quotes:{tavily:62,gemini:1044},
   defaults:['tavily','gemini'],configuredDefaults:['tavily','gemini'],actors:[],configuredActors:[],minimumDefaultKurus:62}),
  manager:async()=>({data:answer()}),
  worker:async(stage,input)=>{
   assert.equal(stage,'bhs-scoped-evidence-check');
   return {data:{decisions:input.tasks.map(task=>choice(task.id))}};
  },search:async(query,options)=>{
   calls.push({tool:'tavily',query,limit:options.maxResults});
   return {results:[{url:query===followup?b:a,title,content:quote}]};
  },searchGemini:()=>assert.fail('No unselected Gemini search'),...overrides};
 const run=(rounds,extra={})=>reviewScopedResearch({brief,identity,briefUnderstanding,packet,plan:basePlan,
  rounds,providers,readPages:async urls=>{
   calls.push({tool:'read',urls});
   return {sources:urls.map(url=>({url,title,method:'html',retrievedAt:'2026-11-20T00:00:00Z',excerpts:[{text:quote}]}))};
  },...extra});
 return {calls,providers,run};
}

test('one opening returns to Claude before another independent question; a read preserves its exact follow-up across reload and outage',async()=>{
 const f=fixture(),rounds=[];
 const opening=await f.run(rounds);rounds.push(opening);
 assert.equal(opening.openingSearch,true);assert.deepEqual(opening.receipts.map(r=>r.id),[product.id]);
 assert.deepEqual(f.calls,[{tool:'tavily',query:product.query,limit:1}]);
 f.providers.manager=async(stage,input,contract)=>{
  assert.equal(stage,'bhs-scoped-review');assert.deepEqual(input.waitingNeeds,[market.id]);
  assert.deepEqual(contract.properties.decisions.items.required.slice(-2),['read','nextQuery']);
  const snippet=input.findings.find(row=>row.needId===product.id&&row.method==='search-snippet');
  const data=answer({decisions:[choice(product.id,{read:snippet.id,nextQuery:followup})]});
  assertSchema(data,contract);return {data};
 };
 const read=await f.run(copy(rounds));rounds.push(read);
 assert.deepEqual(f.calls.map(c=>c.tool),['tavily','read']);
 assert.deepEqual(read.commandResults.map(c=>[c.tool,c.status]),[['read','executed'],['default','not_dispatched']]);
 const pending=queuedResearchCommands(read.commandResults);
 assert.deepEqual(pending.map(c=>[c.id,c.query,c.limit]),[[product.id,followup,product.quantity]]);
 assert.equal(scopedEvidence({packet},basePlan,rounds).coverage.find(row=>row.id===market.id).status,'open');
 f.providers.manager=async()=>{throw new BudgetError('provider_unavailable','Synthetic controller outage');};
 const recovered=await f.run(copy(rounds));rounds.push(recovered);
 assert.deepEqual(f.calls.map(c=>c.query||c.urls),[product.query,[a],followup]);
 assert.equal(recovered.commandResults.find(c=>c.key===pending[0].key).status,'executed');
 assert.equal(recovered.closed,false);assert.deepEqual(queuedResearchCommands(rounds.flatMap(r=>r.commandResults||[])),[]);
});

test('Claude can replace a saved decision follow-up through the same decision field without reviving the old query',async()=>{
 const f=fixture(),opening=await f.run([]),snippet=opening.receipts[0].facts[0];
 const old={id:product.id,tool:'default',query:followup,url:'',mode:'default',limit:1};
 const rounds=[opening,{commandResults:[{...old,key:researchCommandKey(old),status:'not_dispatched'}]}];
 const refined=followup+' etiket';
 f.providers.manager=async(_stage,_input,contract)=>{
  const data=answer({decisions:[choice(product.id,{proofs:[snippet.id],nextQuery:refined})],
   commandDecisions:[{key:researchCommandKey(old),action:'replace',reason:'The newly observed label identifies the exact variant.'}]});
  assertSchema(data,contract);return {data};
 };
 const next=await f.run(copy(rounds));
 // Citing a snippet schedules its direct read first, without losing the new query.
 assert.deepEqual(f.calls.map(c=>c.tool),['tavily','read']);
 assert.equal(next.commandResults.find(c=>c.key===researchCommandKey(old)).status,'replaced');
 const queued=queuedResearchCommands([...rounds.flatMap(r=>r.commandResults||[]),...next.commandResults]);
 assert.deepEqual(queued.map(c=>c.query),[refined]);
});

test('an uncertain paid outcome of a controller decision follow-up is recorded once and never purchased twice',async()=>{
 const f=fixture(),opening=await f.run([]);
 f.providers.manager=async()=>({data:answer({decisions:[choice(product.id,{nextQuery:followup})]})});
 let dispatched=0;
 f.providers.search=async query=>{dispatched++;assert.equal(query,followup);throw new BudgetError('budget_uncertain','Synthetic lost response');};
 const next=await f.run([opening]);
 assert.equal(dispatched,1);assert.equal(next.closed,false);
 assert.deepEqual(queuedResearchCommands(next.commandResults),[],'An uncertain paid dispatch is recorded as attempted, not as unstarted work');
 f.providers.manager=async()=>({data:answer()});
 f.providers.searchGemini=async()=>({results:[]});
 await f.run(copy([opening,next]));
 assert.equal(dispatched,1);
});

test('a read failure is visible to Claude and another observed page can be chosen without another search',async()=>{
 const f=fixture(),opening=await f.run([]);
 opening.receipts[0].urls.push(b);
 f.providers.manager=async(_stage,input)=>({data:answer({commands:[{id:product.id,tool:'read',query:'',url:a,mode:'default',limit:1}]})});
 const failed=await f.run([opening],{readPages:async()=>({sources:[]})});
 assert.deepEqual(failed.receipts[0].sourceReads,[{url:a,readable:false}]);
 f.providers.search=()=>assert.fail('An already observed alternative needs no new search');
 f.providers.manager=async(_stage,input)=>{
  assert.ok(input.previous.some(row=>row.sourceReads?.some(read=>read.url===a&&!read.readable)));
  return {data:answer({commands:[{id:product.id,tool:'read',query:'',url:b,mode:'default',limit:1}]})};
 };
 const next=await f.run(copy([opening,failed]));
 assert.deepEqual(next.receipts[0].sourceReads,[{url:b,readable:true}]);
 assert.equal(next.closed,false);
});

test('search discovery cannot become an accepted finding even if the controller attempts final approval',async()=>{
 const f=fixture(),opening=await f.run([]),snippet=opening.receipts[0].facts[0];
 f.providers.manager=async(_stage,_input,contract)=>{
  const data=answer({approve:true,decisions:[choice(product.id,{sufficient:true,proofs:[snippet.id],
   answerFit:{status:'direct',reason:'Synthetic attempt to approve a discovery excerpt.'}})]});
  assertSchema(data,contract);return {data};
 };
 const final=await f.run([opening],{last:true});
 assert.equal(final.approved,false);
 const evidence=scopedEvidence({packet},basePlan,[opening,final]);
 assert.deepEqual(evidence.accepted,[]);assert.ok(evidence.coverage.every(row=>row.status==='open'));
 assert.equal(f.calls.length,1,'A final review must not dispatch a read or another search');
});

test('a worker follow-up remains a suggestion and cannot replace the exact query selected by Claude',async()=>{
 const suggestion='Pati Care Türkiye bakım spreyi worker-only suggestion',chosen=followup+' Claude';
 const f=fixture({worker:async(_stage,input)=>({data:{decisions:input.tasks.map(task=>choice(task.id,{nextQuery:suggestion}))}})});
 const opening=await f.run([]);
 assert.equal(opening.decisions[0].nextQuery,suggestion);
 f.providers.manager=async(_stage,input)=>{
  assert.equal(input.checked[0].nextQuery,suggestion);
  return {data:answer({decisions:[choice(product.id,{nextQuery:chosen})]})};
 };
 await f.run([opening]);
 assert.deepEqual(f.calls.map(c=>c.query),[product.query,chosen]);
});

test('old saved plans retain their prior independent-opening behavior and decision schema',async()=>{
 const f=fixture(),{decisionTurns,...legacy}=basePlan;
 const opening=await f.run([],{plan:legacy});
 assert.deepEqual(opening.receipts.map(r=>r.id),[product.id,market.id]);
 assert.deepEqual(f.calls.map(c=>c.query),[product.query,market.query]);
 f.providers.manager=async(_stage,_input,contract)=>{
  assert.equal(contract.properties.decisions.items.properties.nextQuery,undefined);
  return {data:answer()};
 };
 f.providers.searchGemini=async()=>({results:[]});
 await f.run([opening],{plan:legacy});
});

test('Claude can introduce the dependent price question after reading the exact product, without another planning call',async()=>{
 const f=fixture(),plan={...basePlan,needs:[product]},rounds=[];
 rounds.push(await f.run([],{plan}));
 f.providers.manager=async(_stage,input)=>({data:answer({decisions:[choice(product.id,{read:input.findings[0].id})]})});
 rounds.push(await f.run(rounds,{plan}));
 const price={...product,id:'price',section:'price',metric:'Türkiye 100 ml birim fiyatı',
  expected:'Aynı 100 ml ürün için para birimi ve birim fiyatı',query:'Pati Care Türkiye bakım spreyi 100 ml fiyat'};
 f.providers.manager=async(stage,input,contract,options)=>{
  assert.equal(stage,'bhs-scoped-review');
  const read=input.findings.find(row=>row.method==='html');assert.ok(read);
  const {section,target,market,country,language,...measurement}=price;
  const response=answer({newNeeds:[{section,target,market,country,language,measurements:[measurement]}],
   decisions:[choice(product.id,{sufficient:true,proofs:[read.id],answerFit:{status:'direct',reason:'The exact product has now been read.'}})],
   commands:[{id:price.id,tool:'tavily',query:price.query,url:'',mode:'default',limit:price.quantity}]});
  assertSchema(response,contract);return {data:options.normalizeData(response)};
 };
 const next=await f.run(copy(rounds),{plan});rounds.push(next);
 assert.deepEqual(f.calls.map(c=>c.tool),['tavily','read','tavily']);
 assert.equal(f.calls.at(-1).query,price.query);assert.equal(next.newNeeds[0].id,price.id);
 const evidence=scopedEvidence({packet},plan,rounds);
 assert.equal(evidence.coverage.find(row=>row.id===product.id).status,'confirmed');
 assert.equal(evidence.coverage.find(row=>row.id===price.id).status,'open');
});

test('a budget refusal preserves a Claude follow-up for a funded retry without changing its scope or sample',async()=>{
 const f=fixture(),opening=await f.run([]);
 f.providers.manager=async()=>({data:answer({decisions:[choice(product.id,{nextQuery:followup})]})});
 let attempts=0;
 f.providers.search=async(query,options)=>{
  attempts++;assert.equal(query,followup);assert.equal(options.maxResults,product.quantity);
  if(attempts===1)throw new BudgetError('budget_limit','Synthetic pre-dispatch refusal');
  return {results:[]};
 };
 const denied=await f.run([opening]);
 assert.deepEqual(denied.commandKeys,[]);
 const queued=queuedResearchCommands(denied.commandResults);assert.equal(queued.length,1);
 assert.equal(queued[0].status,'budget_limit');
 f.providers.manager=async()=>({data:answer()});
 const next=await f.run(copy([opening,denied]));
 assert.equal(attempts,2);assert.equal(next.commandResults.find(c=>c.key===queued[0].key).status,'executed');
});

test('a read chosen in the decision can replace a queued read for the same question',async()=>{
 const f=fixture(),opening=await f.run([]);
 const other={...opening.receipts[0].facts[0],id:'other-page',url:b};
 opening.receipts[0].facts.push(other);opening.receipts[0].urls.push(b);
 const old={id:product.id,tool:'read',query:'',url:a,mode:'default',limit:1};
 const queued={...old,key:researchCommandKey(old),status:'not_dispatched'};
 f.providers.manager=async()=>({data:answer({decisions:[choice(product.id,{read:other.id})],
  commandDecisions:[{key:queued.key,action:'replace',reason:'The other observed page describes the exact variant.'}]})});
 const next=await f.run(copy([opening,{commandResults:[queued]}]));
 assert.deepEqual(f.calls.at(-1),{tool:'read',urls:[b]});
 assert.equal(next.commandResults.find(c=>c.key===queued.key).status,'replaced');
 assert.deepEqual(queuedResearchCommands([queued,...next.commandResults]),[]);
});

test('a worker read suggestion cannot override the next action explicitly chosen by Claude',async()=>{
 const f=fixture({worker:async(_stage,input)=>({data:{decisions:input.tasks.map(task=>
  choice(task.id,{read:task.sources[0].id}))}})});
 const opening=await f.run([]);assert.equal(opening.decisions[0].read,a);
 f.providers.manager=async()=>({data:answer({commands:[{id:product.id,tool:'tavily',query:followup,url:'',mode:'default',limit:1}]})});
 await f.run(copy([opening]));
 assert.deepEqual(f.calls.map(c=>c.tool),['tavily','tavily']);assert.equal(f.calls[1].query,followup);
});

test('a follow-up in a decision cannot bypass the approved brief market',async()=>{
 const f=fixture(),scope={market:'Türkiye',audience:'Pet owners',objective:brief.goals,fulfilment:'local',
  decisions:[{id:'growth',decision:'Compare pet care products in Türkiye',field:'goals',quote:brief.goals}]};
 const plan={...basePlan,briefScope:scope,tradeEvidence:[],needs:[{...product,decisionId:'growth',tradeResearch:false,tradeEvidenceId:''}]};
 const opening=await f.run([],{plan});
 f.providers.researchCapacity=async()=>({remainingKurus:2200,capKurus:3000,defaults:['tavily'],configuredDefaults:['tavily'],actors:[]});
 f.providers.manager=async()=>({data:answer({decisions:[choice(product.id,{nextQuery:'Pati Care UK grooming spray price in England'})]})});
 const next=await f.run(copy([opening]),{plan});
 assert.equal(next.decisions[0].nextQuery,'');assert.equal(f.calls.length,1);
 assert.deepEqual(next.commandResults,[]);assert.equal(next.closed,false);
});
