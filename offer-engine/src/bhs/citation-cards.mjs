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
const card=(source,quote)=>({id:'proof_'+hash({url:source.url,quote}).slice(0,20),url:source.url,title:source.title,quote,method:source.method,scope:source.method==='search-snippet'?'Arama motorunun kısmi alıntısı; tam sayfa okunmuş değildir.':'Araştırmada okunmuş kaynak kesiti.'});
export function citationInput(context){
 const input=structuredClone(context),cards=new Map();
 for(const source of input.packet.sources){
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
 references(raw);
 const sources=new Map((raw.sources||[]).map(s=>[s.id,s]));
 for(const id of new Set([...sources.keys(),...ids])){
  const proof=trusted.get(id);if(!proof)continue;
  sources.set(id,{...sources.get(id),id,url:proof.url,title:proof.title,quote:proof.quote,scope:proof.scope,sourceType:sources.get(id)?.sourceType||'secondary',publishedAt:null,period:sources.get(id)?.period||null});
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
