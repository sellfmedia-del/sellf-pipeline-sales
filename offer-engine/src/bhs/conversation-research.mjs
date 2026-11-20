import {publicResearchUrl,researchHandoffSchema} from './conversation-contract.mjs';
import {usableConversationSource} from './conversation-source.mjs';
import {assertSchema} from './schema.mjs';

export const researchOutcomeVersion='market-competition-outcomes-v1';
const text=value=>typeof value==='string'&&Boolean(value.trim());
const host=value=>{try{return new URL(value).hostname.replace(/^www\./u,'');}catch{return '';}};
const sameSite=(a,b)=>{const left=host(a),right=host(b);return left&&right&&(left===right||left.endsWith('.'+right)||right.endsWith('.'+left));};

// These are task outcomes, not a quota of headings, pages or metrics. Semantic
// quality still belongs to the analyst; this checks that work was returned.
export function researchOutcomeIssues(summary,sources,brief){
 const issues=[],known=new Map(sources.map(source=>[source.id,source]));
 try{assertSchema(summary,researchHandoffSchema);}catch{issues.push('research_handoff_format');}
 const readIds=ids=>Array.isArray(ids)&&ids.length>0&&ids.every(id=>usableConversationSource(known.get(id)));
 const external=ids=>(ids||[]).some(id=>known.has(id)&&!sameSite(known.get(id).url,brief.website));
 for(const key of ['channels','customerBehavior','competitionDynamics']){
  const row=summary?.market?.[key];
  if(!text(row?.analysis)||!Array.isArray(row?.sourceIds)||row.sourceIds.some(id=>!usableConversationSource(known.get(id))))issues.push('market_'+key+'_missing');
 }
 if(!Object.values(summary?.market||{}).some(row=>readIds(row?.sourceIds)&&external(row.sourceIds)))issues.push('market_research_missing');
 if(!Array.isArray(summary?.competitors)||!summary.competitors.length)issues.push('named_competitors_missing');
 else for(const peer of summary.competitors){
  if(!text(peer?.name)||!publicResearchUrl(peer.url)||sameSite(peer.url,brief.website)||
   !text(peer.reason)||!text(peer.comparison)||!text(peer.implication)||!readIds(peer.sourceIds)||!external(peer.sourceIds))issues.push('competitor_comparison_missing');
 }
 return [...new Set(issues)];
}
export function researchReportIssues(report,summary,sources,brief){
 const issues=researchOutcomeIssues(summary,sources,brief);
 if(!issues.length&&summary.competitors.some(peer=>!report.competitors?.some(row=>
  row.name?.trim()===peer.name.trim()&&publicResearchUrl(row.url)===publicResearchUrl(peer.url)&&text(row.reason)&&row.sourceIds?.some(id=>peer.sourceIds.includes(id)))))issues.push('researched_competitor_omitted');
 return issues;
}
