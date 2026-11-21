import {createPublicFetcher} from '../network.mjs';
import {plainHtml} from './verify.mjs';
import {publicResearchUrl} from './conversation-contract.mjs';

export const navigationVersion='observed-source-links-v1';
export const navigationWindowSize=40;
export const existingAssetGuidance='MEVCUT VARLIKTAN ÖNERİYE: Hedef için kanal, satış ağı, katalog veya başka bir varlık önereceksen önce mevcut durumunu anla. İlgili bağlantı/beyan gördüğünde önemli public soruyu ve pending adayı review_research ile kaydet; gerekli gövdeyi oku. Mevcut gözlem → hedefe göre açık → önerilen değişiklik ilişkisini aynı konuşmada koru. İyileştirme, etkinleştirme, genişletme ve yeni kurulum ihtiyacını ayrı değerlendir; mevcut yapı hizmeti kapsam dışına çıkarmaz. Bağlantı/listelenme güncel faaliyet, satış veya başarı kanıtı değildir. İncelenemeyen varlığı yok sayma; yeni kurulumu koşullu öner. Brief hedefi ile gözlem farklıysa ikisini koruyup farkı netleştir. Konuyu ve önceliği sen seç; her markaya zorunlu varlık listesi uygulama.';
export const navigationGuidance='BAĞLANTI KEŞFİ: links ile linkLabels aynı sıradaki hedef ve etiketlerdir; yalnız keşif kaydıdır. navigationMoreAvailable ise read_saved_source içinde offset:0 ve nextLinkOffset değerini linkOffset olarak kullanarak kalan bağlantıları ücretsiz gör. Eksik/başarısız bağlantı okuması varlık yokluğu değildir. navigationFinalUrl farklıysa kanal sahipliği varsayma. Hedefe uygun alt sayfayı sen seç; bütün menüyü otomatik tarama.';
const redirects=new Set([301,302,303,307,308]);
const media=/\.(?:avif|bmp|css|gif|ico|jpe?g|js|json|mp[34]|png|svg|webm|webp|woff2?)(?:$|[?#])/iu;
const clean=value=>plainHtml(Buffer.from(String(value))).replace(/\s+/gu,' ').trim();
function target(href,base){
 try{
  const raw=clean(href);if(!raw||raw.startsWith('#'))return null;
  const url=publicResearchUrl(new URL(raw,base).href);if(!url||url.length>2048)return null;
  const parsed=new URL(url);
  if(media.test(parsed.pathname)||/\/(?:sharer?|intent|logout|log-out|signout|sign-out|add-to-cart|checkout)(?:\/|$)/iu.test(parsed.pathname)||
   /(^|\.)facebook\.com$/iu.test(parsed.hostname)&&parsed.pathname==='/tr')return null;
  for(const key of parsed.searchParams.keys())if(/^(?:session(?:_?id)?|sid|jwt|access_?token|auth)$/iu.test(key))return null;
  return url;
 }catch{return null;}
}
// These are discovery records only. Neither link labels nor a successful GET
// certify ownership, channel sales, catalogue quality or target-page content.
export function sourceNavigation(source){
 const links=[],seen=new Set();let size=0,truncated=Boolean(source.navigationTruncated);
 const add=(href,label,base=source.navigationFinalUrl||source.url)=>{
  const url=target(href,base);if(!url||seen.has(url))return;
  const text=clean(label||new URL(url).pathname).slice(0,160);if(!text)return;
  const row={url,label:text},bytes=Buffer.byteLength(JSON.stringify(row));
  if(links.length>=200||size+bytes>32000){truncated=true;return;}
  seen.add(url);size+=bytes;links.push(row);
 };
 for(const row of source.navigation||[])if(row&&typeof row.url==='string')add(row.url,row.label,source.navigationFinalUrl||source.url);
 const markdown=String(source.text||'');
 for(const match of markdown.matchAll(/(?<!!)\[([^\]\n]+)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/gu))add(match[2],match[1]);
 for(const url of source.links||[])if(typeof url==='string')add(url,'');
 return {links,truncated};
}
export function htmlNavigation(html,url){
 const visible=String(html).replace(/<!--[\s\S]*?-->/gu,' ').replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/giu,' ');
 const navigation=[];
 for(const match of visible.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/giu)){
  const href=match[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/iu);
  if(href){const label=clean(match[2]);if(label)navigation.push({url:href[1]??href[2]??href[3],label});}
 }
 return sourceNavigation({url,text:'',navigation});
}
export function createNavigationReader({readFactory=createPublicFetcher,now=Date.now}={}){
 return async function readNavigation(input,{executionDeadline=Infinity}={}){
  const requested=publicResearchUrl(input),deadline=Math.min(executionDeadline-12000,now()+8000);
  if(!requested||deadline-now()<500)return {version:navigationVersion,status:'unavailable',reason:'navigation_window_closed',links:[]};
  const read=readFactory({maxRequests:3,maxBytes:2*1024*1024,deadline,hardDeadline:true});
  let url=requested;const visited=new Set();
  try{for(let at=0;at<3;at++){
   if(visited.has(url))return {version:navigationVersion,status:'unavailable',reason:'navigation_redirect_limit',links:[]};
   visited.add(url);
   const response=await read(url); // credential-free GET; DNS pinned at every hop
   if(redirects.has(response.status)&&response.headers.location){
    url=publicResearchUrl(new URL(response.headers.location,url).href);
    if(!url)return {version:navigationVersion,status:'unavailable',reason:'navigation_redirect_invalid',links:[]};
    continue;
   }
   if(response.status!==200||!Buffer.isBuffer(response.body)||response.body.length>2*1024*1024||!/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/iu.test(response.headers['content-type']||''))
    return {version:navigationVersion,status:'unavailable',reason:'navigation_unreadable',links:[]};
   const found=htmlNavigation(response.body.toString('utf8'),url);
   return {version:navigationVersion,status:found.links.length?'observed':'empty',finalUrl:url,...found};
  }}catch{/* Keep the paid body when optional public navigation is unavailable. */}
  return {version:navigationVersion,status:'unavailable',reason:'navigation_unavailable',links:[]};
 };
}
