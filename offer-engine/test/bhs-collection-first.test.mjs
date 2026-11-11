import test from 'node:test';
import assert from 'node:assert/strict';
import {BudgetError} from '../src/budget/ledger.mjs';
import {runCollectionFirstStage,collectionBudgetKurus} from '../src/bhs/collection-first.mjs';
import {sequentialContext,sequentialPhases,stageModelInput} from '../src/bhs/sequential-contracts.mjs';
import {stageBudgetLedger} from '../src/bhs/sequential-providers.mjs';
import {localBudget} from './fixtures/local-budget.mjs';
import {brief,plan,packet,modelAnswer} from './fixtures/sequential.mjs';
import {methodologyAreas} from '../src/bhs/methodology-areas.mjs';

test('collection preserves raw records under 25 TRY and never calls Claude during collection',async()=>{
 const db=await localBudget(),seen=new Map();
 const brand={packet:packet(),plan,decision:'accepted',facts:[]};
 seen.set('brand',brand);
 const previous=async phase=>seen.get(phase);
 const phases=sequentialPhases.slice(sequentialPhases.indexOf('brand')+1,sequentialPhases.indexOf('synthesis'));
 const rawSearch=[];
 let managers=0,workers=0;
 try{
  for(const phase of phases){
   const providers={
    costStatus:()=>db.ledger.status(),
    checkpoint:(key,input,run)=>db.ledger.once(key,input,0,run),
    manager:async()=>{managers++;throw Error('Claude should start only after the archive closes');},
    withCeiling:limit=>{
     const scoped=stageBudgetLedger(db.ledger,phase,{phaseLimitKurus:limit});
     return {
      availableActors:async()=>[],
      search:query=>scoped.once('raw:'+query,query,70,async()=>{
       const result={query,results:[
        {url:'https://public.example/a',title:'A',content:'The first source claims an increase in demand.'},
        {url:'https://public.example/b',title:'B',content:'The second source claims a decrease in demand.'}
       ]};
       rawSearch.push(result);
       return result;
      }),
      worker:async()=>{workers++;return {data:{observations:[],organizations:[]}};}
     };
    }
   };
   const stage=await runCollectionFirstStage({phase,brief,providers,previous,collect:async()=>packet(),finish:data=>data});
   seen.set(phase,stage);
  }
  assert.ok(workers>0);
  assert.equal(managers,0);
  assert.ok(rawSearch.length>0);
  const saved=seen.get('sector_sources').searches.find(s=>s.results);
  assert.deepEqual(saved.results,rawSearch[0].results);
  const boundary=seen.get('coverage_plan');
  assert.equal(boundary.collectionClosed,true);
  assert.equal(boundary.researchAccount.capKurus-boundary.researchAccount.startKurus,collectionBudgetKurus);
  assert.ok(boundary.researchAccount.committedKurus<=collectionBudgetKurus);
  const providers={manager:async()=>{managers++;throw new BudgetError('test_stop','Reached final Claude review.');}};
  await assert.rejects(runCollectionFirstStage({phase:'synthesis',brief,providers,previous,finish:data=>data}),{code:'test_stop'});
  assert.equal(managers,1);
  const context=sequentialContext(brief,{packet:packet(),searches:[],peerDiscoveryVersion:'product-v2'});
  const input=stageModelInput(context,{areas:true});
  const peers=plan.entities.filter(e=>e.role==='competitor').map(e=>({entityId:e.id,relationship:'direct',reason:'Aynı ürün ve hedef pazar.',sourceIds:[context.cards.find(c=>c.url===e.website).id]}));
  const draft=modelAnswer('v8-report-draft',{...input,peerReview:peers});
  const data={peers,benchmarks:[],questions:Object.fromEntries(draft.dimensions.map(d=>[d.id,'Bu bulguyu hangi verilerle doğrulayabiliriz?'])),findings:draft.findings.map(f=>({
   a:[methodologyAreas.find(a=>a.dimension===f.dimension).key],o:f.observation,p:f.sourceIds,k:f.kind,h:f.commercialHypothesis,l:f.limitation,w:Object.keys(draft.swot).find(key=>draft.swot[key].includes(f.id))||'none'
  }))};
  const result=await runCollectionFirstStage({phase:'synthesis',brief,providers:{costStatus:()=>db.ledger.status(),manager:async(stage,request)=>{
   assert.equal(stage,'v8-collection-final-bhs');
   const publicQuotes=request.unindexedSources.filter(row=>row[0]==='public.example').flatMap(row=>row[2].map(([,quote])=>quote));
   assert.ok(publicQuotes.some(quote=>quote.includes('increase')));
   assert.ok(publicQuotes.some(quote=>quote.includes('decrease')));
   return {data,model:'claude-sonnet-5-5'};
  }},previous,finish:value=>value});
  assert.equal(result.supervision.reviewMode,'collection-first');
  assert.equal(result.supervision.acceptance.passed,true);
  assert.ok(result.report.dimensions.every(d=>d.findingIds.length<=4));
 }finally{await db.close();}
});

test('a scoped research ledger shares the same account and cannot claim past its ceiling',async()=>{
 const db=await localBudget();
 try{
  const starting=await db.ledger.status(),cap=starting.chargedKurus+2500;
  const search=stageBudgetLedger(db.ledger,'sector_sources',{phaseLimitKurus:cap});
  const scraper=stageBudgetLedger(db.ledger,'competition_review',{phaseLimitKurus:cap});
  assert.equal((await search.status()).capKurus,cap);
  await search.once('search-test',{},2300,async()=>({}));
  await assert.rejects(scraper.once('actor-test',{},150,async()=>{assert.fail('A capped Actor started');}),{code:'budget_limit'});
  assert.equal((await db.ledger.status()).capKurus,5000);
 }finally{await db.close();}
});
