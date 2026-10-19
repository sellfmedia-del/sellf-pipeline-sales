import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium as playwright} from 'playwright-core';
import chromium from '@sparticuz/chromium';
import {createOfferHandler} from '../api/offer.js';
import {createContractMailer,contractRecipients} from '../src/proposal/mail.mjs';
test('customer portal verifies password, preserves chosen monthly amount and notifies both addresses without storing credentials',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 const browser=await playwright.launch({args:chromium.args.filter(a=>!['--disable-web-security','--single-process'].includes(a)),executablePath:process.env.LOGO_TEST_CHROMIUM,headless:true});
 try{for(const width of [1024,390]){
  const doc=JSON.parse(await readFile('public/examples/proposal.json','utf8')).document,token='t'.repeat(43),password='test-secret-password',offer={id:'18ea21ba-f110-468c-9990-6b94e95d30be',version:3,customer_document:doc};
  let mail,row;const errors=[];
  const store={configured:()=>true,portalConfigured:()=>true,async access(t,p){if(t!==token||p!==password)throw Error('Teklif bağlantısı veya şifresi doğrulanamadı.');return offer;},async queue(o,input,payload){row={id:input.requestId,mail_payload:payload,delivery_state:'pending'};return row;},async claim(){return true;},async mark(id,state){row.delivery_state=state;}};
  const mailer=createContractMailer({key:'fake',from:'Sellf <offers@sellfmedia.com>',fetchImpl:async(url,init)=>{mail=JSON.parse(init.body);return {ok:true,json:async()=>({id:'fake-accepted-id'})};}});
  const handler=createOfferHandler({getStore:()=>store,getMailer:()=>mailer,getPortalSecret:()=>'s'.repeat(32)});
  const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());assert.equal(url.origin,'https://preview.vercel.app');
   if(url.pathname==='/api/offer'){
    const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}};
    await handler({method:'POST',headers:{...await req.allHeaders(),host:url.host},body:req.postDataJSON()},res);
    return route.fulfill({status:res.statusCode,headers:res.headers,contentType:'application/json',body:JSON.stringify(res.data)});
   }
   try{const file=path.join(process.cwd(),'public',url.pathname);return route.fulfill({contentType:{'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(file)],body:await readFile(file)});}catch{return route.fulfill({status:404,body:'Not found'});}
  });
  await page.goto('https://preview.vercel.app/offers/customer.html#'+token);assert.equal(new URL(page.url()).hash,'');
  await page.locator('[name=password]').fill('wrong');await page.locator('#portal-login button').click();await page.getByText('Teklif bağlantısı veya şifresi doğrulanamadı.',{exact:true}).waitFor();assert.equal(await page.locator('.so-option').count(),0);
  await page.locator('[name=password]').fill(password);await page.locator('#portal-login button').click();await page.locator('.so-option').first().waitFor();
  await page.locator('.so-option').nth(1).click();await page.locator('#so-request-open').click();await page.locator('[name=name]').fill('Müşteri Yetkilisi');await page.locator('[name=email]').fill('yetkili@example.com');await page.locator('#so-request-form [type=submit]').click();await page.getByText('Sözleşme talebiniz Sellf ekibine iletildi.',{exact:true}).waitFor();
  assert.deepEqual(mail.to,contractRecipients);assert.ok(mail.text.includes('v3'));assert.ok(mail.text.includes(doc.alternatives[1].monthlyAmount+' TRY'));assert.equal(row.delivery_state,'accepted');
  assert.deepEqual(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}})),{local:{},session:{}});assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.close();
 }}finally{await browser.close();if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
