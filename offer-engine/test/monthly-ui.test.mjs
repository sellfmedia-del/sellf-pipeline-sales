import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium as playwright} from 'playwright-core';
import chromium from '@sparticuz/chromium';
const launch=()=>playwright.launch({args:chromium.args.filter(a=>!['--disable-web-security','--single-process'].includes(a)),executablePath:process.env.LOGO_TEST_CHROMIUM,headless:true});
async function pageFor(browser,width){
 const page=await browser.newPage({viewport:{width,height:960}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());assert.equal(u.origin,'https://preview.vercel.app');assert.ok(!u.pathname.startsWith('/api/'));try{await route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'}[path.extname(u.pathname)],body:await readFile(path.join(process.cwd(),'public',u.pathname))});}catch{await route.fulfill({status:404,body:'Missing review file'});}});
 await page.goto('https://preview.vercel.app/offers/monthly-review.html');await page.waitForFunction(()=>window.monthlyReviewReady===true);return {page,errors};
}
async function afterBhs(page,currency='TRY'){
 await page.locator('.offer-create').click();assert.equal(await page.locator('.ob-service-selection').isVisible(),false);
 await page.locator('#ob-goals').fill('Operasyonları aşamalı başlatmak');await page.locator('#ob-needs').fill('Website ve devam eden operasyonlar');await page.locator('#ob-services').fill('Dijital reklamlar, tüm hizmetler ve SEO eklensin');await page.locator('#ob-currency').selectOption(currency);
 await page.locator('.ob-next').click();await page.locator('.ob-standard-editor input[value=meta]').waitFor();assert.equal(await page.locator('.ob-monthly-toggle').isChecked(),false);
}
const check=(page,scope,id)=>page.locator(scope+' input[type=checkbox][value="'+id+'"]').check();

test('desktop/mobile: BHS → exact standard checkboxes → separate project fees → edit without research → save and reopen; old offers and card stay intact',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await launch();const screenshots=path.resolve('../qa/selection');await mkdir(screenshots,{recursive:true});
 try{for(const width of [1440,390]){
  const {page,errors}=await pageFor(browser,width),before=await page.evaluate(()=>({rows:structuredClone(reviewRows),lead:structuredClone(reviewLead)}));await afterBhs(page);
  assert.equal(await page.locator('.ob-standard-editor input[type=checkbox]').count(),31);
  await page.locator('.ob-price').click();await page.locator('.ob-monthly-error').filter({hasText:'En az bir hizmet veya proje seç'}).waitFor();assert.equal(await page.locator('.ob-pricing').isVisible(),false);
  for(const id of ['meta','email_marketing','project_brandbook','project_wordpress'])await check(page,'.ob-standard-editor',id);
  await page.locator('.ob-price').click();await page.locator('.ob-compose').waitFor();await page.locator('.ob-compose').click();await page.locator('.so-projects').waitFor();
  const priced=await page.evaluate(()=>reviewCalls.find(c=>c.serviceSelection));assert.deepEqual(priced.serviceSelection.services.map(s=>s.serviceId),['meta','email_marketing']);assert.deepEqual(priced.serviceSelection.projects.map(s=>s.serviceId),['project_brandbook','project_wordpress']);
  assert.match(await page.locator('.so-option').nth(1).textContent(),/88.000/);assert.match(await page.locator('.so-project-total').textContent(),/155.000/);assert.equal(await page.locator('.so-option').count(),2);
  assert.equal(await page.locator('#offer-brief-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);await page.locator('.ob-proposal').screenshot({path:path.join(screenshots,'standard-'+width+'.png')});await page.locator('.so-projects').screenshot({path:path.join(screenshots,'projects-'+width+'.png')});
  // Changing selection invalidates priced/saved documents, never the BHS.
  await page.locator('.ob-services-edit').click();await page.locator('.ob-standard-editor input[value=email_marketing]').uncheck();assert.equal(await page.locator('.ob-proposal').isVisible(),false);assert.equal(await page.locator('.ob-save').isVisible(),false);
  await page.locator('.ob-price').click();await page.locator('.ob-compose').click();await page.locator('.so-projects').waitFor();assert.match(await page.locator('.so-option').nth(1).textContent(),/28.000/);assert.match(await page.locator('.so-project-total').textContent(),/155.000/);
  assert.equal(await page.evaluate(()=>reviewCalls.filter(c=>c.action==='prepare').length),1);assert.equal(await page.evaluate(()=>reviewCalls.filter(c=>c.kind==='audit').length),0);
  await page.locator('.ob-logo-approved').check();await page.locator('.ob-scope-approved').check();await page.locator('.ob-save').click();await page.getByText('Teklif v3 kaydedildi. Önceki teklif ve kart değeri korundu.',{exact:true}).waitFor();await page.locator('.ob-publish').click();await page.locator('.ob-save-status').filter({hasText:'Müşteri bağlantısı:'}).waitFor();await page.locator('.ob-close').click();
  await page.waitForFunction(()=>document.querySelectorAll('.offer-select option').length===3);assert.match(await page.locator('.offer-empty').textContent(),/tek seferlik projeler/);
  await page.locator('.offer-view').click();await page.locator('#offer-saved-dialog .so-projects').waitFor();await page.locator('.offer-saved-close').click();assert.deepEqual(await page.evaluate(()=>reviewRows.slice(0,2)),before.rows);assert.deepEqual(await page.evaluate(()=>reviewLead),before.lead);
  await page.locator('.offer-select').selectOption(before.rows[0].id);await page.locator('.offer-view').click();assert.equal(await page.locator('.so-projects').count(),0);assert.equal(await page.locator('.so-option').count(),2);await page.locator('.offer-saved-close').click();assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});

test('desktop/mobile: monthly project-only first month, copied retainer excludes projects, frozen USD and separate project columns survive save/reopen',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await launch();try{for(const width of [1440,390]){
  const {page,errors}=await pageFor(browser,width);await afterBhs(page,'USD');await page.locator('.ob-monthly-toggle').check();await page.locator('[data-month="1"] input[value=project_wordpress]').waitFor();await check(page,'[data-month="1"]','project_wordpress');
  await page.getByRole('button',{name:'Ay ekle',exact:true}).click();await check(page,'[data-month="2"]','social');await check(page,'[data-month="2"]','meta');await check(page,'[data-month="2"]','project_brandbook');
  await page.getByRole('button',{name:'Ay ekle',exact:true}).click();await page.locator('[data-month="3"]').getByRole('button',{name:'Önceki ayın retainer hizmetlerini kopyala'}).click();
  assert.equal(await page.locator('[data-month="3"] input[value=social]').isChecked(),true);assert.equal(await page.locator('[data-month="3"] input[value=project_brandbook]').isChecked(),false);assert.equal(await page.locator('textarea[aria-label$="hizmetleri yaz"]').count(),0);
  await page.locator('.ob-price').click();await page.locator('.ob-compose').click();try{await page.locator('.so-monthly-table tbody tr').nth(2).waitFor({timeout:5000});}catch{throw Error(JSON.stringify({errors,notice:await page.locator('.ob-review-notice').textContent(),calls:await page.evaluate(()=>reviewCalls.filter(c=>c.pricingMode==='monthly'||c.pricing).map(c=>({plan:c.monthlyPlan,priced:c.pricing?.data}))) }));}
  const call=await page.evaluate(()=>reviewCalls.find(c=>c.pricingMode==='monthly'));assert.equal(call.monthlyPlan.months[0].services.length,0);assert.equal(call.monthlyPlan.months[0].projects[0].serviceId,'project_wordpress');assert.deepEqual(call.monthlyPlan.months[2].projects,[]);
  const rows=await page.locator('.so-monthly-table tbody tr').allTextContents();assert.match(rows[0],/WordPress/);assert.match(rows[0],/0 USD/);assert.match(rows[1],/Brandbook/);assert.ok(!rows[2].includes('Brandbook'));assert.equal(await page.locator('.so-monthly-table tbody tr').nth(2).locator('.so-project-amount').textContent(),'—');assert.match(await page.locator('#so-track').textContent(),/WordPress/);
  assert.equal(await page.locator('.ob-proposal').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);await page.locator('.ob-proposal').screenshot({path:path.resolve('../qa/selection/monthly-'+width+'.png')});await page.locator('.so-monthly-options').screenshot({path:path.resolve('../qa/selection/monthly-prices-'+width+'.png')});
  await page.locator('.ob-logo-approved').check();await page.locator('.ob-scope-approved').check();await page.locator('.ob-save').click();await page.getByText('Teklif v3 kaydedildi. Önceki teklif ve kart değeri korundu.',{exact:true}).waitFor();await page.locator('.ob-close').click();await page.locator('.offer-view').click();await page.locator('.so-monthly-table tbody tr').nth(2).waitFor();assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
