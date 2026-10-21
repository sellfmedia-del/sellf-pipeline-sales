(function(){'use strict';
 function extension(value){
  let slug=String(value||'').trim();
  if(/^https?:\/\//i.test(slug)){
   const url=new URL(slug);if(url.protocol!=='https:'||url.hostname!=='offerletter.sellfmedia.com'||url.username||url.password||url.port||url.search||url.hash)throw Error();slug=url.pathname;
  }
  slug=slug.replace(/^\//,'').replace(/\/$/,'');
  if(slug.length>120||!/^[a-z0-9]+(?:-[a-z0-9]+)*-teklifi(?:-v\d+-[a-f0-9]{8})?$/.test(slug))throw Error();return slug;
 }
 document.querySelectorAll('[data-offer-search]').forEach(form=>form.addEventListener('submit',e=>{
  e.preventDefault();const input=form.elements.extension,status=form.querySelector('[role=status]');
  try{const slug=extension(input.value);input.setAttribute('aria-invalid','false');status.textContent='Uzantı biçimi doğru: '+slug+'. Teklif erişimi, bağlantı adımı tamamlandığında açılacak.';}
  catch{input.setAttribute('aria-invalid','true');status.textContent='Size iletilen uzantıyı girin. Örnek: ornek-marka-teklifi';input.focus();}
 }));
 document.querySelectorAll('[data-contact-form]').forEach(form=>form.addEventListener('submit',e=>{
  e.preventDefault();const data=new FormData(form),name=String(data.get('name')||'').trim(),brand=String(data.get('brand')||'').trim(),email=String(data.get('email')||'').trim(),message=String(data.get('message')||'').trim();
  if(!form.reportValidity())return;
  const subject='Teklif hakkında · '+brand,body='Merhaba Sellf ekibi,\n\n'+message+'\n\n'+name+'\n'+brand+'\n'+email;
  const url='mailto:businessdevelopment@sellfmedia.com?'+new URLSearchParams({cc:'yigit@sellfmedia.com',subject,body}).toString();
  const anchor=form.querySelector('[data-mail-fallback]');anchor.href=url;anchor.hidden=false;anchor.click();form.querySelector('[role=status]').textContent='E-posta taslağı uygulamanızda açılır. Gönderimi oradan tamamlayabilirsiniz.';
 }));
 document.querySelectorAll('[data-year]').forEach(el=>el.textContent=new Date().getFullYear());
})();
