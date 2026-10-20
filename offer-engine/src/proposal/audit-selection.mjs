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
 const selected=[],seen=new Set(),groups={high:0,medium:0,low:0},dimensions=new Set();
 // First diversify dimensions, then fill remaining slots with relevant findings.
 for(const diverse of [true,false])for(const {f} of sorted){
  if(selected.length===6)break;
  const key=normalize(short(f.statement,160)).replace(/\s+/g,' ').trim(),priority=['high','medium','low'].includes(f.priority)?f.priority:'low';
  if(seen.has(key)||groups[priority]>=2||diverse&&!critical.has(f.id)&&dimensions.has(f.dimension))continue;
  selected.push({...f,priority,statement:short(f.statement,160),impact:short(f.impact,200)});seen.add(key);groups[priority]++;dimensions.add(f.dimension);
 }
 const sourceIds=new Set(selected.flatMap(f=>array(f.sourceIds)));
 return {summary:short(audit.summary,240),scoring:audit.scoring?{total:audit.scoring.total}:undefined,
  dimensions:array(audit.dimensions).slice(0,6).map(d=>({id:d.id,score:d.score,dataStatus:d.dataStatus,rationale:short(d.rationale,220)})),
  findings:selected.map(f=>({id:f.id,dimension:f.dimension,priority:f.priority,statement:f.statement,impact:f.impact,sourceIds:array(f.sourceIds)})),
  sources:array(audit.sources).filter(s=>sourceIds.has(s.id)).slice(0,6).map(s=>({id:s.id,title:short(s.title,96),url:s.url}))};
}
