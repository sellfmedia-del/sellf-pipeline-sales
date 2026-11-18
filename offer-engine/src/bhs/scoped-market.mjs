import {arr,obj,str} from './sequential-contracts.mjs';
import {numericEvidence} from './numeric-evidence.mjs';

export const marketMeasuresSchema=arr(obj({proof:str(28),amount:str(32),unit:str(48),year:str(4),category:str(110),passage:str(240)}),4);
export const marketMeasureInstruction='Sayısal pazar verisi istediğin işlerde marketMeasures alanına yalnız doğrudan okunmuş kaynaktaki tutarı, birimi, veri yılını, tam kategoriyi ve bunları aynı tablo satırına veya cümleye bağlayan KESİNTİSİZ özgün alıntıyı yaz. Yayımlanma tarihini veri yılı sayma. Başka kategorinin, başka yılın veya toplam satırının tutarını kullanma. Dört öğe tek alıntıda ilişkilendirilemiyorsa ölçümü açık bırak ve uygun kaynağı iste. Diğer işler için marketMeasures boş olsun.';

const normalize=value=>String(value||'').normalize('NFKC').replace(/\s+/gu,' ').trim();
const fold=value=>normalize(value).toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/ı/gu,'i');
const hasToken=(text,value)=>{
 const terms=value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return new RegExp('(?<![\\p{L}\\p{N}])'+terms+'(?![\\p{L}\\p{N}])','u').test(text);
};
const valueOf=text=>numericEvidence(text,{locale:'tr',claims:true})[0]?.number;
const years=text=>[...new Set(normalize(text).match(/(?<![\d.,])(?:19|20)\d{2}(?![\d]|[.,]\d)/gu)||[])];
const unitPattern=/(?:\b(?:try|tl|usd|eur|gbp|dolar|euro|avro|sterlin|ton|adet|metrekare|m2|yuzde|providers?|settings?|facilities|establishments?|nurseries|schools?|kre[sş]|kurum|isletme|tesis)\b|[%$€₺£])/iu;
const geographicScopes=[
 ['İngiltere',/\b(?:england|ingiltere)\b/u],['Büyük Britanya',/\b(?:great britain|buyuk britanya)\b/u],
 ['Birleşik Krallık',/\b(?:united kingdom|birlesik krallik|u\s?\.?k\.?)\b/u],
 ['Galler',/\b(?:wales|galler)\b/u],['İskoçya',/\b(?:scotland|iskocya)\b/u],
 ['Kuzey İrlanda',/\b(?:northern ireland|kuzey irlanda)\b/u]
];

export function evidenceGeographies(text){
 const value=fold(text).replaceAll('new england','').replaceAll('new south wales','');
 return geographicScopes.filter(([,pattern])=>pattern.test(value)).map(([name])=>name);
}

export function evidenceGeographySupported(observation,quotes){
 const scopes=new Set(quotes.flatMap(evidenceGeographies));
 const mentioned=evidenceGeographies(observation);
 return (!scopes.size||mentioned.length>0)&&mentioned.every(scope=>scopes.has(scope));
}

export function marketMeasureMatchesScope(need,measure){
 const requested=evidenceGeographies(need.market);
 const observed=evidenceGeographies(measure.passage);
 return requested.length!==1||observed.length===1&&observed[0]===requested[0];
}

export function marketMeasureNeed(need,includeCounts=false){
 const term=fold([need.section,need.metric,need.expected].join(' '));
 if(/ihracat|ithalat|export|import/.test(term))return !/gumruk|customs|mevzuat|regulation|belge|licence/.test(term);
 return /pazar|sektor|market|industry|marche|secteur/.test(term)&&(/buyuk|hacim|hacmi|pay[i ]|buyume|market size|market share|revenu|growth|volume|ciro|satis tutar/.test(term)||
  includeCounts&&/\b(?:sayisi|number of|count)\b/.test(term)&&/\b(?:providers?|settings?|facilities|establishments?|nurseries|schools?|kres|kurum|isletme|tesis)\b/.test(term));
}

export function verifyMarketMeasures(need,proposed,proofs,facts,includeCounts=false){
 if(!marketMeasureNeed(need,includeCounts))return [];
 const expectedYears=years([need.metric,need.period].join(' '));
 return (proposed||[]).flatMap(row=>{
  const source=facts.find(f=>f.id===row.proof&&f.needId===need.id&&proofs.includes(f.id));
  if(!source||source.metadataOnly||['search-snippet','html-signals'].includes(source.method))return [];
  const {amount,year,category,unit,passage}=Object.fromEntries(['amount','year','category','unit','passage'].map(k=>[k,normalize(row[k])]));
  if(!/^[+−-]?\d+(?:[\s.,]\d+)*$/u.test(amount)||!/^(?:19|20)\d{2}$/u.test(year)||amount===year||category.length<3||!unit||passage.length<24||passage.length>240||
   !normalize(source.quote).includes(passage)||expectedYears.length&&!expectedYears.includes(year))return [];
  const excerpt=fold(passage);
  if(![amount,year,unit,category].every(value=>hasToken(excerpt,fold(value)))||years(passage).join()!==year)return [];
  const quantities=numericEvidence(passage,{locale:'tr',claims:true}).filter(n=>n.number!==year);
  if(quantities.length!==1||!unitPattern.test(fold(unit))||![valueOf(amount),valueOf([amount,unit].join(' '))].includes(quantities[0].number))return [];
  return [{proof:source.id,amount,unit,year,category,passage}];
 });
}

export function marketObservationSupported(text,measures){
 const parsed=numericEvidence(text,{locale:'tr',claims:true}),periods=years(text),prose=fold(text);
 if(!parsed.length||!unitPattern.test(prose)&&parsed.every(n=>periods.includes(n.number)))return true;
 return measures.some(({amount,unit,year,category,passage})=>{
  const quantities=parsed.filter(n=>n.number!==year);
  return evidenceGeographySupported(text,[passage])&&periods.join()===year&&hasToken(prose,fold(category))&&hasToken(prose,fold(unit))&&quantities.length===1&&
   [valueOf(amount),valueOf([amount,unit].join(' '))].includes(quantities[0].number);
 });
}
