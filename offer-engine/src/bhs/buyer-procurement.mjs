import {isReadEvidence} from './research-content.mjs';
import {evidenceGeographies} from './scoped-market.mjs';

const dimensions={
 decisionMaker:{label:'Satın alma karar vericisi',pattern:/\b(?:decid\w*|decision\w*|responsib\w*|authori[sz]\w*|yetkili\w*|sorumlu\w*|karar\w*|responsable\w*|zustandig\w*|entscheid\w*)\b/u,
  hypothesis:'Kararı tek bir rolün verdiği varsayımını pilotta son alımı kimin başlattığını ve kimin karara bağladığını sorarak sınayın.'},
 approval:{label:'Satın alma onayı',pattern:/\b(?:appro(?:u)?v\w*\s+(?:by|par|purchas\w*|orders?|requests?)|approval\s+(?:by|from|required)|(?:requir\w*|obtain\w*)\s+(?:\w+\s+){0,3}approval|sign[ -]off|onay\w*\s+(?:gerek\w*|alin\w*|ver\w*|tabi\w*)|onaylan\w*|(?:valid\w*|approbat\w*)\s+(?:de|par|avant)|genehmig\w*|freigab\w*)\b/u,
  hypothesis:'Siparişten önce ayrı bir onay gerektiği varsayımını pilotta son alımın onay sırasını ve varsa yetki sınırlarını sorarak sınayın.'},
 channel:{label:'Satın alma kanalı',pattern:/\b(?:(?:purchas\w*|buy\w*|orders?|achats?|command\w*)\s+(?:\w+\s+){0,3}(?:through|from|via|direct\w*|using|aupres)|(?:uzerinden|araciligiyla|kanaliyla|dogrudan)\s+(?:satin al\w*|siparis\w*|ver\w*)|(?:bestell\w*|einkauf\w*)\s+(?:\w+\s+){0,3}(?:uber|bei)|(?:uber|bei)\s+(?:\w+\s+){0,4}(?:bestell\w*|einkauf\w*))\b/u,
  hypothesis:'İlk sipariş ile tekrar siparişte aynı kanalın kullanıldığı varsayımını pilotta son siparişin nereden ve nasıl verildiğini sorarak sınayın.'}
};
export const buyerDimensions=Object.keys(dimensions);
export const buyerPlanInstruction='Brief satın alma yapısını ticari karar için gerekli kılıyorsa alıcıları satın alma yetkisi ve yapısı değişen gruplara ayır. Örneğin bağımsız işletmeler ile bir zincire bağlı işletmeleri ayrı araştır. Her ilgili grupta son kararı kimin verdiği (decisionMaker), onay süreci (approval) ve fiilî sipariş/tedarik kanalı (channel) için ayrı, kısa görevler ve ayrı kimlikler kullan. buyerSegment alanına grubun kısa Türkçe adını, buyerSourceSegment alanına arama dilindeki karşılığını yaz. İkisinde de sektörü ve grup ayrımını belirt. Her sorguda yalnız o alıcı grubunu, hedef pazarı ve tek satın alma sorusunu araştır. Örnek işletmenin kendi satın alma şartları, yürürlükteki prosedürler ve alıcı davranışı araştırmalarına öncelik ver. Diğer görevlerde iki segment alanı boş ve buyingDimension none olsun.';
export const buyerReviewInstruction='Satın alma görevlerinde pasaj olarak okunmuş kaynaktaki tam cümleyi kopyala. Cümle aynı alıcı grubunu, gözlenen coğrafyayı ve sorulan karar vericiyi, onayı ya da fiilî kanalı birlikte doğrulamalı. value alanına eylemi ve ilgili rolü veya kanalı birlikte gösteren kesintisiz ifadeyi yaz. Tek başına rol veya portal adı verme. Olumsuz, ileriye dönük, ihtimale bağlı ve başka alıcıya veya pazara ait ifadeleri olumlu kanıt sayma. Bir kurumun uygulamasını tüm gruba genelleme. Yalnız bölgesel kanıt varsa market alanına bölgenin kendi adını yaz; varsa ülke ilişkisini kuran ifadeyi de cümlede koru. Daha dar pazarı yeterli sayma. Tedarikçi kataloğu tek başına alıcıların o kanalı kullandığını göstermez. Kanıt yoksa veya diğer görevlerde alanları boş bırak.';

const clean=value=>String(value||'').normalize('NFKC').replace(/\s+/gu,' ').trim();
const fold=value=>clean(value).toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replaceAll('ı','i');
const inText=(text,phrase,boundary='\\p{L}\\p{N}')=>new RegExp('(?<!['+boundary+'])'+RegExp.escape(phrase)+'(?!['+boundary+'])','iu').test(text);
const inMarket=(text,market)=>inText(text,market,'\\p{L}\\p{N}\\p{Pd}');
const segmentTerms=value=>fold(value).replace(/\b(\w+)ies\b/gu,'$1y').replace(/\b(\w{3,})s\b/gu,'$1');
const ownership=label=>{
 const independent=/\b(?:independent\w*|bagimsiz\w*|independant\w*|unabhangig\w*)\b/u.test(label);
 const chain=/\b(?:chains?|zincir\w*|multi[ -]site|multi[ -]academy|reseau\w*|chaines?|filialkett\w*)\b/u.test(label);
 return independent===chain?'':independent?'independent':'chain';
};
const coveredUK={'Birleşik Krallık':['Büyük Britanya','İngiltere','Galler','İskoçya','Kuzey İrlanda'],'Büyük Britanya':['İngiltere','Galler','İskoçya']};
// Other subdivisions can be supported without an alias when the source names
// their parent jurisdiction together with the observed location.
const knownRegions={FR:['ile-de-france']};
const procurement=/\b(?:purchas\w*|procur\w*|orders?|buy\w*|satin al\w*|siparis\w*|tedarik\w*|achats?|command\w*|bestell\w*|einkauf\w*|beschaff\w*)\b/u;
const qualification=/\b(?:not|never|no longer|cannot|can['’]t|doesn['’]t|don['’]t|non|pas|jamais|aucun\w*|nicht|kein\w*|niemals|degil|yasak\w*|verilmez|vermez\w*|kullanilmaz|kullanmaz\w*|onaylanmaz|disinda|haric|except\w*|exclud\w*|prohibit\w*|unlike|whereas|rather than|tandis que|hors|sauf|oysa|wahrend|hingegen|ausgenomm\w*|would|might|plans?\s+to|propos\w*\s+to|will\s+(?:begin|start|switch|introduce|use|place|order|buy)|next year|prevu\w*|envisag\w*|prevoit|plane[nt]|planl\w*|ongor\w*|hedeflen\w*|beklen\w*)\b/u;
const sentences=new Intl.Segmenter('en',{granularity:'sentence'});

export function buyerNeed(need){
 return Boolean(need?.buyerSegment?.trim()&&Object.hasOwn(dimensions,need.buyingDimension));
}

function marketScope(need,market,sentence){
 const targets=evidenceGeographies(need.market),observed=evidenceGeographies(market),locations=evidenceGeographies(sentence);
 if(targets.length===1&&observed.length===1){
  const target=targets[0],location=observed[0];
  if(locations.some(place=>place!==location&&place!==target))return null;
  return target===location?'target':coveredUK[target]?.includes(location)?'limited':null;
 }
 if(observed.length||locations.some(place=>!targets.includes(place)))return null;
 const country=String(need.country||'').toUpperCase();
 const languages=new Set(['en','tr','fr','de',...(/^[a-z]{2}$/iu.test(need.language||'')?[need.language]:[])]);
 const countryNames=/^[A-Z]{2}$/u.test(country)?[...languages].map(language=>
  fold(new Intl.DisplayNames(language,{type:'region',fallback:'none'}).of(country))).filter(Boolean):[];
 const target=fold(need.market),actual=fold(market);
 if(target===actual||countryNames.includes(target)&&countryNames.includes(actual))return 'target';
 if(countryNames.includes(target)&&knownRegions[country]?.includes(actual))return 'limited';
 const parents=countryNames.includes(target)?countryNames:[target];
 return parents.some(parent=>parent&&new RegExp('(?<![\\p{L}\\p{N}\\p{Pd}])'+RegExp.escape(actual)+'(?:,\\s*|\\s*\\(|\\s+(?:in|en|au)\\s+)'+RegExp.escape(parent)+'(?![\\p{L}\\p{N}\\p{Pd}])','u').test(fold(sentence)))?'limited':null;
}

function validateClaim(need,proposed,quote){
 if(!buyerNeed(need)||!proposed)return null;
 const {segment,market,value,passage}=Object.fromEntries(['segment','market','value','passage'].map(key=>[key,clean(proposed[key])]));
 const text=clean(quote);
 if(segment.length<3||segment.length>100||market.length<2||market.length>80||value.length<3||value.length>120||passage.length<24||passage.length>300||!text.includes(passage))return null;
 const matching=[...sentences.segment(text)].map(({segment})=>segment.trim()).filter(statement=>
  passage.includes(statement)&&inText(statement,segment)&&inText(statement,value)&&inMarket(fold(statement),fold(market)));
 if(matching.length!==1)return null;
 const sentence=matching[0],wanted=segmentTerms(need.buyerSourceSegment||need.buyerSegment),actual=segmentTerms(segment),body=fold(sentence);
 const clauses=sentence.split(/;|,\s*(?:and|et|ve|und)\s+/iu);
 if(!clauses.some(clause=>inText(clause,segment)&&inText(clause,value)&&inMarket(fold(clause),fold(market))))return null;
 if(!inText(actual,wanted)||ownership(wanted)&&ownership(wanted)!==ownership(actual))return null;
 const proposition=fold(value);
 if(qualification.test(body)||!procurement.test(body)||!dimensions[need.buyingDimension].pattern.test(proposition))return null;
 if(/\b(?:by|from|through|via|using|de|par|aupres|bei|uber)(?:\s+(?:the|a|an|la|le|les|der|die|das))?[.!?]?$/u.test(proposition))return null;
 if(need.buyingDimension==='decisionMaker'&&/^(?:decid\w*\s+on|karar\s+ver\w*)\b/u.test(proposition))return null;
 if(need.buyingDimension!=='approval'&&!procurement.test(proposition))return null;
 if(ownership(actual)&&ownership(body)!==ownership(actual))return null;
 const scope=marketScope(need,market,sentence);
 return scope?{segment,market,value,passage:sentence,coversTarget:scope==='target'}:null;
}

export function verifiedBuyerProcess(need,proposed,ids,facts){
 if(!proposed?.proof||!ids.includes(proposed.proof))return null;
 const fact=facts.find(row=>row.id===proposed.proof&&row.needId===need.id&&isReadEvidence(row));
 const result=fact&&validateClaim(need,proposed,fact.quote);
 return result?{proof:fact.id,...result}:null;
}

export function buyerProcessDecision(need,decision,proposed,facts,saved){
 const current=verifiedBuyerProcess(need,proposed,decision.proofs,facts);
 const prior=verifiedBuyerProcess(need,saved?.buyerProcess,saved?.proofs||[],facts);
 const sufficient=Boolean(current?.coversTarget&&decision.sufficient||prior?.coversTarget&&saved.sufficient);
 const buyerProcess=(current?.coversTarget&&decision.sufficient?current:null)||(prior?.coversTarget?prior:null)||current||prior;
 return {...decision,sufficient,proofs:buyerProcess?[buyerProcess.proof]:[],...(buyerProcess?{buyerProcess}:{})};
}

export function buyerProcurementRow(need,process,sufficient){
 const {label,hypothesis}=dimensions[need.buyingDimension];
 return {needId:need.id,segment:need.buyerSegment,sourceSegment:need.buyerSourceSegment,dimension:need.buyingDimension,label,targetMarket:need.market,country:need.country,language:need.language,
  ...(sufficient?{}:{hypothesis}),...(process?{process}:{})};
}

export function groundBuyerProcurement(row,source,readContext){
 const {evidence,...detail}=row;
 if(!evidence)return detail;
 const need={buyerSegment:row.segment,buyerSourceSegment:row.sourceSegment,buyingDimension:row.dimension,market:row.targetMarket,country:row.country,language:row.language};
 const checked=source?.verification?.status==='quote_matched'&&isReadEvidence({method:source.verification.method})&&
  validateClaim(need,{...evidence,passage:source.quote},readContext||source.quote);
 return checked?{...detail,...(!checked.coversTarget?{hypothesis:detail.hypothesis||dimensions[row.dimension].hypothesis}:{}),
  evidence:{...evidence,coversTarget:checked.coversTarget}}:
  {...detail,hypothesis:dimensions[row.dimension]?.hypothesis||detail.hypothesis};
}
