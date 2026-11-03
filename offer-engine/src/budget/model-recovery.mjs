import {BudgetError} from './ledger.mjs';
export const recoveryStages=new Set(['source_plan','source_recovery','methodology_areas','synthesis','scope','semantic','provider_preflight']);
export const transientModelStatus=status=>[500,502,503,504].includes(status);
export const recoverableModelFailure=error=>transientModelStatus(error.providerStatus)||['model_timeout','model_network','invalid_report','incomplete','provider_format','model_output_invalid'].includes(error.code)||error.modelRecoverable||error.modelBudgetFallback;

// Preserve each stage's contract and token envelope. Both attempts are charged
// independently by the same durable ledger; this layer never refunds or resets.
export async function recoverModelStage(generate,stage,options,{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 try{return await generate(options);}
 catch(error){
  if(!recoverableModelFailure(error))throw error;
  const model=options.model==='gemini-4-argon'?'gemini-3.1-pro-preview':'gemini-4-argon';
  console.info(JSON.stringify({event:'model_provider_fallback',stage,model}));
  await wait(1500);
  try{return await generate({...options,model,modelFallback:true});}
  catch(failure){
   // Only a server-produced, source-filtered projection may survive an
   // exhausted alternate. Never return the rejected model document itself.
   const safe=[error.safeResult,failure.safeResult].filter(Boolean).sort((a,b)=>(b.data.findings?.length||0)-(a.data.findings?.length||0));
   if(safe.length&&(recoverableModelFailure(failure)||['budget_limit','budget_uncertain'].includes(failure.code))){
    console.info(JSON.stringify({event:'model_grounded_partial',stage}));return safe[0];
   }
   if(recoverableModelFailure(failure))throw new BudgetError('model_temporarily_unavailable','Bu aşamanın birincil ve yedek AI servisleri şu anda yanıt veremiyor. Mevcut sonuçlar ve maliyet sınırı korundu.');
   throw failure;
  }
 }
}
