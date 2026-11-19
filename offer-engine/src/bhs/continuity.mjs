import {hasGroundedResearch} from './research-content.mjs';
import {directAuditResult} from './direct-report.mjs';
import {fallbackScope} from '../pricing/scope.mjs';
import {readReusableResearch} from './reuse.mjs';
import {salesMetricName,salesSectionTitle} from './sales-research-labels.mjs';
import {scopedCoverage,scopedMetrics,scopedSupervision} from './research-status.mjs';
import {renderGroundedReport} from './grounded-report.mjs';
export const continuationCodes=new Set(['research_empty','model_temporarily_unavailable','model_content_invalid','model_deadline','model_output_invalid','model_timeout','model_network','budget_limit','budget_uncertain','quota','provider_error','provider_unavailable','provider_format','provider_accounting','invalid_report','stage_failed','stage_abandoned','search_unavailable','tariff_expired','fx_unavailable','fx_limit','not_configured','claude_spend_limit']);
export function abandonedStage(step,now){
 return step?.state==='reserved'&&step.charge_kurus===0&&Number.isFinite(Date.parse(step.created_at))&&now-Date.parse(step.created_at)>360000;
}
export function canContinue(step,now){
 return abandonedStage(step,now)||step?.state==='uncertain'&&step.charge_kurus===0&&continuationCodes.has(step.value?.code);
}
// Zero-cost handoff. A completed report keeps its checked scope and copy.
export function continuationAudit(brief,{synthesis,reason,verifiedAudit,managed=false}){
 const saved=synthesis||{report:{summary:'',sources:[],findings:[]},methodologyVersion:'research-unavailable'};
 const audit=verifiedAudit||directAuditResult(brief,managed?{...saved,supervision:{...saved.supervision,reviewMode:'managed-audit'}}:saved);
 const partial=hasGroundedResearch(audit.data);
 audit.status='ready';
 const missing=audit.data.bhsSections?.filter(section=>!section.complete)||[];
 const detailed=missing.some(section=>section.openMetrics?.length);
 const notice=(partial?(audit.data.verifiedResearch?.reportRecovery?'Kayıtlı kanıtlarla kısmi BHS hazır.':'Doğrulanan bulgular hazır.')+' Fiyatlandırmaya geçebilirsin.'
  :'Teklif hazırlığına görüşme hedefleri ve hizmet kapsamıyla devam edebilirsin. Bu araştırmada teklife aktarılabilecek doğrulanmış bulgu bulunmuyor.')
  +(missing.length&&!detailed?' Ek kanıt gereken bölümler: '+missing.map(section=>section.title).join(', ')+'.':'')
  +(reason==='claude_spend_limit'?' Claude API hesabının harcama sınırına ulaşıldı. Önceki araştırma kayıtları korundu.':'');
 audit.data.researchContinuity={status:partial?'partial':'unavailable',reason,additionalPaidCalls:0,notice};
 audit.data.quality.contentComplete=false;audit.data.quality.issues.push({path:'research',reason:'incomplete_handoff'});
 audit.data.report.transfer.contentComplete=false;
 if(verifiedAudit)return audit;
 audit.data.scopePlan=fallbackScope(brief);
 audit.data.proposalCopy={headline:'Net hedefler.',accent:'Birlikte büyüme.',subtitle:'Görüşmede belirtilen hedef ve hizmet kapsamına dayalı işbirliği teklifimiz.',findingIds:[]};
 audit.data.summary=notice;audit.data.report.summary=notice;
 audit.data.rawReport=notice+'\n\n'+audit.data.rawReport;
 return audit;
}
// An old empty handoff must not hide subsequently available, completed research
// on the same authorised card. Read and re-ground it; never replay paid work.
export async function restoreContinuation(brief,audit,ledger,now=Date.now()){
 if(Array.isArray(audit?.data?.verifiedResearch?.metrics)&&Array.isArray(audit.data.bhsSections)){
  const prior=audit.data,metrics=scopedMetrics(prior,prior.supervision?.metricCoverage);
  const verifiedResearch={...prior.verifiedResearch,metrics};
  const bhsSections=scopedCoverage(prior,metrics,true,true,prior.bhsSections.some(section=>/^swot\b/iu.test(section.id)),true);
  const incomplete=bhsSections.some(section=>!section.complete);
  const researchCoverage=(prior.researchCoverage||[]).filter(row=>row.status!=='unavailable');
  const report=prior.report?{...prior.report,bhsSections,researchCoverage,verifiedResearch,
   ...(prior.report.transfer&&incomplete?{transfer:{...prior.report.transfer,contentComplete:false}}:{})}:undefined;
  const quality=prior.quality?{...prior.quality,...(incomplete?{checksPassed:false,contentComplete:false}:{}),
   methodologyCoverage:{expected:metrics.length,present:metrics.filter(metric=>metric.status==='confirmed').length,scope:'planned_needs'},
   issues:(prior.quality.issues||[]).filter(issue=>!(issue.path?.startsWith('researchCoverage.')&&issue.reason==='unavailable_or_unverified'))}:undefined;
  const renderable=report&&['findings','dimensions','competitors','benchmarks','sources','meetingQuestions','serviceRecommendations'].every(key=>Array.isArray(report[key]));
  const rawReport=typeof prior.rawReport==='string'&&renderable?renderGroundedReport(report)
   .replace('Toplam puan sunucu kontrollerinden sonra hesaplanır.','Ön BHS: '+(prior.scoring?.total??'Yanıt Bekliyor')+'/100\n'+(prior.scoring?.note||'')):prior.rawReport;
  audit={...audit,data:{...prior,bhsSections,researchCoverage,verifiedResearch,...(report?{report}:{}),...(quality?{quality}:{}),
   ...(prior.supervision?{supervision:scopedSupervision(prior,prior.supervision)}:{}),
   ...(rawReport!==undefined?{rawReport}:{})}};
 }
 const data=audit?.data;
 // Saved handoffs can predate the status receipts. Present their recorded
 // names without reclassifying or re-running the underlying research.
 if(data?.researchContinuity&&data.bhsSections?.some(section=>section.openMetrics?.length)){
  const bhsSections=data.bhsSections.map(section=>({...section,title:salesSectionTitle(section.id,section.title),
   ...(section.openMetrics?{openMetrics:section.openMetrics.map(metric=>({...metric,
    name:salesMetricName({...metric,section:section.id}),status:metric.status==='needs_evidence'?'unknown':metric.status}))}:{})}));
  const missing=data.bhsSections.filter(section=>!section.complete).map(section=>section.title);
  const oldNotice=data.researchContinuity.notice;
  const notice=oldNotice?.replace(' Ek kanıt gereken bölümler: '+missing.join(', ')+'.','');
  const presentSummary=summary=>summary===oldNotice?notice:summary;
  audit={...audit,data:{...data,summary:presentSummary(data.summary),bhsSections,
   report:{...data.report,summary:presentSummary(data.report?.summary),bhsSections},researchContinuity:{...data.researchContinuity,notice}}};
 }
 if(audit?.data?.researchContinuity?.status!=='unavailable')return audit;
 try{
  const synthesis=await readReusableResearch(brief,ledger,now);
  if(!synthesis?.analysisPacket)return audit;
  const restored=continuationAudit(brief,{synthesis,reason:audit.data.researchContinuity.reason});
  if(!hasGroundedResearch(restored.data))return audit;
  restored.data.researchContinuity.restoredFromSavedResearch=true;
  restored.data.researchContinuity.notice+=' Bu kartta daha önce tamamlanan araştırma kullanıldı; araştırma tarihini ve güncel görüşme bağlamını kontrol et.';
  return restored;
 }catch{return audit;}
}
