// Preview-only replay of paid public QA samples; never reads/writes saved offers.
import {qualifyExpertFinding,labelUnconfirmedComparison,expertVersion} from '../src/bhs/expert-report.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
const fold=s=>String(s||'').toLocaleLowerCase('tr');
export function replayPublicSample(sample,commit){
 const result=structuredClone(sample),d=result.audit.data;
 result.summary={...result.summary,previewReplay:true,replayedFromCommit:sample.originCommit||commit,newPaidCalls:0,offerFlowCheckedOnOriginalSample:Boolean(result.summary.offerFlowPassed)};
 if(d.researchContinuity){d.rawReport=d.researchContinuity.notice||d.summary;return result;}
 const pairs=[],neutral=[],unconfirmed=(result.summary.peerDiagnostics||[]).filter(p=>!p.accepted).map(p=>p.name);
 for(const f of d.findings){
  const at=f.impact.indexOf(' Sınır: '),raw={observation:f.statement,commercialHypothesis:(at<0?f.impact:f.impact.slice(0,at)).replace(/^Hipotez: /,''),limitation:at<0?'':f.impact.slice(at+8),question:f.goalConnection};
  const quotes=f.sourceIds.map(id=>d.sources.find(s=>s.id===id)?.quote||'').join('\n'),q=qualifyExpertFinding(raw,quotes);
  if(q.commercialHypothesis!==raw.commercialHypothesis)neutral.push(f);
  let next={...f,statement:q.observation,reportExcerpt:q.observation,impact:'Hipotez: '+q.commercialHypothesis+' Sınır: '+q.limitation,goalConnection:q.question};
  const peers=unconfirmed.filter(name=>fold([next.statement,next.impact,next.goalConnection].join(' ')).includes(fold(name)));
  if(peers.length){next=labelUnconfirmedComparison(next,{peerInStatement:peers.some(name=>fold(next.statement).includes(fold(name))),peerInQuestion:peers.some(name=>fold(next.goalConnection).includes(fold(name)))});if(!neutral.includes(f))neutral.push(f);}
  for(const key of ['statement','reportExcerpt','impact','goalConnection'])if(f[key]&&f[key]!==next[key])pairs.push([f[key],next[key]]);
 }
 const copy=(v,key)=>key==='sources'?structuredClone(v):typeof v==='string'?pairs.reduce((s,[a,b])=>s.split(a).join(b),v):Array.isArray(v)?v.map(x=>copy(x)):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,copy(x,k)])):v;
 const report=copy(d);delete report.rawReport;delete report.originalReport;delete report.report;
 for(const dimension of report.dimensions)for(const key of ['strengths','gaps'])dimension[key]=dimension[key].filter(text=>!neutral.some(f=>text.includes(f.statement)));
 if(neutral.some(f=>f.id===report.criticalRiskFindingId))report.criticalRiskFindingId=null;
 if(neutral.some(f=>f.id===report.criticalOpportunityFindingId))report.criticalOpportunityFindingId=null;
 const packet={provenance:'public-acceptance-verified-quote-replay',sources:d.sources.map(s=>({url:s.url,finalUrl:s.url,title:s.title,method:s.verification.method,excerpts:[{text:s.quote}]}))};
 result.audit=directAuditResult(result.brief,{report,analysisPacket:packet,methodologyVersion:expertVersion});
 const updated=result.audit.data;Object.assign(result.summary,{findings:updated.findings.length,sources:updated.sources.length,peers:updated.competitors.length,availableAreas:updated.researchCoverage.filter(a=>a.status!=='unavailable').length,coverage:updated.researchCoverage.length});
 return result;
}

