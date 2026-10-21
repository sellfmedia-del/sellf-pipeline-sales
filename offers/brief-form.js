/* Isolated offer brief and research UI. Targeted offer persistence is separate from CRM bulk saves. */
(function () {
  'use strict';
  let active = null;
  const labels = { kobi: 'KOBİ', corporate: 'Kurumsal', key_account: 'Key Account' };
  const fields = ['brandName', 'segment', 'website', 'goals', 'needs', 'services', 'budget', 'currency', 'meetingNotes'];

  function open(context, returnFocus) {
    const model = window.PipelineOfferBriefModel;
    if (!model || !context?.lead?.id || !context.spaceId) return;
    if (active) return;
    const draft = model.createDraft(context);
    const dialog = document.createElement('dialog');
    dialog.id = 'offer-brief-dialog';
    dialog.setAttribute('aria-labelledby', 'offer-brief-title');
    dialog.innerHTML = `
      <header class="ob-header">
        <div><p class="ob-eyebrow">TEKLİF HAZIRLIĞI</p><h1 id="offer-brief-title">Markayı ve ihtiyacı netleştir</h1><p class="ob-subtitle"></p></div>
        <button type="button" class="ob-close" aria-label="Brief ekranını kapat">×</button>
      </header>
      <ol class="ob-steps" aria-label="Teklif hazırlama adımları"><li aria-current="step"><span>1</span> Brief</li><li><span>2</span> BHS analizi</li><li><span>3</span> Teklif</li><li><span>4</span> Onay</li></ol>
      <div class="ob-body">
        <form id="offer-brief-form" novalidate>
          <p class="ob-intro">Karttaki bilgileri kontrol et, araştırmanın yönünü belirle. <span>*</span> işaretli alanlar zorunludur.</p>
          <div id="ob-errors" class="ob-errors" role="alert" hidden></div>
          <fieldset><legend>Marka bilgileri</legend><div class="ob-grid">
            <div class="ob-field"><label for="ob-brandName">Marka adı <span>*</span></label><input id="ob-brandName" name="brandName" required maxlength="200" autocomplete="organization"><p class="ob-error" id="error-brandName"></p></div>
            <div class="ob-field"><label for="ob-segment">Müşteri segmenti <span>*</span></label><select id="ob-segment" name="segment" required><option value="">Segment seç</option><option value="kobi">KOBİ</option><option value="corporate">Kurumsal</option><option value="key_account">Key Account</option></select><p class="ob-hint">Hesaplamada yalnızca bu segmentin maliyetleri kullanılır.</p><p class="ob-error" id="error-segment"></p></div>
            <div class="ob-field ob-wide"><label for="ob-website">Web sitesi <span>*</span></label><input id="ob-website" name="website" type="text" inputmode="url" placeholder="marka.com" maxlength="2048" required><p class="ob-error" id="error-website"></p></div>
            <div class="ob-field ob-wide"><div class="ob-auto-logo"></div><p class="ob-error" id="error-logoUrl"></p></div>
          </div></fieldset>
          <fieldset><legend>Hedefler ve kapsam</legend><div class="ob-grid">
            <div class="ob-field ob-wide"><label for="ob-goals">Hedefler <span>*</span></label><textarea id="ob-goals" name="goals" placeholder="Marka hangi iş sonucuna ulaşmak istiyor?" maxlength="10000" required></textarea><p class="ob-error" id="error-goals"></p></div>
            <div class="ob-field ob-wide"><label for="ob-needs">İhtiyaçlar ve öncelikler <span>*</span></label><textarea id="ob-needs" name="needs" placeholder="Mevcut darboğazlar, öncelikler ve bilinen kısıtlar" maxlength="10000" required></textarea><p class="ob-error" id="error-needs"></p></div>
            <div class="ob-field ob-wide"><label for="ob-services">Konuşulan hizmetler <span>*</span></label><textarea id="ob-services" name="services" placeholder="Görüşmede konuşulan hizmetleri ve kapsamı belirt." maxlength="10000" required></textarea><p class="ob-error" id="error-services"></p></div>
            <div class="ob-field"><label for="ob-currency">Teklif para birimi</label><select id="ob-currency" name="currency"><option value="TRY">TL · Türk lirası</option><option value="USD">USD · ABD doları</option></select><p class="ob-hint">Dolar teklifi güncel TCMB satış kuruyla hesaplanır. Bütçe ve iç maliyetler TL olarak kalır.</p><p class="ob-error" id="error-currency"></p></div>
            <div class="ob-field"><label for="ob-budget">Aylık bütçe, TL <small>(varsa)</small></label><input id="ob-budget" name="budget" type="number" inputmode="decimal" min="0" step="any" placeholder="Bilinmiyorsa boş bırak"><p class="ob-hint">Görüşmede belirtilen bütçedir; teklif fiyatı değildir.</p><p class="ob-error" id="error-budget"></p></div>
          </div></fieldset>
          <fieldset><legend>Toplantı notları ve bağlam</legend><div class="ob-field"><label for="ob-meetingNotes">Araştırmada kullanılacak notlar</label><textarea id="ob-meetingNotes" name="meetingNotes" class="ob-notes" maxlength="30000"></textarea><p class="ob-hint">Kart notları ve görüşme geçmişinden aktarıldı. Buradaki düzenlemeler kartın asıl kayıtlarını değiştirmez.</p></div>
            <details class="ob-sources"><summary>Karttaki kaynak bilgilerini gör</summary><div class="ob-source-content"></div></details>
          </fieldset>
        </form>
        <section class="ob-review" aria-labelledby="ob-review-title" hidden>
          <span class="ob-review-tag">ÖN BHS ARAŞTIRMASI</span><h2 id="ob-review-title" tabindex="-1">Araştırma hazırlanıyor</h2><p class="ob-review-notice" role="status"></p><section class="ob-proposal-controls" hidden><h3>Başlangıç planı</h3><label>Çalışma modu <select class="ob-plan-mode"><option value="growth">Growth</option><option value="operations">Operasyon</option><option value="manual">Manuel</option></select></label><p>Growth, ilk alternatifte tam BHS ve strateji planını kullanır. Operasyon alternatifi sadece seçili hizmetleri kapsar. Manuel adımlar değiştirilmeden aktarılır.</p><label class="ob-manual-label" hidden>Manuel adımlar: her satırda zaman | adım<textarea class="ob-manual-steps" maxlength="2500" placeholder="İlk hafta | Erişimlerin alınması"></textarea></label></section><section class="ob-proposal" hidden></section><div class="ob-approval" hidden><label><input type="checkbox" class="ob-logo-approved"> Logoyu teklif üzerinde kontrol ettim; görünümü ve yerleşimi uygun.</label><label><input type="checkbox" class="ob-scope-approved"> Kapsamı, iki alternatifin aylık bedellerini ve başlangıç planını kontrol ettim.</label><p class="ob-save-status" role="status"></p></div><section class="ob-pricing ob-audit-report" aria-label="Fiyat alternatifleri" hidden></section><div class="ob-audit-report ob-research-report"></div><details class="ob-brief-details"><summary>Analize iletilen brief</summary><dl class="ob-review-data"></dl></details>
        </section>
      </div>
      <footer class="ob-footer"><p>${window.PipelineOfferPersistence?'Kalıcı test alanı · Gerçek Pipeline verileri kullanılmaz.':'Önizleme: Düzenlemeler kaydedilmez.'}</p><div><button type="button" class="ob-back">Karta dön</button><button type="submit" form="offer-brief-form" class="ob-next">BHS Analizini Hazırla</button><button type="button" class="ob-price" hidden>Fiyat Alternatiflerini Hesapla</button><button type="button" class="ob-compose" hidden>Teklif Taslağını Oluştur</button><button type="button" class="ob-save" hidden>Teklifi Kaydet</button><button type="button" class="ob-publish" hidden>${window.PipelineOfferPersistence?'Test müşteri bağlantısını oluştur':'Müşteri Bağlantısını Yayınla'}</button><button type="button" class="ob-resume" hidden>Araştırmaya devam et</button><button type="button" class="ob-edit" hidden>Bilgileri düzenle</button></div></footer>`;
    document.body.appendChild(dialog);
    const form = dialog.querySelector('form');
    let reviewing = false;
    let task = null;
    let pausedAudit = null;
    const source = draft.source;
    dialog.querySelector('.ob-subtitle').textContent = source.company + ' · ' + source.contact;
    fields.forEach(name => { form.elements[name].value = draft[name]; });
    const sourceBox = dialog.querySelector('.ob-source-content');
    function sourceParagraph(label, value) {
      const p = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = label;
      p.append(strong, document.createTextNode(value || 'Kayıt yok.'));
      sourceBox.appendChild(p);
    }
    sourceParagraph('Kart notu: ', source.notes);
    source.timeline.forEach(t => sourceParagraph([t.date, t.type].filter(Boolean).join(' · ') + ': ', t.note));
    if (!source.timeline.length) sourceParagraph('Görüşme geçmişi: ', 'Henüz görüşme kaydı yok.');

    function sync() { fields.forEach(name => { draft[name] = form.elements[name].value; }); }
    function close() {
      stopTask();
      logoControl?.destroy();
      dialog.close();
      dialog.remove();
      active = null;
      if (returnFocus?.isConnected) returnFocus.focus();
    }
    active = { dialog, close };
    dialog.querySelector('.ob-close').addEventListener('click', close);
    dialog.querySelector('.ob-back').addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });

    const logoControl = window.PipelineLogoControl?.mount(dialog.querySelector('.ob-auto-logo'), {
      getWebsite: () => form.elements.website.value,
      getContext: () => ({leadId:source.leadId,spaceId:source.spaceId}),
      getBrandName: () => form.elements.brandName.value,
      onChange: value => { draft.logo = value; dialog.querySelector('#error-logoUrl').textContent = ''; }
    });
    form.elements.website.addEventListener('input', () => logoControl?.invalidate());
    fields.forEach(name => {
      const input = form.elements[name];
      input.addEventListener('input', () => {
        input.removeAttribute('aria-invalid');
        const error = dialog.querySelector('#error-' + name);
        if (error) error.textContent = '';
      });
    });
    function setReview(value) {
      reviewing = value;
      form.hidden = value;
      dialog.querySelector('.ob-research-report').hidden=false;
      dialog.querySelector('.ob-review').hidden = !value;
      dialog.querySelector('.ob-next').hidden = value;
      dialog.querySelector('.ob-edit').hidden = !value;
      dialog.querySelector('.ob-price').hidden = true;
      dialog.querySelector('.ob-pricing').hidden = true;
      for(const cls of ['ob-proposal-controls','ob-proposal','ob-approval','ob-compose','ob-save','ob-publish'])dialog.querySelector('.'+cls).hidden=true;
      dialog.querySelectorAll('.ob-steps li').forEach((step,i)=>{if(i===(value?1:0))step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');});
      dialog.querySelector('.ob-body').scrollTop = 0;
      dialog.querySelector(value ? '#ob-review-title' : '#ob-brandName').focus();
    }
    function stopTask(){
      pausedAudit=null;dialog.querySelector('.ob-resume').hidden=true;
      if(!task)return;
      task.stopped=true;
      if(task.ticket){
        if(task.kind==='proposal')window.PipelineProposalRequest?.({...task.payload,action:'cancel',ticket:task.ticket}).catch(()=>{});
        else if(task.kind==='pricing')window.PipelinePricingRequest?.({action:'cancel',brief:task.brief,audit:task.audit,pricingProof:task.pricingProof,ticket:task.ticket}).catch(()=>{});
        else window.PipelineAuditRequest?.({action:'cancel',brief:task.brief,ticket:task.ticket}).catch(()=>{});
      }
      task=null;
    }
    dialog.querySelector('.ob-edit').addEventListener('click', () => {stopTask();draft.audit=null;draft.pricing=null;draft.pricingProof=null;draft.proposal=null;draft.proposalProof=null;draft.saveProof=null;setReview(false);});
    function renderAudit(result){
      draft.audit=result;
      const box=dialog.querySelector('.ob-research-report'),data=result.data;
      box.replaceChildren();
      function paragraph(text,parent=box){const p=document.createElement('p');p.textContent=text;parent.appendChild(p);}
      function heading(text){const h=document.createElement('h3');h.textContent=text;box.appendChild(h);}
      paragraph(data.summary);
      if(data.researchReuse)paragraph('Mevcut marka araştırması korundu; teklif kapsamı güncel brief üzerinden seçilecek. '+(data.researchReuse.contextNeedsConfirmation?'Bulguların güncel hedef pazar ve görüşme bağlamına uygunluğunu kapsam onayında kontrol et.':''));
      if(data.schemaVersion!=='bhs-v2-direct'&&data.quality.semanticBenchmark!=='passed')paragraph('İçerik doğrulaması tamamlanmadı: şirket, pazar, dönem ve çıkarımların dayanakları kontrol edilmeli.');
      heading('Ön BHS boyutları');
      const names={financial:'Finansal sağlık',operations:'Operasyonel verimlilik',funnel:'Funnel bütünlüğü',digital:'Dijital varlıklar',perception:'Marka algısı',competition:'Rekabetçi pozisyon'};
      data.dimensions.forEach(d=>{
        const article=document.createElement('article');box.appendChild(article);
        const h=document.createElement('h4');h.textContent=names[d.id]+' · '+(d.score===null?'Yeterli veri yok':d.score+'/100');article.appendChild(h);
        paragraph(d.rationale,article);
        if(d.gaps.length)paragraph('Eksikler: '+d.gaps.join(' · '),article);
      });
      paragraph('Ön BHS toplamı: '+(data.scoring.total===null?'Hesaplanmadı':data.scoring.total+'/100'));
      paragraph(data.scoring.note);
      heading('Rakip seti');data.competitors.forEach(p=>paragraph(p.name+' — '+p.scaleReason+' '+p.audienceReason+' '+p.geographyReason));
      heading('Öncelikli bulgular');data.findings.forEach(f=>paragraph((f.kind==='inference'?'Çıkarım: ':f.kind==='brief'?'Müşteri beyanı: ':'Gözlem: ')+f.statement+' '+f.impact+' ['+f.sourceIds.join(', ')+']'));
      heading('Hizmet hipotezleri');data.serviceRecommendations.forEach(s=>paragraph(s.name+' — '+s.hypothesis+' Ölçüm: '+s.measurement));
      heading('Doğrulanacak sorular');data.meetingQuestions.forEach(q=>paragraph(q.question));
      heading('Kaynaklar');data.sources.forEach(s=>paragraph(s.id+' · '+(s.title||s.url)+' · '+s.url+' · '+(s.publishedAt||'Yayın tarihi bilinmiyor')+(data.schemaVersion==='bhs-v2-direct'?'':' · '+(s.verification?.status||''))));
      if(data.quality.issues.length){heading('Tamamlanması gereken kontroller');paragraph('Verisi eksik veya güncel görüşme bağlamında doğrulanması gereken konular teklif hazırlamayı engellemez; kaynak ve kapsam kontrolünde tamamlanır.');}
      const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('div');
      summary.textContent='Araştırmanın tamamı ve doğrulanacak konular';text.className='ob-audit-raw';text.textContent=data.rawReport;details.append(summary,text);box.appendChild(details);
      dialog.querySelector('#ob-review-title').textContent=result.status==='ready'?'Ön BHS araştırması hazır':'Ön BHS araştırmasında kontrol gereken alanlar var';
      dialog.querySelector('.ob-review-notice').textContent=result.status==='ready'?'Ön BHS raporu hazır. Görüşme bağlamına uygun iki alternatifin aylık bedellerini hazırlayabilirsin. Bütçe bilgisi zorunlu değildir.':'Kaynak veya içerik doğrulaması tamamlanmadığı için bu sonuç henüz teklif aşamasına aktarılamaz.';
      dialog.querySelector('.ob-price').hidden=result.status!=='ready';
    }
    const formatMoney=(value,currency='TRY')=>new Intl.NumberFormat('tr-TR',{style:'currency',currency,maximumFractionDigits:2}).format(value);
    function renderPricing(result){
      draft.pricing=result;
      const box=dialog.querySelector('.ob-pricing'),data=result.data;box.replaceChildren();box.hidden=false;
      const add=(tag,text,parent=box)=>{const node=document.createElement(tag);node.textContent=text;parent.appendChild(node);return node;};
      add('h3','Aylık fiyat alternatifleri');
      if(data.quote?.status==='ready'){const fx=data.quote.exchangeRate;add('p','Sabit teklif kuru: 1 USD = '+fx.rate+' TL · TCMB '+fx.publishedAt+'. Gönderilmiş teklifin tutarı kur değişikliğiyle güncellenmez.');}
      if(data.quote?.status==='pending')add('p',data.quote.notice);add('p',data.scope.summary);
      add('p',data.scope.budgetPosture==='limited'?'Görüşmedeki bütçe kısıtı başlangıç kapsamına yansıtıldı.':'Bütçe belirtilmese de hizmet kapsamı ve maliyetlerden fiyat hesaplandı.');
      if(data.scope.budgetQuote)add('p','Görüşme dayanağı: '+data.scope.budgetQuote);
      data.alternatives.forEach(alternative=>{
        const article=document.createElement('article');box.appendChild(article);
        add('h4',alternative.name+(alternative.id===data.recommendedAlternativeId?' · Önerilen':''),article);
        const quoted=data.quote?.alternatives?.find(a=>a.id===alternative.id);
        add('p',data.quote?.status==='pending'?'USD tutarı için kur bekleniyor':formatMoney(quoted?.monthlyAmount??alternative.monthlyAmount,quoted?'USD':'TRY')+' / ay',article);
        alternative.services.forEach(service=>add('p',service.name+' · '+service.reason,article));
        if(alternative.note)add('p',alternative.note,article);
        if(alternative.budgetFit==='above')add('p','Belirtilen teklif aralığının üzerinde; maliyet tabanının altına inilmedi.',article);
        const details=document.createElement('details');article.appendChild(details);add('summary','İç hesaplama ayrıntıları',details);
        add('p','Maliyet: '+formatMoney(alternative.cost)+' · Asgari: '+formatMoney(alternative.minimumAmount)+' · İdeal: '+formatMoney(alternative.idealAmount),details);
        add('p','Account koordinasyon maliyeti: '+formatMoney(alternative.accountCost),details);
        if(alternative.growthCosting)add('p',alternative.growthCosting.note,details);
      });
      if(data.scope.deferred.length){add('h4','Sonraki aşamaya ayrılan işler');data.scope.deferred.forEach(item=>add('p',item.name+' · '+item.reason));}
      if(data.scope.pending.length){add('h4','Ayrıca fiyatlandırılacak işler');data.scope.pending.forEach(item=>add('p',item.name+' · '+item.reason));}
      data.scope.exclusions.forEach(item=>add('p',item));data.notices.forEach(item=>add('p',item));
      add('p','Maliyet tablosu: '+data.costVersion+' · Kartın tahmini değeri henüz değiştirilmedi.');
      dialog.querySelector('#ob-review-title').textContent=result.status==='ready'?'Fiyat alternatifleri hazır':'Fiyat alternatifleri hazır · Kapsam kontrolü gerekli';
      dialog.querySelector('.ob-review-notice').textContent='İki alternatifin toplam aylık hizmet bedelleri hesaplandı. Sıradaki aşama, logo ve BHS ile teklif taslağının oluşturulması.';
      dialog.querySelector('.ob-price').hidden=true;
      dialog.querySelector('.ob-steps li[aria-current]')?.removeAttribute('aria-current');dialog.querySelectorAll('.ob-steps li')[2].setAttribute('aria-current','step');
      dialog.querySelector('.ob-body').scrollTop=0;
    }
    dialog.querySelector('.ob-price').addEventListener('click',async()=>{
      if(task||draft.audit?.status!=='ready')return;
      const button=dialog.querySelector('.ob-price'),notice=dialog.querySelector('.ob-review-notice');
      if(typeof window.PipelinePricingRequest!=='function'||!draft.pricingProof){notice.textContent='Fiyat hesaplama bağlantısı için bu önizlemede tamamlanmış ve doğrulanmış BHS gerekli.';return;}
      const current={kind:'pricing',stopped:false,ticket:null,audit:draft.audit,pricingProof:draft.pricingProof,brief:Object.fromEntries(fields.map(key=>[key,draft[key]]))};task=current;button.disabled=true;
      try{
        let action='start';
        for(;;){
          notice.textContent='Görüşme bağlamıyla başlangıç kapsamı seçiliyor; segment maliyetlerinden iki alternatif hesaplanıyor…';
          const response=await window.PipelinePricingRequest({action,brief:current.brief,audit:current.audit,pricingProof:current.pricingProof,...(current.ticket?{ticket:current.ticket}:{}),...(action==='start'?{requestId:crypto.randomUUID()}:{} )});
          if(response.ticket)current.ticket=response.ticket;
          if(current.stopped){if(current.ticket)window.PipelinePricingRequest({action:'cancel',brief:current.brief,audit:current.audit,pricingProof:current.pricingProof,ticket:current.ticket}).catch(()=>{});return;}
          if(response.phase==='complete'){draft.proposalProof=response.proposalProof;renderPricing(response.result);dialog.querySelector('.ob-proposal-controls').hidden=false;dialog.querySelector('.ob-compose').hidden=response.result.data.quote?.status==='pending';dialog.querySelector('.ob-price').hidden=response.result.data.quote?.status!=='pending';task=null;return;}
          action='status';await new Promise(resolve=>setTimeout(resolve,3000));if(current.stopped)return;
        }
      }catch(error){if(!current.stopped)notice.textContent=error.message||'Fiyat alternatifleri hazırlanamadı. Yeni model çağrısı otomatik başlatılmadı.';}
      finally{if(task===current)task=null;button.disabled=false;}
    });

    dialog.querySelector('.ob-plan-mode').addEventListener('change',e=>{dialog.querySelector('.ob-manual-label').hidden=e.target.value!=='manual';invalidateProposal();});
    dialog.querySelector('.ob-manual-steps').addEventListener('input',invalidateProposal);
    function invalidateProposal(){if(task?.kind==='proposal')stopTask();draft.proposal=null;draft.saveProof=null;draft.saved=null;for(const cls of ['ob-proposal','ob-approval','ob-save','ob-publish'])dialog.querySelector('.'+cls).hidden=true;dialog.querySelector('.ob-compose').hidden=!draft.pricing||draft.pricing.data.quote?.status==='pending';}
    dialog.querySelector('.ob-compose').addEventListener('click',async()=>{
      if(task||!draft.pricing||!draft.logo?.verifiedData)return;
      const notice=dialog.querySelector('.ob-review-notice'),button=dialog.querySelector('.ob-compose');
      if(typeof window.PipelineProposalRequest!=='function'){notice.textContent='Teklif servisi bu ortamda bağlı değil.';return;}
      const planMode=dialog.querySelector('.ob-plan-mode').value;
      const manualSteps=dialog.querySelector('.ob-manual-steps').value.split('\n').filter(x=>x.trim()).map(line=>{const i=line.indexOf('|');return {time:i<0?'':line.slice(0,i).trim(),title:i<0?line:line.slice(i+1).trim()};});
      if(planMode==='manual'&&(!manualSteps.length||manualSteps.some(s=>!s.title||!s.time))){notice.textContent='Her manuel adımı zaman | adım biçiminde gir.';return;}
      const payload={context:{leadId:source.leadId,spaceId:source.spaceId},brief:Object.fromEntries(fields.map(key=>[key,draft[key]])),audit:draft.audit,pricing:draft.pricing,proposalProof:draft.proposalProof,logo:draft.logo.verifiedData,logoBackground:draft.logo.placement.background,planMode,manualSteps};
      const current={kind:'proposal',payload,stopped:false,ticket:null};task=current;button.disabled=true;
      try{
        let action='start';const requestId=crypto.randomUUID();
        for(;;){
          notice.textContent='Gemini marka anlatımını hazırlıyor; doğrulanmış BHS, sabit aylık bedeller ve şeffaf logo şablona yerleştiriliyor…';
          const response=await window.PipelineProposalRequest({...payload,action,requestId,...(current.ticket?{ticket:current.ticket}:{})});
          if(response.ticket)current.ticket=response.ticket;
          if(current.stopped){if(current.ticket)window.PipelineProposalRequest({...payload,action:'cancel',ticket:current.ticket}).catch(()=>{});return;}
          if(response.phase==='complete'){
            draft.proposal=response.result;draft.saveProof=response.saveProof;draft.saved=null;
            const box=dialog.querySelector('.ob-proposal');box.hidden=false;window.PipelineProposal.mount(box,response.result.data);
            dialog.querySelector('.ob-pricing').hidden=true;dialog.querySelector('.ob-research-report').hidden=true;
            dialog.querySelector('.ob-approval').hidden=false;dialog.querySelector('.ob-save').hidden=false;dialog.querySelector('.ob-publish').hidden=true;button.hidden=true;
            dialog.querySelectorAll('.ob-approval input').forEach(x=>x.checked=false);
            dialog.querySelector('#ob-review-title').textContent='Teklif taslağı hazır';notice.textContent='Logo, kapsam ve planı bu teklif üzerinde kontrol et. Kaydetme, kart değerini önerilen aylık bedele günceller.';
            task=null;dialog.querySelector('.ob-body').scrollTop=0;return;
          }
          action='status';await new Promise(resolve=>setTimeout(resolve,2500));if(current.stopped)return;
        }
      }catch(error){if(!current.stopped)notice.textContent=error.message||'Teklif oluşturulamadı.';}
      finally{if(task===current)task=null;button.disabled=false;}
    });
    async function saveOrPublish(action){
      const status=dialog.querySelector('.ob-save-status'),button=dialog.querySelector(action==='save'?'.ob-save':'.ob-publish');
      if(!dialog.querySelector('.ob-logo-approved').checked||!dialog.querySelector('.ob-scope-approved').checked){status.textContent='Teklif üzerindeki logo ve kapsam kontrollerini tamamla.';return;}
      if(typeof window.PipelineOfferRequest!=='function'){status.textContent='Kayıt bağlantısı bu ortamda henüz etkin değil. Teklif ve kart değeri değiştirilmedi.';return;}
      button.disabled=true;
      try{
        const response=await window.PipelineOfferRequest({action,...(action==='save'?{proposal:draft.proposal,pricing:draft.pricing,saveProof:draft.saveProof,leadId:source.leadId,spaceId:source.spaceId,logoApproved:true,scopeApproved:true}:{offerId:draft.saved.id})});
        if(action==='save'){
          draft.saved=response.offer;context.lead.value=String(response.offer.monthlyAmount);
          window.dispatchEvent(new CustomEvent('pipeline-offer-saved',{detail:{leadId:source.leadId,spaceId:source.spaceId,value:context.lead.value,offer:response.offer}}));
          status.textContent='Teklif v'+response.offer.version+' kaydedildi. Kart tahmini değeri: '+formatMoney(response.offer.monthlyAmount)+' / ay.';
          button.hidden=true;dialog.querySelector('.ob-publish').hidden=false;
        }else{status.textContent='Müşteri bağlantısı: '+response.url+' · Şifre: '+response.password;draft.published=response;window.dispatchEvent(new CustomEvent('pipeline-offer-published',{detail:{leadId:source.leadId,spaceId:source.spaceId,url:response.url,password:response.password}}));}
      }catch(error){status.textContent=error.message||'İşlem tamamlanamadı; kart değeri değiştirilmedi.';}
      finally{button.disabled=false;}
    }
    dialog.querySelector('.ob-save').addEventListener('click',()=>saveOrPublish('save'));
    dialog.querySelector('.ob-publish').addEventListener('click',()=>saveOrPublish('publish'));

    dialog.querySelector('.ob-resume').addEventListener('click',()=>{
      if(!pausedAudit||pausedAudit.stopped)return;
      const current=pausedAudit;pausedAudit=null;runAudit(current);
    });
    async function runAudit(resume=null){
      const notice=dialog.querySelector('.ob-review-notice');
      if(typeof window.PipelineAuditRequest!=='function'){
        dialog.querySelector('#ob-review-title').textContent='BHS araştırma bağlantısı gerekli';
        notice.textContent='Bu önizlemede araştırma servisi bağlı değil. Teklif veya araştırma sonucu oluşturulmadı.';return;
      }
      const current=resume||{kind:'audit',stopped:false,ticket:null,brief:Object.fromEntries(fields.map(key=>[key,draft[key]]))};task=current;
      dialog.querySelector('.ob-resume').hidden=true;dialog.querySelector('#ob-review-title').textContent='Araştırma hazırlanıyor';
      dialog.querySelector('.ob-edit').textContent='Araştırmayı durdur ve düzenle';
      let action=resume?'status':'start';
      try{
        for(;;){
          notice.textContent=action==='start'?'Marka, hedefler ve toplantı bağlamıyla derin araştırma başlatılıyor…':['advance','structure'].includes(action)?'Kaynaklar okunuyor ve kanıta dayalı BHS hazırlanıyor…':'Araştırma sürüyor; kaynaklar, rakipler ve altı BHS boyutu inceleniyor…';
          const response=await window.PipelineAuditRequest({action,brief:current.brief,context:{leadId:source.leadId,spaceId:source.spaceId},...(current.ticket?{ticket:current.ticket}:{}),...(action==='start'?{requestId:crypto.randomUUID()}:{} )});
          if(response.ticket)current.ticket=response.ticket;
          if(response.cost){current.bounded=true;dialog.querySelector('.ob-footer>p').textContent=(window.PipelineOfferPersistence?'Kalıcı test alanı · ':'')+'Kontrollü maliyet tahmini: '+(response.cost.chargedKurus/100).toFixed(2)+' / 50 TL · Normal hedef: 20–30 TL';}
          if(current.stopped){if(current.ticket)window.PipelineAuditRequest({action:'cancel',brief:current.brief,ticket:current.ticket}).catch(()=>{});return;}
          if(response.phase==='complete'&&response.result){draft.pricingProof=response.pricingProof;renderAudit(response.result);task=null;return;}
          if(response.phase==='complete'){action='status';continue;}
          if(response.nextAction==='advance'){action='advance';continue;}
          if(response.phase==='research_complete'){action='structure';continue;}
          action='status';
          const stages={source_plan:'Birincil kaynaklar ve karşılaştırılabilir rakipler bulunuyor…',evidence:'Bulunan kaynaklar tek araştırma paketinde okunuyor…',scope:'BHS ve görüşme bağlamına uygun hizmet kapsamı hazırlanıyor…',synthesis:'Okunan kaynaklardan altı boyutlu BHS analizi hazırlanıyor…',revision:'Kanıtların kapsamı ve yorumların kesinliği gözden geçiriliyor…',semantic:'Bulguların şirket, dönem ve kaynak desteği ayrı bir denetimden geçiyor…'};
          if(stages[response.phase])notice.textContent=stages[response.phase];
          await new Promise(resolve=>setTimeout(resolve,10000));
          if(current.stopped)return;
        }
      }catch(error){
        if(current.stopped)return;
        const transport=error.code==='audit_transport',canResume=transport&&(error.canResume||current.bounded)&&current.ticket;
        dialog.querySelector('#ob-review-title').textContent=canResume?'BHS bağlantısı kesildi':'BHS araştırması tamamlanamadı';
        notice.textContent=(error.message||'Araştırma servisine ulaşılamadı.')+(canResume?' Aynı araştırmanın durumunu yeniden kontrol etmek için “Araştırmaya devam et” seçeneğini kullan.':' Yeni araştırma otomatik başlatılmadı.')+(transport&&!canResume?' İsteğin sunucuda işlenip işlenmediği belirsiz; tekrar başlatılmadı.':'');
        if(canResume){pausedAudit=current;dialog.querySelector('.ob-resume').hidden=false;}
        if(error.code&&!transport)notice.textContent+=' Hata kodu: '+error.code+'.';
        if(error.requestId)notice.textContent+=' Kontrol kodu: '+error.requestId;
      }finally{if(dialog.isConnected)dialog.querySelector('.ob-edit').textContent='Bilgileri düzenle';}
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (reviewing) return;
      sync();
      const errors = model.validate(draft);

      const summary = dialog.querySelector('#ob-errors');
      fields.forEach(name => {
        const error = dialog.querySelector('#error-' + name);
        if (error) error.textContent = errors[name] || '';
        form.elements[name].setAttribute('aria-invalid', String(Boolean(errors[name])));
        if (error) form.elements[name].setAttribute('aria-describedby', error.id);
      });
      dialog.querySelector('#error-logoUrl').textContent = errors.logoUrl || '';
      if (errors.logoUrl && Object.keys(errors)[0] === 'logoUrl') dialog.querySelector('.ol-file')?.focus();
      if (Object.keys(errors).length) {
        summary.hidden = false;
        summary.textContent = 'Devam etmek için işaretli alanları tamamla.';
        form.elements[Object.keys(errors)[0]]?.focus();
        return;
      }
      summary.hidden = true;
      const details = dialog.querySelector('.ob-review-data');
      details.replaceChildren();
      const values = [
        ['Marka', draft.brandName], ['Segment', labels[draft.segment]],
        ['Web sitesi', model.webUrl(draft.website)], ['Logo', draft.logo ? 'Şeffaf PNG hazır · Görsel onay teklif taslağında yapılacak' : 'Hazırlanmadı'],
        ['Hedefler', draft.goals], ['İhtiyaçlar', draft.needs], ['Konuşulan hizmetler', draft.services],
        ['Teklif para birimi', draft.currency==='USD'?'USD · ABD doları':'TL · Türk lirası'],
        ['Aylık bütçe, TL', draft.budget === '' ? 'Belirtilmedi' : new Intl.NumberFormat('tr-TR', {style:'currency', currency:'TRY'}).format(Number(draft.budget))],
        ['Toplantı notları', draft.meetingNotes || 'Belirtilmedi']
      ];
      values.forEach(([label, value]) => {
        const row = document.createElement('div');
        const dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = label; dd.textContent = value;
        row.append(dt, dd); details.appendChild(row);
      });
      const title = dialog.querySelector('#ob-review-title');
      title.textContent='Araştırma hazırlanıyor';dialog.querySelector('.ob-research-report').replaceChildren();
      title.tabIndex = -1;
      setReview(true);
      runAudit();
    });
    dialog.showModal();
    form.elements.brandName.focus();
  }

  window.PipelineOfferBrief = Object.freeze({ open });
})();
