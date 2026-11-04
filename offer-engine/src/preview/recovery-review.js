/* Page-local synthetic adapter. No API, authentication, persistence or paid AI. */
(async function(){
 'use strict';
 const data=await(await fetch('/offers/variants-review-data.json')).json();
 let scenario='model',recovered=false;
 window.reviewCalls=[];
 window.PipelineLogoControl={mount(_element,{onChange}){onChange({sourceType:'saved',sourceWebsite:'https://brand.example/',generated:false,reviewed:true,image:data.logo.candidates[0].image,verifiedData:structuredClone(data.logo)});return {destroy(){},invalidate(){}};}};
 const cost=()=>({chargedKurus:2232,capKurus:5000,attemptChargedKurus:0,breakdown:{verifiedUsageKurus:166,knownReservationKurus:1069,historicalCommittedKurus:497,infraReserveKurus:500}});
 window.PipelineAuditRequest=async payload=>{
  window.reviewCalls.push(structuredClone(payload));
  if(payload.action==='cancel')return {status:'cancelled',cost:cost()};
  if(payload.action==='start')return {ticket:'synthetic-only',phase:'source_plan',nextAction:'advance',cost:cost()};
  if(payload.action==='recover'){recovered=true;return {ticket:'synthetic-only',phase:'source_plan',nextAction:'advance',cost:cost()};}
  if(!recovered)throw Object.assign(Error(scenario==='budget'?'Bu aşama için sonraki adımlara ayrılan rezerv nedeniyle yeterli tutar yok.':'Birincil ve yedek Gemini modeli bu örnekte tamamlanamadı.'),{code:scenario==='budget'?'budget_limit':'model_temporarily_unavailable',cost:cost(),recoveryAvailable:true,ticket:'synthetic-only',...(scenario==='budget'?{budgetDetail:{requiredKurus:505,availableKurus:268,followingReserveKurus:2500,remainingKurus:2768}}:{})});
  const completed=cost();completed.chargedKurus=2400;completed.attemptChargedKurus=168;completed.breakdown.verifiedUsageKurus+=168;
  return {phase:'complete',result:structuredClone(data.audit),pricingProof:'synthetic-only',cost:completed};
 };
 window.PipelinePricingRequest=async()=>({phase:'complete',result:structuredClone(data.pricing.TRY),proposalProof:'synthetic-only'});
 window.PipelineProposalRequest=async()=>({phase:'complete',result:structuredClone(data.proposal.TRY),saveProof:'synthetic-only'});
 window.PipelineOfferRequest=async()=>{throw Error('Bu örnek kaydedilmez. Gerçek veriler değiştirilmedi.');};
 function open(kind){
  document.querySelector('#offer-brief-dialog .ob-close')?.click();scenario=kind;recovered=false;window.reviewCalls=[];
  window.PipelineOfferBrief.open({lead:{id:'synthetic-recovery',company:'Örnek Marka',name:'Örnek Yetkili',notes:'Örnek büyüme görüşmesi.',timeline:[]},spaceId:'synthetic-space'});
  const form=document.querySelector('#offer-brief-form');
  for(const [name,value]of Object.entries({segment:'corporate',website:'https://brand.example/',goals:'Ölçülebilir büyüme.',needs:'Kanalların birlikte yönetimi.',services:'Growth danışmanlığı, Meta ve Google Ads.'}))form.elements[name].value=value;
  form.requestSubmit();
 }
 document.querySelector('#review-model').onclick=()=>open('model');
 document.querySelector('#review-budget').onclick=()=>open('budget');
})();
