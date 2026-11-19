import {hash} from '../budget/ledger.mjs';
import {researchUrl} from './research-url.mjs';
import {assertSchema} from './schema.mjs';
import {obj,str} from './sequential-contracts.mjs';

const text=limit=>({...str(limit),minLength:1});
export const researchCommandSchema=obj({id:text(20),tool:text(90),query:str(340),url:str(2048),
 mode:{type:'string',enum:['default','posts','profile','reviews','engagement']},limit:{type:'integer',minimum:1,maximum:12}});

const compact=value=>String(value||'').replace(/\s+/gu,' ').trim();
export const researchCommandKey=c=>hash([c.id,c.tool,compact(c.query).toLocaleLowerCase('tr'),researchUrl(c.url),c.mode,c.limit]);
const deferred=new Set(['not_dispatched','default_searched_first','budget_limit','budget_pending',
 'provider_unavailable','not_configured','source_reader_unavailable','waiting_reference','actor_unavailable',
 'input_budget','model_budget','fx_limit','fx_unavailable','tariff_expired','cancelled_before_dispatch',
 'actor_budget_limit','actor_limit_unverified','actor_source_unverified']);
const command=row=>{
 if(!row||typeof row!=='object')return null;
 const value=Object.fromEntries(Object.keys(researchCommandSchema.properties).map(key=>[key,row[key]]));
 try{assertSchema(value,researchCommandSchema);return value;}catch{return null;}
};

// This is reconstructed from durable round receipts, not process memory.
// A later executed/cancelled/replaced event always settles an earlier defer.
export function queuedResearchCommands(history){
 const latest=new Map();
 for(const row of history){
  const value=command(row);if(!value)continue;
  const key=researchCommandKey(value);
  latest.set(key,{...value,key,status:row.status,...(row.reason?{reason:row.reason}:{})});
 }
 return [...latest.values()].filter(row=>deferred.has(row.status));
}

// Claude can cancel a saved instruction or explicitly replace it with a new
// valid command for the SAME question. Unknown keys and empty reasons do not
// erase queued work. The caller supplies current scope/dependency validation.
export function decideQueuedCommands(pending,decisions,proposed,allowed){
 const remaining=new Map(pending.map(row=>[row.key,row])),events=[];
 for(const decision of Array.isArray(decisions)?decisions:[]){
  if(!decision||!['cancel','replace'].includes(decision.action)||typeof decision.reason!=='string')continue;
  const reason=compact(decision.reason);if(!reason||reason.length>180)continue;
  const saved=remaining.get(decision.key);if(!saved)continue;
  const replacement=decision.action==='replace'?proposed.find(c=>c.id===saved.id&&
   researchCommandKey(c)!==saved.key&&allowed(c)):null;
  if(decision.action==='replace'&&!replacement)continue;
  remaining.delete(saved.key);
  events.push({...saved,status:decision.action==='replace'?'replaced':'cancelled',reason,
   ...(replacement?{replacementKey:researchCommandKey(replacement)}:{})});
 }
 return {pending:[...remaining.values()],events};
}
