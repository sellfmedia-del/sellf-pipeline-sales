import {context} from './evidence.mjs';
import {scopedCoverage} from '../../src/bhs/research-status.mjs';

export function statusFixture(){
 const {packet,report}=context();
 const finding={...report.findings[0],id:'observed',dimension:'operations',kind:'observation',sourceIds:['ev1'],
  statement:'The company offers its products through customer channels.',reportExcerpt:'The company offers its products through customer channels.',
  impact:'The observed channels can inform a recorded sales pilot.',goalConnection:'How is the sales pilot measured?',
  bhsSection:'operations',bhsSectionTitle:'Sales process',bhsRank:1,researchNeedIds:['n0'],
  recommendation:{action:'Record the next sales enquiry.',measurement:'Enquiry outcomes in the CRM.'}};
 report.findings=[finding];report.summary='The public source describes the sales process.';report.competitors=[];
 report.meetingQuestions=[{dimension:'operations',question:'How is the sales pilot measured?',findingIds:['observed']},
  {dimension:'operations',question:'HOW IS THE SALES PILOT MEASURED ?',findingIds:['observed']}];
 report.serviceRecommendations=[];
 report.dimensions.forEach(d=>{d.score=null;d.findingIds=d.id==='operations'?['observed']:[];
  d.rationale='Unresearched placeholder';d.onboardingQuestions=['How is the sales pilot measured?'];d.gaps=['Unresearched placeholder'];d.strengths=[];});
 report.verifiedResearch={metrics:Array.from({length:5},(_,i)=>({id:'n'+i,section:'operations',sectionTitle:'Sales process',
  name:'Decision '+i,status:'open',sourceIds:i?[]:['ev1'],researchStatus:i?'not_searched':'partially_verified',searched:!i}))};
 report.bhsSections=scopedCoverage(report,[],true,true,true,true);
 const supervision={reviewMode:'managed-audit',scopedResearch:true,researchApproved:false,
  researchPlan:{adaptiveResearch:true,qualityReport:true,targetedEvidence:true,taskReporting:true,readEvidenceOnly:true,
   sectionedSynthesis:true,reportRecovery:true},
  evidenceCoverage:{complete:false,reviewedEvidenceRows:1,evidenceRows:1},
  researchStopReason:'research_tools_unavailable',reportIssue:'model_deadline',
  researchIssues:['not_configured','provider_timeout','not_configured']};
 return {report,analysisPacket:packet,supervision};
}
