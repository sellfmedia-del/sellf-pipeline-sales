// Preview-only adapter. The calculation module is the same module used on the
// server. Research/translation and persistence are synthetic; no API is called.
import {monthlyPricing} from './monthly-pricing.mjs';
import {selectedPricing,publicProjects} from './review-selection.mjs';
import {addQuote} from './monthly-currency.mjs';
const waitForAdapter=()=>new Promise((resolve,reject)=>{
 const start=Date.now(),poll=()=>{
  if(window.PipelinePricingRequest&&window.reviewRows)return resolve();
  if(Date.now()-start>10000)return reject(Error('Örnek teklif formu yüklenemedi.'));
  setTimeout(poll,30);
 };poll();
});
try{
 await waitForAdapter();
 const sample=await(await fetch('/offers/variants-review-data.json')).json(),clone=value=>structuredClone(value);
 const price=window.PipelinePricingRequest,proposal=window.PipelineProposalRequest;
 window.PipelinePricingRequest=async body=>{
  if(body.pricingMode!=='monthly'&&!body.serviceSelection)return price(body);
  window.reviewCalls.push(clone(body));
  let result=body.pricingMode==='monthly'?monthlyPricing(body,body.brief):selectedPricing(body,body.brief);
  result.data.briefHash=sample.audit.data.briefHash;result.data.costSnapshotHash='synthetic-preview-cost-snapshot';
  result=addQuote(result,{currency:body.brief.currency||'TRY',exchangeRate:sample.pricing.USD.data.quote.exchangeRate});
  return {phase:'complete',result:{...result,stage:'pricing'},proposalProof:'synthetic-preview-only'};
 };
 window.PipelineProposalRequest=async body=>{
  if(body.pricing.data.pricingMode!=='monthly'&&body.pricing.data.selectionMode!=='explicit')return proposal(body);
  window.reviewCalls.push(clone(body));
  const result=clone(sample.proposal[body.brief.currency||'TRY']),data=result.data,priced=body.pricing.data;
  data.brand={name:body.brief.brandName,website:body.brief.website};
  const monthly=priced.pricingMode==='monthly';if(monthly)data.pricingMode='monthly';else delete data.pricingMode;data.recommendedAlternativeId=priced.recommendedAlternativeId;
  if(priced.projectPlan)data.projectPlan=publicProjects(priced.projectPlan);else delete data.projectPlan;
  data.alternatives=priced.alternatives.map(a=>({id:a.id,name:a.name,billingPeriod:'monthly',monthlyAmount:a.monthlyAmount,...(a.available===false?{available:false}:{}),services:a.services.map(s=>({id:s.serviceId,name:s.name,description:s.description||s.reason}))}));
  if(monthly)data.monthlyPlan={months:priced.monthlyPlan.months.map(row=>({month:row.month,monthlyAmount:row.monthlyAmount,...(row.projectPlan?{projectPlan:publicProjects(row.projectPlan)}:{}),services:row.services.map(s=>({id:s.serviceId,name:s.name,description:s.description||s.reason}))}))};
  if(priced.quote)data.quote=clone(priced.quote);else delete data.quote;
  if(!monthly){delete data.monthlyPlan;for(const [id,plan]of Object.entries(data.plans)){plan.focus=priced.alternatives.find(a=>a.id===id).services.map(s=>s.name).join(' · ');if(body.planMode==='manual'){plan.mode='manual';plan.steps=clone(body.manualSteps);}}if(!priced.scope.selected.length&&data.projectPlan&&body.planMode!=='manual')data.plans.operations_bundle.steps=[{time:'Başlangıç',title:'Proje kapsamı, erişimler ve teslimlerin netleştirilmesi'},{time:'Proje takvimine göre',title:'Proje uygulaması ve teslim onayı'}];}
  if(monthly)data.plans.operations_bundle={mode:'operations',focus:priced.scope.selected.map(s=>s.name).join(' · '),steps:data.monthlyPlan.months.map(row=>({time:row.month+'. ay',title:[...row.services,...(row.projectPlan?.items||[])].map(s=>s.name+(s.description!==s.name?' · '+s.description:'')).join(' / ')}))};
  if(!monthly&&data.projectPlan)for(const plan of Object.values(data.plans)){plan.focus=[plan.focus,...data.projectPlan.items.map(s=>s.name)].join(' · ');plan.steps.push({time:'Proje takvimine göre',title:data.projectPlan.items.map(s=>s.name).join(' / ')});}
  data.valueSync={performed:false,amount:data.alternatives.find(a=>a.id===data.recommendedAlternativeId).monthlyAmount};
  if(body.brief.language==='en')data.language='en';
  return {phase:'complete',result,saveProof:'synthetic-preview-only'};
 };
 window.monthlyReviewReady=true;
}catch(error){document.querySelector('#review-error').textContent=error.message;}
