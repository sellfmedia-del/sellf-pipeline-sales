import {briefHash} from './brief.mjs';
import {hash} from '../budget/ledger.mjs';
const fold=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]/gu,'');
const site=s=>{try{return new URL(s).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}};
export const researchIdentity=brief=>({brand:fold(brief.brandName),host:site(brief.website)});
export const researchCacheKey=(brief,now=Date.now())=>'research:saved:'+Math.floor(now/(7*86400000))+':'+hash(researchIdentity(brief));
export async function readReusableResearch(brief,ledger,now=Date.now()){
 const rows=await Promise.all([now,now-7*86400000].map(async at=>(await ledger.get(researchCacheKey(brief,at)))?.value));
 return reusableResearch(brief,rows.filter(Boolean),now);
}
export async function saveReusableResearch(brief,ledger,value,now=Date.now()){
 const row={step_key:value.ledgerStep||'audit:synthesis:'+briefHash(brief),created_at:new Date(now).toISOString(),value};
 return ledger.once(researchCacheKey(brief,now),researchIdentity(brief),0,async()=>row);
}
// The gateway supplies history exclusively from the authenticated owner's card.
// Reuse facts, not old commercial decisions: scope/copy are always recomputed
// for the current brief. A changed brief retains explicit context uncertainty.
export function reusableResearch(brief,rows,now=Date.now()){
 for(const row of rows||[]){
  const age=now-Date.parse(row.created_at),value=row.value,report=value?.data||value?.report,context=value?.researchContext;
  if(!Number.isFinite(age)||age<0||age>7*86400000||!report||!Array.isArray(report.findings)||!report.findings.length)continue;
  const name=fold(brief.brandName),host=site(brief.website);let compatible=false;
  if(context?.brief)compatible=fold(context.brief.brandName)===name&&site(context.brief.website)===host;
  else {
   // Legacy paid documents lack input metadata. Require all three independent
   // identity fields; do not reuse a competitor mention or a different domain.
   const headline=fold(report.summary).startsWith(name),entity=(report.benchmarks||[]).some(b=>fold(b.entries?.[0]?.entityId)===name);
   compatible=headline&&entity&&(report.sources||[]).some(s=>site(s.url)===host);
  }
  if(!compatible)continue;
  return {...value,report,reuse:{sourceStep:row.step_key,researchedAt:row.created_at,originalBriefHash:context?.briefHash||null,exactBrief:context?.briefHash===briefHash(brief),contextNeedsConfirmation:context?.briefHash!==briefHash(brief),incrementalResearchCalls:0}};
 }
 return null;
}
