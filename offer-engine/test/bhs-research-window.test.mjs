import assert from 'node:assert/strict';
import test from 'node:test';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {runMeteredBhsPhase} from '../src/bhs/job-worker.mjs';
import {meteredBhsStage,useShortResearchWindow,workerInfrastructureKey,workerInfraReservationKurus,shortResearchReservationKurus,workerMaxDurationSeconds,shortResearchSeconds} from '../src/bhs/job-infrastructure.mjs';
import {createSequentialProviders} from '../src/bhs/sequential-providers.mjs';
import {capBhsLedger} from '../src/bhs/managed-budget.mjs';
import {reviewScopedResearch,scopedEvidence} from '../src/bhs/scoped-research.mjs';
import {localBudget} from './fixtures/local-budget.mjs';

const brief=snapshotBrief({brandName:'Example Brand',website:'https://brand.example/',segment:'corporate',
 goals:'A UK nursery pilot.',needs:'Verify the wholesale channel.',services:'B2B',meetingNotes:''});
const job={id:'11111111-1111-4111-8111-111111111111',phase:'report_draft',briefHash:briefHash(brief),researchVersion:'v8',scopedRoundIndex:0};
const q={tavily:62,gemini:1044};
const response=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const cpu=()=>({user:0,system:0});

test('the short window covers the gap between a standalone full reservation and a full reservation plus its next call',()=>{
 for(const [remaining,expected] of [[shortResearchReservationKurus-1,false],[shortResearchReservationKurus,true],
  [299,true],[300,true],[310,true],[361,true],[362,false],[500,false]])
  assert.equal(useShortResearchWindow(remaining,q),expected,'Remaining kuruş: '+remaining);
 assert.equal(useShortResearchWindow(400,{tavily:120}),true);
 assert.equal(useShortResearchWindow(420,{tavily:120}),false);
 assert.equal(useShortResearchWindow(310,{gemini:1044}),false,'Do not claim that the short envelope funds an unaffordable configured call');
 assert.equal(useShortResearchWindow(310,{}),false);
 assert.equal(useShortResearchWindow(200,{}),true,'Existing low-balance source reads and reviews remain supported');
 for(const value of [NaN,Infinity,-1,310.5])assert.equal(useShortResearchWindow(value,q),false);
 assert.equal(useShortResearchWindow(310,{invalid:NaN,negative:-1,zero:0,tavily:62}),true);
});

test('26.90 TRY committed plus 3.10 TRY remaining funds a precise search and evidence check in the same capped account',async t=>{
 const f=await localBudget();t.after(f.close);
 const ledger=capBhsLedger(f.ledger,3000);
 await ledger.once('prior-research',{},2190,async()=>({retained:true}));
 assert.equal((await ledger.status()).chargedKurus,2690);
 let time=Date.parse('2026-11-19T12:00:00Z'),searches=0,generations=0,stages=0;
 const observedCharges=[];
 const need={id:'channel',section:'channel',target:'Example Brand',market:'United Kingdom',metric:'Wholesale channel',period:'current',
  expected:'The brand supplies nursery retailers.',quantity:2,query:'Example Brand UK nursery wholesale catalogue',country:'GB',language:'en',first:'tavily',since:''};
 const packet={asOf:'2026-11-19',entities:[{id:'brand',role:'brand',website:brief.website}],sources:[]};
 const plan={needs:[need],orderedResearch:true,reportOnlyAfterResearch:true,targetedEvidence:true,readEvidenceOnly:true,questionEvidence:true};
 const providers=createSequentialProviders({ledger,phase:job.phase,phaseLimitKurus:3000,managedAudit:true,managedBudgetVersion:24,
  collectionFirst:true,infrastructureOffsetKurus:workerInfraReservationKurus,now:()=>time,
  anthropicKey:'synthetic',geminiKey:'synthetic',tavilyKey:'synthetic',researchFx:async()=>({usdTry:40,publishedAt:'2026-11-19'}),
  fetchImpl:async(url,init)=>{
   observedCharges.push((await ledger.status()).chargedKurus);
   const body=JSON.parse(init.body);
   if(url.endsWith('/search')){
    searches++;time+=2000;assert.equal(body.query,need.query);assert.equal(body.max_results,need.quantity);
    assert.equal(body.country,'united kingdom');assert.equal(body.language,'en');assert.equal(body.search_depth,'basic');
    return response({results:[{url:'https://publisher.example/wholesale',title:'Wholesale catalogue',
     content:'Example Brand supplies nursery retailers through its wholesale catalogue.'}],usage:{credits:1}});
   }
   if(url.endsWith(':countTokens'))return response({totalTokens:300});
   assert.ok(url.endsWith(':generateContent'));assert.ok(url.includes('gemini-3.1-flash-lite'));
   generations++;time+=3000;
   const input=JSON.parse(body.contents[0].parts[0].text),task=input.tasks[0];
   const data={decisions:[{id:need.id,sufficient:false,proofs:[],read:task.sources[0].id,nextQuery:'',
    answerFit:{status:'partial',reason:'The discovered publisher page still requires a direct read.'}}]};
   return response({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}],
    usageMetadata:{promptTokenCount:300,candidatesTokenCount:100,totalTokenCount:400}});
  }});
 const capacity=await providers.researchCapacity({includeActors:false});
 assert.equal(capacity.quotes.tavily,62);
 let round;
 const options={brief,phase:job.phase,ledger,providers,phaseCeiling:3000,scopedRoundIndex:0};
 const run=()=>runMeteredBhsPhase(job,options,{
  meter:args=>meteredBhsStage({...args,region:'iad1',clock:()=>time,cpu}),
  runStage:async opts=>{
   stages++;assert.equal(opts.providers.infrastructureOffsetKurus,shortResearchReservationKurus);
   assert.equal((await ledger.status()).chargedKurus,2690+shortResearchReservationKurus);
   assert.equal(opts.providers.executionSignal.aborted,false);
   round=await reviewScopedResearch({brief,identity:{understanding:'The brand supplies nursery products.'},
    briefUnderstanding:{understanding:brief.goals},packet,plan,rounds:[],providers:opts.providers,
    readPages:()=>assert.fail('A discovery result must not authorize a guessed page read')});
  }});
 const result=await run();
 assert.equal(result.reservedKurus,shortResearchReservationKurus);assert.ok(result.accountedKurus<result.reservedKurus);
 assert.equal(searches,1);assert.equal(generations,1);assert.equal(round.openingSearch,true);assert.equal(round.closed,false);
 assert.equal(round.receipts[0].query,need.query);assert.equal(round.decisions[0].read,'https://publisher.example/wholesale');
 const evidence=scopedEvidence({packet},plan,[round]);
 assert.equal(evidence.coverage[0].status,'open');assert.equal(evidence.receipts[0].facts.length,1);
 assert.ok(observedCharges.every(value=>value<=3000));
 const settled=await ledger.status();assert.ok(settled.chargedKurus<3000);assert.equal(settled.capKurus,5000);
 await run();
 assert.equal(stages,1);assert.equal(searches,1);assert.equal(generations,1);assert.deepEqual(await ledger.status(),settled);
});

test('a completed full-worker receipt remains authoritative when its settled balance would now select short mode',async t=>{
 const f=await localBudget();t.after(f.close);const ledger=capBhsLedger(f.ledger,3000);
 await ledger.once('prior-research',{},2190,async()=>({}));
 let time=1000,runs=0;
 await meteredBhsStage({job,ledger,region:'iad1',clock:()=>time,cpu,run:async()=>{time+=5000;runs++;}});
 const before=await ledger.status();assert.equal(useShortResearchWindow(3000-before.chargedKurus,q),true);
 await runMeteredBhsPhase(job,{brief,ledger,phaseCeiling:3000,scopedRoundIndex:0,
  providers:{managedBudgetVersion:24,collectionFirst:true,withExecutionWindow:()=>assert.fail('Do not replace a funded envelope'),
   researchCapacity:()=>assert.fail('The saved receipt is already authoritative')}},
  {meter:args=>meteredBhsStage({...args,region:'iad1',clock:()=>time,cpu}),runStage:()=>assert.fail('No repeated stage')});
 assert.equal(runs,1);assert.deepEqual(await ledger.status(),before);
});

for(const shortResearch of [false,true])test(`an uncertain ${shortResearch?'short':'full'} worker cannot be retried by switching modes`,async t=>{
 const f=await localBudget();t.after(f.close);const ledger=capBhsLedger(f.ledger,3000);
 await ledger.once('prior-research',{},2190,async()=>({}));
 let time=1000;
 await assert.rejects(meteredBhsStage({job,ledger,shortResearch,region:'iad1',clock:()=>time,cpu,
  run:async()=>{time+=(shortResearch?shortResearchSeconds:workerMaxDurationSeconds)*1000+1;}}),{code:'infra_accounting'});
 const saved=await ledger.get(workerInfrastructureKey(job,shortResearch));assert.equal(saved.state,'uncertain');
 const before=await ledger.status();
 await assert.rejects(runMeteredBhsPhase(job,{brief,ledger,phaseCeiling:3000,scopedRoundIndex:0,
  providers:{managedBudgetVersion:24,collectionFirst:true,withExecutionWindow:()=>assert.fail('Uncertain work must not change modes')}},
  {meter:args=>meteredBhsStage({...args,region:'iad1',clock:()=>time,cpu}),runStage:()=>assert.fail('Do not repeat uncertain work')}),{code:'budget_uncertain'});
 assert.deepEqual(await ledger.status(),before);
});

test('the opening marker remains free and cannot probe providers or reserve compute',async()=>{
 const result=await runMeteredBhsPhase(job,{providers:{managedBudgetVersion:24,collectionFirst:true,
   researchCapacity:()=>assert.fail('A marker has no acquisition work')},
  ledger:{get:()=>assert.fail('No worker lookup'),status:()=>assert.fail('No reservation')}},
  {meter:()=>assert.fail('The marker must remain free'),runStage:async()=>({scopedTail:true})});
 assert.equal(result.scopedTail,true);
});

test('the exact full-worker plus call boundary keeps normal duration and the lower boundary selects the bounded short window',async()=>{
 for(const remaining of [workerInfraReservationKurus+q.tavily-1,workerInfraReservationKurus+q.tavily]){
  let windowCalls=0,probes=0;
  const short=remaining<workerInfraReservationKurus+q.tavily;
  const providers={managedBudgetVersion:24,collectionFirst:true,now:()=>1000,
   researchCapacity:async options=>{probes++;assert.deepEqual(options,{includeActors:false});return {quotes:q};},
   withExecutionWindow:(deadline,reservation)=>{windowCalls++;assert.equal(deadline,56000);assert.equal(reservation,shortResearchReservationKurus);return {short:true};}};
  await runMeteredBhsPhase(job,{brief,providers,ledger:{status:async()=>({chargedKurus:3000-remaining})},phaseCeiling:3000,scopedRoundIndex:0},
   {meter:async({shortResearch,run})=>{assert.equal(Boolean(shortResearch),short);return run();},
    runStage:async opts=>assert.equal(Boolean(opts.providers.short),short)});
  assert.equal(probes,1);assert.equal(windowCalls,Number(short));
 }
});

test('infrastructure receipt names remain compatible with completed and explicitly authorized recovery records',()=>{
 assert.equal(workerInfrastructureKey(job),'infra:v8:report_draft:'+job.briefHash+':0');
 assert.equal(workerInfrastructureKey(job,true),'infra:v8:report_draft:'+job.briefHash+':0:short-research');
 assert.equal(workerInfrastructureKey({...job,budgetRecoveryVersion:'shared-budget-v2',budgetRecoveryPhase:job.phase},true),
  'infra:v8:report_draft:'+job.briefHash+':0:shared-budget-v2:short-research');
});
