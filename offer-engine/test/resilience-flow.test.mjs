import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {runBoundedStage} from '../src/bhs/direct-research.mjs';
import {createBoundedProviders} from '../src/budget/providers.mjs';
import {createLedger} from '../src/budget/ledger.mjs';
import {createPricingHandler} from '../api/pricing.js';
import {createProposalHandler} from '../api/proposal.js';
import logoUpload from '../api/logo-upload.js';
import {context,plan} from './fixtures/evidence.mjs';
import {brief as base} from './fixtures/bhs.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {methodologyAreas} from '../src/bhs/methodology-areas.mjs';
import {fallbackScope} from '../src/pricing/scope.mjs';
import {pricingEngine} from '../src/engines/pricing-engine.mjs';
import {assertResult} from '../src/contracts.mjs';
const host='engine.preview.example',secret='engine-resilience-test-secret';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
test('source-plan failure, scope outage and original-logo recovery still reach signed grounded BHS, exact prices and the proposal format under 50 TRY',async()=>{
 const oldEnv=process.env.VERCEL_ENV,oldKey=process.env.OFFER_GEMINI_API_KEY;process.env.VERCEL_ENV='preview';process.env.OFFER_GEMINI_API_KEY=secret;
 try{
  const brief=snapshotBrief({...base,services:'Meta ve Google Ads'}),evidence=context(),rows=new Map();let charged=500;const calls=[];
  evidence.packet.briefHash=briefHash(brief);
  evidence.report.researchCoverage=Object.fromEntries(methodologyAreas.map(a=>[a.key,{status:'observed',observation:'Kaynakta bayi ağı gözlemi.',sourceIds:['ev1']}]));
  const ledger=createLedger(async(op,a={})=>{
   if(['begin','status'].includes(op))return {capKurus:5000,chargedKurus:charged};
   if(op==='get')return rows.get(a.step)||null;
   const prior=rows.get(a.step);
   if(op==='reserve'){if(prior)return {claimed:false,step:prior};if(charged+a.amount>5000)return {blocked:true};charged+=a.amount;rows.set(a.step,{state:'reserved',claim_token:a.token,charge_kurus:a.amount});return {claimed:true};}
   assert.equal(prior.claim_token,a.token);if(op==='complete')charged-=prior.charge_kurus-a.amount;
   rows.set(a.step,{...prior,state:op,value:a.value,charge_kurus:op==='complete'?a.amount:prior.charge_kurus});return rows.get(a.step);
  });
  // The mocked FX publication is dated. Pin provider time so this regression
  // keeps exercising outages rather than wall-clock expiry of its fixture.
  const fetchImpl=async(url,init)=>{
   if(url.includes('tcmb'))return new Response('<Tarih_Date Tarih="03.11.2026"><Currency CurrencyCode="USD"><ForexSelling>40</ForexSelling></Currency></Tarih_Date>');
   if(url.endsWith('/search'))return Response.json({results:[]});if(url.endsWith('/extract'))return Response.json({results:[]});
   if(url.endsWith(':countTokens'))return Response.json({totalTokens:100});
   const body=JSON.parse(init.body),input=JSON.parse(body.contents[0].parts[0].text),stage=input.catalog?'scope':input.packet?'synthesis':'source_plan';calls.push({stage,url});
   if(stage==='source_plan'&&url.includes('3.1-pro-preview')||stage==='scope'&&url.includes('4-argon'))return Response.json({error:{message:'Service unavailable'}},{status:503});
   if(stage==='scope')throw new DOMException('The operation was aborted due to timeout','TimeoutError');
   return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(stage==='synthesis'?evidence.report:plan)}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,totalTokenCount:120}});
  };
  const auditHandler=createBoundedAuditHandler({getResearchVersion:()=>'v5',getSecret:()=>secret,getResearchModel:()=> 'gemini-3.1-pro-preview',getLedger:async()=>ledger,getProviders:()=>createBoundedProviders({ledger,geminiKey:secret,tavilyKey:'test',fetchImpl,now:()=>Date.parse('2026-11-05T12:00:00Z'),validateUrl:async url=>({url:new URL(url)})}),validateWebsite:async()=>{},runStage:options=>runBoundedStage({...options,collect:async()=>evidence.packet}),logger:{error:value=>console.log(value)}});
  let cookie,ticket,audit,pricingProof;const req=body=>({method:'POST',headers:{host,origin:'https://'+host,cookie},body});
  let res=response();await auditHandler(req({action:'start',requestId:'request_1234567890',brief,context:{leadId:'lead',spaceId:'space'}}),res);assert.equal(res.code,200);
  cookie=res.headers['Set-Cookie'][0].split(';')[0];ticket=res.data.ticket;
  for(let i=0;i<4;i++){res=response();await auditHandler(req({action:'advance',ticket,brief}),res);assert.ok([200,202].includes(res.code),JSON.stringify({phase:i,status:res.code,code:res.data.code,error:res.data.error}));ticket=res.data.ticket||ticket;if(res.data.result){audit=res.data.result;pricingProof=res.data.pricingProof;}}
  assertResult('audit',audit);assert.ok(audit.data.sources.every(s=>s.verification.status==='quote_matched'));assert.equal(audit.data.researchCoverage.length,24);assert.equal(audit.data.scopePlan.fallback,true);
  assert.equal(calls.filter(c=>c.stage==='source_plan').length,2);assert.equal(calls.filter(c=>c.stage==='scope').length,2);
  const cost=charged,count=calls.length;res=response();await auditHandler(req({action:'status',ticket,brief}),res);assert.equal(charged,cost);assert.equal(calls.length,count);assert.ok(cost<=5000);
  const bytes=await sharp({create:{width:320,height:120,channels:3,background:'#abcdef'}}).jpeg().toBuffer(),image='data:image/jpeg;base64,'+bytes.toString('base64');
  res=response();await logoUpload(req({image,context:{leadId:'lead'}}),res);assert.equal(res.code,200);const logo=res.data;assert.equal(logo.fallbackReason,'cleanup_unavailable');assert.equal(logo.candidates[0].image,image);
  res=response();await createPricingHandler({getSecret:()=>secret})(req({action:'start',brief,audit,pricingProof}),res);assert.equal(res.code,200);const pricing=res.data.result,proposalProof=res.data.proposalProof;
  const expected=await pricingEngine.run({brief,scope:fallbackScope(brief)},{audit});assert.deepEqual(pricing.data.alternatives.map(a=>a.monthlyAmount),expected.data.alternatives.map(a=>a.monthlyAmount));
  res=response();await createProposalHandler({getSecret:()=>secret})(req({action:'start',brief,audit,pricing,proposalProof,logo,context:{leadId:'lead',spaceId:'space'}}),res);
  assert.equal(res.code,200);const proposal=res.data.result;assertResult('proposal',proposal);assert.equal(proposal.status,'review');assert.equal(proposal.data.logo.image,image);assert.equal(proposal.data.logo.reviewed,false);
  assert.deepEqual(proposal.data.sections,['intro','bhs','alternatives','scope','plan','contract']);assert.equal(proposal.data.alternatives.length,2);assert.equal(charged,cost);assert.equal(calls.length,count);
  const tampered=structuredClone(audit);tampered.data.sources[0].url='https://invented.example/';res=response();await createPricingHandler({getSecret:()=>secret})(req({action:'start',brief,audit:tampered,pricingProof}),res);assert.equal(res.code,422);assert.equal(charged,cost);
 }finally{if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;if(oldKey===undefined)delete process.env.OFFER_GEMINI_API_KEY;else process.env.OFFER_GEMINI_API_KEY=oldKey;}
});
