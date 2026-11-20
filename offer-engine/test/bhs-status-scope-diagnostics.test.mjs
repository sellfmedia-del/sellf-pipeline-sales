import test from 'node:test';
import assert from 'node:assert/strict';
import {statusFixture} from './fixtures/bhs-status-diagnostics.mjs';
import {brief as rawBrief} from './fixtures/bhs.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {scopedCoverage,scopedMetrics} from '../src/bhs/research-status.mjs';
import {presentResearch,researchQuestions,researchDiagnostics,researchProgress} from '../src/bhs/research-presentation.mjs';
import {guardResearchScope} from '../src/bhs/scope-authority.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {continuationAudit,restoreContinuation} from '../src/bhs/continuity.mjs';
import {renderGroundedReport} from '../src/bhs/grounded-report.mjs';
import {fallbackScope,validateScope} from '../src/pricing/scope.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {memoryLedger} from './fixtures/offer.mjs';

const brief=snapshotBrief(rawBrief);


test('five open needs, one observation and empty SWOT remain partial across audit, handoff and free reload',async()=>{
 const synthesis=statusFixture(),original=structuredClone(synthesis);
 const audit=directAuditResult(brief,synthesis);
 assert.equal(audit.status,'review');
 const progress=audit.data.researchProgress;
 assert.deepEqual([progress.state,progress.planned,progress.confirmed,progress.reported,progress.open,progress.partial,progress.notSearched],
  ['partial',5,0,0,5,1,4]);
 assert.equal(progress.findings,1);
 assert.deepEqual(progress.missingSwotQuadrants,['strength','weakness','opportunity','threat']);
 const handoff=continuationAudit(brief,{verifiedAudit:audit,reason:'quality_review'});
 assert.equal(handoff.status,'ready','Offer preparation remains available');
 assert.equal(handoff.data.quality.checksPassed,false);assert.equal(handoff.data.quality.contentComplete,false);
 assert.deepEqual(handoff.data.report.researchProgress,progress);
 const restored=await restoreContinuation(brief,structuredClone(handoff),{get:()=>assert.fail('No paid work or lookup needed')});
 assert.deepEqual(restored.data.researchProgress,progress);
 assert.deepEqual(restored.data.report.researchProgress,progress);
 assert.deepEqual(synthesis,original);
});

test('a stale confirmed label without any retained source cannot close a need',()=>{
 const {report}=statusFixture();report.verifiedResearch.metrics=[{id:'empty',status:'confirmed',section:'operations',sourceIds:[]}];
 const saved=structuredClone(report);
 assert.equal(scopedMetrics(report)[0].status,'open');
 assert.equal(researchProgress(report).confirmed,0);assert.deepEqual(report,saved);
});

test('a cached handoff repairs stale metrics, section labels and nested/public status together without new research',()=>{
 const audit=directAuditResult(brief,statusFixture());
 for(const report of [audit.data,audit.data.report]){
  report.verifiedResearch={metrics:[{id:'empty',name:'Cached need',section:'operations',sourceIds:[],status:'confirmed'}]};
  report.bhsSections=[{id:'operations',title:'Sales process',complete:true,findingIds:['observed']}];
 }
 const handoff=continuationAudit(brief,{verifiedAudit:audit,reason:'quality_review'});
 assert.equal(handoff.data.verifiedResearch.metrics[0].status,'open');
 assert.deepEqual(handoff.data.verifiedResearch,handoff.data.report.verifiedResearch);
 assert.deepEqual(handoff.data.bhsSections,handoff.data.report.bhsSections);
 assert.ok(handoff.data.bhsSections.every(row=>!row.complete));
 assert.equal(handoff.data.researchProgress.confirmed,0);assert.equal(handoff.data.quality.checksPassed,false);
});

test('confirmed research and authored report coverage have separate counts',()=>{
 const {report,supervision}=statusFixture();
 report.verifiedResearch.metrics.forEach(row=>{row.status='confirmed';row.sourceIds=['ev1'];delete row.researchStatus;});
 supervision.researchApproved=true;delete supervision.reportIssue;
 presentResearch(report,supervision);
 assert.deepEqual([report.researchProgress.confirmed,report.researchProgress.reported,report.researchProgress.missingFromReport],[5,1,4]);
 assert.equal(report.researchProgress.state,'partial');
});

test('an empty plan or empty evidence cannot be described as completed research',()=>{
 const {report}=statusFixture();report.verifiedResearch.metrics=[];report.findings=[];report.bhsSections=[];
 assert.equal(researchProgress(report,{researchApproved:true}).state,'unavailable');
});

test('complete grounded research without a writing issue can be complete; a writing timeout keeps it partial',()=>{
 const {report}=statusFixture();report.bhsSections=[];
 report.verifiedResearch.metrics=[{id:'n0',section:'operations',status:'confirmed',sourceIds:['ev1']}];
 assert.equal(researchProgress(report,{researchApproved:true}).state,'complete');
 assert.equal(researchProgress(report,{researchApproved:true,reportIssue:'model_deadline'}).state,'partial');
});

test('a fully checked completed audit is not downgraded to a partial handoff',()=>{
 const synthesis=statusFixture();
 synthesis.report.verifiedResearch.metrics=[{id:'n0',section:'operations',status:'confirmed',sourceIds:['ev1']}];
 synthesis.supervision.researchPlan.sectionedSynthesis=false;
 synthesis.supervision.researchApproved=true;synthesis.supervision.evidenceCoverage.complete=true;
 delete synthesis.supervision.reportIssue;
 const audit=directAuditResult(brief,synthesis),before=structuredClone(audit);
 assert.equal(audit.data.quality.contentComplete,true);assert.equal(audit.data.researchProgress.state,'complete');
 assert.equal(continuationAudit(brief,{verifiedAudit:audit,reason:'quality_review'}),audit);
 assert.deepEqual(audit,before);assert.equal(audit.data.researchContinuity,undefined);
});

test('research closure, source reading and report writing failures remain visible separately',()=>{
 const supervision={researchStopReason:'research_tools_unavailable',sourceReaderIssue:'source_plan_invalid',
  reportIssue:'model_deadline',researchIssues:['not_configured','not_configured','provider_timeout']};
 const rows=researchDiagnostics(supervision);
 assert.deepEqual(rows.map(row=>[row.stage,row.code]),[['research','research_tools_unavailable'],['report','model_deadline'],
  ['reading','source_plan_invalid'],['tools','not_configured'],['tools','provider_timeout']]);
 assert.match(rows[1].message,/Rapor yazımındaki.*süre/);
 assert.deepEqual(researchDiagnostics({reportIssue:'private-token-secret',reportDiagnostic:{prompt:'private-token-secret'}}),[]);
});

test('questions merge punctuation/case variants and proof links without merging years or opposite decisions',()=>{
 const rows=[{question:'Aylık cironuz nedir?',findingIds:['a']},{question:' AYLIK CİRONUZ NEDİR ? ',findingIds:['b']},
  {question:'2025 cironuz nedir?',findingIds:[]},{question:'2026 cironuz nedir?',findingIds:[]},
  {question:'Bayilik açılacak mı?',findingIds:[]},{question:'Bayilik açılmayacak mı?',findingIds:[]},
  {question:'Decision 0',findingIds:[]}];
 const saved=structuredClone(rows),result=researchQuestions(rows,[{name:'Decision 0'}]);
 assert.equal(result.length,5);assert.deepEqual(result[0].findingIds,['a','b']);assert.deepEqual(rows,saved);
});

test('the planned report does not invent unsearched failures or repeat its finding and question in legacy dimension/onboarding lists',()=>{
 const {report,supervision}=statusFixture();presentResearch(report,supervision);
 const raw=renderGroundedReport(report);
 assert.doesNotMatch(raw,/Unresearched placeholder|## 4\. Onboarding soruları|Veri bulunamadı — onboarding/);
 assert.equal(raw.split(report.findings[0].statement).length-1,1);
 assert.equal(raw.split('How is the sales pilot measured?').length-1,1);
 assert.match(raw,/0\/5 ihtiyaç doğrulandı/);assert.match(raw,/Araştırma · .*sonraki araç/);assert.match(raw,/Rapor yazımı · .*süre/);
});

test('the same open need shown under two headings appears in the raw missing list only once',()=>{
 const {report}=statusFixture();presentResearch(report,{});
 const section=report.bhsSections[0];report.bhsSections=[section,{...section,id:'readiness',title:'Readiness'}];
 const raw=renderGroundedReport(report);
 assert.equal(raw.split('Decision 0 · Ölçüm kısmen doğrulandı').length-1,1);
});

const advisoryAudit={supervision:{researchPlan:{taskReporting:true}}};
const scope=()=>({summary:'Amazon excluded; Meta and Google are mandatory.',budget:{posture:'unspecified',quote:null,targetQuote:null,targetScope:'unspecified'},
 services:['meta','google_ads'].map(serviceId=>({serviceId,phase:'start',priority:1,reason:'Mandatory to fix positioning.',briefQuote:null,findingIds:['observed']})),
 exclusions:['Amazon yönetimi mevcut partner nedeniyle kapsam dışı.']});

test('an existing Amazon partner is context; a positioning finding cannot require Meta and Google operations',()=>{
 const b={...brief,services:'Growth',meetingNotes:'Amazon tarafında mevcut partnerimiz var.'},proposed=scope(),saved=structuredClone(proposed);
 const checked=guardResearchScope(proposed,b,advisoryAudit);
 assert.deepEqual(checked.exclusions,[]);assert.ok(checked.services.every(row=>row.phase==='later'));
 assert.doesNotMatch(checked.summary,/Amazon|mandatory/);assert.ok(checked.services.every(row=>!row.reason.includes('Mandatory')));
 assert.deepEqual(proposed,saved);assert.deepEqual(guardResearchScope(checked,b,advisoryAudit),checked);
});

test('an explicit advertising request remains explicit and a literal service exclusion is preserved',()=>{
 const b={...brief,services:'Dijital reklamlar',meetingNotes:'Amazon yönetimi kapsam dışı.'},proposed=scope();
 proposed.exclusions=[b.meetingNotes,'Google Ads kapsam dışı.'];
 const checked=guardResearchScope(proposed,b,advisoryAudit);
 assert.ok(checked.services.every(row=>row.phase==='start'));assert.deepEqual(checked.exclusions,[b.meetingNotes]);
 assert.doesNotThrow(()=>validateScope(checked,b,{findings:[{id:'observed'}]}));
});

test('legacy scopes and exact server fallbacks keep their validated identity',()=>{
 const proposed=scope();assert.equal(guardResearchScope(proposed,brief,{}),proposed);
 const fallback=fallbackScope(brief);assert.equal(guardResearchScope(fallback,brief,advisoryAudit),fallback);
 assert.deepEqual(validateScope(fallback,brief,{findings:[]}),fallback);
});

test('the existing paid scope phase applies the authority guard once and restores its completed receipt without another call',async()=>{
 const b={...brief,services:'Growth',meetingNotes:'Amazon tarafında mevcut partnerimiz var.'},synthesis=statusFixture();
 const ledger=memoryLedger([[stageKey(b,'synthesis','v8'),{state:'complete',value:synthesis}]]);
 let calls=0;
 const providers={modelHandoff:true,worker:async(stage,input)=>{
  calls++;assert.equal(stage,'scope');assert.match(input.instruction,/Mevcut partner, ajans veya kanal/);
  return {data:{scope:scope(),copy:{headline:'Net hedefler.',accent:'Birlikte büyüme.',subtitle:'Görüşme hedefleri.',findingIds:[]}}};
 }};
 const args={phase:'scope',brief:b,ledger,providers,researchVersion:'v8',researchModel:'claude-sonnet-5-5',collect:()=>assert.fail('No research in scope')};
 const first=await runBoundedStage(args),restored=await runBoundedStage(args);
 assert.equal(calls,1);assert.deepEqual(first,restored);
 assert.deepEqual(first.scopePlan.exclusions,[]);assert.ok(first.scopePlan.services.every(row=>row.phase==='later'));
});
