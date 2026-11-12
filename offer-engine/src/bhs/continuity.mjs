import {hasGroundedResearch} from './research-content.mjs';
import {directAuditResult} from './direct-report.mjs';
import {fallbackScope} from '../pricing/scope.mjs';
import {readReusableResearch} from './reuse.mjs';
export const continuationCodes=new Set(['research_empty','model_temporarily_unavailable','model_content_invalid','model_deadline','model_output_invalid','model_timeout','model_network','budget_limit','budget_uncertain','quota','provider_error','provider_format','provider_accounting','invalid_report','stage_failed','stage_abandoned','search_unavailable','tariff_expired','fx_unavailable','fx_limit','not_configured']);
export function abandonedStage(step,now){
 return step?.state==='reserved'&&step.charge_kurus===0&&Number.isFinite(Date.parse(step.created_at))&&now-Date.parse(step.created_at)>360000;
}
export function canContinue(step,now){
 return abandonedStage(step,now)||step?.state==='uncertain'&&step.charge_kurus===0&&continuationCodes.has(step.value?.code);
}
// Zero-cost handoff. A completed report keeps its checked scope and copy.
export function continuationAudit(brief,{synthesis,reason,verifiedAudit}){
 const audit=verifiedAudit||directAuditResult(brief,synthesis||{report:{summary:'',sources:[],findings:[]},methodologyVersion:'research-unavailable'});
 const partial=hasGroundedResearch(audit.data);
 audit.status='ready';
 const incompleteReview=audit.data.supervision?.evidenceCoverage?.complete===false;
 const notice=incompleteReview?'Kanıt incelemesinin bir bölümü tamamlanamadı. Doğrulanan bulgularla teklif hazırlanabilir.':verifiedAudit?'Ön BHS’de doğrulama bekleyen alanlar var. Kaynakla desteklenen bulgular ve teklif kapsamı hazır.':partial?'Ön BHS tamamlanamadı. Yalnız doğrulanmış mevcut bulgular korundu; teklif kapsamı görüşme bilgilerine göre kontrol bekliyor.':'Ön BHS tamamlanamadı. Bu teklif araştırma bulgusu veya BHS skoru içermez; görüşmede belirtilen hedef ve hizmet kapsamıyla hazırlanır.';
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
