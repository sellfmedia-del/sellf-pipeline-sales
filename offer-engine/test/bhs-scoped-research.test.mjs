import assert from 'node:assert/strict';
import test from 'node:test';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {sequentialPhases} from '../src/bhs/sequential-contracts.mjs';
import {runSequentialStage} from '../src/bhs/sequential-research.mjs';
import {planScopedResearch,reviewScopedResearch,runScopedDefaults,scopedEvidence,understandScopedBrand} from '../src/bhs/scoped-research.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {actorInput} from '../src/bhs/apify-inputs.mjs';
import {BudgetError} from '../src/budget/ledger.mjs';
import {writeScopedSynthesis} from '../src/bhs/collection-first.mjs';
import {createSequentialProviders} from '../src/bhs/sequential-providers.mjs';
import {quoteSearch} from '../src/budget/ledger.mjs';
import {reserveStageQuote} from '../src/bhs/supervised-providers.mjs';
import {sourceLinks} from '../src/bhs/evidence.mjs';
import {workerInfraReservationKurus} from '../src/bhs/job-infrastructure.mjs';

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
const searchQuotes={tavily:62,gemini:1044};
const openingCapacity=remainingKurus=>({remainingKurus,capKurus:3000,quotes:searchQuotes,
 defaults:Object.keys(searchQuotes).filter(t=>searchQuotes[t]<=remainingKurus),configuredDefaults:Object.keys(searchQuotes),actors:[],configuredActors:[]});

test('the active worker covers all ten planned opening topics before a deeper review of any single topic',async()=>{
 const topics=['rakipler','pazar','pazaryeri','fiyat','müşteri deneyimi','Instagram','YouTube','bilinirlik','influencer','reklam maliyeti'];
 const opening=topics.map((section,i)=>({...needs[0],id:'N'+(i+1),section,query:'Açılış: '+section,first:'tavily'}));
 const deeper={...opening[0],id:'D1',query:'Rakip ürün sayfasında ayrıntılı fiyat karşılaştırması'};
 const planNeeds=[opening[0],deeper,...opening.slice(1)];
 const saved=new Map([['brand',{decision:'accepted',collectionFirst:true,packet,facts:[],brandUnderstanding:identity,briefUnderstanding}]]);
 let charged=1300,reviewed=0;
 const dispatched=[],waves=[];
 const providers={collectionFirst:true,managedAudit:true,managedBudgetVersion:15,infrastructureOffsetKurus:300,
  researchCapacity:async()=>openingCapacity(3000-charged),
  manager:async(stage,input)=>{
   if(stage==='bhs-scoped-plan')return {data:{needs:planNeeds}};
   assert.equal(stage,'bhs-scoped-review');
   assert.deepEqual(dispatched,opening.map(n=>n.query));
   assert.deepEqual(input.waitingNeeds,[deeper.id]);
   assert.ok(input.findings.some(f=>f.needId==='N10'));
   reviewed++;
   return {data:draft({commands:[{id:deeper.id,tool:'tavily',query:deeper.query,url:'',mode:'default',limit:3}]})};
  },
  search:async(query,options)=>{
   assert.ok(charged+62<=3000);
   charged+=51;
   assert.equal(options.countryCode,'FR');
   dispatched.push(query);
   return {results:[{url:post,content:postQuote}]};
  }};
 for(const phase of sequentialPhases.slice(sequentialPhases.indexOf('sector_sources'))){
  charged+=300;
  const result=await runSequentialStage({phase,brief,providers,previous:async p=>saved.get(p),collect:()=>assert.fail('unrequested page read')});
  charged-=275;
  saved.set(phase,result);
  if(result.openingSearch)waves.push(result.receipts.map(r=>r.id));
  if(reviewed)break;
 }
 assert.deepEqual(waves,[['N1','N2','N3'],['N4','N5','N6'],['N7','N8','N9'],['N10']]);
 assert.equal(reviewed,1);
 assert.equal(dispatched.at(-1),deeper.query);
 assert.ok(charged<3000);
});

test('an expensive opening preference is deferred when it would crowd out the other opening searches',async()=>{
 const first={...needs[0],first:'gemini'};
 const second={...needs[1],first:'tavily'};
 const plan={orderedResearch:true,reportOnlyAfterResearch:true,targetedEvidence:true,needs:[first,second]};
 const searches=[];
 const providers={managedBudgetVersion:15,infrastructureOffsetKurus:300,
  researchCapacity:async()=>openingCapacity(1100),
  manager:()=>assert.fail('the opening search still fits'),
  searchGemini:()=>assert.fail('retain funding for the two opening topics'),
  search:async(query,{maxResults,since})=>{searches.push({query,maxResults,since});return {results:[]};}
 };
 const args={identity,briefUnderstanding,plan,providers,brief,packet,readPages:()=>assert.fail()};
 const round=await reviewScopedResearch({...args,rounds:[]});
 assert.equal(round.receipts[0].attempts[0].tool,'tavily');
 assert.deepEqual(searches.map(s=>s.query),[first.query,second.query]);
 const seenFirst={...round,receipts:[{...round.receipts[0],attempts:[{tool:'tavily',issue:'provider_timeout'}]}]};
 const next=await reviewScopedResearch({...args,rounds:[seenFirst]});
 assert.deepEqual(next.receipts.map(r=>r.id),[second.id]);
 assert.deepEqual(searches.at(-1),{query:second.query,maxResults:second.quantity,since:second.since});
});

test('a funded Gemini preference retains a budget for the following opening topic',async()=>{
 const first={...needs[0],first:'gemini'};
 const plan={orderedResearch:true,reportOnlyAfterResearch:true,targetedEvidence:true,needs:[first,needs[1]]};
 const providers={managedBudgetVersion:15,infrastructureOffsetKurus:300,
  researchCapacity:async()=>openingCapacity(1500),
  withCeiling:ceiling=>{
   assert.equal(ceiling,3000-300-62);
   return {...providers,searchGemini:async need=>{assert.deepEqual(need,first);return {results:[]};}};
  },
  manager:()=>assert.fail('the opening search still fits'),
  search:()=>assert.fail('use the funded first tool')
 };
 const result=await reviewScopedResearch({identity,briefUnderstanding,plan,rounds:[],providers,brief,packet,readPages:()=>assert.fail()});
 assert.deepEqual(result.receipts.map(r=>[r.id,r.attempts[0].tool]),[[first.id,'gemini']]);
});

test('publisher identity and social links are usable after a catalogue with many product links',async()=>{
 const corporate='https://marque.com/contact',html='<a href="/product">Ürün</a>'.repeat(100)+
  '<a href="/iletisim">İletişim</a><a href="'+corporate+'">Corporate</a><a href="'+instagram+'"></a>';
 const identityLinks=sourceLinks(html,brief.website,{identity:true});
 assert.deepEqual(identityLinks.map(link=>link.url),[new URL('/iletisim',brief.website).href,corporate,instagram]);
 const original={...packet,sources:[{...packet.sources[0],technicalSignals:{identityLinks}}]};
 const model={managedBudgetVersion:14,manager:async(stage,input)=>{
  if(stage==='bhs-scoped-plan'){
   assert.ok(input.publisherLinks.some(link=>link.url===instagram));
   return {data:{needs:[needs[1]]}};
  }
  assert.equal(input.card,undefined);
  assert.ok(input.sources[0].links.some(link=>link.url===corporate));
  assert.equal(input.readReceipts[0].status,'read');
  return {data:{...identity,pages:[],searches:[]}};
 }};
 const prior={value:{...identity,pages:[corporate],searches:[]}};
 const brand=await understandScopedBrand({brief,packet:original,providers:model,prior,readPages:async urls=>{
  assert.deepEqual(urls,[corporate]);
  return {sources:[{...packet.sources[0],url:corporate,finalUrl:corporate}]};
 }});
 assert.ok(brand.packet.sources.some(s=>s.url===corporate));
 assert.equal((await planScopedResearch({brief,identity,briefUnderstanding,asOf:packet.asOf,providers:model,packet:brand.packet})).needs[0].id,'t1');
});

test('an unavailable controller can use the saved narrow query with the affordable alternate',async()=>{
 const need={...needs[1],first:'gemini'};
 const plan={targetedEvidence:true,qualityReport:true,reportOnlyAfterResearch:true,orderedResearch:true,needs:[need]};
 let used=0;
 const providers={managedBudgetVersion:14,manager:async()=>{throw new BudgetError('budget_limit','synthetic admission');},
  researchCapacity:async()=>({remainingKurus:3000-2615-workerInfraReservationKurus,minimumDefaultKurus:62,
   defaults:['tavily'],configuredDefaults:['tavily','gemini'],actors:[]}),
  search:async(query,opts)=>{
   used++;assert.equal(query,need.query);assert.equal(opts.since,need.since);assert.equal(opts.maxResults,need.quantity);
   return {results:[{url:post,content:postQuote}]};
  }};
 const recovered=await reviewScopedResearch({identity,briefUnderstanding,plan,rounds:[],providers,brief,packet,readPages:()=>assert.fail()});
 assert.equal(used,1);assert.equal(recovered.closed,false);assert.equal(recovered.receipts[0].attempts[0].tool,'tavily');
 const final=await reviewScopedResearch({identity,briefUnderstanding,plan,rounds:[recovered],providers,brief,packet,readPages:()=>assert.fail()});
 assert.equal(used,1);assert.equal(final.closed,true);
});

test('an executed read and invalid external need ID are reported back without purchasing the command again',async()=>{
 const need={...needs[0],first:'tavily'};
 const plan={targetedEvidence:true,qualityReport:true,reportOnlyAfterResearch:true,orderedResearch:true,needs:[need]};
 const args={identity,briefUnderstanding,plan,brief,packet};
 const read={id:need.id,tool:'read',mode:'default',query:'',url:about,limit:1};
 const initial={receipts:[{id:need.id,query:need.query,urls:[about],facts:[],issues:[],defaultAttempt:true,attempts:[{tool:'tavily'}]}]};
 const commands=[read,{...read,limit:2},{...read,id:'c1'}];
 let reads=0,review=0;
 const providers={managedBudgetVersion:14,researchCapacity:async()=>({remainingKurus:690,defaults:['tavily'],actors:[]}),
  manager:async(_stage,input)=>{
   if(review)assert.equal(input.commandHistory[0].status,'executed');
   return {data:draft({commands:[commands[review++]]})};
  },worker:async()=>({data:{results:[]}}),search:()=>assert.fail('duplicated query')};
 const readPages=async()=>{reads++;return {sources:[{...packet.sources[0],url:about,finalUrl:about}]};};
 const first=await reviewScopedResearch({...args,rounds:[initial],providers,readPages});
 const second=await reviewScopedResearch({...args,rounds:[initial,first],providers,readPages});
 const third=await reviewScopedResearch({...args,rounds:[initial,first,second],providers,readPages});
 assert.equal(reads,1);assert.equal(second.commandResults[0].status,'duplicate');assert.equal(third.commandResults[0].status,'need_unavailable');
});

test('source transport preserves every alias and retains valid parts of a clipped draft',async()=>{
 const metrics={...needs[0],section:'PAZAR',first:'tavily'};
 const url='https://publisher.fr/market-figures',product='https://publisher.fr/category-cpc';
 const plan={targetedEvidence:true,qualityReport:true,adaptiveResearch:true,scopedResearch:true,orderedResearch:true,
  reportOnlyAfterResearch:true,needs:[metrics]};
 const fact=(id,target,quote)=>({id,url:target,title:'Kamu verileri',item:id,quote,method:'search-snippet'});
 const receipts=[{id:metrics.id,facts:[
  fact('a',url,'Kategori yılına ilişkin perakende kayıtları kaynak tablosundan derlendi. Kasım mobilya kampanyası 27 Kasım 2026 tarihinde gerçekleştirildi.'),
  fact('b',product,'Kategori Google Ads tahmini tıklama maliyeti: Ev dekorasyon5 - 18 TL, ulusal arama reklamları.')
 ]}];
 const providers={manager:async(_stage,input)=>{
  const alias=part=>Object.entries(input.sources).find(([,row])=>row[1].includes(part))[0];
  const base={section:'Pazar',needIds:[metrics.id],area:'',quadrant:'none',peerId:'',kind:'observation',analysis:'Kampanya planlaması için kullanılabilir.',
   action:'Kampanya planını gözden geçir.',measurement:'Dönüşüm oranı',limitation:'',question:''};
  assert.ok(Object.values(input.documents).some(doc=>doc[0]===url));
  return {model:'offline',partialOutput:true,data:{findings:[
   {...base,rank:1,observation:'Kasım mobilya kampanyası 27 Kasım 2026 tarihinde gerçekleştirildi.',proof:[alias('perakende kayıtları')]},
   {...base,rank:2,observation:'Ev dekorasyonunda Google Ads maliyet tahmini 5–18 TL. Aynı sektörün toplam cirosu 999 milyon TL.',proof:[alias('dekorasyon5')]},
   {...base,rank:3,observation:'Kategori toplam cirosu 999 milyon TL.',proof:[alias('dekorasyon5')]}
  ],peers:[],benchmarks:[],questions:[]}};
 }};
 const result=await writeScopedSynthesis({brief,brand:{packet,facts:[],brandUnderstanding:identity,briefUnderstanding},plan,
  rounds:[{closed:true,stopReason:'research_budget_exhausted',receipts}],providers});
 assert.equal(result.report.findings.length,2);
 assert.match(result.report.findings[1].statement,/5–18 TL/);
 assert.doesNotMatch(result.report.findings[1].statement,/999/);
 assert.equal(result.report.bhsSections.find(s=>s.id==='PAZAR').complete,false);
});

test('short Tavily receipts reach the controller without an extra extraction call',async()=>{
 const [receipt]=await runScopedDefaults([needs[1]],{managedBudgetVersion:13,
  search:async()=>({results:[{url:instagram,content:postQuote}]}),worker:()=>assert.fail('redundant model call')},
 ()=>assert.fail('read must be selected by the controller'));
 assert.equal(receipt.facts[0].quote,postQuote);
 assert.equal(receipt.facts[0].method,'search-snippet');
 assert.equal(receipt.facts[0].preliminary,true);
});

test('scoped transfer ties Claude’s headings and rivals to evidence and retains qualified traffic estimates',async()=>{
 const rival={url:'https://comparable.fr/catalogue',name:'Comparable',product:'Packaged groceries',market:'France',channel:'Online wholesale',priceBand:''};
 const traffic={id:'qtraffic',url:'https://traffic.fr/marque',title:'Traffic estimate',item:'Traffic estimate',quote:'Marque website traffic estimate — Monthly visits: 2,570.',method:'search-snippet'};
 const product={id:'qproduct',url:rival.url,title:rival.name,item:rival.name,quote:'Comparable distributes packaged groceries via an online wholesale catalogue.',method:'extracted'};
 const plan={qualityReport:true,adaptiveResearch:true,scopedResearch:true,orderedResearch:true,reportOnlyAfterResearch:true,
  needs:[{...needs[0],section:'rakipler'},{...needs[1],section:'kanal',metric:'Kanal bazında oturum sayısı'}]};
 const brand={packet,facts:[],brandUnderstanding:identity,briefUnderstanding};
 const receipts=[{id:'t0',facts:[product]},{id:'t1',facts:[traffic]}];
 const terminal={approved:false,closed:true,stopReason:'research_budget_exhausted',peers:[rival],receipts,
  decisions:[{id:'t0',sufficient:true,proofs:[product.id]},{id:'t1',sufficient:false,proofs:[traffic.id]}]};
 const snippets={...terminal,receipts:[{id:'t0',facts:[{...product,method:'search-snippet'}]},receipts[1]]};
 assert.equal(scopedEvidence(brand,plan,[snippets]).coverage[0].status,'open');
 assert.equal(scopedEvidence(brand,plan,[terminal]).coverage[0].status,'confirmed');
 const providers={manager:async(_stage,input)=>{
  const proof=url=>Object.entries(input.sources).find(([,row])=>row[0]===url)[0];
  const base={area:'',rank:1,quadrant:'none',peerId:'',kind:'observation',analysis:'Kanal seçimi için başlangıç noktası oluşturuyor.',
   action:'Toptan satış kataloğunu karşılaştır.',question:'Kanal satış verisini paylaşabilir misiniz?',measurement:'Sipariş sayısı',limitation:''};
  return {model:'claude-sonnet-5-5',partialOutput:true,data:{findings:[
   {...base,section:'Rakiplerin Satış Kanalları',needIds:['t0'],peerId:rival.name,observation:'Comparable paketli gıdaları çevrimiçi toptan satış kataloğuyla dağıtıyor.',proof:[proof(rival.url)]},
   {...base,rank:2,section:'Kanal Stratejisi ve Kârlılık',needIds:['t1'],observation:'Marque sitesi ayda 2.570 ziyaret alıyor.',
    action:'2.570 doğrudan oturumu satışa çevir.',measurement:'2.570 doğrudan oturum',proof:[proof(traffic.url)]}
  ],peers:[{entityId:rival.name,relationship:'direct',reason:'Çevrimiçi toptan satış ve paketli gıda.',sourceIds:[proof(rival.url)]}],benchmarks:[],questions:[],invalidObservations:[]}};
 }};
 const synthesis=await writeScopedSynthesis({brief,brand,plan,rounds:[terminal],providers});
 const result=directAuditResult(brief,synthesis);
 const report=result.data.report;
 assert.equal(report.competitors[0]?.name,rival.name);
 assert.equal(report.bhsSections.find(s=>s.id==='rakipler')?.complete,true);
 assert.equal(report.findings.length,2);
 assert.deepEqual(report.bhsSections.find(s=>s.id==='kanal'),{id:'kanal',title:'Kanal Stratejisi ve Kârlılık',findingIds:[report.findings[1].id],count:1,missingQuadrants:[],complete:false});
 assert.match(report.findings[1].statement,/trafik tahminine göre/);
 assert.match(report.findings[1].recommendation.action,/GA4/);
 assert.doesNotMatch(report.findings[1].recommendation.action,/2\.570/);
 assert.ok(result.data.supervision.acceptance.issues.includes('partial_model_document'));
});

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

test('an unaffordable grounded brand search leaves the brief and a usable plan funded',async()=>{
 const saved=new Map(),calls=[];
 const orderedNeeds=needs.map(need=>({...need,first:'tavily'}));
 const providers={collectionFirst:true,managedAudit:true,managedBudgetVersion:12,withCeiling(limit){
  return {...this,claudeManager:(stage,input)=>manager(stage,input,limit),searchGemini:async need=>{
   assert.equal(need.query,'Marque produits et marché');
   assert.equal(limit,1600);
   throw new BudgetError('budget_limit','Grounded search reserve does not fit in discovery');
  },search:async(query,options)=>{
   assert.equal(limit,1600);
   assert.equal(query,'Marque produits et marché');
   assert.equal(options.maxResults,1);
   calls.push('tavily');
   return {results:[{url:about,title:'Marque'}]};
  }};
 },claudeManager:(stage,input)=>manager(stage,input,3000)};
 async function manager(stage,input,limit){
  calls.push(stage);
  if(stage==='bhs-scoped-brand'){
   assert.equal(limit,1600);
   if(!input.priorUnderstanding)return {data:{...identity,pages:[],searches:[{query:'Marque produits et marché',tool:'gemini',limit:1}]}};
   if(input.lookupReceipts.at(-1)?.tool==='gemini'){
    assert.equal(input.lookupReceipts.at(-1).issue,'budget_limit');
    assert.ok(!calls.includes('tavily'));
    return {data:{...identity,pages:[],searches:[{query:'Marque produits et marché',tool:'tavily',limit:1}]}};
   }
   assert.ok(input.sources.some(s=>s.url===about));
   return {data:{...identity,pages:[],searches:[]}};
  }
  if(stage==='bhs-scoped-brief'){
   assert.equal(limit,2200);
   throw new BudgetError('budget_limit','Use the compact brief call');
  }
  if(stage==='bhs-scoped-brief-compact'){
   assert.equal(limit,2200);
   assert.equal(input.card.goals,brief.goals);
   return {data:briefUnderstanding};
  }
  assert.equal(limit,3000);
  assert.deepEqual(input.briefUnderstanding,briefUnderstanding);
  if(stage==='bhs-scoped-plan')return {data:{needs:[]}};
  assert.equal(stage,'bhs-scoped-plan-compact');
  return {data:{needs:orderedNeeds}};
 }
 for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('sector_sources')+1)){
  saved.set(phase,await runSequentialStage({phase,brief,providers,previous:async name=>saved.get(name),
   collect:async(_brief,_plan,{prioritySources:[url]})=>({...packet,sources:[{...packet.sources[0],url,finalUrl:url}]})}));
 }
 assert.deepEqual(calls,['bhs-scoped-brand','bhs-scoped-brand','tavily','bhs-scoped-brand','bhs-scoped-brief','bhs-scoped-brief-compact','bhs-scoped-plan','bhs-scoped-plan-compact']);
 assert.deepEqual(saved.get('sector_sources').managedPlan.needs,orderedNeeds);
 assert.equal(saved.get('sector_sources').managedPlan.orderedResearch,true);
});

test('an already-read brand page preserves the sources through the brief and into planning',async()=>{
 const saved=new Map(),reads=[],calls=[];
 const orderedNeed={...needs[0],first:'tavily'};
 const providers={collectionFirst:true,managedAudit:true,managedBudgetVersion:12,withCeiling(){return this;},
  async claudeManager(stage,input){
   calls.push(stage);
   if(stage==='bhs-scoped-brand')return {data:{...identity,pages:[about],searches:[]}};
   if(stage==='bhs-scoped-brief')return {data:briefUnderstanding};
   assert.equal(stage,'bhs-scoped-plan');
   assert.equal(input.asOf,packet.asOf);
   assert.deepEqual(input.identity,identity);
   assert.deepEqual(input.briefUnderstanding,briefUnderstanding);
   return {data:{needs:[orderedNeed]}};
  }};
 const previous=async phase=>{
  if(!saved.has(phase))throw new BudgetError('stage_pending','Missing checkpoint');
  return saved.get(phase);
 };
 const run=phase=>runSequentialStage({phase,brief,providers,previous,
  collect:async(_brief,_plan,{prioritySources:[url]})=>{
   reads.push(url);
   return {...packet,sources:[{...packet.sources[0],url,finalUrl:url,technicalSignals:{navigation:[{url:about,label:'Our story'}]}}]};
  }});
 for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('brand')+1))saved.set(phase,await run(phase));
 assert.equal(saved.get('brand_draft').brandDiscovery.done,true);
 assert.deepEqual(saved.get('brand').packet.sources.map(source=>source.finalUrl),[brief.website,about]);
 assert.deepEqual((await run('sector_sources')).managedPlan.needs,[orderedNeed]);

 // A checkpoint from the previous deployment can have a completed brief but
 // lose its packet after the last successful source read.
 for(const phase of sequentialPhases.slice(sequentialPhases.indexOf('brand_draft'),sequentialPhases.indexOf('brand')+1)){
  saved.set(phase,{...saved.get(phase),packet:undefined});
 }
 assert.deepEqual((await run('sector_sources')).managedPlan.needs,[orderedNeed]);
 assert.deepEqual(reads,[brief.website,about]);
 assert.deepEqual(calls,['bhs-scoped-brand','bhs-scoped-brand','bhs-scoped-brief','bhs-scoped-plan','bhs-scoped-plan']);
});

test('ordered research runs one exact command, then returns the evidence to the controller before its next choice',async()=>{
 const plan={orderedResearch:true,reportOnlyAfterResearch:true,needs:[{...needs[0],first:'tavily'},needs[1]]};
 const requests=[],query='distributeurs indépendants alimentation bio France';
 const first={id:needs[0].id,tool:'tavily',query,url:'',mode:'default',limit:3};
 const second={id:needs[1].id,tool:'gemini',query:needs[1].query,url:'',mode:'default',limit:2};
 const providers={managedBudgetVersion:12,modelHandoff:true,
  manager:async(stage,input,schema)=>{
   assert.equal(stage,'bhs-scoped-review');
   assert.equal(schema.properties.commands.maxItems,1);
   if(!input.previous.length)return {data:draft({commands:[first,second]})};
   assert.deepEqual(requests.map(r=>r[0]),['tavily','worker']);
   assert.equal(input.previous[0].query,query);
   assert.ok(input.findings.some(f=>f.quote===quote));
   return {data:draft({commands:[second]})};
  },
  search:async(q,o)=>{requests.push(['tavily',q,o.maxResults,o.countryCode]);return {results:[{url:about,title:'Marque',content:quote}]};},
  searchGemini:async(need)=>{requests.push(['gemini',need.query,need.quantity,need.since]);return {results:[{url:post,title:'Post',content:postQuote}]};},
  geminiWorker:async()=>assert.fail('evidence extraction must be able to hand off to Claude'),
  worker:async(stage,input)=>{requests.push(['worker',stage,input.requests.length]);return {data:{results:[]}};}
 };
 const args={identity,briefUnderstanding,plan,providers,brief,packet,readPages:async()=>({sources:[]})};
 const one=await reviewScopedResearch({...args,rounds:[]});
 assert.equal(one.receipts.length,1);
 const two=await reviewScopedResearch({...args,rounds:[one]});
 assert.equal(two.receipts.length,1);
 assert.deepEqual(requests,[['tavily',query,3,'FR'],['worker','bhs-scoped-extract',1],['gemini',needs[1].query,2,needs[1].since],['worker','bhs-scoped-extract',1]]);
});

test('an unavailable brief or twice-empty plan never commits the start of research',async()=>{
 let calls=0;
 const providers={collectionFirst:true,managedAudit:true,managedBudgetVersion:12,claudeManager:async()=>{
  calls++;
  return {data:{needs:[]}};
 }};
 for(const understanding of [undefined,briefUnderstanding]){
  const brand={collectionFirst:true,decision:'accepted',packet,brandUnderstanding:identity,briefUnderstanding:understanding};
  await assert.rejects(runSequentialStage({phase:'sector_sources',brief,providers,previous:async()=>brand}),{code:'research_start_unavailable',
   researchPlanIssue:understanding?'research_plan_empty':'brief_understanding_unavailable'});
 }
 assert.equal(calls,2);
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
 const plan={needs:[{...needs[0],first:'tavily'}],scopedResearch:true,adaptiveResearch:true,reportOnlyAfterResearch:true,orderedResearch:true};
 const facts=[{id:'q-one',item:'Wholesale',url:about,quote,title:'Marque',method:'extracted'}];
 const receipts=[{id:needs[0].id,facts,attempts:[],urls:[about]}];
 const approvedEvidence={receipts,decisions:[{id:needs[0].id,sufficient:true,proofs:['q-one']}]};
 const partialEvidence={receipts,decisions:[{id:needs[0].id,sufficient:false,proofs:['q-one']}]};
 let written=0;
 const providers={claudeManager:async(stage,input)=>{
  if(stage==='bhs-scoped-review')return {data:draft({})};
  written++;
  assert.equal(stage,'bhs-scoped-report');
  assert.equal(input.coverage[0].status,'open');
  assert.equal(input.stopReason,'research_budget_exhausted');
  assert.ok(Object.values(input.sources).some(source=>source[0]===about));
  return {model:'claude-sonnet-5-5',data:{findings:[],questions:[]}};
 },researchCapacity:async()=>({remainingKurus:61,defaults:[],configuredDefaults:['tavily','gemini'],actors:[]})};
 const args={brief,brand:{packet,facts:[],brandUnderstanding:identity,briefUnderstanding},plan,providers};
 await assert.rejects(writeScopedSynthesis({...args,rounds:[{closed:true,issue:'no_executable_research_command'}]}),{code:'research_needs_open'});
 await assert.rejects(writeScopedSynthesis({...args,rounds:[approvedEvidence]}),{code:'research_needs_open'});
 assert.equal(written,0);
 const round=await reviewScopedResearch({identity,briefUnderstanding,plan,rounds:[],providers,brief,packet,readPages:async()=>({sources:[]})});
 assert.equal(round.closed,true);
 assert.equal(round.stopReason,'research_budget_exhausted');
 await writeScopedSynthesis({...args,rounds:[partialEvidence,round]});
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
