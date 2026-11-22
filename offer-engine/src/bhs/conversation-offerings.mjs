import {BudgetError} from '../budget/ledger.mjs';
import {researchHandoffSchema,conversationTools,publicResearchUrl} from './conversation-contract.mjs';
import {assertSchema} from './schema.mjs';
import {canonicalSourceUrl,qualifiedResearchSources} from './conversation-progress.mjs';
import {usableConversationSource} from './conversation-source.mjs';

export const offeringAnalysisVersion='product-buyer-competition-v1';
export const offeringOutcomeVersion='product-buyer-competition-outcomes-v3';
const string={type:'string'},strings={type:'array',items:string};
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const product=object({name:string,url:string,analysis:string,sourceIds:strings});
export const offeringHandoffSchema={...researchHandoffSchema,properties:{...researchHandoffSchema.properties,
 offeringScope:string,
 offerings:{type:'array',items:object({id:string,label:string,audience:string,need:string,market:string,channel:string,
  commercialRole:string,productQuestionId:string,competitionQuestionId:string,products:{type:'array',items:product}})},
 competitors:{type:'array',items:{...researchHandoffSchema.properties.competitors.items,
  properties:{...researchHandoffSchema.properties.competitors.items.properties,offeringId:string,alternativeName:string,alternativeUrl:string},
  required:[...researchHandoffSchema.properties.competitors.items.required,'offeringId','alternativeName','alternativeUrl']}}},
 required:[...researchHandoffSchema.required,'offeringScope','offerings']};

// A new policy opts in before the first paid request. Historical policies,
// frozen quotes and all their native tool schemas remain byte-for-byte legacy.
export function checkedOfferingVersion(version){
 if(version!==undefined&&version!==offeringAnalysisVersion)throw new BudgetError('budget_context','Ürün ve rakip araştırma sözleşmesi doğrulanamadı.');
 return version;
}
export const offeringVersionForOutcome=version=>version===offeringOutcomeVersion?offeringAnalysisVersion:undefined;
export const outcomeOptions=(version,progress)=>({...(version===offeringOutcomeVersion||version==='adjudicated-market-competition-outcomes-v2'?{progress}:{}),
 ...(offeringVersionForOutcome(version)?{analysisVersion:offeringAnalysisVersion}:{})});
export const researchSchemaFor=version=>checkedOfferingVersion(version)?offeringHandoffSchema:researchHandoffSchema;
export function conversationToolsFor(version){
 return checkedOfferingVersion(version)?conversationTools.map(tool=>tool.name==='begin_report'?{...tool,input_schema:offeringHandoffSchema,
  description:tool.description+' Seçtiğin önemli ürün/hizmet gruplarını offeringScope/offerings ile teslim et. Her rakibi offeringId ve gerçekten okunan alternativeUrl ile ilgili gruba bağla.'}:tool):conversationTools;
}
export const offeringAnalysisGuidance='ÜRÜN VE ALTERNATİF ANALİZİ: Markayı anladıktan sonra hedef açısından önemli ürün/hizmet gruplarını sen seç; her markaya sabit segment, SKU, rakip sayısı veya araç listesi uygulama. review_research içinde seçtiğin grupların ürününü ve gerçek alternatifini anlamaya yönelik dar public soruları kaydet. Menüdeki adları katalog incelemesi sayma; temsili ürün/hizmet sayfasının gövdesini oku ve hangi alıcı ihtiyacını, satış yolunu, ürün farkını ve ticari rolü gösterdiğini değerlendir. Fiyat, uygulama, kurulum, destek veya teknik özellik yalnız karar açısından önemliyse incelensin; görünmeyen fiyat, iç marj veya gerçekleşmiş satış icat edilmesin. Ana sayfa gerçekten tek ürün/hizmeti açıklıyorsa kullanılabilir. Önce mevcut kaynak ve ücretsiz arşivi kullan; gerekiyorsa ilgili sayfayı read_pages, uygun dar görevi mevcut specialist_read ile al. Bütün kataloğu veya sosyal kanalları otomatik tarama. begin_report.offeringScope seçilen grupların brief hedefini nasıl kapsadığını, offerings ise alıcı/ihtiyaç/pazar/kanal/ticari rolü ve okunan temsili ürünün analizini taşısın. productQuestionId ve competitionQuestionId mevcut araştırma sorularıdır. Her competitor, offeringId ile ilgili gruba bağlansın; alternativeName/alternativeUrl gerçek alternatif ürün veya hizmeti, comparison somut farkı, implication büyüme kararını anlatsın. Markanın adı, sektör benzerliği veya global ürün varlığı tek başına aynı alıcı/pazar için alternatif olduğunu kanıtlamaz; Türkiye/başka ülke, fiyat segmenti, sipariş yolu, servis/yazılım ve ülke kullanım koşullarını gerektiği kadar doğrula. Aynı rakip farklı gruplarda farklı alternatifle değerlendirilebilir; ilgisiz rakiple kota doldurma. Okunan sayfa gövdesini review_research ile ilgili soruya bağla; arama özeti ürün veya rakip kanıtı değildir. Gerçek erişim engelini mevcut unavailable sorusunda deneme ve gerekçeyle kaydet; eksikliği başka grubun karşılaştırmasıyla kapatma. Geçerli ürün/pazar/rakip sonuçlarını silme. Tam rapor ve SWOT seçilen ürünlerin satın alma gerekçesini ve karşılaştırmanın ticari sonucunu doğal anlatımda korusun; teknik tablo veya anahtar kelime sayısı kalite değildir.';
export const offeringReviewGuidance='Seçilen ürün/hizmet gruplarının brief hedefini kapsayıp kapsamadığını, temsili ürünün gerçekten anlaşıldığını ve her rakibin o alıcı/ihtiyaç/pazarda somut alternatif olduğunu değerlendir. Ürün adını listelemek analiz değildir. Özellikten satın alma gerekçesine ve büyüme aksiyonuna geçişi, ülke/servis/yazılım kapsamını ve karşılaştırmanın tam raporda korunmasını anlam bakımından kontrol et. Eksik ürün veya rakip kanıtı için bütçe uygunsa dar research_needed sorusu belirt; iç fiyat/marj verisi veya sabit rakip kotası araştırmayı kilitlemesin.';

const nonempty=value=>typeof value==='string'&&Boolean(value.trim());
export function legacyResearchHandoff(summary){
 if(!summary||typeof summary!=='object')return summary;
 return {reason:summary.reason,market:summary.market,competitors:Array.isArray(summary.competitors)?summary.competitors.map(row=>{
  const {offeringId,alternativeName,alternativeUrl,...legacy}=row;return legacy;
 }):summary.competitors};
}
// This checks delivery/provenance and chosen-scope coverage, not commercial
// truth via headings/keywords. The same analyst still judges relevance/meaning.
export function offeringOutcomeIssues(summary,sources,{progress}={}){
 const issues=[];
 try{assertSchema(summary,offeringHandoffSchema);}catch{issues.push('offering_handoff_format');}
 const groups=Array.isArray(summary?.offerings)?summary.offerings:[],peers=Array.isArray(summary?.competitors)?summary.competitors:[];
 if(!nonempty(summary?.offeringScope)||!groups.length)issues.push('offering_scope_missing');
 const known=new Map(sources.map(row=>[row.id,row])),proofs=qualifiedResearchSources(progress,sources),ids=new Set();
 const question=id=>progress?.questions?.find(row=>row.id===id&&row.access==='public');
 const reviewed=(sourceIds,url,questionId)=>Array.isArray(sourceIds)&&sourceIds.length>0&&Boolean(publicResearchUrl(url))&&
  sourceIds.every(id=>usableConversationSource(known.get(id))&&proofs.some(proof=>proof.sourceId===id))&&
  sourceIds.some(id=>canonicalSourceUrl(known.get(id).url)===canonicalSourceUrl(url)&&proofs.some(proof=>proof.sourceId===id&&proof.questionId===questionId));
 for(const group of groups){
  if(!group||!nonempty(group.id)||!/^[a-zA-Z0-9_-]{1,80}$/u.test(group.id)||ids.has(group.id)){issues.push('offering_identity_invalid');continue;}ids.add(group.id);
  if(['label','audience','need','market','channel','commercialRole'].some(key=>!nonempty(group[key])))issues.push('offering_context_missing');
  const own=question(group.productQuestionId),competition=question(group.competitionQuestionId);
  if(own?.status!=='answered')issues.push(own?.status==='unavailable'?'offering_product_unavailable':'offering_product_question_open');
  if(!Array.isArray(group.products)||!group.products.length){if(own?.status!=='unavailable')issues.push('offering_products_missing');}
  else for(const row of group.products)if(!nonempty(row?.name)||!nonempty(row?.analysis)||!reviewed(row?.sourceIds,row?.url,group.productQuestionId))issues.push('offering_product_unread');
  const alternatives=peers.filter(peer=>peer?.offeringId===group.id);
  if(competition?.status!=='answered'||!alternatives.length)issues.push(competition?.status==='unavailable'?'offering_competition_unavailable':'offering_competition_missing');
  for(const peer of alternatives)if(!nonempty(peer.alternativeName)||!reviewed(peer.sourceIds,peer.alternativeUrl,group.competitionQuestionId))issues.push('competitor_product_unread');
 }
 for(const peer of peers)if(!ids.has(peer?.offeringId))issues.push('competitor_offering_unknown');
 return [...new Set(issues)];
}
