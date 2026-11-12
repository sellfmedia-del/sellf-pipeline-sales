import {supervisedPhases} from './supervised-research.mjs';
import {sequentialPhases} from './sequential-contracts.mjs';
import {runBoundedStage,stageKey} from './direct-research.mjs';
import {snapshotBrief,briefHash} from './brief.mjs';
import {BudgetError} from '../budget/ledger.mjs';
import {isManagedPlanRecovery,managedPhaseBudget} from './managed-budget.mjs';

// Transport-independent, one phase per leased invocation. The DB/queue adapter
// must validate the lease and bind getLedger to this job's immutable budget.
// No browser cookie, user refresh token or provider secret is stored in a job.
export async function runClaimedBhsStage({job,queue,getLedger,getProviders,runStage=runBoundedStage,now=Date.now}){
 const phases=job?.researchVersion==='v8'?sequentialPhases:supervisedPhases;
 if(!['v7','v8'].includes(job?.researchVersion)||job?.researchModel!=='claude-sonnet-5-5'||!phases.includes(job.phase)||job.phase==='complete'||!job.leaseToken||job.leaseUntil<=now())throw new BudgetError('invalid_job','BHS arka plan işi veya kilidi geçersiz.');
 const brief=snapshotBrief(job.brief);
 if(briefHash(brief)!==job.briefHash)throw new BudgetError('changed_brief','BHS iş kaydı brief ile eşleşmiyor.');
 const ledger=await getLedger(job),key=stageKey(brief,job.phase,job.researchVersion);
 // Persist-before-ack: a crash after the phase commits is recovered without
 // replaying any source/model call. A lost paid request is never refunded.
 try{
  const step=await ledger.get(key);
  if(step?.state!=='complete'){
   if(step?.state==='reserved')throw new BudgetError('stage_abandoned','Önceki çalışanın aşama kaydı açık kaldı; ücretli iş tekrarlanmadı.');
   const authorizedBudgetRecovery=['shared-budget-v1','shared-budget-v2'].includes(job.budgetRecoveryVersion)&&job.budgetRecoveryPhase===job.phase&&step?.charge_kurus===0&&step?.value?.code==='budget_limit';
   const plannerRecovery=job.researchVersion==='v8'&&isManagedPlanRecovery(job)&&step?.state==='uncertain'&&step.charge_kurus===0&&step.value?.code==='incomplete';
   if(step?.state==='uncertain'&&!authorizedBudgetRecovery&&!plannerRecovery)throw new BudgetError('stage_paused','Önceki aşama durdu; kayıtlar korunuyor.');
   const phaseBudget=job.researchVersion==='v8'
    ?await managedPhaseBudget({ledger,brief,phase:job.phase,existingBrandPlan:step})
    :{ledger,managedAudit:false};
   if(plannerRecovery&&!phaseBudget.managedAudit)throw new BudgetError('stage_paused','Araştırma planı yalnız mevcut BHS bütçesinde sürdürülebilir.');
   const providers=await getProviders({skipManagedPlanner:plannerRecovery,ledger:phaseBudget.ledger,researchVersion:job.researchVersion,phase:job.phase,managedAudit:phaseBudget.managedAudit,phaseLimitKurus:phaseBudget.phaseCeiling});
   await runStage({phase:job.phase,brief,ledger:phaseBudget.ledger,providers,phaseCeiling:phaseBudget.phaseCeiling,researchVersion:job.researchVersion,researchModel:job.researchModel,freshResearch:true});
  }
  const nextPhase=phases[phases.indexOf(job.phase)+1];
  await queue.advance(job,{nextPhase,checkpointKey:key});
  return {status:nextPhase==='complete'?'complete':'queued',nextPhase};
 }catch(error){
  // Queue/DB ack errors are not permission to rerun a provider. The already
  // committed phase remains authoritative on the next leased invocation.
  await queue.pause(job,{code:error.code||'worker_unavailable',phase:job.phase}).catch(()=>{});
  throw error;
 }
}
