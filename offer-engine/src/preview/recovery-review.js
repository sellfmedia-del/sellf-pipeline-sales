/* Page-local synthetic adapter. No API, authentication, persistence or paid AI. */
(async function(){
 'use strict';
 const data=await(await fetch('/offers/variants-review-data.json')).json();
 const continuity=await(await fetch('/offers/recovery-review-continuity.json')).json();
 let scenario='model',recovered=false;
 window.reviewCalls=[];
 window.reviewComposeCalls=[];
 window.PipelineLogoControl={mount(_element,{onChange}){onChange({sourceType:'saved',sourceWebsite:'https://brand.example/',generated:false,reviewed:true,image:data.logo.candidates[0].image,verifiedData:structuredClone(data.logo)});return {destroy(){},invalidate(){}};}};
 const cost=()=>scenario==='restored'?{chargedKurus:4621,capKurus:5000,attemptChargedKurus:0,breakdown:{verifiedUsageKurus:0,knownReservationKurus:0,historicalCommittedKurus:4121,infraReserveKurus:500}}:{chargedKurus:2232,capKurus:5000,attemptChargedKurus:0,breakdown:{verifiedUsageKurus:166,knownReservationKurus:1069,historicalCommittedKurus:497,infraReserveKurus:500}};
 window.PipelineAuditRequest=async payload=>{
  window.reviewCalls.push(structuredClone(payload));
  if(payload.action==='cancel')return {status:'cancelled',cost:cost()};
  if(scenario==='restored'&&payload.action==='start')return {phase:'complete',result:structuredClone(continuity.restored.audit),pricingProof:'synthetic-only',cost:cost()};
  if(payload.action==='start')return {ticket:'synthetic-only',phase:'source_plan',nextAction:'advance',cost:cost()};
  if(payload.action==='continue')return {phase:'complete',result:structuredClone(continuity.audit),pricingProof:'synthetic-only',cost:cost()};
  if(payload.action==='recover'){recovered=true;return {ticket:'synthetic-only',phase:'source_plan',nextAction:'advance',cost:cost()};}
  if(!recovered)throw Object.assign(Error(scenario==='empty'?'Kaynakla doğrulanabilen araştırma içeriği oluşmadı. Boş yanıt BHS olarak kullanılmadı.':scenario==='budget'?'Bu aşamanın tam çıktı rezervi için kartın kalan sınırı yeterli değil.':'Birincil ve yedek Gemini modeli bu örnekte tamamlanamadı.'),{code:scenario==='empty'?'research_empty':scenario==='budget'?'budget_limit':'model_temporarily_unavailable',cost:cost(),recoveryAvailable:true,continuationAvailable:true,ticket:'synthetic-only',...(scenario==='budget'?{budgetDetail:{requiredKurus:2960,availableKurus:2768,followingReserveKurus:0,remainingKurus:2768,limitKurus:5000}}:{})});
  const completed=cost();completed.chargedKurus=2400;completed.attemptChargedKurus=168;completed.breakdown.verifiedUsageKurus+=168;
  return {phase:'complete',result:structuredClone(data.audit),pricingProof:'synthetic-only',cost:completed};
 };
 window.PipelinePricingRequest=async()=>({phase:'complete',result:structuredClone(scenario==='restored'?continuity.restored.pricing:['continuity','english','empty'].includes(scenario)?continuity.pricing:data.pricing.TRY),proposalProof:'synthetic-only'});
 window.PipelineProposalRequest=async payload=>{
  window.reviewComposeCalls.push(structuredClone(payload));
  if(scenario==='english'&&payload.brief.language==='en')throw Object.assign(Error('İngilizce teklif çevirisi tamamlanamadı. BHS ve fiyatlar korundu.'),{code:'model_temporarily_unavailable'});
  return {phase:'complete',result:structuredClone(scenario==='restored'?continuity.restored.proposal:['continuity','english','empty'].includes(scenario)?continuity.proposal:data.proposal.TRY),saveProof:'synthetic-only'};
 };
 window.PipelineOfferRequest=async()=>{throw Error('Bu örnek kaydedilmez. Gerçek veriler değiştirilmedi.');};
 function open(kind){
  document.querySelector('#offer-brief-dialog .ob-close')?.click();scenario=kind;recovered=false;window.reviewCalls=[];window.reviewComposeCalls=[];
  window.PipelineOfferBrief.open({lead:{id:'synthetic-recovery',company:'Örnek Marka',name:'Örnek Yetkili',notes:'Örnek büyüme görüşmesi.',timeline:[]},spaceId:'synthetic-space'});
  const form=document.querySelector('#offer-brief-form');
  for(const [name,value]of Object.entries({segment:'corporate',website:'https://brand.example/',goals:'Ölçülebilir büyüme.',needs:'Kanalların birlikte yönetimi.',services:'Growth danışmanlığı, Meta ve Google Ads.'}))form.elements[name].value=value;
  if(kind==='english')form.elements.language.value='en';
  form.requestSubmit();
 }
 document.querySelector('#review-model').onclick=()=>open('model');
 document.querySelector('#review-budget').onclick=()=>open('budget');
 document.querySelector('#review-continuity').onclick=()=>open('continuity');
 document.querySelector('#review-english').onclick=()=>open('english');
 document.querySelector('#review-empty').onclick=()=>open('empty');
 document.querySelector('#review-restored').onclick=()=>open('restored');
})();
