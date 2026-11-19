import {timingSafeEqual} from 'node:crypto';
import {backgroundBhsEnabled,createBhsJobStore} from './job-store.mjs';
import {createSequentialProviders} from './sequential-providers.mjs';
import {runClaimedBhsStage} from './background-runner.mjs';
import {runBoundedStage,stageKey} from './direct-research.mjs';
import {meteredBhsStage,shortResearchReservationKurus,workerInfraReservationKurus} from './job-infrastructure.mjs';
import {createEvidenceCollector} from './evidence.mjs';
import {BudgetError} from '../budget/ledger.mjs';
import {sequentialPhases} from './sequential-contracts.mjs';
import {managedFocusedInventoryCeilingKurus,managedInventoryCeilingKurus,managedReviewPhases} from './managed-budget.mjs';
import {createSupervisedReadiness} from './supervised-readiness.mjs';
import {focusedInventoryOutputTokens,inventoryOutputTokens,inventoryStages,scopedRounds} from './collection-first.mjs';
import {minimumV8GeminiReservation} from './supervised-providers.mjs';
import {researchTariff} from './research-tariff.mjs';
import {brandDiscoveryNeedsWork} from './brand-review-state.mjs';

export async function runMeteredBhsPhase(job,options,{runStage=runBoundedStage,meter=meteredBhsStage}={}){
 const {providers}=options;
 const scopedJob={...job,...(options.scopedRoundIndex===undefined?{}:{scopedRoundIndex:options.scopedRoundIndex})};
 if(job.phase==='report_draft'&&providers.managedBudgetVersion>=18&&providers.collectionFirst){
  if(options.scopedRoundIndex===undefined)return runStage(options);
  const {chargedKurus}=await options.ledger.status();
  const remaining=options.phaseCeiling-chargedKurus;
  if(remaining>=shortResearchReservationKurus&&remaining<workerInfraReservationKurus&&providers.withExecutionWindow){
   // The network window leaves time for PDF parsing and durable receipts
   // inside the smaller worker envelope. Renderer work stays in full turns.
   const now=providers.now||Date.now,deadline=now()+55000;
   const short=providers.withExecutionWindow(deadline,shortResearchReservationKurus);
   const collect=options.collect||((...args)=>createEvidenceCollector({allowPartialPlan:true,hardDeadline:true,render:async()=>[],
    timeout:Math.max(0,deadline-now()-16000)})(...args));
   return meter({job:scopedJob,ledger:options.ledger,shortResearch:true,run:()=>runStage({...options,providers:short,collect})});
  }
 }
 if(job.phase==='synthesis'&&options.phaseCeiling){
  const cost=await options.ledger.status();
  if(options.phaseCeiling-cost.chargedKurus<workerInfraReservationKurus){
   // The paid drafting reserve may not fit. Keep the reviewed source handoff
   // available under the fixed gateway/template reserve, without a paid call.
   const manager=async()=>{throw new BudgetError('budget_limit','Kalan bütçe için incelenmiş kanıtlar kullanılacak.');};
   return runStage({...options,providers:{...options.providers,manager,claudeManager:manager,evidenceReviewer:manager,worker:manager,geminiWorker:manager}});
  }
 }
 if(job.phase==='scope'){
  const cost=await options.ledger.status();
  if((options.phaseCeiling??cost.capKurus)-cost.chargedKurus<workerInfraReservationKurus){
   // The existing deterministic scope fallback uses no provider and fits the
   // fixed gateway/template reserve. A finished BHS must not wait for a model.
   options.ledger.issues?.add('budget_limit');
   const noModel=async()=>{throw new BudgetError('budget_limit','Kalan bütçe için mevcut sıfır maliyetli kapsam şablonu kullanılacak.');};
   return runStage({...options,providers:{...options.providers,generate:noModel,worker:noModel}});
  }
 }
 if(options.providers.managedBudgetVersion>=7){
  const freePhases=new Set(['coverage_plan','sector_correction_sources','sector_correction_draft','sector','sector_validation','competition_plan','competition_sources','competition_draft',...inventoryStages.filter(phase=>phase!=='competition')]);
  if(options.providers.managedBudgetVersion>=8)for(const phase of sequentialPhases.slice(1,sequentialPhases.indexOf('brand')+1))freePhases.add(phase);
  if(options.providers.managedBudgetVersion>=9){
   freePhases.delete('brand_draft');
   for(const phase of scopedRounds)freePhases.delete(phase);
   for(const phase of managedReviewPhases)freePhases.add(phase);
  }
  if(options.scopedRoundIndex!==undefined)freePhases.delete(job.phase);
  const phaseIndex=sequentialPhases.indexOf(job.phase);
  const adaptiveBrand=options.providers.managedBudgetVersion>=10&&phaseIndex>0&&phaseIndex<=sequentialPhases.indexOf('brand');
  if(adaptiveBrand){
   const prior=(await options.ledger.get(stageKey(options.brief,sequentialPhases[phaseIndex-1],options.researchVersion,options.checkpointHash)))?.value;
   if(options.providers.managedBudgetVersion>=24&&job.phase!=='brand'&&prior?.brandDiscovery&&!brandDiscoveryNeedsWork(prior))return runStage(options);
   if(job.phase==='brand'?prior?.brandUnderstanding:prior?.brandDiscovery&&!prior.brandDiscovery.done)freePhases.delete(job.phase);
   else return runStage(options);
  }
  if(freePhases.has(job.phase))return runStage(options);
  const cost=await options.ledger.status();
  if(options.phaseCeiling-cost.chargedKurus<workerInfraReservationKurus&&
   (adaptiveBrand||phaseIndex>sequentialPhases.indexOf('brand'))){
   const noProvider=async()=>{throw new BudgetError('budget_limit','BHS araştırma bütçesi doldu.');};
   const disabled={...options.providers,manager:noProvider,claudeManager:noProvider,evidenceReviewer:noProvider,worker:noProvider,geminiWorker:noProvider,
    search:noProvider,searchGemini:noProvider,enrich:noProvider,availableActors:async()=>[],
    researchCapacity:async()=>({remainingKurus:options.phaseCeiling-cost.chargedKurus,defaults:[],configuredDefaults:[],actors:[],workerBudgetExhausted:true}),
    withCeiling:()=>disabled};
   return runStage({...options,providers:disabled});
  }
 }
 if(options.providers.managedBudgetVersion<7&&options.phaseCeiling&&!['scope','synthesis','coverage_plan'].includes(job.phase)){
  const {chargedKurus}=await options.ledger.status();
  const remaining=options.phaseCeiling-chargedKurus;
  if(job.researchVersion==='v8'&&options.providers.collectionFirst&&options.providers.managedBudgetVersion>=3&&inventoryStages.includes(job.phase)){
   if(job.phase!==inventoryStages[0]){
    if(job.inventoryBatch){
     for(const phase of inventoryStages.slice(inventoryStages.indexOf(job.phase)))
      await runStage({...options,phase,skipManagedCollection:true});
     return {advanceSkippedInventory:true};
    }
    return runStage(options);
   }
   if(remaining>=workerInfraReservationKurus){
    const ceiling=Math.min(options.phaseCeiling,managedFocusedInventoryCeilingKurus);
    const minimum=minimumV8GeminiReservation(focusedInventoryOutputTokens,options.providers.now?.(),researchTariff);
    const providers=chargedKurus+workerInfraReservationKurus+minimum<=ceiling?options.providers:{...options.providers,focusedIndexUnavailable:true};
    return meter({job,ledger:options.ledger,run:()=>runStage({...options,providers})});
   }
  }
  if(job.researchVersion==='v8'&&options.providers.collectionFirst&&options.providers.managedBudgetVersion===2&&inventoryStages.includes(job.phase)){
   // This stage cannot fall back to another model. Even a one-token request
   // must fund Gemini's output/reasoning and the worker before it can run.
   const ceiling=Math.min(options.phaseCeiling,managedInventoryCeilingKurus);
   const minimum=minimumV8GeminiReservation(inventoryOutputTokens,options.providers.now?.(),researchTariff);
   if(chargedKurus+workerInfraReservationKurus+minimum>ceiling){
    if(job.inventoryBatch){
     for(const phase of inventoryStages.slice(inventoryStages.indexOf(job.phase)))
      await runStage({...options,phase,skipManagedCollection:true});
     return {advanceSkippedInventory:true};
    }
    return runStage({...options,skipManagedCollection:true});
   }
  }
  if(remaining<workerInfraReservationKurus){
   if(managedReviewPhases.includes(job.phase)){
    const manager=async()=>{throw new BudgetError('budget_limit','BHS kanıt incelemesi için ayrılan bütçeye ulaşıldı.');};
    return runStage({...options,providers:{...options.providers,manager,evidenceReviewer:manager,worker:manager}});
   }
   if(sequentialPhases.indexOf(job.phase)<=sequentialPhases.indexOf('sector_sources'))
    throw new BudgetError('budget_limit','Marka ve araştırma planı için ayrılan bütçeye ulaşıldı.');
   return runStage({...options,skipManagedCollection:true});
  }
 }
 if(options.phaseCeiling&&job.phase==='coverage_plan')return runStage(options);
 return meter({job:scopedJob,ledger:options.ledger,run:()=>runStage(options)});
}

export function createBhsWorkerHandler({enabled=backgroundBhsEnabled,secret=()=>process.env.BHS_WORKER_SECRET,getQueue=()=>createBhsJobStore(),getProviders=createSequentialProviders,run=runClaimedBhsStage,readiness=()=>createSupervisedReadiness({env:{...process.env,VERCEL_ENV:'preview'}}),logger=console}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  const configured=secret(),provided=req.headers.authorization?.replace(/^Bearer /,'');
  if(!enabled())return res.status(503).json({code:'bhs_worker_disabled'});
  if(!/^[A-Za-z0-9_-]{43}$/.test(configured||'')||typeof provided!=='string'||Buffer.byteLength(provided)!==Buffer.byteLength(configured)||!timingSafeEqual(Buffer.from(provided),Buffer.from(configured)))return res.status(401).json({code:'unauthorized'});
  if(req.method!=='POST')return res.status(405).json({code:'post_required'});
  // Private installation check: catalogues and saved policies only. It cannot
  // claim a job, generate a report, start an Actor or expose credential values.
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(body?.action==='readiness')return readiness()({method:'GET'},res);
  let job;
  try{
   const queue=await getQueue();job=await queue.claim();if(!job)return res.status(200).json({status:'idle'});
   const result=await run({job,queue,getLedger:queue.getLedger,getProviders:opts=>getProviders({...opts,infrastructureOffsetKurus:workerInfraReservationKurus}),runStage:opts=>runMeteredBhsPhase(job,opts)});
   logger.info?.(JSON.stringify({event:'bhs_background_stage',jobId:job.id,phase:job.phase,status:result.status}));
   return res.status(200).json(result);
  }catch(error){
   logger.error?.(JSON.stringify({event:'bhs_background_paused',...(job?{jobId:job.id,phase:job.phase}:{}),code:error.code||'worker_unavailable',...(error.budgetDiagnostic?{budgetDiagnostic:error.budgetDiagnostic}:{})}));
   // No provider message, brief, token or gateway credential leaves this endpoint.
   return res.status(200).json({status:'paused',code:error.code||'worker_unavailable'});
  }
 };
}
