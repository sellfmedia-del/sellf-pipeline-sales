import {normalized,publicUrl} from './verify.mjs';
import {offerReport} from './offer-report.mjs';
import {supportedNumbers,numericEvidence} from './numeric-evidence.mjs';

const readSegments=source=>{const chunks=[];for(const e of [...(source.excerpts||[])].sort((a,b)=>(a.offset??Infinity)-(b.offset??Infinity))){const last=chunks.at(-1);if(last&&Number.isInteger(last.offset)&&Number.isInteger(e.offset)&&last.offset+last.text.length===e.offset)last.text+=e.text;else chunks.push({...e});}return chunks.map(e=>e.text);};
const unsafeReasons=new Set(['invalid_source','unresolved_source','unverified','unread_source_or_unmatched_quote','unsupported_finding','unsupported_benchmark','unsupported_coverage','unsupported_summary_number']);
const missing='Bu araştırmada veri bulunamadı; görüşmede doğrulanacak.';
function completedForecast(finding,evidence){
 if(finding.kind!=='observation'||!/(?:çıkarmış|ulaşmış|artmış|gerçekleşmiş|tamamlanmış|başarmış|elde etmiş|satmış|çıkarıldı|ulaştı|arttı|gerçekleşti|tamamlandı|başardı|elde etti)/iu.test(finding.statement))return false;
 const claimed=new Set(numericEvidence(finding.statement,{locale:'tr',claims:true}).map(n=>n.number));
 for(const future of evidence.matchAll(/(?:\bwill\b|['’]ll\b|\bplans? to\b|\bexpected to\b)[^.!?\n]{0,250}/giu))if(numericEvidence(future[0]).some(n=>claimed.has(n.number)))return true;
 return false;
}
// Deterministic provenance gate: never fetch model-invented URLs or treat a
// syntactically valid citation as proof that its quote was actually read.
// Quote matches do not prove semantic entailment; inference stays labelled.
export function groundOfferReport(value,{packet,searchEvidence=[],brief={}}={}){
 const projected=offerReport(value),raw=structuredClone(projected),issues=[...projected.transfer.issues];delete raw.originalReport;delete raw.transfer;
 const records=(packet?.sources||[]).map(s=>({url:s.finalUrl||s.url,aliases:[s.url,s.finalUrl],title:s.title,text:(s.excerpts||[]).map(e=>e.text).join('\n'),segments:readSegments(s),method:s.method}));
 for(const search of searchEvidence)for(const s of search.results||[])records.push({url:s.url,aliases:[s.url],title:s.title,text:s.content||'',segments:[s.content||''],method:'search-snippet'});
 const sources=(raw.sources||[]).filter(s=>{
  const url=publicUrl(s.url),quote=normalized(s.quote),record=records.find(r=>r.aliases.some(alias=>publicUrl(alias)===url)&&quote.length>=24&&r.segments.some(text=>normalized(text).includes(quote)));
  if(!record){issues.push({path:'sources.'+s.id,reason:'unread_source_or_unmatched_quote'});return false;}
  s.title=record.title||s.title;s.publishedAt=null;
  if(s.period&&!supportedNumbers(s.period,record.text))s.period=null;
  if(record.method==='search-snippet')s.scope='Arama motorunun kısmi alıntısı; tam sayfa okunmuş değildir.';
  s.verification={status:'quote_matched',method:record.method};return true;
 });
 const byId=new Map(sources.map(s=>[s.id,s]));
 const supported=ids=>Array.isArray(ids)&&ids.length>0&&ids.every(id=>byId.has(id));
 const quotes=ids=>(ids||[]).map(id=>byId.get(id)?.quote||'').join('\n');
 const findings=(raw.findings||[]).filter(f=>{
  // Meeting context remains in the brief; never promote it into research facts.
  if(f.kind==='brief')return false;
  const ok=supported(f.sourceIds)&&!completedForecast(f,quotes(f.sourceIds))&&supportedNumbers([f.statement,f.impact].join(' '),quotes(f.sourceIds))&&supportedNumbers(f.goalConnection,[quotes(f.sourceIds),brief.goals,brief.needs,brief.services,brief.meetingNotes].filter(Boolean).join(' '));
  if(!ok)issues.push({path:'findings.'+f.id,reason:'unsupported_finding'});return ok;
 });
 const findingIds=new Set(findings.map(f=>f.id));
 const competitors=(raw.competitors||[]).filter(p=>supported(p.sourceIds)&&publicUrl(p.website)&&(p.sourceIds||[]).some(id=>new URL(byId.get(id).url).hostname===new URL(p.website).hostname));
 const peerIds=new Set(competitors.map(p=>p.id));
 const dimensions=(raw.dimensions||[]).map(d=>{
  const kept=(d.findingIds||[]).filter(id=>findingIds.has(id)),peers=(d.comparisonCompetitorIds||[]).filter(id=>peerIds.has(id));
  const numeric=supportedNumbers([d.rationale,...(d.strengths||[]),...(d.gaps||[])].join(' '),findings.filter(f=>kept.includes(f.id)).map(f=>quotes(f.sourceIds)).join(' '));
  const changed=!numeric||kept.length!==(d.findingIds||[]).length||peers.length!==(d.comparisonCompetitorIds||[]).length;
  if(!kept.length||changed){
   issues.push({path:'dimensions.'+d.id,reason:'unsupported_dimension_claims'});
   const evidence=findings.filter(f=>kept.includes(f.id)),text=evidence.map(f=>quotes(f.sourceIds)).join('\n');
   return {...d,score:null,dataStatus:kept.length?'partial':'insufficient',findingIds:kept,comparisonCompetitorIds:peers,
    rationale:kept.length?evidence.map(f=>f.statement).join(' ').slice(0,3000):missing,
    strengths:kept.length?(d.strengths||[]).filter(value=>supportedNumbers(value,text)):[],
    gaps:kept.length?[...(d.gaps||[]).filter(value=>supportedNumbers(value,text)),'Bazı iddialar doğrulanamadı; korunan bulgular üzerinden görüşmede tamamlanacak.']:[missing]};
  }
  return {...d,score:peers.length&&d.dataStatus!=='insufficient'?d.score:null};
 });
 const benchmarks=(raw.benchmarks||[]).map(b=>({...b,entries:(b.entries||[]).map(e=>{
  if(e.value===null||supported(e.sourceIds)&&supportedNumbers([e.value,e.period].filter(v=>v!==null).join(' '),quotes(e.sourceIds)))return e;
  issues.push({path:'benchmarks.'+b.metric+'.'+e.entityId,reason:'unsupported_benchmark'});return {...e,value:null,unit:null,period:null,sourceIds:[]};
 })}));
 const coverage=(areas)=>{
  const result=structuredClone(areas||{});
  for(const a of Array.isArray(result)?result:Object.values(result)){
   if(a.status==='unavailable'||!supported(a.sourceIds)||!supportedNumbers(a.observation,quotes(a.sourceIds))){
    if(a.status!=='unavailable')issues.push({path:'researchCoverage',reason:'unsupported_coverage'});
    a.status='unavailable';a.observation=missing;a.sourceIds=[];
   }
  }return result;
 };
 const researchCoverage=coverage(raw.researchCoverage);
 const allQuotes=sources.map(s=>s.quote).join('\n');
 if(!supportedNumbers(raw.summary,allQuotes))issues.push({path:'summary',reason:'unsupported_summary_number'});
 const summary=!sources.length||issues.some(issue=>unsafeReasons.has(issue.reason))?(findings.map(f=>f.statement).join(' ')||'Kaynak doğrulaması yeterli değil. Kamuya açık veriler görüşmede tamamlanacak; doğrulanmamış iddia kullanılmadı.'):raw.summary;
 const report=offerReport({...raw,summary,sources,findings,competitors,dimensions,benchmarks,researchCoverage,
  criticalOpportunityFindingId:findingIds.has(raw.criticalOpportunityFindingId)?raw.criticalOpportunityFindingId:null,
  criticalRiskFindingId:findingIds.has(raw.criticalRiskFindingId)?raw.criticalRiskFindingId:null,
  meetingQuestions:(raw.meetingQuestions||[]).filter(q=>(q.findingIds||[]).every(id=>findingIds.has(id))),
  serviceRecommendations:(raw.serviceRecommendations||[]).filter(s=>(s.findingIds||[]).length&&(s.findingIds||[]).every(id=>findingIds.has(id)))});
 report.transfer.issues.push(...issues);report.transfer.contentComplete=report.transfer.issues.length===0;
 return report;
}

export function validateGroundedOutput(data,context){
 const report=groundOfferReport(data,context);
 if(report.transfer.issues.some(issue=>unsafeReasons.has(issue.reason))){const error=Error('Source checks rejected model claims');error.safeData=report;throw error;}
}
