import {BudgetError} from '../budget/ledger.mjs';
import {conversationKeys,conversationVersion} from './conversation-contract.mjs';
import {advanceConversation,readConversation,readConversationResult,persistConversationResult} from './conversation-engine.mjs';
import {createConversationProviders} from './conversation-providers.mjs';
import {conversationAuditResult} from './conversation-report.mjs';
import {stageKey} from './direct-research.mjs';
import {meteredBhsStage} from './job-infrastructure.mjs';
import {sequentialPhases} from './sequential-contracts.mjs';
import {randomUUID} from 'node:crypto';
import {reportRepairKey,repairableReport,repairConversationReport} from './conversation-repair.mjs';

const complete=row=>row?.state==='complete';
export const conversationPolicy=async(ledger,id)=>(await ledger.get(conversationKeys.policy(id)))?.value?.engine===conversationVersion;

export async function runConversationJob({job,queue,ledger,getProviders=createConversationProviders,meter=meteredBhsStage,now=Date.now}){
 const id=job.queueBriefHash||job.briefHash;
 if(job.researchVersion!=='v8'||!job.leaseToken||job.leaseUntil<=now())throw new BudgetError('invalid_job','Analiz işi veya kilidi geçersiz.');
 if(!await conversationPolicy(ledger,id))throw new BudgetError('invalid_job','Analiz sürümü doğrulanamadı.');
 const checkpoint=stageKey(job.brief,job.phase,'v8',id);
 // These names belong solely to the installed queue transport. The new
 // analyst does not use the old stage plans, quotas, controllers or filters.
 await ledger.once(checkpoint,{id,phase:job.phase,engine:conversationVersion},0,async()=>({
  phase:job.phase,decision:'accepted',collectionFirst:true,conversationTransport:true,
  ...(job.phase==='sector_sources'?{managedPlan:{compactQueue:true,adaptiveResearch:true,reportOnlyAfterResearch:true,
   needs:[{id:'analyst_session',purpose:'Tek konuşmada bütün BHS analizi.'}]}}:{})
 }));
 if(job.phase==='brand_plan'&&!complete(await readConversationResult(ledger,id))){
  const state=await readConversation(ledger,id);
  if(job.cancelRequested||state.final){
   await persistConversationResult({brief:job.brief,ledger,id,...(job.cancelRequested?{reason:'research_cancelled'}:{}),now});
  }else{
   let advanced;
   try{
    // Every invocation has its own compute receipt. An abandoned envelope is
    // retained; reconnects never relabel/refund an unknown previous invocation.
    const meteredJob={...job,phase:'conversation',briefHash:id,scopedRoundIndex:state.index+'_'+job.leaseToken.replaceAll('-','').slice(0,12)};
    await meter({job:meteredJob,ledger,run:async()=>{
     const deadline=now()+200000;
     advanced=await advanceConversation({brief:job.brief,ledger,id,providers:getProviders({ledger,executionDeadline:deadline}),now,deadline});
    }});
   }catch(error){
    // A model/transport failure never authorizes replay. The saved source
    // archive remains reviewable and pricing can proceed through the handoff.
    await persistConversationResult({brief:job.brief,ledger,id,reason:error.code||'worker_unavailable',now});
   }
   if(advanced?.closed)await persistConversationResult({brief:job.brief,ledger,id,now});
   if(!complete(await readConversationResult(ledger,id))){
    await queue.pause(job,{code:'research_continues'});
    return {status:'queued',nextPhase:job.phase,engine:conversationVersion};
   }
  }
 }
 const nextPhase=job.phase==='sector_sources'&&job.compactQueue?'report_draft':sequentialPhases[sequentialPhases.indexOf(job.phase)+1];
 if(!nextPhase)throw new BudgetError('invalid_phase','Analiz kuyruk aşaması geçersiz.');
 await queue.advance(job,{nextPhase,checkpointKey:checkpoint});
 return {status:nextPhase==='complete'?'complete':'queued',nextPhase,engine:conversationVersion};
}

export async function handleConversationAudit({action,brief,job,ledger,queue,id,finish,res,codec,session,host,cost,
 getProviders=createConversationProviders,now=Date.now,meter=meteredBhsStage}){
 if(action==='complete_gaps')throw new BudgetError('completion_unavailable','Yeni BHS motoru tek toplam bütçe kullanır; ek ücretli araştırma otomatik açılmaz.');
 let background;
 if(queue){
  if(!job.backgroundJobId){
   const saved=await queue.enqueue(job,brief,await ledger.status());
   if(saved.budgetId!==(await ledger.status()).id||(saved.queueBriefHash||saved.briefHash)!==id)throw new BudgetError('invalid_job','Analiz işi bu bütçe ve brief ile eşleşmiyor.');
   job.backgroundJobId=saved.id;
  }
  background=await queue.read(job);
  if(background.budgetId!==(await ledger.status()).id||(background.queueBriefHash||background.briefHash)!==id)throw new BudgetError('invalid_job','Analiz kaydı eşleşmiyor.');
 }
 let stored=await readConversationResult(ledger,id);
 const repair=await ledger.get(reportRepairKey(id));
 if(action==='start'&&complete(stored)&&repairableReport(stored.value)&&!repair){
  job.reportRepair='retained-source-writing-v1';
  return res.status(202).json({phase:'conversation',status:'in_progress',ticket:codec.encode(job,session,host),cost:await cost(),execution:'browser',nextAction:'advance',
   acceptedWebsite:brief.website,researchRunId:job.researchRunId,message:'Korunmuş kaynaklardan yalnız rapor tamamlanıyor; yeni araştırma yapılmayacak.'});
 }
 if(action==='advance'&&job.reportRepair==='retained-source-writing-v1'&&complete(stored)&&repairableReport(stored.value)&&!repair){
  const value=await repairConversationReport({brief,job,ledger,id,getProviders,now,meter});
  return finish(conversationAuditResult(brief,value,{reason:value.reason}));
 }
 if(repair&&!complete(repair))return res.status(202).json({phase:'conversation',status:'in_progress',ticket:codec.encode(job,session,host),cost:await cost(),execution:'background',
  acceptedWebsite:brief.website,researchRunId:job.researchRunId,message:'Korunmuş kaynaklardan rapor yazımı sürüyor; aynı ücretli istek tekrarlanmadı.'});
 if(complete(stored))return finish(conversationAuditResult(brief,stored.value,{reason:stored.value.reason}));
 if(action==='continue'||background&&['paused','cancelled'].includes(background.state)){
  if(background&&['queued','running'].includes(background.state))await queue.cancel(job);
  const value=await persistConversationResult({brief,ledger,id,reason:action==='continue'?'research_cancelled':background.diagnostic?.code||'worker_paused',now});
  return finish(conversationAuditResult(brief,value,{reason:value.reason}));
 }
 if(background&&now()-background.createdAt>12*60000){
  await queue.cancel(job);
  const value=await persistConversationResult({brief,ledger,id,reason:'research_deadline',now});
  return finish(conversationAuditResult(brief,value,{reason:value.reason}));
 }
 if(!queue){
  const deadline=now()+200000;
  await meter({job:{id:job.backgroundJobId||id,phase:'conversation',briefHash:id,scopedRoundIndex:'browser_'+randomUUID().replaceAll('-','').slice(0,12)},ledger,
   run:()=>advanceConversation({brief,ledger,id,providers:getProviders({ledger,executionDeadline:deadline}),now,deadline})});
  const state=await readConversation(ledger,id);
  if(state.final){const value=await persistConversationResult({brief,ledger,id,now});return finish(conversationAuditResult(brief,value,{reason:value.reason}));}
 }
 return res.status(202).json({phase:'conversation',status:'in_progress',engineVersion:conversationVersion,
  ticket:codec.encode(job,session,host),cost:await cost(),execution:queue?'background':'browser',
  ...(!queue?{nextAction:'advance'}:{}),continuationAvailable:true,acceptedWebsite:brief.website,
  researchRunId:job.researchRunId,message:'Marka ve hedefler aynı analiz oturumunda değerlendiriliyor; gerekli kaynaklar araştırılıyor.'});
}
