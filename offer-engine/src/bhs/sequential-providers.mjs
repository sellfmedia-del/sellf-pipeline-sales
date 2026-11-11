import {createSupervisedProviders,reserveStageQuote} from './supervised-providers.mjs';
import {createRuntimeProviders} from '../budget/providers.mjs';
import {sequentialPhases} from './sequential-contracts.mjs';
import {BudgetError,tariff,hash} from '../budget/ledger.mjs';
import {createApifyAdapter} from './apify-adapter.mjs';

export function stageBudgetLedger(ledger,phase,{infrastructureOffsetKurus=0,phaseLimitKurus=tariff.capKurus}={}){
 if(!Number.isSafeInteger(infrastructureOffsetKurus)||infrastructureOffsetKurus<0||infrastructureOffsetKurus>500)throw new BudgetError('budget_limit','Altyapı rezervi geçersiz.');
 const ceiling=sequentialPhases.includes(phase)&&phase!=='complete'&&Number.isSafeInteger(phaseLimitKurus)&&phaseLimitKurus>0?Math.min(tariff.capKurus,phaseLimitKurus):null;
 if(!ceiling)throw new BudgetError('invalid_phase','BHS aşama bütçesi geçersiz.');
 return {...ledger,status:async()=>{const status=await ledger.status();return {...status,capKurus:Math.min(status.capKurus,ceiling)};},quoteReservation:reserveStageQuote,once:async(key,input,amount,run,options={})=>{
  // Base quotes already contain a 20% envelope at <=60 TRY/USD. Keep that
  // envelope as a tax allowance when settling, plus 3% conversion and integer
  // rounding headroom. Releasing the tax portion would break an all-in cap.
  const reserved=reserveStageQuote(amount);
  const limit=Math.min(ceiling,options.limitKurus??tariff.capKurus),prior=await ledger.get(key);
  if(amount&&!prior){const status=await ledger.status();if(status.chargedKurus+reserved>limit){const error=new BudgetError('budget_limit','Bu çağrı run genelindeki kalan bütçeye sığmıyor; yeni ücretli çağrı başlatılmadı.');error.budgetDiagnostic={phase,requiredKurus:reserved,availableKurus:Math.max(0,limit-status.chargedKurus),runLimitKurus:limit,remainingKurus:status.capKurus-status.chargedKurus};throw error;}}
  return ledger.once(key,input,reserved,async()=>{
   const value=await run();if(!amount)return value;
   if(options.settle){
    const beforeTax=options.settle(value);
    if(!Number.isSafeInteger(beforeTax)||beforeTax<0)throw new BudgetError('provider_accounting','BHS kullanım kaydı geçersiz.');
    const accountedKurus=Math.ceil(beforeTax*1.2);
    return {...value,accountedKurus,beforeTaxKurus:beforeTax,taxAllowanceKurus:accountedKurus-beforeTax,taxAllowanceRate:.2,reservedKurus:reserved,accountingVersion:'verified-usage-tax-allowance-v8'};
   }
   return {...value,reservedKurus:reserved,conversionAllowance:.03};
  },{...options,limitKurus:limit});
 }};
}
export function createSequentialProviders({ledger,phase,fetchImpl=fetch,now=Date.now,apify,infrastructureOffsetKurus=0,phaseLimitKurus,collectionFirst=process.env.OFFER_BHS_COLLECTION_FIRST==='1',...options}={}){
 const scoped=stageBudgetLedger(ledger,phase,{infrastructureOffsetKurus,phaseLimitKurus}),base=createRuntimeProviders({...options,ledger:scoped,fetchImpl,now});
 // At coverage only the gap extraction, draft and final audit remain.
 const actors=apify||createApifyAdapter({ledger:scoped,fetchImpl,now,retainDataset:collectionFirst&&phaseLimitKurus!==undefined,followingKurus:phaseLimitKurus===undefined?(phase==='coverage_actors'?750:1400):600});
 return {...createSupervisedProviders({...options,ledger:scoped,base,fetchImpl,now,receiptVersion:'v8',allowWorkerFallback:!(collectionFirst&&phaseLimitKurus!==undefined)}),collectionFirst,infrastructureOffsetKurus,now,costStatus:()=>ledger.status(),checkpoint:(name,input,run)=>scoped.once('audit:v8:checkpoint:'+name+':'+hash(input),input,0,run),availableActors:actors.availableActors,enrich:actors.enrich,mergeActorEvidence:actors.mergeEvidence,
  withCeiling:limit=>createSequentialProviders({ledger,phase,fetchImpl,now,apify,infrastructureOffsetKurus,phaseLimitKurus:limit,collectionFirst,...options})};
}
