import {chooseBoth} from './helpers/cost-picker.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import chromium from '@sparticuz/chromium';
import {chromium as playwright} from 'playwright-core';

test('desktop/mobile display distinct sales gap reasons even when no findings reached the offer',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await playwright.launch({executablePath:process.env.LOGO_TEST_CHROMIUM,args:chromium.args.filter(a=>!['--single-process','--disable-web-security'].includes(a)),headless:true});
 try{for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());assert.equal(u.origin,'https://preview.vercel.app');assert.ok(!u.pathname.startsWith('/api/'));
   const file=path.join(process.cwd(),'public',u.pathname);
   try{await route.fulfill({contentType:{'.html':'text/html','.mjs':'application/javascript','.js':'application/javascript','.css':'text/css'}[path.extname(file)],body:await readFile(file)});}
   catch{await route.fulfill({status:404,body:''});}
  });
  await page.goto('https://preview.vercel.app/offers/recovery-review.html');
  await page.waitForFunction(()=>typeof window.PipelineAuditRequest==='function');
  await page.evaluate(width=>{
   const original=window.PipelineAuditRequest;
   window.PipelineAuditRequest=async payload=>{
    const response=await original(payload);
    Object.assign(response.result.data,{findings:[],researchContinuity:{status:'unavailable',notice:'Görüşme bilgileriyle teklife devam edebilirsin.'},
     verifiedResearch:{metrics:[],competitorCandidates:[{name:'Örnek Aday',url:'https://candidate.example/catalogue'}]},
     supervision:{researchStopReason:width===1280?'research_engine_failure':'research_source_plan_invalid'},
     bhsSections:[{id:'DİJİTAL',title:'Dijital varlıklar',complete:false,findingIds:[],openMetrics:[
      {name:'Instagram’da son 30 günün etkileşimi',status:'not_searched'},
      {name:'Markanın YouTube hesabı',status:'insufficient_sources'},
      {name:'Reklam maliyetleri',status:'missing_from_report'}]},
      {id:'T_ROYAL',title:'Royal set ürün deneyimi',complete:false,findingIds:[],openMetrics:[
       {id:'price',name:'Royal set fiyatı',status:'source_unreadable',statusLabel:'Kaynak okunamadı'},
       {id:'buyer',name:'Royal set alıcı davranışı',status:'searched',statusLabel:'Arama yapıldı, yeterli kanıt bulunamadı'},
       {id:'partial',name:'Royal set kullanım koşulları',status:'partially_verified',statusLabel:'Ölçüm kısmen doğrulandı'},
       {id:'report',name:'Royal set kullanım kılavuzu',status:'missing_from_report',statusLabel:'Doğrulandı, rapora aktarılamadı'}]},
      {id:'swot',title:'SWOT',complete:false,findingIds:[],missingQuadrants:['weakness','threat']}]});
    return response;
   };
  },width);
  await page.locator('#review-restored').click();
  await page.locator('.ob-price:not([hidden])').waitFor();
  const text=await page.locator('.ob-research-report').innerText();
  assert.match(await page.locator('.ob-review-notice').textContent(),width===1280?/aynı işlem hatası/:/Kaynak planı doğrulanamadı/);
  for(const row of ['Instagram’da son 30 günün etkileşimi — Aranmadı','Markanın YouTube hesabı — Kaynak yetersiz','Reklam maliyetleri — Kanıt bulundu, rapora aktarılamadı'])assert.ok(text.includes(row),row);
  assert.doesNotMatch(text,/instagram_marka|youtube_marka|reklam_maliyet/);
  assert.equal(await page.locator('.ob-research-report article').count(),0);
  assert.equal(await page.locator('.ob-research-report h3').filter({hasText:'Doğrulanacak rakip adayları'}).count(),1);
  assert.match(text,/Örnek Aday · https:\/\/candidate\.example\/catalogue/);
  assert.match(text,/Kanıt bekleyen SWOT kolları · Zayıf yön, Tehdit/);
  for(const status of ['Kaynak okunamadı','Arama yapıldı, yeterli kanıt bulunamadı','Ölçüm kısmen doğrulandı','Doğrulandı, rapora aktarılamadı'])assert.ok(text.includes(status),status);
  assert.match(text,/Royal set ürün deneyimi/);
  assert.deepEqual(await page.evaluate(()=>reviewCalls.map(r=>r.action)),['start']);
  assert.equal(await page.locator('#offer-brief-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});

test('desktop/mobile restores the recorded research view at 46.21 TRY and reaches the offer with only a start read',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await playwright.launch({executablePath:process.env.LOGO_TEST_CHROMIUM,args:chromium.args.filter(a=>!['--single-process','--disable-web-security'].includes(a)),headless:true});
 try{for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());assert.equal(u.origin,'https://preview.vercel.app');assert.ok(!u.pathname.startsWith('/api/'));try{await route.fulfill({contentType:{'.html':'text/html','.mjs':'application/javascript','.js':'application/javascript','.css':'text/css','.json':'application/json'}[path.extname(u.pathname)],body:await readFile(path.join(process.cwd(),'public',u.pathname))});}catch{await route.fulfill({status:404,body:''});}});
  await page.goto('https://preview.vercel.app/offers/recovery-review.html');await page.locator('#review-restored').click();await page.locator('.ob-price:not([hidden])').waitFor();
  assert.match(await page.locator('#ob-review-title').textContent(),/Kısmi BHS/);assert.match(await page.locator('.ob-review-notice').textContent(),/daha önce tamamlanan araştırma/);assert.match(await page.locator('.ob-footer>p').textContent(),/46,21 \/ 50,00/);
  await chooseBoth(page,'meta');await page.locator('.ob-price').click();await page.locator('.ob-compose:not([hidden])').waitFor();await page.locator('.ob-compose').click();await page.locator('.ob-proposal:not([hidden])').waitFor();
  assert.equal(await page.locator('.ob-scope-approved').isChecked(),false);assert.deepEqual(await page.evaluate(()=>reviewCalls.map(c=>c.action)),['start']);assert.equal(await page.locator('#offer-brief-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});

test('desktop/mobile expose budget detail and require one explicit recovery, preserving the brief and downstream pricing UI',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await playwright.launch({executablePath:process.env.LOGO_TEST_CHROMIUM,args:chromium.args.filter(a=>!['--single-process','--disable-web-security'].includes(a)),headless:true});
 try{for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());assert.equal(u.origin,'https://preview.vercel.app');requests.push(u.pathname);assert.ok(!u.pathname.startsWith('/api/'),'synthetic review must not call APIs');try{await route.fulfill({contentType:{'.html':'text/html','.mjs':'application/javascript','.js':'application/javascript','.css':'text/css','.json':'application/json'}[path.extname(u.pathname)],body:await readFile(path.join(process.cwd(),'public',u.pathname))});}catch{await route.fulfill({status:404,body:''});}});
  await page.goto('https://preview.vercel.app/offers/recovery-review.html');
  for(const kind of ['budget','model']){
   await page.locator('#review-'+kind).click();await page.locator('.ob-recovery:not([hidden])').waitFor();
   assert.deepEqual(await page.evaluate(()=>reviewCalls.map(r=>r.action)),['start','advance']);
   assert.ok((await page.locator('.ob-footer>p').textContent()).includes('22,32 / 50,00'));
   if(kind==='budget'){const text=await page.locator('.ob-review-notice').textContent();for(const value of ['29,60','27,68','0,00'])assert.ok(text.includes(value));}
   await page.locator('.ob-cost-detail summary').click();assert.ok((await page.locator('.ob-cost-copy').textContent()).includes('kesinleşmiş harcama olarak gösterilmez'));
   if(process.env.BHS_TEST_SCREENSHOTS==='1'&&kind==='budget')await page.screenshot({path:'/tmp/bhs-recovery-'+width+'.png'});
   // Two synchronous clicks still authorise a single recovery batch.
   await page.locator('.ob-retry').evaluate(button=>{button.click();button.click();});
   await page.locator('.ob-price:not([hidden])').waitFor();
   assert.deepEqual(await page.evaluate(()=>reviewCalls.map(r=>r.action)),['start','advance','recover','advance']);
   assert.equal(await page.locator('.ob-recovery').isVisible(),false);
   await chooseBoth(page,'meta');await page.locator('.ob-price').click();assert.equal(await page.locator('.ob-pricing article').count(),2);
   assert.equal(await page.locator('#offer-brief-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
   await page.locator('.ob-edit').click();assert.equal(await page.locator('#ob-goals').inputValue(),'Ölçülebilir büyüme.');
   await page.locator('.ob-close').click();
  }
  assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
test('desktop/mobile continue without completed research or extra paid retries, and retry a failed English draft in English',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await playwright.launch({executablePath:process.env.LOGO_TEST_CHROMIUM,args:chromium.args.filter(a=>!['--single-process','--disable-web-security'].includes(a)),headless:true});
 try{for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());assert.equal(u.origin,'https://preview.vercel.app');assert.ok(!u.pathname.startsWith('/api/'));try{await route.fulfill({contentType:{'.html':'text/html','.mjs':'application/javascript','.js':'application/javascript','.css':'text/css','.json':'application/json'}[path.extname(u.pathname)],body:await readFile(path.join(process.cwd(),'public',u.pathname))});}catch{await route.fulfill({status:404,body:''});}});
  await page.goto('https://preview.vercel.app/offers/recovery-review.html');
  for(const kind of ['continuity','english','empty','active']){
   const expected=kind==='active'?['start','continue']:['start','advance','continue'];
   if(kind==='active')await page.evaluate(()=>{const original=window.PipelineAuditRequest;window.PipelineAuditRequest=async payload=>{const result=await original(payload);return payload.action==='start'?{...result,phase:'brand_plan',nextAction:undefined,execution:'background',continuationAvailable:true}:result;};});
   await page.locator('#review-'+(kind==='active'?'continuity':kind)).click();await page.locator('.ob-continuation:not([hidden])').waitFor();
   await page.locator('.ob-continue').evaluate(button=>{button.click();button.click();});
   await page.locator('.ob-price:not([hidden])').waitFor();assert.match(await page.locator('#ob-review-title').textContent(),/Görüşme bilgileriyle teklif hazırlığı/);
   assert.deepEqual(await page.evaluate(()=>reviewCalls.map(c=>c.action)),expected);
   assert.equal(await page.locator('.ob-research-report article').count(),0,'unavailable research must not render six empty dimension cards');
   assert.equal(await page.locator('.ob-research-report h3').count(),0,'unavailable research must not render empty report headings');
   assert.ok((await page.locator('.ob-footer>p').textContent()).includes('22,32 / 50,00'));
   await chooseBoth(page,'meta');await page.locator('.ob-price').click();await page.locator('.ob-compose:not([hidden])').waitFor();assert.equal(await page.locator('.ob-pricing article').count(),2);
   await page.locator('.ob-compose').click();
   if(kind==='english'){
    await page.locator('.ob-draft-cost:not([hidden])').waitFor();await page.locator('.ob-compose:not([disabled])').waitFor();
    assert.match(await page.locator('.ob-draft-cost').textContent(),/1,72.*10,00/);
    assert.match(await page.locator('.ob-footer>p').textContent(),/22,32 \/ 50,00/);
    assert.equal(await page.locator('.ob-pricing').isVisible(),true);
    assert.equal(await page.locator('#ob-language').inputValue(),'en');
    await page.locator('.ob-compose').click();
   }
   try{await page.locator('.ob-proposal:not([hidden])').waitFor({timeout:8000});}catch(error){throw Error(JSON.stringify({width,kind,errors,notice:await page.locator('.ob-review-notice').textContent(),composeCalls:await page.evaluate(()=>reviewComposeCalls.length)}));}
   assert.match(await page.locator('.so-bhs-brief').textContent(),/doğrulanmış bulgu bulunmuyor/);
   assert.equal(await page.locator('.ob-scope-approved').isChecked(),false);assert.equal(await page.locator('.ob-publish').isVisible(),false);
   const calls=await page.evaluate(()=>reviewComposeCalls.map(c=>({language:c.brief.language,audit:c.audit,pricing:c.pricing})));
   assert.deepEqual(calls.map(c=>c.language),kind==='english'?['en','en']:['tr']);
   if(calls.length===2){assert.deepEqual(calls[0].audit,calls[1].audit);assert.deepEqual(calls[0].pricing,calls[1].pricing);}
   assert.deepEqual(await page.evaluate(()=>reviewCalls.map(c=>c.action)),expected);
   assert.equal(await page.locator('#offer-brief-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
   if(process.env.BHS_TEST_SCREENSHOTS==='1'&&kind==='english')await page.screenshot({path:'/tmp/bhs-continuity-'+width+'.png'});
   await page.locator('.ob-close').click();
  }
  assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
