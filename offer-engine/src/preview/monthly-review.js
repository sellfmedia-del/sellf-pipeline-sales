// Preview-only adapter. The calculation module is the same module used on the
// server. Research/translation and persistence are synthetic; no API is called.
import {monthlyPricing} from './monthly-pricing.mjs';
import {selectedPricing,publicProjects} from './review-selection.mjs';
import {addQuote} from './monthly-currency.mjs';
import {applyBhsCalendar} from './review-bhs-actions.mjs';
const sampleCalendarAudit={report:{conversation:{reportMarkdown:
 '## Önerilen aksiyon planı\n'+
 '**Öncelik 1 – Üye yenileme (CRM).** Kullanım özetini hazırlayıp üyelik yenileme e-postasını pilot gruba gönder. Ölçüm: Yenileme oranı.\n'+
 '**Öncelik 2 – Kurumsal B2B satış.** Kurumsal seyahat yöneticileriyle teklif pilotu yap. Ölçüm: Görüşmeden teklife geçiş oranı.'
}}};
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
 if(new URLSearchParams(location.search).has('saved-bhs')){
  const key='pipeline-synthetic-saved-bhs',audit=window.PipelineAuditRequest,reuse=window.PipelineOfferReuseRequest;
  const logo=window.PipelineLogoControl;
  window.PipelineLogoControl={mount(container,options){
   const control=logo.mount(container,options);
   control.useSaved(clone(sample.logo));
   return control;
  }};
  const read=()=>JSON.parse(sessionStorage.getItem(key)||'null');
  const save=(brief,result)=>{
   const row={id:'example-bhs',created_at:new Date().toISOString(),brand_name:brief.brandName,brief,result};
   sessionStorage.setItem(key,JSON.stringify(row));
   return {status:'saved',id:row.id};
  };
  window.PipelineAuditRequest=async body=>{
   const response=await audit(body);
   return {...response,savedBhs:save(body.brief,response.result)};
  };
  window.PipelineOfferReuseRequest=async body=>{
   if(!body.action.startsWith('saved-'))return reuse(body);
   if(body.context?.leadId!=='lead-1'||body.context?.spaceId!=='space-1')throw Error('BHS farklı karta ait.');
   const row=read();
   if(body.action==='saved-list')return {reports:row?[{id:row.id,brand_name:row.brand_name,created_at:row.created_at}]:[]};
   if(body.action==='saved-save')return {savedBhs:save(body.brief,body.audit)};
   if(row?.id!==body.savedReportId)throw Error('Kayıtlı BHS bulunamadı.');
   if(body.action==='saved-info')return {brief:row.brief,logo:clone(sample.logo)};
   if(body.action!=='saved-prepare')throw Error('Önizleme işlemi geçersiz.');
   window.reviewCalls.push(clone(body));
   const result=clone(row.result);
   result.data.researchReuse={incrementalResearchCalls:0};
   return {phase:'complete',result,pricingProof:'synthetic-proof',cost:{chargedKurus:0}};
  };
  window.PipelineOffers.mount(document.querySelector('#pipeline-offer-section'),{lead:window.reviewLead,spaceId:'space-1'});
  const [instructions,limits]=document.querySelectorAll('.review-note');
  instructions.textContent='Örnek briefi tamamla, BHS’yi al, sayfayı yenile ve Kayıtlı BHS’yi kullan ile hizmet seçimine dön.';
  limits.textContent='Örnek analiz bu tarayıcı sekmesinde yenileme sonrasında da saklanır. Bu denemede araştırma veya teklif sağlayıcıları çalışmaz.';
  document.querySelector('.review-reset').onclick=()=>{sessionStorage.removeItem(key);location.reload();};
 }
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
  if(body.bhsCalendar===true)applyBhsCalendar(data.plans,sampleCalendarAudit,priced);
  data.valueSync={performed:false,amount:data.alternatives.find(a=>a.id===data.recommendedAlternativeId).monthlyAmount};
  if(body.brief.language==='en')data.language='en';
  return {phase:'complete',result,saveProof:'synthetic-preview-only'};
 };
 window.monthlyReviewReady=true;
}catch(error){document.querySelector('#review-error').textContent=error.message;}
