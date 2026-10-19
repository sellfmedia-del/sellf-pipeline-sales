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
      <button type="button" class="btn offer-view" hidden>Kaydedilen teklifi aç</button>
      <button type="button" class="btn btn-primary offer-create"
        aria-describedby="offer-availability">Teklif Oluştur</button>
      <p class="offer-help" id="offer-availability">Marka bilgilerini ve ihtiyaçları kontrol ederek başla.</p>`;
    const rows=container.querySelectorAll('.offer-details dd');
    let latest=null;
    function show(offer){latest=offer;
      container.querySelector('.offer-empty').textContent='Önerilen aylık bedel: '+new Intl.NumberFormat('tr-TR').format(offer.monthlyAmount??offer.monthly_amount)+' TL';
      rows[0].textContent=offer.state==='published'?'Yayınlandı':'Taslak kaydedildi';rows[3].textContent='v'+offer.version;container.querySelector('.offer-view').hidden=!offer.customer_document;
      if(offer.publicUrl){rows[1].replaceChildren();const a=document.createElement('a');a.href=offer.publicUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Müşteri teklifini aç ↗';rows[1].append(a);rows[2].textContent=offer.password;}
    }
    window.PipelineOfferRequest?.({action:'list',leadId:context.lead.id}).then(result=>{if(container.isConnected&&result.offers?.[0])show(result.offers[0]);}).catch(()=>{});
    const receive=event=>{if(!container.isConnected){window.removeEventListener('pipeline-offer-saved',receive);return;}if(event.detail.leadId===context.lead.id&&event.detail.spaceId===context.spaceId){show(event.detail.offer);if(typeof renderBoard==='function')renderBoard();}};
    window.addEventListener('pipeline-offer-saved',receive);
    container.querySelector('.offer-view').addEventListener('click',()=>{
      if(!latest?.customer_document)return;const dialog=document.createElement('dialog');dialog.id='offer-saved-dialog';const close=document.createElement('button');close.type='button';close.textContent='Karta dön';close.className='offer-saved-close';const box=document.createElement('div');dialog.append(close,box);document.body.append(dialog);window.PipelineProposal.mount(box,{...latest.customer_document,version:latest.version});const done=()=>{dialog.close();dialog.remove();};close.addEventListener('click',done);dialog.addEventListener('cancel',e=>{e.preventDefault();done();});dialog.showModal();
    });
    const publish=event=>{if(!container.isConnected){window.removeEventListener('pipeline-offer-published',publish);return;}if(event.detail.leadId!==context.lead.id||event.detail.spaceId!==context.spaceId)return;window.PipelineOfferRequest?.({action:'list',leadId:context.lead.id}).then(result=>{if(result.offers?.[0])show(result.offers[0]);}).catch(()=>{});};window.addEventListener('pipeline-offer-published',publish);
    const button = container.querySelector('.offer-create');
    button.disabled = !window.PipelineOfferBrief || !context?.lead?.id || !context.spaceId;
    button.addEventListener('click', () => window.PipelineOfferBrief?.open(context, button));
  }

  window.PipelineOffers = Object.freeze({ mount });
})();
