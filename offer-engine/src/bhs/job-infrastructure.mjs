import {BudgetError} from '../budget/ledger.mjs';
// Reviewed 2026-11-10; twice the iad1 Fluid rates are a safety envelope.
// Covers at most 2 vCPU / 4 GB / 300s. This is incremental worker compute, separate from the existing 5 TRY reserve
// for gateway, polling and storage overhead. No fixed subscription is allocated.
export const workerInfraReservationKurus=400;
export async function meteredBhsStage({job,ledger,run,region=process.env.VERCEL_REGION,clock=Date.now,cpu=process.cpuUsage}){
 if(region!=='iad1')throw new BudgetError('infra_tariff_unverified','BHS çalışanının bölge maliyeti doğrulanmalı.');
 const key='infra:v8:'+job.phase+':'+job.briefHash;
 return ledger.once(key,{jobId:job.id,phase:job.phase,region},workerInfraReservationKurus,async()=>{
  const started=clock(),usage=cpu();await run();
  const elapsedMs=clock()-started,active=cpu(usage),cpuMs=(active.user+active.system)/1000;
  if(!Number.isFinite(elapsedMs)||elapsedMs<0||elapsedMs>300000||!Number.isFinite(cpuMs)||cpuMs<0||cpuMs>600000)throw new BudgetError('infra_accounting','BHS çalışma süresi ayrılan maliyetle eşleşmiyor.');
  const usd=cpuMs/3600000*.256+elapsedMs/3600000*4*.0212;
  return {accountedKurus:Math.max(1,Math.ceil(usd*60*1.2*1.03*100)),elapsedMs,cpuMs,region,accountingVersion:'bhs-worker-envelope-2026-11-10',reservedKurus:workerInfraReservationKurus};
 },{settle:value=>value.accountedKurus});
}
