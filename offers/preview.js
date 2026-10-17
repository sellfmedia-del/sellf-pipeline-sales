/* Read-only fixture: it never initializes the production Supabase client. */
(async function () {
  'use strict';

  function installFixture() {
    const rows = {
      spaces: [{ id: 'demo-space', name: 'Örnek Markalar', color: '#378ADD', created_at: 1792200000000 }],
      columns: [{ id: 'demo-column', space_id: 'demo-space', title: 'Teklif Aşamasında', dot: '#BA7517' }],
      leads: [{
        id: 'demo-lead', space_id: 'demo-space', col_id: 'demo-column',
        name: 'Örnek Yetkili', company: 'Örnek Marka', value: '',
        notes: 'Toplantı notları ve mevcut kart bilgileri burada korunur.',
        doc_url: '', last_contact: 1792200000000,
        contacts: [{ name: 'Örnek Yetkili', role: 'Pazarlama Direktörü', email: 'yetkili@example.com' }],
        timeline: [{ type: 'Toplantı', date: '17 Ekim 2026', note: 'Markanın hedefleri ve hizmet ihtiyaçları görüşüldü.' }]
      }]
    };
    const blocked = () => { throw new Error('Bu önizleme salt okunurdur.'); };
    const user = { id: 'demo-user' };
    window.fetch = blocked;
    window.XMLHttpRequest = blocked;
    window.WebSocket = blocked;
    navigator.sendBeacon = blocked;
    window.supabase = {
      createClient() {
        return {
          auth: {
            getSession: async () => ({ data: { session: { user } } }),
            getUser: async () => ({ data: { user } }),
            signUp: blocked, signInWithPassword: blocked, signOut: blocked
          },
          from(table) {
            const result = { data: rows[table] || [], error: null };
            return {
              select() { return { ...result, in: async () => result }; },
              upsert: blocked, insert: blocked, update: blocked, delete: blocked
            };
          }
        };
      }
    };
    document.addEventListener('DOMContentLoaded', () => {
      // Fixture queries finish before this scheduled callback; no production reads.
      setTimeout(() => {
        openModal('demo-lead');
        const makeReadOnly = () => {
          document.querySelectorAll('input, textarea').forEach(el => { el.readOnly = true; });
          document.querySelectorAll('select, button:not(.modal-close)').forEach(el => { el.disabled = true; });
        };
        makeReadOnly();
        new MutationObserver(makeReadOnly).observe(document.getElementById('modal'), { childList: true, subtree: true });
      }, 0);
    });
    document.addEventListener('click', event => {
      const target = event.target.closest('a, button, [onclick], .card');
      if (target && !target.matches('.modal-close, .card, #overlay')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }

  const message = document.getElementById('preview-error');
  try {
    const response = await fetch('/index.html', { cache: 'no-store' });
    if (!response.ok) throw new Error('Kaynak yüklenemedi.');
    let source = await response.text();
    const sdk = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>';
    if (!source.includes(sdk)) throw new Error('Önizleme kaynağı değişti.');
    const policy = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'\">";
    const [css, js] = await Promise.all([
      fetch('/offers/card-section.css').then(r => { if (!r.ok) throw new Error('Stil yüklenemedi.'); return r.text(); }),
      fetch('/offers/card-section.js').then(r => { if (!r.ok) throw new Error('Bölüm yüklenemedi.'); return r.text(); })
    ]);
    source = source.replace('<head>', '<head>' + policy)
      .replace(sdk, '<script>(' + installFixture.toString() + ')();</script>')
      .replace('<link rel="stylesheet" href="/offers/card-section.css">', '<style>' + css + '</style>')
      .replace('<script src="/offers/card-section.js"></script>', '<script>' + js + '</script>');
    const frame = document.getElementById('preview-frame');
    frame.srcdoc = source;
    frame.hidden = false;
    message.hidden = true;
  } catch (error) {
    message.textContent = 'Önizleme açılamadı. Sayfayı yenileyerek tekrar deneyebilirsin.';
  }
})();
