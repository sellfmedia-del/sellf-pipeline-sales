import {domainToUnicode} from 'node:url';
import {createPublicFetcher,resolveTarget} from '../network.mjs';
import {temporaryDnsError} from '../network-dns.mjs';
import {researchUrl} from './research-url.mjs';
import {plainHtml} from './verify.mjs';

const redirectStatuses=new Set([301,302,303,307,308]);
const maxRequests=4;
const genericLabels=new Set(['shop','store','online','website','wordpress','shopify','wixsite','site','market','ticaret','magaza']);
const companySuffix=/\b(?:limited|ltd|llc|inc|gmbh|anonim sirketi|ltd sti|a s)$/;
const normalize=value=>value.normalize('NFKD').toLowerCase().replaceAll('ı','i')
 .replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const compact=value=>value.replaceAll(' ','');
const label=value=>normalize(value||'').replace(companySuffix,'').trim();
const decode=value=>plainHtml(Buffer.from(value)).replace(/\s+/g,' ').trim();
const hasName=(text,name)=>name&&(compact(text)===compact(name)||
 (compact(name).length>=4&&(' '+text+' ').includes(' '+name+' ')));

function siteLabel(url){
 const labels=domainToUnicode(new URL(url).hostname).replace(/\.$/,'').split('.');
 const countrySuffix=labels.at(-1)?.length===2&&/^(?:ac|co|com|edu|gov|net|org)$/.test(labels.at(-2));
 return label(labels.at(countrySuffix?-3:-2));
}

function htmlNames(html){
 const head=html.match(/<head\b[^>]*>([\s\S]*?)(?:<\/head\s*>|<body\b)/i)?.[1]||html.slice(0,64000);
 const metaNames=[];
 for(const match of head.matchAll(/<meta\b([^>]+)>/gi)){
  const fields=Object.fromEntries([...match[1].matchAll(/([a-z:-]+)\s*=\s*(["'])([\s\S]*?)\2/gi)]
   .map(attribute=>[attribute[1].toLowerCase(),attribute[3]]));
  if(['og:site_name','application-name','og:title'].includes((fields.property||fields.name||'').toLowerCase())&&fields.content)
   metaNames.push({kind:(fields.property||fields.name).toLowerCase(),name:decode(fields.content)});
 }
 const structured=[];
 for(const match of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){
  try{
   const value=JSON.parse(match[1]);
   for(const node of Array.isArray(value)?value:[value,...(Array.isArray(value?.['@graph'])?value['@graph']:[])]){
    if(node&&[node['@type']].flat().some(type=>typeof type==='string'&&/^(?:Organization|Corporation|LocalBusiness|OnlineStore|Brand|WebSite)$/i.test(type))){
     for(const name of [node.name,node.alternateName].flat())if(typeof name==='string')structured.push(name);
    }
   }
  }catch{/* Invalid structured metadata cannot identify a publisher. */}
 }
 const titles=[decode(head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]||''),
  ...metaNames.filter(item=>item.kind==='og:title').map(item=>item.name)];
 const publishers=[...metaNames.filter(item=>item.kind!=='og:title').map(item=>item.name),...structured];
 return {titles:titles.flatMap(title=>[title,...title.split(/\s[|–—-]\s|:\s/)]).map(label),publishers:publishers.map(label)};
}

function classify(brand,website,html=''){
 const domain=siteLabel(website),expected=label(brand),{titles,publishers}=htmlNames(html);
 if(expected&&(compact(domain)===compact(expected)||publishers.some(name=>hasName(name,expected))))return 'verified';
 // Require the other site's own publisher or title to corroborate its domain.
 // A failed read, generic title or an unfamiliar hostname proves no conflict.
 const distinctDomain=domain.length>=4&&!genericLabels.has(domain);
 const brandInTitle=titles.some(name=>hasName(name,expected));
 if(distinctDomain&&publishers.some(name=>hasName(name,domain)))return brandInTitle?'unconfirmed':'mismatch';
 if(brandInTitle)return 'verified';
 return distinctDomain&&titles.some(name=>hasName(name,domain))?'mismatch':'unconfirmed';
}

export function createWebsiteIdentityCheck({resolve=resolveTarget,makeReader=createPublicFetcher}={}){
 return async function check(brief){
  let initial;
  try{initial=await resolve(brief.website);}
  catch(error){
   if(temporaryDnsError(error))throw error;
   return {status:'unreachable',website:brief.website};
  }
  let current=brief.website,lastPublic=current;
  const read=makeReader({maxRequests,maxBytes:1024*1024,deadline:Date.now()+6000,hardDeadline:true,
   resolve:async url=>{
    const target=url===brief.website?initial:await resolve(url);
    lastPublic=url;
    return target;
   }});
  const result=status=>{
   const url=new URL(lastPublic);
   if(lastPublic!==brief.website)url.search='';
   return {status,website:url.href};
  };
  const visited=new Set();
  for(let count=0;count<maxRequests;count++){
   if(visited.has(current))return result('invalid_redirect');
   visited.add(current);
   let page;
   try{
    page=await read(current,{headers:{accept:'text/html,application/xhtml+xml'}});
   }catch{
    // A rejected redirect destination can never be confirmed by the user.
    if(current!==lastPublic)return result('invalid_redirect');
    return result(current===brief.website?classify(brief.brandName,current):'unconfirmed');
   }
   lastPublic=current;
   if(redirectStatuses.has(page.status)&&page.headers.location){
    let next='';
    try{next=researchUrl(new URL(page.headers.location,current).href);}catch{/* Malformed redirect. */}
    if(!next)return result('invalid_redirect');
    current=next;
    continue;
   }
   const html=page.status===200&&/html/i.test(page.headers['content-type']||'')?page.body.toString('utf8'):'';
   return result(classify(brief.brandName,current,html));
  }
  return result('invalid_redirect');
 };
}
export const validateResearchWebsite=createWebsiteIdentityCheck();
