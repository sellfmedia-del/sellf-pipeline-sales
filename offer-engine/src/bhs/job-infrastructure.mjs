import {BudgetError} from '../budget/ledger.mjs';
// Reviewed 2026-11-10; twice the iad1 Fluid rates are a safety envelope.
// Covers at most 2 vCPU / 4 GB / 240s, as configured in vercel.json.
// This is incremental worker compute, separate from the existing 5 TRY reserve
// for gateway, polling and storage overhead. No fixed subscription is allocated.
export const workerMaxDurationSeconds=240;
export const workerInfraReservationKurus=300;
export const shortResearchSeconds=90;
const costOf=(elapsedMs,cpuMs)=>{
 const usd=Math.max(cpuMs,elapsedMs*2)/3600000*.256+elapsedMs/3600000*4*.0212;
 return Math.max(1,Math.ceil(usd*60*1.2*1.03*100));
};
export const shortResearchReservationKurus=costOf(shortResearchSeconds*1000,shortResearchSeconds*2000);
export async function meteredBhsStage({job,ledger,run,shortResearch=false,region=process.env.VERCEL_REGION,clock=Date.now,cpu=process.cpuUsage}){
 if(region!=='iad1')throw new BudgetError('infra_tariff_unverified','BHS çalışanının bölge maliyeti doğrulanmalı.');
 const recovery=['shared-budget-v1','shared-budget-v2'].includes(job.budgetRecoveryVersion)&&job.budgetRecoveryPhase===job.phase;
 // An explicitly authorized recovery keeps the old unmeasured commitment.
 // The new attempt has its own once-only receipt in the SAME capped account.
 const reservedKurus=shortResearch?shortResearchReservationKurus:workerInfraReservationKurus;
 const key='infra:v8:'+job.phase+':'+job.briefHash+(job.scopedRoundIndex===undefined?'':':'+job.scopedRoundIndex)+(recovery?':'+job.budgetRecoveryVersion:'')+(shortResearch?':short-research':'');
 let failure;
 const result=await ledger.once(key,{jobId:job.id,phase:job.phase,region},reservedKurus,async()=>{
  const started=clock(),usage=cpu();
  try{await run();}catch(error){failure=error;}
  const elapsedMs=clock()-started,active=cpu(usage),cpuMs=(active.user+active.system)/1000;
  const duration=(shortResearch?shortResearchSeconds:workerMaxDurationSeconds)*1000;
  if(!Number.isFinite(elapsedMs)||elapsedMs<0||elapsedMs>duration||!Number.isFinite(cpuMs)||cpuMs<0||cpuMs>duration*2)throw new BudgetError('infra_accounting','BHS çalışma süresi ayrılan maliyetle eşleşmiyor.');
  // Child renderers are outside process.cpuUsage(); use the full two-vCPU
  // wall-time ceiling so their CPU cannot disappear from the cost envelope.
  return {...(failure?{failed:true,code:failure.code||'stage_failed'}:{}),accountedKurus:costOf(elapsedMs,cpuMs),elapsedMs,cpuMs,region,accountingVersion:'bhs-worker-envelope-2026-11-10',reservedKurus};
 },{settle:value=>value.accountedKurus});
 // Provider receipts keep their own paid/uncertain commitments. A caught
 // failure does not make this invocation's measured compute cost unknowable.
 if(result.failed)throw failure||new BudgetError(result.code,'BHS aşamasının hata kaydı ve altyapı kullanımı korundu.');
 return result;
}
