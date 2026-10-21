/* Offer UI is isolated from the CRM data model and its bulk save function.
 * Records are retrieved through the isolated authorized offer endpoint.
 */
(function () {
  'use strict';

  function mount(container, context) {
    if (!container) return;
    container.innerHTML = `
      <h2 class="sidebar-key">Teklif</h2>
      <p class="offer-empty">Henüz teklif oluşturulmadı.</p>
      <dl class="offer-details">
        <div><dt>Durum</dt><dd>Oluşturulmadı</dd></div>
        <div><dt>Müşteri bağlantısı</dt><dd>—</dd></div>
        <div><dt>Şifre</dt><dd>—</dd></div>
        <div><dt>Sürüm</dt><dd>—</dd></div>
      </dl>
      <button type="button" class="btn offer-view" hidden>Kaydedilen teklifi gör</button>
      <button type="button" class="btn offer-publish" hidden>Taslağı yayınla</button>
      <p class="offer-status" role="status" aria-live="polite"></p>
      <button type="button" class="btn btn-primary offer-create"
        aria-describedby="offer-availability">Teklif Oluştur</button>
      <p class="offer-help" id="offer-availability">Marka bilgilerini ve ihtiyaçları kontrol ederek başla.</p>`;
    const rows=container.querySelectorAll('.offer-details dd');
    const status=container.querySelector('.offer-status'),publishButton=container.querySelector('.offer-publish');
    let latest=null;
    function show(offer){
      if(latest?.version>offer.version||(latest?.id===offer.id&&latest.state==='published'&&offer.state==='draft'))return;
      latest=latest?.id===offer.id?{...latest,...offer}:offer;offer=latest;
      container.querySelector('.offer-empty').textContent='Önerilen aylık bedel: '+new Intl.NumberFormat('tr-TR').format(offer.monthlyAmount??offer.monthly_amount)+' TL';
      rows[0].textContent=offer.state==='published'?'Yayınlandı':'Taslak kaydedildi';rows[3].textContent='v'+offer.version;container.querySelector('.offer-view').hidden=!offer.customer_document;
      publishButton.hidden=!offer.customer_document||offer.state==='published';rows[1].textContent='—';rows[2].textContent='—';
      if(offer.publicUrl){rows[1].replaceChildren();const a=document.createElement('a');a.href=offer.publicUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Müşteri teklifini aç ↗';rows[1].append(a);rows[2].textContent=offer.password;}
    }
    async function load(){
      try{const result=await window.PipelineOfferRequest?.({action:'list',leadId:context.lead.id});if(container.isConnected&&result?.offers?.[0]){show(result.offers[0]);status.textContent='';}}
      catch{if(container.isConnected)status.textContent='Kaydedilen teklif yüklenemedi. Kartı kapatıp yeniden açarak tekrar dene.';}
    }
    load();
    const receive=event=>{if(!container.isConnected){window.removeEventListener('pipeline-offer-saved',receive);return;}if(event.detail.leadId===context.lead.id&&event.detail.spaceId===context.spaceId){show(event.detail.offer);load();if(typeof renderBoard==='function')renderBoard();}};
    window.addEventListener('pipeline-offer-saved',receive);
    container.querySelector('.offer-view').addEventListener('click',()=>{
      if(!latest?.customer_document)return;const dialog=document.createElement('dialog');dialog.id='offer-saved-dialog';const close=document.createElement('button');close.type='button';close.textContent='Karta dön';close.className='offer-saved-close';const box=document.createElement('div');dialog.append(close,box);document.body.append(dialog);window.PipelineProposal.mount(box,{...latest.customer_document,version:latest.version});const done=()=>{dialog.close();dialog.remove();};close.addEventListener('click',done);dialog.addEventListener('cancel',e=>{e.preventDefault();done();});dialog.showModal();
    });
    publishButton.addEventListener('click',async()=>{
      if(!latest?.id||publishButton.disabled)return;
      const id=latest.id;publishButton.disabled=true;status.textContent='Müşteri bağlantısı hazırlanıyor…';
      try{const result=await window.PipelineOfferRequest({action:'publish',offerId:id});if(!container.isConnected)return;
        if(latest?.id===id)show({...latest,state:'published',publicUrl:result.url,password:result.password});
        status.textContent='Müşteri bağlantısı hazır. Bağlantı ve şifre kartta gösteriliyor.';
      }catch(error){if(container.isConnected)status.textContent=error.message||'Müşteri bağlantısı oluşturulamadı. Kaydedilen teklif korundu.';}
      finally{publishButton.disabled=false;}
    });
    const publish=event=>{if(!container.isConnected){window.removeEventListener('pipeline-offer-published',publish);return;}if(event.detail.leadId!==context.lead.id||event.detail.spaceId!==context.spaceId)return;load();};window.addEventListener('pipeline-offer-published',publish);
    const button = container.querySelector('.offer-create');
    button.disabled = !window.PipelineOfferBrief || !context?.lead?.id || !context.spaceId;
    button.addEventListener('click', () => window.PipelineOfferBrief?.open(context, button));
  }

  window.PipelineOffers = Object.freeze({ mount });
})();
