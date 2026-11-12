import test from 'node:test';
import assert from 'node:assert/strict';
import {localBudget} from './fixtures/local-budget.mjs';
import {brief,packet,plan} from './fixtures/sequential.mjs';
import {capBhsLedger,managedPhaseBudget,managedReviewPhases} from '../src/bhs/managed-budget.mjs';
import {managedResearchHealthy,resolveManagedGaps} from '../src/bhs/managed-gaps.mjs';
import {planManagedResearch} from '../src/bhs/managed-research.mjs';
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

import {planManagedEvidenceReview,reviewManagedEvidenceBatch,reviewedManagedEvidence} from '../src/bhs/managed-evidence-review.mjs';
import {runCollectionFirstStage} from '../src/bhs/collection-first.mjs';

const reviewRows=({rows,sources})=>rows.map(([id,area,text,proof])=>({id,area,text:text?.quote?sources[text.quote][3]:text,proof}));
const batchAnswer=(rows,candidates,exclude=new Set())=>({data:{
 verdicts:{c:'',d:rows.filter(row=>!exclude.has(row.id)).map(row=>row.id).join(' '),s:'',p:'',r:'',g:'',u:'',
  x:rows.filter(row=>exclude.has(row.id)).map(row=>row.id).join(' ')},
 candidates
}});

test('research and synthesis reserve independently, including parallel calls and persistent policy',async t=>{
 const {ledger,close}=await localBudget();t.after(close);
 const phase=await managedPhaseBudget({ledger,brief,phase:'brand_plan',enabled:true});
 const claims=await Promise.allSettled([1,2,3].map(i=>phase.ledger.once('research:'+i,{},1250,async()=>i)));
 assert.equal(claims.filter(r=>r.status==='fulfilled').length,2);
 assert.equal((await ledger.status()).chargedKurus,3000);
 const review=await managedPhaseBudget({ledger,brief,phase:managedReviewPhases[0],enabled:false});
 assert.equal(review.managedAudit,true);
 assert.equal(review.phaseCeiling,5000);
 await review.ledger.once('claude-review',{},300,async()=>({}));
 const synthesis=await managedPhaseBudget({ledger,brief,phase:'synthesis',enabled:false});
 assert.equal(synthesis.phaseCeiling,5000);
 await synthesis.ledger.once('claude',{},1300,async()=>({}));
 const scope=await managedPhaseBudget({ledger,brief,phase:'scope',enabled:false});
 await assert.rejects(scope.ledger.once('scope-over',{},401,async()=>assert.fail('paid provider called')),error=>error.code==='budget_limit');
 await scope.ledger.once('scope',{},400,async()=>({}));
 assert.equal((await ledger.status()).chargedKurus,5000);
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

test('an incomplete content result enables an explicit, once-only extra account; failed tools do not',async t=>{
 const base=await localBudget({lead:'managed-base'});t.after(base.close);
 const child=await localBudget({lead:'managed-extra'});t.after(child.close);
 await base.ledger.once('test-base',{},4500,async()=>({}));
 const rows=[{state:'complete',value:{searches:[{results:[]}]}}];
 assert.equal(managedResearchHealthy(rows),true);
 assert.equal(managedResearchHealthy([...rows,{state:'complete',value:{toolIssues:['provider_error']}}]),false);
 assert.equal(managedResearchHealthy([{state:'complete',value:{scrapes:[{unavailable:true,reason:'actor_api_unavailable'}]}}]),false);
 assert.equal(managedResearchHealthy([{state:'complete',value:{unavailable:['model_temporarily_unavailable']}}]),false);
 assert.equal(managedResearchHealthy([{state:'complete',value:{costFallback:true}}]),false);
 assert.equal(managedResearchHealthy([{state:'complete',value:{supervision:{evidenceCoverage:{complete:false}}}}]),false);
 assert.equal(managedResearchHealthy([{state:'uncertain',value:{code:'budget_limit'}}]),false);
 let opened=0,modelCalls=0;
 const input={brief,synthesis:{supervision:{reviewMode:'managed-audit',researchPlan:{}},report:{findings:[]}},sections:['digital'],secret:'synthetic-test-secret',baseLedger:base.ledger,
  getGapLedger:async()=>{opened++;return child.ledger;},previous:async()=>({}),
  getProviders:({ledger})=>({manager:async()=>{
   await ledger.once('test-gap-provider',{},2500,async()=>{modelCalls++;return {};});
   throw new BudgetError('model_temporarily_unavailable','Simulated provider failure.');
  }})};
 assert.equal(await resolveManagedGaps({...input,action:'status',allowance:false}),null);
 assert.deepEqual(await resolveManagedGaps({...input,action:'status'}),{available:true,sections:[managedSections.digital],capKurus:3000});
 assert.equal(opened,0);
 assert.equal((await resolveManagedGaps({...input,action:'complete_gaps'})).status,'uncertain');
 assert.equal((await resolveManagedGaps({...input,action:'complete_gaps'})).status,'uncertain');
 assert.equal(modelCalls,1);
 assert.equal((await child.ledger.status()).chargedKurus,3000);
 await assert.rejects(capBhsLedger(child.ledger,3000).once('over',{},1,async()=>assert.fail('extra provider called')),error=>error.code==='budget_limit');
 assert.equal((await base.ledger.status()).chargedKurus+(await child.ledger.status()).chargedKurus,8000);
});

test('Claude receives the complete brief and specifies platforms and measures for all five areas',async()=>{
 const focusedBrief={...brief,goals:'Fransa B2B dağıtımı',needs:'Depolama ve bayi edinimi',meetingNotes:'Mevcut ihracat ekibi ile yürütülecek.'};
 const tasks=Object.keys(managedSections).map(section=>({section,platform:'Fransa B2B toptancı siteleri',query:section+' barres avoine grossiste France',metrics:['Minimum sipariş adedi'],purpose:'Bayi uyumunu değerlendirmek'}));
 const providers={manager:async(name,input)=>{
  assert.equal(name,'v8-managed-research-plan');
  assert.deepEqual(input.brief,focusedBrief);
  assert.equal(input.sectorEvidence[0][0],'https://industry.example/report');
  return {data:{tasks}};
 }};
 const result=await planManagedResearch({brief:focusedBrief,brand:{facts:[],review:{}},sector:{results:[{url:'https://industry.example/report',title:'Industry',content:'Source excerpt'}]},providers});
 assert.deepEqual(result.tasks,tasks);
 await assert.rejects(planManagedResearch({brief:focusedBrief,brand:{facts:[],review:{}},providers:{manager:async()=>({data:{tasks:tasks.slice(1)}})}}),error=>error.code==='model_output_invalid');
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
 const providers={manager:async(name,input)=>{
  if(name==='v8-managed-evidence-batch'){const rows=reviewRows(input);return batchAnswer(rows,rows.filter(row=>row.text).map(row=>row.id));}
  assert.equal(name,'v8-managed-actionable-report');
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
 }};
 const {report}=await synthesizeManagedReport({brief,brand:{facts:[],plan},plan:{},context,inventory,providers});
 const synthesis={report,analysisPacket:context.packet,searchEvidence:[],methodologyVersion:sequentialVersion,supervision:{reviewMode:'managed-audit'}};
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
 assert.equal(affected.data.gapCompletion,undefined);
 assert.ok(affected.data.pricingProof);
 assert.equal(affected.data.result.data.findings.length,specs.length);
 const denied=await request({action:'complete_gaps',ticket:initial.data.ticket});
 assert.equal(denied.code,422);
 assert.equal(denied.data.code,'completion_unavailable');
 assert.equal((await ledger.status()).chargedKurus,500);
});

test('all 1000 observations are reviewed across background phases before the report and late high-priority evidence survives',async()=>{
 const evidence=packet(),context=sequentialContext(brief,{packet:evidence,searches:[],peerDiscoveryVersion:'product-v2'},{includeTechnicalSignals:true});
 const proof=context.cards[0];
 const inventory=[{observations:Array.from({length:1000},(_,i)=>({area:'digital_1',
  text:'Verbatim row '+i+' '+('Complete original text and source evidence. '.repeat(7)),sourceIds:[proof.id]}))}];
 const args={brief,brand:{facts:[]},plan:{understanding:{goals:brief.goals}},context,inventory};
 const {input}=managedReportInput(args),batches=planManagedEvidenceReview(input);
 assert.ok(batches.length>1);
 const seen=new Map(),closed={collectionClosed:true,reviewBatches:batches},receipts=new Map();
 const providers={manager:async(name,payload)=>{
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
 const [ok]=await reviewManagedEvidenceBatch(batch,{focus:{},providers:{manager:async()=>batchAnswer(batch.rows,['o2'],new Set(['o1']))}});
 const reviewed=reviewedManagedEvidence(input,[ok]);
 assert.equal(reviewed.coverage.complete,true);
 assert.deepEqual(reviewed.invalidObservations,['o1']);
 assert.deepEqual(reviewed.reportInput().observations.map(row=>row[0]),['o2']);
});
