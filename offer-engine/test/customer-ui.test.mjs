import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium as playwright} from 'playwright-core';
import chromium from '@sparticuz/chromium';
import {addQuote} from '../src/pricing/currency.mjs';
import {createOfferHandler} from '../api/offer.js';
test('customer portal verifies password, preserves chosen monthly amount and opens a draft to both addresses without storing credentials',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 const browser=await playwright.launch({args:chromium.args.filter(a=>!['--disable-web-security','--single-process'].includes(a)),executablePath:process.env.LOGO_TEST_CHROMIUM,headless:true});
 try{for(const {width,currency} of [1024,390].flatMap(width=>['TRY','USD'].map(currency=>({width,currency})))){
  const doc=JSON.parse(await readFile('public/examples/proposal.json','utf8')).document,token='t'.repeat(43),password='test-secret-password',offer={id:'18ea21ba-f110-468c-9990-6b94e95d30be',version:3,customer_document:doc};
  if(currency==='USD')doc.quote=addQuote({data:doc},{currency:'USD',exchangeRate:{provider:'TCMB',kind:'ForexSelling',base:'USD',quote:'TRY',rate:44.1234,publishedAt:'2026-10-21',checkedAt:'2026-10-21T17:00:00.000Z',source:'https://www.tcmb.gov.tr/kurlar/today.xml'}}).data.quote;
  const errors=[],actions=[];
  const store={configured:()=>true,portalConfigured:()=>true,async access(t,p){if(t!==token||p!==password)throw Error('Teklif bağlantısı veya şifresi doğrulanamadı.');return offer;}};
  const handler=createOfferHandler({getStore:()=>store,getPortalSecret:()=>'s'.repeat(32)});
  const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.mailDrafts=[];document.addEventListener('click',e=>{const a=e.target.closest('a');if(a?.href.startsWith('mailto:')){e.preventDefault();window.mailDrafts.push(a.href);}},true);});
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());assert.equal(url.origin,'https://preview.vercel.app');
   if(url.pathname==='/api/offer'){actions.push(req.postDataJSON().action);
    const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}};
    await handler({method:'POST',headers:{...await req.allHeaders(),host:url.host},body:req.postDataJSON()},res);
    return route.fulfill({status:res.statusCode,headers:res.headers,contentType:'application/json',body:JSON.stringify(res.data)});
   }
   try{const file=path.join(process.cwd(),'public',url.pathname);return route.fulfill({contentType:{'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(file)],body:await readFile(file)});}catch{return route.fulfill({status:404,body:'Not found'});}
  });
  await page.goto('https://preview.vercel.app/offers/customer.html#'+token);assert.equal(new URL(page.url()).hash,'');
  await page.locator('[name=password]').fill('wrong');await page.locator('#portal-login button').click();await page.getByText('Teklif bağlantısı veya şifresi doğrulanamadı.',{exact:true}).waitFor();assert.equal(await page.locator('.so-option').count(),0);
  await page.locator('[name=password]').fill(password);await page.locator('#portal-login button').click();await page.locator('.so-option').first().waitFor();
  await page.locator('.so-option').nth(1).click();if(currency==='USD'){await page.locator('.so-options').scrollIntoViewIfNeeded();if(process.env.OFFER_TEST_SCREENSHOTS==='1')await page.screenshot({path:'/workspace/scratch/28851c4d6589/customer-usd-'+width+'.png'});}await page.locator('#so-request-open').click();await page.locator('[name=name]').fill('Müşteri Yetkilisi');await page.locator('[name=email]').fill('yetkili@example.com');await page.locator('#so-request-form [type=submit]').click();await page.getByText('Gönderimi e-posta uygulamanızdaki taslaktan tamamlayın.',{exact:true}).waitFor();
  const drafts=await page.evaluate(()=>window.mailDrafts);assert.equal(drafts.length,1);const mail=new URL(drafts[0]),body=mail.searchParams.get('body');
  assert.equal(mail.pathname,'yigit@sellfmedia.com,businessdevelopment@sellfmedia.com');assert.ok(body.includes('v3'));assert.ok(body.includes(new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(currency==='USD'?doc.quote.alternatives[1].monthlyAmount:doc.alternatives[1].monthlyAmount)+' '+(currency==='USD'?'USD':'TL')+' / ay'));assert.ok(body.includes('https://preview.vercel.app/offers/customer.html#'+token));assert.ok(!body.includes(password));assert.deepEqual(actions,['access','access']);
  await page.locator('.so-option').first().click();assert.equal(await page.locator('.so-mailto-reopen').count(),0);await page.locator('#so-request-form [type=submit]').click();assert.equal((await page.evaluate(()=>window.mailDrafts)).length,2);
  assert.deepEqual(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}})),{local:{},session:{}});assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.close();
 }}finally{await browser.close();if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
