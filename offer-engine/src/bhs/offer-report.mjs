import {dimensions} from './brief.mjs';
import {normalizeMethodologyAreas} from './methodology-areas.mjs';
import {publicUrl} from './verify.mjs';

const list=v=>Array.isArray(v)?v:[];
const text=(v,fallback='')=>typeof v==='string'&&v.trim()?v:fallback;
const strings=v=>list(v).filter(v=>typeof v==='string'&&v.trim());
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const unique=(rows,key)=>[...new Map(rows.map(row=>[row[key],row])).values()];
const missing='Bu araştırmada veri bulunamadı; görüşmede doğrulanacak.';

// A deterministic offer projection, not another research/review call. The exact
// model document remains available separately, including excluded unsafe URLs.
export function offerReport(value){
 const incoming=object(value),raw=structuredClone(incoming.originalReport??value??{}),r=object(raw),issues=[];
 const warn=(path,reason)=>issues.push({path,reason});
 const sources=unique(list(r.sources).filter(s=>{
  const valid=s&&text(s.id)&&publicUrl(s.url)&&!s.url.includes('...')&&!s.url.includes('…');
  if(!valid)warn('sources','invalid_source');return valid;
 }).map(s=>({...s,title:text(s.title,s.url),quote:text(s.quote),scope:text(s.scope,'Kaynak kapsamı ayrıca doğrulanacak.'),sourceType:['primary','secondary','review'].includes(s.sourceType)?s.sourceType:'secondary',publishedAt:text(s.publishedAt)||null,period:text(s.period)||null})),'id');
 const sourceIds=new Set(sources.map(s=>s.id));
 const refs=(v,path)=>{const ids=strings(v),kept=[...new Set(ids.filter(id=>sourceIds.has(id)))];if(ids.length!==kept.length)warn(path,'unresolved_source');return kept;};
 const competitors=unique(list(r.competitors).filter(p=>p&&text(p.id)&&text(p.name)).map(p=>({...p,website:publicUrl(p.website)?p.website:'',scaleReason:text(p.scaleReason,missing),audienceReason:text(p.audienceReason,missing),geographyReason:text(p.geographyReason,missing),sourceIds:refs(p.sourceIds,'competitors.'+p.id)})),'id');
 const dimensionIds=new Set(dimensions.map(d=>d.id)),peerIds=new Set(competitors.map(p=>p.id));
 const findings=unique(list(r.findings).filter(f=>f&&text(f.statement)).map((f,i)=>{
  const sourceIds=refs(f.sourceIds,'findings.'+i),verified=sourceIds.length>0;
  if(!verified&&f.kind!=='brief')warn('findings.'+i,'unverified');
  return {...f,id:text(f.id,'unverified_'+i),dimension:dimensionIds.has(f.dimension)?f.dimension:'competition',kind:['observation','inference','brief'].includes(f.kind)?f.kind:'inference',statement:f.statement,reportExcerpt:text(f.reportExcerpt,f.statement),sourceIds,impact:text(f.impact),goalConnection:text(f.goalConnection),priority:['high','medium','low'].includes(f.priority)?f.priority:'medium',...(!verified&&f.kind!=='brief'?{verification:'unverified'}:{})};
 }),'id');
 const findingIds=new Set(findings.map(f=>f.id)),findingRefs=v=>[...new Set(strings(v).filter(id=>findingIds.has(id)))];
 const projectedDimensions=dimensions.map(({id})=>{
  const d=object(list(r.dimensions).find(d=>d?.id===id));
  if(!d.id)warn('dimensions.'+id,'missing');
  const score=typeof d.score==='number'&&Number.isFinite(d.score)&&d.score>=0&&d.score<=100?d.score:null;
  if(d.score!=null&&score===null)warn('dimensions.'+id+'.score','invalid_score');
  return {...d,id,score,rationale:text(d.rationale,missing),dataStatus:['full','partial','insufficient'].includes(d.dataStatus)?d.dataStatus:'insufficient',findingIds:findingRefs(d.findingIds),comparisonCompetitorIds:strings(d.comparisonCompetitorIds).filter(id=>peerIds.has(id)),strengths:strings(d.strengths),gaps:strings(d.gaps),onboardingQuestions:strings(d.onboardingQuestions)};
 });
 const benchmarks=list(r.benchmarks).filter(b=>b&&text(b.metric)).map(b=>({...b,entries:list(b.entries).filter(e=>e&&text(e.entityId)).map(e=>{const sourceIds=refs(e.sourceIds,'benchmarks.'+b.metric),value=typeof e.value==='string'?e.value:typeof e.value==='number'&&Number.isFinite(e.value)?String(e.value):null;return {...e,value,unit:text(e.unit)||null,period:text(e.period)||null,sourceIds,...(value!==null&&!sourceIds.length?{verification:'unverified'}:{})};})}));
 const researchCoverage=normalizeMethodologyAreas(r.researchCoverage,sources.map(s=>s.id));
 for(const c of researchCoverage)if(c.status==='unavailable')warn('researchCoverage.'+c.dimension+'.'+c.topic,'unavailable_or_unverified');
 if(!text(r.summary))warn('summary','missing');
 return {...r,summary:text(r.summary,'Ön araştırmanın mevcut bulguları ve görüşmede doğrulanacak konular.'),sources,competitors,findings,dimensions:projectedDimensions,benchmarks,researchCoverage,
  criticalOpportunityFindingId:findingIds.has(r.criticalOpportunityFindingId)?r.criticalOpportunityFindingId:null,criticalRiskFindingId:findingIds.has(r.criticalRiskFindingId)?r.criticalRiskFindingId:null,
  meetingQuestions:list(r.meetingQuestions).filter(q=>q&&text(q.question)).map(q=>({...q,dimension:dimensionIds.has(q.dimension)?q.dimension:'competition',findingIds:findingRefs(q.findingIds)})),
  serviceRecommendations:list(r.serviceRecommendations).filter(s=>s&&text(s.name)).map((s,i)=>({...s,id:text(s.id,'service_'+i),hypothesis:text(s.hypothesis),measurement:text(s.measurement),findingIds:findingRefs(s.findingIds)})),
  originalReport:raw,transfer:{issues,contentComplete:issues.length===0}};
}
