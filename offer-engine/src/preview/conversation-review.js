/* Synthetic, page-local UI fixture. No provider, auth or database calls. */
(async function(){
 'use strict';
 const data=await(await fetch('/offers/conversation-review-data.json')).json();
 const standard=await(await fetch('/offers/variants-review-data.json')).json();
 let partial=false;window.reviewCalls=[];
 window.PipelineLogoControl={mount(_element,{onChange}){onChange({sourceType:'saved',sourceWebsite:data.brief.website,generated:false,reviewed:true,
  image:standard.logo.candidates[0].image,verifiedData:structuredClone(standard.logo)});return {destroy(){},invalidate(){}};}};
 window.PipelineAuditRequest=async body=>{window.reviewCalls.push({action:body.action});return {phase:'complete',result:structuredClone(partial?data.partial:data.audit),pricingProof:'synthetic-only',
  cost:{chargedKurus:1820,capKurus:5000,attemptChargedKurus:1320}};};
 window.PipelinePricingRequest=async()=>{throw Error('Bu arayüz örneği gerçek fiyat veya teklif üretmez.');};
 function open(value){
  document.querySelector('#offer-brief-dialog .ob-close')?.click();partial=value;window.reviewCalls=[];
  window.PipelineOfferBrief.open({lead:{id:'synthetic-conversation',company:data.brief.brandName,name:'Örnek Yetkili',notes:'Sentetik görüşme örneği.',timeline:[]},spaceId:'synthetic-conversation-space'});
  const form=document.querySelector('#offer-brief-form');
  for(const [name,value]of Object.entries(data.brief))if(form.elements[name]&&value!==null)form.elements[name].value=value;
  form.requestSubmit();
 }
 document.querySelector('#review-conversation').onclick=()=>open(false);
 document.querySelector('#review-conversation-partial').onclick=()=>open(true);
})().catch(error=>document.querySelector('#review-error').textContent=error.message);
