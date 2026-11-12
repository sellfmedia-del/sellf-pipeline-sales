import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium as playwright} from 'playwright-core';
import chromium from '@sparticuz/chromium';

test('desktop/mobile show both proposal languages independently of currency, including interactive sections and email form',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await playwright.launch({args:chromium.args.filter(a=>!['--disable-web-security','--single-process'].includes(a)),executablePath:process.env.LOGO_TEST_CHROMIUM,headless:true});
 try{for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());assert.equal(u.origin,'https://preview.vercel.app');try{const file=path.join(process.cwd(),'public',u.pathname);await route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css'}[path.extname(file)],body:await readFile(file)});}catch{await route.fulfill({status:404,body:'Missing fixture'});}});
  await page.goto('https://preview.vercel.app/offers/language-review.html');
  for(const language of ['tr','en'])for(const currency of ['TRY','USD']){
   await page.selectOption('#language',language);await page.selectOption('#currency',currency);const en=language==='en';
   assert.equal(await page.locator('#sellf-two-option-offer').getAttribute('lang'),language);
   await page.getByText(en?'Partnership options':'İşbirliği alternatifleri',{exact:true}).waitFor();
   assert.match(await page.locator('.so-option-price').first().textContent(),new RegExp((currency==='USD'?'USD':en?'TRY':'TL')+' / '+(en?'month':'ay')));
   await page.locator('.so-option').nth(1).click();assert.equal(await page.locator('#so-scope-title').textContent(),en?'Operations Package':'Operasyon Paketi');
   await page.locator('[data-dim=digital]').click();assert.ok((await page.locator('#so-flow').textContent()).includes(en?'Digital':'Dijital'));
   await page.locator('.so-bhs-bar').click();assert.equal(await page.locator('.so-bhs-bar .so-link').textContent(),en?'Expand analysis ↗':'Analizi aç ↗');await page.locator('.so-bhs-bar').click();
   await page.locator('#so-request-open').click();assert.equal(await page.locator('[name=name]').getAttribute('placeholder'),en?'Full name':'Ad Soyad');
   if(en){const content=await page.locator('#sellf-two-option-offer').textContent();for(const tr of ['hizmet bedeli','veri yok','İşbirliği','Gelişim alanı','kaynak ·','için özel'])assert.ok(!content.includes(tr),tr);}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   // Exercise the published-proposal form without opening or sending email.
   await page.evaluate(({language,currency})=>{
    PipelineProposal.mount(document.querySelector('#offer'),docs[language][currency],{offerUrl:'https://preview.vercel.app/brand-teklifi',offerId:'offer1'});
    document.querySelector('#sellf-two-option-offer').addEventListener('click',event=>{if(event.target.closest('a[href^="mailto:"]'))event.preventDefault();});
   },{language,currency});
   await page.locator('#so-request-open').click();
   await page.locator('[name=name]').fill('Jane Smith');await page.locator('[name=email]').fill('jane@example.com');
   await page.locator('#so-request-form').evaluate(form=>form.requestSubmit());
   assert.equal(await page.locator('.so-request-status').textContent(),en?'Complete sending from the draft in your email application.':'Gönderimi e-posta uygulamanızdaki taslaktan tamamlayın.');
   assert.match(await page.locator('.so-mailto-reopen').getAttribute('href'),/^mailto:yigit@sellfmedia.com,businessdevelopment@sellfmedia.com\?/);
   await page.evaluate(()=>{HTMLAnchorElement.prototype.click=function(){throw Error();};});
   await page.locator('#so-request-form').evaluate(form=>form.requestSubmit());
   assert.equal(await page.locator('.so-request-status').textContent(),en?'The email draft could not be prepared.':'E-posta taslağı hazırlanamadı.');
   await page.evaluate(()=>{delete HTMLAnchorElement.prototype.click;});
  }
  await page.evaluate(()=>{
   const doc=structuredClone(docs.tr.TRY);
   doc.bhs.findings=[{id:'digital-example',kind:'observation',dimension:'digital',priority:'high',
    statement:'Ürün sayfasında teslimat koşulları yer alıyor.',impact:'Teslimat koşulları satın alma kararını etkileyebilir.',
    recommendation:{action:'Teslimat bilgisi modülünü ürün sayfasında test edin.',measurement:'Sepete ekleme oranını karşılaştırın.'},sourceIds:['evidence-example']}];
   doc.bhs.bhsSections=[{id:'digital',title:'Dijital varlıklar',findingIds:['digital-example'],complete:false}];
   doc.bhs.meetingQuestions=['Teslimat performansını hangi sistemden izliyorsunuz?'];
   doc.bhs.sources=[{id:'evidence-example',title:'Ürün sayfası',url:'https://synthetic.example/urun'}];
   PipelineProposal.mount(document.querySelector('#offer'),doc);
  });
  await page.getByText('Önerilen aksiyon: Teslimat bilgisi modülünü ürün sayfasında test edin.',{exact:true}).waitFor();
  await page.getByText('Başarı ölçümü: Sepete ekleme oranını karşılaştırın.',{exact:true}).waitFor();
  await page.getByText('Teslimat performansını hangi sistemden izliyorsunuz?',{exact:true}).waitFor();
  await page.getByText('Seçili bulguların kaynakları',{exact:true}).click();
  await page.locator('a[href="https://synthetic.example/urun"]').waitFor();
  assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
