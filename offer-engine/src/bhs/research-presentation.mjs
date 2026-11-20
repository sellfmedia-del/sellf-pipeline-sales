import {scopedMetrics,scopedCoverage} from './research-status.mjs';

const list=value=>Array.isArray(value)?value:[];
const clean=value=>typeof value==='string'?value.replace(/\s+/gu,' ').trim():'';
const key=value=>clean(value).normalize('NFKD').toLocaleLowerCase('tr').replace(/\p{M}/gu,'').replaceAll('ı','i').replace(/[^\p{L}\p{N}]+/gu,' ').trim();

// Identity/punctuation cleanup only. Distinct periods, numbers, products and
// decisions must not be merged by a semantic guess or an extra model call.
export function researchQuestions(rows,metrics=[]){
 const labels=new Set(metrics.flatMap(row=>[row.name,row.displayName,row.metric]).filter(Boolean).map(key));
 const questions=new Map();
 for(const incoming of list(rows)){
  const row=typeof incoming==='string'?{question:incoming}:incoming;
  const question=clean(row?.question),id=key(question);
  if(!id||labels.has(id))continue;
  const previous=questions.get(id);
  const findingIds=[...new Set([...list(previous?.findingIds),...list(row.findingIds)])];
  questions.set(id,{...(previous||row),question:previous?.question||question,findingIds});
 }
 return [...questions.values()];
}

const causes={
 research_budget_exhausted:'Kalan araştırma bütçesi yeni bir çağrıyı karşılamadı.',
 research_tools_unavailable:'Araştırma için çalıştırılabilir sonraki araç çağrısı bulunamadı.',
 research_engine_failure:'Araştırmada aynı işlem hatası tekrarlandı.',
 research_source_plan_invalid:'Kaynak planı doğrulanamadığı için araştırma sürdürülemedi.',
 evidence_confirmed:'Planlanan araştırma ihtiyaçları doğrulandı.',
 source_plan_invalid:'Kaynak planı doğrulanamadı; bazı sayfalar okunamadı.',
 model_deadline:'Rapor yazımındaki model çağrısı süre sınırına ulaştı.',
 model_timeout:'Rapor yazımındaki model çağrısı zaman aşımına uğradı.',
 provider_timeout:'Sağlayıcı çağrısı zaman aşımına uğradı.',
 report_time_window:'Raporun yazım süresi doldu; tamamlanan bölümler korundu.',
 partial_model_document:'Model yalnız kısmi bir rapor döndürdü.',
 report_checkpoint_missing:'Raporun bazı tamamlanmış bölüm kayıtları bulunamadı.',
 verified_evidence_missing_from_report:'Doğrulanan kanıtların bir kısmı rapora aktarılamadı.',
 no_source_backed_findings:'Yazılan raporda kaynak kontrolünden geçen bulgu oluşmadı.',
 budget_limit:'Bu aşamanın çağrısı kalan bütçeye sığmadı.',
 budget_pending:'Önceki çağrının maliyet kaydı henüz sonuçlanmadı.',
 budget_uncertain:'Önceki çağrının sonucu belirsiz; ayrılmış tutar korundu.',
 input_budget:'Çağrının girdi boyutu kalan bütçeye sığmadı.',
 model_budget:'Model çağrısı kalan aşama bütçesine sığmadı.',
 provider_error:'Sağlayıcı çağrısı hata döndürdü.',
 provider_unavailable:'Sağlayıcı bu turda kullanılamadı.',
 not_configured:'Gerekli araç bağlantısı bu ortamda yapılandırılmamış.',
 claude_spend_limit:'Claude hesabının harcama sınırına ulaşıldı.',
 tariff_expired:'Maliyet tarifesinin geçerlilik kontrolü çağrıyı engelledi.',
 token_count:'Çağrının token hesabı doğrulanamadı.',
 model_output_invalid:'Model çıktısı beklenen sözleşmeye uymadı.',
 model_content_invalid:'Model çıktısındaki içerik doğrulanamadı.',
 model_temporarily_unavailable:'Model bu turda geçici olarak kullanılamadı.',
 model_network:'Model bağlantısı tamamlanamadı.',
 model_failure:'Model çağrısı tamamlanamadı.',
 provider_format:'Sağlayıcı çıktısı beklenen biçimde değildi.',
 provider_size:'Sağlayıcı çıktısı boyut sınırını aştı.',
 provider_accounting:'Sağlayıcı çağrısının maliyeti doğrulanamadı; ayrılmış tutar korundu.',
 provider_rejected:'Sağlayıcı çağrıyı reddetti.',
 invalid_report:'Rapor çıktısı beklenen sözleşmeye uymadı.',
 incomplete:'Rapor çıktısı tamamlanamadı.',
 actor_budget_limit:'Seçilen scraper çağrısı araç maliyet sınırına sığmadı.',
 actor_failed:'Seçilen scraper çağrısı tamamlanamadı.',
 fx_limit:'Kur hesabı izin verilen maliyet sınırına sığmadı.',
 cancelled:'Bu araştırma işlemi durduruldu; tamamlanan kayıtlar korundu.',
 quota:'Sağlayıcı kotası çağrıyı engelledi.',
 fx_unavailable:'Maliyet hesabı için kur doğrulanamadı.'
};
export const knownResearchIssue=code=>typeof code==='string'&&Object.hasOwn(causes,code);

export function researchDiagnostics(supervision={}){
 const rows=[],seen=new Set();
 const add=(stage,code)=>{
  if(typeof code!=='string'||!Object.hasOwn(causes,code)||seen.has(stage+':'+code))return;
  seen.add(stage+':'+code);rows.push({stage,code,message:causes[code]});
 };
 add('research',supervision.researchStopReason);
 add('report',supervision.reportIssue);
 add('reading',supervision.sourceReaderIssue);
 for(const issue of list(supervision.researchIssues))add('tools',issue);
 for(const issue of list(supervision.sectionIssues))add('report',typeof issue==='string'?issue:issue?.issue);
 return rows;
}

export function researchProgress(report,supervision={}){
 if(!Array.isArray(report.verifiedResearch?.metrics))return;
 const metrics=scopedMetrics(report,supervision.metricCoverage);
 const sections=scopedCoverage(report,metrics,true,true,list(report.bhsSections).some(row=>/^swot\b/iu.test(row.id)),true);
 const missing=new Set(sections.flatMap(row=>list(row.openMetrics).filter(metric=>metric.status==='missing_from_report').map(metric=>metric.id)));
 const confirmed=metrics.filter(row=>row.status==='confirmed').length;
 const open=metrics.length-confirmed;
 const reported=metrics.filter(row=>row.status==='confirmed'&&!missing.has(row.id)).length;
 const swotMissing=[...new Set(sections.flatMap(row=>list(row.missingQuadrants)))];
 const findings=list(report.findings).filter(row=>row.kind!=='brief'&&list(row.sourceIds).length).length;
 const hasEvidence=findings>0||metrics.some(row=>list(row.sourceIds).length);
 const complete=metrics.length>0&&!open&&!missing.size&&!swotMissing.length&&!supervision.reportIssue&&
  supervision.researchApproved!==false&&sections.every(row=>row.complete)&&hasEvidence;
 return {state:complete?'complete':hasEvidence?'partial':'unavailable',planned:metrics.length,confirmed,reported,findings,open,
  missingFromReport:missing.size,missingSwotQuadrants:swotMissing,
  partial:metrics.filter(row=>row.status==='open'&&row.researchStatus==='partially_verified').length,
  notSearched:metrics.filter(row=>row.status==='open'&&(row.researchStatus==='not_searched'||!row.researchStatus&&row.searched===false)).length};
}

// Presentation is derived from the current grounded report. It neither changes
// the research receipts nor authorizes another paid request or an offer service.
export function presentResearch(report,supervision={}){
 if(!Array.isArray(report.verifiedResearch?.metrics))return report;
 report.verifiedResearch={...report.verifiedResearch,metrics:scopedMetrics(report,supervision.metricCoverage)};
 report.bhsSections=scopedCoverage(report,report.verifiedResearch.metrics,true,true,
  supervision.researchPlan?.sectionedSynthesis===true||list(report.bhsSections).some(row=>/^swot\b/iu.test(row.id)),true);
 report.meetingQuestions=researchQuestions(report.meetingQuestions,report.verifiedResearch.metrics);
 report.researchProgress=researchProgress(report,supervision);
 report.researchDiagnostics=researchDiagnostics(supervision);
 return report;
}
