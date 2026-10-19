import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import chromium from '@sparticuz/chromium';
import {chromium as playwright} from 'playwright-core';
import {prepareUploadedLogo} from '../src/upload.mjs';
import {createAuditHandler} from '../api/audit.js';
import {createPricingHandler} from '../api/pricing.js';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';

test('desktop and mobile brief accept unreviewed transparent upload, preserve CRM and show a real missing-connection error',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 const browser=await playwright.launch({args:chromium.args.filter(arg=>!['--disable-web-security','--single-process'].includes(arg)),executablePath:process.env.LOGO_TEST_CHROMIUM,headless:true});
 try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[],auditBodies=[],external=[];
   const handler=createAuditHandler({getProvider:()=>({configured:()=>false})});
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!=='https://preview.vercel.app'){external.push(url.href);return route.abort();}
    if(url.pathname==='/api/logo-upload'){
     const result=await prepareUploadedLogo(request.postDataJSON().image);
     return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
    }
    if(url.pathname==='/api/audit'){
     const body=request.postDataJSON();auditBodies.push(body);
     const result={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(data){this.data=data;return this;}};
     await handler({method:request.method(),headers:{...await request.allHeaders(),host:url.host},body},result);
     return route.fulfill({status:result.statusCode,headers:result.headers,contentType:'application/json',body:JSON.stringify(result.data)});
    }
    try{
     const file=path.join(process.cwd(),'public',url.pathname);
     const body=await readFile(file),ext=path.extname(file),type={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.png':'image/png'}[ext];
     return route.fulfill({contentType:type,body});
    }catch{return route.fulfill({status:404,body:'Not found'});}
   });
   await page.goto('https://preview.vercel.app/offers/preview.html');
   const frame=page.frameLocator('#preview-frame');
   await frame.locator('.offer-create').click();
   const before=await page.frames()[1].evaluate(()=>JSON.stringify(db));
   await frame.locator('#ob-segment').selectOption('corporate');
   await frame.locator('#ob-website').fill('brand.example');
   await frame.locator('#ob-goals').fill('Bayi büyümesi');await frame.locator('#ob-needs').fill('Servis kalitesi');await frame.locator('#ob-services').fill('Growth ve operasyon');
   await frame.locator('#ob-logo-screenshot').setInputFiles(path.join(process.cwd(),'public/examples/logo-white.png'));
   await frame.locator('.ol-result:not([hidden])').waitFor();
   assert.equal(await frame.locator('.ol-review input').count(),0,'No premature logo approval');
   await frame.locator('.ob-next').click();
   await frame.getByText('BHS araştırması tamamlanamadı',{exact:true}).waitFor();
   assert.match(await frame.locator('.ob-review-notice').textContent(),/bağlantısı henüz tanımlı değil/);
   assert.equal(auditBodies.length,1);assert.equal(auditBodies[0].brief.goals,'Bayi büyümesi');
   assert.equal(auditBodies[0].brief.logo,undefined);assert.equal(auditBodies[0].brief.source,undefined);
   assert.equal(await page.frames()[1].evaluate(()=>JSON.stringify(db)),before);
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
   const overflow=await frame.locator('#offer-brief-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1);assert.equal(overflow,false);
   await frame.locator('.ob-edit').click();assert.equal(await frame.locator('#ob-goals').inputValue(),'Bayi büyümesi');
   await context.close();
  }
 }finally{await browser.close();if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});

test('desktop and mobile finish BHS then three real deterministic price alternatives without budget or CRM writes',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 const browser=await playwright.launch({args:chromium.args.filter(arg=>!['--disable-web-security','--single-process'].includes(arg)),executablePath:process.env.LOGO_TEST_CHROMIUM,headless:true});
 try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),actions=[],errors=[],priceActions=[];
  const session='c'.repeat(43),secret='test-ui-pricing-secret';let completeAudit;
  const handler=createPricingHandler({getSecret:()=>secret,getProvider:()=>({configured:()=>true,async planPricing(){return {id:'ui_scope_12345678'};},async poll(){return {status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify({summary:'Görüşmedeki servis ihtiyacına uygun başlangıç.',budget:{posture:'unspecified',quote:null,targetQuote:null,targetScope:'unspecified'},services:[{serviceId:'b2b',phase:'start',priority:1,reason:'Bayi büyümesi hedefi.',briefQuote:'Growth',findingIds:[]}],exclusions:[]})}]}]};}})});
  const {context:fixture}=await import('./fixtures/evidence.mjs');
  const {renderGroundedReport}=await import('../src/bhs/grounded-report.mjs');
  page.setDefaultTimeout(10000);
  const data=fixture().report;data.sources.forEach(s=>s.verification={status:'quote_matched'});data.rawReport=renderGroundedReport(data);data.scoring={total:null};data.quality={checksPassed:true,issues:[],semanticBenchmark:'passed'};
  await context.addInitScript(()=>{const original=setTimeout;window.setTimeout=(fn,ms,...args)=>original(fn,ms===10000?0:ms,...args);});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());assert.equal(url.origin,'https://preview.vercel.app');
   if(url.pathname==='/api/pricing'){
    const body=req.postDataJSON();priceActions.push(body.action);
    const result={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(data){this.data=data;return this;}};
    await handler({method:req.method(),headers:{...await req.allHeaders(),host:url.host},body},result);
    return route.fulfill({status:result.statusCode,headers:result.headers,contentType:'application/json',body:JSON.stringify(result.data)});
   }
   if(url.pathname==='/api/audit'){
    const body=req.postDataJSON();actions.push(body.action);
    const phases=['research','source_plan','synthesis','revision','semantic'];let response;
    if(body.action==='start')response={phase:'research',ticket:'0'};
    else if(body.action==='advance')response={phase:phases[Number(body.ticket)+1],ticket:String(Number(body.ticket)+1)};
    else if(body.ticket==='4'){
     data.briefHash=briefHash(snapshotBrief(body.brief));data.schemaVersion='bhs-v1';data.services=[];
     completeAudit={stage:'audit',status:'ready',data};
     response={phase:'complete',result:completeAudit,pricingProof:createPricingProof(secret).encode({kind:'audit_ready',createdAt:Date.now(),briefHash:data.briefHash,auditHash:digest(completeAudit)},session,url.host)};
    }else response={phase:phases[Number(body.ticket)]+'_complete',ticket:body.ticket,nextAction:'advance'};
    return route.fulfill({headers:{'Set-Cookie':'__Host-offer-research='+session+'; Path=/; Secure; HttpOnly; SameSite=Strict'},contentType:'application/json',body:JSON.stringify(response)});
   }
   if(url.pathname==='/api/logo-upload')return route.fulfill({contentType:'application/json',body:JSON.stringify(await prepareUploadedLogo(req.postDataJSON().image))});
   try{const file=path.join(process.cwd(),'public',url.pathname),body=await readFile(file);return route.fulfill({contentType:{'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png'}[path.extname(file)],body});}catch{return route.fulfill({status:404,body:'Not found'});}
  });
  await page.goto('https://preview.vercel.app/offers/preview.html');const frame=page.frameLocator('#preview-frame');await frame.locator('.offer-create').click();const before=await page.frames()[1].evaluate(()=>JSON.stringify(db));
  await frame.locator('#ob-segment').selectOption('corporate');await frame.locator('#ob-website').fill('brand.example');await frame.locator('#ob-goals').fill('Bayi büyümesi');await frame.locator('#ob-needs').fill('Servis');await frame.locator('#ob-services').fill('Growth');
  await frame.locator('#ob-logo-screenshot').setInputFiles(path.join(process.cwd(),'public/examples/logo-white.png'));await frame.locator('.ol-result:not([hidden])').waitFor();await frame.locator('.ob-next').click();
  await frame.locator('.ob-audit-report').getByText(data.summary,{exact:true}).waitFor();assert.equal(actions.filter(a=>a==='start').length,1);assert.equal(actions.filter(a=>a==='advance').length,4);assert.deepEqual(errors,[]);assert.equal(await page.frames()[1].evaluate(()=>JSON.stringify(db)),before);assert.equal(await frame.locator('#offer-brief-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await frame.locator('.ob-price').click();await frame.getByText('Fiyat alternatifleri hazır',{exact:true}).waitFor();
  assert.equal(await frame.locator('.ob-pricing article').count(),3);assert.equal(priceActions.filter(a=>a==='start').length,1);assert.ok(priceActions.includes('status'));
  assert.match(await frame.locator('.ob-pricing').textContent(),/40.000/);assert.equal(await page.frames()[1].evaluate(()=>JSON.stringify(db)),before);assert.deepEqual(errors,[]);
  assert.equal(await frame.locator('#offer-brief-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await frame.locator('.ob-edit').click();assert.equal(await frame.locator('#ob-budget').inputValue(),'');assert.equal(await frame.locator('.ob-pricing').isVisible(),false);assert.equal(await frame.locator('.ob-price').isVisible(),false);
  await context.close();
 }}finally{await browser.close();if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
