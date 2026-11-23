import {catalog,projects} from '../pricing/catalog.mjs';
import {interpretOperations,normalizeServiceText} from '../pricing/service-interpretation.mjs';

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

const inlineMeasurement=/(?:\*\*)?(?:Ölçüm|KPI)(?:\*\*)?\s*:\s*(?:\*\*)?\s*/iu;
const contextLabel=/(?:\*\*)?(?:Neden|Nasıl|Önkoşul|Not|Müşteri sorusu|Hedef)(?:\*\*)?\s*:/iu;
const methodLabel=/(?:\*\*)?Nasıl(?:\*\*)?\s*:\s*(?:\*\*)?\s*/iu;
const scopeLabels=[
 ['b2b',/\b(?:b2b|kurumsal\s+(?:satis|seyahat|uyelik|paket|alici))\p{L}*/u],
 ['email_marketing',/\b(?:crm|upsell|retention|yenileme|ust pakete|e\s*mail|e posta|mail pazarlama)\b/u],
 ['project_app',/\b(?:portal|web app|mobil uygulama)\w*\b.{0,45}\b(?:kur|gelistir|insa|tasarla)\p{L}*/u],
 ['project_brandbook',/\b(?:brandbook|brand book|kurumsal kimlik)\b/u]
];
const pricedNames=[...catalog,...projects].map(row=>({id:row.id,name:normalizeServiceText(row.name)}));

function rankedReportActions(markdown){
 const rows=[];let inPlan=false,codeBlock=false;
 for(const line of markdown.split('\n')){
  if(/^\s*(?:~~~|```)/u.test(line)){codeBlock=!codeBlock;continue;}
  if(codeBlock)continue;
  const section=/^\s*#{1,2}\s+(.+)$/u.exec(line);
  if(section)inPlan=/\b(?:aksiyon|eylem|uygulama plani|yol haritasi)\b/u.test(normalizeServiceText(section[1]));
  const row=/^\s*(?:(?:[-*+]|\d+[.)])\s+)?\*\*(.+?)\*\*\s+(.+)$/u.exec(line);
  if(!row||(!inPlan&&!/^oncelik\b/u.test(normalizeServiceText(row[1]))))continue;
  const match=inlineMeasurement.exec(row[2]);
  if(!match)continue;
  const body=row[2].slice(0,match.index),how=body.split(methodLabel,2)[1]?.split(contextLabel,1)[0];
  const action=[body.split(contextLabel,1)[0],how].filter(Boolean).join(' ');
  const measurement=row[2].slice(match.index+match[0].length).split(contextLabel,1)[0];
  rows.push({scope:row[1],action:clean(action),measurement:clean(measurement)});
 }
 return rows;
}

// Calendar entries can receive recommendations within their priced services.
export function addBhsCalendarRecommendations(steps,audit,groups){
 const report=audit.report?.conversation;
 if(!report||audit.researchReuse?.contextNeedsConfirmation)return;
 const scopes=groups.map(group=>new Set([
  ...group.services.map(row=>row.serviceId),...(group.projectPlan?.items||[]).map(row=>row.serviceId)
 ]));
 const seen=new Set(),lastPlacement=new Map(),replacedPilots=new Set();
 const proposals=[...rankedReportActions(String(report.reportMarkdown||'')),...proposalActionCandidates(audit)];
 for(const {scope='',action,measurement} of proposals){
  if(seen.size>=12)break;
  if(!safe(action)||!safe(measurement)||/[\p{Cc}\p{Cf}]/u.test(action+measurement))continue;
  const folded=normalizeServiceText(action),scopeText=normalizeServiceText(scope+' '+action);
  if(seen.has(folded)||/\b(?:soz ver\w*|kesin sonuc|oncelikli erisim hakki|satis garantisi)\b/u.test(folded))continue;
  const ids=new Set(interpretOperations(scopeText).serviceIds);
  for(const {id,name} of pricedNames)if((' '+scopeText+' ').includes(' '+name+' '))ids.add(id);
  for(const [id,pattern] of scopeLabels)if(pattern.test(scopeText))ids.add(id);
  if(!ids.size||/\b(?:sms|push|retargeting)\b/u.test(folded)&&![...ids].some(id=>['meta','google_ads','tiktok','programmatic'].includes(id)))continue;
  const serviceIds=[...ids];
  const eligible=scopes.flatMap((services,i)=>serviceIds.every(id=>services.has(id))?[i]:[]);
  if(!eligible.length)continue;
  const previous=Math.max(-1,...serviceIds.map(id=>lastPlacement.get(id)??-1));
  const index=eligible.find(i=>i>previous)??eligible.at(-1);
  const step=steps[index];
  step.bhsActions=[...(step.bhsActions||[]),{title:action,measurement,recommendation:true,serviceIds}];
  for(const id of serviceIds){lastPlacement.set(id,index);replacedPilots.add(id);}
  seen.add(folded);
 }
 const redundant=new Set(themes.filter(theme=>replacedPilots.has(theme.service)).map(theme=>theme.title));
 for(const step of steps)if(step.bhsActions?.length){
  step.bhsActions=step.bhsActions.filter(action=>!redundant.has(action.title));
  if(!step.bhsActions.length)delete step.bhsActions;
 }
}

export function applyBhsCalendar(plans,audit,pricing){
 if(pricing.pricingMode==='monthly'){
  addBhsCalendarRecommendations(plans.operations_bundle.steps,audit,pricing.monthlyPlan.months);
  return;
 }
 for(const alternative of pricing.alternatives.filter(row=>row.available!==false)){
  const {steps}=plans[alternative.id];
  const groups=steps.map((_,i)=>({services:alternative.services,...(i===steps.length-1?{projectPlan:pricing.projectPlan}:{})}));
  addBhsCalendarRecommendations(steps,audit,groups);
 }
}
