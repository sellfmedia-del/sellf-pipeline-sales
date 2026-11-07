import {byId} from '../pricing/catalog.mjs';
import {publicProjects} from '../pricing/selection.mjs';
import {assertQuote} from '../pricing/currency.mjs';
import {snapshotBrief,briefHash} from '../bhs/brief.mjs';
import {assertResult} from '../contracts.mjs';
import {offerCopy,normalizePlan,buildPlans} from '../proposal/composition.mjs';
import {selectProposalAudit} from '../proposal/audit-selection.mjs';
import {digest} from '../pricing/proof.mjs';
export const proposalEngine=Object.freeze({id:'proposal',version:'0.9.1',async run(input,dependencies={}){
 const brief=snapshotBrief(input.brief),{audit,pricing,logo}=dependencies;
 for(const [name,result]of Object.entries({audit,pricing,logo}))assertResult(name,result);
 if(audit.status!=='ready'||audit.data.briefHash!==briefHash(brief)||pricing.data.briefHash!==briefHash(brief))throw Error('Teklif girdileri aynı doğrulanmış brief için olmalı.');
 assertQuote(pricing.data,{requireReady:true});
 const plan=normalizePlan(input),copy=offerCopy(input.copy,audit.data),candidate=logo.data.candidates[0];
 const background=input.logoBackground||candidate.placement?.background||'#ffffff';
 if(!['#ffffff','#171717','#626262'].includes(background))throw Error('Logo zemini geçersiz.');
 const monthly=pricing.data.pricingMode==='monthly',manualCosts=pricing.data.selectionMode==='explicit'&&pricing.data.costSnapshot?.rules?.account==='selected_only';
 const alternatives=pricing.data.alternatives.map(a=>({id:a.id,name:a.name,billingPeriod:'monthly',monthlyAmount:a.monthlyAmount,...(a.available===false?{available:false}:{}),services:[...(a.id==='growth_operations'&&!monthly&&!manualCosts&&!a.services.some(s=>byId[s.serviceId]?.kind==='growth')?[{id:'growth',name:'Growth danışmanlığı ve strateji',description:'Tam BHS, onaylanan strateji ve uygulama planıyla Growth danışmanlığı.'}]:[]),...a.services.map(s=>({id:s.serviceId,name:s.name,description:s.deliverables||s.reason}))]}));
 const monthlyPlan=monthly?{months:pricing.data.monthlyPlan.months.map(row=>({month:row.month,monthlyAmount:row.monthlyAmount,...(row.projectPlan?{projectPlan:publicProjects(row.projectPlan)}:{}),services:row.services.map(s=>({id:s.serviceId,name:s.name,description:s.description}))}))}:null;
 const plans=buildPlans(plan,pricing.data);
 if(!pricing.data.scope.selected.length&&pricing.data.projectPlan&&plan.mode!=='manual')plans.operations_bundle.steps=[{time:'Başlangıç',title:'Proje kapsamı, erişimler ve teslimlerin netleştirilmesi'},{time:'Proje takvimine göre',title:'Proje uygulaması ve teslim onayı'}];
 if(pricing.data.projectPlan){for(const p of Object.values(plans)){p.focus=[p.focus,...pricing.data.projectPlan.items.map(s=>s.name)].filter(Boolean).join(' · ');if(plan.mode!=='manual')p.steps.push({time:'Proje takvimine göre',title:pricing.data.projectPlan.items.map(s=>s.name).join(' / ')});}}
 if(monthly)plans.operations_bundle={mode:'operations',focus:[...pricing.data.scope.selected,...monthlyPlan.months.flatMap(row=>row.projectPlan?.items||[])].map(s=>s.name).join(' · '),steps:monthlyPlan.months.map(row=>({time:row.month+'. ay',title:[...row.services,...(row.projectPlan?.items||[])].map(s=>s.name+(s.description!==s.name?' · '+s.description:'')).join(' / ')}))};
 return {status:pricing.status==='review'||logo.status==='review'?'review':'ready',data:{schemaVersion:'proposal-v1',brand:{name:brief.brandName,website:brief.website},copy,logo:{image:candidate.image,background,...(logo.data.processing==='original'?{processing:'original'}:{}),reviewed:logo.data.reviewed===true},currency:'TRY',...(pricing.data.quote?{quote:structuredClone(pricing.data.quote)}:{}),alternatives,...(pricing.data.projectPlan?{projectPlan:publicProjects(pricing.data.projectPlan)}:{}),recommendedAlternativeId:pricing.data.recommendedAlternativeId,...(monthly?{pricingMode:'monthly',monthlyPlan}:{}),plans,bhs:selectProposalAudit(audit.data,brief,pricing.data),exclusions:pricing.data.scope.exclusions,deferred:pricing.data.scope.deferred.map(s=>({name:s.name,reason:s.reason})),pending:pricing.data.scope.pending.map(s=>({name:s.name,reason:s.reason})),notices:pricing.data.notices,sections:['intro','bhs','alternatives','scope','plan','contract'],createdAt:new Date(input.now||Date.now()).toISOString(),provenance:{briefHash:briefHash(brief),auditHash:digest(audit),pricingHash:digest(pricing),logoHash:digest(logo),auditEngineVersion:audit.engineVersion||null,auditMethodologyVersion:audit.data.methodologyVersion||null,pricingEngineVersion:pricing.engineVersion||null,templateVersion:'sellf-offer-2026-10-21-v2',costVersion:pricing.data.costVersion,costSnapshotHash:pricing.data.costSnapshotHash},valueSync:{performed:false,amount:alternatives.find(a=>a.id===pricing.data.recommendedAlternativeId).monthlyAmount}}};
}});
