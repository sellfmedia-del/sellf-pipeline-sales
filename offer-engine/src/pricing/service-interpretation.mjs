// High-precision vocabulary only: this module identifies catalogue operations,
// never prices. Ambiguous/unknown work remains visible instead of being priced
// as an unrelated service. Shared by the form and the server.
export const normalizeServiceText=value=>String(value||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[’']/g,'').replace(/[-–—_/]/g,' ').replace(/\s+/g,' ').trim();
const rules=[
 ['meta',/\bmeta(?:\s+(?:ads|reklam\w*))?\b/],
 ['google_ads',/\b(?:google\s+(?:ads|adwords|reklam\w*)|adwords|sem|search ads)\b/],
 ['tiktok',/\btik\s*tok(?:\s+(?:ads|reklam\w*))?\b/],
 ['amazon_ppc',/\bamazon\s+(?:ppc|ads|reklam\w*)\b/],
 ['programmatic',/\b(?:programmatic|programatik)(?:\s+reklam\w*)?\b/],
 ['onsite_seo',/\b(?:on\s*site|on\s*page|site\s*ici)\s+seo\b/],
 ['offsite_seo',/\b(?:off\s*site|off\s*page|site\s*disi)\s+seo\b|\bbacklink\w*\b/],
 ['technical_seo',/\b(?:teknik|technical)\s+seo\b/],
 ['social',/\b(?:sosyal medya\s+(?:yonet\w*|icerik\w*)|social media\s+(?:management|content)|organik\s+(?:sosyal medya|instagram|facebook))\b/],
 ['design',/\b(?:statik(?:\s+ve\s+motion)?\s+tasarim\w*|motion\s+tasarim\w*|grafik\s+tasarim\w*|graphic design|static and motion design)\b/],
 ['brand_marketing',/\b(?:marka pazarlama\w*|brand marketing)\b/],
 ['ecommerce_planning',/\b(?:e\s*ticaret\s+(?:danisman\w*|planlama\w*)|ecommerce\s+(?:consult\w*|planning))\b/],
 ['marketplace',/\b(?:pazaryeri\s+(?:yonet\w*|operasyon\w*)|marketplace\s+(?:management|operations))\b/],
 ['ecommerce_webmaster',/\b(?:e\s*ticaret\s+(?:altyapisi\s+)?webmaster|ecommerce webmaster)\b/],
 ['custom_webmaster',/\b(?:ozel yazilim|uygulama gelistirme|app development|custom software)(?:\s+ve\s+app)?(?:\s+webmaster)?\b/],
 ['webmaster',/\bwebmaster\b|\b(?:wordpress|wix|web sitesi)\s+(?:bakim\w*|guncelleme\w*|yonetim\w*)\b/],
 ['ai',/\b(?:yapay zeka|ai integration|ai marketing)\b/],
 ['fulfillment',/\b(?:fulfillment|fulfilment|lojistik planlama)\b/],
 ['moderation',/\b(?:moderasyon|moderation)\b/],
 ['b2b',/\bb2b(?:\s+(?:dijital\s+)?pazarlama\w*)?\b/],
 ['ugc',/\b(?:ugc|barter)(?:\s+ve\s+ugc)?(?:\s+influencer)?\b/],
 ['influencer',/\binfluencer(?:\s+(?:pazarlama\w*|marketing|yonet\w*))?\b/],
 ['media_planning',/\b(?:medya(?:\s+ve\s+butce)?\s+planlama\w*|butce planlama\w*|media planning|advertising consult\w*|reklam danisman\w*)\b/]
];
const negative='(?:haric|istemiyoruz|istenmiyor|olmasin|yapilmayacak|dahil degil|degil|not included|excluded|without)';
const platforms={meta:'(?:meta|facebook|instagram)',google_ads:'(?:google(?:\\s+ads)?|adwords)',tiktok:'tik\\s*tok',amazon_ppc:'amazon(?:\\s+ppc)?'};
const modifiers=/\b(?:ve|ile|and|yonet\w*|reklam\w*|pazarlama\w*|hizmet\w*|operasyon\w*|destek\w*|calisma\w*|yapilacak|baslayacak|istiyoruz|icin|olarak|aylik|her ay|ilk ay|sadece|yalnizca|only|management|marketing|services|manage\w*|campaign\w*|kampanya\w*|danisman\w*|consult\w*|strateji\w*|strategy|planlama\w*|optimizasyon\w*|dijital|digital|online|ads|paid|media|advertising|performans|performance|sosyal medya|social media|butce|content|icerik\w*|on|off|site|seo)\b/g;

export function interpretOperations(value,{context=''}={}){
 if(typeof value!=='string'||value.length>2000)return {serviceIds:[],unresolved:['Hizmet metni en fazla 2000 karakter olabilir.'],notes:[]};
 const serviceIds=new Set(),unresolved=[],notes=[],contextText=normalizeServiceText(context);
 const adviceOnlyContext=/\b(?:sadece|yalnizca|only)\s+(?:(?:reklam\w*|advertising)\s+)?(?:danisman\w*|consult\w*|strateji\w*|strategy|planlama\w*)\b/.test(contextText);
 for(const raw of value.split(/[,;\n.!?]+/).map(s=>s.trim()).filter(Boolean)){
  let text=normalizeServiceText(raw),rest=text;
  const excluded=new Set();
  for(const [id,pattern]of Object.entries(platforms)){
   const no=new RegExp('\\b'+pattern+'(?:\\s+reklam\\w*)?\\s+'+negative+'\\b|\\bwithout\\s+'+pattern+'\\b','g');
   if(no.test(text)){excluded.add(id);text=text.replace(no,' ');rest=text;}
  }
  let advisory=/\b(?:danisman\w*|consult\w*|planlama\w*|strateji\w*|strategy)\b/.test(text);
  const execution=/\b(?:reklam\w*|ads|adwords|paid media|meta|google(?: ads)?)\s+(?:ve\s+[\w\s]{0,24})?(?:yonet\w*|management|manage\w*|uygulama\w*|optimizasyon\w*|execution)\b/.test(text);
  const generic=/\b(?:dijital reklam\w*|digital ads|digital advertising|online reklam\w*|online ads|paid media|performans pazarlama\w*|performance marketing)\b/.test(text);
  const socialAds=/\b(?:facebook|instagram|sosyal medya|social media)\s+(?:ads|reklam\w*)\b/.test(text);
  const advertising=generic||socialAds||/\b(?:reklam\w*|advertising|adwords|google ads|meta)\b/.test(text);
  if(advertising&&!execution&&adviceOnlyContext){advisory=true;notes.push('Görüşmedeki yalnız danışmanlık kapsamı dikkate alındı.');}
  const found=new Set();
  for(const [id,pattern]of rules)if(pattern.test(text)){found.add(id);rest=rest.replace(new RegExp(pattern.source,'g'),' ');}
  if(/\bgoogle\b/.test(text)&&!/\bgoogle\s+(?:analytics|merchant|sheets|search console|business|maps)\b/.test(text)&&(generic||found.has('meta'))){found.add('google_ads');rest=rest.replace(/\bgoogle\b/g,' ');}
  const explicitAdvertising=['meta','google_ads','tiktok','amazon_ppc','programmatic'].some(id=>found.has(id));
  if(found.has('ecommerce_webmaster')||found.has('custom_webmaster'))found.delete('webmaster');
  if(found.has('ugc'))found.delete('influencer');
  if(/\bsosyal medya\b/.test(text)&&!socialAds&&!advisory)found.add('social');
  if(socialAds&&!advisory)found.add('meta');
  if(/\bseo\b/.test(text)&&!['onsite_seo','offsite_seo','technical_seo'].some(id=>found.has(id)))unresolved.push('SEO: On Site, Off Site veya Teknik SEO kapsamını listeden seç.');
  if(/\b(?:brandbook|brand book|kurumsal kimlik)\b/.test(text))unresolved.push('Brandbook/kurumsal kimlik: sheet’teki ilgili operasyon ve proje kapsamını listeden belirle.');
  if(/\b(?:web sitesi|website|web site)\b/.test(text)&&!['webmaster','ecommerce_webmaster','custom_webmaster'].some(id=>found.has(id)))unresolved.push('Website: standart, e-ticaret veya özel yazılım kapsamını listeden seç.');
  const channelIds=['meta','google_ads','tiktok','amazon_ppc','programmatic'];
  if(advisory&&execution&&channelIds.filter(id=>found.has(id)).length>1&&/\b(?:meta|google(?: ads)?|facebook|instagram)\s+(?:reklam\w*\s+)?danisman\w*\b/.test(text))unresolved.push('Farklı kanalların danışmanlık ve yönetim kapsamlarını virgülle ayır veya listeden ayrı seç.');
  if(advisory&&advertising&&!execution){
   channelIds.forEach(id=>found.delete(id));found.add('media_planning');
   notes.push('Reklam danışmanlığı/strateji talebi Medya ve Bütçe Planlama olarak yorumlandı; kampanya yönetimi eklenmedi.');
  }else{
   if(generic&&!explicitAdvertising){found.add('meta');found.add('google_ads');}
   if(advisory&&execution&&/\b(?:reklam danisman\w*|medya(?: ve butce)? planlama\w*)\b/.test(text))found.add('media_planning');
  }
  excluded.forEach(id=>found.delete(id));
  const only=text.match(/\b(?:sadece|yalnizca|only)\s+(meta|facebook|instagram|google(?: ads)?|tiktok)\b/);
  if(only&&generic){const id=/google/.test(only[1])?'google_ads':/tiktok/.test(only[1])?'tiktok':'meta';channelIds.filter(x=>x!==id).forEach(x=>found.delete(x));}
  if(generic&&(!advisory||execution))notes.push('Dijital reklam kapsamı: '+[...found].filter(id=>channelIds.includes(id)).map(id=>({meta:'Meta Reklam Yönetimi',google_ads:'Google Ads Reklam Yönetimi',tiktok:'TikTok Reklam Yönetimi',amazon_ppc:'Amazon PPC',programmatic:'Programmatic Reklam'})[id]).join(' + ')+'.');
  const remaining=rest.replace(/\b(?:facebook|instagram)\b/g,advertising||found.has('social')?' ':'$&').replace(modifiers,' ').replace(/[\d&+():\-]/g,' ').replace(/\s+/g,' ').trim();
  if(remaining&&!/^(?:meta|google)$/.test(remaining)||!found.size&&!excluded.size&&!unresolved.length)unresolved.push('Eşleşmeyen kapsam: '+raw+'. İlgili operasyonu listeden seç.');
  found.forEach(id=>serviceIds.add(id));
 }
 return {serviceIds:[...serviceIds],unresolved:[...new Set(unresolved)],notes:[...new Set(notes)]};
}
