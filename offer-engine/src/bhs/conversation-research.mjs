import {publicResearchUrl,researchHandoffSchema} from './conversation-contract.mjs';
import {usableConversationSource} from './conversation-source.mjs';
import {assertSchema} from './schema.mjs';
import {qualifiedResearchSources,canonicalSourceUrl} from './conversation-progress.mjs';
import {offeringOutcomeFor,offeringOutcomeIssues,legacyResearchHandoff} from './conversation-offerings.mjs';
import {marketAnalysisVersion,marketDecisionIssues} from './conversation-market.mjs';

export const researchOutcomeVersion='adjudicated-market-competition-outcomes-v2';
export const marketResearchGuidance='PAZAR VE RAKİP SONUCU: Marka ürününü, alıcıyı, ülkeyi ve müşteri hedefini birlikte kullanarak karar değiştiren dış kamu sorusunu seç. Bulunan ilgili dış sayfayı oku; kaynak gövdesinin hangi soruyu neden yanıtladığını review_research ile değerlendir. Bir kaynağı indirmek, onu ilgili kanıt yapmaz. Pazarın kanalları, alıcı davranışı ve rekabet koşulları için somut sonucu ve marka açısından anlamını; seçtiğin isimli rakip için gerçek alternatif olma nedenini, karşılaştırmayı ve aksiyona etkisini begin_report ile teslim et. Analitik çıkarım için her cümleye kaynak veya kesin pazar büyüklüğü arama. Eksik bir karşılaştırma diğer geçerli sonuçları silmez; yalnız açık soruya devam et. Kaynak sayısı doldurmak veya genel rakip kriterleri yazmak araştırmanın yerine geçmez.';
const text=value=>typeof value==='string'&&Boolean(value.trim());
const host=value=>{try{return new URL(value).hostname.replace(/^www\./u,'');}catch{return '';}};
const sameSite=(a,b)=>{const left=host(a),right=host(b);return left&&right&&(left===right||left.endsWith('.'+right)||right.endsWith('.'+left));};

// These are task outcomes, not a quota of headings, pages or metrics. Semantic
// quality still belongs to the analyst; this checks that work was returned.
export function researchOutcomeIssues(summary,sources,brief,{progress,analysisVersion}={}){
 const issues=[],known=new Map(sources.map(source=>[source.id,source]));
 const qualified=progress===undefined?null:new Set(qualifiedResearchSources(progress,sources).map(proof=>proof.sourceId));
 try{assertSchema(analysisVersion?legacyResearchHandoff(summary):summary,researchHandoffSchema);}catch{issues.push('research_handoff_format');}
 const readIds=ids=>Array.isArray(ids)&&ids.length>0&&ids.every(id=>usableConversationSource(known.get(id)));
 const external=ids=>Array.isArray(ids)&&ids.some(id=>known.has(id)&&!sameSite(known.get(id).url,brief.website));
 for(const key of ['channels','customerBehavior','competitionDynamics']){
  const row=summary?.market?.[key];
  if(!text(row?.analysis)||!Array.isArray(row?.sourceIds)||row.sourceIds.some(id=>!usableConversationSource(known.get(id))))issues.push('market_'+key+'_missing');
  if(qualified&&Array.isArray(row?.sourceIds)&&row.sourceIds.some(id=>!qualified.has(id)))issues.push('market_'+key+'_source_unreviewed');
 }
 if(!Object.values(summary?.market||{}).some(row=>readIds(row?.sourceIds)&&external(row.sourceIds)))issues.push('market_research_missing');
 if(!Array.isArray(summary?.competitors)||!summary.competitors.length)issues.push('named_competitors_missing');
 else for(const peer of summary.competitors){
  if(!text(peer?.name)||!publicResearchUrl(peer.url)||sameSite(peer.url,brief.website)||
   !text(peer.reason)||!text(peer.comparison)||!text(peer.implication)||!readIds(peer.sourceIds)||!external(peer.sourceIds))issues.push('competitor_comparison_missing');
  if(qualified&&Array.isArray(peer?.sourceIds)&&peer.sourceIds.some(id=>!qualified.has(id)))issues.push('competitor_source_unreviewed');
 }
 if(analysisVersion)issues.push(...offeringOutcomeIssues(summary,sources,{progress,analysisVersion}));
 if(analysisVersion===marketAnalysisVersion)issues.push(...marketDecisionIssues(summary,sources,brief,{progress}));
 return [...new Set(issues)];
}
export function researchReportIssues(report,summary,sources,brief,options){
 const issues=researchOutcomeIssues(summary,sources,brief,options);
 if(!issues.length&&summary.competitors.some(peer=>!report.competitors?.some(row=>
  row.name?.trim()===peer.name.trim()&&publicResearchUrl(row.url)===publicResearchUrl(peer.url)&&text(row.reason)&&row.sourceIds?.some(id=>peer.sourceIds.includes(id)))))issues.push('researched_competitor_omitted');
 if(!issues.length&&options?.analysisVersion&&summary.competitors.some(peer=>!report.competitors?.some(row=>
  row.name?.trim()===peer.name.trim()&&publicResearchUrl(row.url)===publicResearchUrl(peer.url)&&row.sourceIds?.some(id=>
   peer.sourceIds.includes(id)&&sources.some(source=>source.id===id&&canonicalSourceUrl(source.url)===canonicalSourceUrl(peer.alternativeUrl))))))issues.push('researched_alternative_omitted');
 if(!issues.length&&options?.analysisVersion===marketAnalysisVersion&&summary.marketDecisions.some(row=>row.questionIds.some(questionId=>{
  const question=options.progress?.questions?.find(q=>q.id===questionId&&q.status==='answered');
  return question&&!row.sourceIds.some(id=>question.sourceIds.includes(id)&&sources.some(source=>source.id===id&&!sameSite(source.url,brief.website))&&
   report.reportMarkdown?.includes('['+id+']')&&report.sourceQuotes?.some(quote=>quote.sourceId===id));
 })))issues.push('researched_market_source_omitted');
 return issues;
}

// An actual unavailable question is a quality limitation, not an instruction
// to keep waiting for another product or peer. Never relax unread assertions.
export function researchCompletionIssues(summary,sources,brief,options={}){
 const issues=researchOutcomeIssues(summary,sources,brief,options);
 if(!options.analysisVersion)return issues;
 const groups=Array.isArray(summary?.offerings)?summary.offerings:[];
 const allPeersUnavailable=groups.length>0&&groups.every(group=>options.progress?.questions?.some(q=>
  q.id===group?.competitionQuestionId&&q.access==='public'&&q.status==='unavailable'&&text(q.rationale)));
 return issues.filter(code=>!['offering_product_unavailable','offering_competition_unavailable','market_question_unavailable'].includes(code)&&!(code==='named_competitors_missing'&&allPeersUnavailable));
}

export function researchOutcomeStatus(summary,sources,brief,progress,analysisVersion){
 const issues=researchOutcomeIssues(summary,sources,brief,{progress,analysisVersion});
 return {version:analysisVersion?offeringOutcomeFor(analysisVersion):researchOutcomeVersion,issues,
  retained:{market:Object.entries(summary?.market||{}).filter(([,row])=>text(row?.analysis)).map(([key])=>key),
   competitors:(Array.isArray(summary?.competitors)?summary.competitors:[]).filter(row=>text(row?.name)).map(({name,url})=>({name,url})),
   ...(analysisVersion?{offerings:(Array.isArray(summary?.offerings)?summary.offerings:[]).map(({id,label})=>({id,label}))}:{}),
   ...(analysisVersion===marketAnalysisVersion?{marketDecisions:(Array.isArray(summary?.marketDecisions)?summary.marketDecisions:[]).map(row=>({offeringIds:row?.offeringIds,questionIds:row?.questionIds}))}:{})},
  ...(issues.length?{instruction:'Önceki somut sonuçları aynı konuşmada koru. missing açıklarında ilgili dar soruyu araştır; source_unreviewed için mevcut gövdeyi ücretsiz arşivden görüp review_research ile gerçek ilgisini ve dayanağını kaydet. İlgisiz kaynağı ele; yalnız ilgili dış kaynağı oku. Sonra eksik karşılaştırmayı tamamlayıp begin_report ile sonuçları güncelle. Analitik çıkarımın her cümlesi için kaynak veya kesin pazar hacmi gerekmez.'}:{})};
}
