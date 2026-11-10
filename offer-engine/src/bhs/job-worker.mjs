import {timingSafeEqual} from 'node:crypto';
import {backgroundBhsEnabled,createBhsJobStore} from './job-store.mjs';
import {createSequentialProviders} from './sequential-providers.mjs';
import {runClaimedBhsStage} from './background-runner.mjs';
import {runBoundedStage} from './direct-research.mjs';
import {meteredBhsStage,workerInfraReservationKurus} from './job-infrastructure.mjs';
import {BudgetError} from '../budget/ledger.mjs';
import {createSupervisedReadiness} from './supervised-readiness.mjs';

export async function runMeteredBhsPhase(job,options,{runStage=runBoundedStage,meter=meteredBhsStage}={}){
 if(job.phase==='scope'){
  const cost=await options.ledger.status();
  if(cost.capKurus-cost.chargedKurus<workerInfraReservationKurus){
   // The existing deterministic scope fallback uses no provider and fits the
   // fixed gateway/template reserve. A finished BHS must not wait for a model.
   return runStage({...options,providers:{...options.providers,generate:async()=>{throw new BudgetError('budget_limit','Kalan bütçe için mevcut sıfır maliyetli kapsam şablonu kullanılacak.');}}});
  }
 }
 return meter({job,ledger:options.ledger,run:()=>runStage(options)});
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
   logger.error?.(JSON.stringify({event:'bhs_background_paused',...(job?{jobId:job.id,phase:job.phase}:{}),code:error.code||'worker_unavailable'}));
   // No provider message, brief, token or gateway credential leaves this endpoint.
   return res.status(200).json({status:'paused',code:error.code||'worker_unavailable'});
  }
 };
}
