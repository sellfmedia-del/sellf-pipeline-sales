/* Service boundary; no bulk CRM saves, embedded secrets or client-side mail. */
(function(){'use strict';
 async function request(path,payload,auth){
  const headers={'Content-Type':'application/json'};
  if(typeof supabaseClient!=='undefined'){
   const {data,error}=await supabaseClient.auth.getSession();if(error)throw Error('Pipeline oturumu doğrulanamadı.');
   if(data?.session?.access_token)headers.Authorization='Bearer '+data.session.access_token;
  }
  const audit=path==='audit',readOnly=audit&&payload.action==='status';
  if(audit)headers['X-Offer-Request-Id']=crypto.randomUUID();
  // Only status reads can be retried. A lost start/advance response may have
  // already created a billable provider interaction on another function instance.
  for(let attempt=0;;attempt++){
   let response,result;
   try{
    response=await fetch((window.PipelineOfferServiceBase||'')+'/api/'+path,{method:'POST',headers,body:JSON.stringify(payload),credentials:'same-origin',...(readOnly?{signal:AbortSignal.timeout(45000)}:{})});
    if(readOnly&&[502,503,504].includes(response.status))throw Error('temporary_status_failure');
    try{result=await response.json();}catch(error){
     if(audit)throw error;
     throw Error('Teklif servisi bu adreste henüz etkin değil.');
    }
   }catch(error){
    if(!audit)throw error;
    if(readOnly&&attempt<2){await new Promise(resolve=>setTimeout(resolve,1500*(attempt+1)));continue;}
    const failure=Error('BHS servisiyle bağlantı kesildi; isteğin yanıtı alınamadı.');
    failure.code='audit_transport';failure.canResume=readOnly;failure.requestId=headers['X-Offer-Request-Id'];throw failure;
   }
   if(!response.ok){const failure=Error(result.error||'Teklif işlemi tamamlanamadı.');failure.code=result.code;if(audit)failure.requestId=response.headers.get('X-Offer-Request-Id')||headers['X-Offer-Request-Id'];throw failure;}
   return result;
  }
 }
 window.PipelineLogoRequest ||= payload=>request(payload.mode==='upload'?'logo-upload':'logo',payload);
 window.PipelineAuditRequest ||= payload=>request('audit',payload);
 window.PipelinePricingRequest ||= payload=>request('pricing',payload);
 window.PipelineProposalRequest ||= payload=>request('proposal',payload);
 window.PipelineOfferRequest ||= payload=>request('offer',payload,true);
 window.PipelineOfferReuseRequest ||= payload=>request('offer-reuse',payload,true);
})();
