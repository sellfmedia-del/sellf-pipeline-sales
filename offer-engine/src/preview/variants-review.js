/* Synthetic review adapter. Emitted only by preview builds; never calls an API,
 * authentication, CRM, model provider or payment service. Real handlers and SQL
 * are verified independently. All preview mutations stay in this page's memory. */
(async function(){
 'use strict';
 const data=await(await fetch('/offers/variants-review-data.json')).json();
 const clone=value=>structuredClone(value),rows=clone(data.rows),history=new Map(),lead={id:'lead-1',company:'Örnek Marka',name:'Örnek Yetkili',value:'160000',notes:'Avrupa operasyonunun büyümesi ve reklam kanallarının yönetimi değerlendirildi.',timeline:[]};
 const context={lead,spaceId:'space-1'};window.reviewCalls=[];window.reviewRows=rows;window.reviewLead=lead;
 document.querySelector('#review-value').textContent=Number(lead.value).toLocaleString('tr-TR')+' TL';
 const terms=row=>({currency:row.customer_document.quote?.currency||'TRY',documentHash:'synthetic-'+row.id,...(row.customer_document.quote?{exchangeRate:row.customer_document.quote.exchangeRate}:{}),alternatives:row.customer_document.alternatives.map((a,i)=>({id:a.id,name:a.name,current:row.customer_document.quote?.alternatives[i].monthlyAmount??a.monthlyAmount,recommended:row.originalPrices[i],minimum:row.minimumPrices[i]}))});
 const owner=row=>({...clone(row),publicUrl:row.state==='published'?'#ornek-musteri-teklifi-'+row.version:undefined,password:row.state==='published'?'ornek-sifre-'+row.version:undefined});
 window.PipelineOfferRequest=async b=>{
  window.reviewCalls.push(clone(b));
  if(b.action==='list')return {offers:rows.length?[owner(rows.at(-1))]:[]};
  if(b.action==='catalog')return {offers:[...rows].reverse().map(({id,version,state,monthly_amount,created_at})=>({id,version,state,monthly_amount,created_at}))};
  const row=rows.find(r=>r.id===b.offerId);
  if(b.action==='detail')return {offer:owner(row),priceTerms:terms(row)};
  if(b.action==='price_history')return {changes:clone(history.get(row.id)||[])};
  if(b.action==='prices'){
   const before=Object.fromEntries(terms(row).alternatives.map(a=>[a.id,a.current]));
   if(terms(row).alternatives.some(a=>Number(b.amounts[a.id])<a.minimum)&&!b.confirmedBelowMinimum)throw Error('Asgari tutarın altındaki fiyatı ayrıca onayla.');
   for(const a of row.customer_document.alternatives){const price=Number(b.amounts[a.id]);a.monthlyAmount=row.customer_document.quote?Math.floor(price*row.customer_document.quote.exchangeRate.rate*100)/100:price;}
   row.customer_document.quote?.alternatives.forEach(a=>a.monthlyAmount=Number(b.amounts[a.id]));
   row.monthly_amount=row.customer_document.alternatives.find(a=>a.id===row.customer_document.recommendedAlternativeId).monthlyAmount;
   history.set(row.id,[{created_at:new Date().toISOString(),before_prices:before,after_prices:clone(b.amounts)},...(history.get(row.id)||[])]);return {offer:owner(row),priceTerms:terms(row)};
  }
  if(b.action==='publish'){row.state='published';return {url:owner(row).publicUrl,password:owner(row).password};}
  if(b.action==='save'){
   const doc=clone(b.proposal.data),version=rows.length+1,row={id:crypto.randomUUID(),version,state:'draft',created_at:new Date().toISOString(),customer_document:doc,monthly_amount:doc.valueSync.amount,originalPrices:doc.alternatives.map((a,i)=>doc.quote?.alternatives[i].monthlyAmount??a.monthlyAmount),minimumPrices:data.rows.find(r=>(r.customer_document.quote?.currency||'TRY')===(doc.quote?.currency||'TRY')).minimumPrices};rows.push(row);return {offer:{...owner(row),monthlyAmount:row.monthly_amount}};
  }
  throw Error('Önizleme işlemi tanımlı değil.');
 };
 window.PipelineOfferReuseRequest=async b=>{
  window.reviewCalls.push(clone(b));const row=rows.find(r=>r.id===b.sourceOfferId);
  if(b.action==='info')return {brand:clone(row.customer_document.brand),segment:'corporate',currency:row.customer_document.quote?.currency||'TRY',logo:clone(data.logo)};
  const result=clone(data.audit);result.data.researchReuse={contextNeedsConfirmation:true,incrementalResearchCalls:0};return {phase:'complete',result,pricingProof:'synthetic-proof'};
 };
 window.PipelineAuditRequest=async b=>{window.reviewCalls.push({kind:'audit',...clone(b)});return {phase:'complete',result:clone(data.audit),pricingProof:'synthetic-proof'};};
 window.PipelinePricingRequest=async b=>{window.reviewCalls.push(clone(b));return {phase:'complete',result:clone(data.pricing[b.brief.currency||'TRY']),proposalProof:'synthetic-proof'};};
 window.PipelineProposalRequest=async b=>{
  window.reviewCalls.push(clone(b));const result=clone(data.proposal[b.brief.currency||'TRY']);result.data.brand={name:b.brief.brandName,website:b.brief.website};return {phase:'complete',result,saveProof:'synthetic-proof'};
 };
 window.PipelineOffers.mount(document.querySelector('#pipeline-offer-section'),context);
})().catch(error=>document.querySelector('#review-error').textContent=error.message);
