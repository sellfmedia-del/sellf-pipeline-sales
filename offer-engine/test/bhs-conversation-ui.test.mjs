import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import chromium from '@sparticuz/chromium';
import {chromium as playwright} from 'playwright-core';

test('whole BHS narrative, SWOT, tables and sources render safely on desktop and mobile while explicit services stay available',
 {skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await playwright.launch({executablePath:process.env.LOGO_TEST_CHROMIUM,args:chromium.args.filter(arg=>!['--single-process','--disable-web-security'].includes(arg)),headless:true});
 try{for(const width of [1280,820,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());assert.equal(url.origin,'https://preview.vercel.app');assert.ok(!url.pathname.startsWith('/api/'));
   try{let body=await readFile(path.join(process.cwd(),'public',url.pathname));
    if(url.pathname.endsWith('conversation-review-data.json')){const data=JSON.parse(body);data.audit.data.fullReport+='\n<script>window.unsafeReport=true</script>';body=JSON.stringify(data);}
    await route.fulfill({body,contentType:{'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json'}[path.extname(url.pathname)]});
   }catch{await route.fulfill({status:404,body:''});}
  });
  await page.goto('https://preview.vercel.app/offers/conversation-review.html');await page.waitForFunction(()=>typeof window.PipelineAuditRequest==='function');
  await page.locator('#review-conversation').click();await page.locator('.ob-price:not([hidden])').waitFor();
  const view=page.locator('.ob-conversation-report');assert.match(await view.innerText(),/SWOT/);assert.match(await view.innerText(),/Amazon partnerinin mevcut olması/);
  assert.equal(await view.locator('table').count(),1);assert.equal(await view.locator('a').count(),4);
  assert.match(await view.innerText(),/Örnek Rakip/);assert.match(await view.innerText(),/Uzman mağaza ve pazaryerinde/);
  assert.equal(await page.locator('#ob-review-title').innerText(),'BHS analizi hazır');
  assert.equal(await page.evaluate(()=>window.unsafeReport),undefined);assert.equal(await view.locator('script').count(),0);
  assert.equal(await page.locator('#offer-brief-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  assert.deepEqual(await page.evaluate(()=>reviewCalls),[{action:'start'}]);assert.deepEqual(errors,[]);
  if(width===390)await page.screenshot({path:'/tmp/bhs-conversation-mobile.png',fullPage:true});
  await page.locator('.ob-close').click();await page.locator('#review-conversation-partial').click();await page.locator('.ob-price:not([hidden])').waitFor();
  assert.match(await page.locator('#ob-review-title').innerText(),/Kısmi/);assert.match(await page.locator('.ob-conversation-report').innerText(),/Öncelikli aksiyonlar/);
  await page.close();
 }}finally{await browser.close();}
});
