import {catalog,costVersion} from './catalog.mjs';
import {normalizeProjects,priceProjects,priceServices,normalizeServices} from './selection.mjs';
import {interpretOperations} from './service-interpretation.mjs';

export class MonthlyPlanError extends Error {}
const fail=message=>{throw new MonthlyPlanError(message);};
const keys=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>allowed.includes(k));
// An explicit monthly selection is independent of the research brief. Neither
// a model nor a budget hint may add, remove or postpone these operations.
export function normalizeMonthlyPlan(input,segment,context=''){
 if(!keys(input,['months'])||!Array.isArray(input.months)||!input.months.length||input.months.length>36)fail('Aylık plan 1–36 ay içermeli.');
 return {months:input.months.map((row,index)=>{
  const month=index+1,label=month+'. ay';
  if(!keys(row,['month','services','projects','influencerListAmount','operationsText'])||row.month!==month||!Array.isArray(row.services)||row.services.length>catalog.length)fail(label+' operasyonları geçersiz; aylar sıralı olmalı.');
  const entries=[...row.services];
  if(row.operationsText!==undefined){
   const interpretation=interpretOperations(row.operationsText,{context});
   if(interpretation.unresolved.length)fail(label+' · '+interpretation.unresolved.join(' '));
   for(const serviceId of interpretation.serviceIds)if(!entries.some(s=>s?.serviceId===serviceId))entries.push({serviceId});
  }
  const projects=normalizeProjects(row.projects,segment);
  if(!entries.length&&!projects.length)fail(label+' için en az bir hizmet veya proje seç.');
  const selected=normalizeServices(entries,segment,row.influencerListAmount);
  return {month,...selected,...(projects.length?{projects}:{})};
 })};
}

export function monthlyCatalog(){
 return catalog.map(({id,name,sourceName,kind,costs})=>({id,name:sourceName||name,kind,customSegments:Object.keys(costs).filter(segment=>costs[segment]===0&&kind!=='commission')}));
}

export function monthlyPricing(input,brief){
 const plan=normalizeMonthlyPlan(input.monthlyPlan,brief.segment,[brief.services,brief.needs,brief.meetingNotes].filter(Boolean).join('\n'));
 if(input.customCosts!==undefined||input.influencerListAmount!==undefined)fail('Aylık planda özel maliyet ve influencer tutarını ilgili ayın içinde gir.');
 const rows=plan.months.map(row=>{
  const priced=priceServices(row,brief.segment),projectPlan=priceProjects(row.projects,brief.segment);
  const {operation,commission,account,base,growthCost,explicitAccount,...publicPrice}=priced;
  return {month:row.month,...publicPrice,...(projectPlan.items.length?{projectPlan}:{})};
 });
 const first=rows[0],union=[...new Map(rows.flatMap(row=>row.services).map(s=>[s.serviceId,s])).values()];
 const alternatives=['growth_operations','operations_bundle'].map(id=>({id,name:'Ay bazlı hizmet planı',billingPeriod:'monthly',monthlyAmount:first.monthlyAmount,minimumAmount:first.minimumAmount,idealAmount:first.idealAmount,cost:first.cost,accountCost:first.accountCost,budgetFit:'unknown',services:union}));
 // Retain the existing two-entry storage contract. In this opt-in mode only
 // monthlyPlan is presented to the customer; the legacy scalar is the first
 // month's operations fee, explicitly labelled by the operator UI.
 const costSnapshot={version:costVersion,segment:brief.segment,monthlyPlan:plan,months:rows,rules:{minimumMarkup:1.5,idealMarkup:2,account:'selected_only',growth:'selected_only',projectAccount:'selected_only',influencer:'10_percent_of_list',referenceAmount:'first_month_operations'}};
 return {status:'ready',data:{schemaVersion:'pricing-v2',currency:'TRY',costVersion,segment:brief.segment,pricingMode:'monthly',monthlyPlan:{months:rows},alternatives,recommendedAlternativeId:'operations_bundle',
  scope:{summary:'Operasyonlar ve başlangıç ayları kullanıcı tarafından belirlendi. Her ay kendi kapsamıyla ideal kârlılık üzerinden fiyatlandırıldı.',budgetPosture:'unspecified',budgetQuote:null,statedBudget:brief.budget,statedBudgetScope:'unspecified',target:null,selected:union,deferred:[],pending:[],exclusions:[],provisional:false},
  costSnapshot,
  notices:['Tutarlar aylık Sellf hizmet bedelleridir. Reklam harcaması, üçüncü taraf bedelleri ve KDV bu hesapta ayrıca hesaplanmadı.','BHS yatırım önerileri fiyat veya müşteri bütçesi olarak kullanılmadı.'],valueSync:{performed:false,reason:'Fiyat hesaplaması kart değerini değiştirmez; kayıt sırasında ilk ayın operasyon bedeli referans alınır.'}}};
}

export function assertMonthlyPlan(data,{customer=false}={}){
 if(data.pricingMode!=='monthly'){
  if(data.pricingMode!==undefined&&data.pricingMode!=='standard'||data.monthlyPlan!==undefined)fail('Aylık plan için ay bazlı fiyatlandırmayı seç.');
  return;
 }
 const rows=data.monthlyPlan?.months;
 if(!Array.isArray(rows)||!rows.length||rows.length>36||data.recommendedAlternativeId!=='operations_bundle')fail('Aylık fiyat kaydı eksik.');
 for(const [i,row]of rows.entries()){
  if(row.month!==i+1||!Number.isFinite(row.monthlyAmount)||row.monthlyAmount<0||!Array.isArray(row.services)||!row.services.length&&!row.projectPlan?.items?.length)fail('Aylık fiyat veya kapsam kaydı geçersiz.');
  if(customer){
   if(Object.keys(row).some(k=>!['month','monthlyAmount','services','projectPlan'].includes(k))||row.services.some(s=>Object.keys(s).some(k=>!['id','name','description'].includes(k))))fail('Müşteri belgesinde iç maliyet bulunamaz.');
  }else if(['cost','minimumAmount','idealAmount','accountCost'].some(k=>!Number.isFinite(row[k])||row[k]<0)||row.monthlyAmount!==row.idealAmount||row.monthlyAmount<row.minimumAmount)fail('Aylık maliyet ve kârlılık kaydı geçersiz.');
 }
 if(data.alternatives?.find(a=>a.id==='operations_bundle')?.monthlyAmount!==rows[0].monthlyAmount)fail('İlk ay referans tutarı aylık planla eşleşmiyor.');
}
