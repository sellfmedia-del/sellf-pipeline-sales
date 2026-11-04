import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import chromium from '@sparticuz/chromium';
import {chromium as playwright} from 'playwright-core';

test('desktop/mobile expose budget detail and require one explicit recovery, preserving the brief and downstream pricing UI',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await playwright.launch({executablePath:process.env.LOGO_TEST_CHROMIUM,args:chromium.args.filter(a=>!['--single-process','--disable-web-security'].includes(a)),headless:true});
 try{for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());assert.equal(u.origin,'https://preview.vercel.app');requests.push(u.pathname);assert.ok(!u.pathname.startsWith('/api/'),'synthetic review must not call APIs');try{await route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'}[path.extname(u.pathname)],body:await readFile(path.join(process.cwd(),'public',u.pathname))});}catch{await route.fulfill({status:404,body:''});}});
  await page.goto('https://preview.vercel.app/offers/recovery-review.html');
  for(const kind of ['budget','model']){
   await page.locator('#review-'+kind).click();await page.locator('.ob-recovery:not([hidden])').waitFor();
   assert.deepEqual(await page.evaluate(()=>reviewCalls.map(r=>r.action)),['start','advance']);
   assert.ok((await page.locator('.ob-footer>p').textContent()).includes('22,32 / 50,00'));
   if(kind==='budget'){const text=await page.locator('.ob-review-notice').textContent();for(const value of ['5,05','2,68','25,00','27,68'])assert.ok(text.includes(value));}
   await page.locator('.ob-cost-detail summary').click();assert.ok((await page.locator('.ob-cost-copy').textContent()).includes('kesinleşmiş harcama olarak gösterilmez'));
   if(process.env.BHS_TEST_SCREENSHOTS==='1'&&kind==='budget')await page.screenshot({path:'/tmp/bhs-recovery-'+width+'.png'});
   // Two synchronous clicks still authorise a single recovery batch.
   await page.locator('.ob-retry').evaluate(button=>{button.click();button.click();});
   await page.locator('.ob-price:not([hidden])').waitFor();
   assert.deepEqual(await page.evaluate(()=>reviewCalls.map(r=>r.action)),['start','advance','recover','advance']);
   assert.equal(await page.locator('.ob-recovery').isVisible(),false);
   await page.locator('.ob-price').click();assert.equal(await page.locator('.ob-pricing article').count(),2);
   assert.equal(await page.locator('#offer-brief-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
   await page.locator('.ob-edit').click();assert.equal(await page.locator('#ob-goals').inputValue(),'Ölçülebilir büyüme.');
   await page.locator('.ob-close').click();
  }
  assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
