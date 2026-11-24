/* Isolated offer brief and research UI. Targeted offer persistence is separate from CRM bulk saves. */
(function () {
  'use strict';
  let active = null;
  const labels = { kobi: 'KOBİ', corporate: 'Kurumsal', key_account: 'Key Account' };
  const fields = ['brandName', 'segment', 'website', 'goals', 'needs', 'services', 'budget', 'currency', 'language', 'meetingNotes'];

  function open(context, returnFocus, variant=null) {
    const model = window.PipelineOfferBriefModel;
    if (!model || !context?.lead?.id || !context.spaceId) return;
    if (active) return;
    const draft = model.createDraft(context);
    const researchRuns={reuse:crypto.randomUUID(),new:crypto.randomUUID()};
    if(variant?.info?.brief){for(const key of fields)if(variant.info.brief[key]!==undefined)draft[key]=variant.info.brief[key]??'';}
    else if(variant?.info){for(const key of ['segment','currency','language'])if(variant.info[key])draft[key]=variant.info[key];draft.brandName=variant.info.brand?.name||draft.brandName;draft.website=variant.info.brand?.website||'';}
    const existingOffer=Boolean(variant?.sourceOfferId);
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
          ${variant?`<fieldset class="ob-bhs-choice"><legend>BHS analizi</legend><label><input type="radio" name="bhsMode" value="reuse" checked> ${variant.savedReportId?'Kayıtlı BHS’yi kullan':'Mevcut BHS’yi kullan'}</label><label><input type="radio" name="bhsMode" value="new"> Yeni BHS yap</label><p class="ob-hint">Mevcut BHS seçilirse yeniden analiz yapılmaz. Yeni teklifin kapsamı bu formdaki bilgilere göre hazırlanır.</p></fieldset>`:''}
          <fieldset><legend>Marka bilgileri</legend><div class="ob-grid">
            <div class="ob-field"><label for="ob-brandName">Marka adı <span>*</span></label><input id="ob-brandName" name="brandName" required maxlength="200" autocomplete="organization"><p class="ob-error" id="error-brandName"></p></div>
            <div class="ob-field"><label for="ob-segment">Müşteri segmenti <span>*</span></label><select id="ob-segment" name="segment" required><option value="">Segment seç</option><option value="kobi">KOBİ</option><option value="corporate">Kurumsal</option><option value="key_account">Key Account</option></select><p class="ob-hint">Hesaplamada yalnızca bu segmentin maliyetleri kullanılır.</p><p class="ob-error" id="error-segment"></p></div>
            <div class="ob-field ob-wide"><label for="ob-website">Web sitesi <span>*</span></label><input id="ob-website" name="website" type="text" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="marka.com" maxlength="2048" required><p class="ob-error" id="error-website"></p></div>
            <div class="ob-field ob-wide"><div class="ob-auto-logo"></div><p class="ob-error" id="error-logoUrl"></p></div>
          </div></fieldset>
          <fieldset><legend>Hedefler ve kapsam</legend><div class="ob-grid">
            <div class="ob-field ob-wide"><label for="ob-goals">Hedefler <span>*</span></label><textarea id="ob-goals" name="goals" placeholder="Marka hangi iş sonucuna ulaşmak istiyor?" maxlength="10000" required></textarea><p class="ob-error" id="error-goals"></p></div>
            <div class="ob-field ob-wide"><label for="ob-needs">İhtiyaçlar ve öncelikler <span>*</span></label><textarea id="ob-needs" name="needs" placeholder="Mevcut darboğazlar, öncelikler ve bilinen kısıtlar" maxlength="10000" required></textarea><p class="ob-error" id="error-needs"></p></div>
            <div class="ob-field ob-wide"><label for="ob-services">Konuşulan hizmetler <span>*</span></label><textarea id="ob-services" name="services" placeholder="Görüşmede konuşulan hizmetleri ve kapsamı belirt." maxlength="10000" required></textarea><p class="ob-error" id="error-services"></p></div>
            <div class="ob-field"><label for="ob-language">Teklif dili</label><select id="ob-language" name="language"><option value="tr">Türkçe</option><option value="en">English · İngilizce</option></select><p class="ob-hint">Müşteriye sunulan teklif seçilen dilde hazırlanır. Dil ve para birimi birbirinden bağımsızdır.</p><p class="ob-error" id="error-language"></p></div>
            <div class="ob-field"><label for="ob-currency">Teklif para birimi</label><select id="ob-currency" name="currency"><option value="TRY">TL · Türk lirası</option><option value="USD">USD · ABD doları</option></select><p class="ob-hint">Dolar teklifi güncel TCMB satış kuruyla hesaplanır. Bütçe ve iç maliyetler TL olarak kalır.</p><p class="ob-error" id="error-currency"></p></div>
            <div class="ob-field"><label for="ob-budget">Aylık bütçe, TL <small>(varsa)</small></label><input id="ob-budget" name="budget" type="number" inputmode="decimal" min="0" step="any" placeholder="Bilinmiyorsa boş bırak"><p class="ob-hint">Görüşmede belirtilen bütçedir; teklif fiyatı değildir.</p><p class="ob-error" id="error-budget"></p></div>
          </div></fieldset>

          <fieldset><legend>Toplantı notları ve bağlam</legend><div class="ob-field"><label for="ob-meetingNotes">Araştırmada kullanılacak notlar</label><textarea id="ob-meetingNotes" name="meetingNotes" class="ob-notes" maxlength="30000"></textarea><p class="ob-hint">Kart notları ve görüşme geçmişinden aktarıldı. Buradaki düzenlemeler kartın asıl kayıtlarını değiştirmez.</p></div>
            <details class="ob-sources"><summary>Karttaki kaynak bilgilerini gör</summary><div class="ob-source-content"></div></details>
          </fieldset>
        </form>
        <section class="ob-review" aria-labelledby="ob-review-title" hidden>
          <span class="ob-review-tag">ÖN BHS ARAŞTIRMASI</span><h2 id="ob-review-title" tabindex="-1">Araştırma hazırlanıyor</h2><p class="ob-review-notice" role="status"></p><p class="ob-research-website ob-hint" hidden></p><button type="button" class="ob-confirm-website" hidden>Adresi doğruladım, BHS’yi başlat</button><p class="ob-draft-cost ob-hint" hidden></p><details class="ob-cost-detail" hidden><summary>Maliyet ayrıntısı</summary><p class="ob-cost-copy"></p></details><section class="ob-recovery" hidden><p>Önceki sonuçlar ve ayrılmış maliyetler korunur. Yalnızca durmuş aşama için bir ek deneme yapılır. Normal maliyet hedefi 30–40 TL’dir; toplam 50 TL üst sınırı korunur. Kalan tutar araştırmanın tamamlanmasına yetmeyebilir.</p><button type="button" class="ob-retry">Kalan bütçeyle yeniden dene</button></section><section class="ob-continuation" hidden><p>Doğrulanan bulgular ve görüşme bilgileriyle teklif hazırlığına geçebilirsin.</p><button type="button" class="ob-continue">Mevcut bilgilerle teklife devam et</button></section><section class="ob-gap-completion" hidden><p></p><button type="button" class="ob-complete-gaps">Sadece eksik kalan kısımları tamamla</button></section><section class="ob-service-selection" hidden><h3>Teklife dahil edilecek hizmetleri seç</h3><p class="ob-hint">Her alternatifte veya ayda yalnızca seçtiğin maliyetler hesaplanır. Account ve Growth otomatik eklenmez. Proje bedelleri retainer’dan ayrı gösterilir.</p><fieldset class="ob-monthly-fieldset"><legend>Fiyatlandırma</legend><label class="ob-monthly-choice"><input type="checkbox" class="ob-monthly-toggle"> Ay bazlı fiyatlandır</label><p class="ob-hint">Seçili değilse mevcut iki alternatif hesaplanır. Seçildiğinde hizmet ve projeleri ilgili aylara ekleyebilirsin.</p><div class="ob-standard-editor"></div><div class="ob-monthly-editor" hidden></div><p class="ob-monthly-error ob-error" role="alert"></p></fieldset></section><section class="ob-proposal-controls" hidden><h3>Başlangıç planı</h3><label>Çalışma modu <select class="ob-plan-mode"><option value="growth">Growth</option><option value="operations">Operasyon</option><option value="manual">Manuel</option></select></label><p>Growth modunda strateji adımları seçili Growth hizmetlerine göre planlanır. Operasyon planı seçili hizmetlere dayanır. Manuel adımları sen belirlersin.</p><label class="ob-manual-label" hidden>Manuel adımlar: her satırda zaman | adım<textarea class="ob-manual-steps" maxlength="2500" placeholder="İlk hafta | Erişimlerin alınması"></textarea></label></section><section class="ob-bhs-calendar" hidden><label class="ob-monthly-choice"><input type="checkbox" class="ob-bhs-calendar-toggle"> BHS aksiyon planını teklif takvimine ekle</label><p class="ob-hint">Seçtiğin hizmetlerle eşleşen aksiyonlar takvime eklenir.</p></section><section class="ob-proposal" hidden></section><div class="ob-approval" hidden><label><input type="checkbox" class="ob-logo-approved"> Logoyu teklif üzerinde kontrol ettim; görünümü ve yerleşimi uygun.</label><label><input type="checkbox" class="ob-scope-approved"> Kapsamı, iki alternatifin aylık bedellerini ve başlangıç planını kontrol ettim.</label><p class="ob-save-status" role="status"></p></div><section class="ob-pricing ob-audit-report" aria-label="Fiyat alternatifleri" hidden></section><div class="ob-audit-report ob-research-report"></div><details class="ob-brief-details"><summary>Analize iletilen brief</summary><dl class="ob-review-data"></dl></details>
        </section>
      </div>
      <footer class="ob-footer"><p>${window.PipelineOfferPersistence?'Kalıcı test alanı · Gerçek Pipeline verileri kullanılmaz.':'Önizleme: Düzenlemeler kaydedilmez.'}</p><div><button type="button" class="ob-back">Karta dön</button><button type="submit" form="offer-brief-form" class="ob-next">BHS Analizini Hazırla</button><button type="button" class="ob-price" hidden>Fiyat Alternatiflerini Hesapla</button><button type="button" class="ob-services-edit" hidden>Hizmet seçimlerini düzenle</button><button type="button" class="ob-compose" hidden>Teklif Taslağını Oluştur</button><button type="button" class="ob-save" hidden>Teklifi Kaydet</button><button type="button" class="ob-publish" hidden>${window.PipelineOfferPersistence?'Test müşteri bağlantısını oluştur':'Müşteri Bağlantısını Yayınla'}</button><button type="button" class="ob-resume" hidden>Araştırmaya devam et</button><button type="button" class="ob-edit" hidden>Bilgileri düzenle</button></div></footer>`;
    document.body.appendChild(dialog);
    const form = dialog.querySelector('form');
    const bhsSaveStatus=document.createElement('p');
    bhsSaveStatus.className='ob-hint';
    bhsSaveStatus.setAttribute('role','status');
    bhsSaveStatus.hidden=true;
    const bhsSaveRetry=document.createElement('button');
    bhsSaveRetry.type='button';
    bhsSaveRetry.textContent='BHS’yi kaydet';
    bhsSaveRetry.hidden=true;
    dialog.querySelector('.ob-review-notice').after(bhsSaveStatus,bhsSaveRetry);
    let unsavedBhs=null;
    let reviewing = false;
    let task = null;
    let pausedAudit = null;
    let recoverableAudit = null;
    let continuableAudit = null;
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

    let monthlyEditor=null,standardPicker=null,selectionLoading=null;
    const bhsCalendarChoice=dialog.querySelector('.ob-bhs-calendar'),bhsCalendarToggle=dialog.querySelector('.ob-bhs-calendar-toggle');
    const monthlyToggle=dialog.querySelector('.ob-monthly-toggle'),monthlyBox=dialog.querySelector('.ob-monthly-editor'),standardBox=dialog.querySelector('.ob-standard-editor'),monthlyError=dialog.querySelector('.ob-monthly-error');
    function invalidatePricing(){
      if(task?.kind==='pricing'||task?.kind==='proposal')stopTask();
      draft.pricing=null;draft.proposalProof=null;draft.proposal=null;draft.saveProof=null;draft.saved=null;
      for(const cls of ['ob-pricing','ob-proposal-controls','ob-bhs-calendar','ob-proposal','ob-approval','ob-compose','ob-save','ob-publish'])dialog.querySelector('.'+cls).hidden=true;
      dialog.querySelector('.ob-price').hidden=draft.audit?.status!=='ready';dialog.querySelector('.ob-services-edit').hidden=true;monthlyError.textContent='';
    }
    async function ensureSelection(){
      if(selectionLoading)return selectionLoading;
      selectionLoading=(async()=>{
        const options={getSegment:()=>form.elements.segment.value,onChange:invalidatePricing};
        if(!standardPicker){const {mountStandardEditor}=await import('/offers/standard-plan.mjs');standardPicker=await mountStandardEditor(standardBox,options);}
        if(monthlyToggle.checked&&!monthlyEditor){const {mountMonthlyEditor}=await import('/offers/monthly-plan.mjs');monthlyEditor=await mountMonthlyEditor(monthlyBox,options);}
      })();
      try{await selectionLoading;}finally{selectionLoading=null;}
    }
    dialog.querySelector('.ob-services-edit').addEventListener('click',()=>{invalidatePricing();dialog.querySelector('.ob-service-selection').hidden=false;dialog.querySelector('.ob-service-selection').scrollIntoView({block:'start'});});
    monthlyToggle.addEventListener('change',async()=>{
      monthlyBox.hidden=!monthlyToggle.checked;standardBox.hidden=monthlyToggle.checked;invalidatePricing();
      try{await ensureSelection();}catch(error){monthlyError.textContent=error.message||'Hizmet listesi yüklenemedi.';}
    });
    form.elements.segment.addEventListener('change',()=>{standardPicker?.refresh();monthlyEditor?.refresh();});
    function sync() { fields.forEach(name => { draft[name] = form.elements[name].value; }); }
    function pricingOptions(){
      if(monthlyToggle.checked){if(!monthlyEditor)throw Error('Aylık hizmet listesinin yüklenmesini bekle.');return {pricingMode:'monthly',monthlyPlan:monthlyEditor.getPlan()};}
      if(!standardPicker)throw Error('Hizmet listesinin yüklenmesini bekle.');
      return {pricingMode:'standard',serviceSelection:standardPicker.getSelection()};
    }
    function close() {
      stopTask();
      logoControl?.destroy();standardPicker?.destroy?.();monthlyEditor?.destroy?.();
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
      getContext: () => ({leadId:source.leadId,spaceId:source.spaceId,researchRunId:variant&&form.elements.bhsMode.value==='reuse'?researchRuns.reuse:researchRuns.new}),
      getBrandName: () => form.elements.brandName.value,
      onChange: value => { draft.logo = value; dialog.querySelector('#error-logoUrl').textContent = ''; }
    });
    if(variant?.info?.logo)logoControl?.useSaved(variant.info.logo);
    if(variant){
      const update=()=>{dialog.querySelector('.ob-next').textContent=form.elements.bhsMode.value==='reuse'?(variant.savedReportId?'Kayıtlı BHS ile Devam Et':'Mevcut BHS ile Devam Et'):'Yeni BHS Analizini Hazırla';};
      form.querySelectorAll('[name=bhsMode]').forEach(input=>input.addEventListener('change',update));update();
    }
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
      unsavedBhs=null;bhsSaveStatus.hidden=true;bhsSaveRetry.hidden=true;
      form.hidden = value;
      dialog.querySelector('.ob-research-report').hidden=false;
      dialog.querySelector('.ob-review').hidden = !value;
      dialog.querySelector('.ob-next').hidden = value;
      dialog.querySelector('.ob-edit').hidden = !value;
      dialog.querySelector('.ob-price').hidden = true;
      dialog.querySelector('.ob-pricing').hidden = true;dialog.querySelector('.ob-service-selection').hidden=true;
      for(const cls of ['ob-services-edit','ob-proposal-controls','ob-bhs-calendar','ob-proposal','ob-approval','ob-compose','ob-save','ob-publish'])dialog.querySelector('.'+cls).hidden=true;
      dialog.querySelectorAll('.ob-steps li').forEach((step,i)=>{if(i===(value?1:0))step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');});
      dialog.querySelector('.ob-body').scrollTop = 0;
      dialog.querySelector(value ? '#ob-review-title' : '#ob-brandName').focus();
    }
    const gapBox=dialog.querySelector('.ob-gap-completion');
    const confirmWebsiteButton=dialog.querySelector('.ob-confirm-website');
    let gapAudit=null,websiteConfirmation=null;
    confirmWebsiteButton.addEventListener('click',()=>{
      if(!websiteConfirmation||task)return;
      const {current,checkedWebsite}=websiteConfirmation;
      current.confirmedWebsite=checkedWebsite;
      runAudit(current,'start');
    });
    function stopTask(){
      websiteConfirmation=null;confirmWebsiteButton.hidden=true;
      gapAudit=null;gapBox.hidden=true;
      pausedAudit=null;recoverableAudit=null;continuableAudit=null;dialog.querySelector('.ob-resume').hidden=true;dialog.querySelector('.ob-recovery').hidden=true;dialog.querySelector('.ob-continuation').hidden=true;
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
      const quadrants={strength:'Güçlü yön',weakness:'Zayıf yön',opportunity:'Fırsat',threat:'Tehdit'};
      const shownMetrics=new Set();
      function renderSections(sections){
        const findings=new Map(data.findings.map(f=>[f.id,f]));
        const gapLabels={not_searched:'Aranmadı',insufficient_sources:'Kaynak yetersiz',missing_from_report:'Kanıt bulundu, rapora aktarılamadı'};
        for(const section of sections){
          heading(section.title);
          if(section.openMetrics?.length){
            for(const metric of section.openMetrics){
              const key=metric.id||metric.name;if(shownMetrics.has(key))continue;shownMetrics.add(key);
              paragraph(metric.name+' — '+(metric.statusLabel||(Object.hasOwn(gapLabels,metric.status)?gapLabels[metric.status]:'Araştırma durumu kayıtlı değil')));
            }
          }else if(!section.complete)paragraph('Bu bölümde doğrulanacak bulgu eksiği var.');
          if(section.missingQuadrants?.length)paragraph('Kanıt bekleyen SWOT kolları · '+section.missingQuadrants.map(q=>quadrants[q]).filter(Boolean).join(', '));
          for(const id of section.findingIds){
            const f=findings.get(id);if(!f)continue;
            const article=document.createElement('article');box.append(article);
            paragraph((f.bhsRank?f.bhsRank+'. ':'')+(quadrants[f.swotQuadrant]?quadrants[f.swotQuadrant]+' · ':'')+f.statement,article);
            paragraph(f.impact,article);
            if(f.recommendation?.action)paragraph('Önerilen aksiyon: '+f.recommendation.action,article);
            if(f.recommendation?.measurement)paragraph('Başarı ölçümü: '+f.recommendation.measurement,article);
            paragraph('Kaynak: '+f.sourceIds.join(', '),article);
          }
        }
      }
      const conversational=data.researchMethod==='claude-conversation';
      const progress=data.researchProgress;
      // Show the new complete analysis before the service editor. Restore the
      // established position when viewing a saved legacy report in this dialog.
      if(conversational)dialog.querySelector('.ob-service-selection').before(box);
      else dialog.querySelector('.ob-brief-details').before(box);
      if(conversational){
        const sourceMap=new Map(data.sources.map(source=>[source.id,source]));
        function inline(text,parent){
          for(const part of text.split(/(\*\*[^*]+\*\*|\[S[a-f0-9]{8}\])/g)){
            const id=/^\[(S[a-f0-9]{8})\]$/.exec(part)?.[1],source=sourceMap.get(id);
            if(source&&/^https?:\/\//i.test(source.url)){
              const link=document.createElement('a');link.href=source.url;link.textContent='[Kaynak]';link.title=source.title;link.target='_blank';link.rel='noopener noreferrer';parent.append(link);
            }else if(part.startsWith('**')&&part.endsWith('**')){const strong=document.createElement('strong');strong.textContent=part.slice(2,-2);parent.append(strong);}
            else parent.append(document.createTextNode(part));
          }
        }
        const article=document.createElement('article');article.className='ob-conversation-report';box.append(article);
        const lines=data.fullReport.split('\n');
        for(let at=0;at<lines.length;at++){
          const line=lines[at];if(!line.trim())continue;
          const title=/^#{1,4}\s+(.+)/.exec(line);
          if(title){const h=document.createElement('h4');inline(title[1],h);article.append(h);continue;}
          if(line.trim().startsWith('|')&&/^\s*\|?[\s:|-]+\|\s*$/.test(lines[at+1]||'')){
            const wrap=document.createElement('div');wrap.style.overflowX='auto';
            const table=document.createElement('table');table.className='ob-product-comparison';wrap.append(table);article.append(wrap);
            const cells=value=>value.trim().replace(/^\||\|$/g,'').split('|').map(value=>value.trim());
            const head=table.createTHead().insertRow();for(const cell of cells(line)){const th=document.createElement('th');th.scope='col';inline(cell,th);head.append(th);}
            const body=table.createTBody();at++;
            while(at+1<lines.length&&lines[at+1].trim().startsWith('|')){const row=body.insertRow();for(const cell of cells(lines[++at]))inline(cell,row.insertCell());}
            continue;
          }
          if(/^\s*(?:[-*]|\d+[.)])\s+/.test(line)){
            const list=document.createElement('ul');
            for(;;){const item=document.createElement('li');inline(lines[at].replace(/^\s*(?:[-*]|\d+[.)])\s+/,''),item);list.append(item);
              if(at+1>=lines.length||!/^\s*(?:[-*]|\d+[.)])\s+/.test(lines[at+1]))break;at++;}
            article.append(list);continue;
          }
          const p=document.createElement('p');inline(line,p);article.append(p);
        }
        if(data.conversation.limitations.length){heading('Araştırmanın sınırları');data.conversation.limitations.forEach(value=>paragraph(value));}
        if(data.quality.issues.length){heading('Kontrol gereken noktalar');data.quality.issues.forEach(row=>paragraph(row.reason));}
        if(data.researchDiagnostics.length){heading('Kaynak erişim durumu');data.researchDiagnostics.forEach(row=>paragraph(row.message));}
        heading('Kaynaklar');for(const source of data.sources){
          const p=document.createElement('p'),link=document.createElement('a');link.href=source.url;link.textContent=source.title||source.url;link.target='_blank';link.rel='noopener noreferrer';p.append(link);box.append(p);
        }
      }else{
      paragraph(data.summary);
      if(progress){
        heading('Araştırma ve rapor durumu');
        paragraph(({complete:'Araştırma ve rapor tamamlandı.',partial:'Kaynaklı kısmi BHS; doğrulanacak veya rapora aktarılacak alanlar var.',unavailable:'Bu araştırmada kullanılabilir kaynaklı bulgu oluşmadı.'})[progress.state]);
        paragraph(progress.confirmed+'/'+progress.planned+' ihtiyaç doğrulandı · '+progress.reported+' doğrulanmış ihtiyaç rapora aktarıldı · '+progress.findings+' kaynaklı bulgu korundu · '+progress.open+' ihtiyaç açık.');
      }
      if(data.researchDiagnostics?.length){
        heading('Araştırma işlem durumu');
        const stages={research:'Araştırma',report:'Rapor yazımı',reading:'Kaynak okuma',tools:'Araçlar'};
        data.researchDiagnostics.forEach(row=>paragraph((stages[row.stage]||'Araştırma')+' · '+row.message));
      }
      if(data.researchReuse?.researchedAt)paragraph('Araştırma tarihi: '+data.researchReuse.researchedAt+' · Saklanan araştırma; yeni tarama yapılmadı.');
      if(data.researchReuse)paragraph('Mevcut marka araştırması korundu; teklif kapsamı güncel brief üzerinden seçilecek. '+(data.researchReuse.contextNeedsConfirmation?'Bulguların güncel hedef pazar ve görüşme bağlamına uygunluğunu kapsam onayında kontrol et.':''));
      if(data.schemaVersion!=='bhs-v2-direct'&&data.quality.semanticBenchmark!=='passed')paragraph('İçerik doğrulaması tamamlanmadı: şirket, pazar, dönem ve çıkarımların dayanakları kontrol edilmeli.');
      if(data.researchContinuity?.status!=='unavailable'){
      if(!progress){
      heading('Ön BHS boyutları');
      const names={financial:'Finansal sağlık',operations:'Operasyonel verimlilik',funnel:'Funnel bütünlüğü',digital:'Dijital varlıklar',perception:'Marka algısı',competition:'Rekabetçi pozisyon'};
      data.dimensions.forEach(d=>{
        const article=document.createElement('article');box.appendChild(article);
        const h=document.createElement('h4');h.textContent=names[d.id]+' · '+(d.score===null?'Yeterli veri yok':d.score+'/100');article.appendChild(h);
        paragraph(d.rationale,article);
        if(d.gaps.length)paragraph('Eksikler: '+d.gaps.join(' · '),article);
      });
      }
      paragraph('Ön BHS toplamı: '+(data.scoring.total===null?'Hesaplanmadı':data.scoring.total+'/100'));
      paragraph(data.scoring.note);
      heading('Rakip seti');data.competitors.forEach(p=>paragraph(p.name+' — '+p.scaleReason+' '+p.audienceReason+' '+p.geographyReason));
      if(data.bhsSections)renderSections(data.bhsSections);
      else{
      heading('Öncelikli bulgular');data.findings.forEach(f=>paragraph((f.kind==='inference'?'Çıkarım: ':f.kind==='brief'?'Müşteri beyanı: ':'Gözlem: ')+f.statement+' '+f.impact+' ['+f.sourceIds.join(', ')+']'));
      heading('Hizmet hipotezleri');data.serviceRecommendations.forEach(s=>paragraph(s.name+' — '+s.hypothesis+' Ölçüm: '+s.measurement));
      }
      heading('Doğrulanacak sorular');data.meetingQuestions.forEach(q=>paragraph(q.question));
      heading('Kaynaklar');data.sources.forEach(s=>paragraph(s.id+' · '+(s.title||s.url)+' · '+s.url+' · '+(s.publishedAt||'Yayın tarihi bilinmiyor')+(data.schemaVersion==='bhs-v2-direct'?'':' · '+(s.verification?.status||''))));
      if(data.quality.issues.length){heading('Tamamlanması gereken kontroller');paragraph('Verisi eksik veya güncel görüşme bağlamında doğrulanması gereken konular teklif hazırlamayı engellemez; kaynak ve kapsam kontrolünde tamamlanır.');}
      const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('div');
      summary.textContent='Araştırmanın tamamı ve doğrulanacak konular';text.className='ob-audit-raw';text.textContent=data.rawReport;details.append(summary,text);box.appendChild(details);
      }else{
        renderSections((data.bhsSections||[]).filter(section=>section.openMetrics?.length||section.missingQuadrants?.length));
        if(data.supervision?.researchPlan?.reportRecovery&&data.meetingQuestions.length){
          heading('Doğrulanacak sorular');data.meetingQuestions.forEach(q=>paragraph(q.question));
        }
      }
      const recovery=data.verifiedResearch?.reportRecovery;
      if(recovery?.evidence?.length||recovery?.hypotheses?.length){
        const metrics=new Map(data.verifiedResearch.metrics.map(metric=>[metric.id,metric.displayName||metric.name]));
        const sources=new Map(data.sources.map(source=>[source.id,source]));
        function recoveryLine(text,ids){
          const p=document.createElement('p');p.textContent=text;
          for(const id of ids){
            const source=sources.get(id);
            if(!source||!/^https?:\/\//i.test(source.url))continue;
            const link=document.createElement('a');link.href=source.url;link.textContent=source.title;link.target='_blank';link.rel='noopener noreferrer';
            p.append(' · ',link);
          }
          box.append(p);
        }
        if(recovery.evidence?.length){
          heading('Kısmi raporda korunan kanıtlar');
          for(const row of recovery.evidence)recoveryLine(metrics.get(row.needId),row.sourceIds);
        }
        if(recovery.hypotheses?.length){
          heading('Görüşmede sınanacak ticari ve SWOT hipotezleri');
          for(const row of recovery.hypotheses)recoveryLine((quadrants[row.quadrant]||'Ticari karar')+' · '+row.question,row.sourceIds);
        }
      }
      if(data.verifiedResearch?.competitorCandidates?.length){
        heading('Doğrulanacak rakip adayları');
        data.verifiedResearch.competitorCandidates.forEach(p=>paragraph(p.name+' · '+p.url));
      }
      const comparisons=data.verifiedResearch?.productComparisons||[];
      if(comparisons.length){
        heading('Doğrudan ürün karşılaştırmaları');
        for(const {reference,candidate,fields} of comparisons){
          const details=document.createElement('details'),summary=document.createElement('summary');
          summary.textContent=reference.name+' ve '+candidate.name;details.append(summary);
          const table=document.createElement('table');table.className='ob-product-comparison';details.append(table);
          const titles=table.createTHead().insertRow(),addHeading=(text,scope,row)=>{
            const th=document.createElement('th');th.scope=scope;th.textContent=text;row.append(th);return th;
          };
          addHeading('Ölçüt','col',titles);
          for(const product of [reference,candidate]){
            const th=addHeading(product.name,'col',titles);
            try{
              const url=new URL(product.url);
              if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password){
                const link=document.createElement('a');link.href=url.href;link.textContent=product.name;link.target='_blank';link.rel='noopener noreferrer';
                th.replaceChildren(link);
              }
            }catch{/* Keep the product title if an old link is unavailable. */}
          }
          const body=table.createTBody();
          for(const [label,left,right] of [['Ürün sınıfı',reference.category,candidate.category],...fields.map(field=>[field.label,field.reference?.value,field.candidate?.value])]){
            const row=body.insertRow();addHeading(label,'row',row);
            for(const value of [left,right])row.insertCell().textContent=value||'Doğrulanmadı';
          }
          box.append(details);
        }
      }
      if(data.verifiedResearch?.indirectAlternatives?.length){
        heading('Dolaylı alternatifler');
        data.verifiedResearch.indirectAlternatives.forEach(p=>paragraph([p.name,p.product,p.url].filter(Boolean).join(' · ')));
      }
      if(data.verifiedResearch?.buyerProcurement?.length){
        heading('Satın alma yapısı');
        for(const {segment,label,targetMarket,evidence,hypothesis} of data.verifiedResearch.buyerProcurement){
          const item=document.createElement('article');box.appendChild(item);
          const title=document.createElement('h4');title.textContent=[segment,label,targetMarket].join(' · ');item.appendChild(title);
          if(evidence)paragraph(['Kaynaklı gözlem',evidence.segment,evidence.market,evidence.value,evidence.sourceIds.join(', ')].join(' · '),item);
          if(hypothesis)paragraph('Pilot hipotezi · '+hypothesis,item);
        }
      }
      const evidenceTasks=(data.verifiedResearch?.metrics||[]).filter(metric=>metric.evidence?.length||metric.additionalEvidence);
      if(evidenceTasks.length){
        heading('Araştırma sorularının kaynakları');
        const statuses={verified:'Kanıt olarak kabul edildi',read:'Okundu, bu soru için doğrulama bekliyor',discovered:'Aramada bulundu, okunmadı'};
        for(const task of evidenceTasks){
          const details=document.createElement('details'),summary=document.createElement('summary');
          summary.textContent=(task.displayName||task.name)+(task.evidence?.length?' · '+task.evidence.length+' kaynak':'');details.append(summary);
          const scope=[task.requestedMarket&&'Hedef pazar '+task.requestedMarket,task.requestedPeriod&&'Aranan dönem '+task.requestedPeriod].filter(Boolean);
          if(scope.length)paragraph(scope.join(' · '),details);
          const list=document.createElement('ul');details.append(list);
          for(const source of task.evidence||[]){
            let url;
            try{url=new URL(source.url);}catch{continue;}
            if(!['http:','https:'].includes(url.protocol)||url.username||url.password)continue;
            const item=document.createElement('li'),link=document.createElement('a');
            link.href=url.href;link.textContent=source.title||url.hostname;link.target='_blank';link.rel='noopener noreferrer';
            item.append(link,document.createTextNode([statuses[source.status],source.geography&&'Metinde geçen coğrafya '+source.geography,source.accessed&&'Erişim '+source.accessed].filter(Boolean).map(value=>' · '+value).join('')));
            list.append(item);
          }
          if(task.additionalEvidence)paragraph('Ek bağlantılar araştırma kayıtlarında saklandı.',details);
          box.append(details);
        }
      }
      }
      dialog.querySelector('#ob-review-title').textContent=result.status==='ready'&&data.quality.scope==='read-source-and-quote-filter'&&data.quality.contentComplete===false?'Kaynaklı ön araştırmada kontrol gereken alanlar var':result.status==='ready'?'Ön BHS araştırması hazır':'Ön BHS araştırmasında kontrol gereken alanlar var';
      dialog.querySelector('.ob-review-notice').textContent=result.status==='ready'&&data.quality.scope==='read-source-and-quote-filter'&&data.quality.contentComplete===false?'Doğrulanabilen kaynaklı bölüm hazır. Veri eksikleri ve çıkarımlar görüşmede kontrol edilmeli; rapor tam doğrulanmış analiz olarak sunulmaz. Fiyat alternatiflerini hazırlayabilirsin.':result.status==='ready'?'Ön BHS raporu hazır. Görüşme bağlamına uygun iki alternatifin aylık bedellerini hazırlayabilirsin. Bütçe bilgisi zorunlu değildir.':'Kaynak veya içerik doğrulaması tamamlanmadığı için bu sonuç henüz teklif aşamasına aktarılamaz.';
      if(data.researchContinuity&&(!conversational||data.researchContinuity.status!=='complete')){
        dialog.querySelector('#ob-review-title').textContent=data.researchContinuity.status==='unavailable'?'Görüşme bilgileriyle teklif hazırlığı':'Kısmi BHS ile teklif hazırlığı';
        const stop=data.supervision?.researchStopReason;
        const reason=stop==='research_budget_exhausted'?'Kalan araştırma bütçesi yeni bir çağrıyı karşılamadı. ':
          stop==='research_tools_unavailable'?'Bu araştırma turunda kullanılabilir bir sonraki araç çağrısı bulunamadı. ':
          stop==='research_engine_failure'?'Araştırma aynı işlem hatası tekrar ettiği için durdu. ':
          stop==='research_source_plan_invalid'?'Kaynak planı doğrulanamadı ve kalan araştırma bağımsız bir araçla sürdürülemedi. ':
          data.supervision?.sourceReaderIssue==='source_plan_invalid'?'Kaynak planı doğrulanamadığı için bazı sayfalar okunamadı. ':'';
        const stages={research:'Araştırma',report:'Rapor yazımı',reading:'Kaynak okuma'};
        const diagnosticNotice=(data.researchDiagnostics||[]).filter(row=>Object.hasOwn(stages,row.stage))
          .map(row=>stages[row.stage]+': '+row.message).join(' ');
        const progressNotice=progress?progress.confirmed+'/'+progress.planned+' ihtiyaç doğrulandı; '+progress.reported+' doğrulanmış ihtiyaç raporda, '+progress.findings+' kaynaklı bulgu korundu, '+progress.open+' ihtiyaç açık. ':'';
        dialog.querySelector('.ob-review-notice').textContent=progressNotice+(diagnosticNotice?diagnosticNotice+' ':reason)+data.researchContinuity.notice;
      }
      if(conversational&&data.quality.contentComplete){
        dialog.querySelector('#ob-review-title').textContent='BHS analizi hazır';
        dialog.querySelector('.ob-review-notice').textContent='Marka, pazar, rekabet ve öncelikli aksiyonlar tam raporda yer alıyor. Hizmetleri seçerek teklif hazırlığına geçebilirsin.';
      }
      dialog.querySelector('.ob-price').hidden=result.status!=='ready';
      dialog.querySelector('.ob-service-selection').hidden=result.status!=='ready';
      if(result.status==='ready')ensureSelection().catch(error=>{monthlyError.textContent=error.message;});
    }
    const formatMoney=(value,currency='TRY')=>new Intl.NumberFormat('tr-TR',{style:'currency',currency,maximumFractionDigits:2}).format(value);
    function renderPricing(result){
      draft.pricing=result;
      const box=dialog.querySelector('.ob-pricing'),data=result.data;box.replaceChildren();box.hidden=false;
      const add=(tag,text,parent=box)=>{const node=document.createElement(tag);node.textContent=text;parent.appendChild(node);return node;};
      const monthly=data.pricingMode==='monthly';
      bhsCalendarChoice.hidden=data.quote?.status==='pending';
      add('h3',monthly?'Ay bazlı hizmet bedelleri':'Aylık fiyat alternatifleri');
      if(data.quote?.status==='ready'){const fx=data.quote.exchangeRate;add('p','Sabit teklif kuru: 1 USD = '+fx.rate+' TL · TCMB '+fx.publishedAt+'. Gönderilmiş teklifin tutarı kur değişikliğiyle güncellenmez.');}
      if(data.quote?.status==='pending')add('p',data.quote.notice);add('p',data.scope.summary);
      add('p',data.scope.budgetPosture==='limited'?'Görüşmedeki bütçe kısıtı başlangıç kapsamına yansıtıldı.':'Bütçe belirtilmese de hizmet kapsamı ve maliyetlerden fiyat hesaplandı.');
      if(data.scope.budgetQuote)add('p','Görüşme dayanağı: '+data.scope.budgetQuote);
      function projectPrices(plan,quoted,parent=box){
        if(!plan)return;add('h4','Tek seferlik proje bedelleri · Retainer’a dahil değildir',parent);
        plan.items.forEach(p=>add('p',p.name+(p.quantity>1?' × '+p.quantity:'')+' · '+(data.quote?.status==='pending'?'USD tutarı için kur bekleniyor':formatMoney(quoted?.items.find(q=>q.id===p.serviceId)?.amount??p.amount,quoted?'USD':'TRY'))+' · tek seferlik',parent));
        const internal=add('details','',parent);add('summary','Proje maliyetleri · İç hesaplama',internal);plan.items.forEach(p=>add('p',p.name+' · Maliyet: '+formatMoney(p.cost)+' · Account: '+formatMoney(p.accountCost)+' · Asgari: '+formatMoney(p.minimumAmount)+' · İdeal: '+formatMoney(p.idealAmount),internal));
        add('p','Proje toplamı: '+(data.quote?.status==='pending'?'USD tutarı için kur bekleniyor':formatMoney(quoted?.oneTimeAmount??plan.oneTimeAmount,quoted?'USD':'TRY')),parent);
      }
      if(monthly){
        for(const row of data.monthlyPlan.months){
          const article=add('article',''),quoted=data.quote?.monthlyPlan?.months.find(m=>m.month===row.month);
          add('h4',row.month+'. ay',article);
          add('p',data.quote?.status==='pending'?'USD tutarı için kur bekleniyor':formatMoney(quoted?.monthlyAmount??row.monthlyAmount,quoted?'USD':'TRY')+' / ay',article);
          row.services.forEach(service=>add('p',service.name+(service.reason!==service.name?' · '+service.reason:''),article));
          const details=add('details','',article);add('summary','İç hesaplama ayrıntıları',details);
          add('p','Maliyet: '+formatMoney(row.cost)+' · Asgari: '+formatMoney(row.minimumAmount)+' · İdeal: '+formatMoney(row.idealAmount),details);
          add('p','Account koordinasyon maliyeti: '+formatMoney(row.accountCost),details);projectPrices(row.projectPlan,quoted?.projectPlan,article);
        }
        add('p','Kayıt sırasında kart tahmini değeri için ilk ayın operasyon bedeli referans alınır; diğer ayların bedelleri teklifte ayrı gösterilir.');
      }else data.alternatives.forEach(alternative=>{
        const article=document.createElement('article');box.appendChild(article);
        add('h4',alternative.name+(alternative.id===data.recommendedAlternativeId?' · Önerilen':''),article);
        const quoted=data.quote?.alternatives?.find(a=>a.id===alternative.id);
        add('p',alternative.available===false?'Bu alternatif için aylık maliyet seçilmedi.':data.quote?.status==='pending'?'USD tutarı için kur bekleniyor':formatMoney(quoted?.monthlyAmount??alternative.monthlyAmount,quoted?'USD':'TRY')+' / ay',article);
        alternative.services.forEach(service=>add('p',service.name+' · '+service.reason,article));
        if(alternative.note)add('p',alternative.note,article);
        if(alternative.budgetFit==='above')add('p','Belirtilen teklif aralığının üzerinde; maliyet tabanının altına inilmedi.',article);
        const details=document.createElement('details');article.appendChild(details);add('summary','İç hesaplama ayrıntıları',details);
        add('p','Maliyet: '+formatMoney(alternative.cost)+' · Asgari: '+formatMoney(alternative.minimumAmount)+' · İdeal: '+formatMoney(alternative.idealAmount),details);
        add('p','Account koordinasyon maliyeti: '+formatMoney(alternative.accountCost),details);
        if(alternative.growthCosting)add('p',alternative.growthCosting.note,details);
      });
      if(!monthly)projectPrices(data.projectPlan,data.quote?.projectPlan);
      if(data.scope.deferred.length){add('h4','Sonraki aşamaya ayrılan işler');data.scope.deferred.forEach(item=>add('p',item.name+' · '+item.reason));}
      if(data.scope.pending.length){add('h4','Ayrıca fiyatlandırılacak işler');data.scope.pending.forEach(item=>add('p',item.name+' · '+item.reason));}
      data.scope.exclusions.forEach(item=>add('p',item));data.notices.forEach(item=>add('p',item));
      add('p','Maliyet tablosu: '+data.costVersion+' · Kartın tahmini değeri henüz değiştirilmedi.');
      dialog.querySelector('#ob-review-title').textContent=result.status==='ready'?'Fiyat alternatifleri hazır':'Fiyat alternatifleri hazır · Kapsam kontrolü gerekli';
      dialog.querySelector('.ob-review-notice').textContent=(monthly?'Seçtiğin her ayın operasyon bedeli ve uygulama takvimi hazır. ':'İki alternatifin toplam aylık hizmet bedelleri hesaplandı. ')+'Sıradaki aşama teklif taslağının oluşturulması. '+(draft.audit?.data.researchContinuity?.notice||'');
      dialog.querySelector('.ob-scope-approved').parentElement.lastChild.textContent=monthly?' Kapsamı, her ayın bedelini ve aylık iş akışını ve tek seferlik proje bedellerini kontrol ettim.':' Kapsamı, iki alternatifin aylık bedellerini ve başlangıç planını ve ayrı proje bedellerini kontrol ettim.';
      dialog.querySelector('.ob-price').hidden=true;dialog.querySelector('.ob-service-selection').hidden=true;dialog.querySelector('.ob-services-edit').hidden=false;
      dialog.querySelector('.ob-steps li[aria-current]')?.removeAttribute('aria-current');dialog.querySelectorAll('.ob-steps li')[2].setAttribute('aria-current','step');
      dialog.querySelector('.ob-body').scrollTop=0;
    }
    dialog.querySelector('.ob-price').addEventListener('click',async()=>{
      if(task||draft.audit?.status!=='ready')return;
      const button=dialog.querySelector('.ob-price'),notice=dialog.querySelector('.ob-review-notice');
      if(typeof window.PipelinePricingRequest!=='function'||!draft.pricingProof){notice.textContent='Fiyat hesaplama bağlantısı için bu önizlemede tamamlanmış ve doğrulanmış BHS gerekli.';return;}
      try{await ensureSelection();draft.pricingOptions=pricingOptions();monthlyError.textContent='';}catch(error){monthlyError.textContent=error.message;monthlyError.scrollIntoView({block:'center'});return;}
      if(task)return;
      const current={kind:'pricing',stopped:false,ticket:null,audit:draft.audit,pricingProof:draft.pricingProof,brief:Object.fromEntries(fields.map(key=>[key,draft[key]])),pricingOptions:draft.pricingOptions||{}};task=current;button.disabled=true;
      try{
        let action='start';
        for(;;){
          notice.textContent=current.pricingOptions.pricingMode==='monthly'?'Seçtiğin operasyonların aylık bedelleri maliyet tablosundan hesaplanıyor…':'Seçtiğin hizmetlerin segment maliyetlerinden iki alternatif ve ayrı proje bedelleri hesaplanıyor…';
          const response=await window.PipelinePricingRequest({action,brief:current.brief,audit:current.audit,pricingProof:current.pricingProof,...current.pricingOptions,...(current.ticket?{ticket:current.ticket}:{}),...(action==='start'?{requestId:crypto.randomUUID()}:{} )});
          if(response.ticket)current.ticket=response.ticket;
          if(current.stopped){if(current.ticket)window.PipelinePricingRequest({action:'cancel',brief:current.brief,audit:current.audit,pricingProof:current.pricingProof,ticket:current.ticket}).catch(()=>{});return;}
          if(response.phase==='complete'){draft.proposalProof=response.proposalProof;renderPricing(response.result);dialog.querySelector('.ob-proposal-controls').hidden=response.result.data.pricingMode==='monthly';dialog.querySelector('.ob-compose').hidden=response.result.data.quote?.status==='pending';dialog.querySelector('.ob-price').hidden=response.result.data.quote?.status!=='pending';task=null;return;}
          action='status';await new Promise(resolve=>setTimeout(resolve,3000));if(current.stopped)return;
        }
      }catch(error){if(!current.stopped)notice.textContent=error.message||'Fiyat alternatifleri hazırlanamadı. Yeni model çağrısı otomatik başlatılmadı.';}
      finally{if(task===current)task=null;button.disabled=false;}
    });

    dialog.querySelector('.ob-plan-mode').addEventListener('change',e=>{dialog.querySelector('.ob-manual-label').hidden=e.target.value!=='manual';invalidateProposal();});
    dialog.querySelector('.ob-manual-steps').addEventListener('input',invalidateProposal);
    bhsCalendarToggle.addEventListener('change',invalidateProposal);
    function invalidateProposal(){if(task?.kind==='proposal')stopTask();draft.proposal=null;draft.saveProof=null;draft.saved=null;for(const cls of ['ob-proposal','ob-approval','ob-save','ob-publish'])dialog.querySelector('.'+cls).hidden=true;dialog.querySelector('.ob-compose').hidden=!draft.pricing||draft.pricing.data.quote?.status==='pending';}
    dialog.querySelector('.ob-compose').addEventListener('click',async()=>{
      if(task||!draft.pricing||!draft.logo?.verifiedData)return;
      const notice=dialog.querySelector('.ob-review-notice'),button=dialog.querySelector('.ob-compose');
      if(typeof window.PipelineProposalRequest!=='function'){notice.textContent='Teklif servisi bu ortamda bağlı değil.';return;}
      const monthly=draft.pricing.data.pricingMode==='monthly';
      const planMode=monthly?'operations':dialog.querySelector('.ob-plan-mode').value;
      const bhsCalendar=bhsCalendarToggle.checked;
      const manualSteps=dialog.querySelector('.ob-manual-steps').value.split('\n').filter(x=>x.trim()).map(line=>{const i=line.indexOf('|');return {time:i<0?'':line.slice(0,i).trim(),title:i<0?line:line.slice(i+1).trim()};});
      if(planMode==='manual'&&(!manualSteps.length||manualSteps.some(s=>!s.title||!s.time))){notice.textContent='Her manuel adımı zaman | adım biçiminde gir.';return;}
      const payload={context:{leadId:source.leadId,spaceId:source.spaceId},brief:Object.fromEntries(fields.map(key=>[key,draft[key]])),audit:draft.audit,pricing:draft.pricing,proposalProof:draft.proposalProof,logo:draft.logo.verifiedData,logoBackground:draft.logo.placement?.background||draft.logo.verifiedData?.candidates?.[0]?.placement?.background||'#ffffff',planMode,manualSteps,...(bhsCalendar?{bhsCalendar:true}:{})};
      const current={kind:'proposal',payload,stopped:false,ticket:null};task=current;button.disabled=true;
      try{
        let action='start';const requestId=crypto.randomUUID();
        for(;;){
          notice.textContent=draft.language==='en'?'İngilizce teklif hazırlanıyor; mevcut BHS, fiyatlar ve logo korunuyor…':'Görüşme kapsamı, mevcut BHS, aylık bedeller ve logo teklif şablonuna yerleştiriliyor…';
          const response=await window.PipelineProposalRequest({...payload,action,requestId,...(current.ticket?{ticket:current.ticket}:{})});
          if(response.ticket)current.ticket=response.ticket;
          if(current.stopped){if(current.ticket)window.PipelineProposalRequest({...payload,action:'cancel',ticket:current.ticket}).catch(()=>{});return;}
          if(response.draftCost)showDraftCost(response.draftCost);
          if(response.phase==='complete'){
            draft.proposal=response.result;draft.saveProof=response.saveProof;draft.saved=null;
            const box=dialog.querySelector('.ob-proposal');box.hidden=false;window.PipelineProposal.mount(box,response.result.data);
            dialog.querySelector('.ob-pricing').hidden=true;dialog.querySelector('.ob-research-report').hidden=true;
            dialog.querySelector('.ob-approval').hidden=false;dialog.querySelector('.ob-save').hidden=false;dialog.querySelector('.ob-publish').hidden=true;button.hidden=true;
            dialog.querySelectorAll('.ob-approval input').forEach(x=>x.checked=false);
            let planReviewNotice='';
            if(response.draftPlanReview){
              try{planReviewNotice=(await import('/offers/implementation-review.mjs')).implementationReviewNotice(response.draftPlanReview);}
              catch{planReviewNotice='Planın doğrulama ayrıntıları yüklenemedi; uygulama adımlarını kontrol et.';}
            }
            const calendarApplied=bhsCalendar&&Object.values(response.result.data.plans).some(plan=>plan.steps.some(step=>step.bhsActions?.some(action=>action.recommendation)));
            const calendarNotice=bhsCalendar?(calendarApplied?' BHS önerileri teklif takvimine eklendi.':' Seçili hizmetlerle eşleşen BHS önerisi bulunamadı.'):'';
            dialog.querySelector('#ob-review-title').textContent='Teklif taslağı hazır';notice.textContent=(draft.audit?.data.researchContinuity?.notice||'')+
             (response.draftPlanStatus==='standard'?' Brief’e özgü uygulama planı doğrulanamadı. Seçili hizmetlerin başlangıç planı gösteriliyor.':'')+
             (response.draftPlanStatus==='bhs_retained'&&!calendarApplied?' Seçili kapsama uygun BHS pilotları ve ölçümleri planda yer alıyor.':'')+
             calendarNotice+
             (response.draftPlanStatus==='partial'?' Brief’e özgü uygulama planının bir kısmı doğrulandı. Diğer adımları kontrol et.':'')+
             (planReviewNotice?' '+planReviewNotice:'')+
             ' Logo, kapsam ve planı bu teklif üzerinde kontrol et. '+(existingOffer?'Yeni teklif ayrı kaydedilir; mevcut teklif ve kart değeri korunur.':'Kaydetme, kart değerini önerilen aylık bedele günceller.');
            task=null;dialog.querySelector('.ob-body').scrollTop=0;return;
          }
          action='status';await new Promise(resolve=>setTimeout(resolve,2500));if(current.stopped)return;
        }
      }catch(error){if(!current.stopped){if(error.draftCost)showDraftCost(error.draftCost);notice.textContent=error.message||'Teklif oluşturulamadı.';}}
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
          draft.saved=response.offer;if(!existingOffer)context.lead.value=String(response.offer.monthlyAmount);
          window.dispatchEvent(new CustomEvent('pipeline-offer-saved',{detail:{leadId:source.leadId,spaceId:source.spaceId,value:context.lead.value,keepCardValue:existingOffer,offer:response.offer}}));
          status.textContent='Teklif v'+response.offer.version+' kaydedildi. '+(existingOffer?'Önceki teklif ve kart değeri korundu.':(draft.pricing?.data.pricingMode==='monthly'?'Kart tahmini değeri (ilk ay): ':'Kart tahmini değeri: ')+formatMoney(response.offer.monthlyAmount)+' / ay.');
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
    dialog.querySelector('.ob-retry').addEventListener('click',()=>{
      if(!recoverableAudit||recoverableAudit.stopped||task)return;
      const current=recoverableAudit;recoverableAudit=null;runAudit(current,'recover');
    });
    dialog.querySelector('.ob-continue').addEventListener('click',()=>{
      if(!continuableAudit||continuableAudit.stopped||(task&&task!==continuableAudit))return;
      const current=continuableAudit;continuableAudit=null;
      if(task===current){current.stopped=true;current.handedOff=true;runAudit({...current,stopped:false,handedOff:false},'continue');}
      else runAudit(current,'continue');
    });
    gapBox.querySelector('button').addEventListener('click',async()=>{
      if(task||!gapAudit)return;
      const current=gapAudit;
      gapAudit=null;gapBox.hidden=true;
      await runAudit(current,'complete_gaps');
    });
    function applyAuditResponse(current,response){
      if(draft.pricing&&draft.audit&&JSON.stringify(draft.audit)!==JSON.stringify(response.result))invalidatePricing();
      draft.pricingProof=response.pricingProof;
      renderAudit(response.result);
      showGapCompletion(current,response.gapCompletion);
      if(response.savedBhs?.status==='saved')markBhsSaved(response.savedBhs.id);
      if(response.savedBhs?.status==='retry'){
        unsavedBhs={brief:current.brief,audit:response.result,pricingProof:response.pricingProof};
        bhsSaveStatus.hidden=false;bhsSaveRetry.hidden=false;
        bhsSaveStatus.textContent='Otomatik kayıt tamamlanamadı. Bu analizi ücret ödemeden tekrar kaydedebilirsin.';
      }
    }
    function markBhsSaved(id){
      unsavedBhs=null;bhsSaveRetry.hidden=true;bhsSaveStatus.hidden=false;
      bhsSaveStatus.textContent='BHS bu karta kaydedildi.';
      window.dispatchEvent(new CustomEvent('pipeline-bhs-saved',{detail:{leadId:source.leadId,spaceId:source.spaceId,id}}));
    }
    bhsSaveRetry.addEventListener('click',async()=>{
      const pending=unsavedBhs;if(!pending)return;
      bhsSaveRetry.disabled=true;
      try{
        const response=await window.PipelineOfferReuseRequest({action:'saved-save',context:{leadId:source.leadId,spaceId:source.spaceId},...pending});
        if(unsavedBhs===pending)markBhsSaved(response.savedBhs.id);
      }catch(error){if(unsavedBhs===pending)bhsSaveStatus.textContent=error.message||'BHS kaydedilemedi. Tekrar deneyebilirsin.';}
      finally{bhsSaveRetry.disabled=false;}
    });
    function showGapCompletion(current,gap){
      gapAudit=null;gapBox.hidden=true;
      if(!gap)return;
      const notice=dialog.querySelector('.ob-review-notice');
      const gapMoney=value=>(value/100).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
      const gapCap=Number.isSafeInteger(gap.capKurus)?gap.capKurus:3000;
      if(gap.available&&current.ticket){
        gapAudit=current;gapBox.hidden=false;
        const combined=Number.isSafeInteger(gap.maximumCombinedKurus)&&Number.isSafeInteger(gap.baseCommittedKurus)?
          ' Mevcut kullanım ve rezerv '+gapMoney(gap.baseCommittedKurus)+' TL. Ek araştırma için ayrı bütçe açılır ve bu tutarla birlikte toplam '+gapMoney(gap.maximumCombinedKurus)+' TL’ye kadar çıkabilir.':'';
        gapBox.querySelector('p').textContent='Eksik bölümler: '+gap.sections.join(', ')+'. Yalnız bu bölümler için '+gapMoney(gapCap)+' TL’ye kadar ek araştırma yapabilirsin.'+combined;
      }else if(Number.isSafeInteger(gap.chargedKurus)){
        const state=gap.status==='complete'?'Ek araştırma tamamlandı.':gap.status==='reserved'?'Ek araştırma henüz sonuçlanmadı. Mevcut bulgular kullanılabilir.':'Ek araştırmadan mevcut rapora aktarılabilecek yeni sonuç alınmadı.';
        notice.textContent+=' '+state+' Bu adımın kullanım ve rezervi: '+gapMoney(gap.chargedKurus)+' / '+gapMoney(gapCap)+' TL.';
        if(Number.isSafeInteger(gap.combinedCommittedKurus))notice.textContent+=' BHS ve ek araştırmanın birlikte kullanım ve rezervi '+gapMoney(gap.combinedCommittedKurus)+' TL.';
      }
    }
    function showAuditContinuation(current,active){
      continuableAudit=current;
      const section=dialog.querySelector('.ob-continuation');
      section.querySelector('p').textContent=active?'Araştırmayı durdurup görüşme bilgileriyle teklife geçebilirsin. Başlatılmış işlemlerin maliyetleri korunur.':'Doğrulanan bulgular ve görüşme bilgileriyle teklif hazırlığına geçebilirsin. Bu adım ek ücretli model çağrısı yapmaz.';
      section.hidden=false;
    }
    function showDraftCost(cost){
      const summary=dialog.querySelector('.ob-draft-cost');
      summary.hidden=!cost;
      if(cost)summary.textContent='Teklif taslağı bütçesi (kullanım ve rezerv): '+formatMoney(cost.chargedKurus/100)+' / '+formatMoney(cost.capKurus/100);
    }
    function showAuditCost(cost,separateGap=false){
      const money=value=>Number.isSafeInteger(value)?(value/100).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
      dialog.querySelector('.ob-footer>p').textContent=(window.PipelineOfferPersistence?'Kalıcı test alanı · ':'')+(Number.isSafeInteger(cost.attemptChargedKurus)?'Bu BHS denemesi (kullanım ve rezerv): '+money(cost.attemptChargedKurus)+' TL · ':'')+(separateGap?'Normal BHS bütçesi (kullanım ve rezerv): ':'BHS bütçesi (kullanım ve rezerv): ')+money(cost.chargedKurus)+' / '+money(cost.capKurus??5000)+' TL.'+(separateGap?'':' Toplam sınır korunur.');
      const detail=dialog.querySelector('.ob-cost-detail'),b=cost.breakdown;detail.hidden=!b;
      if(b)dialog.querySelector('.ob-cost-copy').textContent='Bu kontrolde ayrıştırılabilen kullanım: '+money(b.verifiedUsageKurus)+' TL · Korunan model/işlem rezervi: '+money(b.knownReservationKurus)+' TL · Önceki kullanım ve rezervler: '+money(b.historicalCommittedKurus)+' TL · Sabit altyapı rezervi: '+money(b.infraReserveKurus)+' TL. Kullanım makbuzu bulunmayan rezervler kesinleşmiş harcama olarak gösterilmez.';
    }
    async function runAudit(resume=null,initialAction=null){
      const notice=dialog.querySelector('.ob-review-notice');
      if(typeof window.PipelineAuditRequest!=='function'){
        dialog.querySelector('#ob-review-title').textContent='BHS araştırma bağlantısı gerekli';
        notice.textContent='Bu önizlemede araştırma servisi bağlı değil. Teklif veya araştırma sonucu oluşturulmadı.';return;
      }
      recoverableAudit=null;continuableAudit=null;dialog.querySelector('.ob-recovery').hidden=true;dialog.querySelector('.ob-continuation').hidden=true;
      const current=resume||{kind:'audit',stopped:false,ticket:null,brief:Object.fromEntries(fields.map(key=>[key,draft[key]])),startRequestId:crypto.randomUUID(),websiteInput:form.elements.website.value};task=current;
      websiteConfirmation=null;confirmWebsiteButton.hidden=true;
      dialog.querySelector('.ob-resume').hidden=true;dialog.querySelector('#ob-review-title').textContent='Araştırma hazırlanıyor';
      dialog.querySelector('.ob-edit').textContent='Araştırmayı durdur ve düzenle';
      const researchWebsite=dialog.querySelector('.ob-research-website');
      if(!resume){researchWebsite.hidden=true;showDraftCost(null);showAuditCost({attemptChargedKurus:0});}
      let action=initialAction||(resume?'status':'start');
      let reconnects=0;
      try{
        for(;;){
          notice.textContent=action==='complete_gaps'?'Yalnız eksik BHS bölümleri araştırılıyor…':action==='continue'?'Mevcut bilgilerle teklif hazırlığına geçiliyor; yeni ücretli araştırma başlatılmıyor…':action==='start'?'BHS başlamadan önce web sitesi kontrol ediliyor…':['advance','structure'].includes(action)?'Kaynaklar okunuyor ve kanıta dayalı BHS hazırlanıyor…':'Araştırma sürüyor; kaynaklar, rakipler ve altı BHS boyutu inceleniyor…';
          let response;
          const start=action==='start'?{requestId:current.startRequestId,websiteInput:current.websiteInput,...(current.confirmedWebsite?{confirmedWebsite:current.confirmedWebsite}:{})}:{};
          try{response=await window.PipelineAuditRequest({action,brief:current.brief,context:{leadId:source.leadId,spaceId:source.spaceId,researchRunId:researchRuns.new,...(existingOffer?{sourceOfferId:variant.sourceOfferId}:{})},...(current.ticket?{ticket:current.ticket}:{}),...start});}
          catch(error){
            const canReconnect=action==='start'?reconnects<1:action==='status'&&current.background&&current.ticket&&reconnects<2;
            if(error.code!=='audit_transport'||!canReconnect)throw error;
            reconnects++;
            notice.textContent='Aynı araştırmanın bağlantısı yeniden kontrol ediliyor…';
            await new Promise(resolve=>setTimeout(resolve,action==='start'?3000:10000));
            if(current.stopped)return;
            continue;
          }
          reconnects=0;
          if(response.ticket)current.ticket=response.ticket;
          if(response.execution==='background')current.background=true;
          if(current.stopped){if(current.ticket&&!current.handedOff)window.PipelineAuditRequest({action:'cancel',brief:current.brief,ticket:current.ticket}).catch(()=>{});return;}
          if(response.acceptedWebsite){
            if(response.checkedWebsite)current.checkedWebsite=response.checkedWebsite;
            researchWebsite.textContent='BHS’ye iletilen web sitesi: '+response.acceptedWebsite;
            if(current.checkedWebsite)researchWebsite.textContent+=' · Site kontrolünde ulaşılan adres: '+current.checkedWebsite;
            if(response.researchRunId)researchWebsite.textContent+=' · Araştırma kimliği: '+response.researchRunId;
            researchWebsite.hidden=false;
          }
          if(response.cost){current.bounded=true;showAuditCost(response.cost,Number.isSafeInteger(response.gapCompletion?.maximumCombinedKurus));}
          if(response.phase==='complete'&&response.result){
            continuableAudit=null;dialog.querySelector('.ob-continuation').hidden=true;
            applyAuditResponse(current,response);task=null;return;
          }
          if(response.phase==='complete'){
            action='status';
            await new Promise(resolve=>setTimeout(resolve,10000));
            if(current.stopped)return;
            continue;
          }
          if(response.nextAction==='advance'){action='advance';continue;}
          if(response.phase==='research_complete'){action='structure';continue;}
          if(response.continuationAvailable&&current.ticket)showAuditContinuation(current,true);
          action='status';
          const stages={source_plan:'Birincil kaynaklar ve karşılaştırılabilir rakipler bulunuyor…',evidence:'Bulunan kaynaklar tek araştırma paketinde okunuyor…',scope:'BHS ve görüşme bağlamına uygun hizmet kapsamı hazırlanıyor…',synthesis:'Okunan kaynaklardan altı boyutlu BHS analizi hazırlanıyor…',revision:'Kanıtların kapsamı ve yorumların kesinliği gözden geçiriliyor…',semantic:'Bulguların şirket, dönem ve kaynak desteği ayrı bir denetimden geçiyor…'};
          if(response.phase==='conversation')notice.textContent=response.message||'Marka, hedefler ve kaynaklar aynı analiz oturumunda değerlendiriliyor…';
          else if(stages[response.phase])notice.textContent=stages[response.phase];
          await new Promise(resolve=>setTimeout(resolve,10000));
          if(current.stopped)return;
        }
      }catch(error){
        if(current.stopped)return;
        if(action==='start'&&error.websiteIdentity){
          const {submittedWebsite,checkedWebsite}=error.websiteIdentity;
          dialog.querySelector('#ob-review-title').textContent='Web sitesini kontrol et';
          notice.textContent=error.message;
          researchWebsite.textContent='Brief’teki web sitesi: '+submittedWebsite;
          if(checkedWebsite&&checkedWebsite!==submittedWebsite)researchWebsite.textContent+=' · Site kontrolünde ulaşılan adres: '+checkedWebsite;
          researchWebsite.hidden=false;
          if(error.code==='website_confirmation_required'&&checkedWebsite){
            websiteConfirmation={current,checkedWebsite};confirmWebsiteButton.hidden=false;
          }
          return;
        }
        if(initialAction==='complete_gaps'&&draft.audit){
          renderAudit(draft.audit);
          if(current.ticket){
            pausedAudit=current;
            dialog.querySelector('.ob-resume').hidden=false;
            notice.textContent+=' Ek araştırmanın durumunu “Araştırmaya devam et” ile kontrol edebilirsin.';
          }
          return;
        }
        if(error.cost)showAuditCost(error.cost);
        const transport=error.code==='audit_transport',canResume=transport&&(error.canResume||current.bounded)&&current.ticket;
        dialog.querySelector('#ob-review-title').textContent=canResume?'BHS bağlantısı kesildi':'Araştırma durumu';
        notice.textContent=(error.message||'Araştırma servisine ulaşılamadı.')+(canResume?' Aynı araştırmanın durumunu yeniden kontrol etmek için “Araştırmaya devam et” seçeneğini kullan.':' Yeni araştırma otomatik başlatılmadı.')+(transport&&!canResume?' İsteğin sunucuda işlenip işlenmediği belirsiz; tekrar başlatılmadı.':'');
        if(canResume){pausedAudit=current;dialog.querySelector('.ob-resume').hidden=false;}
        if(error.recoveryAvailable&&error.ticket){current.ticket=error.ticket;recoverableAudit=current;dialog.querySelector('.ob-recovery').hidden=false;}
        if(error.continuationAvailable&&error.ticket){current.ticket=error.ticket;showAuditContinuation(current,false);}
        if(error.budgetDetail){const money=value=>(Math.max(0,value)/100).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});const d=error.budgetDetail;notice.textContent+=' Bu adım için gerekli üst tutar: '+money(d.requiredKurus)+' TL; kullanılabilir: '+money(d.availableKurus)+' TL. Sonraki aşamalara ayrılan: '+money(d.followingReserveKurus)+' TL.'+(d.limitKurus===3000?' Otomatik maliyet hedefi: 30 TL.':'')+' Kartın kalan toplam sınırı: '+money(d.remainingKurus)+' TL.';}
        if(error.code&&!transport)notice.textContent+=' Hata kodu: '+error.code+'.';
        if(error.requestId)notice.textContent+=' Kontrol kodu: '+error.requestId;
      }finally{if(task===current)task=null;if(!task&&dialog.isConnected)dialog.querySelector('.ob-edit').textContent='Bilgileri düzenle';}
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
        ['Web sitesi', model.webUrl(draft.website)], ['Logo', draft.logo ? (draft.logo.verifiedData?.processing==='original'?'Orijinal görsel hazır · Görsel onay teklif taslağında yapılacak':'Şeffaf PNG hazır · Görsel onay teklif taslağında yapılacak') : 'Hazırlanmadı'],
        ['Hedefler', draft.goals], ['İhtiyaçlar', draft.needs], ['Konuşulan hizmetler', draft.services],
        ['Teklif dili', draft.language==='en'?'İngilizce':'Türkçe'],
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
      if(variant&&form.elements.bhsMode.value==='reuse')runReuse();else runAudit();
    });
    async function runReuse(){
      const current={kind:'reuse',stopped:false};task=current;
      const notice=dialog.querySelector('.ob-review-notice');
      dialog.querySelector('#ob-review-title').textContent='Mevcut BHS aktarılıyor';
      notice.textContent='Kaydedilen analiz yükleniyor.';
      try{
        const result=await window.PipelineOfferReuseRequest({action:variant.savedReportId?'saved-prepare':'prepare',savedReportId:variant.savedReportId,sourceOfferId:variant.sourceOfferId,researchRunId:researchRuns.reuse,context:{leadId:source.leadId,spaceId:source.spaceId},brief:Object.fromEntries(fields.map(key=>[key,draft[key]]))});
        if(current.stopped)return;draft.pricingProof=result.pricingProof;renderAudit(result.result);
        if(variant.savedReportId){
          notice.textContent='Kayıtlı BHS yüklendi. Ek BHS maliyeti 0 TL.';
          if(result.result.data.researchReuse?.contextNeedsConfirmation)notice.textContent+=' Analiz, kaydedildiği tarihteki brief ve pazar kapsamını yansıtır.';
        }else notice.textContent='Mevcut BHS kullanıldı. Yeni analiz yapılmadı; kapsam bu brief üzerinden hazırlandı.';
      }catch(error){if(!current.stopped){dialog.querySelector('#ob-review-title').textContent='Mevcut BHS aktarılamadı';notice.textContent=error.message||'Kaydedilen araştırmaya ulaşılamadı. Yeni ücretli analiz başlatılmadı.';}}
      finally{if(task===current)task=null;}
    }
    dialog.showModal();
    form.elements.brandName.focus();
  }

  window.PipelineOfferBrief = Object.freeze({ open });
})();
