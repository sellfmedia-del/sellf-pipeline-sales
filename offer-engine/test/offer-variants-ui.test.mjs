import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium as playwright} from 'playwright-core';
import chromium from '@sparticuz/chromium';
test('desktop/mobile: select independent offers, negotiate only prices with warning/history, then full same-form brief with optional new BHS',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await playwright.launch({args:chromium.args.filter(a=>!['--disable-web-security','--single-process'].includes(a)),executablePath:process.env.LOGO_TEST_CHROMIUM,headless:true});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],network=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());network.push(url.pathname);assert.equal(url.origin,'https://preview.vercel.app');assert.ok(!url.pathname.startsWith('/api/'));
   const file=path.join(process.cwd(),'public',url.pathname);return route.fulfill({contentType:{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json'}[path.extname(file)],body:await readFile(file)});
  });
  await page.goto('https://preview.vercel.app/offers/variants-review.html');await page.locator('.offer-select option').nth(1).waitFor({state:'attached'});
  assert.equal(await page.locator('.offer-select option').count(),2);assert.match(await page.locator('.offer-empty').textContent(),/\$/);
  await page.locator('.offer-select').selectOption('11111111-1111-4111-8111-111111111111');await page.getByText('Yayınlandı',{exact:true}).waitFor();
  const original=await page.evaluate(()=>({rows:structuredClone(window.reviewRows),lead:structuredClone(window.reviewLead)}));
  await page.locator('.offer-prices').click();await page.locator('.op-fields input').first().waitFor();
  await page.locator('[name=growth_operations]').fill('100000');await page.locator('[name=operations_bundle]').fill('40000');
  await page.getByRole('button',{name:'Güncelle ve yayınla',exact:true}).click();await page.getByText('Asgari tutarın altındaki fiyatı ayrıca onayla.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.reviewRows[0].customer_document.alternatives[0].monthlyAmount),original.rows[0].customer_document.alternatives[0].monthlyAmount);
  await page.locator('.op-confirm input').check();await page.getByRole('button',{name:'Güncelle ve yayınla',exact:true}).click();await page.locator('#offer-prices-dialog').waitFor({state:'detached'});
  const changed=await page.evaluate(()=>structuredClone(window.reviewRows));assert.equal(changed[0].customer_document.alternatives[0].monthlyAmount,100000);assert.deepEqual(changed[1],original.rows[1]);assert.deepEqual(await page.evaluate(()=>window.reviewLead),original.lead);
  assert.equal(await page.locator('.offer-details a').getAttribute('href'),'#ornek-musteri-teklifi-1');
  await page.locator('.offer-prices').click();await page.locator('.op-history summary').click();await page.locator('.op-history div p').waitFor();await page.screenshot({path:'/workspace/scratch/28851c4d6589/offer-price-review-'+width+'.png'});
  assert.equal(await page.locator('#offer-prices-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);await page.locator('.op-close').click();
  await page.locator('.offer-create').click();await page.locator('#offer-brief-dialog').waitFor();
  assert.equal(await page.locator('[name=bhsMode][value=reuse]').isChecked(),true);assert.equal(await page.locator('#ob-goals').inputValue(),'');
  assert.equal(await page.locator('[name=offerTitle],[name=market],[name=projectScope]').count(),0);
  for(const id of ['brandName','segment','website','goals','needs','services','budget','currency','meetingNotes'])assert.equal(await page.locator('#ob-'+id).count(),1);
  await page.locator('#ob-brandName').fill('Örnek Alt Marka');await page.locator('#ob-goals').fill('Avrupa operasyonlarını büyütmek');await page.locator('#ob-needs').fill('Verimli reklam yönetimi');await page.locator('#ob-services').fill('Google Ads');
  await page.locator('.ob-body').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'/workspace/scratch/28851c4d6589/offer-variant-brief-'+width+'.png'});assert.equal(await page.locator('#offer-brief-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await page.locator('.ob-next').click();await page.locator('.ob-price').waitFor();assert.equal(await page.evaluate(()=>window.reviewCalls.filter(c=>c.kind==='audit').length),0);
  assert.equal(await page.evaluate(()=>window.reviewCalls.filter(c=>c.action==='prepare').length),1);
  await page.locator('.ob-price').click();await page.locator('.ob-compose').waitFor();await page.locator('.ob-compose').click();await page.locator('.ob-save').waitFor();
  await page.locator('.ob-logo-approved').check();await page.locator('.ob-scope-approved').check();await page.locator('.ob-save').click();await page.getByText('Teklif v3 kaydedildi. Önceki teklif ve kart değeri korundu.',{exact:true}).waitFor();
  await page.locator('.ob-close').click();await page.waitForFunction(()=>document.querySelectorAll('.offer-select option').length===3);
  assert.deepEqual(await page.evaluate(()=>window.reviewRows.slice(0,2)),changed);assert.deepEqual(await page.evaluate(()=>window.reviewLead),original.lead);
  await page.locator('.offer-create').click();await page.locator('#ob-goals').fill('Amerika operasyonlarını büyütmek');await page.locator('#ob-needs').fill('Yeni pazar için ayrı analiz');await page.locator('#ob-services').fill('Meta reklam yönetimi');await page.locator('[name=bhsMode][value=new]').check();await page.locator('.ob-next').click();await page.locator('.ob-price').waitFor();
  const audits=await page.evaluate(()=>window.reviewCalls.filter(c=>c.kind==='audit'));assert.equal(audits.length,1);assert.equal(audits[0].brief.goals,'Amerika operasyonlarını büyütmek');assert.ok(audits[0].context.sourceOfferId);assert.match(audits[0].context.researchRunId,/^[a-f0-9-]{36}$/);
  assert.deepEqual(await page.evaluate(()=>window.reviewLead),original.lead);assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
