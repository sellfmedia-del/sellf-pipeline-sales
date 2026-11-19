// Reuse Claude's accepted assessment in the existing draft call. This is
// decision guidance, never a second factual or numeric evidence pool.
const array=value=>Array.isArray(value)?value:[];
const prose=value=>typeof value==='string'?value.trim():'';
const priority={high:0,medium:1,low:2};
const rank=value=>Number.isInteger(value)&&value>0?value:Infinity;

export function orderAssessmentFindings(findings,audit){
 const critical=new Set([audit.criticalOpportunityFindingId,audit.criticalRiskFindingId].filter(Boolean));
 const original=new Map(array(audit.findings).filter(f=>f&&typeof f==='object').map(f=>[f.id,f]));
 return findings.map((finding,index)=>({finding,index,raw:original.get(finding.id)||finding})).sort((a,b)=>
  Number(critical.has(b.finding.id))-Number(critical.has(a.finding.id))||
  (priority[a.raw.priority]??3)-(priority[b.raw.priority]??3)||rank(a.raw.bhsRank)-rank(b.raw.bhsRank)||a.index-b.index
 ).map(row=>row.finding);
}

export function implementationAssessment(document,audit,candidates,{factualIds}={}){
 if(audit.researchReuse?.contextNeedsConfirmation)return;
 const eligible=new Map(candidates.map(f=>[f.id,f]));
 const rawById=new Map(array(audit.findings).filter(f=>f&&typeof f==='object').map(f=>[f.id,f]));
 const assessment={summary:prose(document.bhs.summary),priorities:[],openQuestions:[]};
 // Whole assessment fields are retained, including qualifications at the end.
 // Bounded complete rows replace a large report/paragraph dump; no repair call.
 const fits=value=>JSON.stringify(value).length<=7800; // reserve room for omission metadata
 if(!fits(assessment))assessment.summary='';
 let omitted=0;
 const questionKeys=new Set();
 for(const finding of orderAssessmentFindings(candidates,audit)){
  if(finding.kind==='observation'&&factualIds&&!factualIds.has(finding.id)){omitted++;continue;}
  const raw=rawById.get(finding.id)||finding;
  const analysis=prose(raw.impact),goalConnection=prose(raw.goalConnection),question=prose(raw.decisionQuestion);
  const recommendation=raw.recommendation||finding.recommendation;
  if(!analysis&&!goalConnection&&!question&&!recommendation&&finding.kind!=='inference')continue;
  const row={findingId:finding.id,kind:finding.kind,priority:raw.priority||finding.priority,
   ...(Number.isFinite(rank(raw.bhsRank))?{rank:raw.bhsRank}:{}),
   ...(finding.kind==='inference'?{hypothesis:prose(raw.statement)||finding.statement}:{}),
   ...(analysis?{analysis}:{}),...(goalConnection?{goalConnection}:{}),
   ...(question&&question!==goalConnection?{question}:{}),
   ...(recommendation?{recommendation:{action:prose(recommendation.action),measurement:prose(recommendation.measurement)}}:{})};
  if(assessment.priorities.length>=8||!fits({...assessment,priorities:[...assessment.priorities,row]})){omitted++;continue;}
  assessment.priorities.push(row);
  if(goalConnection)questionKeys.add(goalConnection);if(question)questionKeys.add(question);
 }
 for(const item of array(audit.meetingQuestions)){
  const question=prose(typeof item==='string'?item:item?.question);
  const findingIds=array(item?.findingIds);
  if(!question||questionKeys.has(question)||findingIds.some(id=>!eligible.has(id)))continue;
  const row={question,...(findingIds.length?{findingIds:[...new Set(findingIds)]}:{})};
  if(assessment.openQuestions.length>=6||!fits({...assessment,openQuestions:[...assessment.openQuestions,row]}))continue;
  assessment.openQuestions.push(row);questionKeys.add(question);
 }
 if(!assessment.summary&&!assessment.priorities.length&&!assessment.openQuestions.length)return;
 return {...assessment,...(omitted?{omittedFindingCount:omitted}:{})};
}
