const fold=value=>String(value||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[^a-z0-9]/g,'');
const host=url=>new URL(url).hostname.replace(/^www\./,'');
export function researchSourceSelector(brief,packet){
 const entities=[{name:brief.brandName,website:brief.website},...(packet.entities||[])];
 const hosts=new Set(entities.map(e=>host(e.website))),aliases=[...new Set(entities.flatMap(e=>[fold(e.name.replace(/\b(?:incorporated|inc|ltd|limited|corporation|corp)\.?\b/gi,'')),fold(host(e.website))]).filter(s=>s.length>=6))];
 return source=>{try{if(hosts.has(host(source.finalUrl||source.url)))return true;}catch{return false;}
  const text=fold([source.url,source.title,source.content,...(source.excerpts||[]).map(e=>e.text)].filter(Boolean).join(' '));return aliases.some(alias=>text.includes(alias));
 };
}
export function prepareResearchInput(brief,evidence){
 const relevant=researchSourceSelector(brief,evidence.packet),packet={...evidence.packet,sources:evidence.packet.sources.filter(relevant)};
 // Source selection happens before research synthesis, not as a second review.
 const readUrls=new Set(packet.sources.flatMap(s=>[s.url,s.finalUrl]));
 const searchEvidence=(evidence.searches||[]).map(s=>({query:s.query,results:(s.results||[]).filter(r=>!readUrls.has(r.url)&&relevant(r)).map(r=>({...r,content:r.content.slice(0,1200)}))})).filter(s=>s.results.length);
 return {packet,searchEvidence};
}

// Transport compression, not an AI summary or a second content review. Retain
// every source and factual excerpt; repeated navigation metadata is sent once.
export function compactResearchInput(input){
 const result=structuredClone(input),shared={},known=new Map(),navigation={},navKnown=new Map();
 for(const source of result.packet.sources){
  if(source.technicalSignals){
   source.technicalSignals=structuredClone(source.technicalSignals);
   if(Array.isArray(source.technicalSignals.navigation))source.technicalSignals.navigation=source.technicalSignals.navigation.map(link=>{
    const key=JSON.stringify(link);let ref=navKnown.get(key);if(!ref){ref='nav'+(navKnown.size+1);navKnown.set(key,ref);navigation[ref]=link;}return {ref};
   });
   const key=JSON.stringify(source.technicalSignals);let id=known.get(key);
   if(!id){id='signals'+(known.size+1);known.set(key,id);shared[id]=source.technicalSignals;}
   source.technicalSignals={ref:id};
  }
  const excerpts=[];
  for(const original of [...source.excerpts].sort((a,b)=>(a.offset??Infinity)-(b.offset??Infinity))){
   const chunk={...original},last=excerpts.at(-1);
   if(last&&Number.isInteger(last.offset)&&Number.isInteger(chunk.offset)){
    const overlap=last.offset+last.text.length-chunk.offset;
    if(overlap>0&&overlap<=chunk.text.length&&last.text.endsWith(chunk.text.slice(0,overlap))){chunk.text=chunk.text.slice(overlap);chunk.offset+=overlap;}
   }
   if(chunk.text.trim())excerpts.push(chunk);
  }
  // Image delivery URLs and Markdown syntax are not research facts. Keep alt
  // text and link labels; provenance remains bound to each original source URL.
  source.excerpts=excerpts.map(e=>({...e,text:e.text.replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')}));
 }
 result.packet.sharedTechnicalSignals=shared;
 result.packet.sharedNavigation=navigation;
 return result;
}
