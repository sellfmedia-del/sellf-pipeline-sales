/* Brief UI only. It never writes to the CRM, runs an audit or persists files. */
(function () {
  'use strict';
  let active = null;
  const labels = { kobi: 'KOBİ', corporate: 'Kurumsal', key_account: 'Key Account' };
  const fields = ['brandName', 'segment', 'website', 'goals', 'needs', 'services', 'budget', 'meetingNotes'];

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
            <div class="ob-field"><label for="ob-budget">Aylık bütçe, TL <small>(varsa)</small></label><input id="ob-budget" name="budget" type="number" inputmode="decimal" min="0" step="any" placeholder="Bilinmiyorsa boş bırak"><p class="ob-hint">Görüşmede belirtilen bütçedir; teklif fiyatı değildir.</p><p class="ob-error" id="error-budget"></p></div>
          </div></fieldset>
          <fieldset><legend>Toplantı notları ve bağlam</legend><div class="ob-field"><label for="ob-meetingNotes">Araştırmada kullanılacak notlar</label><textarea id="ob-meetingNotes" name="meetingNotes" class="ob-notes" maxlength="30000"></textarea><p class="ob-hint">Kart notları ve görüşme geçmişinden aktarıldı. Buradaki düzenlemeler kartın asıl kayıtlarını değiştirmez.</p></div>
            <details class="ob-sources"><summary>Karttaki kaynak bilgilerini gör</summary><div class="ob-source-content"></div></details>
          </fieldset>
        </form>
        <section class="ob-review" aria-labelledby="ob-review-title" hidden>
          <span class="ob-review-tag">BRIEF KONTROLÜ TAMAMLANDI</span><h2 id="ob-review-title">Analiz için bilgiler hazır</h2><p class="ob-review-notice">BHS motoru henüz bağlı değil. Bu önizlemede araştırma başlatılmaz ve teklif oluşturulmaz.</p><dl class="ob-review-data"></dl>
        </section>
      </div>
      <footer class="ob-footer"><p>Önizleme: Düzenlemeler kaydedilmez.</p><div><button type="button" class="ob-back">Karta dön</button><button type="submit" form="offer-brief-form" class="ob-next">BHS Analizini Hazırla</button><button type="button" class="ob-edit" hidden>Bilgileri düzenle</button></div></footer>`;
    document.body.appendChild(dialog);
    const form = dialog.querySelector('form');
    let reviewing = false;
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
      onChange: value => { draft.logo = value; dialog.querySelector('#error-logoUrl').textContent = ''; }
    });
    form.elements.website.addEventListener('input', () => logoControl?.invalidate());
    form.elements.website.addEventListener('blur', () => logoControl?.prepare());
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
      dialog.querySelector('.ob-review').hidden = !value;
      dialog.querySelector('.ob-next').hidden = value;
      dialog.querySelector('.ob-edit').hidden = !value;
      dialog.querySelector('.ob-body').scrollTop = 0;
      dialog.querySelector(value ? '#ob-review-title' : '#ob-brandName').focus();
    }
    dialog.querySelector('.ob-edit').addEventListener('click', () => setReview(false));
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
      if (errors.logoUrl && Object.keys(errors)[0] === 'logoUrl') dialog.querySelector('.ol-fetch')?.focus();
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
        ['Web sitesi', model.webUrl(draft.website)], ['Logo', draft.logo ? 'Markanın sitesinden alındı · Şeffaf PNG' : 'Hazırlanmadı'],
        ['Hedefler', draft.goals], ['İhtiyaçlar', draft.needs], ['Konuşulan hizmetler', draft.services],
        ['Aylık bütçe', draft.budget === '' ? 'Belirtilmedi' : new Intl.NumberFormat('tr-TR', {style:'currency', currency:'TRY'}).format(Number(draft.budget))],
        ['Toplantı notları', draft.meetingNotes || 'Belirtilmedi']
      ];
      values.forEach(([label, value]) => {
        const row = document.createElement('div');
        const dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = label; dd.textContent = value;
        row.append(dt, dd); details.appendChild(row);
      });
      const title = dialog.querySelector('#ob-review-title');
      title.tabIndex = -1;
      setReview(true);
    });
    dialog.showModal();
    form.elements.brandName.focus();
  }

  window.PipelineOfferBrief = Object.freeze({ open });
})();
