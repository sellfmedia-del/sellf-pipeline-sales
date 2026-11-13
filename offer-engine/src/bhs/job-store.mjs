import {createHash,randomUUID} from 'node:crypto';
import {runtimeStore,productionOffers,bearer} from '../runtime.mjs';
import {sessionFor} from '../proposal/preview-session.mjs';
import {createLedger,BudgetError} from '../budget/ledger.mjs';
import {briefHash,snapshotBrief} from './brief.mjs';

// The gateway accepts the existing brief fields and stores the JSON verbatim.
// JSON whitespace binds the stored checkpoint hash to the run without adding
// fields to the gateway contract or changing any brief content.
export function queuedBhsBrief(brief,runId){
 const content=JSON.stringify(snapshotBrief(brief));
 const namespace=runId?[...runId.replaceAll('-','').toLowerCase()].map(digit=>' '.repeat(parseInt(digit,16))+'\t').join('')+'\n':'';
 const text=namespace+content;
 return {text,hash:createHash('sha256').update(text).digest('hex')};
}
export const backgroundBhsEnabled=()=>process.env.OFFER_BHS_BACKGROUND_ENABLED==='true';
function jobRow(row){
 if(!row)return null;
 const brief=JSON.parse(row.brief_text);
 return {...row.spec,id:row.id,leadId:row.lead_id,budgetId:row.budget_id,briefHash:briefHash(snapshotBrief(brief)),queueBriefHash:row.brief_hash,
  brief,phase:row.phase,state:row.state,leaseToken:row.lease_token,leaseUntil:Date.parse(row.lease_until),createdAt:Date.parse(row.created_at),updatedAt:Date.parse(row.updated_at),diagnostic:row.diagnostic,cancelRequested:row.cancel_requested===true,inventoryBatch:row.inventory_batch===true};
}
export function createBhsJobStore({store=runtimeStore(),jwt,workerSecret=process.env.BHS_WORKER_SECRET}={}){
 const browser=(op,args)=>store.call('bhs_job_'+op,{jwt,...args});
 const worker=(op,args={})=>{if(!/^[A-Za-z0-9_-]{43}$/.test(workerSecret||''))throw new BudgetError('not_configured','BHS arka plan bağlantısı gerekli.');return store.call('bhs_job_'+op,{workerSecret,...args});};
 return {
  find:async(leadId,hash)=>jobRow(await browser('find',{leadId,briefHash:hash})),
  async enqueue(spec,brief,budget){
   const stored=queuedBhsBrief(brief,spec.queueBriefHash?spec.researchRunId:undefined);
   if(spec.queueBriefHash&&(!spec.researchRunId||stored.hash!==spec.queueBriefHash))
    throw new BudgetError('changed_brief','BHS çalışma kimliği brief ile eşleşmiyor.');
   return jobRow(await browser('enqueue',{leadId:spec.leadId,briefText:stored.text,briefHash:stored.hash,budgetId:budget.id,spec}));
  },
  read:async job=>jobRow(await browser('read',{leadId:job.leadId,jobId:job.backgroundJobId||job.id})),
  cancel:async job=>jobRow(await browser('cancel',{leadId:job.leadId,jobId:job.backgroundJobId||job.id})),
  claim:async()=>jobRow(await worker('claim',{leaseToken:randomUUID()})),
  advance:(job,data)=>worker('advance',{jobId:job.id,leaseToken:job.leaseToken,...data}),
  pause:(job,data)=>worker('pause',{jobId:job.id,leaseToken:job.leaseToken,...data}),
  getLedger:async job=>createLedger((op,data={})=>worker('budget',{jobId:job.id,leaseToken:job.leaseToken,data:{op,...data}}),{reuseCompleted:true})
 };
}
export async function browserBhsJobStore(req,res,{store=runtimeStore(),secret=process.env.OFFER_PORTAL_SECRET}={}){
 const session=productionOffers()?(bearer(req)?{accessToken:bearer(req)}:null):await sessionFor(req,res,store,secret);
 if(!session?.accessToken)throw new BudgetError('budget_session','Pipeline oturumu gerekli.');
 return createBhsJobStore({store,jwt:session.accessToken});
}
