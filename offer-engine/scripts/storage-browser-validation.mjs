// Explicit local diagnostic: real isolated DB/Auth, synthetic BHS/model output,
// intercepted native mailto launch. Never auto-run by build/test, never send real email.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {chromium as playwright} from 'playwright-core';
import chromium from '@sparticuz/chromium';
import {createPreviewSessionHandler} from '../api/preview-session.js';
import {createOfferHandler} from '../api/offer.js';
import {createPricingHandler} from '../api/pricing.js';
import {createProposalHandler} from '../api/proposal.js';
import {prepareUploadedLogo} from '../src/upload.mjs';
import {logoProof} from '../src/proposal/logo-proof.mjs';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {briefHash,snapshotBrief} from '../src/bhs/brief.mjs';
import {context as auditFixture} from '../test/fixtures/evidence.mjs';
if(process.env.VERCEL_ENV!=='preview'||process.env.OFFER_PREVIEW_MODE!=='true')throw Error('Isolated preview required.');
const output={kind:'browser-real-preview-db-synthetic-models',passed:false,realDatabase:true,geminiCalls:0,realMailSends:0,mailTransport:'mailto',checks:[]};
const host='preview.vercel.app';process.env.VERCEL_URL=host;const origin='https://'+host,secret=process.env.OFFER_GEMINI_API_KEY,research=randomBytes(32).toString('base64url');
let modelBrief,published,customerDocument,browser;
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}};}
const sessions=createPreviewSessionHandler();
const offers=createOfferHandler();
const pricing=createPricingHandler({getProvider:()=>({configured:()=>true,async planPricing(brief){modelBrief=brief;return {id:'browser_scope_12345678'};},async poll(){return {status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify({summary:'Sentetik test kapsamı.',budget:{posture:'unspecified',quote:null,targetQuote:null,targetScope:'unspecified'},services:['meta','google_ads','design'].map(serviceId=>({serviceId,phase:'start',priority:1,reason:'Konuşulan test kapsamı.',briefQuote:modelBrief.services,findingIds:['f0']})),exclusions:[]})}]}]};}})});
const proposals=createProposalHandler({getProvider:()=>({configured:()=>true,async composeProposal(){return {id:'browser_proposal_12345678'};},async poll(){return {status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify({headline:'Net hedefler.',accent:'Birlikte büyüme.',subtitle:'Seçili kanalları ölçüm ve uygulamayla geliştiren işbirliği önerimiz.',findingIds:['f0']})}]}]};}})});
try{
 output.phase='browser_launch';browser=await playwright.launch({args:chromium.args.filter(a=>!['--disable-web-security','--single-process'].includes(a)),executablePath:process.env.LOGO_TEST_CHROMIUM||await chromium.executablePath(),headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[];await context.addInitScript(()=>{window.mailDrafts=[];document.addEventListener('click',e=>{const a=e.target.closest('a');if(a?.href.startsWith('mailto:')){e.preventDefault();window.mailDrafts.push(a.href);}},true);});context.on('page',page=>{page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
  const headers={...await req.allHeaders(),host},body=req.method()==='POST'?req.postDataJSON():undefined;
  const api={'/api/preview-session':sessions,'/api/offer':offers,'/api/pricing':pricing,'/api/proposal':proposals}[url.pathname];
  if(api){const res=response();await api({method:req.method(),headers,body},res);if(url.pathname==='/api/offer'&&body?.action==='publish'&&res.statusCode===200)published=res.data;if(url.pathname==='/api/offer'&&body?.action==='access'&&res.statusCode===200)customerDocument=res.data.document;if(body?.action==='request')throw Error('unexpected_server_mail_request');return route.fulfill({status:res.statusCode,headers:res.headers,contentType:'application/json',body:JSON.stringify(res.data)});}
  if(url.pathname==='/api/logo-upload'){const data=await prepareUploadedLogo(body.image);return route.fulfill({contentType:'application/json',body:JSON.stringify({...data,logoProof:logoProof(secret,host,data)})});}
  if(url.pathname==='/api/audit'){
   const data=auditFixture().report;Object.assign(data,{schemaVersion:'bhs-v1',briefHash:briefHash(snapshotBrief(body.brief)),services:[],summary:'Sentetik tarayıcı testi BHS verisi.',quality:{checksPassed:true,semanticBenchmark:'passed',issues:[]},scoring:{total:null,note:'Test verilerinden puan üretilmez.'},rawReport:'Sentetik test raporudur; gerçek marka araştırması değildir.'});data.sources.forEach(s=>s.verification={status:'quote_matched'});
   const result={stage:'audit',status:'ready',data};return route.fulfill({headers:{'Set-Cookie':'__Host-offer-research='+research+'; Path=/; Secure; HttpOnly; SameSite=Strict'},contentType:'application/json',body:JSON.stringify({phase:'complete',result,pricingProof:createPricingProof(secret).encode({kind:'audit_ready',createdAt:Date.now(),briefHash:data.briefHash,auditHash:digest(result)},research,host)})});
  }
  try{const file=path.join(process.cwd(),'public',url.pathname);return route.fulfill({contentType:{'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json'}[path.extname(file)],body:await readFile(file)});}catch{return route.fulfill({status:404,body:'Not found'});}
 });
 const page=await context.newPage();output.phase='open_test_workspace';await page.goto(origin+'/offers/preview.html?storage=1');await page.getByRole('button',{name:'Test alanını aç',exact:true}).click();const frame=page.frameLocator('#preview-frame');await frame.locator('.offer-create').click();output.checks.push('browser_real_test_session');
 await frame.locator('#ob-segment').selectOption('corporate');await frame.locator('#ob-website').fill('brand.example');await frame.locator('#ob-goals').fill('Ölçümlü bayi büyümesi');await frame.locator('#ob-needs').fill('Servis ve edinim akışını iyileştirme');await frame.locator('#ob-services').fill('Meta, Google Ads ve tasarım');await frame.locator('#ob-logo-screenshot').setInputFiles('public/examples/logo-white.png');await frame.locator('.ol-result:not([hidden])').waitFor();
 output.phase='compose';await frame.locator('.ob-next').click();await frame.getByText('Ön BHS araştırması hazır',{exact:true}).waitFor();await frame.locator('.ob-price').click();await frame.getByText('Fiyat alternatifleri hazır',{exact:true}).waitFor();await frame.locator('.ob-compose').click();await frame.getByText('Teklif taslağı hazır',{exact:true}).waitFor();output.checks.push('logo_bhs_price_proposal_ui');
 output.phase='save';await frame.locator('.ob-logo-approved').check();await frame.locator('.ob-scope-approved').check();await frame.locator('.ob-save').click();await frame.locator('.ob-save-status').filter({hasText:'kaydedildi'}).waitFor();output.checks.push('browser_saves_real_version_and_card_value');
 output.phase='publish';await frame.locator('.ob-publish').click();await frame.locator('.ob-save-status').filter({hasText:'Müşteri bağlantısı:'}).waitFor();if(!published?.password)throw Error('published_credentials_missing');
 const customer=await context.newPage();await customer.goto(published.url);if(new URL(customer.url()).hash)throw Error('fragment_not_cleared');await customer.locator('[name=password]').fill('wrong');await customer.locator('#portal-login button').click();await customer.getByText('Teklif bağlantısı veya şifresi doğrulanamadı.',{exact:true}).waitFor();await customer.locator('[name=password]').fill(published.password);await customer.locator('#portal-login button').click();await customer.locator('.so-option').first().waitFor();output.checks.push('real_persisted_password_portal');
 output.phase='contract';await customer.locator('.so-option').nth(1).click();await customer.locator('#so-request-open').click();await customer.locator('[name=name]').fill('Sentetik Tarayıcı Testi');await customer.locator('[name=email]').fill('browser@example.invalid');await customer.locator('#so-request-form [type=submit]').click();await customer.getByText('Gönderimi e-posta uygulamanızdaki taslaktan tamamlayın.',{exact:true}).waitFor();const drafts=await customer.evaluate(()=>window.mailDrafts);assert.equal(drafts.length,1);const mail=new URL(drafts[0]),text=mail.searchParams.get('body');assert.equal(mail.pathname,'yigit@sellfmedia.com,businessdevelopment@sellfmedia.com');assert.ok(text.includes(published.url));assert.ok(!text.includes(published.password));assert.ok(text.includes(new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(customerDocument.alternatives[1].monthlyAmount)+' TL / ay'));output.checks.push('selected_saved_offer_native_mailto_draft_no_backend_send');
 output.phase='resume';await page.setViewportSize({width:390,height:844});await page.reload();await frame.locator('.offer-view:not([hidden])').waitFor();const link=await frame.locator('.offer-details dd').nth(1).locator('a').getAttribute('href');if(link!==published.url||await frame.locator('.offer-details dd').nth(2).textContent()!==published.password)throw Error('owner_link_recovery_failed');await frame.locator('.offer-view').click();await frame.locator('#offer-saved-dialog .so-option').first().waitFor();if(await frame.locator('#offer-saved-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1))throw Error('mobile_saved_offer_overflow');output.checks.push('mobile_reload_restores_saved_document_and_private_link');
 if(errors.length)throw Error('browser_runtime_errors');output.passed=true;output.phase='complete';
}catch(error){output.failure=String(error.message||'browser_validation_failed').split('\n')[0].replace(/https?:\/\/\S+/g,'[url]').slice(0,200);}
finally{if(browser)await browser.close();await writeFile('public/storage-browser-validation.json',JSON.stringify(output,null,2));console.log(JSON.stringify({storageBrowserValidation:output.passed,phase:output.phase}));}
