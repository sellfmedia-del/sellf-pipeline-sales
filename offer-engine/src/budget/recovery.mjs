import {hash} from './ledger.mjs';

// One explicit additional batch per brief/phase, shared by workers and reloads.
// The existing ledger atomically claims the marker; no budget is reset/refunded.
export const recoveryKey=(brief,phase)=>'audit:recovery:'+phase+':'+hash(brief);
export const recoverableAuditCodes=new Set(['model_temporarily_unavailable','model_deadline','budget_limit','budget_uncertain']);
// The atomic zero-cost reservation itself records the explicit intent. If the
// worker dies before completing that tiny marker, a status resume must still
// recover the SAME batch instead of consuming a new marker or staying stuck.
export function recoveryRound(row,claims){
 return row?.charge_kurus===0&&['reserved','uncertain','complete'].includes(row.state)&&row.input_hash===hash({...claims,round:1})?1:0;
}
export function modelFailure(model,error){
 const allowed=['countTokens','generateContent'];
 return {model,code:typeof error.code==='string'?error.code:'model_failure',
  ...(Number.isInteger(error.providerStatus)?{httpStatus:error.providerStatus}:{}),
  ...(allowed.includes(error.providerOperation)?{operation:error.providerOperation}:{}),
  ...(typeof error.providerReason==='string'?{reason:error.providerReason}:{})};
}
