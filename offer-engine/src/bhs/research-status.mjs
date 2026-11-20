import {salesGapLabels,salesGapStatus,salesMetricName,salesSectionTitle,salesTaskSectionTitle} from './sales-research-labels.mjs';

const list=value=>Array.isArray(value)?value:[];
const unique=values=>[...new Set(values)];
const quadrants=['strength','weakness','opportunity','threat'];
const isSwotSection=id=>/^swot\b/iu.test(id||'');

// The grounded report owns current evidence status. A pre-filter supervisor
// receipt supplies metadata only for the same exact need, never a label match.
export function scopedMetrics(report,fallback=[]){
 const saved=report?.verifiedResearch?.metrics;
 const metadata=new Map(list(fallback).map(row=>[row.id,row]));
 const rows=Array.isArray(saved)?saved:list(fallback);
 return [...new Map(rows.filter(row=>typeof row?.id==='string'&&row.id).map(row=>{
  const metric={...metadata.get(row.id),...row};
  if(metric.status!=='confirmed')metric.status='open';
  const buyer=list(report.verifiedResearch?.buyerProcurement).find(item=>item.needId===row.id);
  const proofs=[...list(metric.sourceIds),...list(metric.marketMeasures).flatMap(measure=>list(measure.sourceIds)),...list(buyer?.evidence?.sourceIds)];
  if(metric.status==='confirmed'&&Array.isArray(metric.sourceIds)&&!proofs.length){
   metric.status='open';metric.researchStatus=metric.researchStatus||'searched';
  }
  if(buyer&&(!buyer.evidence?.coversTarget||buyer.hypothesis)){
   metric.status='open';
   metric.researchStatus=list(buyer.evidence?.sourceIds).length?'partially_verified':metric.researchStatus||'searched';
  }
  if(metric.status==='confirmed')delete metric.researchStatus;
  const linked=list(report.findings).find(f=>f.bhsSection&&list(f.researchNeedIds).includes(row.id));
  return [row.id,{...metric,...(!metric.section&&linked?{section:linked.bhsSection}:{})}];
 })).values()];
}

export function scopedSupervision(report,supervision){
 if(!supervision||!Array.isArray(report?.verifiedResearch?.metrics))return supervision;
 const metrics=scopedMetrics(report,supervision.metricCoverage),open=metrics.some(metric=>metric.status==='open');
 const prior=new Map(list(supervision.metricCoverage).map(metric=>[metric.id,metric]));
 return {...supervision,metricCoverage:metrics.map(metric=>{
  const row={...prior.get(metric.id),id:metric.id,section:metric.section,name:metric.name,status:metric.status};
  delete row.researchStatus;
  if(metric.researchStatus)row.researchStatus=metric.researchStatus;
  return row;
 }),...(typeof supervision.researchApproved==='boolean'?{researchApproved:supervision.researchApproved&&!open}:{}),
 ...(supervision.evidenceCoverage?{evidenceCoverage:{...supervision.evidenceCoverage,complete:supervision.evidenceCoverage.complete&&!open}}:{})};
}

export function scopedCoverage(report,metrics=[],linked=false,describeGaps=false,includeSwot=false,taskReporting=false){
 metrics=scopedMetrics(report,metrics);
 const allFindings=list(report.findings);
 const peers=new Set(list(report.competitors).map(peer=>peer.id));
 const buyerRows=new Map(list(report.verifiedResearch?.buyerProcurement).map(row=>[row.needId,row]));
 const swotId=metrics.find(m=>isSwotSection(m.section))?.section||allFindings.find(f=>isSwotSection(f.bhsSection))?.bhsSection||'swot';
 const sectionId=id=>includeSwot&&isSwotSection(id)?swotId:id;
 const authored=allFindings.filter(f=>list(f.sourceIds).length&&!f.researchEvidenceOnly&&f.kind!=='brief');
 const locations=new Map(metrics.map(metric=>[metric.id,unique(authored.filter(f=>list(f.researchNeedIds).includes(metric.id))
  .map(f=>sectionId(f.bhsSection)).filter(Boolean))]));
 const sectionsFor=metric=>taskReporting&&locations.get(metric.id)?.length?locations.get(metric.id):[sectionId(metric.section||metric.name)];
 const isOpen=(metric,findings)=>{
  const buyer=buyerRows.get(metric.id);
  if(buyer)return !buyer.evidence?.coversTarget||Boolean(buyer.hypothesis);
  return (taskReporting?metric.status!=='confirmed':metric.status==='open')||linked&&!findings.some(f=>list(f.sourceIds).length&&!f.researchEvidenceOnly&&
   list(f.researchNeedIds).includes(metric.id)&&(!metric.requiresPeer||peers.has(f.peerId)));
 };
 const openMetrics=taskReporting?metrics.filter(m=>isOpen(m,allFindings)):null;
 const ids=unique([...allFindings.map(f=>sectionId(f.bhsSection)).filter(Boolean),
  ...(openMetrics||metrics.filter(m=>linked||m.status==='open')).flatMap(sectionsFor),...(includeSwot?[swotId]:[])]);
 return ids.map(id=>{
  const findings=allFindings.filter(f=>sectionId(f.bhsSection)===id&&list(f.sourceIds).length)
   .sort((a,b)=>a.bhsRank-b.bhsRank);
  const relevant=metrics.filter(m=>sectionsFor(m).includes(id));
  const openNeeds=taskReporting?openMetrics.filter(m=>sectionsFor(m).includes(id)):relevant.filter(m=>isOpen(m,findings));
  const title=taskReporting&&openNeeds.length&&!findings.length?salesTaskSectionTitle(id,openNeeds[0].sectionTitle,openNeeds[0].displayName||salesMetricName(openNeeds[0])):
   salesSectionTitle(id,findings[0]?.bhsSectionTitle||id);
  const missingQuadrants=includeSwot&&id===swotId?quadrants.filter(q=>!findings.some(f=>f.swotQuadrant===q)):[];
  return {id,title,findingIds:findings.map(f=>f.id),count:findings.length,missingQuadrants,complete:!openNeeds.length&&!missingQuadrants.length,
   ...(describeGaps&&openNeeds.length?{openMetrics:openNeeds.map(metric=>{
    const buyer=buyerRows.get(metric.id);
    const status=salesGapStatus(buyer?{...metric,status:'open',
     researchStatus:buyer.evidence?'partially_verified':metric.researchStatus==='partially_verified'?undefined:metric.researchStatus}:metric);
    return {name:metric.displayName||salesMetricName(metric),status,
     ...(taskReporting?{id:metric.id,...(salesGapLabels[status]?{statusLabel:salesGapLabels[status]}:{})}:{})};
   })}:{})};
 });
}

// Paid completion is authorized for existing open needs, even when Claude
// presents their useful partial findings under a different report heading.
export function openResearchSections(report,requested,fallback=[]){
 const chosen=new Set(list(requested));
 const referenced=new Set(list(report.findings).filter(f=>chosen.has(f.bhsSection)).flatMap(f=>list(f.researchNeedIds)));
 for(const section of list(report.bhsSections))if(chosen.has(section.id))
  for(const metric of list(section.openMetrics))if(metric.id)referenced.add(metric.id);
 return unique(scopedMetrics(report,fallback).filter(metric=>metric.status==='open'&&
  (chosen.has(metric.section)||referenced.has(metric.id))).map(metric=>metric.section));
}
