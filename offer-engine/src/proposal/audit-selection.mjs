// Presentation only: select existing research, never score/research/review it.
import {customerFinding} from '../bhs/scoped-findings.mjs';
import {consentEvidenceRequested,researchGapQuestion,substantiveEvidence} from '../bhs/research-text.mjs';
import {scopedCoverage,scopedMetrics} from '../bhs/research-status.mjs';

const array=value=>Array.isArray(value)?value:[];
const normalize=value=>String(value||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
function short(value,max){
 const text=typeof value==='string'?value.replace(/\s+/g,' ').trim():'';
 if(text.length<=max)return text;
 const head=text.slice(0,max-1),sentence=[...head.matchAll(/[.!?](?=\s|$)/g)].at(-1)?.index;
 // Preserve complete sentences where possible; otherwise visibly excerpt at a word.
 if(sentence>=Math.floor(max*.45))return head.slice(0,sentence+1);
 const space=head.lastIndexOf(' ');return head.slice(0,space>max*.5?space:head.length)+'…';
}
export function selectProposalAudit(audit={},brief={},pricing={}){
 const knownSources=new Set(array(audit.sources).map(s=>s?.id));
 const contextPending=audit.researchReuse?.contextNeedsConfirmation===true;
 const excluded=array(audit.findings).filter(f=>f&&f.kind!=='brief'&&!customerFinding(f,audit));
 const affectedDimensions=new Set(excluded.map(f=>f.dimension));
 const legacyDimensions=new Set(excluded.filter(f=>f.researchEvidenceOnly).map(f=>f.dimension));
 const sourceIdsFor=dimension=>array(audit.findings).filter(f=>f.dimension===dimension&&!excluded.includes(f)).flatMap(f=>array(f.sourceIds));
 const presentable=(statement,sourceIds=[])=>customerFinding({kind:'inference',statement,sourceIds,
  researchNeedIds:array(audit.verifiedResearch?.metrics).filter(metric=>array(metric.sourceIds).some(id=>sourceIds.includes(id))).map(metric=>metric.id)},audit);
 const metadataGaps=[];
 const metadataAllowed=(statement,dimension,ids=sourceIdsFor(dimension))=>{
  const allowed=presentable(statement,ids);
  if(!allowed&&typeof statement==='string'&&statement.trim())metadataGaps.push({statement,dimension});
  return allowed;
 };
 const findings=array(audit.findings).filter(f=>f&&typeof f==='object'&&customerFinding(f,audit)).map(f=>{const sourceIds=array(f.sourceIds).filter(id=>knownSources.has(id));return {...f,sourceIds,...(!sourceIds.length||contextPending?{verification:'unverified'}:{})};}),linked=new Set(array(pricing.scope?.selected).flatMap(s=>array(s.findingIds)));
 const critical=new Set([audit.criticalOpportunityFindingId,audit.criticalRiskFindingId].filter(Boolean));
 const terms=new Set(normalize([brief.goals,brief.needs,brief.services,brief.meetingNotes].filter(Boolean).join(' ')).match(/[\p{L}\p{N}]{4,}/gu)||[]);
 const rank=f=>{
  const words=new Set(normalize([f.statement,f.goalConnection].filter(Boolean).join(' ')).match(/[\p{L}\p{N}]{4,}/gu)||[]);
  return (critical.has(f.id)?1000:0)+({high:60,medium:40,low:20}[f.priority]||0)+(linked.has(f.id)?8:0)+Math.min(4,[...words].filter(w=>terms.has(w)).length);
 };
 const sorted=findings.map((f,i)=>({f,i,rank:rank(f)})).filter(({f})=>typeof f.statement==='string'&&f.statement.trim()).sort((a,b)=>b.rank-a.rank||a.i-b.i);
 const selected=[],seen=new Map();
 // No global or per-heading finding count: all methodology dimensions remain.
 for(const {f} of sorted){
  const key=(f.bhsSection||'')+' '+normalize(f.statement).replace(/\s+/g,' ').trim();
  if(seen.has(key)){
   const prior=seen.get(key);
   if(prior.peerId===f.peerId&&prior.swotQuadrant===f.swotQuadrant){
    prior.researchNeedIds=[...new Set([...array(prior.researchNeedIds),...array(f.researchNeedIds)])];
    prior.sourceIds=[...new Set([...prior.sourceIds,...f.sourceIds])];
   }
   continue;
  }
  const item={...f,statement:short(f.statement,280),impact:short(f.impact,240)};
  selected.push(item);seen.set(key,item);
 }
 const benchmarks=array(audit.benchmarks).filter(b=>typeof b.metric==='string'&&array(b.entries).some(e=>e.value!=null)).map(b=>({metric:b.metric,entries:array(b.entries).map(e=>{const sourceIds=array(e.sourceIds).filter(id=>knownSources.has(id));return {entityId:e.entityId,value:e.value==null?null:short(String(e.value),200),unit:e.unit,period:e.period,sourceIds,...(e.value!=null&&!sourceIds.length?{verification:'unverified'}:{})};})}));
 const coverage=array(audit.researchCoverage).filter(c=>typeof c?.observation==='string'&&c.observation.trim()&&c.observation!=='Bu araştırmada veri bulunamadı; görüşmede doğrulanacak.'&&!legacyDimensions.has(c.dimension)&&metadataAllowed(c.observation,c.dimension,array(c.sourceIds)));
 const sourceIds=new Set([...selected.flatMap(f=>array(f.sourceIds)),...coverage.flatMap(c=>c.sourceIds),...benchmarks.flatMap(b=>b.entries.flatMap(e=>e.sourceIds))]);
 const keepSources=ids=>array(ids).filter(id=>knownSources.has(id)).map(id=>{sourceIds.add(id);return id;});
 const buyerProcurement=contextPending?[]:array(audit.verifiedResearch?.buyerProcurement).flatMap(({needId,segment,label,targetMarket,evidence,hypothesis})=>{
  const proofs=keepSources(evidence?.sourceIds);
  return proofs.length||hypothesis?[{...(needId?{needId}:{}),segment,label,targetMarket,...(hypothesis?{hypothesis}:{}),
   ...(proofs.length?{evidence:{segment:evidence.segment,market:evidence.market,value:evidence.value,sourceIds:proofs,coversTarget:evidence.coversTarget===true}}:{})}]:[];
 });
 const verifiedResearch=audit.verifiedResearch&&!contextPending?{metrics:scopedMetrics(audit).map(({evidence,additionalEvidence,requestedMarket,requestedPeriod,marketMeasures,sourceIds,...metric})=>{
  const usable=array(sourceIds).filter(id=>{const source=array(audit.sources).find(s=>s.id===id);return typeof source?.quote!=='string'||substantiveEvidence(source.quote,{preserveConsent:consentEvidenceRequested(metric)});});
  return {...metric,...(array(sourceIds).length&&!usable.length?{status:'open',researchStatus:'searched'}:{}),sourceIds:keepSources(usable),...(marketMeasures?{marketMeasures:marketMeasures.map(row=>
   ({...row,sourceIds:keepSources(row.sourceIds)})).filter(row=>row.sourceIds.length)}:{})};}),
  ...(buyerProcurement.length?{buyerProcurement}:{})}:undefined;
 const competitors=array(audit.competitors).map(p=>({id:p.id,name:p.name,...(verifiedResearch?{sourceIds:keepSources(p.sourceIds)}:{})}));
 const excludedIds=new Set(excluded.map(f=>f.id));
 const needs=new Map(array(audit.verifiedResearch?.metrics).map(metric=>[metric.id,metric]));
 const dimensionRows=array(audit.dimensions).map(d=>{
  const items=selected.filter(f=>f.dimension===d.id).map(f=>({id:f.id,text:f.statement,kind:f.kind,sourceIds:array(f.sourceIds),...(f.verification?{verification:f.verification}:{})}));
  if(legacyDimensions.has(d.id))return {id:d.id,score:null,dataStatus:items.length?'partial':'insufficient',rationale:items[0]?.text||'',highlights:items};
  for(const c of coverage.filter(c=>c.dimension===d.id)){
   const text=short(c.observation,200);
   if(text&&!items.some(i=>normalize(i.text)===normalize(text)))items.push({text,topic:c.topic,sourceIds:array(c.sourceIds).filter(id=>knownSources.has(id)),
    ...(c.status==='unavailable'||!array(c.sourceIds).some(id=>knownSources.has(id))?{verification:'unverified'}:{})});
  }
  let changed=affectedDimensions.has(d.id);
  for(const [label,values] of [['Güçlü yön',d.strengths],['Gelişim alanı',d.gaps]])for(const value of array(values)){
   if(!metadataAllowed(value,d.id)){changed=true;continue;}
   const text=short(value,200);if(text&&!items.some(i=>i.text===text))items.push({text:label+': '+text});
  }
  let rationale=short(d.rationale,360);
  if(typeof d.rationale==='string'&&d.rationale.trim()&&!metadataAllowed(d.rationale,d.id)){changed=true;rationale=items[0]?.text||'';}
  return {id:d.id,score:changed?null:d.score,dataStatus:changed?(items.length?'partial':'insufficient'):d.dataStatus,rationale,highlights:items};
 });
 const invalidSummary=typeof audit.summary==='string'&&audit.summary.trim()&&!metadataAllowed(audit.summary,undefined,selected.flatMap(f=>array(f.sourceIds)));
 const openQuestions=[...excluded,...metadataGaps].map(f=>researchGapQuestion(f,needs)).filter(Boolean);
 const summary=excluded.length||invalidSummary?(selected[0]?.statement||'Araştırma soruları görüşmede değerlendirilecek.'):audit.summary;
 const sections=verifiedResearch&&Array.isArray(audit.bhsSections)?scopedCoverage({findings:selected,competitors,verifiedResearch},
  verifiedResearch.metrics,true,true,audit.bhsSections.some(section=>/^swot\b/iu.test(section.id)),true):
  excluded.length?array(audit.bhsSections).map(section=>{
   const findingIds=array(section.findingIds).filter(id=>!excludedIds.has(id));
   return {...structuredClone(section),findingIds,count:findingIds.length,complete:section.complete&&findingIds.length===array(section.findingIds).length};
  }):structuredClone(audit.bhsSections);
 return {summary:short(summary,340),...(audit.researchContinuity?{researchContinuity:structuredClone(audit.researchContinuity)}:{}),
  ...(verifiedResearch?{verifiedResearch}:{}),
  ...(audit.bhsSections?{bhsSections:sections,meetingQuestions:[...new Set([...array(audit.meetingQuestions).filter(q=>!array(q.findingIds).some(id=>excludedIds.has(id))).map(q=>q.question),...openQuestions])]}:{}),scoring:audit.scoring?{total:excluded.length||metadataGaps.length?null:audit.scoring.total}:undefined,
  dimensions:dimensionRows,
  findings:selected.map(f=>({id:f.id,kind:f.kind,dimension:f.dimension,priority:f.priority,statement:f.statement,impact:f.impact,sourceIds:array(f.sourceIds),
   ...(f.bhsSection?{bhsSection:f.bhsSection,bhsSectionTitle:f.bhsSectionTitle}:{}),...(Array.isArray(f.researchNeedIds)?{researchNeedIds:[...f.researchNeedIds]}:{}),
   ...(f.recommendation?{recommendation:structuredClone(f.recommendation),bhsRank:f.bhsRank,swotQuadrant:f.swotQuadrant,peerId:f.peerId}:{}),...(f.verification?{verification:f.verification}:{})})),
  competitors,benchmarks,
  sources:array(audit.sources).filter(s=>sourceIds.has(s.id)).map(s=>({id:s.id,title:short(s.title,96),url:s.url}))};
}
