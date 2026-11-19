import assert from 'node:assert/strict';
import test from 'node:test';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {BudgetError} from '../src/budget/ledger.mjs';
import {understandScopedBrand} from '../src/bhs/scoped-research.mjs';
import {brandReviewContext,brandDiscoveryNeedsWork,plannedBrandActions} from '../src/bhs/brand-review-state.mjs';
import {hash} from '../src/budget/ledger.mjs';
import {brandPublisherHosts} from '../src/bhs/brand-publishers.mjs';
import {runSequentialStage} from '../src/bhs/sequential-research.mjs';
import {sequentialPhases} from '../src/bhs/sequential-contracts.mjs';
import {runMeteredBhsPhase} from '../src/bhs/job-worker.mjs';
import {assertSchema} from '../src/bhs/schema.mjs';

const brief=snapshotBrief({brandName:'Example Brand',website:'https://brand.example/',segment:'corporate',
 goals:'Develop a UK nursery sales pilot.',needs:'Compare product prices.',services:'B2B sales',meetingNotes:'Private card information.'});
const brand={name:brief.brandName,website:brief.website};
const about='https://brand.example/about',contact='https://brand.example/contact',product='https://brand.example/products/royal';
const homeText='Example Brand produces tactile play equipment for nursery movement activities.';
const page=(url,text,extra={})=>({id:url,url,finalUrl:url,title:'Example Brand',method:'html',
 excerpts:[{text,offset:0}],...extra});
const home=page(brief.website,homeText,{technicalSignals:{identityLinks:[{url:about,label:'About'},{url:contact,label:'Contact'},{url:product,label:'Royal'}]}});
const packet=()=>({asOf:'2026-11-19',sources:[structuredClone(home)],entities:[{id:'brand',role:'brand',website:brief.website}]});
const summary='Example Brand makes tactile play equipment for nursery buyers.';
const answer=(understanding=summary,extra={})=>({understanding,pages:[],searches:[],publishers:[],...extra});
const clone=value=>JSON.parse(JSON.stringify(value));
const checkpoint=result=>{const {packet,...state}=result;return clone(state);};
function fixture(choose,options={}){
 const calls=[],reads=[],searches=[];
 const providers={managedBudgetVersion:24,manager:async(stage,input,contract,opts)=>{
   calls.push({stage,input:clone(input),options:opts});
   assert.equal(input.card,undefined);assert.equal(input.brief,undefined);
   assert.equal(opts.maxOutputTokens,1400);assert.equal(opts.minimumOutputTokens,700);
   const data=choose(input,calls.length);assertSchema(data,contract);return {data};
  },search:async(query,opts)=>{searches.push({tool:'tavily',query,opts});return {results:[]};},
  searchGemini:async need=>{searches.push({tool:'gemini',query:need.query});return {results:[]};},...options};
 const readPages=async urls=>{reads.push(...urls);return {sources:urls.map(url=>page(url,'The company has its own production and supplies nursery customers through distributors.'))};};
 const run=(prior,sourcePacket=prior?.packet||packet())=>understandScopedBrand({brief,packet:sourcePacket,providers,prior:prior&&checkpoint(prior),readPages});
 return {providers,calls,reads,searches,run,readPages};
}

test('brand checkpoints send only new source text while preserving the complete source archive and pending links',async()=>{
 const f=fixture((input,index)=>{
  if(index===1)return answer(summary,{pages:[about]});
  assert.equal(input.priorUnderstanding,summary);
  assert.deepEqual(input.sources.map(s=>s.url),[about]);
  assert.deepEqual(input.retainedSources,[{url:brief.website,title:home.title}]);
  assert.ok(input.availablePages.some(row=>row.url===contact));
  assert.match(input.instruction,/onu sıfırdan oluşturma/);
  return answer(summary+' It has its own production and distribution channel.');
 });
 const first=await f.run(),second=await f.run(first);
 assert.equal(second.done,true);assert.equal(f.calls.length,2);assert.deepEqual(f.reads,[about]);
 assert.equal(second.packet.sources.length,2);assert.equal(second.packet.sources[0].excerpts[0].text,homeText);
 assert.equal(second.brandReview.sources.length,2);assert.equal(second.brandReview.readCount,1);
 assert.deepEqual(f.calls[1].input.readReceipts,[{url:about,status:'read'}]);
});

test('three brand turns retain the consolidated understanding and forward each receipt only once',async()=>{
 const consolidated=summary+' It has its own production.';
 const f=fixture((input,index)=>{
  if(index===1)return answer(summary,{pages:[about]});
  if(index===2)return answer(consolidated,{pages:[contact]});
  assert.equal(input.priorUnderstanding,consolidated);
  assert.deepEqual(input.sources.map(s=>s.url),[contact]);
  assert.deepEqual(input.readReceipts,[{url:contact,status:'read'}]);
  assert.deepEqual(input.lookupReceipts,[]);
  assert.equal(input.retainedSources.length,2);
  return answer(consolidated+' Its legal identity is recorded.');
 });
 const first=await f.run(),second=await f.run(first),third=await f.run(second);
 assert.equal(third.packet.sources.length,3);assert.equal(third.brandReview.readCount,2);
 assert.deepEqual(third.readReceipts.map(row=>row.url),[about,contact]);
});

test('volatile metadata does not resend old text, but a meaningful source correction does',async()=>{
 for(const changed of [false,true]){
  const f=fixture((input,index)=>{
   if(index===1)return answer(summary,{pages:[about]});
   assert.deepEqual(input.sources.map(s=>s.url),changed?[brief.website,about]:[about]);
   if(changed)assert.match(input.sources[0].excerpts[0],/owns its retail stores/);
   return answer();
  });
  const first=await f.run(),updated=clone(first.packet);
  updated.sources[0].id='database-renumbered';updated.sources[0].retrievedAt='2026-11-20T01:00:00Z';updated.sources[0].contentHash='volatile';
  updated.sources[0].technicalSignals.identityLinks.reverse();
  if(changed)updated.sources[0].excerpts[0].text=homeText+' It owns its retail stores.';
  await f.run(first,updated);
 }
});

test('an older checkpoint without a review fingerprint receives full context once',async()=>{
 const f=fixture((input)=>{
  assert.deepEqual(input.sources.map(s=>s.url),[brief.website,about]);
  assert.equal(input.priorUnderstanding,summary);return answer();
 });
 const result=await understandScopedBrand({brief,packet:packet(),providers:f.providers,
  prior:{value:answer(summary,{pages:[about]}),visited:[brief.website]},readPages:f.readPages});
 assert.equal(result.brandReview.sources.length,2);
});

test('the same bounded brand search is not repurchased by changing spacing or case',async()=>{
 const query='Example Brand official products';
 const f=fixture((_input,index)=>answer(summary,{searches:[{tool:'tavily',query:index===1?query:' EXAMPLE   BRAND OFFICIAL PRODUCTS ',limit:1}]}));
 const first=await f.run(),second=await f.run(first);
 assert.equal(brandDiscoveryNeedsWork({packet:second.packet,brandDiscovery:checkpoint(second)}),false);
 const done=await f.run(second);
 assert.equal(done.done,true);assert.equal(f.calls.length,2);assert.equal(f.searches.length,1);
 assert.equal(f.calls[1].input.sources.length,0);
 assert.equal(f.calls[1].input.lookupReceipts[0].issue,'no_results');
});

test('a genuinely different result count selected by Claude is executed with its exact bound',async()=>{
 const query='Example Brand official products';
 const f=fixture((_input,index)=>index<3?answer(summary,{searches:[{tool:'tavily',query,limit:index===1?1:3}]}):answer());
 const first=await f.run(),second=await f.run(first);
 assert.equal(brandDiscoveryNeedsWork({packet:second.packet,brandDiscovery:checkpoint(second)}),true);
 const third=await f.run(second);
 assert.deepEqual(f.searches.map(row=>row.opts.maxResults),[1,3]);assert.equal(third.done,true);
});

test('semantic search deduplication does not turn a rejected expensive request into a completed search',()=>{
 const query='Example Brand official products';
 const prior={value:answer(summary,{searches:[{tool:'gemini',query,limit:1}]}),visited:[brief.website],
  lookupReceipts:[{tool:'gemini',query,limit:3,issue:'budget_limit'}],lookedUp:[hash(['gemini',query,3])]};
 assert.equal(plannedBrandActions(packet(),prior).searches.length,1);
 assert.equal(brandDiscoveryNeedsWork({packet:packet(),brandDiscovery:prior}),true);
 for(const issue of ['budget_uncertain','budget_pending','provider_timeout']){
  const saved={...prior,lookupReceipts:[{tool:'gemini',query,limit:3,issue}]};
  assert.deepEqual(plannedBrandActions(packet(),saved).searches,[],'Ambiguous or running work cannot be repurchased');
 }
});

test('a follow-up request is smaller than resending its already-reviewed source bodies',()=>{
 const views=Array.from({length:4},(_,index)=>({url:'https://brand.example/page-'+index,title:'Corporate source '+index,
  excerpts:Array.from({length:3},()=>('Recorded company product and operating information. ').repeat(10)),links:[]}));
 const first=brandReviewContext({brand,sources:views.slice(0,3),hints:[],lookupReceipts:[],readReceipts:[],visited:new Set()});
 const second=brandReviewContext({brand,sources:views,hints:[],lookupReceipts:[],readReceipts:[],visited:new Set(),prior:{brandReview:first.state}});
 const compact={sources:second.sources,retainedSources:second.retainedSources,priorUnderstanding:summary};
 const repeated={sources:views,priorUnderstanding:summary};
 assert.ok(Buffer.byteLength(JSON.stringify(compact))<Buffer.byteLength(JSON.stringify(repeated))/2);
 assert.equal(second.sources.length,1);assert.equal(second.state.sources.length,4);
});

test('a different provider can still answer the same focused question after an unavailable search',async()=>{
 const query='Example Brand official identity';
 const f=fixture((input,index)=>{
  if(index===1)return answer(summary,{searches:[{tool:'gemini',query,limit:1}]});
  if(index===2){assert.equal(input.lookupReceipts[0].issue,'provider_unavailable');return answer(summary,{searches:[{tool:'tavily',query,limit:1}]});}
  assert.deepEqual(input.lookupReceipts,[{query,tool:'tavily',limit:1,issue:'no_results'}]);return answer();
 });
 f.providers.searchGemini=async()=>{f.searches.push({tool:'gemini'});throw new BudgetError('provider_unavailable','Mock outage');};
 const first=await f.run(),second=await f.run(first),third=await f.run(second);
 assert.deepEqual(f.searches.map(row=>row.tool),['gemini','tavily']);assert.equal(third.done,true);
});

test('a failed controller does not mark new pages as reviewed and keeps the last valid understanding',async()=>{
 const f=fixture(()=>answer(summary,{pages:[about]}));
 const first=await f.run();
 f.providers.manager=async()=>{throw new BudgetError('budget_limit','Mock admission refusal');};
 const failed=await f.run(first);
 assert.equal(failed.value.understanding,summary);assert.deepEqual(failed.brandReview,first.brandReview);
 const sources=failed.packet.sources.map(s=>({url:s.finalUrl||s.url,title:s.title,excerpts:s.excerpts.map(e=>e.text),links:[]}));
 const pending=brandReviewContext({brand,sources,hints:[],lookupReceipts:failed.lookupReceipts,readReceipts:failed.readReceipts,
  prior:checkpoint(failed),visited:new Set(failed.visited)});
 assert.ok(pending.sources.some(row=>row.url===about));assert.equal(failed.packet.sources.length,2);
});

test('stored publisher identity remains available when its original page body is omitted',async()=>{
 const alternate='https://brand-other.example/contact',legalName='Example Products Ltd',address='12 Example Road, London SW1A 1AA';
 const quote=`Site operator: ${legalName}. Registered office: ${address}.`;
 const original={...packet(),sources:[page(brief.website,quote,{technicalSignals:{identityLinks:[{url:alternate,label:'Corporate'}]}})]};
 const owner=url=>({website:new URL(url).origin+'/',sourceUrl:url,legalName,address,quote});
 let count=0;
 const providers={managedBudgetVersion:24,manager:async(_stage,input,contract)=>{
  count++;
  if(count===2){assert.deepEqual(input.sources.map(s=>s.url),[alternate]);assert.equal(input.priorPublishers[0].legalName,legalName);assert.equal(input.priorPublishers[0].quote,undefined);}
  const data=answer(summary,{pages:count===1?[alternate]:[],publishers:[owner(count===1?brief.website:alternate)]});
  assertSchema(data,contract);return {data};
 }};
 const first=await understandScopedBrand({brief,packet:original,providers});
 const next=await understandScopedBrand({brief,packet:first.packet,prior:checkpoint(first),providers,
  readPages:async()=>({sources:[page(alternate,quote)]})});
 assert.deepEqual([...brandPublisherHosts(brief.website,next.packet)],['brand.example','brand-other.example']);
 assert.equal(next.packet.publisherIdentities.length,2);
});

test('invalid or foreign review metadata falls back to full source context',()=>{
 const sources=[{url:brief.website,title:'Brand',excerpts:[homeText],links:[]}];
 const fresh=brandReviewContext({brand,sources,hints:[],lookupReceipts:[],readReceipts:[],visited:new Set()});
 for(const state of [{...fresh.state,sources:[null]},{...fresh.state,readCount:999},{...fresh.state,subject:'another-brand'}]){
  const result=brandReviewContext({brand,sources,hints:[],lookupReceipts:[],readReceipts:[],visited:new Set(),
   prior:{brandReview:state,value:answer()}});
  assert.equal(result.sources.length,1);
  if(state.subject==='another-brand')assert.equal(result.canReuseUnderstanding,false);
 }
});

test('stale completed brand requests skip both another model call and worker metering',async()=>{
 const f=fixture(()=>answer(summary,{pages:[about]}));
 const first=await f.run(),second=await f.run(first),prior={packet:second.packet,brandUnderstanding:{understanding:summary},brandDiscovery:checkpoint(second)};
 assert.equal(brandDiscoveryNeedsWork(prior),false);
 const result=await runMeteredBhsPhase({phase:'brand_draft'},
  {brief,phase:'brand_draft',researchVersion:'v8',providers:{managedBudgetVersion:24},
   ledger:{get:async()=>({value:prior}),status:()=>assert.fail('No compute reservation is needed')}},
  {meter:()=>assert.fail('No metered worker for already-processed brand work'),runStage:()=>f.run(second)});
 assert.equal(result.done,true);assert.equal(f.calls.length,2);
});

test('new brand evidence and one-time failed-page feedback still receive their normal funded evaluation',async()=>{
 const cases=[
  {value:answer(summary,{pages:[about]}),visited:[brief.website]},
  {value:answer(summary,{pages:['https://unknown.example/']}),visited:[brief.website]}
 ];
 for(const discovery of cases){
  const prior={packet:packet(),brandDiscovery:discovery};let metered=0;
  assert.equal(brandDiscoveryNeedsWork(prior),true);
  const result=await runMeteredBhsPhase({phase:'brand_sources'},
   {brief,phase:'brand_sources',researchVersion:'v8',phaseCeiling:3000,providers:{managedBudgetVersion:24},
    ledger:{get:async()=>({value:prior}),status:async()=>({chargedKurus:500,capKurus:5000})}},
   {meter:async({run})=>{metered++;return run();},runStage:async()=>({evaluated:true})});
  assert.equal(metered,1);assert.equal(result.evaluated,true);
 }
 assert.equal(brandDiscoveryNeedsWork({brandDiscovery:{value:answer()}}),true,'An incomplete checkpoint must not bypass its stage');
});

test('completed brand snapshots advance freely but brief understanding remains a separate model call',async()=>{
 const stages=new Map(),metered=[],reads=[],calls=[];
 const scope={market:'United Kingdom',audience:'Nurseries',objective:'A nursery sales pilot',fulfilment:'local',
  decisions:[{id:'pilot',decision:'How should the sales pilot work?',field:'goals',quote:brief.goals}]};
 const providers={collectionFirst:true,managedAudit:true,managedBudgetVersion:24,withCeiling(){return this;},
  manager:async(stage,input,contract)=>{
   calls.push(stage);
   if(stage==='bhs-scoped-brand'){
    assert.equal(input.card,undefined);assert.equal(input.brief,undefined);
    const data=answer(summary,{pages:calls.length===1?[about]:[]});assertSchema(data,contract);return {data};
   }
   assert.equal(stage,'bhs-scoped-brief');assert.equal(input.card.goals,brief.goals);assert.equal(input.identity.understanding,summary);
   const data={understanding:'The selected brief is a UK nursery sales pilot.',scope};assertSchema(data,contract);return {data};
  }};
 const phases=sequentialPhases.slice(0,sequentialPhases.indexOf('brand')+1);
 for(const phase of phases){
  const index=sequentialPhases.indexOf(phase);
  const options={brief,phase,providers,researchVersion:'v8',phaseCeiling:3000,
   ledger:{get:async()=>({value:stages.get(sequentialPhases[index-1])}),status:async()=>({chargedKurus:500,capKurus:5000})},
   previous:async name=>stages.get(name),collect:async(_brief,_plan,{prioritySources:[url]})=>{
    reads.push(url);return {...packet(),sources:[url===brief.website?home:page(url,'The company produces play equipment and supplies nurseries.')]};
   }};
  stages.set(phase,await runMeteredBhsPhase({phase},options,{meter:async({run})=>{metered.push(phase);return run();},runStage:runSequentialStage}));
 }
 assert.deepEqual(calls,['bhs-scoped-brand','bhs-scoped-brand','bhs-scoped-brief']);
 assert.deepEqual(reads,[brief.website,about]);assert.deepEqual(metered,['brand_plan','brand_sources','brand']);
 assert.equal(stages.get('brand').brandUnderstanding.understanding,summary);
 assert.equal(stages.get('brand').briefUnderstanding.scope.market,'United Kingdom');
 assert.equal(stages.get('brand').packet.sources.length,2);
});
