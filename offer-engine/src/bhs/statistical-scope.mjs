import {numericEvidence} from './numeric-evidence.mjs';
import {evidenceGeographies} from './scoped-market.mjs';

const fold=value=>String(value||'').normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replaceAll('ı','i');
const sentences=new Intl.Segmenter('en',{granularity:'sentence'});
const unique=items=>[...new Set(items)];
const number=value=>numericEvidence(value,{claims:true})[0]?.number;
const rates=text=>[...String(text).matchAll(/(?:%\s*|yüzde\s+)(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:%|percent\b)/giu)]
 .map(match=>({value:number(match[1]||match[2]),start:match.index,end:match.index+match[0].length}));
const periods=text=>unique([...String(text).matchAll(/\b(?:19|20)\d{2}(?:-\d{2}-\d{2}|\s*\/\s*(?:\d{4}|\d{2})|\s*[–-]\s*(?:\d{4}|\d{2}))?\b/gu)]
 .map(match=>match[0].replace(/\s+/gu,'').replace(/^(\d{4})[–-](\d{4})$/u,'$1/$2')
  .replace(/^(\d{2})(\d{2})\/(\d{2})$/u,'$1$2/$1$3')));
const populationTypes=[
 ['pupils',/\b(?:pupils?|students?|schoolchildren|ogrenci\p{L}*|cocuk\p{L}*)\b/gu],
 ['patients',/\b(?:patients?|hasta\p{L}*)\b/gu],
 ['employees',/\b(?:employees?|workers?|calisan\p{L}*|isciler\p{L}*)\b/gu],
 ['respondents',/\b(?:respondents?|participants?|katilimci\p{L}*|ankete katilan\p{L}*)\b/gu],
 ['households',/\b(?:households?|hane\p{L}*)\b/gu],
 ['customers',/\b(?:customers?|buyers?|consumers?|users?|musteri\p{L}*|alici\p{L}*|tuketici\p{L}*|kullanici\p{L}*)\b/gu],
 ['institutions',/\b(?:nurseries|nursery|schools?|institutions?|providers?|hospitals?|clinics?|firms?|companies|kres\p{L}*|anaokul\p{L}*|okul\p{L}*|kurum\p{L}*|hastane\p{L}*|klinik\p{L}*|sirket\p{L}*)\b/gu]
];
const institutionTypes=[
 ['nursery',/\b(?:nurseries|nursery|preschool|kres\p{L}*|anaokul\p{L}*|okul oncesi)\b/u],
 ['hospital',/\b(?:hospitals?|hastane\p{L}*)\b/u],
 ['clinic',/\b(?:clinics?|klinik\p{L}*)\b/u]
];
const cohorts=[
 ['non_state_funded',/\b(?:non[ -]state[ -]funded|not state[ -]funded|devlet destegi olmayan)\b/u],
 ['state_funded',/\b(?:state[ -]funded|government[ -]funded|publicly[ -]funded|devlet destekli|devlet tarafindan finanse|kamu tarafindan finanse)\b/u],
 ['private',/\b(?:private|independent)\s+(?:nurseries|nursery|schools?|institutions?|providers?|hospitals?|clinics?|firms?|companies)\b|\bozel\s+(?:kres\p{L}*|anaokul\p{L}*|okul\p{L}*|kurum\p{L}*|hastane\p{L}*|klinik\p{L}*|sirket\p{L}*)\b/u],
 ['regular_customers',/\b(?:(?:frequent|regular|loyal)\s+(?:users?|customers?|buyers?)|duzenli\s+(?:kullanan|satin alan|musteri\p{L}*)|sadik musteriler)\b/u]
];
// Vocabulary for observed source scope, never a list of markets to research.
const countryCodes=['TR','FR','DE','US','CA','AU','IE','NL','BE','ES','IT','PT','CH','AT','SE','NO','DK','FI','PL','CZ','GR','AE','SA','IN','CN','JP','BR','MX'];
const regionNames=['en','tr'].map(locale=>new Intl.DisplayNames([locale],{type:'region'}));
const countryNames=countryCodes.map(code=>[code,regionNames.map(names=>fold(names.of(code)))]);
const escaped=value=>value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
function geographies(text){
 const folded=fold(text);
 return [...evidenceGeographies(text),...countryNames.filter(([,names])=>names.some(name=>new RegExp('(?<![\\p{L}\\p{N}])'+escaped(name)+'(?![\\p{L}\\p{N}])','u').test(folded))).map(([code])=>code)];
}
function classes(text,types){return types.filter(([,pattern])=>pattern.test(fold(text))).map(([id])=>id);}
function cohortClasses(text){
 const found=classes(text,cohorts);
 return found.includes('non_state_funded')?found.filter(id=>id!=='state_funded'):found;
}
function denominator(text,rate){
 const value=fold(text),after=value.slice(rate.end),before=value.slice(0,rate.start);
 const forward=/^\s*(?:of\b|of the\b)/u.test(after);
 const hits=populationTypes.flatMap(([id,pattern])=>[...(forward?after:before).matchAll(pattern)].map(match=>({id,at:match.index,end:match.index+match[0].length})));
 if(hits.length)return hits.sort((a,b)=>forward?a.at-b.at:b.end-a.end)[0].id;
 const fallback=populationTypes.flatMap(([id,pattern])=>[...after.matchAll(pattern)].map(match=>({id,at:match.index})));
 return fallback.sort((a,b)=>a.at-b.at)[0]?.id;
}
function contexts(text){
 text=String(text||'').normalize('NFKC').replace(/\s+/gu,' ').trim();
 const found=rates(text),segments=[...sentences.segment(text)];
 return found.map((rate,index)=>{
  const segment=segments.find(row=>row.index<=rate.start&&row.index+row.segment.length>rate.start);
  const prior=found[index-1],next=found[index+1];
  const start=Math.max(segment?.index||0,prior&&prior.end<=rate.start?prior.end:0);
  const end=Math.min(segment?segment.index+segment.segment.length:text.length,next?.start??text.length);
  const local=text.slice(start,end);
  const previous=segments[segments.indexOf(segment)-1]?.segment;
  const heading=previous&&!rates(previous).length&&previous.length<=180?previous:'';
  return {...rate,text:local,heading,denominator:denominator(local,{...rate,start:rate.start-start,end:rate.end-start})};
 });
}
function sourceScopes(cards){
 return cards.filter(card=>card&&!card.metadataOnly&&!['search-snippet','html-signals'].includes(card.method||card.verification?.method)).flatMap(card=>contexts(card.quote||'').map(context=>{
  const group=context.heading+' '+context.text;
  const population=context.denominator;
  const qualifiers=cohortClasses(group),institutions=classes(group,institutionTypes);
  return {...context,population,qualifiers,institutions,periods:periods(group),
   geographies:geographies(context.text).length?geographies(context.text):geographies(context.heading).length?geographies(context.heading):geographies(card.title||''),
   needsIndicator:/\b(?:sen|send|ehc|special educational needs|prevalence|disabilit\p{L}*|ozel egitim|yayginlik|egitim ihtiyaci)\b/u.test(fold(group))};
 })).filter(scope=>scope.population||scope.qualifiers.length||scope.needsIndicator);
}
function commercialAssertion(text){
 return [...sentences.segment(text||'')].some(({segment})=>{
  const value=fold(segment);
  const claim=/\b(?:high demand|strong demand|purchase intent|commercial demand|market demand|satin alma tale[pb]\p{L}*|yuksek tale[pb]\p{L}*|guclu tale[pb]\p{L}*|satin alma iste\p{L}*|satin aliyor\p{L}*|satin alacag\p{L}*)\b/u.test(value);
  const qualified=/\b(?:hypothes\p{L}*|hipotez\p{L}*|could|might|may|olabilir|sinan(?:mali|abilir|acak)\p{L}*|test (?:et|edil|this|whether)\p{L}*|to test|dogrulan(?:mali|abilir|acak)\p{L}*|kanitlamaz|gostermez|cikarilamaz|does not|doesn't|not evidence)\b/u.test(value);
  return claim&&!qualified;
 });
}

// Scope restrictions are associated with the same rate's local source context.
// Another row/source cannot donate its year, pupil denominator or ownership.
export function statisticalScopeIssue(value,cards,{checkCommercial=false,buyerEvidence=false}={}){
 const scopes=sourceScopes(cards);
 if(!scopes.length)return;
 for(const claim of contexts(value||'')){
  const matching=scopes.filter(scope=>scope.value===claim.value);
  if(!matching.length)continue; // The existing number/unit gates handle unknown quantities.
  const group=claim.heading+' '+claim.text,geo=geographies(group),time=periods(group),funding=cohortClasses(group),institution=classes(group,institutionTypes);
  const fits=matching.some(scope=>{
   if(scope.population&&claim.denominator!==scope.population)return false;
   if(scope.qualifiers.some(id=>!funding.includes(id))||funding.some(id=>!scope.qualifiers.includes(id)))return false;
   if(scope.institutions.some(id=>!institution.includes(id))||institution.some(id=>!scope.institutions.includes(id)))return false;
   if(scope.geographies.length&&(!geo.length||geo.some(id=>!scope.geographies.includes(id))))return false;
   if(scope.periods.length?(!time.length||time.some(period=>!scope.periods.includes(period))):time.length>0)return false;
   return true;
  });
  if(!fits)return 'statistical_scope_unconfirmed';
 }
 if(checkCommercial&&!buyerEvidence&&scopes.some(scope=>scope.needsIndicator)&&commercialAssertion(value))return 'unsupported_commercial_demand';
}

export function statisticalNeedSupported(need,cards,{buyerEvidence=false}={}){
 const scopes=sourceScopes(cards);
 if(!scopes.length||cards.some(card=>!sourceScopes([card]).length))return true;
 const request=[need.target,need.metric,need.expected].filter(Boolean).join(' ');
 const geo=geographies(need.market||''),funding=cohortClasses(request),institutions=classes(request,institutionTypes);
 const requestedPeriods=periods([need.metric,need.period].filter(Boolean).join(' '));
 const named=populationTypes.filter(([,pattern])=>new RegExp(pattern.source,'u').test(fold([need.metric,need.expected].join(' ')))).map(([id])=>id);
 const people=named.filter(id=>id!=='institutions');
 const population=people[0]||(named.includes('institutions')&&/\b(?:count|number of|sayisi|percentage|proportion|orani)\b/u.test(fold(need.metric))?'institutions':undefined);
 if(!buyerEvidence&&scopes.every(scope=>scope.needsIndicator)&&commercialAssertion(request))return false;
 return scopes.some(scope=>(!population||scope.population===population)&&requestedPeriods.every(period=>scope.periods.includes(period))&&geo.every(id=>scope.geographies.includes(id))&&funding.every(id=>scope.qualifiers.includes(id))&&
  institutions.every(id=>scope.institutions.includes(id)));
}

export const statisticalScopeInstruction='Her sayısal bulguda yalnız tutarı değil kaynağın ölçtüğü grubu ve sınırları da koru: veri dönemi, coğrafya, kurum/kanal türü, örneklem ve payda. Öğrencilerin oranını kurumların oranına; devlet destekli kurumu özel kuruma; tek ülke/bölgeyi daha geniş pazara dönüştürme. Yayımlanma veya erişim tarihini veri dönemi sayma. Örneğin İngiltere devlet destekli nursery öğrencilerinin destek ihtiyacı, özel kreşlerin veya UK genelinin satın alma talebi değildir. Eğitim, sağlık veya kullanım ihtiyacını ticari talep, bütçe, sipariş ya da satın alma niyeti gibi sunma. Böyle bir veri hedefe ilişkin bir hipotezi veya pilotu gerekçelendirebilir; ticari çıkarımı açıkça hipotez olarak ayır ve gerekli alıcı kanıtını sor. Daha dar bir kaynak hedef pazarı tamamlamıyorsa kaynaklı alt bulguyu koru, ihtiyacı açık bırak. Sayıyı verdiğin gözlem cümlesinde kaynakta açık olan dönem, coğrafya, kurum türü ve paydayı da yaz. Alıntıyı bu kısıtları gösterecek kesintisiz bölümden seç. Çıktı sözleşmesi dışında alan ekleme.';
