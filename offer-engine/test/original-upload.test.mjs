import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {prepareOriginalLogo} from '../src/original-upload.mjs';
import {assertResult} from '../src/contracts.mjs';
import {logoProof} from '../src/proposal/logo-proof.mjs';
import {savedLogo} from '../api/offer-reuse.js';
import handler from '../api/logo-upload.js';
import {proposalEngine} from '../src/engines/proposal-engine.mjs';
import {pricingEngine} from '../src/engines/pricing-engine.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {context} from './fixtures/evidence.mjs';
import {brief as base} from './fixtures/bhs.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {randomBytes} from 'node:crypto';
const secret='original-upload-test-secret',host='original.preview.example';
const copy={headline:'Net hedefler.',accent:'Birlikte büyüme.',subtitle:'Onaylı teklif.',findingIds:['f0']};
async function fixture(){
 const brief=snapshotBrief({...base,services:'Meta ve Google Ads'}),data=context().report;
 Object.assign(data,{schemaVersion:'bhs-v1',briefHash:briefHash(brief),services:[],rawReport:'Kaynaklı tam rapor.',scoring:{total:null,note:'Eksik veri'},quality:{checksPassed:true,semanticBenchmark:'passed'}});
 const audit={stage:'audit',status:'ready',data};
 const pricing={stage:'pricing',...await pricingEngine.run({brief,scope:{summary:'Seçili kanallar.',budget:{posture:'unspecified',quote:null,targetQuote:null,targetScope:'unspecified'},services:['meta','google_ads'].map(serviceId=>({serviceId,phase:'start',priority:1,reason:'Seçili reklam kanalı.',briefQuote:brief.services,findingIds:['f0']})),exclusions:['Reklam bütçesi dahil değildir.']}},{audit})};
 const logo={stage:'logo',status:'review',data:{generated:false,sourceType:'upload',candidates:[{image:'data:image/png;base64,AAA',placement:{background:'#171717',area:'logo-only'},quality:{transparency:true,matteStable:true,touchesEdge:false,changedSolid:0}}]}};
 return {brief,audit,pricing,logo};
}

async function image(format='png'){
 const bytes=await sharp({create:{width:320,height:120,channels:3,background:'#aabbcc'}}).toFormat(format).toBuffer();
 return 'data:image/'+format+';base64,'+bytes.toString('base64');
}
test('original PNG/JPEG/WebP retain every uploaded byte and carry no fabricated transparency claims',async()=>{
 for(const format of ['png','jpeg','webp']){
  const input=await image(format),data=await prepareOriginalLogo(input);
  assert.equal(data.candidates[0].source,undefined);assert.equal(data.candidates[0].image,input);
  assert.equal(data.processing,'original');assert.equal(data.candidates[0].quality.transparency,undefined);
  assertResult('logo',{status:'review',data});
  assert.throws(()=>assertResult('logo',{status:'ready',data}),/kontrol/);
  assert.throws(()=>assertResult('logo',{status:'review',data:{...data,generated:true}}));
 }
});
test('original uploads still reject invalid, disguised, corrupt and oversized files',async()=>{
 for(const bad of [null,'https://example.com/a.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,AAAA','data:image/png;base64,'+'A'.repeat(3000000)])await assert.rejects(prepareOriginalLogo(bad));
 await assert.rejects(prepareOriginalLogo((await image()).replace('image/png','image/jpeg')));
});
test('original mode bypasses both provider and budget calls even with real-looking lead context, and signs the unchanged data',async()=>{
 const oldEnv=process.env.VERCEL_ENV,oldKey=process.env.OFFER_GEMINI_API_KEY,oldFetch=globalThis.fetch;
 process.env.VERCEL_ENV='preview';process.env.OFFER_GEMINI_API_KEY=secret;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('Unexpected network call');};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
 try{
  const input=await image('jpeg');
  await handler({method:'POST',headers:{host,origin:'https://'+host},body:{processing:'original',image:input,context:{leadId:'real-looking-lead'}}},res);
  assert.equal(res.code,200);assert.equal(calls,0);assert.equal(res.data.candidates[0].image,input);
  const {logoProof:token,...data}=res.data;assert.equal(logoProof(secret,host,data,token),true);
  assert.throws(()=>logoProof(secret,host,{...data,processing:'clean'},token));
 }finally{
  globalThis.fetch=oldFetch;
  if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;
  if(oldKey===undefined)delete process.env.OFFER_GEMINI_API_KEY;else process.env.OFFER_GEMINI_API_KEY=oldKey;
 }
});
test('original JPEG survives proposal composition, approval, saved-logo reuse and re-attestation',async()=>{
 const f=await fixture(),input=await image('jpeg'),data=await prepareOriginalLogo(input);
 f.logo={stage:'logo',status:'review',data};
 const proposal=await proposalEngine.run({brief:f.brief,copy},f);
 assert.equal(proposal.data.logo.image,input);assert.equal(proposal.data.logo.processing,'original');assert.equal(proposal.status,'review');assertResult('proposal',proposal);
 assert.equal(savedLogo(proposal.data,secret,host),null);
 proposal.data.logo.reviewed=true;const reused=savedLogo(proposal.data,secret,host);
 assert.equal(reused.candidates[0].image,input);assert.equal(reused.processing,'original');
 const {logoProof:token,...saved}=reused;assertResult('logo',{status:'ready',data:saved});assert.equal(logoProof(secret,host,saved,token),true);
});
test('browser original selection sends explicit mode, accepts JPEG and invalidates late processed responses',async()=>{
 const code=await readFile(new URL('../../offers/logo-control.js',import.meta.url),'utf8'),modelCode=await readFile(new URL('../../offers/brief-model.js',import.meta.url),'utf8');
 const nodes=new Map();const container={innerHTML:'',querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{value:'auto',hidden:false,style:{},listeners:{},addEventListener(event,fn){this.listeners[event]=fn;}});return nodes.get(selector);}};
 let value,lastPayload,finishClean;const input=await image('jpeg'),data=await prepareOriginalLogo(input);
 const window={PipelineLogoRequest:async payload=>{lastPayload=payload;if(payload.processing==='original')return {...data,logoProof:'signed-test-receipt'};return new Promise(resolve=>finishClean=resolve);}};
 const sandbox=vm.createContext({window,URL,FileReader:class{readAsDataURL(file){this.result=file.data;this.onload();}}});
 vm.runInContext(modelCode,sandbox);vm.runInContext(code,sandbox);
 window.PipelineLogoControl.mount(container,{getWebsite:()=> 'https://example.com/',getContext:()=>({leadId:'lead'}),getBrandName:()=> 'Example',onChange:x=>value=x});
 const file=nodes.get('.ol-file');file.files=[{type:'image/jpeg',size:500,data:input}];
 const mode=nodes.get('.ol-processing');mode.value='clean';const pending=file.listeners.change();await new Promise(resolve=>setImmediate(resolve));
 mode.value='original';await mode.listeners.change();assert.equal(lastPayload.processing,'original');assert.equal(value.image,input);assert.equal(value.sourceType,'upload-original');
 finishClean({generated:false,candidates:[]});await pending;assert.equal(value.image,input);
 const draft={brandName:'Example',segment:'kobi',website:'https://example.com/',currency:'TRY',goals:'Growth',needs:'Support',services:'SEO',budget:'',logo:value};
 assert.equal(window.PipelineOfferBriefModel.validate(draft).logoUrl,undefined);
 assert.ok(window.PipelineOfferBriefModel.validate(draft,{requireLogoReview:true}).logoUrl);
});

test('large valid original images are not duplicated in upload or saved-logo responses',async()=>{
 const bytes=await sharp(randomBytes(800*700*3),{raw:{width:800,height:700,channels:3}}).png().toBuffer();
 assert.ok(bytes.length<2*1024*1024&&bytes.length>1500000);
 const input='data:image/png;base64,'+bytes.toString('base64'),data=await prepareOriginalLogo(input);
 assert.ok(JSON.stringify(data).length<3800000);
 const saved=savedLogo({logo:{reviewed:true,processing:'original',image:input,background:'#ffffff'}},secret,host);
 assert.ok(JSON.stringify(saved).length<3800000);assert.equal(saved.candidates[0].image,input);
});
