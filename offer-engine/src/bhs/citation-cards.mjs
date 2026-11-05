import {hash} from '../budget/ledger.mjs';
import {normalized,publicUrl} from './verify.mjs';
// Citation IDs are made from read text, never from model output. Splitting the
// bounded context changes transport, not the set of researched facts.
export function citationChunks(text){
 const result=[];let start=0;
 while(start<text.length){
  let end=Math.min(start+200,text.length);
  if(end<text.length){const boundary=text.lastIndexOf(' ',end);if(boundary>start+80)end=boundary;}
  const quote=text.slice(start,end).trim();if(quote.length>=24)result.push(quote);
  if(end===text.length)break;start=Math.max(start+1,end-40);
 }
 return result;
}
export function technicalCitations(source,shared={}){
 const t=source.technicalSignals?.ref?shared[source.technicalSignals.ref]:source.technicalSignals;if(!t)return [];
 const rows=[];
 if(typeof t.https==='boolean'||typeof t.mobileViewport==='boolean')rows.push({htmlSignals:{...(typeof t.https==='boolean'?{https:t.https}:{}),...(typeof t.mobileViewport==='boolean'?{mobileViewport:t.mobileViewport}:{})},limit:'HTML signals only; mobile layout and speed were not tested.'});
 if(Array.isArray(t.platformHints)&&t.platformHints.length)rows.push({htmlSignals:{platformHints:t.platformHints},limit:'Platform hint only; operational scalability was not tested.'});
 if(typeof t.analyticsTags==='boolean'||typeof t.metaPixelTag==='boolean')rows.push({htmlSignals:{...(typeof t.analyticsTags==='boolean'?{analyticsTags:t.analyticsTags}:{}),...(typeof t.metaPixelTag==='boolean'?{metaPixelTag:t.metaPixelTag}:{})},limit:'Downloaded HTML only; false does not prove absence or failure.'});
 return rows.map(row=>JSON.stringify(row)).filter(quote=>quote.length>=24&&quote.length<=200);
}
const card=(source,quote)=>({id:'proof_'+hash({url:source.url,quote}).slice(0,20),url:source.url,title:source.title,quote,method:source.method,scope:source.method==='html-signals'?'Sunucunun indirilen HTMLde gözlediği teknik sinyaller; web sayfasından alıntı veya çalışırlık testi değildir.':source.method==='search-snippet'?'Arama motorunun kısmi alıntısı; tam sayfa okunmuş değildir.':'Araştırmada okunmuş kaynak kesiti.'});
export function citationInput(context){
 const input=structuredClone(context),cards=new Map();
 for(const source of input.packet.sources){
  source.signalCitations=technicalCitations(source,input.packet.sharedTechnicalSignals).map(quote=>{const proof=card({url:source.finalUrl||source.url,title:source.title,method:'html-signals'},quote);cards.set(proof.id,proof);return {proofId:proof.id,text:quote,scope:proof.scope};});
  source.excerpts=(source.excerpts||[]).flatMap(excerpt=>citationChunks(excerpt.text).map(quote=>{
   const proof=card({url:source.finalUrl||source.url,title:source.title,method:source.method},quote);cards.set(proof.id,proof);
   return {proofId:proof.id,text:quote};
  }));
 }
 for(const search of input.searchEvidence||[])for(const source of search.results||[]){
  source.citations=citationChunks(source.content||'').map(quote=>{const proof=card({...source,method:'search-snippet'},quote);cards.set(proof.id,proof);return {proofId:proof.id,text:quote};});
  delete source.content;
 }
 return {input,cards:[...cards.values()]};
}
const visible=text=>text.replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1');
export function verifiedCitationCards(cards,records){
 const trusted=new Map();if(!Array.isArray(cards))return trusted;
 for(const proof of cards){
  if(!proof||proof.id!==card(proof,proof.quote).id||typeof proof.quote!=='string'||proof.quote.length<24||proof.quote.length>200)continue;
  const quote=normalized(proof.quote),url=publicUrl(proof.url);
  const record=records.find(r=>r.aliases.some(a=>publicUrl(a)===url)&&r.segments.some(s=>normalized(s).includes(quote)||normalized(visible(s)).includes(quote)));
  if(!url||!record)continue;
  trusted.set(proof.id,{...proof,title:record.title||proof.title,method:record.method});
 }
 return trusted;
}
export function hydrateCitationSources(value,trusted){
 if(!trusted.size)return value;
 const raw=structuredClone(value?.originalReport??value??{}),ids=new Set();
 function references(v){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(references);return;}for(const [key,child]of Object.entries(v)){if(key==='sourceIds'&&Array.isArray(child))child.forEach(id=>ids.add(id));else if(key!=='originalReport')references(child);}}
 const findings=new Map((Array.isArray(raw.findings)?raw.findings:[]).map(f=>[f.id,f]));
 function resolve(id,seen=new Set()){if(!findings.has(id)||seen.has(id))return [id];const next=new Set([...seen,id]);return (findings.get(id).sourceIds||[]).flatMap(ref=>resolve(ref,next));}
 function expand(v){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(expand);return;}for(const [key,child]of Object.entries(v)){if(key==='sourceIds'&&Array.isArray(child))v[key]=[...new Set(child.flatMap(id=>resolve(id)))];else if(key!=='originalReport')expand(child);}}
 expand(raw);references(raw);
 const sources=new Map((Array.isArray(raw.sources)?raw.sources:[]).filter(s=>s&&typeof s.id==='string').map(s=>[s.id,s]));
 for(const id of new Set([...sources.keys(),...ids])){
  const proof=trusted.get(id);if(!proof)continue;
  sources.set(id,{...sources.get(id),id,url:proof.url,title:proof.title,quote:proof.quote,scope:proof.scope,sourceType:proof.method==='html-signals'?'secondary':sources.get(id)?.sourceType||'secondary',publishedAt:null,period:sources.get(id)?.period||null});
 }
 raw.sources=[...sources.values()];return raw;
}

export function selectedCitationPacket(packet,report){
 if(!packet.citationCards)return packet;
 const ids=new Set();
 function visit(value){if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(visit);return;}if(typeof value.id==='string')ids.add(value.id);for(const [key,child]of Object.entries(value)){if(key==='sourceIds'&&Array.isArray(child))child.forEach(id=>ids.add(id));else visit(child);}}
 visit(report);
 return {...packet,citationCards:packet.citationCards.filter(card=>ids.has(card.id))};
}
