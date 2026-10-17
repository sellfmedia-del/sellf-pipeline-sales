(function (root) {
  'use strict';
  const text = value => typeof value === 'string' ? value : '';
  const segments = ['kobi', 'corporate', 'key_account'];

  function webUrl(value) {
    const input = text(value).trim();
    if (!input || /\s/.test(input)) return '';
    try {
      const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : 'https://' + input);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.')) return '';
      return url.href;
    } catch (_) { return ''; }
  }

  function createDraft(context) {
    const lead = context.lead || {};
    const timeline = (Array.isArray(lead.timeline) ? lead.timeline : []).map(item => ({
      type: text(item.type), date: text(item.date), note: text(item.note)
    }));
    const source = {
      leadId: text(lead.id), spaceId: text(context.spaceId),
      company: text(lead.company), contact: text(lead.name), notes: text(lead.notes),
      timeline
    };
    return {
      source,
      brandName: source.company, segment: '', website: '', logoUrl: '', logoFile: null, logo: null,
      goals: '', needs: '', services: '', budget: '',
      meetingNotes: [source.notes, ...timeline.map(t => [t.date, t.type, t.note].filter(Boolean).join(' · '))].filter(Boolean).join('\n\n')
    };
  }

  function validate(draft) {
    const errors = {};
    if (!text(draft.brandName).trim()) errors.brandName = 'Marka adını gir.';
    if (!segments.includes(draft.segment)) errors.segment = 'Bir müşteri segmenti seç.';
    if (!webUrl(draft.website)) errors.website = 'Geçerli bir web sitesi adresi gir.';
    const automatic=draft.logo?.status==='ready'&&draft.logo?.sourceWebsite===webUrl(draft.website)&&draft.logo?.generated===false&&draft.logo?.image?.startsWith('data:image/png;base64,');
    if (!automatic && !draft.logoFile && !text(draft.logoUrl).trim()) errors.logoUrl = draft.logo?.status==='loading'?'Logo hazırlanıyor. Tamamlanmasını bekle.':draft.logo?.status==='review'?'Logo kesitini orijinal ile karşılaştırıp kontrolü tamamla.':'Web sitesinden logoyu hazırla.';
    if (text(draft.logoUrl).trim() && !webUrl(draft.logoUrl)) errors.logoUrl = 'Geçerli bir logo bağlantısı gir.';
    if (draft.logoFile && validateLogo(draft.logoFile)) errors.logoFile = validateLogo(draft.logoFile);
    if (!text(draft.goals).trim()) errors.goals = 'Markanın hedeflerini belirt.';
    if (!text(draft.needs).trim()) errors.needs = 'İhtiyaçları ve öncelikleri belirt.';
    if (!text(draft.services).trim()) errors.services = 'Konuşulan hizmetleri belirt.';
    if (draft.budget !== '' && (!Number.isFinite(Number(draft.budget)) || Number(draft.budget) < 0)) errors.budget = 'Sıfır veya daha büyük bir bütçe gir; bilinmiyorsa boş bırak.';
    return errors;
  }

  function validateLogo(file) {
    if (!file) return '';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return 'PNG, JPG veya WebP dosyası seç.';
    if (file.size > 2 * 1024 * 1024) return 'Logo dosyası en fazla 2 MB olabilir.';
    return '';
  }

  const api = Object.freeze({ createDraft, validate, validateLogo, webUrl });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PipelineOfferBriefModel = api;
})(typeof window === 'undefined' ? {} : window);
