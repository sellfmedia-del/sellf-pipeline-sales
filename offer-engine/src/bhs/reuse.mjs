import {groundOfferReport} from './source-gate.mjs';
import {hasGroundedResearch} from './research-content.mjs';
import {briefHash} from './brief.mjs';
import {hash} from '../budget/ledger.mjs';
const fold=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]/gu,'');
const site=s=>{try{return new URL(s).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}};
export const researchIdentity=brief=>({brand:fold(brief.brandName),host:site(brief.website)});
export const researchCacheKey=(brief,now=Date.now())=>'research:saved:'+Math.floor(now/(7*86400000))+':'+hash(researchIdentity(brief));
export async function readReusableResearch(brief,ledger,now=Date.now()){
 const settled=await Promise.allSettled([now,now-7*86400000].map(async at=>{
  const row=await ledger.get(researchCacheKey(brief,at));return row?.state==='complete'?row.value:null;
 }));
 const rows=settled.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value);
 let unverifiable=null;
 for(const row of rows){
  try{
  let result=reusableResearch(brief,[row],now);if(!result)continue;
  unverifiable??=result;
  if(!result.analysisPacket){
   const originalHash=result.reuse.originalBriefHash||result.reuse.sourceStep.match(/[a-f0-9]{64}$/)?.[0];
   if(!/^[a-f0-9]{64}$/.test(originalHash||''))continue;
   // An isolated read failure cannot discard other completed evidence. These
   // reads never fetch a URL, reset a budget or replay a provider request.
   const historic=await Promise.allSettled(['audit:synthesis:synthesis-v5:','audit:synthesis:synthesis-v4:','audit:synthesis:report-v3:','audit:evidence:evidence-v4:','audit:evidence:'].map(async prefix=>ledger.get(prefix+originalHash)));
   const candidates=historic.filter(r=>r.status==='fulfilled'&&r.value?.state==='complete').map(r=>r.value.value);
   for(const value of candidates){
    const packet=value?.analysisPacket||value?.packet;if(!packet)continue;
    const candidate={...result,analysisPacket:packet,searchEvidence:value.searchEvidence||[]};
    if(hasGroundedResearch(groundOfferReport(candidate.report,{packet,searchEvidence:candidate.searchEvidence,brief}))){result=candidate;break;}
   }
  }
  if(result.analysisPacket&&hasGroundedResearch(groundOfferReport(result.report,{packet:result.analysisPacket,searchEvidence:result.searchEvidence||[],brief})))return result;
  }catch{/* A malformed record cannot hide another completed candidate. */}
 }
 // Existing completed work without recoverable proof is retained as an
 // unavailable handoff, never a reason to silently buy replacement research.
 return unverifiable;
}
export async function saveReusableResearch(brief,ledger,value,now=Date.now()){
 const row={step_key:value.ledgerStep||'audit:synthesis:'+briefHash(brief),created_at:new Date(now).toISOString(),value};
 return ledger.once(researchCacheKey(brief,now),researchIdentity(brief),0,async()=>row);
}
// The gateway supplies completed history on the authenticated, authorised card.
// Reuse facts, not old commercial decisions: scope/copy are always recomputed
// for the current brief. A changed brief retains explicit context uncertainty.
export function reusableResearch(brief,rows,now=Date.now()){
 for(const row of rows||[]){
  const age=now-Date.parse(row.created_at),value=row.value,report=value?.originalModelData||value?.data||value?.report,context=value?.researchContext;
  if(!Number.isFinite(age)||age<0||age>7*86400000||!report||!((Array.isArray(report.findings)&&report.findings.length)||(Array.isArray(report.researchCoverage)?report.researchCoverage:Object.values(report.researchCoverage||{})).some(a=>['observed','partial'].includes(a?.status)&&a.sourceIds?.length)))continue;
  const name=fold(brief.brandName),host=site(brief.website);let compatible=false;
  if(context?.brief)compatible=fold(context.brief.brandName)===name&&site(context.brief.website)===host;
  else {
   // Legacy paid documents lack input metadata. Require all three independent
   // identity fields; do not reuse a competitor mention or a different domain.
   const headline=fold(report.summary).startsWith(name),entity=(report.benchmarks||[]).some(b=>fold(b.entries?.[0]?.entityId)===name);
   compatible=headline&&entity&&(report.sources||[]).some(s=>site(s.url)===host);
  }
  if(!compatible)continue;
  return {...value,report,reuse:{sourceStep:row.step_key,researchedAt:row.created_at,originalBriefHash:context?.briefHash||null,exactBrief:context?.briefHash===briefHash(brief),contextNeedsConfirmation:context?.briefHash!==briefHash(brief),incrementalResearchCalls:0,...(value.originalModelStep?{originalModelStep:value.originalModelStep}:{})}};
 }
 return null;
}
