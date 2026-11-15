import assert from 'node:assert/strict';
import test from 'node:test';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {sequentialPhases} from '../src/bhs/sequential-contracts.mjs';
import {runSequentialStage} from '../src/bhs/sequential-research.mjs';
import {reviewScopedResearch,scopedEvidence} from '../src/bhs/scoped-research.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {actorInput} from '../src/bhs/apify-inputs.mjs';
import {BudgetError} from '../src/budget/ledger.mjs';

const brief=snapshotBrief({brandName:'Marque',website:'https://marque.fr/',segment:'corporate',goals:'Fransa pazarı ve aktif dağıtıcıları',services:'Growth',needs:'Dağıtım',meetingNotes:''});
const identity={understanding:'Marque SAS gıda üreticisi. Türkiye’de perakende kanalına satış yapıyor.'};
const briefUnderstanding={understanding:'Marka Fransa’ya girmek istiyor. Teklif aktif dağıtıcı araştırmasını kapsamalı.'};
const needs=[{section:'readiness',id:'t0',target:'Marque ürünleri',market:'Fransa',metric:'Aktif distribütörler',
 expected:'Ürün grubu ile uyumlu distribütör',period:'',quantity:10,query:'distributeurs actifs alimentation France marque',country:'FR',language:'fr',first:'both',since:''},
 {section:'digital',id:'t1',target:'Marque',market:'Fransa',metric:'Son 30 günün etkileşimi',expected:'Tarihli gönderi etkileşimleri',period:'Son 30 gün',
 quantity:10,query:'Marque Instagram son 30 gün etkileşim',country:'FR',language:'fr',first:'tavily',since:'2026-10-16'}];
const packet={version:'sellf-evidence-v1',asOf:'2026-11-15',entities:[{id:'brand',role:'brand',name:'Marque',website:brief.website}],
 sources:[{id:'ev1',url:brief.website,finalUrl:brief.website,title:'Marque',method:'html',excerpts:[{id:'a',text:'Marque produces packaged groceries and distributes to supermarkets in France.',offset:0}]}]};
const instagram='https://www.instagram.com/marque/';
const post='https://www.instagram.com/p/known/';
const quote='Marque runs a direct wholesale catalogue for supermarket customers in France.';
const postQuote='PublishedAt 2026-11-10 likesCount 84 commentsCount 6.';
const draft=overrides=>({approve:false,newNeeds:[],decisions:[],commands:[],peers:[],...overrides});

test('Claude plans scoped research after brand and brief, then writes and transfers a partial report with the saved evidence',async()=>{
 const saved=new Map(),calls=[];
 let reviewCount=0;
 const providers={collectionFirst:true,managedAudit:true,managedBudgetVersion:9,
  claudeManager:async(stage,input)=>{
   calls.push(stage);
   if(stage==='bhs-scoped-brand'){
    assert.equal(input.card,undefined);
    assert.equal(input.brief,undefined);
    return {data:identity};
   }
   if(stage==='bhs-scoped-brief'){
    assert.deepEqual(input.identity,identity);
    assert.equal(input.card.goals,brief.goals);
    return {data:briefUnderstanding};
   }
   if(stage==='bhs-scoped-plan'){
    assert.deepEqual(input.briefUnderstanding,briefUnderstanding);
    assert.equal(input.asOf,'2026-11-15');
    return {data:{needs}};
   }
   if(stage==='bhs-scoped-review'){
    reviewCount++;
    const decisions=[{id:'t0',proofs:input.findings.filter(f=>f.needId==='t0'&&!f.preliminary).map(f=>f.id)}];
    return {data:draft({
     decisions,commands:reviewCount===1?[{id:'t1',tool:'apify/instagram-scraper',url:instagram,query:'',mode:'posts',limit:10}]:[]
    })};
   }
   if(stage==='bhs-scoped-clearance')return {data:draft({})};
   assert.equal(stage,'bhs-scoped-report');
   assert.equal(input.approved,false);
   assert.ok(input.coverage.every(m=>m.status==='open'));
   assert.ok(Object.values(input.sources).some(row=>row[0]===post));
   assert.ok(Object.values(input.sources).some(row=>row[0]==='https://publisher.fr/extra'));
   const proof=Object.entries(input.sources).find(([,row])=>row[0]==='https://publisher.fr/wholesale')[0];
   return {model:'claude-sonnet-5-5',data:{findings:[{section:'readiness',area:'operations_1',rank:1,quadrant:'none',peerId:'',
    observation:'Marque Fransa’daki süpermarketler için toptan satış kataloğu sunuyor.',proof:[proof],kind:'observation',
    analysis:'Katalog, distribütör görüşmelerinde ürün uygunluğunu değerlendirmek için başlangıç sağlar.',
    action:'Katalogdan Fransız süpermarketlerle ürün örtüşmesini kontrol et.',measurement:'Dağıtıcıların kategori listesinde eşleşen ürünleri kaydet.',
    limitation:'Ürünlerin raf performansı doğrulanmadı.',question:'Katalogla hangi Fransız zincirlerine ulaşıldı?'}],peers:[],benchmarks:[],questions:[],invalidObservations:[]}};
  },
  search:async(query,options)=>{
   calls.push('tavily');
   assert.equal(options.countryCode,'FR');
   assert.equal(options.language,'fr');
   assert.equal(options.maxResults,10);
   if(query.includes('Instagram')){
    assert.equal(options.since,'2026-10-16');
    return {results:[{url:instagram,title:'Marque',content:quote}]};
   }
   throw Object.assign(new BudgetError('provider_error','Tavily unavailable'),{providerStatus:433});
  },
  searchGemini:async(need)=>{
   calls.push('gemini-search');
   assert.equal(need.query,needs[0].query);
   assert.equal(need.quantity,10);
   return {results:[{url:'https://publisher.fr/wholesale',title:'Wholesale',content:quote},
    {url:'https://publisher.fr/extra',title:'Extra',content:'Marque maintains a separate case packing catalogue for regional wholesale.'}]};
  },
  geminiWorker:async(stage,{requests})=>{
   assert.equal(stage,'bhs-scoped-extract');
   calls.push('gemini');
   return {data:{results:requests.flatMap(({need,sources})=>need.id==='t1'&&!sources.some(s=>s.url===post)?[]:[
    {id:need.id,facts:sources.length?[{proof:sources[0].proof,item:need.section,quote:need.id==='t1'?postQuote:quote}]:[],nextQuery:''}
   ])}};
  },
  availableActors:async()=>['apify/instagram-scraper'],
  enrich:async(request)=>{
   calls.push('scraper');
   assert.equal(request.url,instagram);
   assert.equal(request.maxResults,10);
   assert.equal(request.since,'2026-10-16');
   return {status:'complete',pages:[{url:post,text:postQuote}]};
  }
 };
 for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('synthesis')+1)){
  saved.set(phase,await runSequentialStage({phase,brief,providers,previous:async name=>saved.get(name),
   collect:async(_brief,_plan,options)=>{
    assert.equal(options.archivePages,undefined);
    return options.prioritySources[0]===brief.website?packet:{...packet,sources:[]};
   }}));
 }
 assert.deepEqual(calls.slice(0,3),['bhs-scoped-brand','bhs-scoped-brief','bhs-scoped-plan']);
 assert.ok(calls.indexOf('tavily')<calls.indexOf('gemini'));
 assert.equal(calls.filter(c=>c==='scraper').length,1);
 assert.ok(calls.indexOf('gemini')<calls.indexOf('scraper'));
 const synthesis=saved.get('synthesis');
 assert.equal(calls.at(-1),'bhs-scoped-report');
 assert.equal(synthesis.supervision.researchApproved,false);
 assert.equal(synthesis.supervision.metricCoverage.find(m=>m.id==='t1').status,'open');
 assert.equal(synthesis.model,'claude-sonnet-5-5');
 const result=directAuditResult(brief,synthesis);
 assert.equal(result.status,'review');
 assert.equal(result.data.report.bhsSections.find(s=>s.id==='readiness').count,1);
 assert.match(result.data.report.findings[0].recommendation.action,/Katalogdan/);
 assert.equal(result.data.report.meetingQuestions[0].question,'Katalogla hangi Fransız zincirlerine ulaşıldı?');
});

test('new needs start with Tavily and Gemini and Claude can confirm only the required number of distinct source-backed items',async()=>{
 const identified={...needs[0],quantity:2};
 const newNeed={...needs[1],id:'new1',first:'both'};
 const plan={needs:[identified,...needs.slice(1)]};
 const original=needs.map(n=>({id:n.id,defaultAttempt:true,urls:['https://publisher.fr/'],facts:[{
  id:'q'+n.id,item:n.section,url:'https://publisher.fr/',quote,title:'Publisher',method:'extracted'
 }]}));
 const calls=[];
 const providers={
  claudeManager:async()=>({data:draft({approve:true,newNeeds:[newNeed],decisions:original.map(r=>({id:r.id,proofs:[r.facts[0].id,r.facts[0].id]})),
   commands:[{id:'new1',tool:'apify/instagram-scraper',query:'',url:instagram,mode:'posts',limit:3}]})}),
  availableActors:async()=>['apify/instagram-scraper'],
  enrich:async()=>assert.fail('scraper cannot run before a new need has used its defaults'),
  search:async()=>{calls.push('tavily');return {results:[]};},
  searchGemini:async()=>{calls.push('gemini-search');return {results:[]};},
  geminiWorker:async()=>{calls.push('gemini');return {data:{results:[]}};}
 };
 const round=await reviewScopedResearch({identity,briefUnderstanding,plan,rounds:[{receipts:original}],providers,brief,packet,readPages:async()=>({sources:[]})});
 assert.deepEqual(calls,['tavily','gemini-search']);
 assert.equal(round.newNeeds[0].id,'new1');
 const coverage=scopedEvidence({packet},plan,[{receipts:original},round]);
 assert.equal(coverage.approved,false);
 assert.equal(coverage.coverage.find(row=>row.id===identified.id).status,'open');
});

test('Instagram receives the requested date and sample size',()=>{
 const selected=actorInput({actor:'apify/instagram-scraper',url:instagram,since:'2026-10-16',maxResults:10},
  {brief,packet,searches:[{results:[{url:instagram}]}]});
 assert.equal(selected.input.onlyPostsNewerThan,'2026-10-16');
 assert.equal(selected.input.resultsLimit,10);
});
