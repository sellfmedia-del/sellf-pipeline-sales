import assert from 'node:assert/strict';
import test from 'node:test';
import {scopedCoverage,scopedMetrics,openResearchSections} from '../src/bhs/research-status.mjs';
import {offerReport} from '../src/bhs/offer-report.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {restoreContinuation} from '../src/bhs/continuity.mjs';
import {resolveManagedGaps} from '../src/bhs/managed-gaps.mjs';
import {selectProposalAudit} from '../src/proposal/audit-selection.mjs';
import {groundOfferReport} from '../src/bhs/source-gate.mjs';
import {writeScopedSynthesis} from '../src/bhs/collection-first.mjs';
import {mergeManagedGapReport} from '../src/bhs/managed-gaps.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {context} from './fixtures/evidence.mjs';
import {brief as inputBrief} from './fixtures/bhs.mjs';

const brief=snapshotBrief(inputBrief);
const metric={id:'dealer',section:'source_task',name:'Dealer access and approval',sectionTitle:'Dealer research',
 status:'open',researchStatus:'partially_verified',sourceIds:['ev1']};
const finding={id:'dealer_observation',kind:'observation',dimension:'operations',bhsSection:'operations',bhsSectionTitle:'Operational process',
 bhsRank:1,researchNeedIds:['dealer'],sourceIds:['ev1'],priority:'high',
 statement:'The company serves its customers through an authorized dealer network.',
 reportExcerpt:'The company serves its customers through an authorized dealer network.',
 impact:'The dealer process can inform a recorded enquiry pilot.',goalConnection:'Check the dealer process against the brief.',
 recommendation:{action:'Test one dealer enquiry.',measurement:'Record the enquiry outcome in the CRM.'}};
const scope=(report,fallback=[])=>scopedCoverage(report,fallback,true,true,false,true);
function reportWith(metrics=[metric],findings=[finding]){
 const {report}=context();
 report.findings=structuredClone(findings);report.competitors=[];report.benchmarks=[];report.meetingQuestions=[];report.serviceRecommendations=[];
 report.summary=findings[0]?.statement||'Existing research evidence.';
 for(const d of report.dimensions){d.score=null;d.strengths=[];d.gaps=[];d.comparisonCompetitorIds=[];
  d.findingIds=findings.filter(f=>f.dimension===d.id).map(f=>f.id);d.rationale=d.findingIds.length?finding.statement:'';}
 report.verifiedResearch={metrics:structuredClone(metrics)};report.bhsSections=scope(report);
 return report;
}
function synthesis(report=reportWith()){
 return {report,analysisPacket:context().packet,supervision:{reviewMode:'managed-audit',scopedResearch:true,researchApproved:true,
  evidenceCoverage:{complete:true,reviewedEvidenceRows:1,evidenceRows:1},
  researchPlan:{adaptiveResearch:true,qualityReport:true,targetedEvidence:true,taskReporting:true,readEvidenceOnly:true,directedResearch:true,separateGapCosts:true},
  metricCoverage:[{...metric,status:'confirmed',researchStatus:undefined}]}};
}

test('current grounded status wins over the older supervisor receipt by exact need ID without changing either input',()=>{
 const report=reportWith(),fallback=[{...metric,status:'confirmed'},{id:'unplanned',section:'generic',status:'open'}];
 const before=structuredClone({report,fallback});
 const metrics=scopedMetrics(report,fallback);
 assert.deepEqual(metrics.map(row=>[row.id,row.status]),[['dealer','open']]);
 assert.deepEqual({report,fallback},before);
});

test('a useful partial finding follows its research ID to the authored heading without leaving a duplicate task heading',()=>{
 const report=reportWith(),sections=scope(report);
 assert.deepEqual(sections.map(row=>row.id),['operations']);
 assert.equal(sections[0].complete,false);assert.equal(sections[0].count,1);
 assert.equal(sections[0].openMetrics[0].id,'dealer');
 assert.equal(sections[0].title,'Operational process');
 assert.deepEqual(openResearchSections(report,['operations']),['source_task']);
});

test('a confirmed finding under a different heading completes that need without an empty old heading',()=>{
 const report=reportWith([{...metric,status:'confirmed'}]);
 assert.equal(scopedMetrics(report)[0].researchStatus,undefined);
 assert.deepEqual(scope(report).map(row=>[row.id,row.complete]),[['operations',true]]);
 assert.deepEqual(openResearchSections(report,['operations','source_task']),[]);
});

test('a finding alone never invents a confirmation when the need receipt has no recorded decision',()=>{
 const report=reportWith([{...metric,status:undefined,researchStatus:undefined}]);
 assert.equal(scope(report)[0].complete,false);
 assert.equal(scope(report)[0].openMetrics[0].id,'dealer');
});

test('partial buyer evidence cannot coexist with a completed need under a stale saved confirmed label',()=>{
 const report=reportWith([{...metric,status:'confirmed'}]);
 report.verifiedResearch.buyerProcurement=[{needId:'dealer',evidence:{sourceIds:['ev1'],coversTarget:false},hypothesis:'Test the target buyer approval process.'}];
 assert.equal(scopedMetrics(report)[0].status,'open');
 assert.equal(scope(report)[0].complete,false);
 assert.deepEqual(openResearchSections(report,['operations']),['source_task']);
});

test('identical human labels never merge two different needs or close the one that is still open',()=>{
 const second={...metric,id:'approval',name:metric.name};
 const report=reportWith([{...metric,status:'confirmed'},second],[finding,{...finding,id:'approval_observation',researchNeedIds:['approval']}]);
 const sections=scope(report);
 assert.equal(sections[0].complete,false);
 assert.deepEqual(sections[0].openMetrics.map(row=>row.id),['approval']);
 assert.deepEqual(scopedMetrics(report).map(row=>row.id),['dealer','approval']);
});

test('one finding can support two needs while a partial need remains open across every heading that uses it',()=>{
 const report=reportWith([{...metric,status:'confirmed'},{...metric,id:'approval'}],
  [{...finding,researchNeedIds:['dealer','approval']},{...finding,id:'second',bhsSection:'readiness',researchNeedIds:['approval']}]);
 const sections=scope(report);
 assert.equal(sections.length,2);assert.ok(sections.every(row=>!row.complete));
 assert.ok(sections.every(row=>row.openMetrics.length===1&&row.openMetrics[0].id==='approval'));
});

test('confirmed evidence absent from the written report is a reporting gap and cannot authorize another paid research account',async()=>{
 const report=reportWith([{...metric,status:'confirmed'}],[]),sections=scope(report);
 assert.equal(sections[0].openMetrics[0].status,'missing_from_report');
 const result=await resolveManagedGaps({action:'complete_gaps',brief,synthesis:synthesis(report),sections:['source_task'],secret:'offline',
  baseLedger:{status:()=>assert.fail('confirmed research must not reach the ledger')},getGapLedger:()=>assert.fail('no extra account'),
  getProviders:()=>assert.fail('no provider call')});
 assert.equal(result,null);
});

test('a relocated partial need advertises only its original open scope without a model, scraper or gap ledger',async()=>{
 const report=reportWith(),before=structuredClone(report);let reads=0;
 const result=await resolveManagedGaps({action:'advance',brief,synthesis:synthesis(report),sections:['operations'],secret:'offline',
  baseLedger:{status:async()=>{reads++;return {id:'12345678-1234-4234-8234-123456789012',chargedKurus:3200};},get:async()=>null},
  getGapLedger:()=>assert.fail('reading availability cannot open an account'),getProviders:()=>assert.fail('no provider call')});
 assert.equal(reads,1);assert.equal(result.available,true);assert.equal(result.capKurus,3000);
 assert.deepEqual(result.sections,['Dealer research']);assert.deepEqual(report,before);
});

test('post-source-check demotion reaches report headings, public supervision and planned-need completion counts together',()=>{
 const raw=reportWith([{...metric,status:'confirmed'}]),input=synthesis(raw);
 input.analysisPacket.sources=input.analysisPacket.sources.filter(source=>source.id!=='ev1');
 const before=structuredClone(input),audit=directAuditResult(brief,input).data;
 assert.equal(audit.verifiedResearch.metrics[0].status,'open');
 assert.equal(audit.supervision.metricCoverage[0].status,'open');assert.equal(audit.supervision.researchApproved,false);
 assert.equal(audit.supervision.evidenceCoverage.complete,false);
 assert.ok(audit.bhsSections.every(section=>!section.complete));
 assert.deepEqual(audit.quality.methodologyCoverage,{expected:1,present:0,reported:0,scope:'planned_needs'});
 assert.deepEqual(input,before);
});

test('the scoped report does not manufacture missing global checklist areas while legacy reports keep their original contract',()=>{
 const scoped=offerReport(reportWith()),legacy=offerReport(context().report);
 assert.ok(scoped.researchCoverage.every(row=>row.status!=='unavailable'));
 assert.ok(!scoped.transfer.issues.some(issue=>issue.reason==='unavailable_or_unverified'));
 assert.equal(legacy.researchCoverage.length,24);
 assert.ok(legacy.transfer.issues.some(issue=>issue.reason==='unavailable_or_unverified'));
});

test('cached display statuses and the full report refresh for free without changing saved findings, prices or ledger records',async()=>{
 const data=directAuditResult(brief,synthesis(reportWith())).data;
 data.bhsSections=[{id:'old_generic',title:'Generic checklist',findingIds:[],count:0,complete:false}];
 data.report.bhsSections=structuredClone(data.bhsSections);
 const input={status:'ready',data},before=structuredClone(input);
 const first=await restoreContinuation(brief,input,{get:()=>assert.fail('no ledger read')});
 assert.deepEqual(first.data.bhsSections.map(row=>row.id),['operations']);assert.equal(first.data.bhsSections[0].complete,false);
 assert.equal(first.data.report.bhsSections[0].complete,false);
 assert.match(first.data.rawReport,/Operational process/);assert.doesNotMatch(first.data.rawReport,/Generic checklist/);
 assert.deepEqual(first.data.findings,before.data.findings);assert.deepEqual(input,before);
 assert.deepEqual(await restoreContinuation(brief,first,{get:()=>assert.fail('no replay')}),first);
});

test('proposal projection retains research IDs and recalculates stale heading status without changing selected prices',()=>{
 const report=reportWith();report.bhsSections[0].complete=true;
 const prices={alternatives:[{id:'growth',total:12000}]},before=structuredClone({report,prices});
 const proposal=selectProposalAudit(report,brief,prices);
 assert.equal(proposal.bhsSections[0].complete,false);assert.equal(proposal.bhsSections[0].openMetrics[0].id,'dealer');
 assert.deepEqual(proposal.findings[0].researchNeedIds,['dealer']);assert.equal(proposal.findings[0].bhsSection,'operations');
 assert.deepEqual({report,prices},before);
});

test('a legacy metric missing a section recovers it only through its exact linked finding ID',()=>{
 const report=reportWith([{id:'dealer',name:'Dealer access',status:'open',sourceIds:['ev1']}]);
 assert.equal(scopedMetrics(report)[0].section,'operations');
 const unrelated=reportWith([{id:'unrelated',name:'Dealer access',status:'open',sourceIds:['ev1']}]);
 assert.equal(scopedMetrics(unrelated)[0].section,undefined);
});

test('an exact duplicate keeps both explicit need links through source verification and proposal selection, but a rejected duplicate cannot donate a link',()=>{
 const metrics=[{...metric,status:'confirmed'},{...metric,id:'approval',status:'confirmed'}];
 const report=reportWith(metrics,[finding,{...finding,id:'duplicate',researchNeedIds:['approval']}]),before=structuredClone(report);
 for(const output of [groundOfferReport(report,{packet:context().packet,brief,scopedFindings:true,preserveQualifiedImpacts:true}),selectProposalAudit(report,brief)]){
  assert.equal(output.findings.length,1);
  assert.deepEqual(output.findings[0].researchNeedIds,['dealer','approval']);
  assert.ok(scope(output).every(section=>section.complete));
 }
 const invalid=structuredClone(report);invalid.findings[1].impact='Growth increased by 42%.';
 const rejected=groundOfferReport(invalid,{packet:context().packet,brief,scopedFindings:true,preserveQualifiedImpacts:true});
 assert.deepEqual(rejected.findings[0].researchNeedIds,['dealer']);
 assert.ok(scope(rejected).some(section=>!section.complete&&section.openMetrics.some(row=>row.id==='approval')));
 const differentPeer=structuredClone(report);differentPeer.findings[1].peerId='another_peer';
 assert.deepEqual(selectProposalAudit(differentPeer,brief).findings[0].researchNeedIds,['dealer']);
 assert.deepEqual(report,before);
});

test('the existing report writer validates each duplicate before merging its need IDs without another model call',async()=>{
 const needs=['dealer','approval'].map(id=>({id,section:'source_task',target:brief.brandName,market:'United Kingdom',metric:'Dealer enquiry process',
  expected:'The directly read dealer process.',period:'',quantity:1,query:'brand dealer enquiries',country:'GB',language:'en',first:'tavily',since:''}));
 const quote=context().report.sources[0].quote;
 const receipts=needs.map(({id})=>({id,urls:[brief.website],facts:[{id:'fact_'+id,url:brief.website,method:'html',title:'Dealer process',quote}]}));
 let calls=0;
 const result=await writeScopedSynthesis({brief,brand:{packet:context().packet,facts:[],brandUnderstanding:{understanding:'Dealer supplier.'},briefUnderstanding:{understanding:brief.goals}},
  plan:{needs,scopedResearch:true,adaptiveResearch:true,qualityReport:true,targetedEvidence:true,verifiedResults:true,readEvidenceOnly:true,taskReporting:true,qualifyReportFindings:true},
  rounds:[{closed:true,stopReason:'research_budget_exhausted',receipts,decisions:receipts.map(row=>({id:row.id,sufficient:true,proofs:row.facts.map(f=>f.id)}))}],
  providers:{manager:async(_stage,input)=>{calls++;return {model:'offline',data:{findings:needs.map(({id})=>({section:'operations',area:'',rank:1,quadrant:'none',peerId:'',kind:'observation',
   needIds:[id],observation:finding.statement,proof:[input.coverage.find(row=>row.id===id).sources[0]],analysis:finding.impact,
   action:finding.recommendation.action,measurement:finding.recommendation.measurement,limitation:'Sales outcomes were not measured.',question:''})),benchmarks:[],questions:[]}};}}});
 assert.equal(calls,1);assert.equal(result.report.findings.length,1);
 assert.deepEqual(result.report.findings[0].researchNeedIds,['dealer','approval']);
 assert.ok(result.report.bhsSections.every(section=>section.complete));
});

test('explicit gap completion adds a second need link to an existing exact finding instead of losing it during deduplication',()=>{
 const original=reportWith([{...metric,status:'confirmed'}]),patch=reportWith([{...metric,id:'approval',status:'confirmed'}],
  [{...finding,id:'patch',bhsSection:'readiness',researchNeedIds:['approval']}]);
 const before=structuredClone({original,patch}),merged=mergeManagedGapReport(original,patch,['source_task'],{taskReporting:true});
 assert.equal(merged.findings.length,1);assert.deepEqual(merged.findings[0].researchNeedIds,['dealer','approval']);
 assert.ok(scope(merged).every(section=>section.complete));assert.deepEqual({original,patch},before);
});
