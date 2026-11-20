import {hash} from '../budget/ledger.mjs';
import {publicResearchUrl,sourceId} from './conversation-contract.mjs';
import {usableConversationSource,conversationSourceBody} from './conversation-source.mjs';

export const objectiveValidationVersion='source-identity-and-report-structure-v1';
const normalize=value=>String(value||'').replace(/\s+/gu,' ').trim();
const digest=value=>hash(String(value||'').toWellFormed().replaceAll('\0','\ufffd'));

// A saved offer carries verified excerpts rather than another full archive.
// Bind those excerpts to their original archive identity without pretending
// that the excerpt digest is the original page digest.
export function captureSourcePassages(source,text){
 return {...source,text,links:[],capture:{kind:'verified-passages',textDigest:digest(text),
  originalContentDigest:source.contentDigest||digest(source.text),originalBodyDigest:source.bodyDigest}};
}
export function sourceIdentityIssues(source){
 const issues=[],url=publicResearchUrl(source?.url);
 if(!url||source.id!==sourceId(url))issues.push('source_identity_mismatch');
 if(typeof source?.text!=='string'||typeof source?.title!=='string')issues.push('source_format');
 if(source?.capture){
  if(source.capture.kind!=='verified-passages'||source.capture.textDigest!==digest(source.text)||
   source.capture.originalContentDigest!==source.contentDigest||source.capture.originalBodyDigest!==source.bodyDigest)
   issues.push('source_capture_mismatch');
 }else if(source?.contentDigest&&source.contentDigest!==digest(source.text))issues.push('source_content_changed');
 return issues;
}
export function isBodyQuote(source,quote){
 const body=conversationSourceBody({text:String(quote||''),method:'extracted'});
 return usableConversationSource(source)&&Boolean(normalize(body))&&normalize(quote)!==normalize(source.title)&&
  normalize(source.text).includes(normalize(quote))&&normalize(conversationSourceBody(source)).includes(normalize(body));
}
function emptySections(markdown){
 // Parent headings may contain their child sections. Code fences, headings,
 // references, separators and table delimiters alone are not section bodies.
 const plain=markdown.replace(/^\s*(`{3,}|~{3,}).*\n[\s\S]*?^\s*\1\s*$/gmu,'');
 const headings=[...plain.matchAll(/^ {0,3}(#{1,6})\s+.+$/gmu)];
 return headings.some((heading,index)=>{
  const next=headings.slice(index+1).find(row=>row[1].length<=heading[1].length);
  const body=plain.slice(heading.index+heading[0].length,next?.index??plain.length)
   .replace(/^ {0,3}#{1,6}\s+.*$/gmu,'').replace(/<!--[^]*?-->/gu,'').replace(/\[S[^\]\s]*\]/gu,'')
   .replace(/!?(?:\[[^\]]*\])\([^)]*\)/gu,'').replace(/[\s|:>*_`~#=\-]/gu,'');
  return !/[\p{L}\p{N}]/u.test(body);
 });
}
export function objectiveReportIssues(report,sources){
 const issues=[],known=new Map(),seenUrls=new Set();
 const used=new Set([...report.sourceQuotes.map(row=>row.sourceId),...report.highlights.flatMap(row=>row.sourceIds),
  ...report.competitors.flatMap(row=>row.sourceIds),...[...report.reportMarkdown.matchAll(/\[(S(?:[a-f0-9][^\]\s]*|[^\]\s]{7,}))\]/giu)].map(row=>row[1])]);
 for(const source of sources){
  if(used.has(source.id)){
   issues.push(...sourceIdentityIssues(source));
   if(known.has(source.id)||seenUrls.has(source.url))issues.push('duplicate_source_identity');
   seenUrls.add(source.url);
  }
  known.set(source.id,source);
 }
 if(emptySections(report.reportMarkdown))issues.push('empty_report_section');
 for(const match of report.reportMarkdown.matchAll(/\[(S(?:[a-f0-9][^\]\s]*|[^\]\s]{7,}))\](?:\(([^)]+)\))?/giu)){
  if(match[2]&&!/^S[a-f0-9]/iu.test(match[1]))continue; // Ordinary Markdown link labels are not source IDs.
  const source=known.get(match[1]);
  if(!/^S[a-f0-9]{8}$/u.test(match[1])||!source)issues.push('unknown_citation');
  else if(!usableConversationSource(source))issues.push('unread_report_citation');
  else if(match[2]&&publicResearchUrl(match[2])!==publicResearchUrl(source.url))issues.push('citation_url_mismatch');
 }
 for(const row of report.sourceQuotes)if(!isBodyQuote(known.get(row.sourceId),row.quote))issues.push('quote_not_read_body');
 for(const row of report.highlights){
  if(!row.measurement.trim())issues.push('incomplete_highlight');
  if(row.kind==='observation'&&!row.sourceIds.length)issues.push('unread_observation');
 }
 for(const row of report.competitors)if(!row.name.trim()||!row.reason.trim())issues.push('incomplete_competitor');
 return [...new Set(issues)];
}
