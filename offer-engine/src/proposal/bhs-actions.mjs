import {normalizeServiceText} from '../pricing/service-interpretation.mjs';

const clean=value=>typeof value==='string'?value.trim().replace(/\s+/gu,' '):'';
const safe=value=>Boolean(value)&&value.length<=420&&!/[<>]|https?:\/\/|www\.|[₺$€£]|\b(?:garanti|taahhüt)\b/iu.test(value);
const actionLabel=/^\s*(?:[-*+]\s+)?(?:\*\*)?(Aksiyon|Ölçüm)(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.+)$/iu;

export function proposalActionCandidates(audit){
 const report=audit.report?.conversation;
 if(!report||audit.researchReuse?.contextNeedsConfirmation)return [];
 const actions=[];
 let action,codeBlock=false;
 for(const line of String(report.reportMarkdown||'').split('\n')){
  if(/^\s*(?:```|~~~)/u.test(line)){codeBlock=!codeBlock;action=undefined;continue;}
  if(codeBlock)continue;
  if(/^\s*#/u.test(line))action=undefined;
  const match=actionLabel.exec(line);
  if(!match)continue;
  if(match[1].toLowerCase()==='aksiyon'){action=clean(match[2]);continue;}
  if(action)actions.push({action,measurement:clean(match[2])});
  action=undefined;
 }
 for(const row of audit.findings||[])if(row.recommendation)
  actions.push({action:clean(row.recommendation.action),measurement:clean(row.recommendation.measurement)});
 const seen=new Set();
 return actions.filter(row=>{
  if(!safe(row.action)||!safe(row.measurement)||seen.has(row.action))return false;
  seen.add(row.action);return true;
 });
}

// Scope the model-free handoff to a priced service and an explicit brief
// objective. Translate the recommendation into a validation/pilot step.
// Public claims, platform builds, planned deals and performance promises
// from an unreviewed narrative do not become contractual work.
const themes=[
 {service:'b2b',brief:/\bb2b\b/u,action:/\b(?:b2b|kurumsal)\b/u,measure:/\b(?:b2b|kurumsal|sozlesme)\b/u,
  title:'Mevcut kurumsal paketleri ve alıcı yolunu doğrula. Seçili B2B kanalı için bir satış pilotu tasarla.',
  metric:'Pilot için nitelikli kurumsal görüşme ve teklife geçiş sayılarını izle.'},
 {service:'email_marketing',brief:/\b(?:retention|crm|upsell|yenileme|elde tutma|ust pakete)\b/u,
  action:/\b(?:crm|upsell|yenileme|ust pakete|kullanim frekansi)\b/u,measure:/\b(?:gecis|yenileme|retention|donusum)\b/u,
  title:'Mevcut izin ve kullanım verisini doğrula. Yenileme veya üst pakete geçiş için seçili e-posta kanalında bir pilot tasarla.',
  metric:'Pilot grubunda paket geçişini ve yenileme oranını ayrı ayrı izle.'}
];

export function retainProposalActions(plans,brief,audit,pricing,mode){
 if(mode==='manual')return;
 const actions=proposalActionCandidates(audit);
 if(!actions.length)return;
 const goal=normalizeServiceText([brief.goals,brief.needs,brief.services,brief.meetingNotes].join(' '));
 const candidates=themes.filter(theme=>theme.brief.test(goal)&&actions.some(row=>
  theme.action.test(normalizeServiceText(row.action))&&theme.measure.test(normalizeServiceText(row.measurement))));
 const approved=new Map((audit.quality?.contentComplete===true?audit.findings||[]:[])
  .filter(row=>row.recommendation&&safe(clean(row.recommendation.action))&&safe(clean(row.recommendation.measurement)))
  .map(row=>[row.id,{title:clean(row.recommendation.action),measurement:clean(row.recommendation.measurement)}]));
 const selected=rows=>new Set(rows.map(s=>s.serviceId));
 const attach=(step,rows,used)=>{const ids=selected(rows);
  const applicable=candidates.filter(theme=>ids.has(theme.service)&&!used.has(theme.service));
  if(!step)return;
  const linked=rows.flatMap(row=>row.findingIds||[]).filter(id=>approved.has(id)&&!used.has(id));
  const guidance=[...new Set(linked)].map(id=>approved.get(id));
  guidance.push(...applicable.map(theme=>({title:theme.title,measurement:theme.metric})));
  if(guidance.length)step.bhsActions=guidance;
  linked.forEach(id=>used.add(id));
  applicable.forEach(theme=>used.add(theme.service));
 };
 if(pricing.pricingMode==='monthly'){
  const used=new Set();
  pricing.monthlyPlan.months.forEach((row,index)=>attach(plans.operations_bundle.steps[index],row.services,used));
 }else for(const alternative of pricing.alternatives)if(alternative.available!==false)
  attach(plans[alternative.id].steps[0],alternative.services,new Set());
}
