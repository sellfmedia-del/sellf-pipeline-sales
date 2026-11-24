import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium as playwright} from 'playwright-core';
import chromium from '@sparticuz/chromium';
import {chooseCost} from './helpers/cost-picker.mjs';
const launch=()=>playwright.launch({args:chromium.args.filter(a=>!['--disable-web-security','--single-process'].includes(a)),executablePath:process.env.LOGO_TEST_CHROMIUM,headless:true});
const screenshotDir=path.resolve('../qa/all-costs');
async function setup(browser,width,currency='TRY',{height=960,hasTouch=false,fallbackPicker=false,query=''}={}){
 const page=await browser.newPage({viewport:{width,height},hasTouch}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(fallbackPicker)await page.addInitScript(()=>Object.defineProperty(HTMLElement.prototype,'showPopover',{value:undefined}));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());assert.equal(u.origin,'https://preview.vercel.app');assert.ok(!u.pathname.startsWith('/api/'),'no real API calls in synthetic preview');try{await route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'}[path.extname(u.pathname)],body:await readFile(path.join(process.cwd(),'public',u.pathname))});}catch{await route.fulfill({status:404,body:'Missing review file'});}});
 await page.goto('https://preview.vercel.app/offers/monthly-review.html'+query);await page.waitForFunction(()=>window.monthlyReviewReady===true);
 page.setDefaultTimeout(10000);
 const before=await page.evaluate(()=>({rows:structuredClone(reviewRows),lead:structuredClone(reviewLead)}));
 await page.locator('.offer-create').click();assert.equal(await page.locator('.ob-service-selection').isVisible(),false);
 if(query==='?saved-bhs'){
  await page.locator('#ob-segment').selectOption('corporate');
  await page.locator('#ob-website').fill('example.com');
 }
 await page.locator('#ob-goals').fill('Ölçülebilir büyüme');await page.locator('#ob-needs').fill('Kapsam ve ekipleri ay ay seçmek');await page.locator('#ob-services').fill('Tüm hizmetleri otomatik ekle, Account ve Growth ekle');await page.locator('#ob-currency').selectOption(currency);
 await page.locator('.ob-next').click();await page.locator('.ob-standard-editor .ob-service-trigger').first().waitFor();
 return {page,errors,before};
}
const growth='.ob-standard-editor [data-alternative=growth_operations]',ops='.ob-standard-editor [data-alternative=operations_bundle]';
test('a saved BHS survives a tablet reload before the first offer and restores service selection without research',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await launch();
 try{
  const {page,errors}=await setup(browser,1180,'TRY',{height:820,hasTouch:true,query:'?saved-bhs'});
  await page.getByText('BHS bu karta kaydedildi.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>reviewRows.length),0);
  assert.equal(await page.evaluate(()=>reviewCalls.filter(call=>call.kind==='audit').length),1);
  await page.reload();
  await page.getByRole('button',{name:'Kayıtlı BHS’yi kullan',exact:true}).tap();
  assert.equal(await page.locator('#ob-goals').inputValue(),'Ölçülebilir büyüme');
  assert.equal(await page.locator('#ob-services').inputValue(),'Tüm hizmetleri otomatik ekle, Account ve Growth ekle');
  await page.getByRole('button',{name:'Kayıtlı BHS ile Devam Et',exact:true}).tap();
  await page.getByText('Kayıtlı BHS yüklendi. Ek BHS maliyeti 0 TL.',{exact:true}).waitFor();
  const group=page.locator(growth).locator('[data-cost-group=services]');
  await group.locator('.ob-service-trigger').tap();
  await group.locator('input[value=account]').tap();
  await group.getByRole('button',{name:'Tamam',exact:true}).tap();
  await page.locator('.ob-price').tap();
  await page.locator('.ob-pricing').waitFor();
  assert.equal(await page.evaluate(()=>reviewCalls.filter(call=>call.kind==='audit').length),0);
  assert.equal(await page.evaluate(()=>reviewCalls.filter(call=>call.action==='saved-prepare').length),1);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
async function compose(page){await page.locator('.ob-price').click();await page.locator('.ob-compose').waitFor();await page.locator('.ob-compose').click();await page.locator('.ob-proposal:not([hidden])').waitFor();}
async function save(page){await page.locator('.ob-logo-approved').check();await page.locator('.ob-scope-approved').check();await page.locator('.ob-save').click();await page.getByText('Teklif v3 kaydedildi. Önceki teklif ve kart değeri korundu.',{exact:true}).waitFor();}

test('the calendar checkbox is optional in retainer and month-by-month proposals',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await launch();
 try{for(const [width,monthly] of [[1280,false],[390,true]]){
  const {page,errors}=await setup(browser,width);
  const toggle=page.getByRole('checkbox',{name:'BHS aksiyon planını teklif takvimine ekle'});
  assert.equal(await toggle.isVisible(),false);
  if(monthly){
   await page.locator('.ob-monthly-toggle').check();
   await page.locator('[data-month="1"] .ob-service-trigger').first().waitFor();
   await chooseCost(page,'[data-month="1"]','account');
   await page.getByRole('button',{name:'Ay ekle',exact:true}).click();
   await chooseCost(page,'[data-month="2"]','email_marketing');
  }else{
   await chooseCost(page,growth,'email_marketing');
   await chooseCost(page,ops,'b2b');
  }
  await page.locator('.ob-price').click();
  await toggle.waitFor();
  assert.equal(await toggle.isChecked(),false);
  await page.locator('.ob-compose').click();await page.locator('.ob-proposal:not([hidden])').waitFor();
  const plainPrices=await page.locator('.so-options').textContent();
  assert.equal(await page.locator('#so-track').getByText(/BHS önerisi/).count(),0);

  await toggle.check();
  await page.locator('.ob-compose').click();await page.locator('.ob-proposal:not([hidden])').waitFor();
  assert.equal(await page.locator('.so-options').textContent(),plainPrices);
  assert.match(await page.locator('#so-track').textContent(),/BHS önerisi.*üyelik yenileme/);
  if(monthly)assert.match(await page.locator('#so-track .so-step').nth(1).textContent(),/2\. ay.*BHS önerisi/);
  else{
   await page.locator('.so-option').nth(1).click();
   assert.match(await page.locator('#so-track').textContent(),/Kurumsal seyahat yöneticileri/);
   assert.doesNotMatch(await page.locator('#so-track').textContent(),/üyelik yenileme/);
  }
  assert.deepEqual(await page.evaluate(()=>reviewCalls.filter(call=>call.proposalProof).map(call=>call.bhsCalendar??false)),[false,true]);
  assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});

test('desktop/mobile: all sheet rows in compact searchable popups; independent costs, remove/recalculate without BHS, save/publish/reopen, old offers intact',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await launch();await mkdir(screenshotDir,{recursive:true});try{for(const width of [1440,390]){
  const {page,errors,before}=await setup(browser,width);assert.equal(await page.locator('.ob-monthly-toggle').isChecked(),false);
  assert.equal(await page.locator('.ob-standard-editor .ob-service-trigger').count(),3);assert.equal(await page.locator('.ob-standard-editor .ob-service-menu:visible').count(),0);assert.ok(await page.locator('.ob-standard-editor').evaluate(el=>el.getBoundingClientRect().height)<570);
  await page.locator('.ob-price').click();await page.locator('.ob-monthly-error').filter({hasText:'En az bir hizmet veya proje seç'}).waitFor();assert.equal(await page.locator('.ob-pricing').isVisible(),false);
  const group=page.locator(growth).locator('[data-cost-group=services]');await group.locator('.ob-service-trigger').click();assert.equal(await group.locator('input[type=checkbox]').count(),28);
  assert.equal(await group.locator('.ob-service-search').evaluate(el=>el===document.activeElement),true);
  await group.locator('.ob-service-search').fill('GROWTH');assert.equal(await group.locator('.ob-service-check:visible').count(),3);await group.locator('input[value=growth_initial]').check();
  const menu=group.locator('.ob-service-menu');assert.ok(await menu.evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert.ok(await menu.evaluate(el=>{const b=el.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight;}));
  await menu.screenshot({path:path.join(screenshotDir,'popup-'+width+'.png')});if(width===390){await page.setViewportSize({width,height:620});await page.waitForFunction(()=>{const el=document.querySelector('.ob-service-menu:popover-open');if(!el)return false;const r=el.getBoundingClientRect();return r.bottom<=innerHeight&&r.top>=0;});await page.setViewportSize({width,height:960});}await group.locator('.ob-service-search').fill('account manager');assert.equal(await group.locator('.ob-service-check:visible').count(),1);await group.locator('.ob-service-search').press('Escape');assert.equal(await menu.isVisible(),false);assert.equal(await page.locator('#offer-brief-dialog').isVisible(),true);
  await chooseCost(page,growth,'account');await chooseCost(page,ops,'meta');await chooseCost(page,'.ob-standard-editor','project_brandbook');
  await compose(page);assert.match(await page.locator('.so-option').nth(0).textContent(),/150.000/);assert.match(await page.locator('.so-option').nth(1).textContent(),/18.000/);assert.match(await page.locator('.so-project-total').textContent(),/55.000/);
  const call=await page.evaluate(()=>reviewCalls.find(c=>c.serviceSelection));assert.deepEqual(call.serviceSelection.alternatives.map(a=>a.services.map(s=>s.serviceId)),[['growth_initial','account'],['meta']]);assert.equal(call.serviceSelection.projects[0].serviceId,'project_brandbook');
  await page.locator('.so-option').nth(1).click();assert.ok(!(await page.locator('#so-service-list').textContent()).includes('Growth'));await page.locator('.so-projects').screenshot({path:path.join(screenshotDir,'projects-'+width+'.png')});
  await page.locator('.ob-services-edit').click();await page.locator(growth).getByRole('button',{name:/Account.*kaldır/}).click();await compose(page);assert.match(await page.locator('.so-option').first().textContent(),/120.000/);assert.match(await page.locator('.so-option').nth(1).textContent(),/18.000/);
  assert.equal(await page.evaluate(()=>reviewCalls.filter(c=>c.action==='prepare').length),1);assert.equal(await page.evaluate(()=>reviewCalls.filter(c=>c.kind==='audit').length),0);
  await save(page);await page.locator('.ob-publish').click();await page.locator('.ob-save-status').filter({hasText:'Müşteri bağlantısı:'}).waitFor();await page.locator('.ob-close').click();await page.waitForFunction(()=>document.querySelectorAll('.offer-select option').length===3);
  await page.locator('.offer-view').click();await page.locator('#offer-saved-dialog .so-projects').waitFor();assert.match(await page.locator('#offer-saved-dialog .so-option').first().textContent(),/120.000/);await page.locator('.offer-saved-close').click();assert.deepEqual(await page.evaluate(()=>reviewRows.slice(0,2)),before.rows);assert.deepEqual(await page.evaluate(()=>reviewLead),before.lead);
  await page.locator('.offer-select').selectOption(before.rows[0].id);await page.locator('.offer-view').click();assert.equal(await page.locator('.so-projects').count(),0);assert.equal(await page.locator('.so-option').count(),2);await page.locator('.offer-saved-close').click();assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});

test('desktop/mobile: monthly includes all 36 rows, only selected team/account/project costs, and copying excludes one-off projects',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await launch();await mkdir(screenshotDir,{recursive:true});try{for(const width of [1440,390]){
  const {page,errors}=await setup(browser,width,'USD');await page.locator('.ob-monthly-toggle').check();await page.locator('[data-month="1"] .ob-service-trigger').first().waitFor();assert.equal(await page.locator('[data-month="1"] input[type=checkbox]').count(),36);
  await chooseCost(page,'[data-month="1"]','growth_initial');await chooseCost(page,'[data-month="1"]','account');await chooseCost(page,'[data-month="1"]','project_account');await chooseCost(page,'[data-month="1"]','project_brandbook');
  await page.getByRole('button',{name:'Ay ekle',exact:true}).click();await page.locator('[data-month="2"]').getByRole('button',{name:'Önceki ayın retainer hizmetlerini kopyala'}).click();assert.equal(await page.locator('[data-month="2"] .ob-service-row').count(),2);
  await page.locator('[data-month="2"]').getByRole('button',{name:/Growth.*kaldır/}).click();await page.locator('[data-month="2"]').getByRole('button',{name:/Account.*kaldır/}).click();await chooseCost(page,'[data-month="2"]','meta');
  await compose(page);const call=await page.evaluate(()=>reviewCalls.find(c=>c.pricingMode==='monthly'));assert.deepEqual(call.monthlyPlan.months[0].services.map(s=>s.serviceId),['growth_initial','account']);assert.deepEqual(call.monthlyPlan.months[1].services.map(s=>s.serviceId),['meta']);assert.deepEqual(call.monthlyPlan.months[1].projects,[]);
  const rows=await page.locator('.so-monthly-table tbody tr').allTextContents();assert.match(rows[0],/Growth/);assert.ok(!rows[1].includes('Growth'));assert.ok(!rows[1].includes('Account'));assert.equal(await page.locator('.so-monthly-table tbody tr').nth(1).locator('.so-project-amount').textContent(),'—');
  assert.equal(await page.locator('.ob-proposal').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);await page.locator('.so-monthly-options').screenshot({path:path.join(screenshotDir,'monthly-'+width+'.png')});await save(page);await page.locator('.ob-close').click();await page.locator('.offer-view').click();await page.locator('.so-monthly-table tbody tr').nth(1).waitFor();assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});

test('tablet touch keeps retainer choices open with or without native popovers',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await launch();
 try{
  for(const fallbackPicker of [false,true]){
   const {page,errors}=await setup(browser,1180,'TRY',{height:780,hasTouch:true,fallbackPicker});
   const group=page.locator(growth).locator('[data-cost-group=services]');
   const trigger=group.locator('.ob-service-trigger'),menu=group.locator('.ob-service-menu');
   await trigger.evaluate(el=>{
    el.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true}));
    el.dispatchEvent(new MouseEvent('click',{bubbles:true}));
   });
   assert.equal(await menu.evaluate(el=>el===document.activeElement),true);
   assert.ok(await menu.locator('.ob-service-options').evaluate(el=>el.clientHeight>0));
   for(const id of ['account','growth_initial']){
    await menu.locator('label').filter({has:page.locator('input[value="'+id+'"]')}).tap({position:{x:45,y:12}});
    assert.equal(await group.locator('.ob-service-row[data-service-id="'+id+'"]').count(),1);
    assert.equal(await menu.isVisible(),true);
   }
   if(fallbackPicker){
    await menu.locator('.ob-service-search').press('Escape');
    assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
    assert.equal(await menu.isVisible(),false);
    await trigger.tap();
    const body=await page.locator('.ob-body').boundingBox();
    await page.touchscreen.tap(body.x+body.width-20,body.y+20);
    assert.equal(await menu.isVisible(),false);
   }else await menu.getByRole('button',{name:'Tamam',exact:true}).tap();
   assert.equal(await group.locator('.ob-service-row').count(),2);
   assert.equal(await page.locator('#offer-brief-dialog').isVisible(),true);
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();}
});

test('tablet touch: monthly services and projects stay selectable with and without the software keyboard',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await launch();
 try{
  const {page,errors}=await setup(browser,1180,'TRY',{height:780,hasTouch:true});
  await page.locator('.ob-monthly-toggle').tap();
  const month=page.locator('[data-month="1"]');
  const services=month.locator('[data-cost-group=services]');
  await services.locator('.ob-service-trigger').tap();
  const menu=services.locator('.ob-service-menu');
  const search=services.locator('.ob-service-search');
  assert.equal(await menu.evaluate(el=>el===document.activeElement),true);
  await services.locator('input[value=account]').tap();
  assert.equal(await services.locator('[data-service-id=account].ob-service-row').count(),1);
  await search.tap();
  assert.equal(await search.evaluate(el=>el===document.activeElement),true);

  await page.evaluate(()=>{
   Object.defineProperty(visualViewport,'height',{configurable:true,value:152});
   visualViewport.dispatchEvent(new Event('resize'));
   Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:60});
   visualViewport.dispatchEvent(new Event('scroll'));
  });
  assert.equal(await menu.evaluate(el=>{
   const bounds=el.getBoundingClientRect();
   return bounds.top>=visualViewport.offsetTop&&bounds.bottom<=visualViewport.offsetTop+visualViewport.height&&el.scrollHeight>el.clientHeight;
  }),true);
  const list=services.locator('.ob-service-options');
  assert.ok(await list.evaluate(el=>el.clientHeight>320));
  await search.fill('GROWTH');
  assert.equal(await services.locator('.ob-service-check:visible').count(),3);
  await services.locator('input[value=growth_initial]').tap();
  assert.equal(await services.locator('[data-service-id=growth_initial].ob-service-row').count(),1);
  await menu.getByRole('button',{name:'Tamam',exact:true}).tap();
  assert.equal(await menu.isVisible(),false);

  await page.evaluate(()=>{
   delete visualViewport.height;
   delete visualViewport.offsetTop;
   visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.setViewportSize({width:820,height:1080});
  const projects=month.locator('[data-cost-group=projects]');
  await projects.locator('.ob-service-trigger').tap();
  assert.equal(await projects.locator('.ob-service-menu').evaluate(el=>el===document.activeElement),true);
  await projects.locator('input[value=project_brandbook]').tap();
  await projects.getByRole('button',{name:'Tamam',exact:true}).tap();
  assert.equal(await projects.locator('[data-service-id=project_brandbook].ob-service-row').count(),1);
  await compose(page);
  const result=await page.evaluate(()=>reviewCalls.find(c=>c.pricingMode==='monthly').monthlyPlan.months[0]);
  assert.deepEqual(result.services.map(item=>item.serviceId),['account','growth_initial']);
  assert.deepEqual(result.projects.map(item=>item.serviceId),['project_brandbook']);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('desktop/mobile: first alternative copy is explicit, custom costs remain editable, and no-cost alternatives cannot be selected as free offers',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const browser=await launch();try{for(const width of [1440,390]){
  const {page,errors}=await setup(browser,width);await chooseCost(page,growth,'account');await chooseCost(page,growth,'growth_consultant');await page.locator(ops).getByRole('button',{name:'İlk alternatifin maliyetlerini kopyala'}).click();assert.equal(await page.locator(ops+' .ob-service-row').count(),2);
  await chooseCost(page,'.ob-standard-editor','project_app');await page.locator('.ob-price').click();await page.locator('.ob-monthly-error').filter({hasText:'maliyet gir'}).waitFor();await page.locator('[data-custom-cost=project_app]').fill('12345.67');await compose(page);assert.match(await page.locator('.so-project-total').textContent(),/24.691,34/);
  await page.locator('.ob-services-edit').click();for(const service of ['account','growth_consultant'])await page.locator(ops+' [data-service-id="'+service+'"]').getByRole('button',{name:/kaldır/}).click();await page.locator('.ob-standard-editor [data-service-id=project_app]').getByRole('button',{name:/kaldır/}).click();await compose(page);assert.equal(await page.locator('.so-option').nth(1).isDisabled(),true);assert.match(await page.locator('.so-option').nth(1).textContent(),/kapsamı seçilmedi/);assert.equal(await page.locator('.so-option').first().getAttribute('aria-pressed'),'true');assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
