import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium as playwright} from 'playwright-core';
import chromium from '@sparticuz/chromium';

test('every saved card opens its persisted draft before publication and recovers its customer link on desktop/mobile',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await playwright.launch({args:chromium.args.filter(a=>!['--disable-web-security','--single-process'].includes(a)),executablePath:process.env.LOGO_TEST_CHROMIUM,headless:true});
 const script=await readFile(new URL('../../offers/card-section.js',import.meta.url),'utf8'),renderer=await readFile(new URL('../../offers/proposal.js',import.meta.url),'utf8');
 const document=JSON.parse(await readFile('public/examples/proposal.json','utf8')).document;
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<div id="card"></div>');await page.addScriptTag({content:renderer});await page.addScriptTag({content:script});
  await page.evaluate(()=>{
   window.calls=[];window.stored=null;window.failPublish=true;
   window.PipelineOfferRequest=async request=>{window.calls.push(request);if(request.action==='list')return {offers:window.stored?[structuredClone(window.stored)]:[]};if(request.action!=='publish')throw Error('Unexpected action');if(window.failPublish)throw Error('Geçici bağlantı hatası.');window.stored={...window.stored,state:'published',publicUrl:'https://offerletter.sellfmedia.com/synthetic-brand-teklifi',password:'synthetic-password'};return {url:window.stored.publicUrl,password:window.stored.password};};
   window.PipelineOffers.mount(window.document.querySelector('#card'),{lead:{id:'synthetic-lead'},spaceId:'synthetic-space'});
  });
  assert.equal(await page.locator('.offer-view').isVisible(),false);
  await page.evaluate(document=>{
   window.stored={id:'synthetic-offer',version:1,state:'draft',monthly_amount:12345,customer_document:document};
   window.dispatchEvent(new CustomEvent('pipeline-offer-saved',{detail:{leadId:'synthetic-lead',spaceId:'synthetic-space',offer:{id:'synthetic-offer',version:1,state:'draft',monthlyAmount:12345}}}));
  },document);
  await page.getByRole('button',{name:'Kaydedilen teklifi gör',exact:true}).waitFor();await page.getByRole('button',{name:'Taslağı yayınla',exact:true}).waitFor();
  assert.equal(await page.locator('.offer-details a').count(),0);
  await page.locator('.offer-view').click();await page.locator('#offer-saved-dialog .so-option').first().waitFor();await page.getByRole('button',{name:'Karta dön',exact:true}).click();
  await page.locator('.offer-publish').click();await page.getByText('Geçici bağlantı hatası.',{exact:true}).waitFor();assert.equal(await page.locator('.offer-view').isVisible(),true);
  await page.evaluate(()=>window.failPublish=false);await page.locator('.offer-publish').click();await page.getByText('Yayınlandı',{exact:true}).waitFor();
  assert.equal(await page.locator('.offer-details a').getAttribute('href'),'https://offerletter.sellfmedia.com/synthetic-brand-teklifi');assert.equal(await page.locator('.offer-publish').isVisible(),false);
  await page.evaluate(()=>{window.document.querySelector('#card').remove();const card=window.document.createElement('div');window.document.body.append(card);window.PipelineOffers.mount(card,{lead:{id:'synthetic-lead'},spaceId:'synthetic-space'});});
  await page.locator('.offer-details a').waitFor();assert.equal(await page.locator('.offer-details dd').nth(2).textContent(),'synthetic-password');
  assert.deepEqual(await page.evaluate(()=>window.stored.customer_document),document);
  assert.ok((await page.evaluate(()=>window.calls)).every(call=>['list','publish'].includes(call.action)));assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
