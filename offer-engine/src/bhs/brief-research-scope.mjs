import {arr,obj,str} from './sequential-contracts.mjs';
import {isReadEvidence} from './research-content.mjs';
import {researchHost} from './research-url.mjs';

const briefFields=['goals','needs','services','meetingNotes'];
const text=limit=>({...str(limit),minLength:1});
export const briefScopeSchema=obj({market:str(120),audience:str(120),objective:text(220),
 fulfilment:{type:'string',enum:['local','cross_border','unspecified']},
 decisions:arr(obj({id:text(20),decision:text(140),field:{type:'string',enum:briefFields},quote:text(240)}),12)});
export const scopedNeedFields={decisionId:text(20),
 tradeEvidenceId:str(44),tradeResearch:{type:'boolean'}};

export const interpretBriefScope='scope alanında teklif için seçilen hedef pazarı, alıcı grubunu ve amacı ayrı kaydet. Pazar veya alıcı belirtilmemişse ilgili alan boş olsun. Brief teslimatı ülke içiyle veya çalışmayı açıkça yerel satışla sınırlıyorsa fulfilment local yaz. Bu çalışma için ülkeler arası satış veya sevkiyat açıkça belirtilmişse cross_border, diğer durumda unspecified yaz. Bir ülke pazarına satış hedefi tek başına sınır ötesi hareket göstermez. Briefteki önceki veya elenen seçenekleri seçilen kapsama alma. decisions ile teklifin içine girecek somut kararları kısa ve ayrı kaydet. Her kararın hangi brief alanına dayandığını ve o alandan aynen alınmış kısa quote değerini ver. Bu adımda sorgu, görev veya araç seçme.';
export const planWithinBrief='Her ölçüm için briefScope.decisions içinden ilgili teklif kararının id değerini decisionId olarak yaz. Ölçümün hedefi, pazarı ve sorgusu o kararı yanıtlasın. Marka ülkesi, üretim yeri, sevkiyat çıkışı ve hedef pazar ayrı bilgilerdir. Hedef pazar veya üretim yerinden sevkiyat rotası çıkarma. İthalat, ihracat, gümrük veya uluslararası sevkiyat görevi için tradeResearch true yaz ve yalnız bu briefteki ticari işe uygulanan, rotayı destekleyen tradeEvidence kaydının id değerini tradeEvidenceId alanına koy. Böyle bir dayanak bulunmuyorsa veya çalışma yerel satışla sınırlıysa bu görevi açma. Genel gümrük bilgisi veya markanın başka ülkelere satış yapması dayanak oluşturmaz. Yerel ürün güvenliği, iç teslimat ve yerel satış görevleri için tradeResearch false ve tradeEvidenceId boş olsun.';

const compact=value=>String(value||'').replace(/\s+/g,' ').trim();
const fold=value=>compact(value).toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').replace(/ı/g,'i').replace(/[’‘]/g,"'");
const tradeTopics=[
 /\b(?:customs(?:\s+\w+){0,2}\s+(?:duty|duties|declaration|clearance|process(?:es)?|tariff)|tariff code|import(?:ation)?\s+(?:duty|duties|vat|tax|regulations?|requirements?|clearance|declarations?|rules?))\b/u,
 /\b(?:gumruk\w*|ithalat(?:i|ta|tan)?|ihracat(?:i|ta|tan)?|sinir\s+otesi|douane|droits? d'importation|zoll|einfuhrumsatzsteuer|einfuhr|grenzuberschreitend)\b/u
];
const routePatterns=[
 /\b(?:ship\w*|deliver\w*|dispatch\w*|freight|(?:import|export)\w*\s+(?:goods|products|stock|shipments|samples|toys|equipment))\b.{0,70}\b(?:from\b.{1,55}\b(?:to|into)|to\b.{1,55}\bfrom)\s+\p{L}/u,
 /\b\w+'(?:den|dan|ten|tan)\s+(?:\w+\s+){0,4}\w+'(?:e|a|ye|ya|ne|na)\s+(?:\w+\s+){0,3}(?:sevkiyat\w*|gonder\w*|teslim\w*|satis\w*|tasi\w*)\b/u,
 /\b(?:expedi\w*|livr\w*|export\w*)\b.{0,70}\bdepuis\b.{1,55}\bvers\s+\p{L}|\b(?:ausfuhr|versand)\b.{0,70}\baus\b.{1,55}\bnach\s+\p{L}/u
];
const movementPatterns=[...routePatterns,
 /\b(?:cross[ -]border\s+(?:sales?|shipping|delivery|trade|fulfilment|fulfillment)|international\s+(?:shipping|delivery|freight)|uluslararasi\s+(?:sevkiyat|teslimat)|(?:sevkiyat|gonder\w*|teslim\w*)\b.{0,30}\byurt\s+dis\w*)\b/u,
 /\b(?:import|export)\w*\s+(?:goods|products|stock|shipments|samples|toys|equipment)\b.{0,70}\b(?:from|to|into)\s+\p{L}/u
];
const excludedTrade=[
 /\b(?:no\s+(?:cross[ -]border|international shipping|imports?|exports?)|(?:do not|does not|will not|\w+n't|never|cannot|not)\s+(?:\w+\s+){0,2}(?:import|export|ship|deliver|dispatch)\w*)\b/u,
 /\b(?:ithalat|ihracat|sevkiyat|gonderim)\s+(?:yok|olmayacak|yapilmayacak|planlanmiyor|kapsam disi)\b/u
];
const proposedTrade=/\b(?:plans? to|planning to|intend\w* to|future|may|might|would|hypothetical|planlan\w*|ongor\w*|hedeflen\w*)\b/u;
const tradePatterns=[...movementPatterns,...tradeTopics];
const matchesTrade=(value,patterns)=>patterns.some(pattern=>pattern.test(value));

export function checkedBriefScope(scope,brief){
 const ids=new Set(),decisions=scope.decisions.filter(row=>{
  const quote=compact(row.quote);
  if(!/^[\w-]+$/u.test(row.id)||ids.has(row.id)||!row.decision.trim()||quote.length<3||
   !briefFields.includes(row.field)||!compact(brief[row.field]).includes(quote))return false;
  ids.add(row.id);
  return true;
 });
 return {...scope,decisions};
}

export function briefTradeEvidence(scope,brief,packet){
 if(scope.fulfilment==='local')return [];
 const relevant=(value,patterns)=>{const normalized=fold(value);return !matchesTrade(normalized,excludedTrade)&&matchesTrade(normalized,patterns);};
 const declared=scope.decisions.filter(row=>relevant(row.quote,tradePatterns))
  .map(row=>({id:'brief:'+row.id,decisionId:row.id,quote:row.quote}));
 const brand=fold(brief.brandName),host=researchHost(brief.website);
 const sources=(packet?.sources||[]).filter(isReadEvidence).flatMap(source=>{
  const url=source.finalUrl||source.url;
  if(researchHost(url)!==host&&!fold(source.title).includes(brand))return [];
  return source.excerpts.flatMap((excerpt,index)=>{
   const quote=excerpt.text.slice(0,480);
   return relevant(quote,routePatterns)&&!proposedTrade.test(fold(quote))?[{id:`source:${source.id}:${index}`,url,quote}]:[];
  });
 });
 return [...declared,...sources.slice(0,6)];
}

export function initialNeedMatchesBrief(need,scope,tradeEvidence){
 if(!scope.decisions.some(row=>row.id===need.decisionId))return false;
 const task=fold([need.metric,need.query,need.expected,need.sectionTitle].join(' '));
 if(!need.tradeResearch&&!need.tradeEvidenceId&&!matchesTrade(task,tradePatterns))return true;
 return tradeEvidence.some(row=>row.id===need.tradeEvidenceId&&(!row.decisionId||row.decisionId===need.decisionId));
}
