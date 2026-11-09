// Preview-only replay of paid public QA samples; never reads/writes saved offers.
import {qualifyExpertFinding,labelUnconfirmedComparison,expertVersion} from '../src/bhs/expert-report.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
const fold=s=>String(s||'').toLocaleLowerCase('tr');
export function replayPublicSample(sample,commit){
 const result=structuredClone(sample),d=result.audit.data;
 result.summary={...result.summary,previewReplay:true,replayedFromCommit:commit,newPaidCalls:0,offerFlowCheckedOnOriginalSample:Boolean(result.summary.offerFlowPassed)};
 if(d.researchContinuity){d.rawReport=d.researchContinuity.notice||d.summary;return result;}
 const pairs=[],unconfirmed=(result.summary.peerDiagnostics||[]).filter(p=>!p.accepted).map(p=>p.name);
 for(const f of d.findings){
  const at=f.impact.indexOf(' Sınır: '),raw={observation:f.statement,commercialHypothesis:(at<0?f.impact:f.impact.slice(0,at)).replace(/^Hipotez: /,''),limitation:at<0?'':f.impact.slice(at+8),question:f.goalConnection};
  const quotes=f.sourceIds.map(id=>d.sources.find(s=>s.id===id)?.quote||'').join('\n'),q=qualifyExpertFinding(raw,quotes);
  let next={...f,statement:q.observation,reportExcerpt:q.observation,impact:'Hipotez: '+q.commercialHypothesis+' Sınır: '+q.limitation,goalConnection:q.question};
  if(unconfirmed.some(name=>fold([next.statement,next.impact,next.goalConnection].join(' ')).includes(fold(name))))next=labelUnconfirmedComparison(next);
  for(const key of ['statement','reportExcerpt','impact','goalConnection'])if(f[key]&&f[key]!==next[key])pairs.push([f[key],next[key]]);
 }
 const copy=(v,key)=>key==='sources'?structuredClone(v):typeof v==='string'?pairs.reduce((s,[a,b])=>s.split(a).join(b),v):Array.isArray(v)?v.map(x=>copy(x)):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,copy(x,k)])):v;
 const report=copy(d);delete report.rawReport;delete report.originalReport;delete report.report;
 const packet={provenance:'public-acceptance-verified-quote-replay',sources:d.sources.map(s=>({url:s.url,finalUrl:s.url,title:s.title,method:s.verification.method,excerpts:[{text:s.quote}]}))};
 result.audit=directAuditResult(result.brief,{report,analysisPacket:packet,methodologyVersion:expertVersion});
 const updated=result.audit.data;Object.assign(result.summary,{findings:updated.findings.length,sources:updated.sources.length,peers:updated.competitors.length,availableAreas:updated.researchCoverage.filter(a=>a.status!=='unavailable').length,coverage:updated.researchCoverage.length});
 return result;
}

