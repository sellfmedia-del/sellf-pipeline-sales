/* Offer UI is isolated from the CRM data model and its bulk save function.
 * Records are retrieved through the isolated authorized offer endpoint.
 */
(function () {
  'use strict';

  function mount(container, context) {
    if (!container) return;
    container.innerHTML = `
      <h2 class="sidebar-key">Teklif</h2>
      <label class="offer-selection" hidden>Kaydedilen teklifler<select class="offer-select" aria-label="Kaydedilen teklifler"></select></label>
      <p class="offer-empty">Henüz teklif oluşturulmadı.</p>
      <dl class="offer-details">
        <div><dt>Durum</dt><dd>Oluşturulmadı</dd></div>
        <div><dt>Müşteri bağlantısı</dt><dd>—</dd></div>
        <div><dt>Şifre</dt><dd>—</dd></div>
        <div><dt>Sürüm</dt><dd>—</dd></div>
      </dl>
      <button type="button" class="btn offer-view" hidden>Kaydedilen teklifi gör</button>
      <button type="button" class="btn offer-publish" hidden>Taslağı yayınla</button>
      <button type="button" class="btn offer-prices" hidden>Fiyatları güncelle</button>
      <p class="offer-status" role="status" aria-live="polite"></p>
      <button type="button" class="btn btn-primary offer-create"
        aria-describedby="offer-availability">Teklif Oluştur</button>
      <p class="offer-help" id="offer-availability">Marka bilgilerini ve ihtiyaçları kontrol ederek başla.</p>`;
    const rows=container.querySelectorAll('.offer-details dd');
    const status=container.querySelector('.offer-status'),publishButton=container.querySelector('.offer-publish');
    let latest=null,selectedId=null,loadEpoch=0,variantsReady=false;
    const selector=container.querySelector(".offer-select"),createButton=container.querySelector(".offer-create");
    function show(offer){
      selectedId=offer.id;
      latest=latest?.id===offer.id?{...latest,...offer}:offer;offer=latest;
      const doc=offer.customer_document,quote=doc?.quote,amount=quote?.status==='ready'?quote.alternatives.find(a=>a.id===doc.recommendedAlternativeId)?.monthlyAmount:offer.monthlyAmount??offer.monthly_amount;
      container.querySelector('.offer-empty').textContent='Aylık bedel: '+new Intl.NumberFormat('tr-TR',{style:'currency',currency:quote?.currency||'TRY'}).format(amount);
      createButton.textContent='Yeni Teklif Oluştur';container.querySelector('.offer-prices').hidden=!variantsReady;createButton.disabled=!variantsReady;
      rows[0].textContent=offer.state==='published'?'Yayınlandı':'Taslak kaydedildi';rows[3].textContent='v'+offer.version;container.querySelector('.offer-view').hidden=!offer.customer_document;
      publishButton.hidden=!offer.customer_document||offer.state==='published';rows[1].textContent='—';rows[2].textContent='—';
      if(offer.publicUrl){rows[1].replaceChildren();const a=document.createElement('a');a.href=offer.publicUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Müşteri teklifini aç ↗';rows[1].append(a);rows[2].textContent=offer.password;}
    }
    async function load(preferredId){
      const epoch=++loadEpoch;
      let failed=false;
      createButton.disabled=true;publishButton.disabled=true;container.querySelector('.offer-prices').disabled=true;
      try{
        const result=await window.PipelineOfferRequest?.({action:'list',leadId:context.lead.id});
        if(!container.isConnected||epoch!==loadEpoch)return;
        const first=result?.offers?.[0];if(!first)return;
        let catalog;try{catalog=(await window.PipelineOfferRequest({action:'catalog',leadId:context.lead.id})).offers;}catch{/* Older gateway: keep viewing/publication available. */}
        if(!container.isConnected||epoch!==loadEpoch)return;
        variantsReady=Array.isArray(catalog);
        const id=preferredId||selectedId||first.id;
        if(variantsReady){
          selector.replaceChildren();for(const row of catalog){const option=document.createElement('option');option.value=row.id;option.textContent='Teklif '+row.version+' · '+(row.state==='published'?'Yayında':'Taslak')+' · '+new Date(row.created_at).toLocaleDateString('tr-TR');selector.append(option);}
          container.querySelector('.offer-selection').hidden=catalog.length<2;
        }
        const offer=id===first.id?first:(await window.PipelineOfferRequest({action:'detail',offerId:id})).offer;
        if(!container.isConnected||epoch!==loadEpoch)return;show(offer);selector.value=offer.id;status.textContent='';
      }catch{failed=true;if(container.isConnected&&epoch===loadEpoch)status.textContent='Kaydedilen teklif yüklenemedi. Kartı kapatıp yeniden açarak tekrar dene.';}
      finally{if(container.isConnected&&epoch===loadEpoch){createButton.disabled=failed||Boolean(latest&&!variantsReady)||!window.PipelineOfferBrief;publishButton.disabled=false;container.querySelector('.offer-prices').disabled=false;}}
    }
    selector.addEventListener('change',()=>load(selector.value));
    load();
    const receive=event=>{if(!container.isConnected){window.removeEventListener('pipeline-offer-saved',receive);return;}if(event.detail.leadId===context.lead.id&&event.detail.spaceId===context.spaceId){show(event.detail.offer);load(event.detail.offer.id);if(typeof renderBoard==='function')renderBoard();}};
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
    button.disabled = true;
    button.addEventListener('click', async() => {
      if(!latest)return window.PipelineOfferBrief?.open(context,button);
      if(!variantsReady)return;button.disabled=true;
      try{const info=await window.PipelineOfferReuseRequest({action:'info',sourceOfferId:latest.id,context:{leadId:context.lead.id,spaceId:context.spaceId}});window.PipelineOfferBrief?.open(context,button,{sourceOfferId:latest.id,info});}
      catch(error){status.textContent=error.message||'Yeni teklif formu açılamadı.';}finally{button.disabled=false;}
    });
    container.querySelector('.offer-prices').addEventListener('click',()=>openPrices(latest,()=>load(selectedId)));
  }

  async function openPrices(offer,onSaved){
    if(!offer?.id)return;
    const dialog=document.createElement('dialog');dialog.id='offer-prices-dialog';dialog.innerHTML=`<form novalidate><h2>Fiyatları güncelle</h2><p class="op-intro">Yalnızca seçilen teklifin fiyatları güncellenir. Kapsam ve diğer içerikler korunur.</p><div class="op-fields"></div><label class="op-confirm" hidden><input type="checkbox"> Önerilen kârlılık tabanının altındaki fiyatı onaylıyorum.</label><p class="op-status" role="status">Fiyatlar yükleniyor…</p><details class="op-history"><summary>Fiyat değişikliği geçmişi</summary><div></div></details><footer><button type="button" class="op-close">Vazgeç</button><button type="submit" class="op-save" disabled></button></footer></form>`;
    document.body.append(dialog);dialog.showModal();const close=()=>{dialog.close();dialog.remove();};dialog.querySelector('.op-close').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    const status=dialog.querySelector('.op-status'),save=dialog.querySelector('.op-save'),box=dialog.querySelector('.op-fields');let terms,requestId=crypto.randomUUID(),lastInput='';
    try{
      const result=await window.PipelineOfferRequest({action:'detail',offerId:offer.id});if(!dialog.isConnected)return;terms=result.priceTerms;
      const money=value=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:terms.currency}).format(value);
      if(terms.exchangeRate){const p=document.createElement('p');p.textContent='Teklifin sabit kuru: 1 USD = '+terms.exchangeRate.rate+' TL · '+terms.exchangeRate.publishedAt;box.append(p);}
      for(const term of terms.alternatives){
        const section=document.createElement('section'),label=document.createElement('label'),input=document.createElement('input'),basis=document.createElement('p'),difference=document.createElement('p');
        label.textContent=term.name+' · '+terms.currency;input.type='number';input.min='0.01';input.step='0.01';input.required=true;input.value=term.current;input.name=term.id;label.append(input);
        basis.textContent='İlk hesaplanan: '+money(term.recommended)+' · Asgari: '+money(term.minimum);difference.className='op-difference';section.append(label,basis,difference);box.append(section);
      }
      const amounts=()=>Object.fromEntries(terms.alternatives.map(t=>[t.id,dialog.querySelector('[name="'+t.id+'"]').value]));
      const refresh=()=>{
        let below=false;for(const term of terms.alternatives){const input=dialog.querySelector('[name="'+term.id+'"]'),value=Number(input.value),p=input.closest('section').querySelector('.op-difference');const discount=term.recommended?(1-value/term.recommended)*100:0;p.textContent=money(value)+(discount>=0?' · İndirim: %'+discount.toFixed(1):' · Artış: %'+(-discount).toFixed(1))+(value<term.minimum?' · Asgari tutarın altında':'');if(value<term.minimum)below=true;}
        dialog.querySelector('.op-confirm').hidden=!below;
        if(!below)dialog.querySelector('.op-confirm input').checked=false;
        requestId=crypto.randomUUID();lastInput='';
      };
      box.addEventListener('input',refresh);refresh();save.disabled=false;save.textContent=result.offer.state==='published'?'Güncelle ve yayınla':'Fiyatları kaydet';status.textContent='';
      window.PipelineOfferRequest({action:'price_history',offerId:offer.id}).then(result=>{
        if(!dialog.isConnected)return;const history=dialog.querySelector('.op-history div');
        if(!result.changes?.length)history.textContent='Henüz fiyat değişikliği yok.';
        for(const change of result.changes||[]){const p=document.createElement('p');p.textContent=new Date(change.created_at).toLocaleString('tr-TR')+' · '+terms.alternatives.map(t=>t.name+': '+money(change.before_prices[t.id])+' → '+money(change.after_prices[t.id])).join(' · ');history.append(p);}
      }).catch(()=>{if(dialog.isConnected)dialog.querySelector('.op-history div').textContent='Fiyat geçmişi yüklenemedi.';});
      dialog.querySelector('form').addEventListener('submit',async event=>{
        event.preventDefault();if(save.disabled)return;
        if(!dialog.querySelector('form').reportValidity())return;
        const values=amounts(),confirmed=dialog.querySelector('.op-confirm input').checked;
        if(terms.alternatives.some(t=>Number(values[t.id])<t.minimum)&&!confirmed){status.textContent='Asgari tutarın altındaki fiyatı ayrıca onayla.';return;}
        const fingerprint=JSON.stringify({values,confirmed});if(lastInput&&fingerprint!==lastInput)requestId=crypto.randomUUID();lastInput=fingerprint;
        save.disabled=true;status.textContent='Fiyatlar kaydediliyor…';
        try{await window.PipelineOfferRequest({action:'prices',offerId:offer.id,requestId,expectedDocumentHash:terms.documentHash,amounts:values,confirmedBelowMinimum:confirmed});onSaved();close();}
        catch(error){status.textContent=error.message||'Fiyatlar kaydedilemedi.';}finally{save.disabled=false;}
      });
    }catch(error){status.textContent=error.message||'Fiyatlar yüklenemedi.';}
  }

  window.PipelineOffers = Object.freeze({ mount });
})();
