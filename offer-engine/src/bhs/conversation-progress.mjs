import {BudgetError,hash} from '../budget/ledger.mjs';
import {publicResearchUrl,researchProgressSchema} from './conversation-contract.mjs';
import {assertSchema} from './schema.mjs';
import {conversationSourceBody,usableConversationSource} from './conversation-source.mjs';

export const researchClosureVersion='read-source-coverage-and-public-gaps-v1';
const normalize=value=>String(value||'').replace(/\s+/gu,' ').trim();
const nonempty=value=>typeof value==='string'&&Boolean(value.trim());
const fail=message=>{throw new BudgetError('research_progress_invalid',message);};
export function canonicalSourceUrl(value){
 const url=publicResearchUrl(value);if(!url)return null;
 const parsed=new URL(url);parsed.protocol='https:';parsed.hostname=parsed.hostname.replace(/^www\./u,'');
 for(const key of [...parsed.searchParams.keys()])if(/^(?:utm_.+|fbclid|gclid|msclkid|ref|source)$/iu.test(key))parsed.searchParams.delete(key);
 parsed.searchParams.sort();parsed.pathname=parsed.pathname.replace(/\/+$/u,'')||'/';return parsed.href;
}
export function sourceReadIdentity(source){
 const text=String(source.text||'').toWellFormed().replaceAll('\0','\ufffd');
 return {contentDigest:source.contentDigest||hash(text),bodyDigest:source.bodyDigest||hash(normalize(conversationSourceBody({...source,text})).toLocaleLowerCase('tr'))};
}
export const emptyResearchProgress=()=>({objective:'',questions:[],candidates:[],proofs:[]});
const mergeRanges=rows=>{const merged=[];for(const row of rows.sort((a,b)=>a.start-b.start)){
 const last=merged.at(-1);if(last&&row.start<=last.end)last.end=Math.max(last.end,row.end);else merged.push({...row});
}return merged;};

// Only tool observations actually delivered in an earlier assistant turn count
// as seen. Reading and reviewing a new page in one unobserved tool batch fails.
export function collectSourceViews(turn,sources,views=new Map()){
 for(const view of turn.observedSourceViews||[]){
  const source=sources.get(view.sourceId);if(!source||!usableConversationSource(source)||view.contentDigest!==sourceReadIdentity(source).contentDigest)continue;
  const old=views.get(source.id),ranges=(view.ranges||[]).filter(row=>Number.isSafeInteger(row.start)&&Number.isSafeInteger(row.end)&&row.start>=0&&row.end>row.start&&row.end<=source.text.length);
  views.set(source.id,{contentDigest:view.contentDigest,ranges:mergeRanges([...(old?.contentDigest===view.contentDigest?old.ranges:[]),...ranges])});
 }
 for(const result of turn.results||[]){
  let value;try{value=JSON.parse(result.content);}catch{continue;}
  for(const view of value.sources|| (value.id?[value]:[])){
   const source=sources.get(view.id);if(!source||!usableConversationSource(source))continue;
   const digest=sourceReadIdentity(source).contentDigest,old=views.get(source.id);
   const ranges=(view.passages||[]).filter(row=>Number.isSafeInteger(row.start)&&Number.isSafeInteger(row.end)&&row.start>=0&&row.end>row.start&&
    row.end<=source.text.length&&String(view.text||'').includes(source.text.slice(row.start,row.end)));
   if(ranges.length)views.set(source.id,{contentDigest:digest,ranges:mergeRanges([...(old?.contentDigest===digest?old.ranges:[]),...ranges])});
  }
 }
 return views;
}
export function quoteWasSeen(source,quote,views){
 const view=views?.get(source.id);return nonempty(quote)&&view?.contentDigest===sourceReadIdentity(source).contentDigest&&
  view.ranges.some(row=>normalize(source.text.slice(row.start,row.end)).includes(normalize(quote)));
}
export function qualifiedResearchSources(progress,sources=[]){
 const known=new Map(sources.map(source=>[source.id,source]));
 return (progress?.proofs||[]).filter(proof=>{
  const source=known.get(proof.sourceId);return usableConversationSource(source)&&sourceReadIdentity(source).contentDigest===proof.contentDigest&&
   canonicalSourceUrl(source.url)===canonicalSourceUrl(proof.url)&&progress.questions?.some(q=>q.id===proof.questionId&&q.access!=='client');
 });
}
export function researchCoverage(progress,sources){
 const urls=new Set(),bodies=new Set(),ids=[];
 for(const proof of qualifiedResearchSources(progress,sources)){
  const url=canonicalSourceUrl(proof.url);if(urls.has(url)||bodies.has(proof.bodyDigest))continue;
  urls.add(url);bodies.add(proof.bodyDigest);ids.push(proof.sourceId);
 }
 return {minimum:4,count:ids.length,sourceIds:ids};
}
export function updateResearchProgress(previous,input,{sources,views,knownUrls,readAttempts,toolIssues=[]}){
 try{assertSchema(input,researchProgressSchema);}catch{fail('Araştırma durumunun veri biçimi geçersiz.');}
 if(!nonempty(input.objective))fail('Araştırmanın marka ve hedefle ilişkili amacını yaz.');
 const progress=structuredClone(previous||emptyResearchProgress()),known=new Map(sources.map(row=>[row.id,row]));
 const questions=new Map(progress.questions.map(row=>[row.id,row]));
 for(const row of input.questions){
  if(!/^[a-zA-Z0-9_-]{1,80}$/u.test(row.id)||!nonempty(row.question))fail('Sabit bir soru kimliği ve somut soru gerekli.');
  const old=questions.get(row.id);
  if(old&&(old.access!==row.access||old.important&&!row.important)&&!nonempty(row.rationale))fail('Soru sınıfı/önemi değişiyorsa gerekçeyi açıkla.');
  if(old&&(old.access!==row.access||old.important!==row.important))progress.classificationChanges=[...(progress.classificationChanges||[]),{questionId:row.id,from:{access:old.access,important:old.important},to:{access:row.access,important:row.important},rationale:row.rationale}];
  if(row.sourceIds.some(id=>!known.has(id)))fail('Soru yalnız bilinen kaynaklara bağlanabilir.');
  if(row.status==='answered'&&!nonempty(row.answer))fail('Cevaplanan sorunun sonucunu yaz.');
  if(row.status==='unavailable'&&row.access==='public'){
   const attempted=row.attemptedUrls.length&&row.attemptedUrls.every(url=>readAttempts.has(publicResearchUrl(url)));
   const failedTool=toolIssues.some(issue=>['search_web','read_pages','specialist_read'].includes(issue.tool)&&['not_configured','provider_error','provider_timeout','source_already_failed'].includes(issue.code));
   if(!nonempty(row.rationale)||!attempted&&!failedTool)fail('Erişilemedi kararı gerçek bir kaynak/araç denemesi ve gerekçe gerektirir.');
  }
  questions.set(row.id,row);
 }
 progress.objective=input.objective;progress.questions=[...questions.values()];
 const proofs=new Map(progress.proofs.map(proof=>[proof.sourceId,proof]));
 for(const row of input.sources){
  const source=known.get(row.sourceId),question=questions.get(row.questionId);
  if(!source||!question||!nonempty(row.reason))fail('Kaynak, araştırma sorusu ve ilgi gerekçesi gerekli.');
  if(!row.related){proofs.delete(row.sourceId);continue;}
  if(question.access==='client'||!usableConversationSource(source)||!quoteWasSeen(source,row.quote,views)||
   !usableConversationSource({text:row.quote,method:'extracted'}))fail('İlgili kaynak için daha önce gösterilmiş gerçek gövde pasajını kullan.');
  proofs.set(row.sourceId,{sourceId:source.id,url:source.url,questionId:row.questionId,quote:row.quote,reason:row.reason,...sourceReadIdentity(source)});
 }
 progress.proofs=[...proofs.values()];
 const qualified=new Set(qualifiedResearchSources(progress,sources).map(proof=>proof.sourceId));
 for(const row of input.questions)if(row.access==='public'&&row.status==='answered'&&(!row.sourceIds.length||row.sourceIds.some(id=>!qualified.has(id))))fail('Kamu sorusunun cevabını okunmuş ve ilgili olarak değerlendirilmiş kaynaklara bağla.');
 const candidates=new Map(progress.candidates.map(row=>[canonicalSourceUrl(row.url),row]));
 for(const row of input.candidates){
  const url=publicResearchUrl(row.url);if(!url||!knownUrls.has(url)||!questions.has(row.questionId)||!nonempty(row.reason))fail('Aday için gözlemlenen URL, soru ve seçim/eleme gerekçesi gerekli.');
  if(row.status==='selected'&&!progress.proofs.some(proof=>qualified.has(proof.sourceId)&&canonicalSourceUrl(proof.url)===canonicalSourceUrl(url)))fail('Seçilen adayın ilgili içeriği gerçekten okunmalı.');
  candidates.set(canonicalSourceUrl(url),{...row,url});
 }
 progress.candidates=[...candidates.values()];return progress;
}
export function researchClosureIssues(progress,sources,{report,views,includeUnavailable=false}={}){
 const issues=[],qualified=new Set(qualifiedResearchSources(progress,sources).map(proof=>proof.sourceId));
 if(!nonempty(progress?.objective)||!progress.questions?.length)issues.push('research_questions_missing');
 if(researchCoverage(progress,sources).count<4)issues.push('four_distinct_read_sources_missing');
 if(progress?.questions?.some(q=>q.important&&q.access==='public'&&q.status==='open'))issues.push('important_public_questions_open');
 if(progress?.questions?.some(q=>q.important&&q.access==='public'&&q.status==='answered'&&(!q.sourceIds.length||q.sourceIds.some(id=>!qualified.has(id)))))issues.push('answered_public_question_unbacked');
 if(progress?.candidates?.some(candidate=>candidate.status==='pending'&&progress.questions?.some(q=>q.id===candidate.questionId&&q.important&&q.access==='public')))issues.push('relevant_candidates_unread');
 if(includeUnavailable&&progress?.questions?.some(q=>q.important&&q.access==='public'&&q.status==='unavailable'))issues.push('important_public_questions_unavailable');
 if(report){
  const known=new Map(sources.map(source=>[source.id,source]));
  const used=[...[...report.reportMarkdown.matchAll(/\[(S[a-f0-9]{8})\]/gu)].map(row=>row[1]),...report.highlights.flatMap(row=>row.sourceIds),...report.competitors.flatMap(row=>row.sourceIds)];
  if(used.some(id=>!qualified.has(id)))issues.push('unreviewed_report_source');
  if(views&&report.sourceQuotes.some(row=>known.has(row.sourceId)&&!quoteWasSeen(known.get(row.sourceId),row.quote,views)))issues.push('unseen_report_quote');
 }
 return [...new Set(issues)];
}
export function researchStatus(progress,sources){
 return {coverage:researchCoverage(progress,sources),objective:progress?.objective||'',
  questions:(progress?.questions||[]).map(({id,question,access,important,status})=>({id,question,access,important,status})),
  candidates:progress?.candidates||[],issues:researchClosureIssues(progress,sources)};
}
