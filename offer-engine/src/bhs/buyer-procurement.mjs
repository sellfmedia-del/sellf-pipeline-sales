import {isReadEvidence} from './research-content.mjs';
import {evidenceGeographies} from './scoped-market.mjs';

const dimensions={
 decisionMaker:{label:'Satın alma karar vericisi',pattern:/\b(?:decid\w*|decision\w*|responsib\w*|authoriz\w*|authoris\w*|yetkili|sorumlu|karar|responsable)\b/u,
  hypothesis:'Kararı tek bir rolün verdiği varsayımını pilotta son alımı kimin başlattığını ve kimin karara bağladığını sorarak sınayın.'},
 approval:{label:'Satın alma onayı',pattern:/\b(?:approv\w*|sign[ -]off|onay\w*|imza\w*|visa|validat\w*|approbat\w*)\b/u,
  hypothesis:'Siparişten önce ayrı bir onay gerektiği varsayımını pilotta son alımın onay sırasını ve varsa yetki sınırlarını sorarak sınayın.'},
 channel:{label:'Satın alma kanalı',pattern:/\b(?:supplier\w*|framework\w*|portal\w*|catalog\w*|marketplace\w*|wholesal\w*|direct|directement|tedarikci\w*|toptanci\w*|pazaryer\w*|dogrudan|fournisseur\w*|grossiste\w*)\b/u,
  hypothesis:'İlk sipariş ile tekrar siparişte aynı kanalın kullanıldığı varsayımını pilotta son siparişin nereden ve nasıl verildiğini sorarak sınayın.'}
};
export const buyerDimensions=Object.keys(dimensions);
export const buyerPlanInstruction='Brief satın alma yapısını ticari karar için gerekli kılıyorsa alıcıları satın alma yetkisi ve yapısı değişen gruplara ayır. Örneğin bağımsız işletmeler ile bir zincire bağlı işletmeleri ayrı araştır. Her ilgili grupta son kararı kimin verdiği (decisionMaker), onay süreci (approval) ve fiilî sipariş/tedarik kanalı (channel) için ayrı, kısa görevler ve ayrı kimlikler kullan. buyerSegment alanına grubun kısa Türkçe adını, buyerSourceSegment alanına arama dilindeki karşılığını yaz. İkisinde de sektörü ve grup ayrımını belirt. Her sorguda yalnız o alıcı grubunu, hedef pazarı ve tek satın alma sorusunu araştır. Örnek işletmenin kendi satın alma şartları, yürürlükteki prosedürler ve alıcı davranışı araştırmalarına öncelik ver. Diğer görevlerde iki segment alanı boş ve buyingDimension none olsun.';
export const buyerReviewInstruction='Satın alma görevleri için buyerProcess alanına aynı görevdeki okunmuş kaynaktan kesintisiz bir özgün pasaj ve o pasajdaki alıcı grubu, geçerli coğrafya ve sorulan role, onaya ya da sipariş kanalına ilişkin kısa, anlamı tam ifade yaz. Üçü de pasajda aynen geçmeli ve birbirine bağlanmalı. Kaynak yalnız tek bir kurumu gösteriyorsa sample kapsamını value içinde kurumla birlikte belirt. Bir zincirin yetkisini bağımsız işletmelere taşıma. Birleşik Krallık hedefinde yalnız İngiltere kanıtı sınırlı gözlem olabilir. Daha dar pazarı yeterli sayma. Tedarikçi kataloğu tek başına alıcıların o kanalı kullandığını göstermez. Kanıt yoksa veya diğer görevlerde buyerProcess alanlarını boş bırak.';

const clean=value=>String(value||'').normalize('NFKC').replace(/\s+/gu,' ').trim();
const fold=value=>clean(value).toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replaceAll('ı','i');
const inText=(text,phrase)=>new RegExp('(?<![\\p{L}\\p{N}])'+phrase.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')+'(?![\\p{L}\\p{N}])','u').test(text);
const segmentTerms=value=>fold(value).replace(/\b(\w+)ies\b/gu,'$1y').replace(/\b(\w{3,})s\b/gu,'$1');
const ownership=label=>{
 const independent=/\b(?:independent\w*|bagimsiz\w*|independant\w*)\b/u.test(label);
 const chain=/\b(?:chains?|zincir\w*|multi[ -]site|multi[ -]academy|reseau\w*|chaines?)\b/u.test(label);
 return independent===chain?'':independent?'independent':'chain';
};
const coveredUK={'Birleşik Krallık':['Büyük Britanya','İngiltere','Galler','İskoçya','Kuzey İrlanda'],'Büyük Britanya':['İngiltere','Galler','İskoçya']};
const buyerAction={
 approval:/\b(?:approv\w*\s+(?:purchas\w*|orders?|requests?)|approval\s+(?:by|from|required)|(?:require\w*|obtain\w*)\s+(?:\w+\s+){0,2}approval|sign[ -]off|onay\w*\s+(?:gerek\w*|alin\w*|ver\w*)|(?:onay\w*|validat\w*|approbat\w*)\s+(?:de|par|avant))\b/u,
 channel:/\b(?:(?:purchas\w*|buy\w*|orders?)\s+(?:\w+\s+){0,3}(?:through|from|via|direct\w*|using)|(?:uzerinden|araciligiyla|kanaliyla|dogrudan)\s+(?:satin al\w*|siparis\w*)|(?:achats?|command\w*)\s+(?:\w+\s+){0,3}(?:via|aupres|directement))\b/u
};

export function buyerNeed(need){
 return Boolean(need?.buyerSegment?.trim()&&Object.hasOwn(dimensions,need.buyingDimension));
}

function marketScope(need,market,passage){
 const targets=evidenceGeographies(need.market),observed=evidenceGeographies(market),scope=evidenceGeographies(passage);
 if(observed.length===1&&scope.length===1&&scope[0]===observed[0]){
  if(targets.length===1)return targets[0]===observed[0]?'target':coveredUK[targets[0]]?.includes(observed[0])?'limited':null;
 }
 if(targets.length||scope.length)return null;
 const names=[];
 if(/^[A-Z]{2}$/u.test(need.country||''))for(const language of ['en','tr','fr']){
  names.push(new Intl.DisplayNames(language,{type:'region',fallback:'none'}).of(need.country));
 }
 const target=fold(need.market),actual=fold(market);
 const countryNames=names.filter(Boolean).map(fold);
 return target===actual||countryNames.includes(target)&&countryNames.includes(actual)?'target':null;
}

function validateClaim(need,proposed,quote){
 if(!buyerNeed(need)||!proposed)return null;
 const {segment,market,value,passage}=Object.fromEntries(['segment','market','value','passage'].map(key=>[key,clean(proposed[key])]));
 if(segment.length<3||segment.length>100||market.length<2||market.length>80||value.length<3||value.length>120||passage.length<24||passage.length>300||
  !clean(quote).includes(passage)||![segment,market,value].every(part=>inText(passage.toLowerCase(),part.toLowerCase())))return null;
 const wanted=segmentTerms(need.buyerSourceSegment||need.buyerSegment),actual=segmentTerms(segment),body=fold(passage);
 if(!inText(actual,wanted)||ownership(wanted)&&ownership(wanted)!==ownership(actual))return null;
 if(!/\b(?:purchas\w*|procur\w*|orders?|buy\w*|satin al\w*|siparis\w*|tedarik\w*|achats?|command\w*)\b/u.test(body)||!dimensions[need.buyingDimension].pattern.test(body))return null;
 if(buyerAction[need.buyingDimension]&&!buyerAction[need.buyingDimension].test(body))return null;
 if(ownership(actual)&&ownership(body)!==ownership(actual))return null;
 const scope=marketScope(need,market,passage);
 return scope?{segment,market,value,passage,coversTarget:scope==='target'}:null;
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
 return {needId:need.id,segment:need.buyerSegment,sourceSegment:need.buyerSourceSegment,dimension:need.buyingDimension,label,targetMarket:need.market,country:need.country,
  ...(sufficient?{}:{hypothesis}),...(process?{process}:{})};
}

export function groundBuyerProcurement(row,source){
 const {evidence,...detail}=row;
 if(!evidence)return detail;
 const need={buyerSegment:row.segment,buyerSourceSegment:row.sourceSegment,buyingDimension:row.dimension,market:row.targetMarket,country:row.country};
 const checked=source?.verification?.status==='quote_matched'&&isReadEvidence({method:source.verification.method})&&
  validateClaim(need,{...evidence,passage:source.quote},source.quote);
 return checked?{...detail,...(!checked.coversTarget?{hypothesis:detail.hypothesis||dimensions[row.dimension].hypothesis}:{}),
  evidence:{...evidence,coversTarget:checked.coversTarget}}:
  {...detail,hypothesis:dimensions[row.dimension]?.hypothesis||detail.hypothesis};
}
