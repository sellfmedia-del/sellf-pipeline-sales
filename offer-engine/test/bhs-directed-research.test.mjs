import test from 'node:test';
import assert from 'node:assert/strict';
import {actorInput} from '../src/bhs/apify-inputs.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {managedCollectionContext,readResearchPages,expandDirectedSources} from '../src/bhs/collection-first.mjs';
import {planDirectedResearch,executeDirectedResearch} from '../src/bhs/directed-research.mjs';
import {managedReportInput,synthesizeManagedReport} from '../src/bhs/managed-report.mjs';
import {planPositionalEvidenceReview,reviewPositionalEvidenceBatch} from '../src/bhs/managed-evidence-review.mjs';
import {resolveManagedGaps} from '../src/bhs/managed-gaps.mjs';
import {BudgetError} from '../src/budget/ledger.mjs';
import {localBudget} from './fixtures/local-budget.mjs';
import {runSequentialStage} from '../src/bhs/sequential-research.mjs';
import {sequentialPhases} from '../src/bhs/sequential-contracts.mjs';

const site='https://brand.example/';
const profile='https://www.instagram.com/example/';
const rival='https://rival.example/produits/';
const brief=snapshotBrief({brandName:'Example',website:site,segment:'corporate',goals:'Fransa pazarına giriş',needs:'Fransa dağıtım ve rakipleri',services:'Büyüme',meetingNotes:''});
const task={id:'market',section:'competition',market:'France',platform:'French grocery',question:'Which comparable products are listed?',metrics:['retail price per unit','local distribution'],acceptance:'Product page for comparable food in French retail'};
const understanding={business:'grocery',revenue:'retail',scale:'unknown',sector:'food',goals:'France',requirements:['distribution']};
const blank={country:'fr',language:'FR',query:'',url:'',mode:'default',limit:4};
const command=(tool,properties)=>({...blank,taskId:'market',tool,...properties});
const brand={facts:[],plan:{},packet:{entities:[{id:'brand',role:'brand',name:'Example',website:site}],asOf:'2026-11-14',sources:[{
 url:site,finalUrl:site,title:'Example',method:'html',excerpts:[{text:'Example sells packaged food through its online store.'}],
 technicalSignals:{navigation:[{url:profile,label:'Instagram'}]}
}]}};

test('Claude scopes France search and precise scraper requests, then chooses a publisher when Tavily fails',async()=>{
 const planData={understanding,market:'France',tasks:[task],peers:[],assets:[],questions:[],commands:[
  command('tavily',{query:'prix snacks France distribution'}),
  command('apify/instagram-scraper',{url:profile,mode:'posts',limit:12}),
  command('direct',{url:rival}),command('gemini',{})
 ]};
 let searchActive=false,scrapeActive=false;
 const providers={
  availableActors:async()=>['apify/instagram-scraper'],
  manager:async(stage,request,schema,options)=>{
   if(stage==='bhs-directed-plan')return {data:options.normalizeData(planData)};
   assert.equal(request.plan.tasks[0].metrics[0],'retail price per unit');
   assert.ok(request.history.some(row=>row[3]==='provider_error'));
   assert.ok(request.observedUrls.includes(rival));
   return {data:options.normalizeData({commands:[],peers:[{name:'Rival',url:rival,overlap:'French packaged food'}],assets:[],questions:[]})};
  },
  search:async(query,options)=>{
   assert.equal(query,planData.commands[0].query);
   assert.deepEqual([options.countryCode,options.language,options.maxResults],['FR','fr',4]);
   searchActive=true;
   await new Promise(resolve=>setImmediate(resolve));
   assert.ok(scrapeActive);
   throw new BudgetError('provider_error','Unavailable');
  },
  enrich:async(request,context)=>{
   scrapeActive=true;
   assert.equal(request.url,profile);
   assert.equal(actorInput(request,context).input.resultsLimit,12);
   return {status:'complete',actor:request.actor,pages:[{url:profile,text:'timestamp: 2026-11-13 likesCount: 83'}],
    searches:[{results:[{url:rival,title:'Rival',content:'French retailer product catalogue'}]}]};
  },
  worker:async(_stage,request)=>{
   assert.ok(searchActive&&scrapeActive);
   assert.deepEqual(request.task.metrics,task.metrics);
   assert.ok(request.sources.some(([url])=>url===profile));
   return {data:{observations:[{url:profile,metric:'posting cadence',value:'2026-11-13'}]}};
  }
 };
 const plan=await planDirectedResearch({brief,brand,providers});
 const first=await executeDirectedResearch({brief,brand,providers,plan,decision:plan,readPages:async urls=>{
  assert.deepEqual(urls,[rival]);
  return {sources:[{url:rival,finalUrl:rival,title:'Rival',excerpts:[{text:'Rival sells packaged food in France.'}]}]};
 }});
 assert.equal(first.extractions.length,1);
 const decision=await planDirectedResearch({brief,brand,providers,plan,rounds:[first]});
 const result=await executeDirectedResearch({brief,brand,providers,plan,decision,rounds:[first],readPages:()=>assert.fail('already read')});
 assert.equal(result.peerHints[0].website,rival);
 assert.equal(first.pages[0].taskId,task.id);
});

test('full source is archived and sent to the reviewer in batches including late evidence',async()=>{
 const text=Array.from({length:72},(_,i)=>'Source paragraph '+i+': '+('A public catalogue shows products and pricing from multiple small suppliers in France. ').repeat(25)).join(' ')+' The late distribution evidence identifies the Lyon wholesale outlet open to independent suppliers.';
 const page={url:rival,finalUrl:rival,title:'Rival',text,method:'html'};
 const providers={checkpoint:async(_name,_input,run)=>run()};
 const packet=await readResearchPages(brief,{},[rival],providers,async(_brief,_plan,options)=>{
  await options.archivePages([page]);
  return {sources:[{...page,text:undefined,excerpts:[{text:text.slice(0,1800)}]}]};
 },{complete:true});
 const sources=await expandDirectedSources(packet.sources);
 const context=managedCollectionContext(brief,{...brand.packet,sources},{complete:true});
 const {input}=managedReportInput({brief,brand,plan:{directedResearch:true,coveragePolicy:2},context,inventory:[]});
 const batches=planPositionalEvidenceReview(input);
 assert.ok(batches.length>1);
 assert.ok(batches.some(batch=>Object.values(batch.sources).some(source=>source[3].includes('Lyon wholesale outlet'))));
 assert.equal(new Set(batches.flatMap(batch=>batch.rows.map(row=>row.id))).size,Object.keys(input.sources).length);
});

test('the director receives the initial brand read without running legacy model stages',async()=>{
 const providers={collectionFirst:true,managedBudgetVersion:8,checkpoint:async(_name,_input,run)=>run(),manager:()=>assert.fail('legacy model call')};
 const saved=new Map();
 let reads=0;
 for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('brand')+1)){
  saved.set(phase,await runSequentialStage({phase,brief,providers,previous:async key=>saved.get(key),collect:async(_brief,_plan,options)=>{
   reads++;
   assert.deepEqual(options.prioritySources,[site]);
   return brand.packet;
  }}));
 }
 assert.equal(reads,1);
 const plan=await planDirectedResearch({brief,brand:saved.get('brand'),providers:{manager:async(_stage,request)=>{
  assert.match(request.sources[0][2],/sells packaged food/);
  return {data:{understanding,market:'France',tasks:[task],peers:[],assets:[],questions:[],commands:[]}};
 }}});
 assert.equal(plan.understanding.business,'grocery');
});

test('searches selected for the same actor share an execution and preserve per-task results',async()=>{
 const second={...task,id:'reputation',section:'perception'};
 const engine='themineworks/google-search-scraper';
 const result=await executeDirectedResearch({brief,brand,plan:{tasks:[task,second]},decision:{commands:[
  command(engine,{query:'France own-brand organic snacks',limit:1}),command(engine,{taskId:second.id,query:'Example feedback France',limit:3})
 ]},providers:{enrich:async request=>{
  assert.deepEqual(request.queries,['France own-brand organic snacks','Example feedback France']);
  return {actor:engine,status:'complete',searches:request.queries.map(query=>({query,results:[{url:rival},{url:site}]}))};
 }}});
 assert.deepEqual(result.searches.map(row=>[row.taskId,row.results.length]),[[task.id,1],[second.id,2]]);
});

test('compact evidence decisions retain the exact proof and row ordering',async()=>{
 const rows=[{id:'s2',proof:['s2']},{id:'s1',proof:['s1']}];
 const sources={s1:[site,'Brand','html','A source excerpt about a product range.'],s2:[rival,'Rival','html','The rival sells packaged food in France.']};
 const result=await reviewPositionalEvidenceBatch({rows,sources},{focus:understanding,providers:{managedBudgetVersion:8,
  evidenceReviewer:async(_stage,request,schema,options)=>{
   assert.deepEqual(request.rows,[['s2'],['s1']]);
   assert.equal(schema.properties.verdicts.type,'object');
   return {data:options.normalizeData({verdicts:{u:'s1',c:'s2'},candidates:['s2']})};
  }}});
 assert.deepEqual(result[0].ids,['s2','s1']);
 assert.equal(result[0].verdicts,'cu');
 assert.deepEqual(result[0].candidates,['s2']);
});

test('the model writes its own source-linked analysis and gaps are retained without mandatory measurement text',async()=>{
 const context=managedCollectionContext(brief,brand.packet,{complete:true});
 const plan={directedResearch:true,coveragePolicy:2,tasks:[task],understanding,market:'France',assets:[],questions:[]};
 const {input}=managedReportInput({brief,brand,plan,context,inventory:[]});
 const ids=Object.keys(input.sources);
 const result=await synthesizeManagedReport({brief,brand,plan,context,inventory:[],sections:['readiness'],
  batchReviews:[{ids,candidates:ids,verdicts:'r'.repeat(ids.length)}],
  providers:{manager:async(_stage,request)=>({data:{findings:[{
   area:'operations_1',quadrant:'none',peerId:'',peerOverlap:'',
   observation:'Example sells packaged food through its online store.',proof:[Object.keys(request.sources)[0]],
   analysis:'French distribution may require a different fulfilment partner.',action:'Compare local delivery terms with a French distributor.',question:'Which shipments can be fulfilled locally?'
  }],questions:[]}})},allowPartial:true,sectional:true});
 assert.equal(result.report.findings.length,1);
 assert.equal(result.report.findings[0].recommendation.measurement,'');
 assert.equal(result.report.bhsSections.find(section=>section.id==='readiness').count,1);
 assert.equal(result.report.bhsSections.find(section=>section.id==='readiness').complete,false);
});

test('report writing repairs only gaps with existing evidence',async()=>{
 const delivery={url:site+'delivery',finalUrl:site+'delivery',title:'Delivery',method:'html',excerpts:[{text:'Retail orders are currently fulfilled from Istanbul to domestic addresses.'}]};
 const context=managedCollectionContext(brief,{...brand.packet,sources:[...brand.packet.sources,delivery]},{complete:true});
 const plan={directedResearch:true,coveragePolicy:2,tasks:[task],understanding,market:'France',assets:[],questions:[]};
 const {input}=managedReportInput({brief,brand,plan,context,inventory:[]});
 const ids=Object.keys(input.sources),calls=[];
 const result=await synthesizeManagedReport({brief,brand,plan,context,inventory:[],sections:['readiness'],
  batchReviews:[{ids,candidates:ids,verdicts:'r'.repeat(ids.length)}],providers:{managedBudgetVersion:8,manager:async(stage,request)=>{
   calls.push(stage);
   const repair=stage.endsWith('-repair');
   if(repair){assert.equal(request.wanted,1);assert.equal(request.existing.length,1);}
   return {data:{findings:[{area:'operations_1',quadrant:'none',peerId:'',peerOverlap:'',
    observation:repair?'Retail orders are currently fulfilled from Istanbul to domestic addresses.':'Example sells packaged food through its online store.',proof:[Object.entries(request.sources).find(([,source])=>source[0]===(repair?delivery.url:site))[0]],
    analysis:repair?'Cross-border fulfilment may require another carrier.':'An online channel can support initial demand testing.',
    action:repair?'Compare local delivery terms with a French distributor.':'Run a French product page pilot.',question:''}],questions:[]}};
  }},allowPartial:true,sectional:true});
 assert.deepEqual(calls,['bhs-directed-report-readiness','bhs-directed-report-readiness-repair']);
 assert.equal(result.report.bhsSections.find(section=>section.id==='readiness').complete,true);
});

test('status does not open the additional account and consent reserves no more than 30 TRY',async t=>{
 const original=await localBudget({lead:'directed-base'}),extra=await localBudget({lead:'directed-gap'});
 t.after(original.close);t.after(extra.close);
 await original.ledger.once('normal-run',{},4000,async()=>({}));
 let opened=0;
 const ctx={brief,synthesis:{supervision:{reviewMode:'managed-audit',researchPlan:{directedResearch:true}},report:{findings:[]}},sections:['digital'],
  secret:'test-secret',baseLedger:original.ledger,previous:async()=>{throw new BudgetError('provider_error','fixture');},
  getGapLedger:async()=>{opened++;return extra.ledger;},getProviders:()=>({})};
 const status=await resolveManagedGaps({...ctx,action:'status'});
 assert.equal(status.capKurus,3000);
 assert.equal(opened,0);
 const result=await resolveManagedGaps({...ctx,action:'complete_gaps'});
 assert.equal(result.capKurus,3000);
 assert.equal(result.status,'uncertain');
 assert.equal(opened,1);
 assert.equal((await original.ledger.status()).chargedKurus,4500);
});
