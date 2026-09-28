// The publishable/anon key is intentionally public; RLS protects Travis rows.
const client = window.supabase.createClient(
  'https://gxngmqewskhrbxqmnpps.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4bmdtcWV3c2tocmJ4cW1ucHBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NzI0ODYsImV4cCI6MjA5MzU0ODQ4Nn0.SuFoGMZFzD_Rc-FZkg1OQDZqQE_8v1H51BDYvg4LRW0'
);

const view = { spaces: [], columns: [], leads: [], research: [], evidence: [], interactions: [], activeSpace: null, openLead: null, role: null };
const $ = id => document.getElementById(id);
const state = (message, error = false) => { $('travis-state').textContent = message; $('travis-state').classList.toggle('error', error); };
const make = (tag, className, content) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
};

async function loadTravis() {
  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session) { location.replace('/'); return; }
  const member = await client.from('travis_members').select('role').eq('user_id', sessionData.session.user.id).maybeSingle();
  if (member.error || !member.data) { state('Intent Motoru erişimi tanımlı değil', true); $('travis-run').disabled = true; return; }
  const [spaces, columns, leads, research, evidence, interactions] = await Promise.all([
    client.from('travis_spaces').select('*'),
    client.from('travis_columns').select('*').order('sort_order'),
    client.from('travis_leads').select('*'),
    client.from('travis_research').select('*'),
    client.from('travis_evidence').select('*'),
    client.from('travis_interactions').select('*').order('created_at', { ascending: false })
  ]);
  const failed = [spaces, columns, leads, research, evidence, interactions].find(x => x.error);
  if (failed) { state('Veri yüklenemedi: ' + failed.error.message, true); return; }
  Object.assign(view, { spaces: spaces.data, columns: columns.data, leads: leads.data, role: member.data.role,
    research: research.data, evidence: evidence.data, interactions: interactions.data });
  if (!view.spaces.some(s => s.id === view.activeSpace)) view.activeSpace = view.spaces[0]?.id || null;
  render();
  state('Hazır');
}

function render() {
  const sidebar = $('travis-spaces'); sidebar.replaceChildren();
  view.spaces.forEach(space => {
    const row = make('button', 'sidebar-space' + (space.id === view.activeSpace ? ' active' : ''));
    row.type = 'button';
    row.style.width = 'calc(100% - 8px)';
    const dot = make('span', 'sp-dot'); dot.style.background = space.color || '#378ADD';
    row.append(dot, make('span', 'sp-name', space.name), make('span', 'sp-count', String(view.leads.filter(l => l.space_id === space.id && l.review_status !== 'rejected').length)));
    row.onclick = () => { view.activeSpace = space.id; render(); };
    sidebar.append(row);
  });
  $('travis-title').textContent = view.spaces.find(s => s.id === view.activeSpace)?.name || 'Intent Motoru';
  const leads = view.leads.filter(l => l.space_id === view.activeSpace && l.review_status !== 'rejected');
  const rejectedCount = view.leads.filter(l => l.space_id === view.activeSpace && l.review_status === 'rejected').length;
  $('travis-rejected').hidden = rejectedCount === 0;
  $('travis-rejected').textContent = `Reddedilenler (${rejectedCount})`;
  $('travis-count').textContent = leads.length + ' intent';
  const board = $('travis-board'); board.replaceChildren();
  view.columns.filter(c => c.space_id === view.activeSpace).forEach(column => {
    const wrapper = make('div', 'column');
    const head = make('div', 'col-header');
    const titleRow = make('div', 'col-title-row');
    const dot = make('span', 'col-dot'); dot.style.background = column.dot || '#378ADD';
    titleRow.append(dot, make('span', 'col-title', column.title));
    head.append(titleRow, make('span', 'col-count', String(leads.filter(l => l.col_id === column.id).length)));
    const cards = make('div', 'col-cards');
    wrapper.append(head, cards);
    cards.ondragover = event => event.preventDefault();
    cards.ondrop = async event => {
      event.preventDefault();
      const id = event.dataTransfer.getData('text/plain');
      const lead = leads.find(l => l.id === id);
      if (!lead || lead.col_id === column.id || lead.review_status === 'pending' || lead.review_status === 'rejected') return;
      const { error } = await client.from('travis_leads').update({ col_id: column.id, last_contact: Date.now() }).eq('id', id);
      if (error) state(error.message, true); else { lead.col_id = column.id; render(); }
    };
    leads.filter(l => l.col_id === column.id).forEach(lead => {
      const card = make('button', 'card'); card.type = 'button'; card.style.textAlign = 'left'; card.style.width = '100%';
      card.draggable = true;
      card.ondragstart = event => event.dataTransfer.setData('text/plain', lead.id);
      const top = make('div', 'card-header');
      const names = make('div', '');
      names.append(make('div', 'card-name', lead.name || lead.company), make('div', 'card-company', lead.company));
      top.append(names, make('div', 'card-avatar', (lead.company || '?').slice(0, 1).toUpperCase()));
      card.append(top, make('div', 'card-date', lead.country || ''));
      if (lead.review_status === 'pending') card.append(make('div', 'card-value', 'Onay bekliyor' + (lead.contact_status === 'incomplete' ? ' · Kontak eksik' : '')));
      const info = view.research.find(r => r.lead_id === lead.id);
      if (info?.timing_reason) card.append(make('div', 'card-value', info.timing_reason.slice(0, 95)));
      card.onclick = () => openLead(lead.id);
      cards.append(card);
    });
    board.append(wrapper);
  });
}

function section(parent, title, value) {
  const box = make('section', 'travis-section');
  box.append(make('h3', '', title), make('p', '', value || 'Henüz bilgi yok.'));
  parent.append(box);
  return box;
}
function openRejectedArchive() {
  const items = view.leads.filter(l => l.space_id === view.activeSpace && l.review_status === 'rejected');
  const modal = $('travis-modal'); modal.replaceChildren();
  const head = make('div', 'modal-head');
  const title = make('div', 'modal-name', 'Reddedilen intentler');
  const close = make('button', 'modal-close', '×'); close.type = 'button'; close.onclick = closeLead;
  head.append(title, close);
  const list = make('div', 'travis-archive');
  items.forEach(lead => {
    const row = make('button', 'travis-archive-row'); row.type = 'button';
    row.append(make('strong', '', lead.company), make('span', '', lead.review_reason || 'Ret nedeni belirtilmemiş'));
    row.onclick = () => openLead(lead.id);
    list.append(row);
  });
  modal.append(head, list);
  $('travis-overlay').classList.add('open');
}
$('travis-rejected').onclick = openRejectedArchive;

function openLead(id) {
  view.openLead = id;
  const lead = view.leads.find(l => l.id === id), info = view.research.find(r => r.lead_id === id);
  if (!lead) return;
  const modal = $('travis-modal'); modal.replaceChildren();
  const head = make('div', 'modal-head');
  const close = make('button', 'modal-close', '×'); close.type = 'button'; close.onclick = closeLead;
  const labels = make('div', '');
  labels.append(make('div', 'modal-name', lead.name || lead.company), make('div', 'modal-company', [lead.company, lead.country].filter(Boolean).join(' · ')));
  head.append(make('div', 'modal-icon', (lead.company || '?').slice(0, 1).toUpperCase()), labels, close);
  const body = make('div', 'travis-detail');
  const left = make('div', ''), right = make('div', '');
  section(left, 'Geliştirme · Erken sinyal', info?.signal_summary);
  section(left, 'Neden Sellf?', info?.fit_reason);
  section(left, 'Neden şimdi?', info?.timing_reason);
  section(left, 'Satış hipotezi', info?.hypothesis);
  const sources = make('section', 'travis-section'); sources.append(make('h3', '', 'Doğrulanan kaynaklar'));
  view.evidence.filter(e => e.lead_id === id).forEach(e => {
    try {
      const url = new URL(e.url);
      if (!['http:', 'https:'].includes(url.protocol)) return;
      const a = make('a', 'travis-source', e.title || url.hostname);
      a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      sources.append(a, make('p', '', e.fact || ''));
    } catch { /* Ignore malformed URLs. */ }
  });
  if (!sources.querySelector('a')) sources.append(make('p', '', 'Kaynak kaydı bulunamadı.'));
  left.append(sources);
  const contacts = make('section', 'travis-section'); contacts.append(make('h3', '', 'Contacts · Karar alıcılar'));
  (lead.contacts || []).forEach(c => {
    const row = make('p', '', [c.name, c.role, c.email ? c.email + ' (' + (c.verification || 'doğrulanmadı') + ')' : 'LinkedIn profili'].filter(Boolean).join(' · '));
    try {
      const url = new URL(c.source_url);
      if (['https:', 'http:'].includes(url.protocol)) {
        const link = make('a', 'travis-source', c.kind === 'linkedin' ? 'Profili aç' : 'Kaynağı aç');
        link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
        row.append(' · ', link);
      }
    } catch { /* No source link for this contact. */ }
    contacts.append(row);
  });
  if (!(lead.contacts || []).length) contacts.append(make('p', '', 'Henüz doğrulanmış kişi yok.'));
  if (lead.country === 'TR' && lead.contact_status !== 'complete') {
    const retry = make('button', 'btn', 'Kontakları otomatik yeniden ara'); retry.type = 'button';
    retry.onclick = async () => {
      retry.disabled = true; state('Apollo ve ZeroBounce ile kontak aranıyor…');
      try {
        const { data } = await client.auth.getSession();
        const response = await fetch('/api/travis-run', { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token },
          body: JSON.stringify({ action: 'enrich_lead', country: 'TR', space_id: lead.space_id, lead_id: id }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Kontak araması başarısız');
        await loadTravis(); openLead(id);
        state(result.complete ? 'İki karar alıcı doğrulandı.' :
          result.contacts.length ? 'Bulunan iletişim bilgileri karta eklendi.' : 'Doğrulanmış kontak veya iletişim kanalı bulunamadı.');
      } catch (error) { state(error.message, true); retry.disabled = false; }
    };
    contacts.append(retry);
  }
  right.append(contacts);

  const columns = view.columns.filter(c => c.space_id === lead.space_id);
  if (lead.review_status === 'pending') {
    const review = make('section', 'travis-section');
    review.append(make('h3', '', 'Intent değerlendirmesi'));
    const hint = make('p', '', lead.contact_status === 'incomplete' ?
      'İki uygun ve doğrulanmış karar alıcı henüz tamamlanmadı. Güçlü intent için alternatif iletişim kanalı gösterilir.' :
      'Kaynakları ve gerekçeyi inceleyip karar verin.');
    const approve = make('button', 'btn btn-primary', 'Onayla'); approve.type = 'button';
    approve.onclick = async () => {
      const { error } = await client.from('travis_leads').update({ review_status: 'approved' }).eq('id', id);
      if (error) { state(error.message, true); return; }
      lead.review_status = 'approved'; await loadTravis(); openLead(id);
    };
    const reason = make('textarea', 'travis-field'); reason.placeholder = 'Ret nedeni (zorunlu)…';
    const reject = make('button', 'btn', 'Reddet'); reject.type = 'button';
    reject.onclick = async () => {
      const value = reason.value.trim();
      if (!value) { state('Ret nedenini yazın.', true); reason.focus(); return; }
      const { error } = await client.from('travis_leads').update({ review_status: 'rejected', review_reason: value }).eq('id', id);
      if (error) { state(error.message, true); return; }
      closeLead(); await loadTravis(); state('Intent boarddan kaldırıldı; ret nedeni Supabase’de saklandı.');
    };
    review.append(hint, approve, reason, reject); right.append(review);
  } else if (lead.review_status === 'rejected') {
    section(right, 'Ret nedeni', lead.review_reason);
  }
  const statusBox = make('section', 'travis-section'); statusBox.append(make('h3', '', 'Durum'));
  const select = make('select', 'travis-field');
  columns.forEach(c => { const option = make('option', '', c.title); option.value = c.id; option.selected = c.id === lead.col_id; select.append(option); });
  select.disabled = lead.review_status === 'pending' || lead.review_status === 'rejected';
  select.onchange = async () => {
    const { error } = await client.from('travis_leads').update({ col_id: select.value, last_contact: Date.now() }).eq('id', id);
    if (error) { state(error.message, true); select.value = lead.col_id; return; }
    lead.col_id = select.value; render();
  };
  statusBox.append(select); right.append(statusBox);
  const notes = make('section', 'travis-section'); notes.append(make('h3', '', 'Senin notun'));
  const textarea = make('textarea', 'travis-field'); textarea.value = lead.notes || ''; textarea.placeholder = 'Bu şirketle ilgili değerlendirmen…';
  const saveNote = make('button', 'btn', 'Notu kaydet'); saveNote.type = 'button';
  saveNote.onclick = async () => {
    const { error } = await client.from('travis_leads').update({ notes: textarea.value }).eq('id', id);
    if (error) state(error.message, true); else { lead.notes = textarea.value; state('Not kaydedildi'); }
  };
  notes.append(textarea, saveNote); right.append(notes);
  const log = make('section', 'travis-section'); log.append(make('h3', '', 'Görüşme geçmişi'));
  const form = make('form', 'travis-form');
  const type = make('select', 'travis-field');
  ['E-posta', 'Arama', 'Toplantı', 'Takip', 'Teklif', 'Sözleşme', 'Sonuç'].forEach(v => { const o = make('option', '', v); o.value = v; type.append(o); });
  const note = make('textarea', 'travis-field'); note.required = true; note.placeholder = 'Görüşme notu veya sonuç…';
  const submit = make('button', 'btn btn-primary', 'Görüşme ekle'); submit.type = 'submit';
  form.append(type, note, submit);
  form.onsubmit = async ev => {
    ev.preventDefault();
    const { data: auth } = await client.auth.getUser();
    const { error } = await client.from('travis_interactions').insert({
      lead_id: id, user_id: auth.user.id, type: type.value, note: note.value.trim(), occurred_at: new Date().toISOString()
    });
    if (error) { state(error.message, true); return; }
    note.value = ''; await loadTravis(); openLead(id);
  };
  log.append(form);
  view.interactions.filter(i => i.lead_id === id).forEach(i => {
    const entry = make('div', 'travis-event');
    entry.append(make('div', 'travis-tag', i.type + ' · ' + new Date(i.occurred_at).toLocaleDateString('tr-TR')), make('p', '', i.note));
    log.append(entry);
  });
  right.append(log);
  body.append(left, right); modal.append(head, body);
  $('travis-overlay').classList.add('open');
}
function closeLead() { $('travis-overlay').classList.remove('open'); view.openLead = null; }
$('travis-overlay').onclick = ev => { if (ev.target === $('travis-overlay')) closeLead(); };

$('travis-run').onclick = async () => {
  const country = $('travis-country').value;
  if (!['TR', 'UK', 'US'].includes(country)) { state('Önce arama ülkesini seçin.', true); $('travis-country').focus(); return; }
  const button = $('travis-run'); button.disabled = true; $('travis-country').disabled = true;
  state($('travis-country').selectedOptions[0].textContent + ' için araştırma başlıyor…');
  try {
    const { data: auth } = await client.auth.getSession();
    const call = async body => {
      const response = await fetch('/api/travis-run', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.session.access_token },
        body: JSON.stringify({ space_id: view.activeSpace, country, ...body })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Araştırma tamamlanamadı');
      return result;
    };
    let result = await call(country === 'TR' ? { action: 'start' } : {});
    if (country === 'TR') {
      const phases = ['Gemini Google Search', 'Tavily', 'LinkedIn gönderileri',
        'RSS ve sektör bültenleri', 'KAP ve şirket duyuruları', 'Claude intent değerlendirmesi', 'Kontaklar ve taslak kartlar'];
      while (!result.completed) {
        state('Türkiye araştırması · ' + (phases[result.phase] || 'Tamamlanıyor') +
          ' (' + (result.phase + 1) + '/7)' + (result.phase === 6 ? ` · ${result.cursor || 0}/${result.candidate_count || '?'} aday` : '') + '…');
        result = await call({ action: 'step', run_id: result.run_id });
      }
    }
    await loadTravis();
    state(country === 'TR' ? (result.total_added + ' yeni taslak intent · ' + result.source_count + ' kaynak · ' +
      (result.errors?.length ? 'Bazı kaynaklar alınamadı: ' + result.errors.join('; ') : 'Araştırma tamamlandı')) :
      (result.added + ' yeni intent · ' + result.reviewed + ' kaynak incelendi · ' + (result.skipped_contacts || 0) + ' marka iki doğrulanmış kişi bulunamadığı için atlandı'));
  } catch (error) { state(error.message, true); }
  finally { button.disabled = false; $('travis-country').disabled = false; }
};
loadTravis();
