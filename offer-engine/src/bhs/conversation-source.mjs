// Presentation is free and deterministic. The original text remains in the
// source receipt/archive; offsets always refer to that original, not this view.
import {sourceNavigation,navigationWindowSize} from './conversation-navigation.mjs';
import {sourceEvidenceBoundary} from './conversation-evidence.mjs';
export const sourceWindowCharacters=12000;
const fold=value=>String(value||'').toLocaleLowerCase('tr').normalize('NFKD').replace(/\p{M}/gu,'').replaceAll('ı','i');
const navigation=/^(?:home|homepage|menu|products?|shop|cart|contact(?: us)?|about(?: us)?|login|sign in|privacy|cookies?|terms|anasayfa|ana sayfa|urunler|magaza|sepet|iletisim|hakkimizda|giris|gizlilik|cerezler)$/u;
const clean=value=>value.replace(/!\[[^\]]*\]\([^)]*\)/gu,'').replace(/\[([^\]]*)\]\([^)]*\)/gu,'$1').replace(/^[\s#>*|\-]+/u,'').trim();
function bodyLine(line){
 const text=clean(line),letters=text.match(/\p{L}+/gu)||[];
 if(!letters.length||navigation.test(fold(text)))return false;
 const residue=line.replace(/!?\[[^\]]*\]\([^)]*\)/gu,'').replace(/[\s#>*|\-]/gu,'');
 if(/\]\(/u.test(line)&&residue.length<20&&!/\d/u.test(residue)&&letters.length<=5)return false;
 return letters.length>=5||text.length>=45||/\d.+\d|\d\s*(?:TL|TRY|USD|EUR|%|₺|€|\$)/iu.test(text);
}
function passages(text){
 const rows=[];let current;
 for(const match of text.matchAll(/[^\n]+(?:\n|$)/gu)){
  if(!bodyLine(match[0])){current=null;continue;}
  const start=match.index,end=start+match[0].length;
  // Long prose lines must also be pageable, rather than exceeding the window.
  for(let at=start;at<end;at+=1800){
   const until=Math.min(end,at+1800);
   if(current&&at-current.start<1800&&until-current.start<=2200)current.end=until;
   else{current={start:at,end:until};rows.push(current);}
  }
 }
 return rows;
}
export function sourceReadingStatus(source){
 if(source.method==='search-snippet')return 'discovery_only';
 // Historical quote-only snapshots retain the original body's read status.
 if(['body_available','navigation_only'].includes(source.readingStatus))return source.readingStatus;
 return passages(String(source.text||'')).length?'body_available':'navigation_only';
}
export const usableConversationSource=source=>Boolean(source)&&sourceReadingStatus(source)==='body_available';
export const conversationSourceBody=source=>passages(String(source.text||'')).map(row=>clean(source.text.slice(row.start,row.end))).join(' ');

export function presentConversationSource(source,{purpose='',offset,linkOffset=0,legacy=false,boundaries=true}={}){
 const original=String(source.text||''),status=sourceReadingStatus(source);
 const body=passages(original);let ranges;
 if(Number.isSafeInteger(offset)&&offset>=0)ranges=offset<original.length?[{start:offset,end:Math.min(original.length,offset+sourceWindowCharacters)}]:[];
 else if(source.method==='search-snippet')ranges=[{start:0,end:Math.min(original.length,sourceWindowCharacters)}];
 else{
  const words=[...new Set((fold(purpose).match(/\p{L}{4,}/gu)||[]).filter(word=>!['icin','marka','markayi','kaynak','kaynagi','sayfa','sayfayi','oku','anla','gerekli','ilgili','olarak','veya'].includes(word)))];
  const ranked=body.map(row=>({...row,score:words.reduce((score,word)=>score+(fold(original.slice(row.start,row.end)).includes(word)?1:0),0)}))
   .sort((a,b)=>b.score-a.score||a.start-b.start);
  let remaining=sourceWindowCharacters;ranges=[];
  for(const row of ranked){
   const separator=ranges.length?7:0;
   if(remaining<=separator)break;
   const end=Math.min(row.end,row.start+remaining-separator);
   ranges.push({start:row.start,end});remaining-=end-row.start+separator;
  }
  ranges.sort((a,b)=>a.start-b.start);
 }
 const covered=ranges.reduce((total,row)=>total+row.end-row.start,0),last=ranges.at(-1)?.end||0;
 let nextBodyOffset=null;
 for(const row of body){
  let at=row.start;
  for(const shown of ranges){if(shown.start<=at&&shown.end>at)at=shown.end;}
  if(at<row.end){nextBodyOffset=at;break;}
 }
 const archiveMoreAvailable=offset!==undefined?last<original.length:covered<original.length;
 const moreAvailable=offset!==undefined||source.method==='search-snippet'?archiveMoreAvailable:nextBodyOffset!==null;
 const base={id:source.id,url:source.url,title:source.title,method:source.method,
  text:ranges.map(row=>original.slice(row.start,row.end)).join('\n\n[…]\n\n'),characters:original.length,
  readingStatus:status,passages:ranges,moreAvailable,archiveMoreAvailable,nextOffset:offset!==undefined?last:nextBodyOffset,
  links:(source.links||[]).slice(0,40),retrievedAt:source.retrievedAt,
  ...(status==='navigation_only'?{instruction:'Yalnız menü veya yetersiz sayfa metni alındı; bu okuma araştırma başarısı değildir. Gözlemlenen ilgili alt sayfayı oku veya uygun alternatif kaynak seç.'}:
   moreAvailable?{instruction:'İlgili gövde pasajları gösterildi; atlanan özgün metin read_saved_source ile offset üzerinden ücretsiz okunabilir. Yeni okuma satın alma.'}:{})};
 if(legacy)return base; // Exact pre-navigation field order for old paid fingerprints.
 const discovered=sourceNavigation(source),navigation=discovered.links.slice(linkOffset,linkOffset+navigationWindowSize),nextLinkOffset=linkOffset+navigation.length;
 return {...base,links:navigation.map(row=>row.url),linkLabels:navigation.map(row=>row.label),navigationScope:'discovery-only',
  navigationCount:discovered.links.length,navigationMoreAvailable:nextLinkOffset<discovered.links.length,
  nextLinkOffset:nextLinkOffset<discovered.links.length?nextLinkOffset:null,navigationTruncated:discovered.truncated,
  ...(source.navigationStatus?{navigationStatus:source.navigationStatus}:{}),...(source.navigationIssue?{navigationIssue:source.navigationIssue}:{}),
  ...(source.navigationFinalUrl?{navigationFinalUrl:source.navigationFinalUrl}:{}),...(source.sample?{sample:source.sample}:{}),
  ...(boundaries?{evidenceBoundary:sourceEvidenceBoundary(source,status)}:{})};
}
