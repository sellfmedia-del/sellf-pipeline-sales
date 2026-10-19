/* Read-only fixture: it never initializes the production Supabase client. */
(async function () {
  'use strict';

  document.querySelectorAll('[data-preview-width]').forEach(button => {
    button.addEventListener('click', () => {
      document.getElementById('preview-frame').style.width = button.dataset.previewWidth === 'mobile' ? 'min(390px, 100%)' : '100%';
      document.querySelectorAll('[data-preview-width]').forEach(item => {
        item.setAttribute('aria-pressed', String(item === button));
      });
    });
  });

  function installFixture(logoServiceAvailable) {
    if(logoServiceAvailable) {
      // Preview-only example files enter the same FileReader/upload path as a
      // selected screenshot. The processor's response is never mocked.
      window.addEventListener('message',event=>{
        if(event.source!==parent||event.data?.type!=='offer-logo-example'||typeof event.data.image!=='string'||event.data.image.length>2800000||!event.data.image.startsWith('data:image/png;base64,'))return;
        if(!document.querySelector('#offer-brief-dialog'))document.querySelector('.offer-create')?.click();
        const input=document.querySelector('#ob-logo-screenshot');
        if(!input)return;
        const bytes=Uint8Array.from(atob(event.data.image.split(',')[1]),char=>char.charCodeAt(0));
        const transfer=new DataTransfer();
        transfer.items.add(new File([bytes],'ornek-logo.png',{type:'image/png'}));
        input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
      });
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
      window.PipelineOfferRequest=async()=>{throw Error('Bu önizleme örnek kart kullanır. Veritabanı ve kart değeri değiştirilmedi.');};
    }
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
          document.querySelectorAll('#crm-view input, #crm-view textarea').forEach(el => { el.readOnly = true; });
          document.querySelectorAll('#crm-view select, #crm-view button:not(.modal-close):not(.offer-create)').forEach(el => { el.disabled = true; });
        };
        makeReadOnly();
        new MutationObserver(makeReadOnly).observe(document.getElementById('modal'), { childList: true, subtree: true });
      }, 0);
    });
    document.addEventListener('click', event => {
      const target = event.target.closest('a, button, [onclick], .card');
      if (target && !target.closest('#offer-brief-dialog') && !target.matches('.modal-close, .card, #overlay, .offer-create')) {
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
    const policy = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:; connect-src 'none'; form-action 'none'\">";
    const assets = ['card-section.css', 'brief-form.css', 'logo-control.css', 'proposal.css', 'brief-model.js', 'logo-control.js', 'proposal.js', 'service-client.js', 'brief-form.js', 'card-section.js'];
    const contents = await Promise.all(assets.map(path => fetch('/offers/' + path).then(r => {
      if (!r.ok) throw new Error('Önizleme dosyası yüklenemedi.');
      return r.text();
    })));
    source = source.replace('<head>', '<head>' + policy)
      .replace(sdk, '<script>(' + installFixture.toString() + ')(' + String(document.documentElement.dataset.logoService==='ready') + ');</script>');
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
    message.hidden = true;
    document.querySelectorAll('[data-logo-example]').forEach(button=>{
      button.hidden=document.documentElement.dataset.logoService!=='ready';
      button.addEventListener('click',async()=>{
        button.disabled=true;
        try{
          const response=await fetch('/examples/logo-'+button.dataset.logoExample+'.png');
          if(!response.ok)throw new Error('Örnek görsel yüklenemedi.');
          const blob=await response.blob();
          const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
          frame.contentWindow.postMessage({type:'offer-logo-example',image},'*');
        }catch{message.hidden=false;message.textContent='Örnek görsel açılamadı. Kendi ekran görüntünü yükleyebilirsin.';}
        finally{button.disabled=false;}
      });
    });
  } catch (error) {
    message.textContent = 'Önizleme açılamadı. Sayfayı yenileyerek tekrar deneyebilirsin.';
  }
})();
