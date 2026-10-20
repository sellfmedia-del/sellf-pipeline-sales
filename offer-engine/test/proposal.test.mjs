import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {proposalEngine} from '../src/engines/proposal-engine.mjs';
import {pricingEngine} from '../src/engines/pricing-engine.mjs';
import {createProposalHandler} from '../api/proposal.js';
import {createOfferHandler} from '../api/offer.js';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {logoProof} from '../src/proposal/logo-proof.mjs';
import {compositionEnvelope} from '../src/proposal/composition.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {context} from './fixtures/evidence.mjs';
import {brief as base} from './fixtures/bhs.mjs';
const secret='test-proposal-secret',session='d'.repeat(43),host='preview.vercel.app';
const copy={headline:'Net hedefler.',accent:'Birlikte büyüme.',subtitle:'Bayi büyümesini ölçüm ve uygulamayla destekleyen işbirliği önerimiz.',findingIds:['f0']};
async function fixture(){
 const brief=snapshotBrief({...base,services:'Meta ve Google Ads'}),data=context().report;
 Object.assign(data,{schemaVersion:'bhs-v1',briefHash:briefHash(brief),services:[],rawReport:'Kaynaklı tam rapor.',scoring:{total:null,note:'Eksik veri'},quality:{checksPassed:true,semanticBenchmark:'passed'}});
 const audit={stage:'audit',status:'ready',data};
 const pricing={stage:'pricing',...await pricingEngine.run({brief,scope:{summary:'Seçili kanallar.',budget:{posture:'unspecified',quote:null,targetQuote:null,targetScope:'unspecified'},services:['meta','google_ads'].map(serviceId=>({serviceId,phase:'start',priority:1,reason:'Seçili reklam kanalı.',briefQuote:brief.services,findingIds:['f0']})),exclusions:['Reklam bütçesi dahil değildir.']}},{audit})};
 const logo={stage:'logo',status:'review',data:{generated:false,sourceType:'upload',candidates:[{image:'data:image/png;base64,AAA',placement:{background:'#171717',area:'logo-only'},quality:{transparency:true,matteStable:true,touchesEdge:false,changedSolid:0}}]}};
 return {brief,audit,pricing,logo};
}
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}};}
function request(body,auth=false){return {method:'POST',headers:{host,origin:'https://'+host,cookie:'__Host-offer-research='+session,...(auth?{authorization:'Bearer '+'x'.repeat(40)}:{})},body};}
test('default proposal endpoint composes signed Pro copy with no additional paid model and binds the budget card',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const f=await fixture();f.audit.data.proposalCopy=copy;
  const codec=createPricingProof(secret),handler=createProposalHandler({getSecret:()=>secret});
  const body={action:'start',context:{leadId:'lead1',spaceId:'space1'},brief:f.brief,audit:f.audit,pricing:f.pricing,logo:{...f.logo.data,logoProof:logoProof(secret,host,f.logo.data)},proposalProof:codec.encode({kind:'pricing_ready',createdAt:Date.now(),briefHash:briefHash(f.brief),auditHash:digest(f.audit),pricingHash:digest(f.pricing),budgetLeadId:'lead1'},session,host)};
  const done=response();await handler(request(body),done);assert.equal(done.statusCode,200);assert.equal(done.data.result.status,'review');assert.ok(done.data.saveProof);
  const changed=response();await handler(request({...body,context:{leadId:'other',spaceId:'space1'}}),changed);assert.equal(changed.statusCode,422);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('assembly preserves two exact monthly totals, original logo and unknown BHS; no costs or item prices reach customer data',async()=>{
 const f=await fixture(),before=structuredClone(f),r=await proposalEngine.run({brief:f.brief,copy},f);
 assert.equal(r.status,'review');assert.equal(r.data.alternatives.length,2);assert.deepEqual(r.data.alternatives.map(a=>a.monthlyAmount),f.pricing.data.alternatives.map(a=>a.monthlyAmount));
 assert.equal(r.data.logo.image,f.logo.data.candidates[0].image);assert.equal(r.data.logo.background,'#171717');assert.equal(r.data.bhs.scoring.total,null);
 for(const a of r.data.alternatives)for(const s of a.services)for(const key of ['cost','monthlyAmount','minimumAmount','idealAmount'])assert.equal(s[key],undefined);
 assert.equal(r.data.alternatives[1].services.some(s=>s.id==='growth'),false);assert.equal(r.data.plans.operations_bundle.mode,'operations');
 assert.equal(r.data.bhs.rawReport,undefined);assert.equal(r.data.bhs.meetingQuestions,undefined);assert.ok(Array.isArray(r.data.bhs.benchmarks));
 assert.deepEqual(f,before);
});
test('manual plans pass through unchanged; operation plans do not add a full Growth audit; stale/unsupported copy cannot assemble',async()=>{
 const f=await fixture(),manualSteps=[{time:'Müşteri onayından sonra',title:'Özel başlangıç adımı'}];
 const r=await proposalEngine.run({brief:f.brief,copy,planMode:'manual',manualSteps},f);
 assert.deepEqual(r.data.plans.growth_operations.steps,manualSteps);assert.deepEqual(r.data.plans.operations_bundle.steps,manualSteps);
 const ops=await proposalEngine.run({brief:f.brief,copy,planMode:'operations'},f);assert.equal(ops.data.plans.growth_operations.mode,'operations');
 for(const bad of [{...copy,findingIds:['missing']},{...copy,subtitle:'Aylık 3 milyon TL garanti.'},{...copy,monthlyAmount:1}])await assert.rejects(()=>proposalEngine.run({brief:f.brief,copy:bad},f));
 await assert.rejects(()=>proposalEngine.run({brief:{...f.brief,goals:'Farklı hedef'},copy},f),/brief/);
 const envelope=JSON.stringify(compositionEnvelope(f.brief,f.audit.data,f.pricing.data));assert.ok(!envelope.includes('monthlyAmount'));assert.ok(!envelope.includes('base64'));assert.ok(!envelope.includes('costSnapshot'));
});
test('proposal API verifies signed price/logo and exact brief; host/session/context/plan changes cannot reuse a job; paid start is reused',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
 const f=await fixture(),codec=createPricingProof(secret);let starts=0;
 const provider={configured:()=>true,async composeProposal(){starts++;return {id:'proposal_job_12345678'};},async poll(){return {status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(copy)}]}]};}};
 const handler=createProposalHandler({getSecret:()=>secret,getProvider:()=>provider});
 const body={action:'start',requestId:randomUUID(),context:{leadId:'lead1',spaceId:'space1'},brief:f.brief,audit:f.audit,pricing:f.pricing,logo:{...f.logo.data,logoProof:logoProof(secret,host,f.logo.data)},proposalProof:codec.encode({kind:'pricing_ready',createdAt:Date.now(),briefHash:briefHash(f.brief),auditHash:digest(f.audit),pricingHash:digest(f.pricing)},session,host)};
 const start=response();await handler(request(body),start);assert.equal(start.statusCode,202);
 const again=response();await handler(request(body),again);assert.equal(starts,1);assert.equal(again.statusCode,202);
 const done=response();await handler(request({...body,action:'status',ticket:start.data.ticket}),done);assert.equal(done.statusCode,200);assert.equal(done.data.result.status,'review');assert.ok(done.data.saveProof);
 for(const changed of [{...body,pricing:{...f.pricing,data:{...f.pricing.data,recommendedAlternativeId:'oops'}}},{...body,logo:{...body.logo,candidates:[]}},{...body,context:{leadId:'other',spaceId:'space1'},action:'status',ticket:start.data.ticket},{...body,logoBackground:'#ffffff',action:'status',ticket:start.data.ticket}]){const r=response();await handler(request(changed),r);assert.equal(r.statusCode,422);}
 assert.equal(starts,1);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('save requires both reviews, actual Pipeline auth, signed exact result and matching card; it only calls the atomic RPC',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
 const f=await fixture(),result=await proposalEngine.run({brief:f.brief,copy},f),proposal={...result,runId:randomUUID()};let saved;
 const store={configured:()=>true,portalConfigured:()=>false,async save(token,body){saved={token,body};return {id:'test',version:1,monthlyAmount:proposal.data.valueSync.amount};}};
 const h=createOfferHandler({getSecret:()=>secret,getStore:()=>store});
 const saveProof=createPricingProof(secret).encode({kind:'proposal_ready',createdAt:Date.now(),briefHash:briefHash(f.brief),auditHash:digest(f.audit),pricingHash:digest(f.pricing),proposalHash:digest(proposal),leadId:'lead1',spaceId:'space1'},session,host);
 const b={action:'save',leadId:'lead1',spaceId:'space1',proposal,pricing:f.pricing,saveProof,logoApproved:true,scopeApproved:true};
 for(const[body,auth]of [[b,false],[{...b,scopeApproved:false},true],[{...b,leadId:'another'},true],[{...b,proposal:{...proposal,status:'ready'}},true]]){const r=response();await h(request(body,auth),r);assert.equal(r.statusCode,422);assert.equal(saved,undefined);}
 const r=response();await h(request(b,true),r);assert.equal(r.statusCode,200);assert.equal(saved.body.p_lead_id,'lead1');assert.equal(saved.body.p_document.logo.reviewed,true);assert.equal(proposal.data.logo.reviewed,false);assert.equal(saved.body.p_pricing.costVersion,f.pricing.data.costVersion);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('publication needs no mail provider; legacy automatic sending is disabled',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
 let publications=0;
 const store={configured:()=>true,portalConfigured:()=>true,async publish(){publications++;return {token:'t'.repeat(43),password:'private'};},async queue(){assert.fail('No server email queue');}};
 const handler=createOfferHandler({getStore:()=>store,getPortalSecret:()=>secret});
 const health=response();await handler({method:'GET'},health);assert.equal(health.data.mailTransport,'mailto');
 const published=response();await handler(request({action:'publish',offerId:randomUUID()},true),published);assert.equal(published.statusCode,200);assert.equal(publications,1);assert.match(published.data.url,/customer.html#/);
 const legacy=response();await handler(request({action:'request',token:'test',password:'test'}),legacy);assert.equal(legacy.statusCode,422);assert.match(legacy.data.error,/e-posta uygulamanızdan/);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('mailto encodes Turkish text, fixes both recipients, uses selected saved total and link without password or injected headers',async()=>{
 const sandbox={window:{},URL,Intl};vm.runInNewContext(await readFile('../offers/proposal.js','utf8'),sandbox);
 const f=await fixture(),r=await proposalEngine.run({brief:f.brief,copy},f),data={...r.data,version:2},token='t'.repeat(43);
 data.brand.name='Türkçe & Marka?\r\nBcc: attacker@example.com';
 const input={offerUrl:'https://preview.vercel.app/offers/customer.html#'+token,offerId:'saved-version',alternativeId:'operations_bundle',name:'Yetkili & İsim',email:'person@example.com',monthlyAmount:1,to:['attacker@example.com']};
 const mail=new URL(sandbox.window.PipelineProposal.buildMailto(data,input));
 assert.equal(mail.pathname,'yigit@sellfmedia.com,businessdevelopment@sellfmedia.com');assert.deepEqual([...mail.searchParams.keys()],['subject','body']);assert.ok(!/[\r\n]/.test(mail.searchParams.get('subject')));
 const body=mail.searchParams.get('body');assert.ok(body.includes('v2'));assert.ok(body.includes('Aylık hizmet bedeli: '+new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(data.alternatives[1].monthlyAmount)+' TL / ay'));assert.ok(body.includes(input.offerUrl));assert.ok(body.includes('Yetkili & İsim'));assert.ok(!body.includes('password'));
 assert.throws(()=>sandbox.window.PipelineProposal.buildMailto(data,{...input,offerUrl:input.offerUrl.replace('#','?password=private#')}));
 assert.throws(()=>sandbox.window.PipelineProposal.buildMailto(data,{...input,name:'Name\r\nBcc: attacker@example.com'}));
 assert.throws(()=>sandbox.window.PipelineProposal.buildMailto(data,{...input,offerUrl:'javascript:alert(1)'}));
});
