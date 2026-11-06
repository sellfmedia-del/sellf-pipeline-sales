// Preview-only adapter. The calculation module is the same module used on the
// server. Research/translation and persistence are synthetic; no API is called.
import {monthlyPricing} from './monthly-pricing.mjs';
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
  if(body.pricingMode!=='monthly')return price(body);
  window.reviewCalls.push(clone(body));
  let result=monthlyPricing(body,body.brief);
  result.data.briefHash=sample.audit.data.briefHash;result.data.costSnapshotHash='synthetic-preview-cost-snapshot';
  result=addQuote(result,{currency:body.brief.currency||'TRY',exchangeRate:sample.pricing.USD.data.quote.exchangeRate});
  return {phase:'complete',result:{...result,stage:'pricing'},proposalProof:'synthetic-preview-only'};
 };
 window.PipelineProposalRequest=async body=>{
  if(body.pricing.data.pricingMode!=='monthly')return proposal(body);
  window.reviewCalls.push(clone(body));
  const result=clone(sample.proposal[body.brief.currency||'TRY']),data=result.data,priced=body.pricing.data;
  data.brand={name:body.brief.brandName,website:body.brief.website};
  data.pricingMode='monthly';data.recommendedAlternativeId='operations_bundle';
  data.alternatives=priced.alternatives.map(a=>({id:a.id,name:a.name,billingPeriod:'monthly',monthlyAmount:a.monthlyAmount,services:a.services.map(s=>({id:s.serviceId,name:s.name,description:s.description}))}));
  data.monthlyPlan={months:priced.monthlyPlan.months.map(row=>({month:row.month,monthlyAmount:row.monthlyAmount,services:row.services.map(s=>({id:s.serviceId,name:s.name,description:s.description}))}))};
  if(priced.quote)data.quote=clone(priced.quote);else delete data.quote;
  data.plans.operations_bundle={mode:'operations',focus:priced.scope.selected.map(s=>s.name).join(' · '),steps:data.monthlyPlan.months.map(row=>({time:row.month+'. ay',title:row.services.map(s=>s.name+(s.description!==s.name?' · '+s.description:'')).join(' / ')}))};
  data.valueSync={performed:false,amount:data.monthlyPlan.months[0].monthlyAmount};
  if(body.brief.language==='en')data.language='en';
  return {phase:'complete',result,saveProof:'synthetic-preview-only'};
 };
 window.monthlyReviewReady=true;
}catch(error){document.querySelector('#review-error').textContent=error.message;}
