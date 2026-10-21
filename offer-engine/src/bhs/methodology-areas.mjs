import {researchTopics} from './research-topics.mjs';

// Stable fields come from the approved methodology, never from model-selected
// headings. Missing evidence stays missing; it must not discard the paid report.
export const methodologyAreas=Object.entries(researchTopics).flatMap(([dimension,topics])=>topics.map((topic,i)=>({key:dimension+'_'+(i+1),dimension,topic})));
const entry={type:'object',additionalProperties:false,required:['status','observation','sourceIds'],properties:{status:{type:'string',enum:['observed','partial','unavailable']},observation:{type:'string',minLength:1,maxLength:1000},sourceIds:{type:'array',maxItems:24,items:{type:'string',maxLength:80}}}};
export const methodologyAreasSchema={type:'object',additionalProperties:false,required:methodologyAreas.map(a=>a.key),properties:Object.fromEntries(methodologyAreas.map(a=>[a.key,{...structuredClone(entry),description:a.topic}]))};
// Keep the provider grammar small; the original methodology names are supplied
// once in the research input. Server normalization retains the stricter limits.
export const methodologyAreasGrammar={type:'object',additionalProperties:false,required:methodologyAreas.map(a=>a.key),properties:Object.fromEntries(methodologyAreas.map(a=>[a.key,{type:'object',additionalProperties:false,required:['status','observation','sourceIds'],properties:{status:{type:'string',enum:['observed','partial','unavailable']},observation:{type:'string'},sourceIds:{type:'array',items:{type:'string'}}}}]))};

export function normalizeMethodologyAreas(areas,sourceIds){
 const allowed=sourceIds?new Set(sourceIds):null;
 return methodologyAreas.map(({key,dimension,topic})=>{
  const a=(Array.isArray(areas)?areas.find(a=>a?.dimension===dimension&&a?.topic===topic):areas?.[key])||{};
  const refs=[...new Set((Array.isArray(a.sourceIds)?a.sourceIds:[]).filter(id=>typeof id==='string'&&(!allowed||allowed.has(id))))];
  const observation=typeof a.observation==='string'?a.observation.trim():'';
  const status=observation&&refs.length&&['observed','partial'].includes(a.status)?a.status:'unavailable';
  return {dimension,topic,status,observation:observation||'Bu araştırmada veri bulunamadı; görüşmede doğrulanacak.',sourceIds:refs};
 });
}

// This legacy completion reads source evidence, not the previous model report.
// No verdict/reviewer prompt, no new search, and no replacement budget/card.
export function areaResearchInput(brief,research){
 const sources=research.packet.sources.map((s,i)=>{
  const excerpts=s.excerpts||[],text=excerpts[i%Math.max(1,excerpts.length)]?.text||'';
  const technical=s.technicalSignals;
  return {id:s.id,url:s.finalUrl||s.url,title:s.title.slice(0,96),method:s.method,text:text.slice(0,320),...(technical&&research.packet.entities.some(e=>{try{return new URL(e.website).href===new URL(s.finalUrl||s.url).href;}catch{return false;}})?{technicalSignals:{...technical,navigation:technical.navigation?.map(l=>l.label).slice(0,12)}}:{})};
 });
 const snippets=(research.searchEvidence||[]).flatMap(s=>s.results).filter(s=>/review|rating|trustpilot|linkedin|similarweb|semrush|social|instagram|facebook/i.test(s.url+' '+s.title)).slice(0,4).map((s,i)=>({id:'search_area_'+i,url:s.url,title:s.title,text:s.content.slice(0,300),method:'search-snippet'}));
 return {brief:{brandName:brief.brandName,website:brief.website},areas:methodologyAreas,sources:[...sources,...snippets]};
}

export function reportWithAreas(report,areas,sourceRecords){
 const coverage=normalizeMethodologyAreas(areas,sourceRecords.map(s=>s.id)),next=structuredClone(report),byId=new Map(next.sources.map(s=>[s.id,s])),aliases=new Map();
 for(const c of coverage)c.sourceIds=[...new Set(c.sourceIds.map(id=>{
  if(aliases.has(id))return aliases.get(id);
  const source=sourceRecords.find(s=>s.id===id),existing=next.sources.find(s=>s.url===source.url);
  if(existing){aliases.set(id,existing.id);return existing.id;}
  const added={id,url:source.url,title:source.title,quote:source.text.slice(0,200),publishedAt:null,period:null,scope:source.method==='search-snippet'?'Arama motorunun kısmi alıntısı; tam sayfa okunmuş değildir.':'Araştırma paketinden okunmuş sayfa kesiti.',sourceType:/trustpilot|reviews|sikayetvar/.test(source.url)?'review':'secondary'};
  byId.set(id,added);aliases.set(id,id);return id;
 }))];
 // Preserve every original source and finding. Customer presentation already
 // reads all sourced coverage entries into their methodology dimension tabs.
 next.sources=[...byId.values()];next.researchCoverage=coverage;return next;
}
