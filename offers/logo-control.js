(function () {
  'use strict';
  function mount(container, {getWebsite,onChange}) {
    let current='',busy=false,disposed=false,selected=null;
    container.innerHTML=`<div class="ol-header"><strong>Marka logosu</strong><span>Siteden otomatik alınır</span></div>
      <p class="ol-status" role="status">Web sitesini girince logo otomatik hazırlanır.</p>
      <button type="button" class="ol-fetch">Logoyu siteden al</button>
      <div class="ol-result" hidden><label class="ol-choice-label">Bulunan logo alanı<select class="ol-choice"></select></label>
        <div class="ol-comparison"><figure><figcaption>Sitedeki orijinal kesit</figcaption><div class="ol-original"><img alt="Sitede görünen orijinal logo kesiti"></div></figure><figure><figcaption>Şeffaf logo</figcaption><div class="ol-checker"><img alt="Arka planı kaldırılan marka logosu"></div></figure></div>
        <p class="ol-quality"></p><label class="ol-review" hidden><input type="checkbox"> Logonun harfleri, renkleri ve detayları doğru görünüyor.</label>
        <div class="ol-placement"><span>Sellf</span><img alt="Teklif üst bölümündeki logo yerleşimi"></div><p class="ol-placement-label">Teklif üst bölümündeki yerleşim örneği</p>
      </div>`;
    const status=container.querySelector('.ol-status'),button=container.querySelector('.ol-fetch'),result=container.querySelector('.ol-result'),choice=container.querySelector('.ol-choice'),review=container.querySelector('.ol-review'),check=review.querySelector('input');
    const normalize=()=>window.PipelineOfferBriefModel.webUrl(getWebsite());
    function apply() {
      if(!selected)return;
      onChange({status:selected.quality.status==='ready'||check.checked?'ready':'review',image:selected.image,source:selected.source,sourceWebsite:current,candidateId:selected.id,quality:selected.quality,reviewed:check.checked,generated:false});
    }
    function show(candidate) {
      selected=candidate;check.checked=false;
      container.querySelector('.ol-original img').src=candidate.source;
      container.querySelector('.ol-checker img').src=candidate.image;
      container.querySelector('.ol-placement img').src=candidate.image;
      const dark=candidate.quality.foregroundLuminance>160;
      container.querySelector('.ol-placement').style.background=dark?'#171717':'#fff';
      container.querySelector('.ol-placement span').style.color=dark?'#fff':'#171717';
      review.hidden=candidate.quality.status==='ready';
      container.querySelector('.ol-quality').textContent=candidate.quality.status==='ready'?'Şeffaflık, kenarlar ve piksel bütünlüğü kontrolleri geçti.':'Otomatik kontrol bu kesitte görsel inceleme gerektiriyor. Orijinal ile karşılaştır.';
      result.hidden=false;apply();
    }
    check.addEventListener('change',apply);
    async function prepare() {
      if(disposed)return;
      const website=normalize();
      if(!website){status.textContent='Önce geçerli bir web sitesi adresi gir.';return;}
      if(busy||website===current&&selected)return;
      current=website;busy=true;selected=null;button.disabled=true;result.hidden=true;
      status.textContent='Site açılıyor, görünür logo kesiliyor ve arka planı temizleniyor…';onChange({status:'loading',sourceWebsite:current});
      try {
        if(typeof window.PipelineLogoRequest!=='function')throw new Error('Otomatik logo servisi bu önizlemede bağlı değil. Logo motorunun önizlemesini kullan.');
        const data=await window.PipelineLogoRequest({website});
        if(disposed)return;
        if(normalize()!==website){current='';return;}
        const candidates=data.candidates?.filter(item=>item?.image?.startsWith('data:image/png;base64,')&&item?.source?.startsWith('data:image/png;base64,')&&item.quality);
        if(!candidates?.length)throw new Error('Kullanılabilir logo kesiti dönmedi.');
        choice.replaceChildren();
        candidates.forEach((candidate,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent='Logo alanı '+(index+1);choice.appendChild(option);});
        choice.onchange=()=>show(candidates[Number(choice.value)]);
        show(candidates[0]);status.textContent='Logo siteden alındı. Orijinal kesit ve teklif yerleşimi aşağıda.';button.textContent='Logoyu yeniden al';
      } catch(error) {
        if(disposed)return;
        current='';status.textContent=error.message||'Logo alınamadı. Tekrar dene.';onChange({status:'error'});
      } finally {
        busy=false;button.disabled=false;
        if(!disposed&&normalize()&&normalize()!==website)prepare();
      }
    }
    button.addEventListener('click',()=>{if(!busy){current='';prepare();}});
    return {
      prepare,
      invalidate() {if(normalize()!==current){selected=null;result.hidden=true;onChange(null);status.textContent='Web sitesi değişti. Yeni siteden logo hazırlanacak.';}},
      destroy() {disposed=true;}
    };
  }
  window.PipelineLogoControl=Object.freeze({mount});
})();
