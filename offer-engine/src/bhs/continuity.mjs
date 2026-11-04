import {directAuditResult} from './direct-report.mjs';
import {fallbackScope} from '../pricing/scope.mjs';
export const continuationCodes=new Set(['model_temporarily_unavailable','model_content_invalid','model_deadline','model_output_invalid','model_timeout','model_network','budget_limit','budget_uncertain','quota','provider_error','provider_format','provider_accounting','invalid_report','stage_failed','stage_abandoned','search_unavailable','tariff_expired','fx_unavailable','fx_limit','not_configured']);
export function abandonedStage(step,now){
 return step?.state==='reserved'&&step.charge_kurus===0&&Number.isFinite(Date.parse(step.created_at))&&now-Date.parse(step.created_at)>360000;
}
export function canContinue(step,now){
 return abandonedStage(step,now)||step?.state==='uncertain'&&step.charge_kurus===0&&continuationCodes.has(step.value?.code);
}
// Explicit zero-cost handoff, not invented research. Recheck any completed
// synthesis against its original packet; no provider, search or URL is called.
export function continuationAudit(brief,{synthesis,reason}){
 const audit=directAuditResult(brief,synthesis||{report:{summary:'',sources:[],findings:[]},methodologyVersion:'research-unavailable'});
 const partial=audit.data.findings.length>0;
 const notice=partial?'Ön BHS tamamlanamadı. Yalnız doğrulanmış mevcut bulgular korundu; teklif kapsamı görüşme bilgilerine göre kontrol bekliyor.':'Ön BHS tamamlanamadı. Bu teklif araştırma bulgusu veya BHS skoru içermez; görüşmede belirtilen hedef ve hizmet kapsamıyla hazırlanır.';
 audit.data.researchContinuity={status:partial?'partial':'unavailable',reason,additionalPaidCalls:0,notice};
 audit.data.quality.contentComplete=false;audit.data.quality.issues.push({path:'research',reason:'explicit_incomplete_handoff'});
 audit.data.report.transfer.contentComplete=false;
 audit.data.scopePlan=fallbackScope(brief);
 audit.data.proposalCopy={headline:'Net hedefler.',accent:'Birlikte büyüme.',subtitle:'Görüşmede belirtilen hedef ve hizmet kapsamına dayalı işbirliği teklifimiz.',findingIds:[]};
 audit.data.summary=notice;audit.data.report.summary=notice;
 audit.data.rawReport=notice+'\n\n'+audit.data.rawReport;
 return audit;
}
