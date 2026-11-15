import assert from 'node:assert/strict';
import test from 'node:test';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {sequentialPhases} from '../src/bhs/sequential-contracts.mjs';
import {runSequentialStage} from '../src/bhs/sequential-research.mjs';
import {reviewScopedResearch,scopedEvidence} from '../src/bhs/scoped-research.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {actorInput} from '../src/bhs/apify-inputs.mjs';
import {BudgetError} from '../src/budget/ledger.mjs';
import {writeScopedSynthesis} from '../src/bhs/collection-first.mjs';
import {createSequentialProviders} from '../src/bhs/sequential-providers.mjs';
import {quoteSearch} from '../src/budget/ledger.mjs';
import {reserveStageQuote} from '../src/bhs/supervised-providers.mjs';

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
const about='https://marque.fr/our-story';
const draft=overrides=>({approve:false,newNeeds:[],decisions:[],commands:[],peers:[],...overrides});

test('Claude plans scoped research after brand and brief, then writes and transfers a partial report with the saved evidence',async()=>{
 const saved=new Map(),calls=[];
 let reviewCount=0;
 const providers={collectionFirst:true,managedAudit:true,managedBudgetVersion:10,
  claudeManager:async(stage,input)=>{
   calls.push(stage);
   if(stage==='bhs-scoped-brand'){
    assert.equal(input.card,undefined);
    assert.equal(input.brief,undefined);
    if(!input.priorUnderstanding)return {data:{...identity,pages:[about],searches:[]}};
    assert.ok(input.sources.some(s=>s.url===about));
    return {data:{...identity,pages:[],searches:[]}};
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
    const scrape={id:'t1',tool:'apify/instagram-scraper',url:instagram,query:'',mode:'posts',limit:10};
    if(reviewCount===2)assert.deepEqual(input.previous.find(r=>r.missingDefaults)?.missingDefaults,['gemini']);
    return {data:draft({decisions,commands:reviewCount===2?[{...scrape,tool:'gemini',query:needs[1].query}]:reviewCount<=3?[scrape]:[]})};
   }
   if(stage==='bhs-scoped-clearance')return {data:draft({})};
   assert.equal(stage,'bhs-scoped-report');
   assert.equal(input.sections,undefined);
   assert.equal(input.approved,false);
   assert.ok(input.coverage.every(m=>m.status==='open'));
   assert.ok(Object.values(input.sources).some(row=>row[0]===post));
   assert.ok(Object.values(input.sources).some(row=>row[0]==='https://publisher.fr/extra'));
   const proof=Object.entries(input.sources).find(([,row])=>row[0]==='https://publisher.fr/wholesale')[0];
   return {model:'claude-sonnet-5-5',data:{findings:[{section:'Dağıtım hazırlığı',area:'',rank:1,quadrant:'none',peerId:'',
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
   assert.equal(need.quantity,10);
   if(need.id==='t1'){
    assert.equal(need.since,'2026-10-16');
    assert.equal(need.query,needs[1].query);
    return {results:[]};
   }
   assert.equal(need.query,needs[0].query);
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
    const [url]=options.prioritySources;
    if(url===brief.website)return {...packet,sources:[{...packet.sources[0],technicalSignals:{navigation:[{url:about,label:'Our story'}]}}]};
    return {...packet,sources:url===about?[{...packet.sources[0],url,finalUrl:url}]:[]};
   }}));
 }
 assert.deepEqual(calls.slice(0,4),['bhs-scoped-brand','bhs-scoped-brand','bhs-scoped-brief','bhs-scoped-plan']);
 assert.ok(calls.indexOf('tavily')<calls.indexOf('gemini'));
 assert.equal(calls.filter(c=>c==='scraper').length,1);
 assert.equal(calls.filter(c=>c==='gemini-search').length,2);
 assert.ok(calls.indexOf('gemini')<calls.indexOf('scraper'));
 const synthesis=saved.get('synthesis');
 assert.equal(calls.at(-1),'bhs-scoped-report');
 assert.equal(synthesis.supervision.researchApproved,false);
 assert.equal(synthesis.supervision.metricCoverage.find(m=>m.id==='t1').status,'open');
 assert.equal(synthesis.model,'claude-sonnet-5-5');
 const result=directAuditResult(brief,synthesis);
 assert.equal(result.status,'review');
 assert.equal(result.data.report.bhsSections.find(s=>s.id==='Dağıtım hazırlığı').count,1);
 assert.equal(result.data.report.bhsSections.find(s=>s.id==='Dağıtım hazırlığı').complete,true);
 assert.match(result.data.report.findings[0].recommendation.action,/Katalogdan/);
 assert.equal(result.data.report.meetingQuestions[0].question,'Katalogla hangi Fransız zincirlerine ulaşıldı?');
});

test('new needs start with Tavily and Gemini and Claude can confirm a metric with one adequate source',async()=>{
 const identified={...needs[0],quantity:2};
 const newNeed={...needs[1],id:'new1',first:'both'};
 const plan={needs:[identified,...needs.slice(1)]};
 const original=needs.map(n=>({id:n.id,defaultAttempt:true,urls:['https://publisher.fr/'],facts:[{
  id:'q'+n.id,item:n.section,url:'https://publisher.fr/',quote,title:'Publisher',method:'extracted'
 }]}));
 const calls=[];
 const providers={
  claudeManager:async()=>({data:draft({approve:true,newNeeds:[newNeed],decisions:original.map(r=>({id:r.id,sufficient:true,proofs:[r.facts[0].id]})),
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
 assert.equal(coverage.coverage.find(row=>row.id===identified.id).status,'confirmed');
});

test('Instagram receives the requested date and sample size',()=>{
 const selected=actorInput({actor:'apify/instagram-scraper',url:instagram,since:'2026-10-16',maxResults:10},
  {brief,packet,searches:[{results:[{url:instagram}]}]});
 assert.equal(selected.input.onlyPostsNewerThan,'2026-10-16');
 assert.equal(selected.input.resultsLimit,10);
 assert.throws(()=>actorInput({actor:'apify/instagram-scraper',url:instagram,since:'2026-10-16',maxResults:15,exactScope:true},
  {brief,packet,searches:[{results:[{url:instagram}]}]}),{code:'actor_scope_unsupported'});
});

test('an explicit gap run reuses completed research and dispatches only a new task in the requested section',async()=>{
 const existing=[['readiness','Marque has a French wholesale catalogue.',null,null]];
 const newNeed={...needs[0],id:'regional',first:'tavily',query:'grossistes régionaux catalogue alimentaire Marque France'};
 const repeated={...needs[0],id:'duplicate'};
 const outOfScope={...needs[1],id:'other',query:'Different Instagram account'};
 const calls=[];
 const providers={claudeManager:async(_,input)=>{
  assert.deepEqual(input.existing,existing);
  assert.deepEqual(input.eligibleSections,['readiness']);
  return {data:draft({newNeeds:[repeated,newNeed,outOfScope]})};
 },search:async query=>{
  calls.push(query);
  return {results:[]};
 }};
 const plan={needs};
 const saved={approved:true,decisions:[],receipts:[]};
 const round=await reviewScopedResearch({identity,briefUnderstanding,plan,rounds:[saved],providers,brief,packet,
  readPages:async()=>({sources:[]}),eligibleSections:['readiness'],existing,gap:true});
 assert.deepEqual(calls,[newNeed.query]);
 assert.deepEqual(round.newNeeds,[newNeed]);
 assert.equal(scopedEvidence({packet},plan,[saved,round]).approved,false);
});

test('a provider outage allows the configured Gemini handoff to write from the existing evidence',async()=>{
 const synthesis=await writeScopedSynthesis({brief,brand:{packet,facts:[],brandUnderstanding:identity,briefUnderstanding},plan:{needs,scopedResearch:true},rounds:[],
  providers:{modelHandoff:true,claudeManager:async()=>assert.fail('single-provider route bypasses handoff'),manager:async(stage,input)=>{
   assert.equal(stage,'bhs-scoped-report');
   assert.equal(input.approved,false);
   assert.ok(Object.values(input.sources).some(source=>source[0]===brief.website));
   return {model:'gemini-3.8-flash',providerHandoff:{from:'claude',to:'gemini'},data:{findings:[],questions:['Son satış kanalının verisi paylaşılabilir mi?']}};
  }}});
 assert.equal(synthesis.supervision.reportModel,'gemini-3.8-flash');
 assert.deepEqual(synthesis.supervision.reportHandoff,{from:'claude',to:'gemini'});
 assert.equal(synthesis.report.meetingQuestions[0].question,'Son satış kanalının verisi paylaşılabilir mi?');
});

test('an affordable open need prevents approval and uses Claude’s saved focused query when the controller gives no command',async()=>{
 const plan={needs:[needs[0]],reportOnlyAfterResearch:true};
 const searched=[];
 const providers={claudeManager:async(_,input)=>{
  assert.match(input.instruction,/araştırma çağrısı bütçeye sığıyorsa yazıma geçme/);
  return {data:draft({approve:true})};
 },researchCapacity:async()=>({remainingKurus:100,defaults:['tavily'],configuredDefaults:['tavily'],actors:[]}),
 search:async(query,options)=>{searched.push([query,options.maxResults]);return {results:[]};}};
 const execution={identity,briefUnderstanding,plan,providers,brief,packet,readPages:async()=>({sources:[]})};
 const first=await reviewScopedResearch({...execution,rounds:[]});
 assert.equal(first.approved,false);
 assert.equal(first.closed,false);
 assert.deepEqual(searched,[[needs[0].query,10]]);
 const duplicate=await reviewScopedResearch({...execution,rounds:[first]});
 assert.equal(duplicate.closed,false);
 assert.equal(searched.length,1);
});

test('an unaffordable controller does not close research while a focused provider call fits',async()=>{
 const plan={needs:[needs[0]],reportOnlyAfterResearch:true};
 const providers={claudeManager:async()=>{throw new BudgetError('budget_limit','model reservation');},
  researchCapacity:async()=>({remainingKurus:62,defaults:['tavily'],configuredDefaults:['tavily','gemini'],actors:[]}),
  search:async()=>({results:[]})};
 const round=await reviewScopedResearch({identity,briefUnderstanding,plan,rounds:[],providers,brief,packet,readPages:async()=>({sources:[]})});
 assert.equal(round.closed,false);
 assert.equal(round.receipts[0].attempts[0].tool,'tavily');
});

test('synthesis accepts an incomplete report only after the research budget closes',async()=>{
 const plan={needs:[needs[0]],scopedResearch:true,adaptiveResearch:true,reportOnlyAfterResearch:true};
 let written=0;
 const providers={claudeManager:async(stage,input)=>{
  if(stage==='bhs-scoped-review')return {data:draft({})};
  written++;
  assert.equal(stage,'bhs-scoped-report');
  assert.equal(input.coverage[0].status,'open');
  return {model:'claude-sonnet-5-5',data:{findings:[],questions:[]}};
 },researchCapacity:async()=>({remainingKurus:61,defaults:[],configuredDefaults:['tavily','gemini'],actors:[]})};
 const args={brief,brand:{packet,facts:[],brandUnderstanding:identity,briefUnderstanding},plan,providers};
 await assert.rejects(writeScopedSynthesis({...args,rounds:[{closed:true,issue:'no_executable_research_command'}]}),{code:'research_needs_open'});
 assert.equal(written,0);
 const round=await reviewScopedResearch({identity,briefUnderstanding,plan,rounds:[],providers,brief,packet,readPages:async()=>({sources:[]})});
 assert.equal(round.closed,true);
 assert.equal(round.stopReason,'research_budget_exhausted');
 await writeScopedSynthesis({...args,rounds:[round]});
 assert.equal(written,1);
});

test('research affordability uses the actual Tavily reservation and the research ceiling',async()=>{
 const reservation=reserveStageQuote(quoteSearch('basic'));
 let chargedKurus=3000-reservation;
 const ledger={status:async()=>({capKurus:5000,chargedKurus})};
 const providers=createSequentialProviders({ledger,phase:'report_draft',phaseLimitKurus:3000,
  geminiKey:'test-gemini',tavilyKey:'test-tavily',apify:{availableActors:async()=>[]},
  fetchImpl:async()=>assert.fail('affordability must not start a provider call')});
 assert.deepEqual((await providers.researchCapacity()).defaults,['tavily']);
 chargedKurus++;
 assert.deepEqual((await providers.researchCapacity()).defaults,[]);
});
