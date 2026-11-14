import test from 'node:test';
import assert from 'node:assert/strict';
import {localBudget} from './fixtures/local-budget.mjs';
import {brief,packet,plan} from './fixtures/sequential.mjs';
import {capBhsLedger,managedPhaseBudget,managedReviewPhases} from '../src/bhs/managed-budget.mjs';
import {mergeManagedGapReport,resolveManagedGaps} from '../src/bhs/managed-gaps.mjs';
import {managedActors,managedCoverageSearches,planManagedResearch} from '../src/bhs/managed-research.mjs';
import {managedReportInput,managedSections,synthesizeManagedReport} from '../src/bhs/managed-report.mjs';
import {sequentialContext,sequentialPhases,sequentialVersion} from '../src/bhs/sequential-contracts.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {continuationAudit} from '../src/bhs/continuity.mjs';
import {selectProposalAudit} from '../src/proposal/audit-selection.mjs';
import {methodologyAreas} from '../src/bhs/methodology-areas.mjs';
import {BudgetError} from '../src/budget/ledger.mjs';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {stageKey} from '../src/bhs/direct-research.mjs';
import {fallbackScope} from '../src/pricing/scope.mjs';
import {offerCopy} from '../src/proposal/composition.mjs';
import {response} from './fixtures/offer.mjs';
import {createSupervisedProviders} from '../src/bhs/supervised-providers.mjs';
import {stageBudgetLedger} from '../src/bhs/sequential-providers.mjs';
import {gunzipSync} from 'node:zlib';

import {planManagedEvidenceReview,planPositionalEvidenceReview,reviewManagedEvidenceBatch,reviewPositionalEvidenceBatch,reviewedManagedEvidence} from '../src/bhs/managed-evidence-review.mjs';
import {readResearchPages,runCollectionFirstStage} from '../src/bhs/collection-first.mjs';

const reviewRows=({rows,sources})=>rows.map(([id,area,text,proof])=>({id,area,text:text?.quote?sources[text.quote][3]:text,proof}));
const batchAnswer=(rows,candidates,exclude=new Set())=>({data:{
 verdicts:{c:'',d:rows.filter(row=>!exclude.has(row.id)).map(row=>row.id).join(' '),s:'',p:'',r:'',g:'',u:'',
  x:rows.filter(row=>exclude.has(row.id)).map(row=>row.id).join(' ')},
 candidates
}});

test('focused SWOT repairs keep sourced uncertainties and pass a rejected claim back to Claude',async()=>{
 const context=sequentialContext(brief,{packet:packet(),searches:[],peerDiscoveryVersion:'product-v2'});
 const excerpts={strength:/doğrudan tüketiciye satılır/,weakness:/teslimat gecikmesini/,opportunity:/tekrar satın alma/,threat:/hammadde maliyetleri/};
 const coverageEvidence=Object.fromEntries(Object.entries(excerpts).map(([id,pattern])=>[id,[context.cards.find(card=>pattern.test(card.quote)).id]]));
 const args={brief,brand:{facts:[]},plan:{understanding:{},tasks:[],coveragePolicy:2},context,inventory:[],coverageEvidence,sections:['swot'],sectional:true};
 const {input}=managedReportInput(args),ids=Object.keys(input.sources);
 const batchReviews=[{ids,verdicts:ids.map(id=>input.evidenceByQuestion.threat.includes(id)?'u':'s').join(''),candidates:ids}];
 let calls=0;
 const providers={manager:async(_stage,request,_schema,options)=>{
  const repair=++calls>1;
  if(repair){
   assert.deepEqual(Object.keys(request.proofsByQuestion),['weakness']);
   assert.equal(request.rejected[0].reason,'unsupported_quantity');
  }else assert.ok(request.proofsByQuestion.threat.length);
  const answer=Object.fromEntries(Object.entries(request.proofsByQuestion).map(([quadrant,[id]])=>[quadrant,[{
   area:'operations_1',proof:[id],kind:'inference',observation:quadrant==='weakness'&&!repair?'Marka Türkiye genelinde 500 mağaza işletiyor.':request.sources[id][3],
   analysis:'Bu koşul satın alma kararını etkileyebilir.',action:'Kanal bazında kontrollü pilot uygula.',measurement:'Pilot sipariş oranını ölç.',limitation:'Ticari etki ölçülmedi.'
  }]]));
  return {data:options.normalizeData(answer)};
 }};
 const {report}=await synthesizeManagedReport({...args,batchReviews,providers});
 assert.equal(calls,2);
 assert.equal(report.bhsSections.find(section=>section.id==='swot').complete,true);
 assert.ok(report.findings.every(row=>!row.statement.includes('500')&&row.recommendation.measurement));
});

test('a candidate mentioned in a readiness finding does not relabel the audited brand as a rival',async()=>{
 const context=sequentialContext(brief,{packet:packet(),searches:[],peerDiscoveryVersion:'product-v2'});
 const card=context.cards.find(card=>/teslimat süresi/.test(card.quote));
 context.input.entities.push({id:'candidate_logistics',role:'competitor',name:'Teslimat',website:'https://logistics.example'});
 const args={brief,brand:{facts:[]},plan:{understanding:{},tasks:[],coveragePolicy:2},context,inventory:[],coverageEvidence:{readiness:[card.id]},sections:['readiness'],sectional:true};
 const {input}=managedReportInput(args),ids=Object.keys(input.sources);
 const providers={manager:async(_stage,request,_schema,options)=>({data:options.normalizeData({findings:[{
  area:'operations_1',proof:request.proofsByQuestion.readiness,kind:'inference',observation:card.quote,
  analysis:'Teslimat süresinin sipariş kararına etkisi ölçülebilir.',action:'Kanal bazında kontrollü pilot uygula.',measurement:'Pilot sipariş oranını ölç.',limitation:'Ticari etki ölçülmedi.'
 }]})})};
 const {report}=await synthesizeManagedReport({...args,providers,batchReviews:[{ids,verdicts:'r'.repeat(ids.length),candidates:ids}]});
 assert.equal(report.findings[0].statement,card.quote);
 assert.equal(report.competitors.length,0);
});

test('a survey percentage cannot be applied beyond its documented customer group',async()=>{
 const evidence=packet(),source=evidence.sources[0];
 const quote='Marka algısı araştırmasında, markayı en sık tercih eden annelerin yüzde 58’i organik sertifikayı tercih nedeni olarak gösterdi.';
 source.excerpts.push({text:quote});
 const context=sequentialContext(brief,{packet:evidence,searches:[],peerDiscoveryVersion:'product-v2'});
 const proof=context.cards.find(card=>card.quote.includes('yüzde 58'));
 const args={brief,brand:{facts:[]},plan:{coveragePolicy:2},context,inventory:[],coverageEvidence:{threat:[proof.id]},sections:['swot'],sectional:true};
 const {input}=managedReportInput(args),ids=Object.keys(input.sources);
 const providers={manager:async(_stage,request,_schema,options)=>{
  if(!request.proofsByQuestion.threat?.length)return {data:options.normalizeData({})};
  const repair=request.rejected?.some(item=>item.reason==='survey_population_unconfirmed');
  return {data:options.normalizeData({threat:[{
   area:'operations_1',proof:request.proofsByQuestion.threat,kind:'observation',
   observation:repair?quote:'Ebeveynlerin yüzde 58’i organik içeriklere daha yakından bakıyor.',
   analysis:'Bu tercih ürün güveni için bir işaret olabilir.',action:'Ürün sayfasında sertifika bilgisini test et.',
   measurement:'İçerik tıklamalarını ölç.',limitation:'Sonuç araştırma örneklemi ile sınırlı.'
  }]})};
 }};
 const {report}=await synthesizeManagedReport({...args,providers,batchReviews:[{ids,verdicts:'s'.repeat(ids.length),candidates:ids}]});
 assert.deepEqual(report.findings.map(f=>f.statement),[quote]);
});

test('a missing review source cannot count as customer feedback and a provider format error recovers within the section',async()=>{
 const context=sequentialContext(brief,{packet:packet(),searches:[],peerDiscoveryVersion:'product-v2'});
 const complaint=context.cards.find(card=>/müşteri yorumları/.test(card.quote));
 const product=context.cards.find(card=>/doğrudan tüketiciye satılır/.test(card.quote));
 const args={brief,brand:{facts:[]},plan:{coveragePolicy:2},context,inventory:[{observations:[
  {area:'perception_1',text:complaint.quote,sourceIds:[complaint.id]},
  {area:'perception_1',text:product.quote,sourceIds:[product.id]}
 ]}],coverageEvidence:{},sections:['perception'],sectional:true,allowPartial:true};
 const {input}=managedReportInput(args);
 const ids=[...input.observations.map(([id])=>id),...Object.keys(input.sources)];
 const row=(statement,proof)=>({area:'perception_1',observation:statement,proof:[proof],kind:'observation',
  analysis:'Teslimat deneyimi tekrar satın almayı etkileyebilir.',action:'Teslimat kayıtlarını yorumlarla karşılaştır.',
  measurement:'Teslimat şikayeti oranını izle.',limitation:'Yorum örneklemi sınırlı.',question:''});
 const providers={manager:async()=>{throw new BudgetError('provider_format','Upstream invalid response.');},
  evidenceReviewer:async(_stage,request)=>{
   const proof=quote=>Object.keys(request.sources).find(id=>request.sources[id][3]===quote);
   return {data:{findings:[row(complaint.quote,proof(complaint.quote)),
    row('Müşteri, teslimat deneyiminde aynı gecikmeyi bildirdi.',proof(complaint.quote)),
    row('Verilen kaynaklarda müşteri yorumu veya şikâyet bulunmuyor.',proof(product.quote))]}};
  }};
 const {report,reportIssue}=await synthesizeManagedReport({...args,providers,batchReviews:[{ids,verdicts:'p'.repeat(ids.length),candidates:ids}]});
 assert.equal(reportIssue,'provider_format');
 assert.equal(report.findings.length,1);
 assert.equal(report.findings[0].statement,complaint.quote);
 assert.equal(report.bhsSections.find(section=>section.id==='perception').complete,false);
});

test('the managed evidence review can recover an entire batch when Claude is unavailable',async()=>{
 const rows=[{id:'s1',proof:['s1']},{id:'s2',proof:['s2']}];
 const sources={s1:['https://example.test/a','Ürün','html','Kamuya açık ürün bilgisi.'],s2:['https://example.test/b','Kanal','html','Kamuya açık kanal bilgisi.']};
 const providers={managedBudgetVersion:3,evidenceReviewer:async()=>{throw new BudgetError('provider_error','Upstream unavailable.');},
  worker:async(stage,request,schema,options)=>{
   assert.equal(stage,'v8-managed-evidence-position:packed-fallback');
   assert.equal(options.compactWorker,true);
   assert.deepEqual(request.sources,sources);
   assert.equal(schema.properties.verdicts.maxItems,2);
   assert.equal(options.responseSchema.properties.verdicts.type,'object');
   return {data:options.normalizeData({verdicts:['c','d'],candidates:['s2']})};
  }};
 const [review]=await reviewPositionalEvidenceBatch({rows,sources},{providers});
 assert.equal(review.verdicts,'cd');
 assert.deepEqual(review.candidates,['s2']);
});

test('customer repair uses a different original experience and readiness uses distinct brand evidence',()=>{
 const sources={
  s1:['https://reviews.example/one','Acme Organic','html','Sipariş verdim ve paket teslim edilmedi.'],
  s2:['https://another.example/same','Acme Organic','html','Sipariş verdim ve paket teslim edilmedi!'],
  s3:['https://shop.example/review','Acme Organic','html','Satın aldım, ürünün tadını beğendim.'],
  s4:['https://scores.example/brand','Acme Organic','html','Müşteri değerlendirme puanı: 70.'],
  s5:['https://competitor.example/reviews','Organic Beta','html','Satın aldım ve çok beğendim.'],
  s6:[brief.website+'distribution','Acme Organic','html','Dağıtım ortakları bölgelere göre listeleniyor.'],
  s7:[brief.website+'delivery','Acme Organic','html','Sipariş teslimatı için kargo koşulları açıklanıyor.'],
  s8:['https://scores.example/brand','Acme Organic','html','Markanın satış ve ihracat durumu haberlerde değerlendirildi.']
 };
 const ids=Object.keys(sources);
 const input={brief,entities:[['brand','brand',brief.brandName,brief.website,[]]],observations:[],sources,evidenceByQuestion:{perception:['s4','s1','s2','s3'],readiness:['s8','s6','s7']}};
 const reviewed=reviewedManagedEvidence(input,[{ids,verdicts:'ppppprrr',candidates:ids}]);
 assert.deepEqual(Object.keys(reviewed.sectionInput('perception',3,{targeted:true}).sources),['s1','s3','s4']);
 assert.deepEqual(Object.keys(reviewed.sectionInput('perception',3,{targeted:true,excludedProofs:new Set(['s1','s2'])}).sources),['s3','s4']);
 assert.deepEqual(Object.keys(reviewed.sectionInput('readiness',3,{targeted:true}).sources),['s6','s7']);
});

test('a recovery verdict must cover exactly the evidence sent in order',async()=>{
 const rows=[{id:'s3',proof:['s3']},{id:'s1',proof:['s1']}];
 const sources={s3:['https://example.test/a','Ürün','html','Kamuya açık ürün bilgisi.'],s1:['https://example.test/b','Kanal','html','Kamuya açık kanal bilgisi.']};
 const providers={worker:async(stage,request,schema,options)=>{
  assert.equal(stage,'v8-managed-evidence-position:compact-recovery');
  assert.equal(schema.properties.verdicts.maxItems,2);
  assert.deepEqual(request.rows.map(([id])=>id),['s3','s1']);
  assert.throws(()=>options.normalizeData({verdicts:['r'],candidates:[]}),{code:'model_output_invalid'});
  return {data:options.normalizeData({verdicts:['r','c'],candidates:['s3']})};
 }};
 const [review]=await reviewPositionalEvidenceBatch({rows,sources},{providers,preferWorker:true});
 assert.deepEqual(review.ids,['s3','s1']);
 assert.equal(review.verdicts,'rc');
 assert.deepEqual(review.candidates,['s3']);
});

test('a paid report checkpoint with clipped Unicode is persisted once and reused without another charge',async t=>{
 const {ledger,close}=await localBudget();t.after(close);
 const key='audit:synthesis:unicode-replay';
 const report={summary:'Atıştırmalık 😀',findings:[{statement:'Kesilmiş kaynak '+String.fromCharCode(0xd83d),note:'Sağlayıcı\0alıntısı'}]};
 const saved=await ledger.once(key,{version:1},125,async()=>report);
 assert.equal(saved.summary,report.summary);
 assert.equal(saved.findings[0].statement,'Kesilmiş kaynak �');
 assert.equal(saved.findings[0].note,'Sağlayıcı�alıntısı');
 assert.deepEqual(await ledger.once(key,{version:1},125,()=>assert.fail('paid synthesis must not repeat')),saved);
 assert.equal((await ledger.status()).chargedKurus,625);
});

test('research and synthesis reserve independently, including parallel calls and persistent policy',async t=>{
 const {ledger,close}=await localBudget();t.after(close);
 const phase=await managedPhaseBudget({ledger,brief,phase:'brand_plan',enabled:true});
 const claims=await Promise.allSettled([1,2,3].map(i=>phase.ledger.once('research:'+i,{},1000,async()=>i)));
 assert.equal(claims.filter(r=>r.status==='fulfilled').length,2);
 assert.equal((await ledger.status()).chargedKurus,2500);
 const review=await managedPhaseBudget({ledger,brief,phase:managedReviewPhases[0],enabled:false});
 assert.equal(review.managedAudit,true);
 assert.equal(review.managedBudgetVersion,4);
 assert.equal(review.phaseCeiling,3000);
 await assert.rejects(review.ledger.once('oversized-review',{},501,async()=>assert.fail('review cannot borrow report funds')),error=>error.code==='budget_limit');
 await review.ledger.once('claude-review',{},500,async()=>({}));
 const synthesis=await managedPhaseBudget({ledger,brief,phase:'synthesis',enabled:false});
 assert.equal(synthesis.phaseCeiling,5000);
 await synthesis.ledger.once('claude',{},1600,async()=>({}));
 const scope=await managedPhaseBudget({ledger,brief,phase:'scope',enabled:false});
 await assert.rejects(scope.ledger.once('scope-over',{},401,async()=>assert.fail('paid provider called')),error=>error.code==='budget_limit');
 await scope.ledger.once('scope',{},400,async()=>({}));
 assert.equal((await ledger.status()).chargedKurus,5000);
});

test('live-sized report responses finish five sections and repair only missing grounded findings after a paid cut',{timeout:30000},async t=>{
 const wire=await localBudget({lead:'managed-replay-454'});t.after(wire.close);
 const evidence=packet();
 const context=sequentialContext(brief,{packet:evidence,searches:[],peerDiscoveryVersion:'product-v2'},{includeTechnicalSignals:true});
 const specifications={
  competition:[['none','peer0',/Organic Alpha Türkiye/],['none','peer1',/Organic Beta Türkiye/]],
  digital:[['none','',/başlık ve açıklama meta verileri/],['none','',/e-posta bültenine/]],
  swot:[['strength','',/doğrudan tüketiciye satılır/],['weakness','',/teslimat gecikmesini/],['opportunity','',/tekrar satın alma/],['threat','',/hammadde maliyetleri/]],
  perception:[['none','',/teslimat gecikmesini/],['none','',/müşterileri içerik açıklaması/]],
  readiness:[['none','',/teslimat süresi/],['none','',/ekip büyüklüğü/]]
 };
 const types={competition:'c',digital:'d',swot:'s',perception:'p',readiness:'r'};
 const areas={competition:'competition_1',digital:'digital_1',swot:'operations_1',perception:'perception_1',readiness:'financial_1'};
 const records=Object.entries(specifications).flatMap(([section,rows])=>rows.map(([quadrant,peerId,match])=>{
  const card=context.cards.find(item=>match.test(item.quote));
  assert.ok(card,section);
  return {section,quadrant,peerId,card};
 }));
 const inventory=[{observations:records.map(record=>({area:areas[record.section],text:record.card.quote,sourceIds:[record.card.id]}))}];
 const args={brief,brand:{facts:[]},plan:{understanding:{goals:brief.goals},tasks:[],coveragePolicy:2},context,inventory};
 const initial=planPositionalEvidenceReview(managedReportInput(args).input).flatMap(batch=>batch.rows).length;
 inventory[0].observations.push(...Array.from({length:454-initial},(_,i)=>({area:'operations_2',text:'Kaynaklı arşiv satırı '+i+'.',sourceIds:[records.at(-1).card.id]})));
 const {input}=managedReportInput(args),batches=planPositionalEvidenceReview(input),rows=batches.flatMap(batch=>batch.rows);
 assert.equal(rows.length,454);
 const omitted=new Set([...rows.slice(0,135).map(row=>row.id),rows.at(-1).id]);
 const resubmitted=new Set(),initialSeen=new Set(),sectionCounts=[],sectionWrites=[],saved=new Map();
 const firstPair=Promise.withResolvers();
 let active=0,peak=0,readinessCountRetry=false;
 const options={anthropicKey:'synthetic',receiptVersion:'v8',now:()=>Date.parse('2026-11-12T12:00:00Z'),
  researchFx:async()=>({usdTry:44}),fetchImpl:async(url,{body})=>{
   const request=JSON.parse(body);
   const requestInput=JSON.parse(request.messages[0].content);
   const countBody=Object.fromEntries(Object.entries(request).filter(([key])=>key!=='max_tokens'));
   // Include the system prompt and structured-output schema, as Anthropic
   // does. The report counts exercise the range the live writer rejected.
   const inputTokens=Math.max(requestInput.rows?1800:7500,Math.ceil(Buffer.byteLength(JSON.stringify(countBody))/4));
   if(url.endsWith('/count_tokens')){
    if(request.system.includes('yalnız '+managedSections.readiness+' bölümünü')&&!readinessCountRetry){
     readinessCountRetry=true;
     return new Response('temporary proxy error',{status:503});
    }
    if(!requestInput.rows)sectionCounts.push(inputTokens);
    return Response.json({input_tokens:inputTokens});
   }
   let data,cut=false,output=460;
   if(requestInput.rows){
    const followup=requestInput.rows.every(([id])=>initialSeen.has(id));
    for(const [id] of requestInput.rows)(followup?resubmitted:initialSeen).add(id);
    data={verdicts:Object.fromEntries(requestInput.rows.filter(([id])=>followup||!omitted.has(id)).map(([id])=>[id,types[records[Number(id.slice(1))-1]?.section]||'g'])),
     candidates:requestInput.rows.map(([id])=>id).filter(id=>Number(id.slice(1))<=records.length&&id.startsWith('o'))};
   }else{
    const section=Object.keys(managedSections).find(id=>request.system.includes('yalnız '+managedSections[id]+' bölümünü'));
    assert.ok(section);
    const schema=(request.output_config?.format?.schema||request.tools[0].input_schema).properties;
    const attempt=sectionWrites.filter(id=>id===section).length;
    sectionWrites.push(section);
    peak=Math.max(peak,++active);
    if(sectionWrites.length===2)firstPair.resolve();
    if(sectionWrites.length<=2)await firstPair.promise;
    active--;
    const relevant=records.filter(row=>row.section===section&&(section!=='swot'||Object.hasOwn(schema,row.quadrant)));
    cut=section==='readiness'&&attempt===0;
    output=section==='competition'&&attempt===0?15:section==='swot'&&attempt===0?1730:section==='digital'?1340:section==='perception'?1330:890;
    assert.ok(cut||request.max_tokens>=output,section+' must fund a live-sized response');
    if(section==='perception')assert.equal(Object.hasOwn(schema.findings.items.properties,'quadrant'),false);
    if(section==='swot'&&attempt===1){
     assert.deepEqual(Object.keys(schema),['weakness']);
     assert.equal(requestInput.prior.length,3);
    }
    const alias=card=>Object.keys(requestInput.sources).find(id=>requestInput.sources[id][3]===card.quote&&requestInput.sources[id][0]===card.url);
    const findings=relevant.map(({card,peerId})=>{
     assert.ok(alias(card),section+' must receive its evidence');
     return {area:areas[section],...(section==='competition'?{peerId,overlap:'Türkiye pazarında aynı ürün grubunun üreticisi.'}:{}),observation:card.quote,proof:[alias(card)],kind:'observation',
      analysis:'Bu koşul müşterinin satın alma kararını etkileyebilir.',action:'Ürün sayfasında bu koşulu belirginleştir ve kontrollü test et.',
      measurement:'Kontrol ve test grubunun sepete ekleme oranını ölç.',limitation:'Gerçek dönüşüm oranı bu kaynakta ölçülmedi.',question:'Karşılaştırılabilir dönem verisi var mı?'};
    });
    data=section==='swot'?Object.fromEntries(relevant.map(({quadrant},i)=>[quadrant,[
     quadrant==='weakness'&&attempt===0?{...findings[i],observation:'Marka Türkiye genelinde 500 mağaza işletiyor.'}:findings[i]
    ]])):section==='competition'&&attempt===0?{findings:findings.map((finding,i)=>({...finding,proof:findings[1-i].proof}))}:
     {findings:section==='digital'?[{...findings[0],area:'unknown_area'},...findings]:findings};
   }
   const tool=Boolean(request.tools);
   if(cut)output=request.max_tokens;
   return Response.json({model:request.model,stop_reason:cut?'max_tokens':tool?'tool_use':'end_turn',usage:{input_tokens:inputTokens,output_tokens:output},
    content:tool?[{type:'tool_use',name:'emit_bhs_stage',input:data}]:[{type:'text',text:cut?'{"findings":[':JSON.stringify(data)}]});
  }};
 const research=await managedPhaseBudget({ledger:wire.ledger,brief,phase:'brand_plan',enabled:true});
 await research.ledger.once('existing-research-cost',{},1750,async()=>({}));
 const reviewBudget=await managedPhaseBudget({ledger:wire.ledger,brief,phase:'coverage_sources'});
 const reviewed=await reviewBudget.ledger.once('simulated-review-worker',{},400,async()=>{
  const providers=createSupervisedProviders({...options,ledger:stageBudgetLedger(reviewBudget.ledger,'coverage_sources',{phaseLimitKurus:3000})}),results=[];
  for(const batch of batches)results.push(...await reviewPositionalEvidenceBatch(batch,{providers,focus:{goals:brief.goals}}));
  assert.ok((await wire.ledger.status()).chargedKurus<=3000);
  return {results};
 },{settle:()=>150});
 assert.deepEqual(resubmitted,omitted);
 assert.equal(reviewedManagedEvidence(input,reviewed.results).coverage.reviewedEvidenceRows,454);
 const reportBudget=await managedPhaseBudget({ledger:wire.ledger,brief,phase:'synthesis'});
 const providers={...createSupervisedProviders({...options,ledger:stageBudgetLedger(reportBudget.ledger,'synthesis',{phaseLimitKurus:reportBudget.phaseCeiling})}),
  checkpoint:async(name,key,save)=>{const value=await save();saved.set(JSON.stringify([name,key]),value);return value;},
  readCheckpoint:async(name,key)=>saved.get(JSON.stringify([name,key]))};
 const inputArgs={...args,providers,batchReviews:reviewed.results,sectional:true,allowPartial:true};
 const synthesis=await reportBudget.ledger.once('simulated-writing-worker',{},400,
  ()=>synthesizeManagedReport(inputArgs),{settle:()=>140});
 assert.deepEqual(sectionWrites.slice(0,2).sort(),['competition','digital']);
 assert.deepEqual(sectionWrites.slice(2,4).sort(),['perception','swot']);
 assert.equal(sectionWrites[4],'readiness');
 assert.deepEqual(sectionWrites.slice(5,7).sort(),['competition','swot']);
 assert.equal(sectionWrites[7],'readiness');
 assert.equal(peak,2);
 assert.equal(readinessCountRetry,true);
 assert.equal(sectionCounts.length,sectionWrites.length);
 assert.ok(sectionCounts.every(tokens=>Math.ceil(tokens*1.2)+4096>11000));
 assert.equal(synthesis.reportIssue,undefined);
 assert.equal(saved.size,7);
 assert.equal((await wire.ledger.status()).chargedKurus<=reportBudget.phaseCeiling,true);
 assert.equal((await wire.ledger.status()).chargedKurus<=5000,true);
 const audit=directAuditResult(brief,{...synthesis,analysisPacket:context.packet,methodologyVersion:sequentialVersion,
  supervision:{reviewMode:'managed-audit',evidenceCoverage:synthesis.evidenceCoverage}});
 assert.equal(audit.status,'ready');
 assert.ok(audit.data.bhsSections.every(section=>section.complete));
 const proposal=selectProposalAudit(audit.data,brief);
 assert.equal(proposal.findings.length,12);
 assert.ok(proposal.findings.every(row=>row.recommendation.action&&row.recommendation.measurement&&row.sourceIds.length));
 const recovered=await synthesizeManagedReport({...inputArgs,savedSectionsOnly:true,providers:{...providers,manager:()=>assert.fail('restoring an offer cannot buy a call')}});
 assert.deepEqual(recovered.report.bhsSections,synthesis.report.bhsSections);
 for(const [key,value] of saved)if(value.section==='readiness')saved.delete(key);
 const partial=await synthesizeManagedReport({...inputArgs,savedSectionsOnly:true,providers:{...providers,manager:()=>assert.fail('restoring a partial offer cannot buy a call')}});
 const partialAudit=continuationAudit(brief,{reason:partial.reportIssue,synthesis:{...partial,analysisPacket:context.packet,methodologyVersion:sequentialVersion,
  supervision:{reviewMode:'managed-audit',evidenceCoverage:partial.evidenceCoverage,reportIssue:partial.reportIssue}}});
 assert.equal(partialAudit.status,'ready');
 assert.deepEqual(partialAudit.data.bhsSections.filter(section=>section.complete).map(section=>section.id),['competition','digital','swot','perception']);
 assert.equal(selectProposalAudit(partialAudit.data,brief).findings.length,10);
});

test('unused research budget cannot increase the synthesis or offer allowance',async t=>{
 const {ledger,close}=await localBudget();t.after(close);
 const phase=await managedPhaseBudget({ledger,brief,phase:'brand_plan',enabled:true});
 await phase.ledger.once('early',{},1300,async()=>({}));
 const synthesis=await managedPhaseBudget({ledger,brief,phase:'synthesis',enabled:true});
 assert.equal(synthesis.phaseCeiling,3800);
 await assert.rejects(synthesis.ledger.once('over',{},2001,async()=>assert.fail('paid provider called')),error=>error.code==='budget_limit');
 assert.equal((await ledger.status()).chargedKurus,1800);
});

test('an incomplete result can use only the remaining original BHS budget once',async t=>{
 const base=await localBudget({lead:'managed-base'});t.after(base.close);
 await base.ledger.once('test-base',{},3500,async()=>({}));
 let modelCalls=0;
 const input={brief,synthesis:{supervision:{reviewMode:'managed-audit',researchPlan:{}},report:{findings:[]}},sections:['digital'],secret:'synthetic-test-secret',baseLedger:base.ledger,
  getGapLedger:async()=>assert.fail('a fresh gap must use the original ledger'),previous:async()=>({}),
  getProviders:({ledger})=>({manager:async()=>{
   await ledger.once('test-gap-provider',{},1000,async()=>{modelCalls++;return {};});
   await assert.rejects(ledger.once('over',{},1,async()=>assert.fail('provider called above 50 TRY')),error=>error.code==='budget_limit');
   throw new BudgetError('model_temporarily_unavailable','Simulated provider failure.');
  }})};
 assert.equal(await resolveManagedGaps({...input,action:'status',allowance:false}),null);
 assert.deepEqual(await resolveManagedGaps({...input,action:'status'}),{available:true,sections:[managedSections.digital],capKurus:1000});
 assert.deepEqual(await resolveManagedGaps({...input,action:'complete_gaps'}),{available:false,chargedKurus:1000,capKurus:1000,status:'uncertain'});
 assert.equal((await resolveManagedGaps({...input,action:'complete_gaps'})).status,'uncertain');
 assert.equal(modelCalls,1);
 assert.equal((await base.ledger.status()).chargedKurus,5000);
});

test('gap completion preserves prior findings and the new rival publisher citations',()=>{
 const fact={id:'existing',bhsSection:'digital',dimension:'digital',statement:'Verified product claim',sourceIds:['saved']};
 const peer={id:'peer-new',website:'https://rival.example',sourceIds:['publisher']};
 const rival={...fact,id:'rival-finding',bhsSection:'competition',dimension:'competition',peerId:peer.id,sourceIds:['comparison']};
 const original={findings:[fact],competitors:[],sources:[{id:'saved'}],meetingQuestions:[],dimensions:[{id:'competition',findingIds:[]}]};
 const patch={findings:[rival,{...rival,id:'duplicate'},{...fact,id:'out-of-scope'}],competitors:[peer],sources:[{id:'publisher'},{id:'comparison'}],meetingQuestions:[]};
 const merged=mergeManagedGapReport(original,patch,['competition']);
 assert.deepEqual(merged.findings,[fact,{...rival,bhsRank:1}]);
 assert.deepEqual(merged.competitors,[peer]);
 assert.deepEqual(merged.sources.map(s=>s.id),['saved','publisher','comparison']);
 assert.deepEqual(merged.dimensions[0].findingIds,['rival-finding']);
 assert.deepEqual(original.findings,[fact]);
});

test('SWOT repairs receive reviewed market evidence when an external quadrant is missing',()=>{
 const input={observations:[],entities:[],sources:Object.fromEntries(Array.from({length:12},(_,i)=>['s'+i,[
  'https://'+(i<6?'brand':'industry')+'.example/'+i,'Public source','html',i<6?'Brand product description.':'Market demand and competition data.'
 ]]))};
 const ids=Object.keys(input.sources);
 const reviewed=reviewedManagedEvidence(input,[{ids,verdicts:'ssssssgggggg',candidates:ids}]);
 const scoped=reviewed.sectionInput('swot',6,{targeted:true,priorityProofs:ids.slice(0,6),swotFocus:['threat']});
 assert.equal(Object.keys(scoped.sources).filter(id=>ids.slice(6).includes(id)).length,4);
 assert.ok(Object.hasOwn(scoped.sources,'s0'));
});

test('an oversized market and five actors preserve the paid Claude plan and its six candidate names',async()=>{
 const focusedBrief={...brief,goals:'Fransa B2B dağıtımı',needs:'Depolama ve bayi edinimi',meetingNotes:'Mevcut ihracat ekibi ile yürütülecek.'};
 const tasks=Object.keys(managedSections).map(section=>({section,platform:'Fransa B2B toptancı siteleri',query:section+' barres avoine grossiste France',metrics:['Minimum sipariş adedi'],purpose:'Bayi uyumunu değerlendirmek'}));
 const peerNames=Array.from({length:6},(_,i)=>'Research candidate '+i);
 const actors=managedActors.slice(0,5).map(id=>({id,platform:'Resmî kanal',purpose:'Kaynağı doğrula'}));
 const market='Fransa B2B dağıtımı '+ 'a'.repeat(93);
 const providers={manager:async(name,input,schema,options)=>{
  assert.equal(name,'v8-managed-research-plan');
  assert.deepEqual(input.brief,focusedBrief);
  assert.equal(input.sectorEvidence[0][0],'https://industry.example/report');
  assert.equal(schema.properties.actors.maxItems,managedActors.length);
  return {data:options.normalizeData({tasks,peerNames,actors,market})};
 }};
 const result=await planManagedResearch({brief:focusedBrief,brand:{facts:[],review:{}},sector:{results:[{url:'https://industry.example/report',title:'Industry',content:'Source excerpt'}]},providers});
 assert.deepEqual(result.tasks,tasks);
 assert.equal(market.length,113);
 assert.equal(result.market.length,110);
 assert.deepEqual(result.actors,actors);
 assert.deepEqual(result.peerNames,peerNames);
 const missing=await planManagedResearch({brief:focusedBrief,brand:{facts:[],review:{}},providers:{manager:async()=>({data:{tasks:tasks.slice(1),peerNames}})}});
 assert.deepEqual(missing.tasks.slice(1),tasks.slice(1));
 assert.equal(missing.tasks[0].section,'competition');
 assert.deepEqual(missing.peerNames,peerNames);
});

test('single perception and readiness tasks receive different, brand-scoped research questions',()=>{
 const perception={section:'perception',query:'"Test Marka" müşteri şikayetleri'};
 const readiness={section:'readiness',query:'"Test Marka" ihracat gereklilikleri'};
 const plan={tasks:[perception,readiness],market:'Türkiye',comparableProduct:'yulaf barı',understanding:{requirements:['Bayi edinimi']}};
 const [reviews,channels]=managedCoverageSearches(brief,plan);
 assert.match(reviews,/Türkiye.*müşteri değerlendirmeleri/);
 assert.match(channels,/Bayi edinimi.*Türkiye.*dağıtım kanalları/);
 assert.notEqual(reviews,perception.query);assert.notEqual(channels,readiness.query);
 assert.deepEqual(managedCoverageSearches(brief,{...plan,tasks:[...plan.tasks,{...perception,query:reviews},{...readiness,query:channels}]}),[]);
});

test('ranked actions, metrics, questions and proofs survive report and partial offer handoff',async t=>{
 const evidence=packet();
 const context=sequentialContext(brief,{packet:evidence,searches:[],peerDiscoveryVersion:'product-v2'},{includeTechnicalSignals:true});
 const specs=[
  ['competition','none','peer0',/Organic Alpha Türkiye/],
  ['competition','none','peer1',/Organic Beta Türkiye/],
  ['digital','none','',/başlık ve açıklama meta verileri/],
  ['digital','none','',/e-posta bültenine/],
  ['swot','strength','',/doğrudan tüketiciye satılır/],
  ['swot','weakness','',/teslimat gecikmesini/],
  ['swot','opportunity','',/tekrar satın alma/],
  ['swot','threat','',/hammadde maliyetleri/],
  ['perception','none','',/teslimat gecikmesini/],
  ['readiness','none','',/teslimat süresi/],
  ['readiness','none','',/e-posta bültenine/],
 ];
 const citations=specs.map(([, , ,pattern])=>context.cards.find(c=>pattern.test(c.quote)));
 assert.ok(citations.every(Boolean));
 const question='Teslimat sürelerini sipariş bazında hangi kaynaktan izliyorsunuz?';
 const inventory=[{observations:citations.map(c=>({area:'synthetic',text:c.quote,sourceIds:[c.id]}))}];
 const answer=input=>{
  if(input.rows){
   const rows=reviewRows(input),result=batchAnswer(rows,rows.filter(row=>row.text).map(row=>row.id));
   result.data.verdicts.r=rows.slice(0,3).map(row=>row.id).join(' ');
   return result;
  }
  assert.equal(input.observations.length,citations.length);
  const alias=card=>Object.keys(input.sources).find(id=>input.sources[id][0]===card.url&&input.sources[id][3]===card.quote);
  return {model:'claude-sonnet-5-5',data:{
   peers:['peer0','peer1'].map((entityId,i)=>({entityId,relationship:'direct',sourceIds:[alias(citations[i])],reason:'Aynı ürün grubunda ve aynı pazarda satış.'})),
   benchmarks:[],questions:[],invalidObservations:[],
   findings:specs.map(([section,quadrant,peerId],i)=>({
    section,quadrant,peerId,rank:specs.slice(0,i+1).filter(row=>row[0]===section).length,
    area:methodologyAreas.find(a=>a.dimension===({swot:'operations',readiness:'operations'})[section]||a.dimension===section)?.key||methodologyAreas[0].key,
    observation:citations[i].quote,proof:[alias(citations[i])],kind:'observation',
    analysis:'Satın alma öncesi belirsizlik müşterinin kararını uzatabilir.',action:'Ürün sayfasına teslimat bilgisi modülü ekle ve kontrollü test et.',
    measurement:'Teslimat bilgisi görüntüleyen oturumlarda sepete ekleme oranını karşılaştır.',limitation:'Gerçek müşteri davranışı ölçülmedi.',question:i===8?question:''
   }))
  }};
 };
 const wire=await localBudget({lead:'managed-wire'});t.after(wire.close);
 const providers=createSupervisedProviders({ledger:stageBudgetLedger(wire.ledger,'synthesis'),anthropicKey:'synthetic',receiptVersion:'v8',
  now:()=>Date.parse('2026-11-12T12:00:00Z'),researchFx:async()=>({usdTry:44}),fetchImpl:async(url,{body})=>{
   if(url.endsWith('/count_tokens'))return Response.json({input_tokens:2500});
   assert.ok(url.endsWith('/v1/messages'));
   const input=JSON.parse(JSON.parse(body).messages[0].content);
   return Response.json({model:'claude-sonnet-5-5',stop_reason:'end_turn',usage:{input_tokens:2500,output_tokens:input.rows?230:1950},
    content:[{type:'text',text:JSON.stringify(answer(input).data)}]});
  }});
 const {report}=await synthesizeManagedReport({brief,brand:{facts:[],plan},plan:{},context,inventory,providers});
 assert.ok((await wire.ledger.status()).chargedKurus<2500);
 const synthesis={report,analysisPacket:context.packet,searchEvidence:[],methodologyVersion:sequentialVersion,supervision:{reviewMode:'managed-audit',researchPlan:{}}};
 const audit=directAuditResult(brief,synthesis);
 assert.deepEqual(audit.data.bhsSections.map(s=>[s.id,s.count,s.complete]),[
  ['competition',2,true],['digital',2,true],['swot',4,true],['perception',1,false],['readiness',2,true]
 ]);
 const continued=continuationAudit(brief,{verifiedAudit:audit,reason:'quality_review'});
 assert.equal(continued.status,'ready');
 const selected=selectProposalAudit(continued.data,brief);
 assert.equal(selected.findings.length,specs.length);
 assert.equal(selected.bhsSections.find(s=>s.id==='perception').complete,false);
 assert.ok(selected.findings.every(f=>f.recommendation.action&&f.recommendation.measurement&&f.sourceIds.length));
 assert.deepEqual(selected.meetingQuestions,[question]);

 const priorEnv=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 t.after(()=>{if(priorEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=priorEnv;});
 const db=await localBudget();t.after(db.close);
 const cost=await db.ledger.status(),host='managed.preview.example',secret='managed-integration-test-secret';
 const phases=sequentialPhases.filter(phase=>phase!=='complete');
 const checkpoints=new Map(phases.map(phase=>[stageKey(brief,phase,'v8'),{state:'complete',value:
  phase==='synthesis'?synthesis:phase==='scope'?{scopePlan:fallbackScope(brief),proposalCopy:offerCopy(null,report)}:{}}]));
 const ledger={...db.ledger,get:key=>checkpoints.get(key)||db.ledger.get(key)};
 const completed={id:'synthetic-job',state:'complete',briefHash:audit.data.briefHash,budgetId:cost.id};
 const handler=createBoundedAuditHandler({
  getResearchVersion:()=>'v8',getResearchModel:()=>'claude-sonnet-5-5',getSecret:()=>secret,getLedger:async()=>ledger,getGapLedger:()=>assert.fail('extra research before opt-in'),
  isBackgroundEnabled:()=>true,getQueue:async()=>({find:async()=>completed,read:async()=>completed}),
  getProviders:()=>assert.fail('no provider expected'),validateWebsite:async()=>{},logger:{}
 });
 let cookie;
 const request=async body=>{
  const res=response();
  await handler({method:'POST',headers:{host,origin:'https://'+host,cookie},body:{brief,...body}},res);
  if(res.headers['Set-Cookie'])cookie=res.headers['Set-Cookie'][0].split(';')[0];
  return res;
 };
 const initial=await request({action:'start',requestId:'managed_bhs_test_request',context:{leadId:'lead',spaceId:'space'}});
 assert.equal(initial.code,200,JSON.stringify(initial.data));
 assert.equal(initial.data.result.status,'ready');
 assert.equal(initial.data.gapCompletion.available,true);
 assert.ok(initial.data.pricingProof);
 checkpoints.get(stageKey(brief,'sector_draft','v8')).value.toolIssues=['provider_error'];
 const affected=await request({action:'status',ticket:initial.data.ticket});
 assert.equal(affected.code,200);
 assert.equal(affected.data.gapCompletion.available,true);
 assert.deepEqual(affected.data.gapCompletion.sections,[managedSections.perception]);
 assert.ok(affected.data.pricingProof);
 assert.equal(affected.data.result.data.findings.length,specs.length);
 completed.state='paused';completed.phase='scope';
 const paused=await request({action:'status',ticket:initial.data.ticket});
 assert.equal(paused.code,200);
 assert.equal(paused.data.result.data.findings.length,specs.length);
 assert.equal(paused.data.result.data.researchContinuity.status,'partial');
 assert.deepEqual(paused.data.gapCompletion.sections,[managedSections.perception]);
 assert.ok(paused.data.pricingProof);
 completed.state='cancelled';
 const cancelled=await request({action:'status',ticket:initial.data.ticket});
 assert.deepEqual(cancelled.data.gapCompletion.sections,[managedSections.perception]);
 assert.ok(cancelled.data.pricingProof);
 assert.equal((await ledger.status()).chargedKurus,500);
});

test('all 1000 observations are reviewed across background phases before the report and late high-priority evidence survives',async()=>{
 const evidence=packet(),context=sequentialContext(brief,{packet:evidence,searches:[],peerDiscoveryVersion:'product-v2'},{includeTechnicalSignals:true});
 const proof=context.cards[0];
 const inventory=[{observations:Array.from({length:1000},(_,i)=>({area:'digital_1',
  text:'Verbatim row '+i+' '+('Complete original text and source evidence. '.repeat(7)),sourceIds:[proof.id]}))}];
 const args={brief,brand:{facts:[]},plan:{understanding:{goals:brief.goals}},context,inventory};
 const {input}=managedReportInput(args),batches=planManagedEvidenceReview(input);
 assert.ok(batches.length>4);
 const seen=new Map(),closed={collectionClosed:true,reviewBatches:batches},receipts=new Map();
 const providers={manager:()=>assert.fail('Sonnet is reserved for synthesis on large archives'),evidenceReviewer:async(name,payload)=>{
  assert.equal(name,'v8-managed-evidence-batch');
  const rows=reviewRows(payload);
  for(const row of rows)if(row.text){
   assert.equal(seen.has(row.id),false);
   seen.set(row.id,row.text);
   assert.equal(payload.sources[row.proof[0]][3],proof.quote);
  }
  return batchAnswer(rows,[rows.find(row=>row.id==='o1000')?.id||rows[0].id]);
 }};
 for(const phase of managedReviewPhases){
  const result=await runCollectionFirstStage({phase,brief,providers,previous:async name=>
   name==='sector_sources'?{managedPlan:args.plan,funding:{}}:closed,finish:data=>data});
  receipts.set(phase,result.reviews);
 }
 const report=reviewedManagedEvidence(input,[...receipts.values()].flat());
 assert.equal(seen.size,1000);
 for(const [id,,text] of input.observations)assert.equal(seen.get(id),text);
 assert.equal(report.coverage.reviewed,1000);
 assert.equal(report.coverage.complete,true);
 assert.ok(report.reportInput().observations.some(row=>row[0]==='o1000'));
});

test('a missing verdict or an unfunded batch cannot be counted as reviewed',async()=>{
 const input={entities:[],observations:[['o1','digital_1','First observation',['s1']],['o2','digital_1','Second observation',['s1']]],
  sources:{s1:['https://example.test/','Proof','html','Original evidence text']}};
 const [batch]=planManagedEvidenceReview(input);
 const [bad]=await reviewManagedEvidenceBatch(batch,{focus:{},providers:{manager:async()=>batchAnswer(batch.rows.slice(0,1),['o1'])}});
 assert.equal(bad.issue,'model_output_invalid');
 assert.equal(reviewedManagedEvidence(input,[bad]).coverage.complete,false);
 const [stopped]=await reviewManagedEvidenceBatch(batch,{focus:{},providers:{manager:async()=>{throw new BudgetError('budget_limit','Cannot reserve');}}});
 assert.equal(stopped.issue,'budget_limit');
 const [network]=await reviewManagedEvidenceBatch(batch,{focus:{},providers:{manager:async()=>{throw new TypeError('fetch failed');}}});
 assert.equal(network.issue,'provider_error');
 const [ok]=await reviewManagedEvidenceBatch(batch,{focus:{},providers:{manager:async()=>batchAnswer(batch.rows,['o2'],new Set(['o1']))}});
 const reviewed=reviewedManagedEvidence(input,[ok]);
 assert.equal(reviewed.coverage.complete,true);
 assert.deepEqual(reviewed.invalidObservations,['o1']);
 assert.deepEqual(reviewed.reportInput().observations.map(row=>row[0]),['o2']);
});

test('each paid evidence batch retains known rows across topic overlap and preserves genuinely conflicting decisions',async()=>{
 const rows=['o1','o2','o3'].map(id=>({id,area:'digital_1',text:id,proof:['s1']}));
 const sources={s1:['https://example.test/','Proof','html','Original evidence text']};
 const input={entities:[],observations:rows.map(row=>[row.id,row.area,row.text,row.proof]),sources};
 const [review]=await reviewManagedEvidenceBatch({rows,sources},{focus:{},providers:{manager:async()=>({data:{
  verdicts:{c:'o1 o2',d:'o1',s:'',p:'unknown',r:'',g:'',u:'',x:'o2 o3'},candidates:['o2','o1','o1','o3','unknown']
 }})}});
 assert.equal(review.issue,undefined);
 const saved=reviewedManagedEvidence(input,[review]);
 assert.equal(saved.coverage.complete,true);
 assert.deepEqual(saved.invalidObservations,['o3']);
 assert.deepEqual(saved.candidates,['o2','o1']);
 assert.equal(saved.verdict('o2'),'u');
});

test('a final report failure can hand off the reviewed source with no invented action or extra model call',async()=>{
 const context=sequentialContext(brief,{packet:packet(),searches:[],peerDiscoveryVersion:'product-v2'},{includeTechnicalSignals:true});
 const proof=context.cards.find(card=>/başlık ve açıklama meta verileri/.test(card.quote));
 const inventory=[{observations:[{area:'digital_1',text:proof.quote,sourceIds:[proof.id]}]}];
 const calls=[];
 const result=await synthesizeManagedReport({brief,brand:{facts:[]},plan:{},context,inventory,allowPartial:true,providers:{manager:async(name,input)=>{
  calls.push(name);
  if(input.rows)return batchAnswer(reviewRows(input),['o1']);
  throw new DOMException('synthetic provider timeout','TimeoutError');
 }}});
 assert.equal(result.reportIssue,'model_timeout');
 const statements=result.report.findings.map(finding=>finding.statement);
 assert.equal(statements[0],proof.quote);
 assert.ok(statements.every(statement=>context.cards.some(card=>card.quote===statement)));
 assert.ok(result.report.findings.every(finding=>!finding.recommendation&&finding.sourceIds.length));
 assert.deepEqual(calls,['v8-managed-evidence-batch','v8-managed-actionable-report']);
 const audit=directAuditResult(brief,{report:result.report,analysisPacket:context.packet,methodologyVersion:sequentialVersion,
  supervision:{reviewMode:'managed-audit',reportIssue:result.reportIssue,evidenceCoverage:result.evidenceCoverage}});
 assert.equal(audit.status,'review');
 const continued=continuationAudit(brief,{verifiedAudit:audit,reason:result.reportIssue});
 assert.equal(continued.status,'ready');
 assert.equal(continued.data.quality.contentComplete,false);
 assert.match(continued.data.researchContinuity.notice,/Doğrulanan bulgular hazır/);
 assert.deepEqual(selectProposalAudit(continued.data,brief).findings.map(finding=>finding.statement).sort(),[...statements].sort());
});

test('raw sources are stored once in bounded parallelism without a paid reservation or text loss',async t=>{
 const db=await localBudget({lead:'managed-archive'});t.after(db.close);
 const ledger=stageBudgetLedger(db.ledger,'sector_correction_sources',{phaseLimitKurus:3000});
 const pages=Array.from({length:11},(_,index)=>({finalUrl:`https://example.test/source-${index}`,method:'html',text:`Full unmodified page ${index}`}));
 const written=[];let active=0,peak=0;
 const providers={checkpoint:async(name,input,run)=>{
  active++;peak=Math.max(peak,active);
  try{
   const value=await ledger.once(`${name}:${input.url}`,input,0,run);
   written.push(JSON.parse(gunzipSync(Buffer.from(value.data,'base64'))));
  }finally{active--;}
 }};
 const collector=async(_brief,_plan,{archivePages})=>{await archivePages([...pages,pages[0]]);return {sources:pages};};
 const result=await readResearchPages(brief,plan,pages.map(page=>page.finalUrl),providers,collector);
 assert.equal(peak,4);
 assert.equal(result.sources.length,pages.length);
 assert.deepEqual(new Set(written.map(page=>JSON.stringify(page))),new Set(pages.map(page=>JSON.stringify(page))));
 assert.equal(written.length,pages.length);
 assert.equal((await ledger.status()).chargedKurus,500);
});

test('a truncated initial Claude plan keeps all required source searches active without another model call',async()=>{
 const phases=['sector_sources','sector_draft','sector_review'];
 const brand={facts:[{topic:'products',statement:'Kolonya ve kişisel bakım ürünleri'}],review:{marketContext:{description:'Türkiye'}}};
 const receipts=new Map([['brand',brand]]),searches=[];
 let calls=0;
 const providers={managedAudit:true,costStatus:async()=>({chargedKurus:1985,capKurus:5000}),
  checkpoint:async(_key,_input,run)=>run(),withCeiling:()=>providers,
  search:async query=>{searches.push(query);return {query,results:[]};},
  manager:async()=>{calls++;throw Object.assign(new BudgetError('incomplete','max_tokens'),{paidResponseRetained:true});}};
 for(const phase of phases)receipts.set(phase,await runCollectionFirstStage({phase,brief,providers,
  previous:async name=>receipts.get(name),finish:data=>data}));
 const first=receipts.get('sector_sources');
 assert.deepEqual(first.toolIssues,['incomplete']);
 assert.equal(first.managedPlan.plannerFallback,true);
 assert.deepEqual(new Set(first.managedPlan.tasks.map(task=>task.section)),new Set(Object.keys(managedSections)));
 assert.ok(first.managedPlan.tasks.filter(task=>task.section==='digital').every(task=>searches.includes(task.query)));
 assert.ok(searches.some(query=>query.includes('Kolonya')));
 assert.equal(calls,1);
 assert.equal(searches.length,first.managedPlan.tasks.length+1);
 let fallbacks=0;
 Object.assign(providers,{managedBudgetVersion:3,evidenceReviewer:async(stage,_input,_schema,options)=>{
  assert.equal(stage,'v8-managed-research-plan-fallback');
  fallbacks++;
  return {data:options.normalizeData({market:'Türkiye',comparableProduct:'Kolonya',peerNames:['Alpha','Beta']})};
 }});
 const recovered=await runCollectionFirstStage({phase:'sector_sources',brief,providers,
  previous:async name=>receipts.get(name),finish:data=>data});
 assert.equal(fallbacks,1);
 assert.equal(recovered.managedPlan.comparableProduct,'Kolonya');
 assert.deepEqual(recovered.managedPlan.peerNames,['Alpha','Beta']);
});
