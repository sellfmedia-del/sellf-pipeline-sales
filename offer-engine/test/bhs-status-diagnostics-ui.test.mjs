import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import chromium from '@sparticuz/chromium';
import {chromium as playwright} from 'playwright-core';

test('desktop, tablet and mobile show partial research, separate failures and one question while keeping offer preparation available',
 {skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await playwright.launch({executablePath:process.env.LOGO_TEST_CHROMIUM,
  args:chromium.args.filter(arg=>!['--single-process','--disable-web-security'].includes(arg)),headless:true});
 try{for(const width of [1280,820,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());assert.equal(url.origin,'https://preview.vercel.app');
   assert.ok(!url.pathname.startsWith('/api/'),'No external API, DB, AI or pricing call in a presentation check');
   try{await route.fulfill({body:await readFile(path.join(process.cwd(),'public',url.pathname)),
    contentType:{'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json'}[path.extname(url.pathname)]});}
   catch{await route.fulfill({status:404,body:''});}
  });
  await page.goto('https://preview.vercel.app/offers/recovery-review.html');
  await page.waitForFunction(()=>typeof window.PipelineAuditRequest==='function');
  await page.locator('#review-status').click();await page.locator('.ob-price:not([hidden])').waitFor();
  const report=page.locator('.ob-research-report'),text=await report.innerText();
  const notice=await page.locator('.ob-review-notice').innerText();
  assert.match(notice,/0\/5 ihtiyaç doğrulandı/);assert.match(notice,/Araştırma: .*sonraki araç/);assert.match(notice,/Rapor yazımı: .*süre/);
  assert.match(notice,/1 kaynaklı bulgu korundu/);
  assert.match(text,/Kaynaklı kısmi BHS/);assert.match(text,/0\/5 ihtiyaç doğrulandı/);assert.match(text,/5 ihtiyaç açık/);
  assert.match(text,/Araştırma · .*sonraki araç/);assert.match(text,/Rapor yazımı · .*süre/);
  assert.doesNotMatch(text,/Unresearched placeholder|Ön BHS boyutları/);
  assert.equal(await report.locator('p').filter({hasText:'How is the sales pilot measured?'}).count(),1);
  assert.equal(await page.locator('#offer-brief-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  assert.deepEqual(await page.evaluate(()=>reviewCalls.map(row=>row.action)),['start']);
  assert.deepEqual(errors,[]);
  if(width===390){
   await page.screenshot({path:'/tmp/bhs-17-20-mobile.png',fullPage:true});
   await report.scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/bhs-17-20-mobile-report.png',fullPage:true});
  }
  await page.close();
 }}finally{await browser.close();}
});
