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
