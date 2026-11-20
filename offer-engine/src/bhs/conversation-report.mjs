import {briefHash,dimensions} from './brief.mjs';
import {hash} from '../budget/ledger.mjs';
import {fallbackScope} from '../pricing/scope.mjs';
import {guardResearchScope} from './scope-authority.mjs';
import {offerCopy} from '../proposal/composition.mjs';
import {conversationVersion,finalReportSchema,publicResearchUrl} from './conversation-contract.mjs';
import {assertSchema} from './schema.mjs';
import {usableConversationSource,sourceReadingStatus} from './conversation-source.mjs';
import {researchReportIssues} from './conversation-research.mjs';
import {researchClosureIssues,qualifiedResearchSources,sourceReadIdentity} from './conversation-progress.mjs';
import {semanticReviewIssues} from './conversation-semantic.mjs';
import {objectiveReportIssues,captureSourcePassages} from './conversation-objective.mjs';

export function validateConversationReport(report,sources,{semantic=false,objective=false}={}){
 const issues=[];
 try{assertSchema(report,finalReportSchema);}catch{return ['report_format'];}
 if(!report.reportMarkdown.trim()||!report.summary.trim())issues.push('empty_report');
 const prose=report.reportMarkdown.toLocaleLowerCase('tr').normalize('NFKD').replace(/\p{M}/gu,'').replaceAll('ı','i');
 if(!semantic)for(const [key,pattern]of [['brand',/marka|is modeli/u],['market',/pazar|sektor/u],['competition',/rakip|rekabet/u],
  ['swot',/swot/u],['strength',/guclu/u],['weakness',/zayif/u],['opportunity',/firsat/u],['threat',/tehdit/u],['actions',/aksiyon|eylem|yol haritasi/u]])
  if(!pattern.test(prose))issues.push('missing_'+key);
 if(Buffer.byteLength(JSON.stringify(report))>350000)issues.push('report_size');
 const known=new Map(sources.map(s=>[s.id,s])),read=id=>usableConversationSource(known.get(id));
 const citations=[...report.reportMarkdown.matchAll(/\[(S[a-f0-9]{8})\]/gu)].map(m=>m[1]);
 if(citations.some(id=>!known.has(id)))issues.push('unknown_citation');
 for(const finding of report.highlights){
  if(finding.sourceIds.some(id=>!known.has(id)))issues.push('unknown_citation');
  if(finding.kind==='observation'&&(!finding.sourceIds.length||!finding.sourceIds.every(read)))issues.push('unread_observation');
  if(!finding.statement.trim()||!finding.analysis.trim()||!finding.action.trim())issues.push('incomplete_highlight');
 }
 if(!report.highlights.some(row=>row.kind!=='brief'&&row.sourceIds.some(read)))issues.push('no_read_supported_highlight');
 for(const peer of report.competitors)if(!publicResearchUrl(peer.url)||!peer.sourceIds.length||peer.sourceIds.some(id=>!read(id)))issues.push('unverified_competitor');
 const quotes=new Map();
 const normalized=value=>value.replace(/\s+/gu,' ').trim();
 for(const row of report.sourceQuotes){
  if(!known.has(row.sourceId)||!row.quote.trim()||row.quote.length>240||!normalized(known.get(row.sourceId).text).includes(normalized(row.quote)))issues.push('quote_mismatch');
  else quotes.set(row.sourceId,row.quote);
 }
 const used=[...citations,...report.highlights.flatMap(row=>row.sourceIds),...report.competitors.flatMap(row=>row.sourceIds)];
 if(used.some(id=>!quotes.has(id)))issues.push('citation_quote_missing');
 if(objective)issues.push(...objectiveReportIssues(report,sources));
 return [...new Set(issues)];
}

// The complete narrative is authoritative. Compatibility fields are copied
// from the same finished answer; no second model, legacy quota or substring gate.
export function conversationAuditResult(brief,stored,{reason}={}){
 const raw=stored.conversationReport||stored.report?.conversation||stored.conversation;
 const retained=stored.conversationSources||stored.sources||stored.report?.conversationSources||[];
 const sourceRows=new Map(retained.map(source=>[source.id,source]));
 const semanticReview=stored.semanticReview||stored.report?.semanticReview;
 const objectiveValidationVersion=stored.objectiveValidationVersion||stored.report?.objectiveValidationVersion;
 const conversationContext=stored.conversationContext||stored.report?.conversationContext;
 const issues=raw?validateConversationReport(raw,retained,{semantic:Boolean(semanticReview),objective:Boolean(objectiveValidationVersion)}):['report_unavailable'];
 if(conversationContext?.briefDigest&&conversationContext.briefDigest!==hash(brief))issues.push('conversation_brief_changed');
 if(raw&&semanticReview)issues.push(...semanticReviewIssues(semanticReview,raw));
 const researchOutcomeVersion=stored.researchOutcomeVersion||stored.report?.researchOutcomeVersion,
  researchSummary=stored.researchSummary||stored.report?.researchSummary;
 if(raw&&researchOutcomeVersion)issues.push(...researchReportIssues(raw,researchSummary,retained,brief));
 const researchClosure=stored.researchClosure||stored.report?.researchClosure;
 if(raw&&researchClosure)issues.push(...(researchClosure.issues||[]),...researchClosureIssues(researchClosure.progress,retained,{report:raw,includeUnavailable:true}));
 reason??=stored.reason;
 const report=raw||{summary:brief.brandName+' için araştırma kayıtları korundu; tamamlanmış analiz henüz oluşmadı.',
  reportMarkdown:brief.brandName+' için tamamlanmış BHS oluşmadı. '+(reason?'İşlem durumu: '+reason+'.':''),highlights:[],competitors:[],sourceQuotes:[],questions:[],limitations:[]};
 const findings=report.highlights.map((row,index)=>({id:'conversation_'+hash(row).slice(0,20),kind:row.kind,dimension:row.dimension,
  statement:row.statement,reportExcerpt:row.statement,impact:row.analysis,goalConnection:brief.goals,
  sourceIds:row.sourceIds.filter(id=>sourceRows.has(id)),priority:index<4?'high':'medium',
  recommendation:{action:row.action,measurement:row.measurement},decisionQuestion:'',
  ...(row.quadrant!=='none'?{swotQuadrant:row.quadrant}:{}),
  bhsSection:row.quadrant!=='none'?'swot':row.dimension,bhsSectionTitle:row.quadrant!=='none'?'SWOT':dimensions.find(d=>d.id===row.dimension)?.name,bhsRank:index+1}));
 const used=new Set([...report.reportMarkdown.matchAll(/\[(S[a-f0-9]{8})\]/gu)].map(m=>m[1]));
 for(const row of [...report.highlights,...report.competitors])for(const id of row.sourceIds)used.add(id);
 const quoteMap=new Map();
 for(const row of report.sourceQuotes){
  const source=sourceRows.get(row.sourceId);
  if(source&&source.text.replace(/\s+/gu,' ').includes(row.quote.replace(/\s+/gu,' ').trim())&&row.quote.length<=240)
   quoteMap.set(row.sourceId,[...(quoteMap.get(row.sourceId)||[]),row.quote]);
 }
 for(const proof of qualifiedResearchSources(researchClosure?.progress,retained)){
  const source=sourceRows.get(proof.sourceId);
  if(source&&proof.quote.length<=240&&source.text.replace(/\s+/gu,' ').includes(proof.quote.replace(/\s+/gu,' ').trim())){
   used.add(source.id);quoteMap.set(source.id,[...(quoteMap.get(source.id)||[]),proof.quote]);
  }
 }
 const captured=retained.filter(source=>used.has(source.id)&&quoteMap.has(source.id)).map(source=>{
  const original={...source,...sourceReadIdentity(source),readingStatus:sourceReadingStatus(source)},text=[...new Set(quoteMap.get(source.id))].join('\n');
  return objectiveValidationVersion?captureSourcePassages(original,text):{...original,text,links:[]};
 });
 const sources=captured.map(source=>({id:source.id,url:source.url,title:source.title||source.url,
  quote:source.text,scope:source.method==='search-snippet'?'Arama sonucu alıntısı; tam sayfa okunmadı.':'Tavily veya doğrulanmış uzman araç ile okunan kamuya açık kaynak.',
  sourceType:'secondary',publishedAt:source.publishedAt||null,period:null,
  verification:{status:source.method==='search-snippet'?'search_only':'quote_matched',method:source.method,
   scope:'retained-source-provenance',retrievedAt:source.retrievedAt}}));
 const complete=Boolean(raw)&&!issues.length&&!reason;
 const sections=[...new Set(findings.map(f=>f.bhsSection))].map(id=>({id,title:findings.find(f=>f.bhsSection===id).bhsSectionTitle,
  count:findings.filter(f=>f.bhsSection===id).length,findingIds:findings.filter(f=>f.bhsSection===id).map(f=>f.id),complete,missingQuadrants:[]}));
 const reportData={summary:report.summary,findings,sources,
  ...(researchOutcomeVersion?{researchOutcomeVersion,researchSummary}:{}),
  ...(researchClosure?{researchClosure}:{}),
  ...(semanticReview?{semanticReview}:{}),
  ...(objectiveValidationVersion?{objectiveValidationVersion}:{}),...(conversationContext?{conversationContext}:{}),
  competitors:report.competitors.map(peer=>({id:'peer_'+hash(peer.url).slice(0,18),name:peer.name,website:peer.url,
   scaleReason:peer.reason,audienceReason:'',geographyReason:'',sourceIds:peer.sourceIds})),
  dimensions:dimensions.map(d=>({id:d.id,score:null,rationale:'Nitel değerlendirme tam BHS raporunda yer alır.',dataStatus:'partial',findingIds:findings.filter(f=>f.dimension===d.id).map(f=>f.id),comparisonCompetitorIds:[],strengths:[],gaps:[],onboardingQuestions:[]})),
  benchmarks:[],bhsSections:sections,researchCoverage:[],criticalOpportunityFindingId:null,criticalRiskFindingId:null,
  meetingQuestions:report.questions.map(question=>({dimension:'operations',question,findingIds:[]})),serviceRecommendations:[],
  conversation:report,conversationSources:captured,transfer:{contentComplete:complete,issues:issues.map(reason=>({path:'conversation',reason}))}};
 const data={...reportData,report:reportData,schemaVersion:'bhs-v2-direct',methodologyVersion:conversationVersion,
  briefHash:briefHash(brief),rawReport:report.reportMarkdown,fullReport:report.reportMarkdown,
  researchMethod:'claude-conversation',researchAsOf:stored.researchedAt||stored.reuse?.researchedAt||null,
  researchContext:{brandName:brief.brandName,website:brief.website,briefHash:briefHash(brief)},
  scoring:{total:null,weights:dimensions.map(({id,weight})=>({id,weight})),note:'Bu rapor nitel stratejik analizdir; ölçülmüş performans puanı üretilmedi.'},
  quality:{checksPassed:complete,contentComplete:complete,semanticBenchmark:'not_requested',semanticAssessment:semanticReview?.status||'legacy',scope:semanticReview?'conversation-provenance-and-analyst-review':'conversation-format-and-source-provenance',customerApproval:'pending',
   issues:[...issues.map(reason=>({path:'conversation',reason})),...(reason?[{path:'research',reason}]:[])]},
  researchDiagnostics:(stored.toolIssues||[]).map(row=>({stage:'tools',code:row.code,message:row.tool+' · '+row.code+(row.providerStatus?' (HTTP '+row.providerStatus+')':'')})),
  ...(stored.reuse?{researchReuse:stored.reuse}:{}),services:[],
  researchContinuity:{status:complete?'complete':raw?'partial':'unavailable',reason:reason||(!complete?'report_review_required':null),additionalPaidCalls:0,
   notice:complete?'BHS analizi hazır.':raw?'Mevcut analiz korundu; belirtilen sınırlamalarla teklif hazırlığına geçebilirsin.':'Tamamlanmış analiz oluşmadı; görüşme bilgileriyle teklif hazırlığına geçebilirsin.'}
 };
 data.scopePlan=guardResearchScope(fallbackScope(brief),brief,{supervision:{researchPlan:{taskReporting:true}}});
 data.proposalCopy=offerCopy(null,data);
 // Ready is the established pricing handoff, not an assertion that every
 // business claim was independently verified. The quality state stays separate.
 return {status:'ready',data};
}
