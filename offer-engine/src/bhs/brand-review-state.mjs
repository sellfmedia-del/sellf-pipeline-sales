import {hash} from '../budget/ledger.mjs';
import {researchUrl} from './research-url.mjs';

const compact=value=>String(value||'').replace(/\s+/gu,' ').trim();
const queryKey=row=>hash([row.tool,compact(row.query).normalize('NFKC').toLowerCase().replaceAll('i\u0307','i')]);
const searchKey=row=>hash([queryKey(row),row.limit]);
const links=source=>[...(source.technicalSignals?.identityLinks||[]),...(source.technicalSignals?.navigation||[])];
const subject=brand=>hash([brand.name,researchUrl(brand.website)]);
const admissionFailures=new Set(['budget_limit','input_budget','model_budget','not_configured','fx_limit','fx_unavailable','tariff_expired','token_count','cancelled']);

// These are model-visible source fingerprints, not replacements for the full
// archived pages. Volatile IDs, timestamps and receipt charges are excluded.
export function brandReviewContext({brand,sources,hints,lookupReceipts,readReceipts,prior,visited}){
 const identity=subject(brand),saved=prior?.brandReview;
 const valid=saved?.version===1&&saved.subject===identity&&Array.isArray(saved.sources)&&
  saved.sources.every(row=>row&&typeof row.url==='string'&&typeof row.key==='string'&&/^[a-f0-9]{64}$/.test(row.key))&&
  Number.isSafeInteger(saved.readCount)&&saved.readCount>=0&&saved.readCount<=readReceipts.length&&
  Number.isSafeInteger(saved.lookupCount)&&saved.lookupCount>=0&&saved.lookupCount<=lookupReceipts.length;
 const previous=new Map(valid?saved.sources.map(row=>[row.url,row.key]):[]);
 const keyed=sources.map(source=>({source,key:hash({url:source.url,title:compact(source.title),
  excerpts:source.excerpts.map(compact),links:source.links.map(row=>({url:row.url,label:compact(row.label)}))
   .sort((a,b)=>a.url.localeCompare(b.url)||a.label.localeCompare(b.label))})}));
 const fresh=keyed.filter(({source,key})=>previous.get(source.url)!==key).map(row=>row.source);
 const retained=keyed.filter(({source,key})=>previous.get(source.url)===key).map(({source})=>({url:source.url,title:source.title}));
 const suppliedLinks=new Set(fresh.flatMap(source=>source.links.map(row=>researchUrl(row.url))));
 const available=new Map();
 for(const source of sources)for(const row of source.links){
  const url=researchUrl(row.url);
  if(url&&!visited.has(url)&&!suppliedLinks.has(url))available.set(url,{url,label:row.label});
 }
 const unseenHints=[...new Map(hints.filter(row=>!visited.has(researchUrl(row.url))).map(row=>[row.url,row])).values()];
 const canReuseUnderstanding=!saved||saved.subject===identity;
 return {sources:fresh,hints:unseenHints,lookupReceipts:valid?lookupReceipts.slice(saved.lookupCount):lookupReceipts,
  readReceipts:valid?readReceipts.slice(saved.readCount):readReceipts,canReuseUnderstanding,
  ...(retained.length?{retainedSources:retained}:{}),...(available.size?{availablePages:[...available.values()]}:{}),
  state:{version:1,subject:identity,sources:keyed.map(({source,key})=>({url:source.url,key})),
   lookupCount:lookupReceipts.length,readCount:readReceipts.length}};
}

// The discovery loop and worker preflight share this exact admission logic.
// A changed result count remains Claude's distinct, explicitly bounded request.
export function plannedBrandActions(packet,prior){
 const observed=new Set(packet.sources.flatMap(source=>[source.finalUrl||source.url,...links(source).map(row=>row.url)])
  .map(researchUrl).filter(Boolean));
 for(const hint of prior.hints||[]){const url=researchUrl(hint.url);if(url)observed.add(url);}
 const visited=new Set(prior.visited||packet.sources.map(source=>researchUrl(source.finalUrl||source.url)));
 const requested=(prior.value?.pages||[]).map(researchUrl).filter(Boolean),receipts=prior.readReceipts||[];
 const targets=requested.filter(url=>observed.has(url)&&!visited.has(url));
 const skippedPages=[...new Set(requested)].filter(url=>!targets.includes(url)&&
  (!observed.has(url)||receipts.some(row=>row.url===url&&row.status!=='read'))&&
  !receipts.some(row=>row.url===url&&row.status==='page_not_read'));
 const completed=new Set((prior.lookupReceipts||[]).filter(row=>!admissionFailures.has(row.issue)).map(searchKey));
 const unsettled=new Set((prior.lookupReceipts||[]).filter(row=>['budget_uncertain','budget_pending','provider_timeout'].includes(row.issue)).map(queryKey));
 const searches=(prior.value?.searches||[]).slice(0,targets.length?0:1).filter(row=>
  !(prior.lookedUp||[]).includes(hash([row.tool,row.query,row.limit]))&&!completed.has(searchKey(row))&&!unsettled.has(queryKey(row)));
 return {observed,visited,targets,skippedPages,searches};
}

export function brandDiscoveryNeedsWork(stage){
 const prior=stage?.brandDiscovery;
 if(!prior||!prior.value||!Array.isArray(stage?.packet?.sources))return true;
 if(prior.done)return false;
 const actions=plannedBrandActions(stage.packet,prior);
 return Boolean(actions.targets.length||actions.skippedPages.length||actions.searches.length);
}

export const brandStepInstruction='Yalnız markanın kimliğini, işini veya faaliyet biçimini anlamayı gerçekten değiştirecek açık bir soru varsa sonraki kaynağı seç. Marka briefi yorumlamaya yetecek kadar anlaşıldıysa pages ve searches boş olsun. Ürün varyantı/fiyat kıyası, rakip ölçümleri ve hedefe özgü ayrıntılı araştırmalar brief okunduktan sonraki planlama adımına aittir.';
export const incrementalBrandInstruction='Önceki marka anlayışı kayıtlı temel bağlamdır; onu sıfırdan oluşturma. sources yalnız yeni veya değişmiş metinlerdir; retainedSources işlenmiş sayfaların dizinidir, availablePages bunlardan gözlemlenmiş okunmamış bağlantılardır. Yeni kanıtla önceki doğrulanmış bilgileri birleştiren tam marka özetini yaz. Çelişki varsa kaynağa dayanarak düzelt ve belirsizliği belirt. Aynı bilgiler için başka sayfa veya eşdeğer sorgu isteme. priorPublishers doğrulanmış kurumsal bağlamdır; yalnız yeni yayıncı kanıtı veya düzeltme varsa publishers kaydı ekle. '+brandStepInstruction;
