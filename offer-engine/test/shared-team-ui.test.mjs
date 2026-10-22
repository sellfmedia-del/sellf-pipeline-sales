import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {chromium} from 'playwright-core';
test('desktop/mobile: teammate opens and publishes draft; both users recover identical state after reload',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await chromium.launch({executablePath:process.env.LOGO_TEST_CHROMIUM,args:['--no-sandbox','--disable-gpu'],headless:true});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());assert.equal(url.origin,'https://preview.vercel.app');assert.ok(!url.pathname.startsWith('/api/'));
   const file=path.join(process.cwd(),'public',url.pathname);return route.fulfill({contentType:{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json'}[path.extname(file)],body:await readFile(file)});
  });
  await page.goto('https://preview.vercel.app/offers/team-review.html');await page.locator('.offer-select option').nth(1).waitFor({state:'attached'});
  await page.locator('.offer-publish:not([hidden])').waitFor();const initial=await page.evaluate(()=>({rows:structuredClone(reviewRows),lead:structuredClone(reviewLead)}));
  await page.locator('#team-user-2').click();await page.locator('.offer-publish:not([hidden])').waitFor();
  await page.locator('.offer-view').click();await page.locator('#offer-saved-dialog .so-option').first().waitFor();await page.getByRole('button',{name:'Karta dön',exact:true}).click();
  await page.locator('.offer-publish').click();await page.getByText('Yayınlandı',{exact:true}).waitFor();
  const link=await page.locator('.offer-details a').getAttribute('href'),password=await page.locator('.offer-details dd').nth(2).textContent();
  await page.reload();await page.locator('.offer-details a').waitFor();assert.equal(await page.locator('.offer-details a').getAttribute('href'),link);assert.equal(await page.locator('.offer-details dd').nth(2).textContent(),password);
  await page.locator('#team-user-1').click();await page.locator('.offer-details a').waitFor();assert.equal(await page.locator('.offer-details a').getAttribute('href'),link);assert.equal(await page.locator('.offer-details dd').nth(2).textContent(),password);
  const final=await page.evaluate(()=>({rows:structuredClone(reviewRows),lead:structuredClone(reviewLead)}));assert.deepEqual(final.lead,initial.lead);assert.deepEqual(final.rows.map(r=>r.customer_document),initial.rows.map(r=>r.customer_document));assert.equal(final.rows.at(-1).state,'published');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(os.tmpdir(),'sellf-shared-team-'+width+'.png'),fullPage:true});await page.close();
 }}finally{await browser.close();}
});
