import {BudgetError} from './ledger.mjs';
export const recoveryStages=new Set(['source_plan','source_recovery','methodology_areas','synthesis','scope','semantic','provider_preflight']);
export const transientModelStatus=status=>[500,503,504].includes(status);

// Preserve each stage's contract and token envelope. Both attempts are charged
// independently by the same durable ledger; this layer never refunds or resets.
export async function recoverModelStage(generate,stage,options,{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 try{return await generate(options);}
 catch(error){
  if(!transientModelStatus(error.providerStatus)&&!error.modelRecoverable)throw error;
  const model=options.model==='gemini-4-argon'?'gemini-3.1-pro-preview':'gemini-4-argon';
  console.info(JSON.stringify({event:'model_provider_fallback',stage,model}));
  await wait(1500);
  try{return await generate({...options,model,modelFallback:true});}
  catch(failure){
   if(transientModelStatus(failure.providerStatus)||failure.modelRecoverable)throw new BudgetError('model_temporarily_unavailable','Bu aşamanın birincil ve yedek AI servisleri şu anda yanıt veremiyor. Mevcut sonuçlar ve maliyet sınırı korundu.');
   throw failure;
  }
 }
}
