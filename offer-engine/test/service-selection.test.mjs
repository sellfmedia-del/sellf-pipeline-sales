import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {pricingEngine} from '../src/engines/pricing-engine.mjs';
import {proposalEngine} from '../src/engines/proposal-engine.mjs';
import {catalog,operations,segments,projects} from '../src/pricing/catalog.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {assertResult} from '../src/contracts.mjs';
import {addQuote,assertQuote,usdAmount} from '../src/pricing/currency.mjs';
import {createPricingHandler} from '../api/pricing.js';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {localizeProposal} from '../src/proposal/language.mjs';
import {offerFixture,response,fx} from './fixtures/offer.mjs';
const selected=(f,serviceSelection)=>pricingEngine.run({brief:f.brief,serviceSelection},{audit:f.audit});

test('every selected retainer uses only its own sheet cost, without any Account/Growth inference or budget trimming',async()=>{
 const f=await offerFixture();
 for(const segment of segments)for(const service of operations){
  const brief=snapshotBrief({...f.brief,segment,budget:1,services:'Tüm hizmetleri ve dijital reklamları ekle, sadece 1 TL.'}),audit={...f.audit,data:{...f.audit.data,briefHash:briefHash(brief)}},custom=service.costs[segment]===0&&service.kind!=='commission';
  const serviceSelection={services:[{serviceId:service.id,...(custom?{customCost:12345.67}:{})}],projects:[],...(service.kind==='commission'?{influencerListAmount:123456.78}:{})};
  const got=await selected({brief,audit},serviceSelection);assertResult('pricing',got);
  const cost=custom?12345.67:service.costs[segment],commission=service.kind==='commission'?12345.68:0;
  assert.equal(got.data.alternatives[1].monthlyAmount,cost*2+commission);
  assert.equal(got.data.alternatives[0].monthlyAmount,cost*2+commission);
  assert.deepEqual(got.data.scope.selected.map(s=>s.serviceId),[service.id]);assert.deepEqual(got.data.scope.deferred,[]);assert.deepEqual(got.data.scope.pending,[]);
 }
});

test('all 8 project rows and 3 segments match the project sheet, stay one-off and leave both retainers unchanged',async()=>{
 const f=await offerFixture(),expected=[[10000,15000,20000],[0,0,0],[20000,27500,32400],[15000,20000,30000],[15000,20000,30000],[1500,3000,4500],[4500,6000,9000],[0,0,0]];
 for(const [i,s]of projects.entries())for(const [j,segment]of segments.entries()){
  const brief=snapshotBrief({...f.brief,segment}),audit={...f.audit,data:{...f.audit.data,briefHash:briefHash(brief)}},base={services:[{serviceId:'meta'}],projects:[]};
  const before=await selected({brief,audit},base),quantity=['project_static','project_motion'].includes(s.id)?3:1,unit=expected[i][j]||12345.67;
  const result=await selected({brief,audit},{...base,projects:[{serviceId:s.id,quantity,...(expected[i][j]===0?{customCost:unit}:{})}]});assertResult('pricing',result);
  assert.deepEqual(result.data.alternatives,before.data.alternatives);const row=result.data.projectPlan.items[0],account=s.id==='project_account'?unit*quantity:0;
  assert.equal(row.cost,Math.round(unit*quantity*100)/100);assert.equal(row.amount,Math.round(unit*quantity*200)/100);assert.equal(row.accountCost,account);assert.equal(result.data.projectPlan.oneTimeAmount,row.amount);
 }
});

test('project-only months charge no retainer, project-only standard has a zero operation retainer, and subsequent months do not repeat projects',async()=>{
 const f=await offerFixture(),selection={services:[],projects:[{serviceId:'project_brandbook'}]};
 const standard=await selected(f,selection);assertResult('pricing',standard);assert.equal(standard.data.alternatives[1].monthlyAmount,0);assert.equal(standard.data.recommendedAlternativeId,'operations_bundle');assert.equal(standard.data.projectPlan.oneTimeAmount,55000);
 const result=await pricingEngine.run({brief:f.brief,pricingMode:'monthly',monthlyPlan:{months:[{month:1,...selection},{month:2,services:[{serviceId:'email_marketing'}]}]}},{audit:f.audit});assertResult('pricing',result);
 assert.deepEqual(result.data.monthlyPlan.months.map(m=>m.monthlyAmount),[0,40000]);assert.equal(result.data.monthlyPlan.months[0].projectPlan.oneTimeAmount,55000);assert.equal(result.data.monthlyPlan.months[1].projectPlan,undefined);
});

test('missing costs, repeated selections, cross-category IDs, fixed overrides and invalid units never silently price or infer a replacement',async()=>{
 const f=await offerFixture(),base={services:[{serviceId:'meta'}],projects:[]};
 for(const bad of [null,{}, {services:[],projects:[]},{...base,services:[{serviceId:'not_a_service'}]},{...base,services:[{serviceId:'meta'},{serviceId:'meta'}]},{...base,services:[{serviceId:'meta',customCost:1}]},{...base,projects:[{serviceId:'project_custom_website'}]},{...base,projects:[{serviceId:'meta'}]},{...base,projects:[{serviceId:'project_brandbook',customCost:1}]},{...base,projects:[{serviceId:'project_brandbook',quantity:2}]},{...base,projects:[{serviceId:'project_static',quantity:1.5}]},{...base,projects:[{serviceId:'project_app',customCost:1.005}]}])await assert.rejects(()=>selected(f,bad));
 await assert.rejects(()=>pricingEngine.run({brief:f.brief,scope:f.scope,serviceSelection:base},{audit:f.audit}));
});

test('project amounts survive FX, proposal, translation and email; customer data contains no costs and tampered totals fail',async()=>{
 const f=await offerFixture(),price=await selected(f,{services:[{serviceId:'meta'}],projects:[{serviceId:'project_brandbook'},{serviceId:'project_static',quantity:3}]}),pricing=addQuote(price,{currency:'USD',exchangeRate:fx});assertResult('pricing',pricing);
 const doc=(await proposalEngine.run({brief:f.brief,copy:f.copy},{...f,pricing})).data;assertResult('proposal',{status:'review',data:doc});
 const translated=await localizeProposal(doc,'en',{providers:{generate:async(_stage,{texts})=>({model:'fixture',data:{translations:texts.map(t=>'English '+t)}})}});assertResult('proposal',{status:'review',data:translated});
 assert.deepEqual(translated.projectPlan.items.map(p=>p.amount),doc.projectPlan.items.map(p=>p.amount));assert.ok(!JSON.stringify(doc.projectPlan).match(/cost|Cost|minimum|ideal/));assert.match(translated.projectPlan.items[0].name,/English/);
 assert.equal(pricing.data.quote.projectPlan.oneTimeAmount,Math.round(pricing.data.quote.projectPlan.items.reduce((sum,p)=>sum+Math.round(p.amount*100),0))/100);
 for(const item of pricing.data.quote.projectPlan.items)assert.equal(item.amount,usdAmount(doc.projectPlan.items.find(p=>p.id===item.id).amount,fx.rate));
 const bad=structuredClone(pricing);bad.data.quote.projectPlan.items[0].amount=1;assert.throws(()=>assertQuote(bad.data));const badDoc=structuredClone(doc);badDoc.projectPlan.oneTimeAmount=1;assert.throws(()=>assertResult('proposal',{status:'review',data:badDoc}));
 const sandbox={window:{},URL,Intl};vm.runInNewContext(await readFile(new URL('../../offers/proposal.js',import.meta.url),'utf8'),sandbox);
 const mail=new URL(sandbox.window.PipelineProposal.buildMailto({...doc,version:1},{offerUrl:'https://preview.vercel.app/brand-teklifi',offerId:'saved',alternativeId:'growth_operations',name:'Person',email:'person@example.com'}));assert.match(mail.searchParams.get('body'),/Tek seferlik projeler:/);assert.match(mail.searchParams.get('body'),/Brandbook/);
});

test('signed explicit selection bypasses any scope provider and BHS scopePlan; editing selection reuses the same audit proof',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const f=await offerFixture(),secret='selection-test-secret',session='s'.repeat(43),host='preview.vercel.app',codec=createPricingProof(secret),proof=codec.encode({kind:'audit_ready',createdAt:Date.now(),briefHash:f.hash,auditHash:digest(f.audit)},session,host);
  const handler=createPricingHandler({getSecret:()=>secret,getProvider:()=>assert.fail('No scope provider call allowed')});
  for(const id of ['meta','email_marketing']){const out=response();await handler({method:'POST',headers:{host,origin:'https://'+host,cookie:'__Host-offer-research='+session},body:{action:'start',brief:f.brief,audit:f.audit,pricingProof:proof,serviceSelection:{services:[{serviceId:id}],projects:[{serviceId:'project_brandbook'}]}}},out);assert.equal(out.code,200,JSON.stringify(out.data));assert.deepEqual(out.data.result.data.scope.selected.map(s=>s.serviceId),[id]);}
  const matrix={alternatives:[{id:'growth_operations',services:[{serviceId:'account'},{serviceId:'growth_initial'}]},{id:'operations_bundle',services:[{serviceId:'meta'}]}],projects:[{serviceId:'project_account'},{serviceId:'project_brandbook'}]},out=response();
  await handler({method:'POST',headers:{host,origin:'https://'+host,cookie:'__Host-offer-research='+session},body:{action:'start',brief:f.brief,audit:f.audit,pricingProof:proof,serviceSelection:matrix}},out);assert.equal(out.code,200,JSON.stringify(out.data));assert.deepEqual(out.data.result.data.alternatives.map(a=>a.monthlyAmount),[150000,18000]);assert.equal(out.data.result.data.projectPlan.oneTimeAmount,85000);assert.equal(codec.decode(out.data.proposalProof,session,host).pricingHash,digest(out.data.result));
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});


test('source coverage: every named row in BOTH sheet tabs and all 108 segment costs have a selectable catalogue entry',async()=>{
 const source=JSON.parse(await readFile(new URL('./fixtures/cost-sheet-2026-11-07.json',import.meta.url),'utf8'));
 assert.equal(catalog.length,source.retainers.length);assert.equal(projects.length,source.projects.length);
 for(const [rows,items]of [[source.retainers,catalog],[source.projects,projects]])for(const row of rows){const item=items.find(s=>s.row===row.row);assert.ok(item,row.name);assert.equal(item.sourceName,row.name);assert.deepEqual(segments.map(seg=>item.costs[seg]),row.costs);}
 const f=await offerFixture();
 for(const item of catalog){const custom=item.costs.corporate===0&&item.kind!=='commission',selection={services:[{serviceId:item.id,...(custom?{customCost:12345.67}:{})}],...(item.kind==='commission'?{influencerListAmount:123456.78}:{})};const result=await selected(f,selection);assertResult('pricing',result);assert.deepEqual(result.data.alternatives[0].services.map(s=>s.serviceId),[item.id]);}
});

test('each standard alternative independently sums exactly selected Growth/Account rows; monthly and project rows never invent a coordinator',async()=>{
 const f=await offerFixture(),serviceSelection={alternatives:[{id:'growth_operations',services:[{serviceId:'growth_initial'},{serviceId:'account'}]},{id:'operations_bundle',services:[{serviceId:'google_ads'}]}],projects:[{serviceId:'project_brandbook'}]};
 const result=await selected(f,serviceSelection);assertResult('pricing',result);
 assert.deepEqual(result.data.alternatives.map(a=>a.cost),[75000,9000]);assert.deepEqual(result.data.alternatives.map(a=>a.monthlyAmount),[150000,18000]);assert.deepEqual(result.data.alternatives.map(a=>a.accountCost),[15000,0]);assert.equal(result.data.projectPlan.oneTimeAmount,55000);
 const plan={months:[{month:1,services:serviceSelection.alternatives[0].services},{month:2,services:[{serviceId:'growth_after'}]},{month:3,services:[{serviceId:'account'}]},{month:4,services:[{serviceId:'meta'}]}]};
 const monthly=await pricingEngine.run({brief:f.brief,pricingMode:'monthly',monthlyPlan:plan},{audit:f.audit});assertResult('pricing',monthly);assert.deepEqual(monthly.data.monthlyPlan.months.map(m=>m.monthlyAmount),[150000,90000,30000,18000]);assert.deepEqual(monthly.data.monthlyPlan.months.map(m=>m.accountCost),[15000,0,15000,0]);
 const withAccount=await selected(f,{...serviceSelection,projects:[{serviceId:'project_account'},{serviceId:'project_brandbook'}]});assert.equal(withAccount.data.projectPlan.oneTimeAmount,85000);assert.deepEqual(withAccount.data.projectPlan.items.map(p=>p.cost),[15000,27500]);
 const combined=await selected(f,{services:[{serviceId:'growth_initial'},{serviceId:'growth_after'},{serviceId:'growth_consultant'},{serviceId:'account'}]});assert.equal(combined.data.alternatives[0].cost,150000);assert.equal(combined.data.alternatives[0].monthlyAmount,300000);
});

test('an alternative with no selected scope is disabled, cannot become a free contract and cannot be changed by the legacy two-price editor',async()=>{
 const f=await offerFixture(),pricing=await selected(f,{alternatives:[{id:'growth_operations',services:[]},{id:'operations_bundle',services:[{serviceId:'growth_initial'},{serviceId:'account'}]}]});assertResult('pricing',pricing);assert.equal(pricing.data.alternatives[0].available,false);assert.equal(pricing.data.recommendedAlternativeId,'operations_bundle');
 const doc=(await proposalEngine.run({brief:f.brief,copy:f.copy},{...f,pricing})).data;assertResult('proposal',{status:'ready',data:doc});assert.equal(doc.alternatives[0].available,false);assert.deepEqual(doc.alternatives[1].services.map(s=>s.id),['growth_initial','account']);
 const {priceTerms,negotiatedDocument}=await import('../src/proposal/negotiation.mjs');assert.equal(priceTerms({customer_document:doc,pricing_snapshot:pricing.data}).readOnly,true);assert.throws(()=>negotiatedDocument({customer_document:doc,pricing_snapshot:pricing.data},{growth_operations:1,operations_bundle:1}));
 const sandbox={window:{},URL,Intl};vm.runInNewContext(await readFile(new URL('../../offers/proposal.js',import.meta.url),'utf8'),sandbox);assert.throws(()=>sandbox.window.PipelineProposal.buildMailto({...doc,version:1},{offerUrl:'https://preview.vercel.app/brand-teklifi',offerId:'saved',alternativeId:'growth_operations',name:'Person',email:'person@example.com'}));
 const bad=structuredClone(doc);bad.recommendedAlternativeId='growth_operations';assert.throws(()=>assertResult('proposal',{status:'ready',data:bad}));
});


test('an unfinished legacy explicit quote keeps its already-priced Growth scope; new manual-cost quotes never acquire unselected Growth',async()=>{
 const f=await offerFixture(),old=structuredClone(f.pricing);old.data.selectionMode='explicit';old.data.costVersion='sellf-costs-2026-11-06-v2';
 const legacy=await proposalEngine.run({brief:f.brief,copy:f.copy},{...f,pricing:old});assertResult('proposal',legacy);assert.ok(legacy.data.alternatives[0].services.some(s=>s.id==='growth'));assert.deepEqual(legacy.data.alternatives.map(a=>a.monthlyAmount),old.data.alternatives.map(a=>a.monthlyAmount));
 const pricing=await selected(f,{services:[{serviceId:'meta'}]});const current=await proposalEngine.run({brief:f.brief,copy:f.copy},{...f,pricing});assertResult('proposal',current);assert.deepEqual(current.data.alternatives[0].services.map(s=>s.id),['meta']);assert.equal(current.data.alternatives[0].monthlyAmount,18000);
});
