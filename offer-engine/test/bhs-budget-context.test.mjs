import assert from 'node:assert/strict';
import test from 'node:test';
import {BudgetError} from '../src/budget/ledger.mjs';
import {createSequentialProviders} from '../src/bhs/sequential-providers.mjs';
import {researchReviewContext} from '../src/bhs/research-review-context.mjs';
import {reviewScopedResearch,scopedEvidence} from '../src/bhs/scoped-research.mjs';
import {localBudget} from './fixtures/local-budget.mjs';
import {obj,str} from '../src/bhs/sequential-contracts.mjs';

const now=()=>Date.parse('2026-11-20T00:00:00Z'),fx=async()=>({usdTry:40,publishedAt:'2026-11-20'});
const need={id:'product',section:'product',target:'Care spray',market:'Türkiye',country:'TR',language:'tr',
 metric:'Ürünün tam varyantı',expected:'Resmî sayfada ürünün adı ve hacmi',query:'Care spray Türkiye resmî ürün 100 ml',
 quantity:2,first:'gemini',period:'güncel',since:''};
const response=value=>new Response(JSON.stringify(value));
function native(input=180,tool=500000){
 return {modelVersion:'gemini-2.5-flash-lite',usageMetadata:{promptTokenCount:input,toolUsePromptTokenCount:tool,
  candidatesTokenCount:120,thoughtsTokenCount:0,totalTokenCount:input+tool+120},
  candidates:[{groundingMetadata:{groundingChunks:[{web:{uri:'https://brand.example/product',title:'Care spray'}}],
   groundingSupports:[{groundingChunkIndices:[0],segment:{text:'The official Care spray product page.'}}]}}]};
}
const configured=(ledger,fetchImpl,version=24)=>createSequentialProviders({ledger,phase:'sector_draft',phaseLimitKurus:3000,
 collectionFirst:true,managedAudit:true,managedBudgetVersion:version,anthropicKey:'synthetic',geminiKey:'synthetic',tavilyKey:'synthetic',
 now,researchFx:fx,fetchImpl});

test('bounded Gemini grounding fits a narrow remaining account, excludes retrieval from billable input and reuses its receipt',async t=>{
 const f=await localBudget();t.after(f.close);
 await f.ledger.once('prior',{},2150,async()=>({saved:true})); // 26.50 TRY committed; 3.50 left in research.
 let calls=0;
 const fetchImpl=async(url,init)=>{
  calls++;assert.ok(url.endsWith('gemini-2.5-flash-lite:generateContent'));
  const body=JSON.parse(init.body);assert.deepEqual(body.tools,[{google_search:{}}]);
  assert.equal(body.generationConfig.maxOutputTokens,1250);assert.equal(body.generationConfig.thinkingConfig.thinkingBudget,0);
  return response(native());
 };
 const providers=configured(f.ledger,fetchImpl),capacity=await providers.researchCapacity({includeActors:false});
 assert.ok(capacity.quotes.gemini<300);assert.ok(capacity.defaults.includes('gemini'));
 const value=await providers.searchGemini(need);
 assert.equal(value.toolRetrievalTokens,500000);assert.equal(value.results[0].content,'','Discovery summaries cannot become source text');
 const status=await f.ledger.status();assert.ok(status.chargedKurus<3000);assert.equal(status.capKurus,5000);
 const reused=await configured(f.ledger,()=>assert.fail('The paid native search must not run twice')).searchGemini(need);
 assert.deepEqual(reused,value);assert.equal(calls,1);assert.deepEqual(await f.ledger.status(),status);
});

test('old complete and uncertain native receipts survive the smaller BHS reservation without refunds or another dispatch',async t=>{
 for(const uncertain of [false,true]){
  const f=await localBudget();t.after(f.close);let calls=0;
  const legacy=configured(f.ledger,async()=>{calls++;if(uncertain)throw new BudgetError('provider_timeout','Synthetic lost response');return response(native(180,10000));},23);
  if(uncertain)await assert.rejects(()=>legacy.searchGemini(need),{code:'provider_timeout'});else await legacy.searchGemini(need);
  const before=await f.ledger.status(),receipts=await f.receipts();
  const current=configured(f.ledger,()=>assert.fail('An old paid request cannot be replayed'));
  if(uncertain)await assert.rejects(()=>current.searchGemini(need),{code:'budget_uncertain'});else await current.searchGemini(need);
  assert.equal(calls,1);assert.deepEqual(await f.ledger.status(),before);assert.deepEqual(await f.receipts(),receipts);
 }
});

test('invalid billable input retains its funded commitment and cannot trigger a second paid request',async t=>{
 const f=await localBudget();t.after(f.close);let calls=0;
 const providers=configured(f.ledger,async()=>{calls++;return response(native(50000,100));});
 await assert.rejects(()=>providers.searchGemini(need),{code:'provider_accounting'});
 const before=await f.ledger.status();assert.ok(before.chargedKurus<=800);
 await assert.rejects(()=>providers.searchGemini(need),{code:'budget_uncertain'});
 assert.equal(calls,1);assert.deepEqual(await f.ledger.status(),before);
});

test('oversized input and expired reviewed model pricing refuse before a paid request or reservation',async t=>{
 const f=await localBudget();t.after(f.close);const before=await f.ledger.status();
 const providers=configured(f.ledger,()=>assert.fail('No paid endpoint is authorized'));
 await assert.rejects(()=>providers.searchGemini({...need,target:'x'.repeat(9000)}),{code:'input_budget'});
 const expired=createSequentialProviders({ledger:f.ledger,phase:'sector_draft',phaseLimitKurus:3000,
  collectionFirst:true,managedBudgetVersion:24,geminiKey:'synthetic',now:()=>Date.UTC(2026,11,1),researchFx:fx,
  fetchImpl:()=>assert.fail('The changed model tariff is not approved')});
 await assert.rejects(()=>expired.searchGemini(need),{code:'tariff_expired'});
 assert.deepEqual(await f.ledger.status(),before);
});

const facts=Array.from({length:100},(_,i)=>({id:'proof-'+i,needId:'need-'+i%4,url:'https://source.example/'+i,
 title:'Source '+i,method:'html',quote:('Original source '+i+' describes the observed wholesale process. ').repeat(16),item:'Observed process'}));
function request(){
 const needs=Array.from({length:4},(_,i)=>({...need,id:'need-'+i}));
 return {identity:{understanding:'A supplier of care products.'},needs,findings:facts,checked:[],knownUrls:facts.map(f=>f.url),
  previous:facts.map(f=>({id:f.needId,query:'Observed process '+f.id,attempts:[{tool:'tavily'}]})),
  commandHistory:facts.map(f=>({id:f.needId,tool:'read',url:f.url,query:'',status:'executed'})),
  pendingCommands:[{id:'need-3',tool:'read',url:facts[3].url,query:'',mode:'default',limit:1}],instruction:'Review the original evidence.'};
}

test('controller windows carry complete excerpts and pending work without dropping the archive or starving later questions',()=>{
 const input=request(),original=structuredClone(input),seen=new Set();let turns=0;
 const first=researchReviewContext(input,seen);
 assert.ok(JSON.stringify(first.request).length<JSON.stringify(input).length*.5);
 assert.ok(first.request.findings.some(row=>row.needId==='need-3'));
 assert.deepEqual(first.request.pendingCommands,input.pendingCommands);
 while(seen.size<facts.length&&turns++<10){
  const view=researchReviewContext(input,seen);assert.ok(view.proofIds.some(id=>!seen.has(id)));
  for(const fact of view.request.findings){assert.deepEqual(fact,facts.find(saved=>saved.id===fact.id));seen.add(fact.id);}
 }
 assert.equal(seen.size,facts.length);assert.deepEqual(input,original);
});

const brief={brandName:'Care',website:'https://brand.example/',segment:'kobi',goals:'Türkiye ürün satışını büyütmek',needs:'Ürünü doğrulamak',services:'Growth',meetingNotes:''};
const packet={asOf:'2026-11-20',entities:[{id:'brand',role:'brand',website:brief.website}],sources:[]};
const fit={status:'partial',reason:'Only the visible part of the evidence is selected.'};
const plan={needs:[{...need,id:'need-0',first:'tavily'}],scopedResearch:true,orderedResearch:true,reportOnlyAfterResearch:true,
 targetedEvidence:true,readEvidenceOnly:true,questionEvidence:true,decisionTurns:true,compactResearchContext:true};
const answer=decisions=>({approve:false,newNeeds:[],decisions,commands:[],peers:[]});

test('deferred controller evidence stays available for another review instead of causing a new paid search or a false proof decision',async()=>{
 const archive=facts.map(f=>({...f,needId:plan.needs[0].id})),original=structuredClone(archive),rounds=[{receipts:[{
  id:plan.needs[0].id,query:need.query,defaultAttempt:true,attempts:[{tool:'tavily'}],facts:archive,urls:archive.map(f=>f.url)}]}];
 let visible,hidden;
 const providers={managedBudgetVersion:24,researchCapacity:async()=>({remainingKurus:572,defaults:['tavily'],configuredDefaults:['tavily'],actors:[]}),
  manager:async(_stage,input)=>{
   visible=input.findings;assert.ok(visible.length<archive.length);hidden=archive.find(row=>!visible.some(f=>f.id===row.id));
   return {data:answer([{id:plan.needs[0].id,sufficient:false,proofs:[visible[0].id,hidden.id],read:'',nextQuery:'',answerFit:fit}])};
  },worker:async()=>({data:{decisions:[]}}),search:()=>assert.fail('Review retained evidence before buying another search'),
  searchGemini:()=>assert.fail('No new search is required')};
 const options={brief,identity:{understanding:'Care products'},briefUnderstanding:{understanding:brief.goals},packet,plan,providers,
  readPages:()=>assert.fail('Already read evidence needs no page read')};
 const first=await reviewScopedResearch({...options,rounds});
 assert.equal(first.closed,false);assert.equal(first.issue,'research_evidence_pending');
 assert.deepEqual(first.decisions[0].proofs,[visible[0].id]);
 assert.ok(!first.controllerProofIds.includes(hidden.id));
 assert.deepEqual(rounds[0].receipts[0].facts,original);
 rounds.push(first);const before=new Set(first.controllerProofIds);
 await reviewScopedResearch({...options,rounds});assert.ok(visible.some(f=>!before.has(f.id)));
 const preserved=scopedEvidence({packet},plan,rounds);assert.equal(preserved.receipts[0].facts.length,archive.length);
});

test('an empty controller reply does not mark transported sources as reviewed or hide them on reload',async()=>{
 const archive=facts.map(f=>({...f,needId:plan.needs[0].id})),rounds=[{receipts:[{id:plan.needs[0].id,query:need.query,
  defaultAttempt:true,attempts:[{tool:'tavily'}],facts:archive,urls:archive.map(f=>f.url)}]}];
 const windows=[];
 const providers={managedBudgetVersion:24,manager:async(_stage,input)=>{windows.push(input.findings.map(f=>f.id));return {data:answer([])};},
  worker:async()=>({data:{decisions:[]}})};
 const options={brief,identity:{understanding:'Care products'},briefUnderstanding:{understanding:brief.goals},packet,plan,providers,last:true,
  readPages:()=>assert.fail('This final check cannot buy or read data')};
 const first=await reviewScopedResearch({...options,rounds});assert.equal(first.controllerProofIds,undefined);
 await reviewScopedResearch({...options,rounds:[...rounds,first]});assert.deepEqual(windows[1],windows[0]);
});

test('an admission refusal is not a purchased search; the exact affordable task can still run when controller funding fails',async()=>{
 for(const issue of ['input_budget','budget_uncertain']){
  let searches=0;
  const providers={managedBudgetVersion:24,researchCapacity:async()=>({remainingKurus:572,defaults:['tavily'],configuredDefaults:['tavily'],actors:[]}),
   manager:async()=>{throw new BudgetError('budget_limit','Synthetic controller admission refusal');},
   search:async query=>{searches++;assert.equal(query,need.query);return {results:[]};}};
  const result=await reviewScopedResearch({brief,identity:{understanding:'Care products'},briefUnderstanding:{understanding:brief.goals},packet,plan,
   rounds:[{receipts:[{id:plan.needs[0].id,query:need.query,defaultAttempt:true,attempts:[{tool:'tavily',issue}],facts:[],urls:[]}]}],providers,
   readPages:()=>assert.fail('No page was observed')});
  assert.equal(searches,issue==='input_budget'?1:0);
  if(issue==='input_budget')assert.equal(result.closed,false);
 }
});

test('a bounded report page receives its complete generation window instead of the short controller timeout',async t=>{
 const f=await localBudget();t.after(f.close);const timeouts=[],original=AbortSignal.timeout;
 AbortSignal.timeout=milliseconds=>{timeouts.push(milliseconds);return original(milliseconds);};
 try{
  const providers=configured(f.ledger,async(url,init)=>{
   if(url.endsWith('/count_tokens'))return response({input_tokens:100});
   assert.ok(url.endsWith('/messages'));
   return response({model:JSON.parse(init.body).model,usage:{input_tokens:100,output_tokens:50},stop_reason:'end_turn',
    content:[{type:'text',text:'{"result":"complete"}'}]});
  });
  const value=await providers.manager('bhs-scoped-report-brief-page-0',{instruction:'Write the completed source-backed page.'},obj({result:str(30)}),
   {compactReview:true,lowEffort:true,plainJson:true,maxOutputTokens:512,minimumOutputTokens:256,generationTimeoutMs:55000});
  assert.equal(value.data.result,'complete');assert.ok(timeouts.includes(55000));assert.ok(!timeouts.includes(42000));
 }finally{AbortSignal.timeout=original;}
});
