// The publishable/anon key is intentionally public; RLS protects Travis rows.
const client = window.supabase.createClient(
  'https://gxngmqewskhrbxqmnpps.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4bmdtcWV3c2tocmJ4cW1ucHBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NzI0ODYsImV4cCI6MjA5MzU0ODQ4Nn0.SuFoGMZFzD_Rc-FZkg1OQDZqQE_8v1H51BDYvg4LRW0'
);

const view = { spaces: [], columns: [], leads: [], research: [], evidence: [], interactions: [], activeSpace: null, openLead: null };
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
  Object.assign(view, { spaces: spaces.data, columns: columns.data, leads: leads.data,
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
    row.append(dot, make('span', 'sp-name', space.name), make('span', 'sp-count', String(view.leads.filter(l => l.space_id === space.id).length)));
    row.onclick = () => { view.activeSpace = space.id; render(); };
    sidebar.append(row);
  });
  $('travis-title').textContent = view.spaces.find(s => s.id === view.activeSpace)?.name || 'Intent Motoru';
  const leads = view.leads.filter(l => l.space_id === view.activeSpace);
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
      if (!lead || lead.col_id === column.id) return;
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
  (lead.contacts || []).forEach(c => contacts.append(make('p', '', [c.name, c.role, c.email ? c.email + ' (' + (c.verification || 'doğrulanmadı') + ')' : 'E-posta bulunamadı'].filter(Boolean).join(' · '))));
  if (!(lead.contacts || []).length) contacts.append(make('p', '', 'Henüz doğrulanmış kişi yok.'));
  right.append(contacts);

  const columns = view.columns.filter(c => c.space_id === lead.space_id);
  const statusBox = make('section', 'travis-section'); statusBox.append(make('h3', '', 'Durum'));
  const select = make('select', 'travis-field');
  columns.forEach(c => { const option = make('option', '', c.title); option.value = c.id; option.selected = c.id === lead.col_id; select.append(option); });
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
  const button = $('travis-run'); button.disabled = true; state('Travis LinkedIn ve web sinyallerini araştırıyor…');
  try {
    const { data: auth } = await client.auth.getSession();
    const response = await fetch('/api/travis-run', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.session.access_token },
      body: JSON.stringify({ space_id: view.activeSpace })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Araştırma tamamlanamadı');
    await loadTravis();
    state(result.added + ' yeni intent · ' + result.reviewed + ' kaynak incelendi · ' + (result.skipped_contacts || 0) + ' marka iki doğrulanmış kişi bulunamadığı için atlandı');
  } catch (error) { state(error.message, true); }
  finally { button.disabled = false; }
};
loadTravis();
