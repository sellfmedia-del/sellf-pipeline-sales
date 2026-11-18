import {isReadEvidence} from './research-content.mjs';
import {researchUrl} from './research-url.mjs';
import {evidenceGeographies} from './scoped-market.mjs';

const strengths={discovered:0,read:1,verified:2};
// The signed BHS travels with pricing, which accepts a 600 KB JSON envelope.
// The full source receipts are stored apart from this report index.
const reportIndexLimit=45000;

export function mergeScopedEvidence(previous=[],incoming=[]){
 const byUrl=new Map();
 for(const entry of [...previous,...incoming]){
  const old=byUrl.get(entry.url);
  if(!old){byUrl.set(entry.url,entry);continue;}
  const [weaker,stronger]=strengths[entry.status]>=strengths[old.status]?[old,entry]:[entry,old];
  byUrl.set(entry.url,{title:weaker.title,...stronger});
 }
 return [...byUrl.values()].sort((a,b)=>strengths[b.status]-strengths[a.status]);
}

export function indexScopedEvidence(receipts,coverage){
 const accepted=new Map(coverage.map(metric=>[metric.id,new Set(metric.proofs.map(fact=>fact.id))]));
 const evidence=new Map();
 for(const receipt of receipts){
  const proofs=accepted.get(receipt.id);
  if(!proofs)continue;
  const rows=[];
  for(const raw of receipt.urls||[]){
   const url=researchUrl(raw);
   if(url)rows.push({url,status:'discovered'});
  }
  for(const fact of receipt.facts||[]){
   const url=researchUrl(fact.url);
   if(!url)continue;
   const read=isReadEvidence(fact);
   const verified=read&&proofs.has(fact.id);
   const geographies=read?evidenceGeographies(fact.quote):[];
   const accessed=read&&typeof fact.retrievedAt==='string'&&/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(fact.retrievedAt)?fact.retrievedAt.slice(0,10):null;
   rows.push({url,status:verified?'verified':read?'read':'discovered',
    ...(fact.title?{title:fact.title.slice(0,150).toWellFormed()}:{}),
    ...(accessed?{accessed}:{}),...(geographies.length===1?{geography:geographies[0]}:{})});
  }
  evidence.set(receipt.id,mergeScopedEvidence(evidence.get(receipt.id),rows));
 }
 return evidence;
}

export function boundScopedEvidence(metrics){
 const tasks=metrics.filter(metric=>metric.evidence?.length).map(metric=>({metric,rows:metric.evidence,kept:[]}));
 let remaining=reportIndexLimit;
 for(let i=0;i<Math.max(0,...tasks.map(task=>task.rows.length));i++)for(const task of tasks){
  const row=task.rows[i];if(!row)continue;
  const size=JSON.stringify(row).length+1;
  if(size<=remaining){task.kept.push(row);remaining-=size;}
 }
 for(const {metric,rows,kept} of tasks){
  if(rows.length>kept.length)metric.additionalEvidence=true;
  metric.evidence=kept;
 }
 return metrics;
}

// Preserve at least one accepted source per task before using remaining space
// for other publishers. A single document may yield many overlapping cards.
export function balancedScopedProofs(reviewed,resolve,limit=18){
 const tasks=new Map();
 for(const row of reviewed){
  const url=resolve(row.id)?.url;
  if(!url)continue;
  if(!tasks.has(row.needId))tasks.set(row.needId,new Map());
  const sources=tasks.get(row.needId);
  if(!sources.has(url))sources.set(url,row);
 }
 const queues=[...tasks.values()].map(rows=>[...rows.values()]);
 const selected=[];
 for(let index=0;index<Math.max(0,...queues.map(rows=>rows.length));index++)
  for(const rows of queues){
   if(rows[index])selected.push(rows[index]);
   if(selected.length===limit)return selected;
  }
 return selected;
}
