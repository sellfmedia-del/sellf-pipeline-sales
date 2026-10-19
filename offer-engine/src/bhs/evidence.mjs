import {createHash} from 'node:crypto';
import {createPublicFetcher} from '../network.mjs';
import {extractPdfText} from './pdf.mjs';
import {plainHtml,normalized,publicUrl} from './verify.mjs';
import {briefHash} from './brief.mjs';
import {parseSourcePlan} from './source-plan.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const evidenceHash=packet=>digest(packet);
const host=url=>new URL(url).hostname.replace(/^www\./,'');
const blockedText=text=>/verify you are human|checking your browser|access denied|captcha|just a moment/i.test(text.slice(0,1500));
const relevance=/hakkımızda|kurumsal|about|company|bayi|dealer|servis|service|yatırımcı|investor|faaliyet|annual|finansal|financial/i;
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
 for(let offset=0;offset<value.length;offset+=size){chunks.push({id:'p'+chunks.length,text:value.slice(offset,offset+size),offset});if(chunks.length>=1200)break;}
 const financial=/finansal|bilanço|hasılat|gelir tablosu|brüt kâr|net dönem|nakit akış|revenue|gross profit|net income|cash flow|202[56]/gi;
 const scored=chunks.map((chunk,i)=>({chunk,i,score:(chunk.text.match(financial)||[]).length+(i<2?8:0)})).sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,maxChunks).sort((a,b)=>a.i-b.i);
 return scored.map(x=>x.chunk).filter(chunk=>chunk.text.length>=24);
}
export function assertEvidencePacket(packet,brief){
 if(packet?.version!=='sellf-evidence-v1'||packet.briefHash!==briefHash(brief)||!Array.isArray(packet.sources)||packet.sources.length>24||!packet.sources.length||JSON.stringify(packet).length>240000)throw Error('Kanıt paketi geçersiz.');
 const ids=new Set();
 for(const source of packet.sources){
  if(!/^ev\d+$/.test(source.id)||ids.has(source.id)||!publicUrl(source.url)||!publicUrl(source.finalUrl)||!['html','pdf','rendered'].includes(source.method)||!Array.isArray(source.excerpts)||!source.excerpts.length||source.excerpts.length>7)throw Error('Kanıt kaynağı geçersiz.');ids.add(source.id);
  if(source.excerpts.some(e=>typeof e.text!=='string'||e.text.length>1800||e.text.length<24))throw Error('Kanıt metni sınırı geçersiz.');
 }
 return packet;
}
export function createEvidenceCollector({read,render,clock=Date.now,timeout=100000,maxSources=24}={}){
 return async function collect(brief,sourcePlan){
  const plan=parseSourcePlan(sourcePlan),deadline=clock()+timeout;
  const fetchPage=read||createPublicFetcher({deadline,maxRequests:240,maxBytes:64*1024*1024});
  const queue=[],seen=new Set(),expandedHosts=new Set(),sources=[],unavailable=[],renderCandidates=[];
  const brandHost=host(brief.website),entityHosts=new Set(plan.entities.map(e=>{try{return host(e.website);}catch{return '';}}));entityHosts.add(brandHost);
  function enqueue(url,front=false){const value=publicUrl(url);if(value&&!seen.has(value)&&seen.size<80){seen.add(value);front?queue.unshift(value):queue.push(value);}}
  enqueue(brief.website);plan.entities.forEach(e=>enqueue(e.website));[...plan.sources].sort((a,b)=>Number(/\.pdf|finans|financial|faaliyet|annual|kap\.org/i.test(b.url))-Number(/\.pdf|finans|financial|faaliyet|annual|kap\.org/i.test(a.url))).forEach(s=>enqueue(s.url));
  async function readSource(input){
   let url=input;
   for(let i=0;i<=3;i++){
    const response=await fetchPage(url);
    if([301,302,303,307,308].includes(response.status)&&response.headers.location){url=new URL(response.headers.location,url).href;continue;}
    if(response.status!==200)throw Error('unavailable');
    const contentType=response.headers['content-type']||'';
    if(/application\/pdf/i.test(contentType)||response.body.subarray(0,10).includes(Buffer.from('%PDF-'))){const result=await extractPdfText(response.body);return {url:input,finalUrl:url,title:new URL(url).pathname.split('/').at(-1)||'Financial report',text:result.text,method:'pdf',pages:result.pages,links:[]};}
    if(!/text\/(html|plain)|application\/xhtml\+xml/i.test(contentType))throw Error('unsupported');
    const html=response.body.toString('utf8'),text=normalized(/html/.test(contentType)?plainHtml(response.body):html);
    const title=normalized(plainHtml(Buffer.from(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||new URL(url).hostname))).slice(0,300);
    if(blockedText(title+' '+text))throw Error('access_wall');
    return {url:input,finalUrl:url,title,text,method:'html',links:/html/.test(contentType)?sourceLinks(html,url):[]};
   }
   throw Error('redirect_limit');
  }
  function keep(page){
   const excerpts=evidenceExcerpts(page.text);if(!excerpts.length||excerpts[0].text.length<24)return false;
   const previous=sources.findIndex(s=>s.finalUrl===page.finalUrl);if(previous>=0&&page.method!=='rendered')return false;
   const record={id:previous>=0?sources[previous].id:'ev'+(sources.length+1),url:page.url,finalUrl:page.finalUrl,title:page.title,method:page.method,excerpts,contentHash:digest(normalized(page.text)),retrievedAt:new Date(clock()).toISOString(),...(page.pages?{pages:page.pages}:{})};
   if(JSON.stringify(sources).length+JSON.stringify(record).length>180000)return false;
   if(previous>=0)sources[previous]=record;else sources.push(record);return true;
  }
  while(queue.length&&sources.length+renderCandidates.length<maxSources&&clock()<deadline-12000){
   const batch=queue.splice(0,Math.min(4,maxSources-sources.length-renderCandidates.length));
   const results=await Promise.all(batch.map(async url=>{try{return {page:await readSource(url)};}catch{return {url};}}));
   for(const result of results){
    if(!result.page){unavailable.push({url:result.url,reason:'unavailable'});continue;}
    const page=result.page;
    if(page.method==='html'&&((page.text.length<1200&&entityHosts.has(host(page.finalUrl)))||/kap\.org\.tr$/.test(host(page.finalUrl)))){if(!renderCandidates.some(p=>p.finalUrl===page.finalUrl))renderCandidates.push(page);}
    else keep(page);
    const pageHost=host(page.finalUrl);
    if(entityHosts.has(pageHost)&&!expandedHosts.has(pageHost)){expandedHosts.add(pageHost);for(const link of page.links.slice(0,2))if(entityHosts.has(host(link.url)))enqueue(link.url,pageHost===brandHost);}
   }
  }
  if(renderCandidates.length&&clock()<deadline-3000){
   const renderPages=render||(await import('./render-source.mjs')).renderEvidencePages;
   let pages=[];try{pages=await renderPages(renderCandidates.slice(0,4),{read:fetchPage,deadline,onDiagnostic:diagnostic=>unavailable.push(diagnostic)});}catch{unavailable.push({reason:'render_failed'});}
   pages.forEach(page=>{if(page.text?.length>=100&&!blockedText(page.title+' '+page.text)&&sources.length<maxSources)keep({...page,method:'rendered'});});
  }
  for(const page of renderCandidates)if(!sources.some(s=>s.url===page.url)){if(page.text.length>=100&&sources.length<maxSources)keep(page);else unavailable.push({url:page.url,reason:'render_unavailable'});}
  const packet={version:'sellf-evidence-v1',briefHash:briefHash(brief),asOf:new Date(clock()).toISOString().slice(0,10),entities:plan.entities,sources,unavailable:unavailable.slice(0,80)};
  return assertEvidencePacket(packet,brief);
 };
}
export function evidenceSourceVerifier(packet){
 return async source=>{
  const record=packet.sources.find(s=>s.id===source.id&&s.finalUrl===source.url);
  if(!record)return {status:'not_in_evidence_packet'};
  const matched=record.excerpts.some(e=>normalized(e.text).includes(normalized(source.quote)));
  return {status:matched?'quote_matched':'quote_not_found',finalUrl:record.finalUrl,format:record.method,pages:record.pages,contentHash:record.contentHash};
 };
}
