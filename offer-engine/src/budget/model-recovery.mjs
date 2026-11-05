import {hasGroundedResearch} from '../bhs/research-content.mjs';
import {BudgetError} from './ledger.mjs';
import {modelFailure} from './recovery.mjs';
export const recoveryStages=new Set(['source_plan','source_recovery','methodology_areas','synthesis','scope','semantic','provider_preflight','proposal_translation']);
export const transientModelStatus=status=>[500,502,503,504].includes(status);
export const recoverableModelFailure=error=>transientModelStatus(error.providerStatus)||['model_timeout','model_network','invalid_report','incomplete','provider_format','model_output_invalid'].includes(error.code)||error.modelRecoverable||error.modelBudgetFallback;

// Preserve each stage's contract and token envelope. Both attempts are charged
// independently by the same durable ledger; this layer never refunds or resets.
export async function recoverModelStage(generate,stage,options,{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 try{return await generate(options);}
 catch(error){
  if(!recoverableModelFailure(error))throw error;
  const safe=error.safeResult,report=safe?.data,areas=report?.researchCoverage?.filter(a=>a.status!=='unavailable'&&a.sourceIds?.length).length||0;
  // A useful server-filtered report is already the result served after an
  // exhausted fallback. Do not buy a full replacement just for excluded claims.
  if(stage==='synthesis'&&error.code==='model_output_invalid'&&hasGroundedResearch(report)&&report.sources.every(s=>s.verification?.status==='quote_matched')&&(report.findings.length>=4||areas>=12)){
   console.info(JSON.stringify({event:'model_grounded_projection',stage,findings:report.findings.length,areas,additionalPaidCalls:0}));return safe;
  }
  const primary=modelFailure(options.model,error);
  console.info(JSON.stringify({event:'bhs_model_failure',stage,...primary}));
  const model=options.model==='gemini-4-argon'?'gemini-3.1-pro-preview':'gemini-4-argon';
  console.info(JSON.stringify({event:'model_provider_fallback',stage,model}));
  await wait(1500);
  try{return await generate({...options,model,modelFallback:true});}
  catch(failure){
   const attempts=[primary,modelFailure(model,failure)];
   console.info(JSON.stringify({event:'bhs_model_failure',stage,...attempts[1]}));
   // Only a server-produced, source-filtered projection may survive an
   // exhausted alternate. Never return the rejected model document itself.
   const safe=[error.safeResult,failure.safeResult].filter(result=>result?.data?.findings?.length||result?.data?.researchCoverage?.some(area=>area.status!=='unavailable'&&area.sourceIds?.length)).sort((a,b)=>(b.data.findings?.length||0)-(a.data.findings?.length||0));
   if(safe.length&&(recoverableModelFailure(failure)||['budget_limit','budget_uncertain','research_empty'].includes(failure.code))){
    console.info(JSON.stringify({event:'model_grounded_partial',stage}));return safe[0];
   }
   if(recoverableModelFailure(failure)){
    const contentCodes=new Set(['model_output_invalid','invalid_report','incomplete','provider_format']);
    const content=attempts.some(a=>contentCodes.has(a.code));
    const unavailable=new BudgetError(content?'model_content_invalid':'model_temporarily_unavailable',content?'Model yanıtı kaynak veya çıktı kontrollerini karşılamadı. Doğrulanmamış içerik kullanılmadı; mevcut sonuçlar ve maliyetler korundu.':'Birincil ve yedek AI çağrıları servis veya bağlantı hatası nedeniyle tamamlanamadı. Mevcut sonuçlar ve ayrılmış maliyetler korundu.');unavailable.modelAttempts=attempts;throw unavailable;
   }
   failure.modelAttempts=attempts;
   throw failure;
  }
 }
}
