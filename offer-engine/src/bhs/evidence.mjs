import {createHash} from 'node:crypto';
import {createPublicFetcher} from '../network.mjs';
import {extractPdfText} from './pdf.mjs';
import {plainHtml,normalized,publicUrl} from './verify.mjs';
import {briefHash} from './brief.mjs';
import {packetBrandIdentity} from './identity.mjs';
import {parseSourcePlan} from './source-plan.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const evidenceHash=packet=>digest(packet);
const host=url=>new URL(url).hostname.replace(/^www\./,'');
const blockedText=text=>/verify you are human|checking your browser|access denied|captcha|just a moment|bir hata oluştu!|beklenmedik bir hata meydana geldi/i.test(text.slice(0,1500));
const relevance=/hakkımızda|kurumsal|about|company|bayi|dealer|servis|service|yatırımcı|investor|faaliyet|annual|finansal|financial|product|ürün|shop|store|pricing|price|fiyat|review|yorum|career|kariyer|job|contact|iletişim|shipping|delivery|return|iade|subscription|subscribe|blog|faq/i;
export const evidenceTopics=[/revenue|profit|growth|funding|investment|ciro|büyüme|yatırım|fiyat|price|finans/gi,/team|employee|career|hiring|job|logistic|shipping|return|support|ekip|çalışan|kargo|iade|destek/gi,/cart|checkout|subscribe|subscription|newsletter|appointment|sepete|satın|randevu|abone|payment|trial/gi,/seo|search|traffic|website|social|instagram|tiktok|advert|reklam|takipçi|organic|content|içerik/gi,/review|rating|complaint|trustpilot|şikayet|yorum|puan|customer|müşteri/gi,/competitor|different|premium|market|rakip|farklı|pazar|position|konum/gi];
export function publicMetadata(html){
 const values=[];
 for(const m of html.matchAll(/<meta\b([^>]+)>/gi)){
  const attrs=Object.fromEntries([...m[1].matchAll(/([a-z:-]+)\s*=\s*(["'])([\s\S]*?)\2/gi)].map(a=>[a[1].toLowerCase(),a[3]]));
  if(['description','og:title','og:description'].includes((attrs.name||attrs.property||'').toLowerCase())&&attrs.content)values.push(normalized(plainHtml(Buffer.from(attrs.content))));
 }
 return [...new Set(values)].join(' ');
}
export function researchHtmlText(html){
 return normalized(plainHtml(Buffer.from(html.replace(/<(header|nav|footer|aside|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' '))));
}
export function sourceLinks(html,url){
 const links=[];
 for(const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)){
  const href=match[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];if(!href)continue;
  try{const target=new URL(href.replace(/&amp;/g,'&'),url);target.hash='';const value=publicUrl(target.href);const label=normalized(plainHtml(Buffer.from(match[2])));if(value&&relevance.test(label+' '+target.pathname))links.push({url:value,label:label.slice(0,200)});}catch{/* Ignore malformed links. */}
  if(links.length===80)break;
 }
 return links;
}
export function evidenceExcerpts(text,{maxChunks=7,size=1800}={}){
 const value=normalized(text),chunks=[];
 for(let offset=0;offset<value.length;offset+=Math.max(1,size-240)){chunks.push({id:'p'+chunks.length,text:value.slice(offset,offset+size),offset});if(chunks.length>=1200)break;}
 // Round-robin the methodology dimensions. Financial keywords must not crowd
 // out checkout, delivery, customer reviews or operational evidence on long pages.
 const selected=new Set(chunks.length?[0]:[]);
 const ranked=evidenceTopics.map(pattern=>chunks.map((chunk,i)=>({i,score:(chunk.text.match(pattern)||[]).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.i-b.i));
 for(let depth=0;selected.size<Math.min(maxChunks,chunks.length);depth++){
  let added=false;for(const group of ranked){const item=group.filter(x=>!selected.has(x.i))[0];if(item&&selected.size<maxChunks){selected.add(item.i);added=true;}}
  if(!added){for(let i=0;i<chunks.length&&selected.size<maxChunks;i++)selected.add(i);break;}
 }
 return [...selected].sort((a,b)=>a-b).map(i=>chunks[i]).filter(chunk=>chunk.text.length>=24);
}
export function assertEvidencePacket(packet,brief){
 if(packet?.version!=='sellf-evidence-v1'||packet.briefHash!==briefHash(brief)||!Array.isArray(packet.sources)||packet.sources.length>24||!packet.sources.length||JSON.stringify(packet).length>240000)throw Error('Kanıt paketi geçersiz.');
 const ids=new Set();
 for(const source of packet.sources){
  if(!/^ev\d+$/.test(source.id)||ids.has(source.id)||!publicUrl(source.url)||!publicUrl(source.finalUrl)||!['html','pdf','rendered','extracted'].includes(source.method)||!Array.isArray(source.excerpts)||!source.excerpts.length||source.excerpts.length>7)throw Error('Kanıt kaynağı geçersiz.');ids.add(source.id);
  if(source.excerpts.some(e=>typeof e.text!=='string'||e.text.length>1800||e.text.length<24))throw Error('Kanıt metni sınırı geçersiz.');
 }
 return packet;
}
export function assertCoreEvidence(packet,brief){
 if(!packetBrandIdentity(packet,brief))throw Error('Marka sitesinden veya alan adını bildiren resmî sicil kaynağından kimlik okunamadı.');
 const peerHosts=new Set(packet.entities.filter(e=>e.role==='competitor').map(e=>host(e.website)).filter(h=>packet.sources.some(s=>host(s.finalUrl)===h&&!s.metadataOnly)));
 if(peerHosts.size<3)throw Error('En az üç rakibin resmî kaynakları okunamadı.');
 return packet;
}
export function mergeExtractedEvidence(packet,extraction={}){
 const result=structuredClone(packet);
 for(const page of extraction.pages||[]){
  if(!publicUrl(page.url)||typeof page.text!=='string'||blockedText(page.text))continue;
  const excerpts=evidenceExcerpts(page.text);if(!excerpts.length)continue;
  const old=result.sources.findIndex(s=>s.url===page.url||s.finalUrl===page.url);
  const captured={id:old>=0?result.sources[old].id:'ev'+(Math.max(0,...result.sources.map(s=>Number(s.id.slice(2))))+1),url:page.url,finalUrl:page.url,title:old>=0?result.sources[old].title:new URL(page.url).hostname,method:'extracted',excerpts,contentHash:digest(normalized(page.text)),retrievedAt:new Date().toISOString(),scope:'Tavily advanced: araştırma sorgusuna göre seçilen sayfa kesitleri, sayfanın tamamı değildir.'};
  if(old>=0){if(result.sources[old].technicalSignals)captured.technicalSignals=result.sources[old].technicalSignals;result.sources[old]=captured;}else if(result.sources.length<24)result.sources.push(captured);
 }
 result.unavailable=[...(result.unavailable||[]),...(extraction.failed||[])].slice(0,80);return result;
}
export function createEvidenceCollector({read,render,clock=Date.now,timeout=100000,maxSources=24,onDiagnostic}={}){
 return async function collect(brief,sourcePlan,{extraSources=[]}={}){
  const plan=parseSourcePlan(sourcePlan),deadline=clock()+timeout;
  const fetchPage=read||createPublicFetcher({deadline,maxRequests:240,maxBytes:64*1024*1024});
  const queue=[],seen=new Set(),expandedHosts=new Set(),sources=[],unavailable=[],renderCandidates=[];
  const brandHost=host(brief.website),entityHosts=new Set(plan.entities.map(e=>{try{return host(e.website);}catch{return '';}}));entityHosts.add(brandHost);
  function enqueue(url,front=false){const value=publicUrl(url);if(value&&!seen.has(value)&&seen.size<128){seen.add(value);front?queue.unshift(value):queue.push(value);}}
  enqueue(brief.website);plan.entities.forEach(e=>enqueue(e.website));
  // Interleave the planner and every search topic, rather than reading only
  // the first twelve discovery links (which mostly repeat corporate pages).
  for(let i=0;i<Math.max(plan.sources.length,extraSources.length);i++){if(plan.sources[i])enqueue(plan.sources[i].url);if(extraSources[i])enqueue(extraSources[i]);}
  async function readSource(input){
   let url=input;
   for(let i=0;i<=3;i++){
    const response=await fetchPage(url);
    if([301,302,303,307,308].includes(response.status)&&response.headers.location){url=new URL(response.headers.location,url).href;continue;}
    if(response.status!==200){const error=Error('unavailable');error.code='HTTP_'+response.status;throw error;}
    const contentType=response.headers['content-type']||'';
    if(/application\/pdf/i.test(contentType)||response.body.subarray(0,10).includes(Buffer.from('%PDF-'))){const result=await extractPdfText(response.body);return {url:input,finalUrl:url,title:new URL(url).pathname.split('/').at(-1)||'Financial report',text:result.text,method:'pdf',pages:result.pages,links:[]};}
    if(!/text\/(html|plain)|application\/xhtml\+xml/i.test(contentType))throw Error('unsupported');
    const html=response.body.toString('utf8'),text=/html/.test(contentType)?researchHtmlText(html):normalized(html);
    const title=normalized(plainHtml(Buffer.from(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||new URL(url).hostname))).slice(0,300);
    if(blockedText(title+' '+text))throw Error('access_wall');
    const technicalSignals=/html/.test(contentType)?{https:new URL(url).protocol==='https:',navigation:sourceLinks(html,url).slice(0,20),mobileViewport:/<meta\b[^>]*name=["']viewport["']/i.test(html),platformHints:['shopify','woocommerce','wix','webflow','wordpress','magento'].filter(name=>new RegExp(name,'i').test(html)),analyticsTags:/googletagmanager\.com|google-analytics\.com|gtag\(/i.test(html),metaPixelTag:/connect\.facebook\.net|fbq\(/i.test(html),note:'Yalnız indirilen HTMLdeki etiket sinyalleri; çalışırlık, hız veya ölçüm doğrulaması değildir.'}:undefined;
    return {url:input,finalUrl:url,title,text,technicalSignals,metadata:publicMetadata(html),method:'html',links:/html/.test(contentType)?sourceLinks(html,url):[]};
   }
   throw Error('redirect_limit');
  }
  function keep(page){
   const excerpts=evidenceExcerpts(page.text);if(!excerpts.length||excerpts[0].text.length<24)return false;
   const previous=sources.findIndex(s=>s.finalUrl===page.finalUrl);if(previous>=0&&page.method!=='rendered')return false;
   const record={id:previous>=0?sources[previous].id:'ev'+(sources.length+1),url:page.url,finalUrl:page.finalUrl,title:page.title,method:page.method,excerpts,contentHash:digest(normalized(page.text)),retrievedAt:new Date(clock()).toISOString(),...(page.technicalSignals?{technicalSignals:page.technicalSignals}:{}),...(page.metadataOnly?{metadataOnly:true}:{}),...(page.pages?{pages:page.pages}:{})};
   if(JSON.stringify(sources).length+JSON.stringify(record).length>180000)return false;
   if(previous>=0)sources[previous]=record;else sources.push(record);return true;
  }
  while(queue.length&&sources.length+renderCandidates.length<maxSources&&clock()<deadline-22000){
   const batch=queue.splice(0,Math.min(8,maxSources-sources.length-renderCandidates.length));
   const results=await Promise.all(batch.map(async url=>{try{return {page:await readSource(url)};}catch(error){return {url,reason:/^[A-Z0-9_]{1,40}$/.test(error.code||'')?error.code:'source_unreadable'};}}));
   for(const result of results){
    if(!result.page){unavailable.push({url:result.url,reason:result.reason});continue;}
    const page=result.page;
    if(page.method==='html'&&((page.text.length<1200&&entityHosts.has(host(page.finalUrl)))||/kap\.org\.tr$/.test(host(page.finalUrl)))){if(!renderCandidates.some(p=>p.finalUrl===page.finalUrl))renderCandidates.push({...page,requiresRender:/kap\.org\.tr$/.test(host(page.finalUrl))});}
    else keep(page);
    const pageHost=host(page.finalUrl);
    if(entityHosts.has(pageHost)&&!expandedHosts.has(pageHost)){expandedHosts.add(pageHost);const links=page.links.filter(l=>entityHosts.has(host(l.url))).slice(0,pageHost===brandHost?4:2);for(const link of pageHost===brandHost?links.reverse():links)enqueue(link.url,pageHost===brandHost);}
   }
  }
  if(renderCandidates.length&&clock()<deadline-3000){
   const renderPages=render||(await import('./render-source.mjs')).renderEvidencePages;
   let pages=[];try{pages=await renderPages(renderCandidates.slice(0,4),{read:fetchPage,deadline,onDiagnostic:diagnostic=>unavailable.push(diagnostic)});}catch{unavailable.push({reason:'render_failed'});}
   pages.forEach(page=>{if(page.text?.length>=100&&!blockedText(page.title+' '+page.text)&&sources.length<maxSources)keep({...page,method:'rendered'});});
  }
  for(const page of renderCandidates)if(!sources.some(s=>s.url===page.url)){if(page.text.length>=100&&!page.requiresRender&&sources.length<maxSources)keep(page);else {unavailable.push({url:page.url,reason:'render_unavailable'});if(page.metadata?.length>=24&&sources.length<maxSources)keep({...page,text:page.metadata,metadataOnly:true});}}
  const packet={version:'sellf-evidence-v1',briefHash:briefHash(brief),asOf:new Date(clock()).toISOString().slice(0,10),entities:plan.entities,sources,unavailable:unavailable.slice(0,80)};
  onDiagnostic?.({sourceCount:sources.length,failures:unavailable.map(x=>({host:x.url?new URL(x.url).hostname:null,reason:x.reason}))});
  return assertEvidencePacket(packet,brief);
 };
}
export function evidenceSourceVerifier(packet){
 return async source=>{
  const record=packet.sources.find(s=>s.id===source.id&&s.finalUrl===source.url);
  if(!record)return {status:'not_in_evidence_packet'};
  const segments=[];
  for(const excerpt of [...record.excerpts].sort((a,b)=>(a.offset??Infinity)-(b.offset??Infinity))){
   const previous=segments.at(-1);
   if(previous&&Number.isInteger(excerpt.offset)&&Number.isInteger(previous.offset)&&previous.offset+previous.text.length===excerpt.offset)previous.text+=excerpt.text;
   else segments.push({...excerpt});
  }
  const matched=segments.some(e=>normalized(e.text).includes(normalized(source.quote)));
  return {status:matched?'quote_matched':'quote_not_found',finalUrl:record.finalUrl,format:record.method,pages:record.pages,contentHash:record.contentHash};
 };
}
