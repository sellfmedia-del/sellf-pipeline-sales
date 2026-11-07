import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {pricingEngine} from '../src/engines/pricing-engine.mjs';
import {proposalEngine} from '../src/engines/proposal-engine.mjs';
import {operations,segments} from '../src/pricing/catalog.mjs';
import {normalizeMonthlyPlan} from '../src/pricing/monthly.mjs';
import {assertResult} from '../src/contracts.mjs';
import {addQuote,assertQuote,usdAmount} from '../src/pricing/currency.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {createPricingHandler} from '../api/pricing.js';
import {createProposalHandler} from '../api/proposal.js';
import {createOfferHandler} from '../api/offer.js';
import {logoProof} from '../src/proposal/logo-proof.mjs';
import {priceTerms,negotiatedDocument} from '../src/proposal/negotiation.mjs';
import {offerFixture,response,fx} from './fixtures/offer.mjs';

const example={months:[{month:1,services:[{serviceId:'webmaster',description:'Website kurulumu'}]},{month:2,services:[{serviceId:'brand_marketing',description:'Brandbook'}]},{month:3,services:[{serviceId:'social'},{serviceId:'ugc'}]},{month:4,services:[{serviceId:'social'},{serviceId:'ugc'},{serviceId:'meta'},{serviceId:'onsite_seo'}]}]};
const run=(f,monthlyPlan=example)=>pricingEngine.run({brief:f.brief,pricingMode:'monthly',monthlyPlan},{audit:f.audit});

test('fractional custom costs and influencer list commissions retain exact kuruş, without multiplying commission or duplicating account cost',async()=>{
 const f=await offerFixture(),result=await run(f,{months:[{month:1,services:[{serviceId:'ai',customCost:12345.67},{serviceId:'influencer'}],influencerListAmount:100000.01}]});
 const row=result.data.monthlyPlan.months[0];assert.equal(row.accountCost,0);assert.equal(row.cost,12345.67);assert.equal(row.commissionAmount,10000.01);assert.equal(row.monthlyAmount,34691.35);assert.equal(row.minimumAmount,28518.52);
 await assert.rejects(()=>run(f,{months:[{month:1,services:[{serviceId:'ai',customCost:1.005}]}]}),/iki ondalıklı/);
 await assert.rejects(()=>run(f,{months:[{month:1,services:[{serviceId:'ai',customCost:0.00000001}]}]}),/iki ondalıklı/);
});

test('monthly selection uses sheet costs and existing ideal rules for every segment/service, exactly matching standard operations costing',async()=>{
 const f=await offerFixture();
 for(const segment of segments)for(const service of operations){
  const brief=snapshotBrief({...f.brief,segment}),audit={...f.audit,data:{...f.audit.data,briefHash:briefHash(brief)}},custom=service.costs[segment]===0&&service.kind!=='commission';
  const row={month:1,services:[{serviceId:service.id,...(custom?{customCost:12345.67}:{})}],...(service.kind==='commission'?{influencerListAmount:123456.78}:{})};
  const monthly=await run({brief,audit},{months:[row]});assertResult('pricing',monthly);
  const scope={summary:'Explicit scope.',budget:{posture:'unspecified',quote:null,targetQuote:null,targetScope:'unspecified'},services:[{serviceId:service.id,phase:'start',priority:1,reason:'Selected service.',briefQuote:brief.services,findingIds:[]}],exclusions:[]};
  const standard=await pricingEngine.run({brief,serviceSelection:{services:row.services,...(service.kind==='commission'?{influencerListAmount:123456.78}:{})}},{audit});
  for(const key of ['monthlyAmount','cost','minimumAmount','idealAmount','accountCost'])assert.equal(monthly.data.monthlyPlan.months[0][key],standard.data.alternatives[1][key],segment+' '+service.id+' '+key);
 }
});

test('each month contains only selected work; one-off operations stop, account is counted once, and budgets/BHS cannot override an explicit plan',async()=>{
 const f=await offerFixture(),before=structuredClone(f),result=await run(f),rows=result.data.monthlyPlan.months;
 assert.deepEqual(rows.map(row=>row.monthlyAmount),[18000,30000,55000,91000]);
 assert.equal(rows[0].accountCost,0);assert.equal(rows[2].accountCost,0);
 assert.equal(rows[3].services.some(s=>s.serviceId==='webmaster'),false);
 assert.deepEqual(f,before);assert.equal(result.data.recommendedAlternativeId,'operations_bundle');
 const brief=snapshotBrief({...f.brief,budget:1,meetingNotes:'Aylık Sellf teklif 1 TL, çok kısıtlı bütçe.'}),audit={...f.audit,data:{...f.audit.data,briefHash:briefHash(brief),summary:'İdeal yatırım 999 milyon TL'}};
 assert.deepEqual((await run({brief,audit})).data.monthlyPlan,result.data.monthlyPlan);
 const standard=await pricingEngine.run({brief:f.brief,scope:f.scope},{audit:f.audit});assert.equal(standard.data.pricingMode,undefined);assert.equal(standard.data.monthlyPlan,undefined);
});

test('missing costs, invalid/duplicate months/services, fixed cost overrides and unpriced influencers fail before a quote is created',async()=>{
 const f=await offerFixture();
 const bad=[{}, {months:[]},{months:[{month:2,services:[{serviceId:'meta'}]}]},{months:[{month:1,services:[]}]},{months:[{month:1,services:[{serviceId:'unknown'}]}]},{months:[{month:1,services:[{serviceId:'meta'},{serviceId:'meta'}]}]},{months:[{month:1,services:[{serviceId:'meta',customCost:1}]}]},{months:[{month:1,services:[{serviceId:'ai'}]}]},{months:[{month:1,services:[{serviceId:'influencer'}]}]},{months:[{month:1,services:[{serviceId:'webmaster'},{serviceId:'ecommerce_webmaster'}]}]},{months:[{month:1,services:[{serviceId:'meta',description:'<script>'}]}]},{months:Array.from({length:37},(_,i)=>({month:i+1,services:[{serviceId:'meta'}]}))}];
 for(const plan of bad)assert.throws(()=>normalizeMonthlyPlan(plan,'corporate'));
 await assert.rejects(()=>pricingEngine.run({brief:f.brief,monthlyPlan:example},{audit:f.audit}));
 await assert.rejects(()=>pricingEngine.run({brief:f.brief,pricingMode:'monthly',monthlyPlan:example,customCosts:[]},{audit:f.audit}));
});

test('all month amounts use the same frozen TCMB rate; incomplete or tampered monthly FX cannot compose',async()=>{
 const f=await offerFixture(),price=await run(f),usd=addQuote(price,{currency:'USD',exchangeRate:fx});assertResult('pricing',usd);assertQuote(usd.data,{requireReady:true});
 for(const row of usd.data.monthlyPlan.months)assert.equal(usd.data.quote.monthlyPlan.months[row.month-1].monthlyAmount,usdAmount(row.monthlyAmount,fx.rate));
 const bad=structuredClone(usd);bad.data.quote.monthlyPlan.months[1].monthlyAmount=1;assert.throws(()=>assertResult('pricing',bad));
 const pending=addQuote(price,{currency:'USD'});assert.equal(pending.data.quote.status,'pending');
 await assert.rejects(()=>proposalEngine.run({brief:f.brief,copy:f.copy},{...f,pricing:pending}));
});

test('monthly assembly preserves logo and common content, builds its workflow from the same priced months and removes every internal cost',async()=>{
 const f=await offerFixture(),pricing={stage:'pricing',...await run(f)},before=structuredClone(f);
 const baseline=(await proposalEngine.run({brief:f.brief,copy:f.copy}, f)).data;
 const doc=(await proposalEngine.run({brief:f.brief,copy:f.copy}, {...f,pricing})).data;assertResult('proposal',{status:'review',data:doc});
 assert.deepEqual(doc.brand,f.row.customer_document.brand);assert.deepEqual(doc.copy,f.row.customer_document.copy);assert.deepEqual(doc.logo,baseline.logo);assert.deepEqual(doc.bhs,f.row.customer_document.bhs);
 assert.ok(doc.alternatives.every(a=>a.services.every(s=>s.id!=='growth')),'monthly mode must never add unselected Growth services');
 assert.equal(doc.plans.operations_bundle.steps.length,4);assert.match(doc.plans.operations_bundle.steps[0].title,/Website kurulumu/);assert.match(doc.plans.operations_bundle.steps[3].title,/Meta/);
 for(const row of doc.monthlyPlan.months){assert.deepEqual(Object.keys(row).sort(),['month','monthlyAmount','services']);for(const service of row.services)assert.deepEqual(Object.keys(service).sort(),['description','id','name']);}
 assert.deepEqual(f,before);
 assert.equal(priceTerms({customer_document:doc,pricing_snapshot:pricing.data}).readOnly,true);
 assert.throws(()=>negotiatedDocument({customer_document:doc,pricing_snapshot:pricing.data},{growth_operations:1,operations_bundle:1}),/sabit fiyat ekranından/);
});

test('signed audit → monthly pricing → English proposal → save binds every month, preserves source/run and never calls scope/research/logo providers',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const f=await offerFixture(),secret='monthly-acceptance-secret',session='s'.repeat(43),host='preview.vercel.app',codec=createPricingProof(secret);
  const req=body=>({method:'POST',headers:{host,origin:'https://'+host,cookie:'__Host-offer-research='+session,authorization:'Bearer '+'j'.repeat(40)},body});
  const claims={kind:'audit_ready',createdAt:Date.now(),briefHash:f.hash,auditHash:digest(f.audit),budgetLeadId:'lead-1',budgetResearchRunId:'run-1',sourceOfferId:f.row.id};
  const pricingHandler=createPricingHandler({getSecret:()=>secret,getProvider:()=>assert.fail('Monthly pricing must not call an AI scope provider'),getExchangeRate:async()=>fx});
  const priced=response();await pricingHandler(req({action:'start',brief:{...f.brief,currency:'USD'},audit:f.audit,pricingProof:codec.encode(claims,session,host),pricingMode:'monthly',monthlyPlan:example}),priced);assert.equal(priced.code,200,JSON.stringify(priced.data));
  let translations=0;const proposalHandler=createProposalHandler({getSecret:()=>secret,getLedger:async(_q,_s,id,options)=>{assert.equal(id,'lead-1');assert.equal(options.researchRunId,'run-1');return {status:async()=>({chargedKurus:500,capKurus:5000})};},getProviders:()=>({generate:async(stage,{texts})=>{assert.equal(stage,'proposal_translation');translations++;return {model:'synthetic-translation',data:{translations:texts.map(t=>'English '+t)}};}})});
  const b={action:'start',brief:{...f.brief,currency:'USD',language:'en'},context:{leadId:'lead-1',spaceId:'space-1'},audit:f.audit,pricing:priced.data.result,proposalProof:priced.data.proposalProof,logo:{...f.logo.data,logoProof:logoProof(secret,host,f.logo.data)}};
  const composed=response();await proposalHandler(req(b),composed);assert.equal(composed.code,200,JSON.stringify(composed.data));assert.equal(translations,1);assert.equal(composed.data.result.data.language,'en');
  assert.match(composed.data.result.data.monthlyPlan.months[0].services[0].description,/^English/);
  const tampered=structuredClone(b);tampered.pricing.data.monthlyPlan.months[0].monthlyAmount=1;const rejected=response();await proposalHandler(req(tampered),rejected);assert.equal(rejected.code,422);assert.equal(translations,1);
  let saved;const h=createOfferHandler({getSecret:()=>secret,getStore:()=>({save:()=>assert.fail('Existing source card value must remain unchanged'),saveVariant:async(_token,args,source)=>{saved={args,source};return {id:'saved',version:2};}})});
  const done=response();await h(req({action:'save',leadId:'lead-1',spaceId:'space-1',proposal:composed.data.result,pricing:priced.data.result,saveProof:composed.data.saveProof,logoApproved:true,scopeApproved:true}),done);assert.equal(done.code,200,JSON.stringify(done.data));assert.equal(saved.source,f.row.id);assert.equal(saved.args.p_document.monthlyPlan.months.length,4);assert.equal(saved.args.p_pricing.monthlyPlan.months.length,4);
  const sandbox={window:{},URL,Intl};vm.runInNewContext(await readFile(new URL('../../offers/proposal.js',import.meta.url),'utf8'),sandbox);
  const mail=new URL(sandbox.window.PipelineProposal.buildMailto({...composed.data.result.data,version:2},{offerUrl:'https://preview.vercel.app/brand-teklifi',offerId:'saved',alternativeId:'operations_bundle',name:'Person',email:'person@example.com'}));
  for(const month of [1,2,3,4])assert.match(mail.searchParams.get('body'),new RegExp('Month '+month+':'));
  assert.equal(mail.searchParams.get('body').includes('Monthly service fee:'),false);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
