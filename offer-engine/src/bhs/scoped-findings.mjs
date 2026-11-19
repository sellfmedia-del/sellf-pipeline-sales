import {numericEvidence} from './numeric-evidence.mjs';
import {marketObservationSupported} from './scoped-market.mjs';
import {consentEvidenceRequested,researchGapStatement,substantiveEvidence} from './research-text.mjs';
import {statisticalNeedSupported,statisticalScopeIssue} from './statistical-scope.mjs';

const fold=value=>String(value||'').normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replaceAll('ı','i');
const key=value=>fold(value).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const demand=/\b(?:talep\p{L}*|taleb\p{L}*|demand|beklenti\p{L}*|satin alma niyeti|purchase intent|willingness to pay)\b/u;
const usage=/\b(?:kullanim\p{L}*|kullanil\p{L}*|uygulama\p{L}*|islev\p{L}*|tasarim\p{L}*|destekle\p{L}*|yarar\p{L}*|benefits?|supports?|helps?|uses?|features?|applications?)\b/u;
const transaction=/\b(?:siparis\p{L}*|bought|buying|orders?|ordering|purchas\p{L}*|satin al\p{L}*|procurement|tedarik ihalesi|quote requests?|rfqs?|teklif tale[bp]\p{L}*|budgets?|butce\p{L}*|sales volumes?|sales grew|satis hacmi|satis adet\p{L}*|spen(?:d|t|ding)|harcama\p{L}*|tercih\p{L}*|preferences?)\b/u;
const observed=/\b(?:reported|recorded|survey(?:ed)?|interview\p{L}*|respondents?|bought|purchased|placed|ordered|spent|allocated|awarded|selected|preferred|increased|decreased|satis yapildi|gerceklesti|kaydedildi|bildirdi\p{L}*|beyan etti\p{L}*|anket\p{L}*|satin aldi\p{L}*|tercih etti\p{L}*|verdi\p{L}*|ayirdi\p{L}*|harcadi\p{L}*|artti|azaldi|sonuclandi)\b/u;
const buyer=/\b(?:buyers?|customers?|parents?|schools?|nurser(?:y|ies)|managers?|alici\p{L}*|musteri\p{L}*|veli\p{L}*|okul\p{L}*|kres\p{L}*|kurum\p{L}*|operators?|distributors?|retailers?|sektor|market|respondents?)\b/u;
const hypothetical=/\b(?:can|could|may|might|should|would|will|how to|alinabilir|alabilir\p{L}*|onerilir)\b/u;
const reported=/\b(?:reported|recorded|surveyed|respondents?|bildirdi\p{L}*|beyan etti\p{L}*|anket\p{L}*|kaydedildi)\b/u;
const navigation=/\b(?:contact us|terms of service|cookie settings|privacy policy|skip to main content|iletisim sayfasi|kullanim kosullari|gizlilik politikasi|cerez ayarlari)\b/gu;
const sentences=new Intl.Segmenter('tr',{granularity:'sentence'});

export function readableFinding(text){
 const value=typeof text==='string'?text.trim():'';
 if(!/^[\p{Lu}\p{N}]/u.test(value)||!/[.!?][“”"')\]]?$/u.test(value)||/(?:\.{2,}|…)\s*$/u.test(value))return false;
 const clean=key(value);
 if((value.match(/\|/gu)||[]).length>=2||(clean.match(navigation)||[]).length>=2)return false;
 return clean.split(' ').length>=3&&!/^(?:skip to|accept cookies|cookie settings|sign in|contact us|ana sayfa|cerez ayarlari|giris yap)(?: |$)/u.test(clean)&&
  !/\b(?:ve|veya|ile|icin|and|or|with|for|to)\s*$/u.test(clean);
}

const hasBuyerEvidence=text=>[...sentences.segment(text)].some(({segment})=>{
 const value=fold(segment);
 return buyer.test(value)&&transaction.test(value)&&observed.test(value)&&(!hypothetical.test(value)||reported.test(value));
});
const demandQuestion=need=>demand.test(fold([need?.metric,need?.sectionTitle].join(' ')));

export function supportsBuyerDemand(need,quotes){
 const metric=fold(need.metric);
 // A title can group population, usage and demand. The metric decides
 // whether the purchasing-evidence requirement applies to this question.
 const intent=demand.test(metric)&&(!/\bbeklenti\p{L}*\b/u.test(metric)||demand.test(fold(need.sectionTitle)));
 return !intent||quotes.some(hasBuyerEvidence);
}

export const supportsStatisticalNeed=(need,cards)=>statisticalNeedSupported(need,cards,{buyerEvidence:cards.some(card=>hasBuyerEvidence(card.quote))});

export function qualifyScopedFinding(row,cards,needs,{excludeLiteral=false,contentQuality=false,statisticalScope=false}={}){
 if(!readableFinding(row.observation)||excludeLiteral&&cards.some(card=>key(card.quote)===key(row.observation)))return null;
 const consent=row.needIds?.some(id=>consentEvidenceRequested(needs?.get(id)));
 if(contentQuality&&(researchGapStatement(row.observation,{sources:cards})||
  !substantiveEvidence(row.observation,{preserveConsent:consent})||
  cards.length&&!cards.some(card=>substantiveEvidence(card.quote,{preserveConsent:consent}))))return null;
 if(statisticalScope&&[row.observation,row.analysis].some(value=>statisticalScopeIssue(value,cards,
  {checkCommercial:true,buyerEvidence:cards.some(card=>hasBuyerEvidence(card.quote))})))return null;
 const linkedDemand=(row.needIds||[]).filter(id=>demandQuestion(needs?.get(id)));
 const claim=fold(row.observation);
 const headingIsDemand=demand.test(fold(row.sectionTitle||row.section));
 if(!linkedDemand.length&&!headingIsDemand&&!demand.test(claim))return row;
 if(cards.some(card=>hasBuyerEvidence(card.quote)))return row;
 if(demand.test(claim))return null;
 if(usage.test(claim)){
  const needIds=(row.needIds||[]).filter(id=>!linkedDemand.includes(id));
  const analysis=demand.test(fold(row.analysis))?'Kaynak, ürün veya hizmetin kullanım biçimini açıklıyor.':row.analysis;
  return {...row,needIds,analysis,...(headingIsDemand?{section:'Kullanım ve uygulama',sectionTitle:'Kullanım ve uygulama'}:{})};
 }
 return row;
}

const terms=text=>new Set(key(text).split(' '));
const polarity=/\b(?:no|not|never|without|yok\p{L}*|degil\p{L}*|olmadi\p{L}*|azaldi\p{L}*|artti\p{L}*|decreased|increased|risen|fell)\b/gu;
const quantities=text=>numericEvidence(text,{locale:'tr',claims:true}).map(n=>n.number).sort().join();
export function repeatedFinding(text,other){
 const left=terms(text),right=terms(other);
 if(quantities(text)!==quantities(other))return false;
 if(key(text)===key(other))return true;
 if(left.size<8||right.size<8)return false;
 if((fold(text).match(polarity)||[]).sort().join()!==(fold(other).match(polarity)||[]).sort().join())return false;
 const shared=[...left].filter(word=>right.has(word)).length;
 return shared/(left.size+right.size-shared)>=0.85;
}

export function customerFinding(finding,audit={}){
 if(!finding||finding.kind==='brief')return false;
 const needs=new Map((Array.isArray(audit.verifiedResearch?.metrics)?audit.verifiedResearch.metrics:[]).map(metric=>[metric.id,metric]));
 const consent=(Array.isArray(finding.researchNeedIds)?finding.researchNeedIds:[]).some(id=>consentEvidenceRequested(needs.get(id)));
 const sources=Array.isArray(audit.sources)?audit.sources:[];
 const cards=(Array.isArray(finding.sourceIds)?finding.sourceIds:[]).map(id=>sources.find(source=>source?.id===id)).filter(source=>typeof source?.quote==='string');
 if([finding.statement,finding.impact].some(value=>statisticalScopeIssue(value,cards,
  {checkCommercial:true,buyerEvidence:cards.some(card=>hasBuyerEvidence(card.quote))})))return false;
 if(researchGapStatement(finding.statement,{sources:cards})||!substantiveEvidence(finding.statement,{preserveConsent:consent})||
  cards.length&&!cards.some(card=>substantiveEvidence(card.quote,{preserveConsent:consent})))return false;
 if(!finding.researchEvidenceOnly)return true;
 // Older handoffs used the same flag for loose excerpts and for structured
 // market measurements. Retain only a measurement supported by that task.
 return readableFinding(finding.statement)&&(audit.verifiedResearch?.metrics||[]).some(metric=>
  finding.researchNeedIds?.includes(metric.id)&&(metric.marketMeasures||[]).some(measure=>
   !!measure.amount&&!!measure.year&&finding.statement.includes(measure.amount)&&finding.statement.includes(measure.year)&&
   finding.sourceIds?.some(id=>measure.sourceIds?.includes(id))&&marketObservationSupported(finding.statement,[{...measure,passage:measure.geography||''}])));
}
