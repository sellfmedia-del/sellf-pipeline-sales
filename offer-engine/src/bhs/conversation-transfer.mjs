import {canonicalConversationHash as digest} from './conversation-context.mjs';
import {sourceReadIdentity,qualifiedResearchSources} from './conversation-progress.mjs';
import {sourceReadingStatus} from './conversation-source.mjs';

export const conversationTransferVersion='whole-report-summary-source-transfer-v1';
const usedSources=report=>new Set([...[...String(report?.reportMarkdown||'').matchAll(/\[(S[a-f0-9]{8})\]/gu)].map(row=>row[1]),
 ...(report?.highlights||[]).flatMap(row=>row.sourceIds||[]),...(report?.competitors||[]).flatMap(row=>row.sourceIds||[])]);
export function createConversationTransfer(report,sources,{progress}={}){
 if(!report||typeof report.reportMarkdown!=='string'||typeof report.summary!=='string')return undefined;
 const qualified=new Set(qualifiedResearchSources(progress,sources).map(row=>row.sourceId));
 const entries=[...new Map(sources.map(source=>[source.id,{id:source.id,url:source.url,method:source.method||'unknown',
  readingStatus:sourceReadingStatus(source),contentDigest:sourceReadIdentity(source).contentDigest,adjudicated:qualified.has(source.id)}])).values()].sort((a,b)=>a.id.localeCompare(b.id));
 const value={version:conversationTransferVersion,reportDigest:digest(report),narrativeDigest:digest(report.reportMarkdown),summaryDigest:digest(report.summary),
  highlightsDigest:digest(report.highlights),sourceScope:'historical-observations-not-fresh-reads',sources:entries,
  counts:{bodyAvailable:entries.filter(row=>row.readingStatus==='body_available').length,discoveryOnly:entries.filter(row=>row.readingStatus==='discovery_only').length,
   navigationOnly:entries.filter(row=>row.readingStatus==='navigation_only').length,adjudicated:entries.filter(row=>row.adjudicated).length}};
 return {...value,digest:digest(value)};
}
function validReceipt(receipt){
 try{const {digest:expected,...value}=receipt;return receipt.version===conversationTransferVersion&&Array.isArray(receipt.sources)&&expected===digest(value)&&
  receipt.sources.every(row=>typeof row.id==='string'&&typeof row.url==='string'&&typeof row.method==='string'&&typeof row.contentDigest==='string')&&
  new Set(receipt.sources.map(row=>row.id)).size===receipt.sources.length;}catch{return false;}
}
const highlightProjection=rows=>rows.map(row=>({statement:row?.statement,excerpt:row?.reportExcerpt,analysis:row?.impact,action:row?.recommendation?.action,measurement:row?.recommendation?.measurement,
 kind:row?.kind,dimension:row?.dimension,quadrant:row?.swotQuadrant||'none',sourceIds:row?.sourceIds}));
const rawHighlights=rows=>rows.map(({statement,analysis,action,measurement,kind,dimension,quadrant,sourceIds})=>({statement,excerpt:statement,analysis,action,measurement,kind,dimension,quadrant,sourceIds}));
export function conversationTransferIssues(report,sources,receipt,{projections=[]}={}){
 if(!validReceipt(receipt))return ['conversation_transfer_invalid'];
 const issues=[];
 if(receipt.reportDigest!==digest(report??null))issues.push('conversation_report_changed');
 if(receipt.narrativeDigest!==digest(report?.reportMarkdown??null))issues.push('conversation_narrative_changed');
 if(receipt.summaryDigest!==digest(report?.summary??null))issues.push('conversation_summary_changed');
 if(receipt.highlightsDigest!==digest(report?.highlights??null))issues.push('conversation_highlights_changed');
 const known=new Map(receipt.sources.map(row=>[row.id,row])),present=new Map(sources.map(row=>[row.id,row]));
 for(const source of sources){const old=known.get(source.id);
  if(!old||source.url!==old.url||(source.method||'unknown')!==old.method||sourceReadingStatus(source)!==old.readingStatus||sourceReadIdentity(source).contentDigest!==old.contentDigest)issues.push('conversation_source_provenance_changed');
 }
 for(const id of usedSources(report))if(!known.has(id)||!present.has(id))issues.push('conversation_source_missing');
 for(const projection of projections.filter(value=>value&&typeof value==='object')){
  if(Object.hasOwn(projection,'summary')&&projection.summary!==report.summary)issues.push('summary_projection_mismatch');
  for(const key of ['rawReport','fullReport'])if(Object.hasOwn(projection,key)&&projection[key]!==report.reportMarkdown)issues.push('narrative_projection_mismatch');
  if(Object.hasOwn(projection,'findings')&&(!Array.isArray(projection.findings)||digest(highlightProjection(projection.findings))!==digest(rawHighlights(report.highlights))))issues.push('highlights_projection_mismatch');
 }
 return [...new Set(issues)];
}
