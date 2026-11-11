import test from 'node:test';
import assert from 'node:assert/strict';
import {BudgetError} from '../src/budget/ledger.mjs';
import {runCollectionFirstStage,collectionBudgetKurus,planCollectionFunding} from '../src/bhs/collection-first.mjs';
import {sequentialContext,sequentialPhases,stageModelInput} from '../src/bhs/sequential-contracts.mjs';
import {stageBudgetLedger} from '../src/bhs/sequential-providers.mjs';
import {localBudget} from './fixtures/local-budget.mjs';
import {brief,plan,packet,modelAnswer} from './fixtures/sequential.mjs';
import {methodologyAreas} from '../src/bhs/methodology-areas.mjs';

const clock=()=>Date.parse('2026-11-11T10:00:00Z');
const fixturePacket=()=>{
 const data=packet();
 const domains=new Map(plan.entities.filter(e=>e.role==='competitor').map(e=>[e.website,'https://'+e.name.toLowerCase().replaceAll(' ','')+'.example/']));
 const entities=data.entities.map(e=>({...e,website:domains.get(e.website)||e.website}));
 const sources=data.sources.map(s=>({...s,url:domains.get(s.url)||s.url,finalUrl:domains.get(s.finalUrl)||s.finalUrl}));
 const peer=entities.find(e=>e.role==='competitor'),alternateUrl=peer.website.replace('://','://atelier');
 return {...data,entities:[...entities,{...peer,id:'alternate-peer',name:'Atelier '+peer.name,website:alternateUrl}],sources:[...sources,{...sources.find(s=>s.url===peer.website),id:'alternate-source',url:alternateUrl,finalUrl:alternateUrl}]};
};
const directPeerReply=request=>({data:{decisions:request.candidates.map(([id,,,proofs])=>({id,verdict:'direct',proof:proofs[0][0],reason:'Aynı ürün ve hedef pazar.'}))}});

test('collection preserves raw records under 25 TRY and never calls Claude during collection',async()=>{
 const db=await localBudget(),seen=new Map();
 const brand={packet:fixturePacket(),plan,decision:'accepted',facts:[]};
 seen.set('brand',brand);
 const previous=async phase=>seen.get(phase);
 const phases=sequentialPhases.slice(sequentialPhases.indexOf('brand')+1,sequentialPhases.indexOf('synthesis'));
 const rawSearch=[];
 let managers=0,workers=0;
 try{
  for(const phase of phases){
   const providers={
    now:clock,
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
      worker:async(stage,input)=>{
       workers++;
       if(stage==='v8-collection-peer-search')return {data:{queries:[]}};
       return {data:{observations:input.sources.filter(source=>!source.url.includes('public.example')).flatMap(source=>source.sections.map(section=>({area:'operations_1',text:section.text||'Verbatim research record.',sourceIds:section.proofIds}))),organizations:[]}};
      }
     };
    }
   };
   const stage=await runCollectionFirstStage({phase,brief,providers,previous,collect:async()=>fixturePacket(),finish:data=>data});
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
 assert.ok(boundary.researchAccount.finalReserveKurus>0);
  assert.ok(boundary.researchAccount.committedKurus<=collectionBudgetKurus);
  const providers={manager:async()=>{managers++;throw new BudgetError('test_stop','Reached final Claude review.');}};
  await assert.rejects(runCollectionFirstStage({phase:'synthesis',brief,providers,previous,finish:data=>data}),{code:'test_stop'});
  assert.equal(managers,1);
  const context=sequentialContext(brief,{packet:fixturePacket(),searches:[],peerDiscoveryVersion:'product-v2'});
  const input=stageModelInput(context,{areas:true});
  const peers=fixturePacket().entities.filter(e=>e.role==='competitor').map(e=>({entityId:e.id,relationship:'direct',reason:'Aynı ürün ve hedef pazar.',sourceIds:[context.cards.find(c=>c.url===e.website).id]}));
  const draft=modelAnswer('v8-report-draft',{...input,peerReview:peers});
  const data={peers,benchmarks:[],questions:Object.fromEntries(draft.dimensions.map(d=>[d.id,'Bu bulguyu hangi verilerle doğrulayabiliriz?'])),findings:draft.findings.map(f=>({
   a:[methodologyAreas.find(a=>a.dimension===f.dimension).key],o:f.observation,p:f.sourceIds,k:f.kind,h:f.commercialHypothesis,l:f.limitation,w:Object.keys(draft.swot).find(key=>draft.swot[key].includes(f.id))||'none'
  }))};
  const result=await runCollectionFirstStage({phase:'synthesis',brief,providers:{costStatus:()=>db.ledger.status(),manager:async(stage,request)=>{
   if(stage==='v8-collection-reserved-peers')return directPeerReply(request);
   assert.equal(stage,'v8-collection-reserved-report');
   const publicQuotes=request.unindexedSources.filter(row=>row[0]==='public.example').flatMap(row=>row[2].map(([,quote])=>quote));
   assert.ok(publicQuotes.some(quote=>quote.includes('increase')));
   assert.ok(publicQuotes.some(quote=>quote.includes('decrease')));
   const aliases=new Map(Object.entries(request.originalQuotes).map(([alias,[,quote]])=>[quote,alias]));
   const remap=ids=>ids.map(id=>aliases.get(context.known.get(id).quote));
    return {data:{...data,findings:data.findings.map(f=>({...f,p:remap(f.p)}))},model:'claude-sonnet-5-5'};
  }},previous,finish:value=>value});
  assert.equal(result.supervision.reviewMode,'collection-first');
  assert.equal(result.supervision.acceptance.passed,true);
  assert.equal(result.supervision.acceptance.directCompetitors,3);
  assert.ok(result.report.dimensions.every(d=>d.findingIds.length<=4));
  const reviews=[];
  let compact;
  const repaired=await runCollectionFirstStage({phase:'synthesis',brief,providers:{costStatus:()=>db.ledger.status(),manager:async(stage,request)=>{
   reviews.push(stage);
   if(stage==='v8-collection-reserved-peers')return directPeerReply(request);
   if(stage==='v8-collection-reserved-report'){
    const aliases=new Map(Object.entries(request.originalQuotes).map(([alias,[,quote]])=>[quote,alias]));
    const remap=ids=>ids.map(id=>aliases.get(context.known.get(id).quote));
    compact={...data,findings:data.findings.map(f=>({...f,p:remap(f.p)})),peers:data.peers.map(p=>({...p,sourceIds:remap(p.sourceIds)}))};
    return {data:{...compact,findings:compact.findings.filter(f=>!f.a[0].startsWith('digital_')),peers:[]},model:'claude-sonnet-5-5'};
   }
   assert.ok(request.issues.includes('insufficient_dimension_depth'));
   const findings=compact.findings.filter(f=>f.a[0].startsWith('digital_'));
   return {data:{...compact,findings:[...findings,{...findings[0],o:'Geçersiz kanıtlı örnek.',p:['existing:2']}]},model:'claude-sonnet-5-5'};
  }},previous,finish:value=>value});
  assert.deepEqual(reviews,['v8-collection-reserved-peers','v8-collection-reserved-report','v8-collection-reserved-gaps']);
  assert.equal(repaired.supervision.acceptance.passed,true);
  assert.ok(!repaired.report.findings.some(f=>f.statement==='Geçersiz kanıtlı örnek.'));
 }finally{await db.close();}
});

test('identity and infrastructure costs reduce research room before any research is bought',()=>{
 const funding=planCollectionFunding({chargedKurus:2023,capKurus:5000},400,clock());
 assert.equal(funding.startKurus,1623);
 assert.ok(funding.researchLimitKurus<2500);
 assert.equal(funding.capKurus+funding.finalReserveKurus+funding.finalInfrastructureKurus,5000);
 assert.equal(funding.finalReserveKurus,Object.values(funding.finalQuotes).reduce((sum,quote)=>sum+quote,0));
 assert.throws(()=>planCollectionFunding({chargedKurus:4500,capKurus:5000},400,clock()),{code:'budget_limit'});
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
