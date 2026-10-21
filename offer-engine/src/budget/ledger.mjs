import {randomUUID,createHash} from 'node:crypto';
import {createPreviewStore} from '../proposal/preview-store.mjs';
import {sessionFor} from '../proposal/preview-session.mjs';

export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class BudgetError extends Error{constructor(code,message){super(message);this.code=code;}}
// A tariff is valid only for its reviewed date range. Expired/unknown prices
// fail closed. The conversion is a conservative envelope, not a quoted FX rate.
export const tariff=Object.freeze({version:'sellf-bounded-2026-10-20-v1',expires:'2026-11-15T00:00:00Z',usdTry:60,overhead:1.2,capKurus:5000,infraKurus:500,
 models:{'gemini-3.1-pro-preview':{input:2,output:12},'gemini-4-argon':{input:2,output:10},'gemini-3.8-flash':{input:.75,output:3.75}},tavilyCredit:.008});
export function quoteModel(model,inputUpper,outputUpper,now=Date.now()){
 if(now>=Date.parse(tariff.expires)||!tariff.models[model])throw new BudgetError('tariff_expired','Maliyet tarifesi doğrulanmadan yeni ücretli işlem başlatılamaz.');
 if(!Number.isSafeInteger(inputUpper)||inputUpper<0||!Number.isSafeInteger(outputUpper)||outputUpper<0||inputUpper>190000)throw new BudgetError('input_budget','Analiz girdisi güvenli maliyet sınırını aşıyor.');
 const rate=tariff.models[model];return Math.ceil((inputUpper*rate.input+outputUpper*rate.output)/1e6*tariff.usdTry*tariff.overhead*100);
}
export const quoteSearch=(depth='advanced')=>{if(!['basic','advanced'].includes(depth))throw new BudgetError('invalid_query','Arama derinliği geçersiz.');return Math.ceil((depth==='basic'?1:2)*tariff.tavilyCredit*tariff.usdTry*tariff.overhead*100);};
export async function budgetFor(req,res,leadId,{store=createPreviewStore(),secret=process.env.OFFER_PORTAL_SECRET}={}){
 if(typeof leadId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(leadId))throw new BudgetError('budget_context','Teklifin kart bilgisi gerekli.');
 const session=await sessionFor(req,res,store,secret);if(!session)throw new BudgetError('budget_session','Teklif test oturumu gerekli.');
 const call=(op,args={})=>store.call('budget',{jwt:session.accessToken,leadId,op,...args});
 return createLedger(call);
}
export function createLedger(call){
 return {begin:()=>call('begin'),status:()=>call('status'),get:key=>call('get',{step:key}),
  async once(key,input,amount,run,{settle}={}){
   if(!Number.isSafeInteger(amount)||amount<0||amount>4500)throw new BudgetError('budget_limit','İşlem teklif bütçesini aşıyor.');
   const inputHash=hash(input),token=randomUUID(),reservation=await call('reserve',{step:key,hash:inputHash,amount,token});
   if(reservation.blocked)throw new BudgetError('budget_limit','Teklifin toplam 50 TL maliyet sınırına ulaşıldı. Yeni ücretli işlem başlatılmadı.');
   if(!reservation.claimed){
    if(reservation.step?.state==='complete'){if(reservation.step.value?.rejected)throw new BudgetError('provider_rejected','Bu istek sağlayıcı tarafından reddedilmiş; aynı istek tekrar başlatılmadı.');return reservation.step.value;}
    throw new BudgetError(reservation.step?.state==='uncertain'?'budget_uncertain':'budget_pending',reservation.step?.state==='uncertain'?'Önceki isteğin sonucu belirsiz; yeniden ücretli çağrı başlatılmadı.':'Bu aşama zaten çalışıyor. Aynı işlem yeniden başlatılmadı.');
   }
   try{const value=await run(),actual=settle?settle(value):amount;
    if(!Number.isSafeInteger(actual)||actual<0||actual>amount)throw new BudgetError('provider_accounting','Doğrulanmış tüketim ayrılan üst tutarla eşleşmiyor.');
    await call('complete',{step:key,hash:inputHash,token,value,amount:actual});return value;}
   catch(error){
    if(amount>0&&error.definitelyNotBilled===true){try{await call('complete',{step:key,hash:inputHash,token,amount:0,value:{rejected:true,accountedKurus:0,code:error.code,providerStatus:error.providerStatus,providerReason:error.providerReason,parameterHints:error.parameterHints,providerOperation:error.providerOperation}});throw error;}catch(failure){if(failure===error)throw error;}}
    try{await call('uncertain',{step:key,hash:inputHash,token,value:{code:error.code||'stage_failed'}});}catch{/* Reservation remains charged. */}throw error;}
  }
 };
}
