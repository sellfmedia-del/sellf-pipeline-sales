import {qualifiedResearchSources} from './conversation-progress.mjs';
import {usableConversationSource} from './conversation-source.mjs';

export const marketAnalysisVersion='product-buyer-market-competition-v2';
export const marketOutcomeVersion='product-buyer-market-competition-outcomes-v4';
const string={type:'string'},strings={type:'array',items:string};
export const marketDecisionSchema={type:'object',properties:{offeringIds:strings,questionIds:strings,analysis:string,implication:string,sourceIds:strings},
 required:['offeringIds','questionIds','analysis','implication','sourceIds'],additionalProperties:false};
export const marketAnalysisGuidance='PAZARDA SATIN ALMA KARARI: Seçtiğin ürün/hizmet ve hedef ülke için kim satın alıyor, karşılaştırma/onay/sipariş nasıl ilerliyor, hangi alternatifler ve fiyatlandırma/kurulum/destek koşulları kararı değiştiriyor, büyümeyi hangi dış koşul sınırlıyor: ilgili olanlarını dar kamu soruları olarak sen seç. Profesyonel ve bireysel alıcı yalnız gerçekten varsa ayrışsın. Markanın mevcut kanallarını tekrarlamak veya genel güven/fiyat açıklaması pazar araştırması değildir. Mevcut okunmuş dış ürün/satış sayfası aynı soruyu karşılıyorsa yeniden satın alma; gerekiyorsa resmî koşul, satış/listeme sayfası veya sınırlı yorum örneklemini incele. Yorum örneklemini bütün pazarın davranışı gibi sunma. Kesin pazar hacmi, kamuya açık olmayan fiyat ve iç ciro/marj koşul değildir. begin_report.marketScope hangi alıcı/pazar kararlarını neden seçtiğini açıklasın; marketDecisions her ilgili grubu offeringIds ile gerçek public questionIds, okunan ilgili dış sourceIds, somut analysis ve marka hedefi açısından implication ile bağlasın. Tek kaynak veya ortak satın alma süreci birden çok grubu gerçekten açıklıyorsa birlikte kullanılabilir; sabit soru/segment/sayfa kotası yok. Analitik çıkarımı dayanak olgudan ayır. Erişilemeyen soruyu gerçek deneme ve gerekçeyle unavailable kaydet; o grubun eksikliğini başka segmentle kapatma. Tam raporda satın alma sürecini ve rekabet kararını koru; başlık veya kelime sayısı kalite değildir.';
export const marketReviewGuidance='Pazar anlatısının yalnız mevcut kanal listesi veya genel güven/fiyat yorumu olup olmadığını anlam bakımından denetle. Seçilen alıcı/pazar için gerçek satın alma süreci, alternatifler, ilgili ticari koşullar ve büyüme engellerinden karar değiştirenler araştırılmış mı; dış kaynakla desteklenen olgu ve analitik sonuç ayrılmış mı; segment açısından somut karar tam raporda korunmuş mu? Gereksiz kesin pazar büyüklüğü veya tüm sektörlere aynı kontrol listesi dayatma.';
const text=value=>typeof value==='string'&&Boolean(value.trim());
const sameSite=(a,b)=>{try{const left=new URL(a).hostname.replace(/^www\./u,''),right=new URL(b).hostname.replace(/^www\./u,'');
 return left===right||left.endsWith('.'+right)||right.endsWith('.'+left);}catch{return true;}};

// Check chosen-question delivery and external body provenance. Commercial
// relevance and the meaning of the decision stay with the same analyst.
export function marketDecisionIssues(summary,sources,brief,{progress}={}){
 const issues=[],groups=new Set((Array.isArray(summary?.offerings)?summary.offerings:[]).map(row=>row?.id)),known=new Map(sources.map(row=>[row.id,row]));
 const decisions=Array.isArray(summary?.marketDecisions)?summary.marketDecisions:[],proofs=qualifiedResearchSources(progress,sources);
 const question=id=>progress?.questions?.find(row=>row.id===id&&row.access==='public');
 if(!text(summary?.marketScope)||!decisions.length)issues.push('market_decision_scope_missing');
 const covered=new Set();
 for(const row of decisions){
  if(!row||!Array.isArray(row.offeringIds)||!row.offeringIds.length||row.offeringIds.some(id=>!groups.has(id))){issues.push('market_offering_unknown');continue;}
  row.offeringIds.forEach(id=>covered.add(id));
  if(!text(row.analysis)||!text(row.implication))issues.push('market_decision_missing');
  const questions=Array.isArray(row.questionIds)?row.questionIds.map(question):[];
  if(!questions.length||questions.some(q=>!q)){issues.push('market_question_missing');continue;}
  const answered=questions.filter(q=>q.status==='answered'),unavailable=questions.filter(q=>q.status==='unavailable'&&text(q.rationale));
  if(unavailable.length)issues.push('market_question_unavailable');
  if(answered.length+unavailable.length!==questions.length)issues.push('market_question_open');
  const ids=Array.isArray(row.sourceIds)?row.sourceIds:[];
  if(answered.some(q=>!ids.some(id=>q.sourceIds?.includes(id)&&usableConversationSource(known.get(id))&&
   !sameSite(known.get(id).url,brief.website)&&proofs.some(p=>p.sourceId===id&&p.questionId===q.id)))||
   ids.some(id=>!usableConversationSource(known.get(id))||!proofs.some(p=>p.sourceId===id&&row.questionIds.includes(p.questionId))))issues.push('market_decision_unread');
 }
 if([...groups].some(id=>!covered.has(id)))issues.push('market_offering_missing');
 return [...new Set(issues)];
}
