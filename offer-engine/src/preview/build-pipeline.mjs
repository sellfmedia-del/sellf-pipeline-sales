// Build a direct copy of the existing app; never modify the production source.
export function buildPipelinePreview(source){
 const sdk='<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>';
 const authStart=source.indexOf('<!-- 1. AUTH EKRANI -->'),authEnd=source.indexOf('<!-- 2. CRM ANA EKRANI -->');
 if(!source.includes(sdk)||authStart<0||authEnd<=authStart)throw Error('Pipeline preview source boundary changed.');
 let html=source.slice(0,authStart)+`<!-- Isolated preview session; the CRM itself is unchanged. -->
<div id="auth-view"><div class="auth-box"><div class="auth-logo"><span>P</span> Pipeline CRM</div>
<p style="font-size:13px;line-height:1.6;margin-bottom:18px">Önizleme · Ayrı test kayıtlarıyla çalışır. Mevcut Pipeline verilerin korunur.</p>
<button type="button" id="pipeline-test-start" class="auth-btn" disabled>Test alanını aç</button><p id="pipeline-test-status" role="status" style="font-size:12px;margin-top:12px">Test oturumu kontrol ediliyor…</p>
</div></div>
`+source.slice(authEnd);
 html=html.replace(sdk,'<script src="/offers/pipeline-preview.js"></script>');
 html=html.replace(/const supabaseUrl = '[^']+';\nconst supabaseKey = '[^']+';/,"const supabaseUrl = 'isolated-preview';\nconst supabaseKey = 'no-production-key';");
 html=html.replace("localStorage.setItem('crm_db_v2', JSON.stringify(db));",'// The preview adapter persists only isolated test records.');
 html=html.replace('<title>CRM Pipeline</title>','<title>Pipeline CRM · Önizleme</title>');
 html=html.replace('<head>','<head><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; connect-src \'self\'; frame-src \'none\'; object-src \'none\'; base-uri \'self\'; form-action \'self\'">');
 if(html.includes('https://gxngmqewskhrbxqmnpps.supabase.co')||html.includes('cdn.jsdelivr.net'))throw Error('Production client must not enter the preview.');
 return html;
}
