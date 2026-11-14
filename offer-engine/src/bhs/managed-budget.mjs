import {BudgetError,tariff} from '../budget/ledger.mjs';
import {briefHash} from './brief.mjs';

export const researchCapKurus=3000;
const evidenceReviewCapKurus=3300;
export const synthesisCapKurus=2000;
export const gapCapKurus=3000;
export const managedDiscoveryCeilingKurus=2500;
export const managedGeneralSearchCeilingKurus=2050;
export const managedInventoryCeilingKurus=2675;
export const managedFocusedInventoryCeilingKurus=2850;
export const managedReviewPhases=Object.freeze(['coverage_sources','coverage_actors','coverage_discovery','coverage','report_draft']);
export const managedBhsEnabled=()=>process.env.OFFER_BHS_MANAGED==='1'
 || (process.env.OFFER_BHS_MANAGED===undefined&&process.env.VERCEL_ENV==='production'
 &&process.env.OFFER_BHS_SEQUENTIAL_PRODUCTION_ENABLED==='true');

export function capBhsLedger(ledger,ceiling,issues=new Set()){
 return {...ledger,issues,async once(key,input,amount,run,options={}){
  try{
   return await ledger.once(key,input,amount,async()=>{
    const value=await run();
    if(value?.rejectedOutput||value?.failed||value?.provider==='claude'&&key.startsWith('routing:'))issues.add(value.rejectedOutput||value.code||'provider_fallback');
    return value;
   },{...options,...(amount?{limitKurus:Math.min(ceiling,options.limitKurus??ceiling)}:{})});
  }catch(error){
   if(amount)issues.add(error.code||'provider_error');
   throw error;
  }
 }};
}

export async function managedPhaseBudget({ledger,brief,phase,existingBrandPlan,enabled=managedBhsEnabled()}){
 const hash=briefHash(brief),policyKey='audit:managed-policy:'+hash;
 const saved=await ledger.get(policyKey);
 if(saved?.state!=='complete'&&(!enabled||phase!=='brand_plan'||existingBrandPlan))return {ledger,managedAudit:false};
 const policy=saved?.state==='complete'?saved.value:await ledger.once(policyKey,{hash},0,async()=>({version:6}));
 const managedBudgetVersion=[2,3,4,5,6].includes(policy.version)?policy.version:1;
 const reportPhases=managedBudgetVersion>=2?['synthesis','scope']:[...managedReviewPhases,'synthesis','scope'];
 const reviewCap=managedBudgetVersion===3?evidenceReviewCapKurus:researchCapKurus;
 if(!reportPhases.includes(phase)){
  const phaseCeiling=managedReviewPhases.includes(phase)?reviewCap:researchCapKurus;
  return {ledger:capBhsLedger(ledger,phaseCeiling),managedAudit:true,managedBudgetVersion,phaseCeiling};
 }
 const boundaryKey='audit:managed-synthesis-baseline:'+hash;
 const baseline=await ledger.once(boundaryKey,{hash},0,async()=>({chargedKurus:(await ledger.status()).chargedKurus}));
 if(!Number.isSafeInteger(baseline.chargedKurus)||baseline.chargedKurus>reviewCap)
  throw new BudgetError('budget_limit','BHS araştırma bütçesi doğrulanamadı.');
 const phaseCeiling=Math.min(tariff.capKurus,baseline.chargedKurus+synthesisCapKurus);
 return {ledger:capBhsLedger(ledger,phaseCeiling),managedAudit:true,managedBudgetVersion,phaseCeiling};
}
