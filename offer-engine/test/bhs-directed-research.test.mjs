import test from 'node:test';
import assert from 'node:assert/strict';
import {actorInput} from '../src/bhs/apify-inputs.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {managedCollectionContext,readResearchPages,expandDirectedSources} from '../src/bhs/collection-first.mjs';
import {planDirectedResearch,executeDirectedResearch} from '../src/bhs/directed-research.mjs';
import {managedReportInput,synthesizeManagedReport} from '../src/bhs/managed-report.mjs';
import {planPositionalEvidenceReview} from '../src/bhs/managed-evidence-review.mjs';
import {resolveManagedGaps} from '../src/bhs/managed-gaps.mjs';
import {BudgetError} from '../src/budget/ledger.mjs';
import {localBudget} from './fixtures/local-budget.mjs';

const site='https://brand.example/';
const profile='https://www.instagram.com/example/';
const rival='https://rival.example/produits/';
const brief=snapshotBrief({brandName:'Example',website:site,segment:'corporate',goals:'Fransa pazarına giriş',needs:'Fransa dağıtım ve rakipleri',services:'Büyüme',meetingNotes:''});
const task={id:'market',section:'competition',market:'France',platform:'French grocery',question:'Which comparable products are listed?',metrics:['retail price per unit','local distribution'],acceptance:'Product page for comparable food in French retail'};
const understanding={business:'grocery',revenue:'retail',scale:'unknown',sector:'food',goals:'France',requirements:['distribution']};
const blank={country:'FR',language:'fr',query:'',url:'',mode:'default',limit:4};
const command=(tool,properties)=>({...blank,taskId:'market',tool,...properties});
const brand={facts:[],plan:{},packet:{entities:[{id:'brand',role:'brand',name:'Example',website:site}],asOf:'2026-11-14',sources:[{
 url:site,finalUrl:site,title:'Example',method:'html',excerpts:[{text:'Example sells packaged food through its online store.'}],
 technicalSignals:{navigation:[{url:profile,label:'Instagram'}]}
}]}};

test('Claude scopes France search and precise scraper requests, then chooses a publisher when Tavily fails',async()=>{
 const planData={understanding,market:'France',tasks:[task],peers:[],assets:[],questions:[],commands:[
  command('tavily',{query:'prix snacks France distribution'}),
  command('apify/instagram-scraper',{url:profile,mode:'posts',limit:12}),
  command('gemini',{})
 ]};
 let searchActive=false,scrapeActive=false;
 const providers={
  availableActors:async()=>['apify/instagram-scraper'],
  manager:async(stage,request,schema,options)=>{
   if(stage==='bhs-directed-plan')return {data:options.normalizeData(planData)};
   assert.equal(request.plan.tasks[0].metrics[0],'retail price per unit');
   assert.ok(request.history.some(row=>row[3]==='provider_error'));
   assert.ok(request.observedUrls.includes(rival));
   return {data:options.normalizeData({commands:[command('direct',{url:rival})],peers:[{name:'Rival',url:rival,overlap:'French packaged food'}],assets:[],questions:[]})};
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
 const first=await executeDirectedResearch({brief,brand,providers,plan,decision:plan,readPages:()=>assert.fail('read was not requested')});
 assert.equal(first.extractions.length,1);
 const decision=await planDirectedResearch({brief,brand,providers,plan,rounds:[first]});
 const result=await executeDirectedResearch({brief,brand,providers,plan,decision,rounds:[first],readPages:async urls=>{
  assert.deepEqual(urls,[rival]);
  return {sources:[{url:rival,finalUrl:rival,title:'Rival',excerpts:[{text:'Rival sells packaged food in France.'}]}]};
 }});
 assert.equal(result.peerHints[0].website,rival);
 assert.equal(result.pages[0].taskId,task.id);
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

test('the model writes its own source-linked analysis and gaps are retained without mandatory measurement text',async()=>{
 const context=managedCollectionContext(brief,brand.packet,{complete:true});
 const plan={directedResearch:true,coveragePolicy:2,tasks:[task],understanding,market:'France',assets:[],questions:[]};
 const {input}=managedReportInput({brief,brand,plan,context,inventory:[]});
 const ids=Object.keys(input.sources);
 const result=await synthesizeManagedReport({brief,brand,plan,context,inventory:[],sections:['readiness'],
  batchReviews:[{ids,candidates:ids,verdicts:'r'.repeat(ids.length)}],
  providers:{manager:async(_stage,request)=>({data:{findings:[{
   section:'readiness',area:'operations_1',rank:1,quadrant:'none',peerId:'',
   observation:'Example sells packaged food through its online store.',proof:[Object.keys(request.sources)[0]],kind:'observation',
   analysis:'French distribution may require a different fulfilment partner.',action:'Compare local delivery terms with a French distributor.',measurement:'',limitation:'',question:'Which shipments can be fulfilled locally?'
  }],peers:[],questions:[]}})},allowPartial:true,sectional:true});
 assert.equal(result.report.findings.length,1);
 assert.equal(result.report.findings[0].recommendation.measurement,'');
 assert.equal(result.report.bhsSections.find(section=>section.id==='readiness').count,1);
 assert.equal(result.report.bhsSections.find(section=>section.id==='readiness').complete,false);
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
