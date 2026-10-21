/* Read-only fixture: it never initializes the production Supabase client. */
(async function () {
  'use strict';

  function installFixture(logoServiceAvailable, persistedFixture) {
    window.PipelineOfferPersistence=Boolean(persistedFixture);
    if(logoServiceAvailable) {
      window.PipelineLogoRequest=payload=>new Promise((resolve,reject)=>{
        const requestId=crypto.randomUUID();
        const timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(new Error('Logo hazırlama süresi aşıldı.'));},80000);
        function receive(event) {
          if(event.source!==parent||event.data?.type!=='offer-logo-result'||event.data?.requestId!==requestId)return;
          clearTimeout(timer);window.removeEventListener('message',receive);
          if(event.data.error)reject(new Error(event.data.error));else resolve(event.data.result);
        }
        window.addEventListener('message',receive);
        parent.postMessage({type:'offer-logo-request',requestId,mode:payload.mode,website:payload.website,image:payload.image},'*');
      });
      window.PipelineAuditRequest=payload=>new Promise((resolve,reject)=>{
        const requestId=crypto.randomUUID();
        const timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(new Error('BHS bağlantısı zaman aşımına uğradı.'));},200000);
        function receive(event){
          if(event.source!==parent||event.data?.type!=='offer-audit-result'||event.data?.requestId!==requestId)return;
          clearTimeout(timer);window.removeEventListener('message',receive);
          if(event.data.error)reject(new Error(event.data.error));else resolve(event.data.result);
        }
        window.addEventListener('message',receive);
        parent.postMessage({type:'offer-audit-request',requestId,payload},'*');
      });
      window.PipelinePricingRequest=payload=>new Promise((resolve,reject)=>{
        const requestId=crypto.randomUUID();
        const timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(new Error('Fiyat hesaplama bağlantısı zaman aşımına uğradı.'));},60000);
        function receive(event){
          if(event.source!==parent||event.data?.type!=='offer-pricing-result'||event.data?.requestId!==requestId)return;
          clearTimeout(timer);window.removeEventListener('message',receive);
          if(event.data.error)reject(new Error(event.data.error));else resolve(event.data.result);
        }
        window.addEventListener('message',receive);parent.postMessage({type:'offer-pricing-request',requestId,payload},'*');
      });
      window.PipelineProposalRequest=payload=>new Promise((resolve,reject)=>{
        const requestId=crypto.randomUUID();
        const timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(new Error('Teklif oluşturma bağlantısı zaman aşımına uğradı.'));},60000);
        function receive(event){
          if(event.source!==parent||event.data?.type!=='offer-proposal-result'||event.data?.requestId!==requestId)return;
          clearTimeout(timer);window.removeEventListener('message',receive);
          if(event.data.error)reject(new Error(event.data.error));else resolve(event.data.result);
        }
        window.addEventListener('message',receive);parent.postMessage({type:'offer-proposal-request',requestId,payload},'*');
      });
      window.PipelineOfferRequest=persistedFixture?payload=>new Promise((resolve,reject)=>{
        const requestId=crypto.randomUUID(),timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(Error('Test kayıt bağlantısı zaman aşımına uğradı.'));},65000);
        function receive(event){if(event.source!==parent||event.data?.type!=='offer-store-result'||event.data.requestId!==requestId)return;clearTimeout(timer);window.removeEventListener('message',receive);if(event.data.error)reject(Error(event.data.error));else resolve(event.data.result);}
        window.addEventListener('message',receive);parent.postMessage({type:'offer-store-request',requestId,payload},'*');
      }):async()=>{throw Error('Bu önizleme örnek kart kullanır. Veritabanı ve kart değeri değiştirilmedi.');};
    }
    const rows = persistedFixture?.rows || {
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
    // Keep the normal five-stage Pipeline board around the separate test card.
    // These display-only empty columns never create or update database rows.
    if(rows.columns.length===1&&rows.spaces.length===1){
      const offerColumn=rows.columns[0],stages=[['Yeni Lead','#378ADD'],['İlk Temas','#639922'],['Teklif Aşamasında','#BA7517'],['Sözleşme Gönderildi','#D4537E'],['Kazanıldı','#1D9E75']];
      rows.columns=stages.map(([title,dot],i)=>title===offerColumn.title?offerColumn:{id:'preview-stage-'+i,space_id:rows.spaces[0].id,title,dot});
    }
    const blocked = () => { throw new Error('Bu önizleme salt okunurdur.'); };
    const user = persistedFixture?.user || { id: 'demo-user' };
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
      // Start on the original board; open card details only when clicked.
      setTimeout(() => {
        const makeReadOnly = () => {
          document.querySelectorAll('#crm-view .card').forEach(el => { el.draggable = false; });
          document.querySelectorAll('#crm-view input, #crm-view textarea').forEach(el => { el.readOnly = true; });
          document.querySelectorAll('#crm-view select, #crm-view button:not(.modal-close):not(.offer-create):not(.offer-view)').forEach(el => { el.disabled = true; });
        };
        makeReadOnly();
        new MutationObserver(makeReadOnly).observe(document.getElementById('modal'), { childList: true, subtree: true });
      }, 0);
    });
    document.addEventListener('click', event => {
      const target = event.target.closest('a, button, [onclick], .card');
      if (target && !target.closest('#offer-brief-dialog, #offer-saved-dialog') && !target.matches('.modal-close, .card, #overlay, .offer-create, .offer-view')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }

  const message = document.getElementById('preview-error');
  try {
    let persistentFixture=null;
    if(document.documentElement.dataset.logoService==='ready'&&new URLSearchParams(location.search).get('storage')!=='0'){
      let state=await fetch('/api/preview-session',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Test alanı açılamadı.');return d;});
      if(!state.ready){
        message.textContent='Ayrı test kartı ve teklif sürümleriyle uçtan uca deneyebilirsin. Mevcut Pipeline kayıtları kullanılmaz. ';
        const button=document.createElement('button');button.type='button';button.textContent='Test alanını aç';message.appendChild(button);
        state=await new Promise(resolve=>button.addEventListener('click',async()=>{button.disabled=true;try{const r=await fetch('/api/preview-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start'})});const d=await r.json();if(!r.ok)throw Error(d.error||'Test oturumu açılamadı.');resolve(d);}catch(error){button.disabled=false;message.firstChild.textContent=error.message+' ';}}));
      }
      persistentFixture=state.fixture;
      document.querySelector('#preview-frame').title='Ayrı test kartıyla teklif akışı';
    }
    const response = await fetch('/index.html', { cache: 'no-store' });
    if (!response.ok) throw new Error('Kaynak yüklenemedi.');
    let source = await response.text();
    const sdk = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>';
    if (!source.includes(sdk)) throw new Error('Önizleme kaynağı değişti.');
    const policy = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:; connect-src 'none'; form-action 'none'\">";
    const assets = ['card-section.css', 'brief-form.css', 'logo-control.css', 'proposal.css', 'brief-model.js', 'logo-control.js', 'proposal.js', 'service-client.js', 'brief-form.js', 'card-section.js'];
    const contents = await Promise.all(assets.map(path => fetch('/offers/' + path).then(r => {
      if (!r.ok) throw new Error('Önizleme dosyası yüklenemedi.');
      return r.text();
    })));
    source = source.replace('<head>', '<head>' + policy)
      .replace(sdk, '<script>(' + installFixture.toString() + ')(' + String(document.documentElement.dataset.logoService==='ready') + ',' + JSON.stringify(persistentFixture).replace(/</g,'\\u003c') + ');</script>');
    assets.forEach((path, index) => {
      source = path.endsWith('.css')
        ? source.replace('<link rel="stylesheet" href="/offers/' + path + '">', '<style>' + contents[index] + '</style>')
        : source.replace('<script src="/offers/' + path + '"></script>', '<script>' + contents[index] + '</script>');
    });
    const frame = document.getElementById('preview-frame');
    frame.srcdoc = source;
    window.addEventListener('message',async event=>{
      if(document.documentElement.dataset.logoService!=='ready'||event.source!==frame.contentWindow||event.data?.type!=='offer-logo-request')return;
      const {requestId,website,image,mode}=event.data;
      if(typeof requestId!=='string'||requestId.length>80)return;
      const upload=mode==='upload';
      if(upload?(typeof image!=='string'||image.length>2800000):typeof website!=='string'||website.length>2048)return;
      try {
        const response=await fetch(upload?'/api/logo-upload':'/api/logo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(upload?{image}:{website})});
        const result=await response.json();
        frame.contentWindow.postMessage({type:'offer-logo-result',requestId,...(response.ok?{result}:{error:result.error||'Logo alınamadı.'})},'*');
      }catch(error){frame.contentWindow.postMessage({type:'offer-logo-result',requestId,error:'Logo servisine bağlanılamadı.'},'*');}
    });
    window.addEventListener('message',async event=>{
      if(document.documentElement.dataset.logoService!=='ready'||event.source!==frame.contentWindow||event.data?.type!=='offer-audit-request')return;
      const {requestId,payload}=event.data;
      if(typeof requestId!=='string'||requestId.length>80||!['start','status','structure','advance','cancel'].includes(payload?.action))return;
      const body=JSON.stringify(payload);if(body.length>90000)return;
      try{
        const response=await fetch('/api/audit',{method:'POST',headers:{'Content-Type':'application/json'},body});
        const result=await response.json();
        frame.contentWindow.postMessage({type:'offer-audit-result',requestId,...(response.ok?{result}:{error:result.error||'BHS araştırması tamamlanamadı.'})},'*');
      }catch{frame.contentWindow.postMessage({type:'offer-audit-result',requestId,error:'BHS araştırma servisine bağlanılamadı.'},'*');}
    });
    frame.hidden = false;
    window.addEventListener('message',async event=>{
      if(document.documentElement.dataset.logoService!=='ready'||event.source!==frame.contentWindow||event.data?.type!=='offer-pricing-request')return;
      const {requestId,payload}=event.data;
      if(typeof requestId!=='string'||requestId.length>80||!['start','status','cancel'].includes(payload?.action))return;
      const body=JSON.stringify(payload);if(body.length>600000)return;
      try{
        const response=await fetch('/api/pricing',{method:'POST',headers:{'Content-Type':'application/json'},body});const result=await response.json();
        frame.contentWindow.postMessage({type:'offer-pricing-result',requestId,...(response.ok?{result}:{error:result.error||'Fiyat hesaplaması tamamlanamadı.'})},'*');
      }catch{frame.contentWindow.postMessage({type:'offer-pricing-result',requestId,error:'Fiyat servisine bağlanılamadı. Yeni model çağrısı otomatik başlatılmadı.'},'*');}
    });
    window.addEventListener('message',async event=>{
      if(document.documentElement.dataset.logoService!=='ready'||event.source!==frame.contentWindow||event.data?.type!=='offer-proposal-request')return;
      const {requestId,payload}=event.data;
      if(typeof requestId!=='string'||requestId.length>80||!['start','status','cancel'].includes(payload?.action))return;
      const body=JSON.stringify(payload);if(body.length>4200000)return;
      try{
        const response=await fetch('/api/proposal',{method:'POST',headers:{'Content-Type':'application/json'},body});const result=await response.json();
        frame.contentWindow.postMessage({type:'offer-proposal-result',requestId,...(response.ok?{result}:{error:result.error||'Teklif oluşturma tamamlanamadı.'})},'*');
      }catch{frame.contentWindow.postMessage({type:'offer-proposal-result',requestId,error:'Teklif servisine bağlanılamadı. Yeni model çağrısı otomatik başlatılmadı.'},'*');}
    });
    window.addEventListener('message',async event=>{
      if(!persistentFixture||event.source!==frame.contentWindow||event.data?.type!=='offer-store-request')return;
      const {requestId,payload}=event.data;if(typeof requestId!=='string'||requestId.length>80||!['save','list','publish','outbox'].includes(payload?.action))return;
      const body=JSON.stringify(payload);if(body.length>4200000)return;
      try{const r=await fetch('/api/offer',{method:'POST',headers:{'Content-Type':'application/json'},body});const result=await r.json();frame.contentWindow.postMessage({type:'offer-store-result',requestId,...(r.ok?{result}:{error:result.error||'Test kaydı tamamlanamadı.'})},'*');}
      catch{frame.contentWindow.postMessage({type:'offer-store-result',requestId,error:'Test kayıt servisine bağlanılamadı.'},'*');}
    });
    message.hidden = true;
  } catch (error) {
    message.textContent = error.message||'Önizleme açılamadı. Sayfayı yenileyerek tekrar deneyebilirsin.';
  }
})();
