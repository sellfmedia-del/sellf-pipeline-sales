import test from 'node:test';
import assert from 'node:assert/strict';
import {localBudget} from './fixtures/local-budget.mjs';
import {brief,packet,plan} from './fixtures/sequential.mjs';
import {capBhsLedger,managedPhaseBudget} from '../src/bhs/managed-budget.mjs';
import {managedResearchHealthy,resolveManagedGaps} from '../src/bhs/managed-gaps.mjs';
import {planManagedResearch} from '../src/bhs/managed-research.mjs';
import {managedSections,synthesizeManagedReport} from '../src/bhs/managed-report.mjs';
import {sequentialContext} from '../src/bhs/sequential-contracts.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {continuationAudit} from '../src/bhs/continuity.mjs';
import {selectProposalAudit} from '../src/proposal/audit-selection.mjs';
import {methodologyAreas} from '../src/bhs/methodology-areas.mjs';
import {BudgetError} from '../src/budget/ledger.mjs';

test('research and synthesis reserve independently, including parallel calls and persistent policy',async t=>{
 const {ledger,close}=await localBudget();t.after(close);
 const phase=await managedPhaseBudget({ledger,brief,phase:'brand_plan',enabled:true});
 const claims=await Promise.allSettled([1,2,3].map(i=>phase.ledger.once('research:'+i,{},1250,async()=>i)));
 assert.equal(claims.filter(r=>r.status==='fulfilled').length,2);
 assert.equal((await ledger.status()).chargedKurus,3000);
 const synthesis=await managedPhaseBudget({ledger,brief,phase:'synthesis',enabled:false});
 assert.equal(synthesis.managedAudit,true);
 await synthesis.ledger.once('claude',{},1600,async()=>({}));
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

test('ranked actions, metrics, questions and proofs survive report and partial offer handoff',async()=>{
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
  assert.equal(name,'v8-managed-actionable-report');
  assert.equal(input.observations.length,new Set(citations.map(c=>c.id)).size);
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
 const audit=directAuditResult(brief,{report,analysisPacket:context.packet,searchEvidence:[],methodologyVersion:'v8',supervision:{reviewMode:'managed-audit'}});
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
});
