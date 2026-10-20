(function(){
  'use strict';
  function mount(container,{getWebsite,getContext,getBrandName,onChange}){
    let selected=null,verifiedData=null,disposed=false,epoch=0;
    container.innerHTML=`<div class="ol-header"><strong>Marka logosu</strong><span>Ekran görüntüsünden hazırlanır</span></div>
      <label class="ol-upload-label" for="ob-logo-screenshot">Logo ekran görüntüsü yükle</label>
      <input id="ob-logo-screenshot" class="ol-file" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="ol-upload-hint ol-upload-status">
      <p id="ol-upload-hint" class="ol-status">Logoyu ve çevresinde biraz boşluğu içeren ekran görüntüsünü yükle. PNG, JPG veya WebP · en fazla 2 MB. Arka planı önceden temizlemen gerekmez.</p>
      <p id="ol-upload-status" class="ol-status" role="status">Ekran görüntüsü bekleniyor.</p>
      <div class="ol-result" hidden>
        <div class="ol-comparison"><figure><figcaption>Yüklediğin ekran görüntüsü</figcaption><div class="ol-original"><img alt="Yüklenen logo ekran görüntüsü"></div></figure><figure><figcaption>Şeffaf logo</figcaption><div class="ol-checker"><img alt="Arka planı kaldırılan marka logosu"></div></figure></div>
        <p class="ol-quality"></p><p class="ol-status">Görsel onayı, teklif taslağı oluştuğunda teklif üzerinde yapılacak. Analize devam etmek için burada onay vermen gerekmez.</p>
        <label class="ol-background-label">Logo alanının zemini<select class="ol-background"><option value="auto">Otomatik</option><option value="#ffffff">Beyaz</option><option value="#171717">Koyu</option><option value="#626262">Gri</option></select></label>
        <div class="ol-placement"><span>Sellf</span><div class="ol-logo-zone"><img alt="Teklif üst bölümündeki logo yerleşimi"></div></div><p class="ol-placement-label">Teklif üst bölümündeki yerleşim örneği · Zemin yalnızca logo alanına uygulanır.</p>
      </div>`;
    const status=container.querySelector('#ol-upload-status'),input=container.querySelector('.ol-file'),result=container.querySelector('.ol-result'),background=container.querySelector('.ol-background');
    const normalize=()=>window.PipelineOfferBriefModel.webUrl(getWebsite());
    function apply(){
      if(!selected)return;
      const color=background.value==='auto'?(selected.placement?.background||'#ffffff'):background.value;
      container.querySelector('.ol-logo-zone').style.background=color;
      onChange({verifiedData,logoProof:verifiedData?.logoProof,status:'review',image:selected.image,source:selected.source,sourceType:'upload',sourceWebsite:normalize(),candidateId:selected.id,quality:selected.quality,placement:{background:color,area:'logo-only'},reviewed:false,generated:false});
    }
    background.addEventListener('change',apply);
    input.addEventListener('change',async()=>{
      const request=++epoch,file=input.files?.[0];
      selected=null;result.hidden=true;onChange(null);
      if(!file){status.textContent='Ekran görüntüsü bekleniyor.';return;}
      const error=window.PipelineOfferBriefModel.validateLogo(file);
      if(error){status.textContent=error;return;}
      status.textContent='Ekran görüntüsünün arka planı temizleniyor…';onChange({status:'loading',sourceType:'upload'});
      try{
        if(typeof window.PipelineLogoRequest!=='function')throw new Error('Logo işleme servisi bu önizlemede bağlı değil.');
        const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Görsel okunamadı.'));reader.onabort=()=>reject(new Error('Görsel okuma durduruldu.'));reader.readAsDataURL(file);});
        if(disposed||request!==epoch)return;
        const data=await window.PipelineLogoRequest({mode:'upload',image,context:getContext?.(),brandName:getBrandName?.()});
        if(disposed||request!==epoch)return;
        const candidate=data.candidates?.[0];
        if(data.generated!==false||!candidate?.image?.startsWith('data:image/png;base64,')||!candidate?.source?.startsWith('data:image/png;base64,')||candidate.quality?.transparency!==true||candidate.quality?.matteStable!==true||candidate.quality?.touchesEdge)throw new Error('Görsel güvenle şeffaflaştırılamadı. Sonuç teklife eklenmedi.');
        selected=candidate;verifiedData=data;
        container.querySelector('.ol-original img').src=candidate.source;
        container.querySelector('.ol-checker img').src=candidate.image;
        container.querySelector('.ol-placement img').src=candidate.image;
        background.value='auto';
        container.querySelector('.ol-quality').textContent='Şeffaf PNG hazır · '+candidate.quality.width+' × '+candidate.quality.height+' px. Teklif taslağı için hazırlandı.';
        result.hidden=false;status.textContent='Arka plan temizlendi. Teklif üzerindeki yerleşimi kontrol et.';apply();
      }catch(error){
        if(disposed||request!==epoch)return;
        status.textContent=error.message||'Görsel işlenemedi.';onChange({status:'error',sourceType:'upload'});
      }
    });
    return {invalidate(){if(selected)apply();},destroy(){disposed=true;++epoch;}};
  }
  window.PipelineLogoControl=Object.freeze({mount});
})();
