import {hydrateCitationSources,verifiedCitationCards,technicalCitations} from './citation-cards.mjs';
import {isReadEvidence,requireGroundedResearch} from './research-content.mjs';
import {normalized,publicUrl} from './verify.mjs';
import {offerReport} from './offer-report.mjs';
import {supportedNumbers,numericEvidence} from './numeric-evidence.mjs';
import {customerFinding,qualifyScopedFinding,repeatedFinding} from './scoped-findings.mjs';
import {groundBuyerProcurement} from './buyer-procurement.mjs';

const readSegments=source=>{const chunks=[];for(const e of [...(source.excerpts||[])].sort((a,b)=>(a.offset??Infinity)-(b.offset??Infinity))){const last=chunks.at(-1);if(last&&Number.isInteger(last.offset)&&Number.isInteger(e.offset)&&last.offset+last.text.length===e.offset)last.text+=e.text;else chunks.push({...e});}return chunks.map(e=>e.text);};
const unsafeReasons=new Set(['invalid_source','unresolved_source','unverified','unread_source_or_unmatched_quote','unsupported_finding','unsupported_benchmark','unsupported_coverage','unsupported_summary_number']);
const missing='Bu araştırmada veri bulunamadı; görüşmede doğrulanacak.';
// A discount and the inverse premium have different denominators. Matching
// their literal percentage does not establish the opposite comparison.
function reversedPercentage(value,evidence){
 return /\b\d+(?:[.,]\d+)?%\s+cheaper than\b/iu.test(evidence)&&/%\s*\d+(?:[.,]\d+)?[^.!?\n]{0,35}\bdaha\s+(?:yüksek|pahalı)/iu.test(value)
  ||/\b\d+(?:[.,]\d+)?%\s+(?:more expensive|higher) than\b/iu.test(evidence)&&/%\s*\d+(?:[.,]\d+)?[^.!?\n]{0,35}\bdaha\s+ucuz/iu.test(value);
}
const unmeasuredJudgement=value=>/(?:gelir sağlığı[^.!?]{0,35}güçlü|bütçe ayırabilecek kapasite|pazarlama yatırım gücüne|funnel alt kısmı[^.!?]{0,50}sağlıklı|sektöre göre iyi|kategorisi için sağlıklı|sektör standardında|sağlıklı sepet|sağlam[^.!?]{0,30}altyapı|sürekli optimize|güçlü marka bilinirliği|agresif bir büyüme trendi|güçlü bir e-ticaret metrik profili|pazar liderli|ana operasyonel darboğaz|kritik bir eksiklik|(?:bülten|sadakat|analytics|analiz|analitik|pixel|piksel|ölçüm|mekanizma)[^.!?\n]{0,180}(?:eksik|yok|gözlemlenmemiş|rastlanma|bulunama))/iu.test(value||'');
const hypothesis='Bu dış kaynak gözleminin iş etkisi, güncel iç veriler ve aynı dönem/coğrafyadaki uygun kıyaslarla doğrulanacak bir hipotezdir. Tek başına finansal sağlık, bütçe kapasitesi veya sektör üstünlüğü kanıtı değildir.';
function completedForecast(finding,evidence){
 if(finding.kind!=='observation'||!/(?:çıkarmış|ulaşmış|artmış|gerçekleşmiş|tamamlanmış|başarmış|elde etmiş|satmış|çıkarıldı|ulaştı|arttı|gerçekleşti|tamamlandı|başardı|elde etti)/iu.test(finding.statement))return false;
 const claimed=new Set(numericEvidence(finding.statement,{locale:'tr',claims:true}).map(n=>n.number));
 for(const future of evidence.matchAll(/(?:\bwill\b|['’]ll\b|\bplans? to\b|\bexpected to\b)[^.!?\n]{0,250}/giu))if(numericEvidence(future[0]).some(n=>claimed.has(n.number)))return true;
 return false;
}
// Deterministic provenance gate: never fetch model-invented URLs or treat a
// syntactically valid citation as proof that its quote was actually read.
// Quote matches do not prove semantic entailment; inference stays labelled.
export function groundOfferReport(value,{packet,searchEvidence=[],brief={},preserveQualifiedImpacts=false,scopedFindings=false}={}){
 const records=(packet?.sources||[]).map(s=>({url:s.finalUrl||s.url,aliases:[s.url,s.finalUrl],title:s.title,text:(s.excerpts||[]).map(e=>e.text).join('\n'),segments:readSegments(s),method:s.method,metadataOnly:s.metadataOnly}));
 for(const search of searchEvidence)for(const s of search.results||[])records.push({url:s.url,aliases:[s.url],title:s.title,text:s.content||'',segments:[s.content||''],method:'search-snippet'});
 for(const source of packet?.sources||[])for(const quote of technicalCitations(source))records.push({url:source.finalUrl||source.url,aliases:[source.url,source.finalUrl],title:source.title,text:quote,segments:[quote],method:'html-signals'});
 const trusted=verifiedCitationCards(packet?.citationCards,records);
 for(const proof of trusted.values())records.push({url:proof.url,aliases:[proof.url],title:proof.title,text:proof.quote,segments:[proof.quote],method:proof.method});
 const hydrated=hydrateCitationSources(value,trusted);
 const projected=offerReport(hydrated),raw=structuredClone(projected),issues=[...projected.transfer.issues];delete raw.originalReport;delete raw.transfer;
 const buyerContexts=new Map(),readableIds=new Set();
 const sources=(raw.sources||[]).filter(s=>{
  const url=publicUrl(s.url),quote=normalized(s.quote),buyer=s.id.startsWith('buyer_');
  const matches=r=>(!buyer||isReadEvidence(r))&&r.aliases.some(alias=>publicUrl(alias)===url)&&quote.length>=24&&r.segments.some(text=>normalized(text).includes(quote));
  const record=records.find(matches);
  if(!record){issues.push({path:'sources.'+s.id,reason:'unread_source_or_unmatched_quote'});return false;}
  if(isReadEvidence(record))readableIds.add(s.id);
  if(buyer){
   const context=records.filter(matches).flatMap(r=>r.segments).filter(text=>normalized(text).includes(quote))
    .reduce((longest,text)=>text.length>longest.length?text:longest,'');
   buyerContexts.set(s.id,context);
  }
  s.title=record.title||s.title;s.publishedAt=null;
  if(s.period&&!supportedNumbers(s.period,record.text))s.period=null;
  if(record.method==='search-snippet')s.scope='Arama motorunun kısmi alıntısı; tam sayfa okunmuş değildir.';
  s.verification={status:'quote_matched',method:record.method};return true;
 });
 const byId=new Map(sources.map(s=>[s.id,s]));
 const supported=ids=>Array.isArray(ids)&&ids.length>0&&ids.every(id=>byId.has(id));
 const quotes=ids=>(ids||[]).map(id=>byId.get(id)?.quote||'').join('\n');
 if(raw.verifiedResearch?.productComparisons){
  const onProduct=(row,url)=>supported(row?.sourceIds)&&row.sourceIds.every(id=>publicUrl(byId.get(id).url)===publicUrl(url));
  const value=(row,url)=>onProduct(row,url)&&typeof row.value==='string'&&row.value.trim()&&
   row.sourceIds.some(id=>normalized(byId.get(id).quote).toLowerCase().includes(normalized(row.value).toLowerCase()))?row:null;
  raw.verifiedResearch.productComparisons=raw.verifiedResearch.productComparisons.filter(row=>
   onProduct(row.reference,row.reference?.url)&&onProduct(row.candidate,row.candidate?.url)).map(row=>({...row,
    fields:row.fields.map(field=>({...field,reference:value(field.reference,row.reference.url),candidate:value(field.candidate,row.candidate.url)}))}));
 }
 if(raw.verifiedResearch?.buyerProcurement){
  raw.verifiedResearch.buyerProcurement=raw.verifiedResearch.buyerProcurement.map(row=>{
   const id=row.evidence?.sourceIds?.[0];
   return groundBuyerProcurement(row,byId.get(id),buyerContexts.get(id));
  });
  const buyers=new Map(raw.verifiedResearch.buyerProcurement.map(row=>[row.needId,row]));
  for(const metric of raw.verifiedResearch.metrics||[]){
   const buyer=buyers.get(metric.id);
   if(!buyer)continue;
   const confirmed=buyer.evidence?.coversTarget&&!buyer.hypothesis;
   if(confirmed)delete metric.researchStatus;
   else if(buyer.evidence)metric.researchStatus='partially_verified';
   else if(metric.status==='confirmed'||metric.researchStatus==='partially_verified')metric.researchStatus='searched';
   metric.status=confirmed?'confirmed':'open';
   metric.sourceIds=buyer.evidence?.sourceIds||[];
   const acceptedUrls=new Set(metric.sourceIds.map(id=>byId.get(id)?.url));
   for(const row of metric.evidence||[])if(row.status==='verified'&&!acceptedUrls.has(row.url))row.status='read';
  }
 }
 if(raw.verifiedResearch?.reportRecovery){
  const recovery=raw.verifiedResearch.reportRecovery;
  const verifiedByNeed=new Map((raw.verifiedResearch.metrics||[]).map(metric=>[metric.id,new Set(metric.sourceIds)]));
  const checkRow=row=>{
   const permitted=verifiedByNeed.get(row?.needId);
   const sourceIds=Array.isArray(row?.sourceIds)?[...new Set(row.sourceIds.filter(id=>
    permitted?.has(id)&&readableIds.has(id)))]:[];
   return sourceIds.length?[{needId:row.needId,sourceIds}]:[];
  };
  const evidence=(Array.isArray(recovery.evidence)?recovery.evidence:[]).flatMap(checkRow);
  const hypotheses=(Array.isArray(recovery.hypotheses)?recovery.hypotheses:[]).flatMap(row=>
   typeof row?.question==='string'&&row.question.trim().endsWith('?')?checkRow(row).map(checked=>({...checked,question:row.question,
    ...(['strength','weakness','opportunity','threat'].includes(row.quadrant)?{quadrant:row.quadrant}:{})})):[]);
  if(evidence.length||hypotheses.length)raw.verifiedResearch.reportRecovery={evidence,hypotheses};
  else delete raw.verifiedResearch.reportRecovery;
 }
 const needs=scopedFindings?new Map((raw.verifiedResearch?.metrics||[]).map(m=>[m.id,{metric:m.name,sectionTitle:m.sectionTitle}])):null;
 const selected=[];
 for(let f of raw.findings||[]){
  // Meeting context remains in the brief; never promote it into research facts.
  if(f.kind==='brief')continue;
  if(needs){
   const cards=f.sourceIds.map(id=>byId.get(id)).filter(Boolean);
   const row=f.researchEvidenceOnly?customerFinding(f,raw):qualifyScopedFinding({observation:f.statement,analysis:f.impact,
    section:f.bhsSection,sectionTitle:f.bhsSectionTitle,needIds:f.researchNeedIds},cards,needs);
   if(!row||selected.some(prior=>prior.sourceIds.some(id=>f.sourceIds.includes(id))&&repeatedFinding(f.statement,prior.statement))){
    issues.push({path:'findings.'+f.id,reason:'unsupported_finding'});continue;
   }
   if(!f.researchEvidenceOnly){
    if(row.analysis!==f.impact)issues.push({path:'findings.'+f.id,reason:'unsupported_finding'});
    f={...f,...(row.section?{bhsSection:row.section}:{}),...(row.sectionTitle?{bhsSectionTitle:row.sectionTitle}:{}),
     ...(row.needIds?{researchNeedIds:row.needIds}:{}),impact:row.analysis};
   }
  }
  const ok=supported(f.sourceIds)&&!completedForecast(f,quotes(f.sourceIds))&&!reversedPercentage([f.statement,f.reportExcerpt,f.impact].join(' '),quotes(f.sourceIds))&&supportedNumbers([f.statement,f.impact].join(' '),quotes(f.sourceIds))&&supportedNumbers(f.goalConnection,[quotes(f.sourceIds),brief.goals,brief.needs,brief.services,brief.meetingNotes].filter(Boolean).join(' '));
  if(ok)selected.push(f);else issues.push({path:'findings.'+f.id,reason:'unsupported_finding'});
 }
 const findings=selected.map(f=>{
  if(preserveQualifiedImpacts&&f.impact.startsWith('Hipotez: ')&&f.impact.includes(' Sınır: '))return f;
  if(!unmeasuredJudgement([f.statement,f.impact,f.goalConnection].join(' ')))return f;
  issues.push({path:'findings.'+f.id,reason:'unmeasured_impact_qualified'});
  const inferred=unmeasuredJudgement(f.statement);
  return {...f,...(inferred?{kind:'inference',statement:f.statement.startsWith('Görüşmede doğrulanacak hipotez: ')?f.statement:'Görüşmede doğrulanacak hipotez: '+f.statement}:{}),impact:inferred||unmeasuredJudgement(f.impact)?hypothesis:f.impact,goalConnection:inferred||unmeasuredJudgement(f.goalConnection)?hypothesis:f.goalConnection};
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
    strengths:kept.length&&!scopedFindings?(d.strengths||[]).filter(value=>supportedNumbers(value,text)&&!unmeasuredJudgement(value)):[],
    gaps:kept.length?[...(!scopedFindings?(d.gaps||[]).filter(value=>supportedNumbers(value,text)):[]),'Bazı iddialar doğrulanamadı; korunan bulgular üzerinden görüşmede tamamlanacak.']:[missing]};
  }
  return {...d,strengths:(d.strengths||[]).filter(value=>!unmeasuredJudgement(value)),score:peers.length&&d.dataStatus!=='insufficient'?d.score:null};
 });
 const benchmarks=(raw.benchmarks||[]).map(b=>({...b,entries:(b.entries||[]).map(e=>{
  if(e.value===null||supported(e.sourceIds)&&!reversedPercentage(e.value,quotes(e.sourceIds))&&supportedNumbers([e.value,e.period].filter(v=>v!==null).join(' '),quotes(e.sourceIds)))return e;
  issues.push({path:'benchmarks.'+b.metric+'.'+e.entityId,reason:'unsupported_benchmark'});return {...e,value:null,unit:null,period:null,sourceIds:[]};
 })}));
 const coverage=(areas)=>{
  const result=structuredClone(areas||{});
  for(const a of Array.isArray(result)?result:Object.values(result)){
   if(scopedFindings&&a.status!=='unavailable'){
    const matching=findings.filter(f=>f.dimension===a.dimension&&f.sourceIds.some(id=>a.sourceIds?.includes(id))&&a.observation.includes(f.statement));
    a.observation=matching.map(f=>f.statement).join(' ');a.sourceIds=[...new Set(matching.flatMap(f=>f.sourceIds))];
   }
   if(a.status==='unavailable'||!supported(a.sourceIds)||reversedPercentage(a.observation,quotes(a.sourceIds))||!supportedNumbers(a.observation,quotes(a.sourceIds))){
    if(a.status!=='unavailable')issues.push({path:'researchCoverage',reason:'unsupported_coverage'});
    a.status='unavailable';a.observation=missing;a.sourceIds=[];
   }else if(!preserveQualifiedImpacts&&unmeasuredJudgement(a.observation)){
    issues.push({path:'researchCoverage',reason:'unmeasured_impact_qualified'});a.status='partial';if(!a.observation.startsWith('Görüşmede doğrulanacak hipotez: '))a.observation='Görüşmede doğrulanacak hipotez: '+a.observation.replace(/[,.;:]?\s*(?:ancak )?bu kritik bir eksiklik\.?/giu,'')+' Bu sınırlı dış kaynak gözlemi, mekanizmanın yokluğunu veya çalışmadığını kanıtlamaz.';
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
 const report=requireGroundedResearch(groundOfferReport(data,context));
 if(report.transfer.issues.some(issue=>unsafeReasons.has(issue.reason))){const error=Error('Source checks rejected model claims');error.safeData=report;throw error;}
}
