import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium as playwright} from 'playwright-core';
import chromium from '@sparticuz/chromium';

test('normal preview entry opens the original Pipeline board, then the clicked test card and offer brief, without a demo toolbar',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await playwright.launch({args:chromium.args.filter(a=>!['--disable-web-security','--single-process'].includes(a)),executablePath:process.env.LOGO_TEST_CHROMIUM,headless:true});
 try{for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[],actions=[];
  const fixture={user:{id:'test-user'},rows:{spaces:[{id:'test-space',name:'Teklif Test Alanı',color:'#378ADD',created_at:Date.now()}],columns:[{id:'test-column',space_id:'test-space',title:'Teklif Aşamasında',dot:'#BA7517'}],leads:[{id:'test-lead',space_id:'test-space',col_id:'test-column',company:'Test Marka',name:'Test Yetkilisi',value:'',notes:'Toplantı bağlamı korunmalı.',contacts:[],timeline:[]}]}};
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());assert.equal(url.origin,'https://preview.vercel.app');
   if(url.pathname==='/api/preview-session'){
    actions.push(req.method());if(req.method()==='POST')assert.deepEqual(req.postDataJSON(),{action:'start'});
    return route.fulfill({contentType:'application/json',body:JSON.stringify(req.method()==='GET'?{ready:false}:{ready:true,fixture})});
   }
   if(url.pathname==='/api/offer'){assert.equal(req.postDataJSON().action,'list');return route.fulfill({contentType:'application/json',body:'{"offers":[]}'});}
   const file=path.join(process.cwd(),'public',url.pathname);return route.fulfill({contentType:{'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(file)],body:await readFile(file)});
  });
  await page.goto('https://preview.vercel.app/offers/preview.html');
  await page.getByRole('button',{name:'Test alanını aç',exact:true}).waitFor();assert.deepEqual(actions,['GET']);
  await page.getByRole('button',{name:'Test alanını aç',exact:true}).click();
  const frame=page.frameLocator('#preview-frame');await frame.locator('.card').waitFor();
  assert.equal(await page.locator('header,nav,[data-logo-example],[data-preview-width]').count(),0);
  assert.equal(await frame.locator('.column').count(),5);assert.equal(await frame.locator('#overlay').evaluate(el=>el.classList.contains('open')),false);
  assert.equal(await page.locator('#preview-frame').evaluate(el=>Math.abs(el.getBoundingClientRect().height-innerHeight)<=1),true);
  await page.screenshot({path:'/workspace/scratch/5e08853fbefb/pipeline-board-entry-'+width+'.png'});
  await frame.locator('.card').click();await frame.getByRole('button',{name:'Teklif Oluştur',exact:true}).click();
  assert.equal(await frame.locator('#ob-brandName').inputValue(),'Test Marka');assert.match(await frame.locator('#ob-meetingNotes').inputValue(),/Toplantı bağlamı korunmalı/);
  assert.equal(await frame.locator('#ob-logo-screenshot').isVisible(),true);assert.equal(await frame.locator('.ob-save').isVisible(),false);
  assert.deepEqual(actions,['GET','POST']);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();}
});
