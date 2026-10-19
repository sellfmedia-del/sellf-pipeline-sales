/* Service boundary; no bulk CRM saves, embedded secrets or client-side mail. */
(function(){'use strict';
 async function request(path,payload,auth){
  const headers={'Content-Type':'application/json'};
  if(auth&&typeof supabaseClient!=='undefined'){
   const {data,error}=await supabaseClient.auth.getSession();if(error)throw Error('Pipeline oturumu doğrulanamadı.');
   if(data?.session?.access_token)headers.Authorization='Bearer '+data.session.access_token;
  }
  const response=await fetch((window.PipelineOfferServiceBase||'')+'/api/'+path,{method:'POST',headers,body:JSON.stringify(payload),credentials:'same-origin'});
  let result;try{result=await response.json();}catch{throw Error('Teklif servisi bu adreste henüz etkin değil.');}
  if(!response.ok)throw Error(result.error||'Teklif işlemi tamamlanamadı.');return result;
 }
 window.PipelineLogoRequest ||= payload=>request(payload.mode==='upload'?'logo-upload':'logo',payload);
 window.PipelineAuditRequest ||= payload=>request('audit',payload);
 window.PipelinePricingRequest ||= payload=>request('pricing',payload);
 window.PipelineProposalRequest ||= payload=>request('proposal',payload);
 window.PipelineOfferRequest ||= payload=>request('offer',payload,true);
})();
