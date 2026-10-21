import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium as playwright} from 'playwright-core';
import chromium from '@sparticuz/chromium';
import {createPortalHandler} from '../../offerletter/api/offer.js';
import {createOfferHandler} from '../api/offer.js';
const response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}});

test('Offerletter slug flows through the customer-only proxy and Pipeline password check into the original proposal',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const before=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 const browser=await playwright.launch({args:chromium.args.filter(a=>!['--disable-web-security','--single-process'].includes(a)),executablePath:process.env.LOGO_TEST_CHROMIUM,headless:true});
 try{
  const document=JSON.parse(await readFile('public/examples/proposal.json','utf8')).document,slug='synthetic-brand-teklifi',password='synthetic-password',actions=[];
  const upstream=createOfferHandler({getStore:()=>({configured:()=>true,portalConfigured:()=>true,async accessSlug(s,p){assert.equal(s,slug);if(p!==password)throw Error('Wrong password');return {id:'synthetic-offer',version:1,customer_document:document};}}),getPortalSecret:()=>'s'.repeat(32)});
  const proxy=createPortalHandler({fetchImpl:async(url,init)=>{
   assert.equal(url,'https://sales.sellfmedia.com/api/offer');const res=response();
   await upstream({method:'POST',headers:{host:'sales.sellfmedia.com',origin:init.headers.Origin},body:JSON.parse(init.body)},res);
   return {ok:res.statusCode===200,status:res.statusCode,json:async()=>res.data};
  }});
  const config=JSON.parse(await readFile(new URL('../../offerletter/vercel.json',import.meta.url),'utf8')),csp=config.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.drafts=[];document.addEventListener('click',event=>{const a=event.target.closest('a');if(a?.href.startsWith('mailto:')){event.preventDefault();window.drafts.push(a.href);}},true);});
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());assert.equal(url.origin,'https://offerletter.sellfmedia.com');
   if(url.pathname==='/api/offer'){
    const res=response();actions.push(req.postDataJSON().action);await proxy({method:'POST',headers:{...await req.allHeaders(),host:url.host},body:req.postDataJSON()},res);
    return route.fulfill({status:res.statusCode,contentType:'application/json',headers:res.headers,body:JSON.stringify(res.data)});
   }
   const file=url.pathname==='/'+slug?'/offers/customer.html':url.pathname;
   return route.fulfill({headers:{'Content-Security-Policy':csp},contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css'}[path.extname(file)],body:await readFile(new URL('../../'+file.slice(1),import.meta.url))});
  });
  await page.goto('https://offerletter.sellfmedia.com/'+slug);
  await page.locator('[name=password]').fill('wrong');await page.locator('#portal-login button').click();await page.getByText('Teklif bağlantısı veya şifresi doğrulanamadı.',{exact:true}).waitFor();assert.equal(await page.locator('.so-option').count(),0);
  await page.locator('[name=password]').fill(password);await page.locator('#portal-login button').click();await page.locator('.so-option').first().waitFor();
  assert.equal(page.url(),'https://offerletter.sellfmedia.com/'+slug);
  await page.locator('#so-request-open').click();await page.locator('[name=name]').fill('Synthetic user');await page.locator('[name=email]').fill('test@example.invalid');await page.locator('#so-request-form [type=submit]').click();
  const drafts=await page.evaluate(()=>window.drafts);assert.equal(drafts.length,1);const body=new URL(drafts[0]).searchParams.get('body');assert.ok(body.includes('https://offerletter.sellfmedia.com/'+slug));assert.ok(!body.includes(password));
  assert.deepEqual(actions,['access','access']);assert.deepEqual(errors,[]);await page.close();
 }finally{await browser.close();if(before===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=before;}
});
