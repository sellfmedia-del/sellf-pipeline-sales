(function(){'use strict';
 const token=location.hash.slice(1),slug=location.pathname.split('/').filter(Boolean).length===1?decodeURIComponent(location.pathname.slice(1)):null,offerUrl=location.origin+location.pathname+(token?'#'+token:''),form=document.querySelector('#portal-login'),status=document.querySelector('#portal-status');
 // Keep the capability and password only in memory; never in localStorage/logs.
 let password='';history.replaceState(null,'',location.pathname);
 async function request(payload){const r=await fetch('/api/offer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,...(slug?{slug}:{token}),password})});const data=await r.json();if(!r.ok)throw Error(data.error||'Teklif açılamadı.');return data;}
 form.addEventListener('submit',async e=>{e.preventDefault();password=form.elements.password.value;const button=form.querySelector('button');button.disabled=true;status.textContent='Teklif açılıyor…';try{const result=await request({action:'access'});form.elements.password.value='';password='';form.hidden=true;PipelineProposal.mount(document.querySelector('#customer-offer'),result.document,{offerUrl,offerId:result.id});}catch(error){status.textContent=error.message;password='';}finally{button.disabled=false;}});
})();
