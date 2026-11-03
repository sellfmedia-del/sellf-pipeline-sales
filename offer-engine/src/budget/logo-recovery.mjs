import {BudgetError} from './ledger.mjs';

// One alternate model, unchanged image/contract and the same durable budget.
// No blind replay, parallel race or retry of the original provider call.
export function createLogoRecovery(provider,{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 return async(stage,input,schema,options)=>{
  if(!['logo-region','logo-backdrop'].includes(stage))throw new BudgetError('model_budget','Logo kurtarma aşaması geçersiz.');
  try{return await provider.generate(stage,input,schema,options);}
  catch(error){
   if(error.providerStatus!==503&&!error.logoRecoverable)throw error;
   console.info(JSON.stringify({event:'logo_provider_fallback',stage,model:'gemini-4-argon'}));
   await wait(1500);
   try{return await provider.generate(stage,input,schema,{...options,model:'gemini-4-argon',logoFallback:true});}
   catch(failure){
    if(failure.providerStatus===503||failure.logoRecoverable||['budget_uncertain','budget_pending'].includes(failure.code))throw new BudgetError('logo_temporarily_unavailable','Logo sağlayıcısı şu anda yanıt veremiyor. Görseli değiştirmen gerekmiyor; işlem güvenle tamamlanamadı.');
    throw failure;
   }
  }
 };
}
