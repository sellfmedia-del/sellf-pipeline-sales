import {randomUUID} from 'node:crypto';
import {runtimeStore,productionOffers,bearer} from '../runtime.mjs';
import {sessionFor} from '../proposal/preview-session.mjs';
import {createLedger,BudgetError} from '../budget/ledger.mjs';
import {briefHash,snapshotBrief} from './brief.mjs';

export const backgroundBhsEnabled=()=>process.env.OFFER_BHS_BACKGROUND_ENABLED==='true';
const jobRow=row=>row?{id:row.id,leadId:row.lead_id,budgetId:row.budget_id,briefHash:row.brief_hash,brief:JSON.parse(row.brief_text),phase:row.phase,state:row.state,...row.spec,leaseToken:row.lease_token,leaseUntil:Date.parse(row.lease_until),diagnostic:row.diagnostic,cancelRequested:row.cancel_requested===true}:null;
export function createBhsJobStore({store=runtimeStore(),jwt,workerSecret=process.env.BHS_WORKER_SECRET}={}){
 const browser=(op,args)=>store.call('bhs_job_'+op,{jwt,...args});
 const worker=(op,args={})=>{if(!/^[A-Za-z0-9_-]{43}$/.test(workerSecret||''))throw new BudgetError('not_configured','BHS arka plan bağlantısı gerekli.');return store.call('bhs_job_'+op,{workerSecret,...args});};
 return {
  find:async(leadId,hash)=>jobRow(await browser('find',{leadId,briefHash:hash})),
  enqueue:async(spec,brief,budget)=>jobRow(await browser('enqueue',{leadId:spec.leadId,briefText:JSON.stringify(snapshotBrief(brief)),briefHash:briefHash(brief),budgetId:budget.id,spec})),
  read:async job=>jobRow(await browser('read',{leadId:job.leadId,jobId:job.backgroundJobId||job.id})),
  cancel:async job=>jobRow(await browser('cancel',{leadId:job.leadId,jobId:job.backgroundJobId||job.id})),
  claim:async()=>jobRow(await worker('claim',{leaseToken:randomUUID()})),
  advance:(job,data)=>worker('advance',{jobId:job.id,leaseToken:job.leaseToken,...data}),
  pause:(job,data)=>worker('pause',{jobId:job.id,leaseToken:job.leaseToken,...data}),
  getLedger:async job=>createLedger((op,data={})=>worker('budget',{jobId:job.id,leaseToken:job.leaseToken,data:{op,...data}}))
 };
}
export async function browserBhsJobStore(req,res,{store=runtimeStore(),secret=process.env.OFFER_PORTAL_SECRET}={}){
 const session=productionOffers()?(bearer(req)?{accessToken:bearer(req)}:null):await sessionFor(req,res,store,secret);
 if(!session?.accessToken)throw new BudgetError('budget_session','Pipeline oturumu gerekli.');
 return createBhsJobStore({store,jwt:session.accessToken});
}
