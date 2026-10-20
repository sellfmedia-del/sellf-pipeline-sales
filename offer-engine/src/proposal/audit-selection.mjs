// Presentation only: select existing research, never score/research/review it.
const array=value=>Array.isArray(value)?value:[];
const normalize=value=>String(value||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
function short(value,max){
 const text=typeof value==='string'?value.replace(/\s+/g,' ').trim():'';
 if(text.length<=max)return text;
 const head=text.slice(0,max-1),sentence=[...head.matchAll(/[.!?](?=\s|$)/g)].at(-1)?.index;
 // Preserve complete sentences where possible; otherwise visibly excerpt at a word.
 if(sentence>=Math.floor(max*.45))return head.slice(0,sentence+1);
 const space=head.lastIndexOf(' ');return head.slice(0,space>max*.5?space:head.length)+'…';
}
export function selectProposalAudit(audit={},brief={},pricing={}){
 const findings=array(audit.findings).filter(f=>f&&typeof f==='object'),linked=new Set(array(pricing.scope?.selected).flatMap(s=>array(s.findingIds)));
 const critical=new Set([audit.criticalOpportunityFindingId,audit.criticalRiskFindingId].filter(Boolean));
 const terms=new Set(normalize([brief.goals,brief.needs,brief.services,brief.meetingNotes].filter(Boolean).join(' ')).match(/[\p{L}\p{N}]{4,}/gu)||[]);
 const rank=f=>{
  const words=new Set(normalize([f.statement,f.goalConnection].filter(Boolean).join(' ')).match(/[\p{L}\p{N}]{4,}/gu)||[]);
  return (critical.has(f.id)?1000:0)+(linked.has(f.id)?100:0)+([...words].filter(w=>terms.has(w)).length*3)+({high:30,medium:20,low:10}[f.priority]||0);
 };
 const sorted=findings.map((f,i)=>({f,i,rank:rank(f)})).filter(({f})=>typeof f.statement==='string'&&f.statement.trim()).sort((a,b)=>b.rank-a.rank||a.i-b.i);
 const selected=[],seen=new Set(),covered=new Set();
 // No global or per-heading finding count: all methodology dimensions remain.
 for(const {f} of sorted){
  const key=normalize(short(f.statement,160)).replace(/\s+/g,' ').trim();
  if(seen.has(key))continue;
  if(covered.has(f.dimension)&&!critical.has(f.id)&&!linked.has(f.id)&&f.priority!=='high')continue;
  selected.push({...f,statement:short(f.statement,160),impact:short(f.impact,200)});seen.add(key);covered.add(f.dimension);
 }
 const sourceIds=new Set(selected.flatMap(f=>array(f.sourceIds)));
 return {summary:short(audit.summary,240),scoring:audit.scoring?{total:audit.scoring.total}:undefined,
  dimensions:array(audit.dimensions).map(d=>{const items=selected.filter(f=>f.dimension===d.id).map(f=>({id:f.id,text:f.statement}));for(const [label,values] of [['Güçlü yön',d.strengths],['Gelişim alanı',d.gaps]]){const text=short(array(values).find(v=>typeof v==='string'&&v.trim()),160);if(text&&!items.some(i=>i.text===text))items.push({text:label+': '+text});}return {id:d.id,score:d.score,dataStatus:d.dataStatus,rationale:short(d.rationale,220),highlights:items};}),
  findings:selected.map(f=>({id:f.id,dimension:f.dimension,priority:f.priority,statement:f.statement,impact:f.impact,sourceIds:array(f.sourceIds)})),
  sources:array(audit.sources).filter(s=>sourceIds.has(s.id)).slice(0,24).map(s=>({id:s.id,title:short(s.title,96),url:s.url}))};
}
