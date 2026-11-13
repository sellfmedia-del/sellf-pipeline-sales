import test from 'node:test';
import assert from 'node:assert/strict';
import {BudgetError,tariff,tariffReadiness} from '../src/budget/ledger.mjs';
import {comparisonResearch,peerCandidates,runCollectionFirstStage,collectionBrandCeiling,collectionBudgetKurus,inventoryStages,planCollectionFunding} from '../src/bhs/collection-first.mjs';
import {createResearchFx,researchTariff} from '../src/bhs/research-tariff.mjs';
import {sequentialContext,sequentialPhases,stageModelInput} from '../src/bhs/sequential-contracts.mjs';
import {stageBudgetLedger} from '../src/bhs/sequential-providers.mjs';
import {assertSchema} from '../src/bhs/schema.mjs';
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
 const peerSource=sources.find(s=>s.url===peer.website);
 const alternate={...peerSource,id:'alternate-source',url:alternateUrl,finalUrl:alternateUrl,excerpts:peerSource.excerpts.map(({text})=>({text:text.replace(peer.name,'Atelier '+peer.name)}))};
 return {...data,entities:[...entities,{...peer,id:'alternate-peer',name:'Atelier '+peer.name,website:alternateUrl}],sources:[...sources,alternate]};
};
const directPeerReply=request=>({data:{decisions:request.candidates.map(([id,,,proofs])=>({id,verdict:'direct',proof:proofs[0][0],reason:'Aynı ürün ve hedef pazar.'}))}});

test('the evidence check searches only uncovered questions and passes original proof to the funded index',async()=>{
 const data=fixturePacket(),brandHost=new URL(brief.website).hostname;
 const source=(url,text)=>({id:'ev1',url,finalUrl:url,title:'Original source',method:'html',excerpts:[{text}],contentHash:url,retrievedAt:data.asOf});
 const own=source('https://'+brandHost+'/distribution','Markanın üretim tesisi ve dağıtım ortakları müşterilere teslimat sağlar.');
 const external=source('https://industry.example/market','Türkiye pazarında tüketici talebi ve hammadde maliyeti incelenmiştir.');
 const added=source('https://industry.example/regulation','Hammadde maliyetleri ve rekabet sektör koşullarını etkileyebilir.');
 const brand={facts:[],packet:{...data,sources:[own,external]},plan};
 const managedPlan={market:'Türkiye',comparableProduct:'Organik bar',understanding:{requirements:['Bayi erişimi']},tasks:[],coveragePolicy:2};
 const calls=[];
 const providers={managedBudgetVersion:3,withCeiling:()=>providers,
  evidenceReviewer:async(_stage,input)=>{
   const {strength,weakness,opportunity,readiness}=input.candidates;
   return {data:{strength,weakness,opportunity,readiness,threat:['p_invented']}};
  },
  search:async query=>{calls.push(query);return {query,results:query.includes('hammadde')?[{url:added.url,title:'Market',content:added.excerpts[0].text}]:[]};},
  worker:async(_stage,input)=>{
   const threat=input.rows.find(([question,,url])=>question==='threat'&&url===added.url);
   assert.ok(threat);return {data:{observations:[{area:'financial_1',text:threat[3],sourceIds:[threat[1],'p_invented']}],organizations:[]}};
  }
 };
 const result=await runCollectionFirstStage({phase:inventoryStages[0],brief,providers,finish:value=>value,
  previous:async phase=>phase==='brand'?brand:phase==='sector_sources'?{managedPlan,funding:{}}:{},
  collect:async(_brief,_plan,options)=>{assert.deepEqual(options.prioritySources,[added.url]);return {sources:[added],unavailable:[]};}
 });
 assert.deepEqual(result.questionCoverage.missingBeforeSearch,['threat','readiness']);
 assert.equal(calls.length,2);
 assert.equal(result.questionSources.pages[0].url,added.url);
 assert.equal(result.inventory[0].observations[0].sourceIds.length,1);
 assert.ok(result.questionEvidence.threat.includes(result.inventory[0].observations[0].sourceIds[0]));
});

test('customer review searches run before other gaps even when the archive mentions reviews',async()=>{
 const data=fixturePacket(),brandName=brief.brandName,slug=brandName.toLowerCase().replaceAll(' ','-');
 const url='https://www.sikayetvar.com/'+slug+'/teslimat';
 const source=(url,title,text)=>({id:url,url,finalUrl:url,title,method:'html',excerpts:[{text}],contentHash:url,retrievedAt:data.asOf});
 const brand={facts:[],packet:{...data,sources:[
  source('https://one.example/'+slug,brandName,'Müşteri yorumları için genel bir rehber.'),
  source('https://two.example/'+slug,brandName,'Müşteri yorumları kategori listesi.'),
  source(url,brandName,'Sayfa menüsü ve genel kategori bağlantıları.')
 ]},plan};
 const managedPlan={market:'Türkiye',comparableProduct:'Organik bar',understanding:{requirements:[]},tasks:[{section:'perception'}],coveragePolicy:2};
 const calls=[];
 const providers={managedBudgetVersion:3,withCeiling:()=>providers,focusedIndexUnavailable:true,
  evidenceReviewer:async()=>({data:{}}),
  search:async(query,options)=>{
   calls.push(options.domains?.[0]||'other');
   return options.domains?.[0]==='sikayetvar.com'?{results:[{url,title:brandName}],rawResults:[{url,title:brandName,raw_content:'Sayfa menüsü ve genel kategori bağlantıları.'}]}:{results:[]};
  },
  extract:async urls=>{
   assert.deepEqual(urls,[url]);
   return {pages:[{url,title:brandName,text:'Müşteri şikayeti. Sipariş verdim, ancak paket teslim edilmedi. Teslimat tarihi sistemde görünmüyor.'}]};
  }
 };
 const result=await runCollectionFirstStage({phase:inventoryStages[0],brief,providers,finish:value=>value,
  previous:async phase=>phase==='brand'?brand:phase==='sector_sources'?{managedPlan,funding:{}}:{},
  collect:async()=>({sources:[],unavailable:[]})
 });
 assert.deepEqual(calls.slice(0,2),['sikayetvar.com','trendyol.com']);
 assert.ok(result.questionEvidence.perception.length);
 assert.ok(result.questionSources.pages.some(page=>page.excerpts.some(({text})=>text.includes('paket teslim edilmedi'))));
});

test('publisher discovery keeps Claude-selected public results when brand names differ from parent-company domains',async()=>{
 const alpha='https://foodgroup.example/products/alpha',beta='https://brandhouse.example/products/beta';
 const results=[{url:alpha,title:'Our Alpha product',content:'Alpha oat snack bars sold in Türkiye.'},{url:beta,title:'Our Beta product',content:'Beta oat snack bars sold in Türkiye.'}];
 const pool={search:async()=>({results}),manager:async(stage,input)=>{
  assert.equal(stage,'v8-managed-peer-publishers');
  return {data:{pages:[{name:'Alpha',resultId:input.results.find(row=>row[1]===alpha)[0]},{name:'Beta',resultId:input.results.find(row=>row[1]===beta)[0]},{name:'Invented',resultId:'u99'}]}};
 }};
 const brand={plan:{...plan,entities:plan.entities.filter(e=>e.role==='brand')}};
 const selected=await comparisonResearch(brief,brand,null,pool,{},async(_brief,readPlan,options)=>{
  assert.deepEqual(readPlan.entities.filter(e=>e.role==='competitor').map(e=>e.website),[alpha,beta]);
  assert.deepEqual(options.prioritySources.slice(0,2),[alpha,beta]);
  return {sources:[],unavailable:[]};
 },null,{market:'Türkiye',coveragePolicy:2,comparableProduct:'yulaf barı',peerNames:['Alpha','Beta']});
 assert.deepEqual(selected.peerHints.map(p=>p.name),['Alpha','Beta']);
 const partial=await comparisonResearch(brief,brand,null,{...pool,evidenceReviewer:async()=>{throw new BudgetError('provider_format','Synthetic upstream HTML.');}}, {},async(_brief,_plan,options)=>{
  assert.deepEqual(options.prioritySources,[alpha,beta]);
  return {sources:[],unavailable:[]};
 },null,{market:'Türkiye',coveragePolicy:2,comparableProduct:'yulaf barı',peerNames:['Alpha','Beta']});
 assert.deepEqual(partial.peerHints.map(p=>p.name),['Alpha','Beta']);
 assert.ok(partial.searches.length>0);
 const recovered=await comparisonResearch(brief,brand,null,{...pool,extract:async urls=>{
  assert.deepEqual(urls,[beta]);
  return {pages:[{url:beta,text:'Beta officially sells oat snack bars in the Turkish market.'}]};
 }},{},async()=>({sources:[],unavailable:[{url:beta,reason:'source_timeout'}]}),null,
 {market:'Türkiye',coveragePolicy:2,comparableProduct:'yulaf barı',peerNames:['Alpha','Beta']},[],new Set([alpha]));
 assert.equal(recovered.pages[0].finalUrl,beta);
 assert.equal(recovered.pages[0].method,'extracted');
 const news='https://news.example/products/alpha';
 const modern=await comparisonResearch(brief,brand,null,{search:async()=>({results:[
  {url:news,title:'News about Alpha and Gamma',content:'Alpha oat snack bars sold in Türkiye.'},
  {url:'https://www.gamma.example/products/bar',title:'Products',content:'Gamma oat snack bars in Türkiye.'}
 ]}),manager:async(_stage,input)=>({data:{pages:[
  {name:'Alpha',resultId:input.results.find(row=>row[1]===news)[0]},
  {name:'Gamma Organic',resultId:input.results.find(row=>row[1].includes('gamma.example'))[0]}
 ]}})},{managedBudgetVersion:3},async()=>({sources:[],unavailable:[]}),null,
 {market:'Türkiye',coveragePolicy:2,comparableProduct:'yulaf barı',peerNames:[]});
 assert.deepEqual(modern.peerHints.map(({name,website})=>[name,website]),[['Gamma Organic','https://www.gamma.example/products/bar']]);
});

test('target-market discovery keeps a multiword publisher name and a reviewed product page on its parent domain',async()=>{
 const first={url:'https://whitedairy.example/urunler/peynir',title:'Peynir | White Dairy',content:'Türkiye için özel peynir ürünleri.'};
 const second={url:'https://producer.example/urunler/peynir',title:'Green Farm Peynir',content:'Türkiye için özel peynir ürünleri.'};
 const news={url:'https://news.example/urunler/peynir',title:'Haber: Green Farm Peynir',content:'Türkiye için özel peynir ürünleri.'};
 const providers={managedBudgetVersion:3,search:async()=>({results:[first,second,news]}),evidenceReviewer:async(_stage,input)=>({data:{pages:[
  {name:'Green Farm',resultId:input.results.find(row=>row[1]===second.url)[0]},
  {name:'Green Farm',resultId:input.results.find(row=>row[1]===news.url)[0]}
 ]}})};
 const brand={plan:{...plan,entities:plan.entities.filter(e=>e.role==='brand')}};
 const result=await comparisonResearch(brief,brand,null,providers,providers,async(_brief,_plan,options)=>{
  assert.deepEqual(options.prioritySources.slice(0,2),[first.url,second.url]);
  return {sources:[],unavailable:[]};
 },null,{market:'Türkiye',coveragePolicy:2,comparableProduct:'peynir',peerNames:[]});
 assert.deepEqual(result.peerHints.map(p=>p.name),['White Dairy','Green Farm']);
});

test('a public retailer catalogue cannot count as a direct product publisher',()=>{
 const evidence=fixturePacket();
 const publisher=evidence.entities.find(entity=>entity.role==='competitor');
 const catalog={id:'candidate_store',role:'competitor',name:'Store',website:'https://store.example/snacks'};
 const page={...evidence.sources[0],id:'ev50',url:catalog.website,finalUrl:catalog.website,title:'Organik yulaf barı ürünleri',
  excerpts:[{text:'Organik yulaf barı ve bisküvi ürünleri. Şube seçimi yaparak ürünleri sepete ekleyebilirsiniz.'}]};
 const context=sequentialContext(brief,{packet:{...evidence,entities:[publisher,catalog],sources:[...evidence.sources,page]},searches:[],peerDiscoveryVersion:'product-v2'});
 assert.deepEqual(peerCandidates(context,[publisher,catalog],{facts:[]},'yulaf barı',true).map(({entity})=>entity.id),[publisher.id]);
});

test('collection preserves raw records under 25 TRY and never calls Claude during collection',async()=>{
 const db=await localBudget(),seen=new Map();
 const brand={packet:fixturePacket(),plan,decision:'accepted',facts:[
  {topic:'products',kind:'observation',statement:'Sertifikalı formülasyonlar sunulur.',sourceIds:[]},
  {topic:'products',kind:'observation',statement:'Organik yulaf atıştırmalık barları satılır.',sourceIds:[]}
 ]};
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
       return {data:{observations:input.sources.filter(source=>!source.url.includes('public.example')).flatMap(source=>source.sections.map(section=>({area:/Statik HTML|Organic Alpha için/.test(section.text)?'digital_1':'operations_1',text:section.text||'Verbatim research record.',sourceIds:section.proofIds}))),organizations:[]}};
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
   a:[methodologyAreas.find(a=>a.dimension===f.dimension).key],o:f.observation,p:f.sourceIds,k:f.kind,h:'Ticari etkisi iç verilerle ölçülmeli.',l:f.limitation,w:Object.keys(draft.swot).find(key=>draft.swot[key].includes(f.id))||'none'
  }))};
  const result=await runCollectionFirstStage({phase:'synthesis',brief,providers:{costStatus:()=>db.ledger.status(),manager:async(stage,request,_schema,options)=>{
   if(stage==='v8-collection-reserved-peers'){
    const {data}=directPeerReply(request);
    data.decisions[0].reason='Aynı hedef pazarda aynı kullanım için satılan ürün, markanın kaynaklı teklifine doğrudan ikame olabilir.';
    data.decisions[0].proof=request.candidates[0][3].map(([id])=>id).join(',');
    assert.ok(data.decisions[0].reason.length>95);
    const normalized=options.normalizeData({decisions:[...data.decisions,{...data.decisions[0],verdict:'invalid'}]});
    assertSchema(normalized,options.responseSchema);
    assert.equal(normalized.decisions.length,data.decisions.length);
    return {data:normalized};
   }
   assert.equal(stage,'v8-collection-reserved-report');
   const publicQuotes=request.unindexedSources.filter(row=>row[0]==='public.example').flatMap(row=>row[2].map(([,quote])=>quote));
   assert.ok(publicQuotes.some(quote=>quote.includes('increase')));
   assert.ok(publicQuotes.some(quote=>quote.includes('decrease')));
   const aliases=new Map(Object.entries(request.originalQuotes).map(([alias,[,quote]])=>[quote,alias]));
   const remap=ids=>ids.map(id=>aliases.get(context.known.get(id).quote));
    const report={questions:data.questions,benchmarks:data.benchmarks,findings:data.findings.map(f=>({...f,p:remap(f.p)}))};
    const sample={...report.findings[0],p:Array(4).fill(report.findings[0].p[0])};
    const normalized=options.normalizeData({...report,findings:[...Array(21).fill(sample),{...sample,k:'invalid'},report.findings.find(f=>f.w==='threat')]});
    assertSchema(normalized,options.responseSchema);
    assert.equal(normalized.findings.length,22);
    assert.equal(normalized.findings.at(-1).w,'threat');
    return {data:report,model:'claude-sonnet-5-5'};
  }},previous,finish:value=>value});
  assert.equal(result.supervision.reviewMode,'collection-first');
  assert.equal(result.supervision.acceptance.passed,true);
  assert.equal(result.supervision.acceptance.directCompetitors,3);
  assert.ok(result.report.dimensions.every(d=>d.findingIds.length<=4));
  const reviews=[];
  let compact;
  const repaired=await runCollectionFirstStage({phase:'synthesis',brief,providers:{costStatus:()=>db.ledger.status(),manager:async(stage,request,_schema,options)=>{
   reviews.push(stage);
   if(stage==='v8-collection-reserved-peers')return directPeerReply(request);
   if(stage==='v8-collection-reserved-report'){
    const aliases=new Map(Object.entries(request.originalQuotes).map(([alias,[,quote]])=>[quote,alias]));
    const remap=ids=>ids.map(id=>aliases.get(context.known.get(id).quote));
    compact={...data,findings:data.findings.map(f=>({...f,p:remap(f.p)})),peers:data.peers.map(p=>({...p,sourceIds:remap(p.sourceIds)}))};
    return {data:{...compact,findings:compact.findings.filter(f=>!f.a[0].startsWith('digital_')&&f.w!=='threat'),peers:[]},model:'claude-sonnet-5-5'};
   }
   assert.ok(request.issues.includes('insufficient_dimension_depth'));
   assert.ok(request.issues.includes('swot_threat_incomplete'));
   const findings=compact.findings.filter(f=>f.a[0].startsWith('digital_')||f.w==='threat');
   const normalized=options.normalizeData({findings:[...findings,{...findings[0],o:'Aşırı uzun yorumlu örnek.',h:'x'.repeat(96)},{...findings[0],o:'Geçersiz kanıtlı örnek.',p:['existing:2']}]});
   assert.ok(!normalized.findings.some(f=>f.o==='Aşırı uzun yorumlu örnek.'));
   return {data:normalized,model:'claude-sonnet-5-5'};
  }},previous,finish:value=>value});
  assert.deepEqual(reviews,['v8-collection-reserved-peers','v8-collection-reserved-report','v8-collection-reserved-gaps']);
  assert.equal(repaired.supervision.acceptance.passed,true);
  assert.ok(!repaired.report.findings.some(f=>f.statement==='Geçersiz kanıtlı örnek.'));
  const comparison=seen.get('competition_draft');
  seen.set('competition_draft',{...comparison,peerProduct:'organik atıştırmalık'});
  const gamma=fixturePacket().sources.find(s=>s.url.includes('organicgamma.'));
  const gammaUrl='https://organicgammafoods.example/urunler';
  let searches=0,peerReviews=0;
  const peerGap=await runCollectionFirstStage({phase:'synthesis',brief,previous,finish:value=>value,
   collect:async()=>({...fixturePacket(),sources:[{...gamma,url:gammaUrl,finalUrl:gammaUrl}]}),
   providers:{costStatus:()=>db.ledger.status(),readManagerResult:async(_stage,request)=>request.peers.length?undefined:{data:compact,model:'claude-sonnet-5-5'},withCeiling:limit=>{
    assert.ok(limit<5000);
    return {worker:async()=>({data:{product:'organik atıştırmalık',candidates:['Organic Gamma']}}),search:async()=>{searches++;return {results:[{url:gammaUrl}]};}};
   },manager:async(stage,request)=>{
    if(stage==='v8-collection-reserved-peers')return directPeerReply({...request,candidates:request.candidates.filter(([,name])=>['Organic Alpha','Organic Beta'].includes(name))});
    if(stage==='v8-collection-reserved-report')assert.fail('A paid report must be reused after peer verdict recovery');
    assert.equal(stage,'v8-collection-peer-evidence-repair');
    assert.equal(request.candidates[0][2],gammaUrl);
    peerReviews++;
    return directPeerReply(request);
   }}
  });
  assert.equal(searches,2);
  assert.equal(peerReviews,1);
  assert.equal(peerGap.supervision.acceptance.passed,true);
  assert.ok(peerGap.report.competitors.some(peer=>peer.name==='Organic Gamma'&&peer.website==='https://organicgammafoods.example'));
 }finally{await db.close();}
});

test('identity and infrastructure costs reduce research room before any research is bought',()=>{
 const funding=planCollectionFunding({chargedKurus:2023,capKurus:5000},400,clock());
 assert.equal(funding.startKurus,1623);
 assert.ok(funding.researchLimitKurus<2500);
 assert.equal(funding.capKurus+funding.finalReserveKurus+funding.finalInfrastructureKurus,5000);
 assert.equal(funding.finalReserveKurus,Object.values(funding.finalQuotes).reduce((sum,quote)=>sum+quote,0));
 assert.equal(collectionBrandCeiling(5000,400,clock()),funding.capKurus);
 assert.throws(()=>planCollectionFunding({chargedKurus:4500,capKurus:5000},400,clock()),{code:'budget_limit'});
});

test('BHS keeps its reviewed ceiling after the legacy tariff date and shares a verified FX receipt',async()=>{
 const db=await localBudget();
 try{
  let now=Date.parse('2026-12-12T10:00:00Z'),requests=0;
  assert.equal(tariffReadiness(now,tariff).paidCallsAllowed,false);
  assert.equal(tariffReadiness(now,researchTariff).status,'review_due');
  assert.equal(tariffReadiness(now,researchTariff).paidCallsAllowed,true);
  assert.equal(collectionBrandCeiling(5000,400,now),collectionBrandCeiling(5000,400,clock()));
  const getFx=fetchImpl=>createResearchFx({ledger:db.ledger,now:()=>now,fetchImpl});
  const resolveFx=getFx(async()=>{
   requests++;
   if(requests===1)throw new TypeError('fetch failed');
   return new Response('<Tarih_Date Tarih="11.12.2026"><Currency Kod="USD"><ForexSelling>46.22</ForexSelling></Currency></Tarih_Date>');
  });
  const snapshot=await resolveFx();
  assert.equal(requests,2);
  assert.equal(snapshot.usdTry,46.22);
  const prior=await getFx(()=>assert.fail('Same-day receipt must be reused'))();
  assert.deepEqual(prior,snapshot);
  now+=86400000;
  assert.deepEqual(await getFx(async()=>{throw new TypeError('fetch failed');})(),snapshot);
  await assert.rejects(getFx(async()=>new Response('<Tarih_Date Tarih="13.12.2026"><Currency Kod="USD"><ForexSelling>62</ForexSelling></Currency></Tarih_Date>'))(),{code:'fx_limit'});
  assert.equal((await db.ledger.status()).chargedKurus,500);
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
