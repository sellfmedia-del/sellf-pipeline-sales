import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium as playwright} from 'playwright-core';
import chromium from '@sparticuz/chromium';

test('desktop/mobile: default stays standard; explicit months calculate, render, save and reopen without changing other offers or the Pipeline card',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await playwright.launch({args:chromium.args.filter(a=>!['--disable-web-security','--single-process'].includes(a)),executablePath:process.env.LOGO_TEST_CHROMIUM,headless:true});
 const screenshots=path.resolve('../qa/monthly');await mkdir(screenshots,{recursive:true});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:960}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());assert.equal(url.origin,'https://preview.vercel.app');assert.ok(!url.pathname.startsWith('/api/'),'synthetic review must never call a real API');
   try{const file=path.join(process.cwd(),'public',url.pathname);await route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'}[path.extname(file)],body:await readFile(file)});}catch{await route.fulfill({status:404,body:'Missing preview file'});}
  });
  await page.goto('https://preview.vercel.app/offers/monthly-review.html');await page.waitForFunction(()=>window.monthlyReviewReady===true);
  const original=await page.evaluate(()=>({rows:structuredClone(reviewRows),lead:structuredClone(reviewLead)}));
  await page.locator('.offer-create').click();assert.equal(await page.locator('.ob-monthly-toggle').isChecked(),false);assert.equal(await page.locator('.ob-monthly-editor').isVisible(),false);
  await page.locator('#ob-goals').fill('Operasyonları aşamalı başlatmak');await page.locator('#ob-needs').fill('Website, brandbook ve devam eden operasyonlar');await page.locator('#ob-services').fill('Website, marka pazarlama, sosyal medya, UGC, Meta ve SEO');await page.locator('#ob-currency').selectOption('USD');
  await page.locator('.ob-monthly-toggle').check();await page.locator('[data-month="1"] select').waitFor();
  await page.locator('.ob-next').click();await page.getByText('1. ay için en az bir operasyon seç.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>reviewCalls.filter(c=>c.action==='prepare').length),0);
  await page.locator('[data-month="1"] select').selectOption('webmaster');await page.locator('[data-month="1"] [data-description=webmaster]').fill('Website kurulumu');
  await page.getByRole('button',{name:'Ay ekle',exact:true}).click();await page.locator('[data-month="2"] select').selectOption('brand_marketing');await page.locator('[data-month="2"] [data-description=brand_marketing]').fill('Brandbook');
  await page.getByRole('button',{name:'Ay ekle',exact:true}).click();await page.locator('[data-month="3"] select').selectOption('social');await page.locator('[data-month="3"] select').selectOption('ugc');
  await page.getByRole('button',{name:'Ay ekle',exact:true}).click();await page.locator('[data-month="4"]').getByRole('button',{name:'Önceki aydan kopyala'}).click();await page.locator('[data-month="4"] select').selectOption('meta');await page.locator('[data-month="4"] select').selectOption('onsite_seo');
  assert.equal(await page.locator('#offer-brief-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);await page.screenshot({path:path.join(screenshots,'editor-'+width+'.png')});
  await page.locator('.ob-next').click();await page.locator('.ob-price').waitFor();
  const auditCall=await page.evaluate(()=>reviewCalls.find(c=>c.action==='prepare'));assert.equal(auditCall.brief.monthlyPlan,undefined);assert.equal(auditCall.brief.pricingMode,undefined);
  await page.locator('.ob-price').click();await page.locator('.ob-compose').waitFor();assert.equal(await page.locator('.ob-proposal-controls').isVisible(),false);
  await page.getByText('Ay bazlı hizmet bedelleri',{exact:true}).waitFor();
  await page.locator('.ob-compose').click();await page.locator('.so-monthly-table tbody tr').nth(3).waitFor();
  assert.equal(await page.locator('.so-option').count(),0);assert.equal(await page.locator('.so-monthly-table tbody tr').count(),4);assert.equal(await page.locator('#so-track .so-step').count(),4);
  assert.equal(await page.locator('.so-monthly-table tbody tr').nth(2).textContent().then(s=>s.includes('Webmaster')),false);
  assert.match(await page.locator('.so-monthly-table tbody tr').nth(3).textContent(),/USD/);
  assert.equal(await page.locator('.ob-proposal').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await page.locator('.ob-proposal').screenshot({path:path.join(screenshots,'proposal-'+width+'.png')});
  await page.locator('.ob-logo-approved').check();await page.locator('.ob-scope-approved').check();await page.locator('.ob-save').click();await page.getByText('Teklif v3 kaydedildi. Önceki teklif ve kart değeri korundu.',{exact:true}).waitFor();
  await page.locator('.ob-publish').click();await page.locator('.ob-save-status').filter({hasText:'Müşteri bağlantısı:'}).waitFor();await page.locator('.ob-close').click();
  await page.waitForFunction(()=>document.querySelectorAll('.offer-select option').length===3);assert.equal(await page.locator('.offer-prices').isVisible(),false);assert.match(await page.locator('.offer-empty').textContent(),/1. ay/);
  await page.locator('.offer-view').click();await page.locator('#offer-saved-dialog .so-monthly-table tbody tr').nth(3).waitFor();await page.locator('.offer-saved-close').click();
  assert.deepEqual(await page.evaluate(()=>reviewRows.slice(0,2)),original.rows);assert.deepEqual(await page.evaluate(()=>reviewLead),original.lead);
  await page.locator('.offer-select').selectOption(original.rows[0].id);await page.locator('.offer-view').click();assert.equal(await page.locator('#offer-saved-dialog .so-option').count(),2);assert.equal(await page.locator('#offer-saved-dialog .so-monthly-table').count(),0);await page.locator('.offer-saved-close').click();
  await page.locator('.offer-create').click();assert.equal(await page.locator('.ob-monthly-toggle').isChecked(),false);await page.locator('.ob-close').click();
  assert.deepEqual(errors,[]);
  await page.evaluate(()=>{const container=document.createElement('main');container.style.maxWidth='1160px';document.body.replaceChildren(container);PipelineProposal.mount(container,reviewRows.at(-1).customer_document);});
  await page.locator('.so-monthly-options').screenshot({path:path.join(screenshots,'prices-'+width+'.png')});
  await page.locator('.so-process').screenshot({path:path.join(screenshots,'workflow-'+width+'.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.close();
 }}finally{await browser.close();}
});
