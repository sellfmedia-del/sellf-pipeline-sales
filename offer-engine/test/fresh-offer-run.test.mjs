import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {createPricingHandler} from '../api/pricing.js';
import {createPricingProof} from '../src/pricing/proof.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {researchCacheKey} from '../src/bhs/reuse.mjs';
import {prepareUploadedLogo} from '../src/upload.mjs';
import {context} from './fixtures/evidence.mjs';
import {offerFixture,memoryLedger,response} from './fixtures/offer.mjs';
const host='runs.preview.example',secret='isolated-fresh-run-tests',session='s'.repeat(43);
const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222';
const req=body=>({method:'POST',headers:{host,origin:'https://'+host,cookie:'__Host-offer-research='+session},body});
test('a fresh card run isolates old commitments; signed resume and downstream pricing retain the same run',async()=>{
 const oldEnv=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const f=await offerFixture(),old=memoryLedger(),a=memoryLedger(),b=memoryLedger();
  old.status=async()=>({chargedKurus:4980,capKurus:5000});
  const ledgers=new Map([[first,a],[second,b]]),seen=[];
  const handler=createBoundedAuditHandler({getSecret:()=>secret,validateWebsite:async()=>{},
   getLedger:async(_req,_res,lead,options)=>{assert.equal(lead,'lead-1');seen.push(options?.researchRunId);return ledgers.get(options?.researchRunId)||old;},
   getProviders:()=>({configured:()=>true}),
   runStage:async({phase,brief,ledger,researchVersion,freshResearch})=>{assert.equal(freshResearch,true);ledger.rows.set(stageKey(brief,phase,researchVersion),{state:'complete',value:phase==='synthesis'?f.synthesis:phase==='scope'?{scopePlan:f.scope,proposalCopy:f.copy}:{}});}
  });
  const start=response();await handler(req({action:'start',requestId:'fresh_run_request_1111',brief:f.brief,context:{leadId:'lead-1',spaceId:'space-1',researchRunId:first}}),start);
  assert.equal(start.code,200);assert.equal(start.data.cost.chargedKurus,500);
  let ticket=start.data.ticket,done;
  for(let i=0;i<4;i++){const res=response();await handler(req({action:'advance',brief:f.brief,ticket,context:{researchRunId:second}}),res);assert.ok([200,202].includes(res.code));ticket=res.data.ticket||ticket;if(res.data.result)done=res.data;}
  if(!done){const res=response();await handler(req({action:'status',brief:f.brief,ticket}),res);assert.equal(res.code,200);done=res.data;}
  assert.ok(done?.pricingProof);assert.ok(seen.every(id=>id===first),'client cannot change the signed run when resuming');
  const claims=createPricingProof(secret).decode(done.pricingProof,session,host,Date.now());assert.equal(claims.budgetResearchRunId,first);
  const price=response();await createPricingHandler({getSecret:()=>secret})(req({action:'start',brief:f.brief,audit:done.result,pricingProof:done.pricingProof}),price);assert.equal(price.code,200);
  const next=response();await handler(req({action:'start',requestId:'fresh_run_request_2222',brief:f.brief,context:{leadId:'lead-1',spaceId:'space-1',researchRunId:second}}),next);
  assert.equal(next.data.phase,'source_plan');assert.equal(b.rows.size,0);assert.equal((await old.status()).chargedKurus,4980);
  const invalid=response();await handler(req({action:'start',requestId:'fresh_run_request_3333',brief:f.brief,context:{leadId:'lead-1',researchRunId:'invalid'}}),invalid);assert.equal(invalid.code,422);
 }finally{if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;}
});
test('explicit fresh research cannot consume a partial brand cache at planning or synthesis',async()=>{
 const f=await offerFixture(),c=context(),ledger=memoryLedger([[researchCacheKey(f.brief),{state:'complete',value:{created_at:new Date().toISOString(),value:{report:c.report,analysisPacket:c.packet,researchContext:{brief:f.brief,briefHash:f.hash}}}}]]);
 let plans=0,syntheses=0;
 const providers={search:async()=>({results:[]}),generate:async stage=>{if(stage==='source_plan'){plans++;throw Error('fresh planning reached');}syntheses++;throw Error('fresh synthesis reached');}};
 await assert.rejects(runBoundedStage({phase:'source_plan',brief:f.brief,ledger,providers,researchVersion:'v5',freshResearch:true}),/fresh planning reached/);
 ledger.rows.set(stageKey(f.brief,'evidence','v5'),{state:'complete',value:{packet:c.packet,searches:[]}});
 await assert.rejects(runBoundedStage({phase:'synthesis',brief:f.brief,ledger,providers,researchVersion:'v5',freshResearch:true}),/fresh synthesis reached/);
 assert.equal(plans,1);assert.equal(syntheses,1);
});
test('a compact logo uses pixel checks without localisation; provider failure retains verified transparency and marks interior review',async()=>{
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160"><rect width="400" height="160" fill="white"/><rect x="55" y="40" width="260" height="80" fill="#706551"/><rect x="85" y="60" width="25" height="40" fill="white"/></svg>';
 const image='data:image/png;base64,'+(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');
 let located=0,backdrop=0;
 const result=await prepareUploadedLogo(image,{localFirst:true,locate:async()=>{located++;throw Error('unnecessary localisation');},chooseBackdrop:async()=>{backdrop++;throw Object.assign(Error('provider down'),{code:'provider_error'});}});
 assert.equal(located,0);assert.equal(backdrop,1);
 const q=result.candidates[0].quality;assert.equal(q.transparency,true);assert.equal(q.changedSolid,0);assert.equal(q.interiorReviewRequired,true);assert.equal(q.requiresReview,true);
 assert.notEqual(result.candidates[0].image,image);assert.equal(result.candidates[0].source,image);
});

test('desktop/mobile: a normal card shares one logo/BHS run; double submit reuses it and a new opening gets a fresh budget',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const {chromium:playwright}=await import('playwright-core'),{default:chromium}=await import('@sparticuz/chromium');
 const {readFile}=await import('node:fs/promises'),path=await import('node:path');
 const browser=await playwright.launch({executablePath:process.env.LOGO_TEST_CHROMIUM,args:chromium.args.filter(a=>!['--single-process','--disable-web-security'].includes(a)),headless:true});
 try{for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());assert.equal(u.origin,'https://preview.vercel.app');assert.ok(!u.pathname.startsWith('/api/'));try{await route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'}[path.extname(u.pathname)],body:await readFile(path.join(process.cwd(),'public',u.pathname))});}catch{await route.fulfill({status:404,body:''});}});
  await page.goto('https://preview.vercel.app/offers/recovery-review.html');
  await page.waitForFunction(()=>typeof document.querySelector('#review-model').onclick==='function');
  await page.addScriptTag({content:await readFile(path.resolve(process.cwd(),'../offers/logo-control.js'),'utf8')});
  await page.evaluate(async()=>{
   const data=await(await fetch('/offers/variants-review-data.json')).json();window.freshCalls=[];
   window.PipelineLogoRequest=async p=>{freshCalls.push({kind:'logo',context:p.context});return {generated:false,sourceType:'upload-original',processing:'original',logoProof:'synthetic-only',candidates:[{id:'original',image:p.image,source:p.image,quality:{method:'original',width:400,height:160},placement:{background:'#ffffff'}}]};};
   window.PipelineAuditRequest=async p=>{freshCalls.push({kind:'audit',context:p.context});return {phase:'complete',result:structuredClone(data.audit),pricingProof:'synthetic-only',cost:{chargedKurus:500,capKurus:5000}};};
  });
  const seen=[];
  for(let i=0;i<2;i++){
   await page.evaluate(()=>PipelineOfferBrief.open({lead:{id:'normal-card',company:'Örnek Marka',name:'Test',notes:'',timeline:[]},spaceId:'space-1'}));
   for(const [name,value]of Object.entries({segment:'corporate',website:'https://brand.example/',goals:'Ölçülebilir büyüme.',needs:'Kanalların birlikte yönetimi.',services:'Meta ve Google Ads.'})){
    const input=page.locator('#ob-'+name);if(name==='segment')await input.selectOption(value);else await input.fill(value);
   }
   await page.locator('.ol-processing').selectOption('original');
   await page.locator('.ol-file').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:await sharp({create:{width:400,height:160,channels:4,background:'#fff'}}).png().toBuffer()});
   await page.locator('.ol-result:not([hidden])').waitFor();
   await page.locator('.ob-next').evaluate(button=>{button.click();button.click();});
   await page.locator('.ob-price:not([hidden])').waitFor();
   const calls=await page.evaluate(()=>freshCalls.splice(0));assert.deepEqual(calls.map(c=>c.kind),['logo','audit']);
   const id=calls[0].context.researchRunId;assert.match(id,/^[a-f0-9-]{36}$/);assert.equal(calls[1].context.researchRunId,id);seen.push(id);
   await page.locator('.ob-close').click();
  }
  assert.notEqual(seen[0],seen[1]);assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
