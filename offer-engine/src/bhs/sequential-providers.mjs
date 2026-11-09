import {createSupervisedProviders} from './supervised-providers.mjs';
import {createRuntimeProviders} from '../budget/providers.mjs';
import {stageCeilings} from './sequential-contracts.mjs';
import {BudgetError,tariff,hash} from '../budget/ledger.mjs';
import {createApifyAdapter} from './apify-adapter.mjs';

export function stageBudgetLedger(ledger,phase,{infrastructureOffsetKurus=0}={}){
 if(!Number.isSafeInteger(infrastructureOffsetKurus)||infrastructureOffsetKurus<0||infrastructureOffsetKurus>500)throw new BudgetError('budget_limit','Altyapı rezervi geçersiz.');
 const baseCeiling=stageCeilings[phase]||stageCeilings[phase.split('_')[0]],ceiling=baseCeiling?Math.min(baseCeiling+infrastructureOffsetKurus,phase==='scope'?5000:phase==='synthesis'?4800:4400):null;
 if(!ceiling)throw new BudgetError('invalid_phase','BHS aşama bütçesi geçersiz.');
 return {...ledger,once:async(key,input,amount,run,options={})=>{
  // Base quotes already contain a 20% envelope at <=60 TRY/USD. Keep that
  // envelope as a tax allowance when settling, plus 3% conversion and integer
  // rounding headroom. Releasing the tax portion would break an all-in cap.
  const reserved=amount?Math.ceil(amount*1.03)+2:0;
  const limit=Math.min(ceiling,options.limitKurus??tariff.capKurus),prior=await ledger.get(key);
  if(amount&&!prior){const status=await ledger.status();if(status.chargedKurus+reserved>limit){const error=new BudgetError('budget_limit','Bu aşamanın bütçesi sonraki araştırma ve raporlamayı korumak için sınırlandı; yeni ücretli çağrı başlatılmadı.');error.budgetDiagnostic={phase,requiredKurus:reserved,availableKurus:Math.max(0,limit-status.chargedKurus),stageLimitKurus:limit,remainingKurus:status.capKurus-status.chargedKurus};throw error;}}
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
export function createSequentialProviders({ledger,phase,fetchImpl=fetch,now=Date.now,apify,infrastructureOffsetKurus=0,...options}={}){
 const scoped=stageBudgetLedger(ledger,phase,{infrastructureOffsetKurus}),base=createRuntimeProviders({...options,ledger:scoped,fetchImpl,now});
 const actors=apify||createApifyAdapter({ledger:scoped,fetchImpl,now});
 return {...createSupervisedProviders({...options,ledger:scoped,base,fetchImpl,now,receiptVersion:'v8'}),costStatus:()=>ledger.status(),checkpoint:(name,input,run)=>scoped.once('audit:v8:checkpoint:'+name+':'+hash(input),input,0,run),availableActors:actors.availableActors,enrich:actors.enrich,mergeActorEvidence:actors.mergeEvidence};
}
