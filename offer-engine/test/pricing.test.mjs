import test from 'node:test';
import assert from 'node:assert/strict';
import {pricingEngine} from '../src/engines/pricing-engine.mjs';
import {catalog,costVersion} from '../src/pricing/catalog.mjs';
import {scopeEnvelope,parseTarget} from '../src/pricing/scope.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {createPricingHandler} from '../api/pricing.js';
import {assertResult} from '../src/contracts.mjs';
import {createResearchProvider} from '../src/bhs/provider.mjs';
import {brief as base} from './fixtures/bhs.mjs';

function context(extra={}){
 const brief=snapshotBrief({...base,services:'Meta, Google Ads ve tasarım',...extra});
 const audit={stage:'audit',status:'ready',data:{schemaVersion:'bhs-v1',briefHash:briefHash(brief),summary:'BHS ideal yatırım: 3 milyon TL.',findings:[{id:'f1',statement:'Kaynaklı bulgu.'}],services:[],serviceRecommendations:[],quality:{checksPassed:true,semanticBenchmark:'passed'}}};
 const scope={summary:'Öncelikli hizmet kapsamı.',budget:{posture:'unspecified',quote:null,targetQuote:null,targetScope:'unspecified'},services:['meta','google_ads','design'].map((serviceId,i)=>({serviceId,phase:'start',priority:i+1,reason:'Görüşmede konuşuldu.',briefQuote:brief.services,findingIds:['f1']})),exclusions:[]};
 return {brief,audit,scope};
}
const run=({brief,audit,scope},options={})=>pricingEngine.run({brief,scope,...options},{audit});
test('default pricing endpoint reuses signed budgeted scope without any provider call',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const {brief,audit,scope}=context();audit.data.scopePlan=scope;
  const secret='budgeted-test',session='s'.repeat(43),host='preview.vercel.app';
  const pricingProof=createPricingProof(secret).encode({kind:'audit_ready',createdAt:Date.now(),briefHash:briefHash(brief),auditHash:digest(audit),budgetLeadId:'lead1'},session,host);
  const handler=createPricingHandler({getSecret:()=>secret}),res={setHeader(){},status(n){this.code=n;return this;},json(value){this.data=value;return this;}};
  await handler({method:'POST',headers:{host,origin:'https://'+host,cookie:'__Host-offer-research='+session},body:{action:'start',brief,audit,pricingProof}},res);
  assert.equal(res.code,200);assert.equal(res.data.result.data.alternatives.length,2);
  assert.equal(createPricingProof(secret).decode(res.data.proposalProof,session,host).budgetLeadId,'lead1');
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('workbook corporate example: exact cost, floor and ideal; two scope alternatives, no CRM writes',async()=>{
 const ctx=context(),before=JSON.stringify(ctx),result=await run(ctx),data=result.data;
 assertResult('pricing',result);assert.equal(result.status,'ready');assert.equal(data.costVersion,costVersion);
 assert.equal(data.alternatives.length,2);assert.ok(data.alternatives.every(a=>a.billingPeriod==='monthly'));
 const [growth,bundle]=data.alternatives;
 assert.equal(bundle.cost,53000);assert.equal(bundle.minimumAmount,79500);assert.equal(bundle.monthlyAmount,106000);assert.equal(bundle.accountCost,15000);
 assert.equal(growth.cost,83000);assert.equal(growth.monthlyAmount,166000);assert.equal(growth.growthCosting.initialTeamCost,60000);assert.equal(growth.growthCosting.costBasis,68000);
 assert.equal(data.scope.target,null);assert.equal(data.scope.statedBudget,null);assert.equal(data.valueSync.performed,false);assert.equal(JSON.stringify(ctx),before);
});
test('catalogue retains original row count and segment-specific source values',()=>{
 assert.equal(catalog.length,27);
 assert.deepEqual(catalog.filter(x=>x.id==='growth_after')[0].costs,{kobi:20000,corporate:45000,key_account:60000});
 assert.deepEqual(catalog.filter(x=>x.id==='ugc')[0].costs,{kobi:10000,corporate:12500,key_account:15000});
});
test('single-service ACD exception and segment isolation; Growth uses full segment ACD and constant monthly basis',async()=>{
 for(const [segment,cost,initial,account]of [['kobi',6000,40000,10000],['corporate',9000,60000,15000],['key_account',12000,80000,20000]]){
  const ctx=context({segment});ctx.scope.services=ctx.scope.services.slice(0,1);
  const result=await run(ctx),[growth,bundle]=result.data.alternatives;
  assert.equal(bundle.cost,cost+5000);assert.equal(bundle.monthlyAmount,2*(cost+5000));assert.equal(growth.cost,initial+account);
 }
});
test('BHS money, scores and raw report cannot set a price or a budget',async()=>{
 const ctx=context(),before=(await run(ctx)).data.alternatives;
 ctx.audit.data.summary='İdeal yatırım 300 milyon TL.';ctx.audit.data.rawReport='3 milyon TL harcanmalı';ctx.audit.data.scoring={total:3};ctx.audit.data.findings[0].statement='Önerilen bütçe 3.000.000 TL';
 assert.deepEqual((await run(ctx)).data.alternatives,before);
 ctx.scope.budget={posture:'limited',quote:'İdeal yatırım 300 milyon TL.',targetQuote:'Aylık Sellf teklif 3 milyon TL.',targetScope:'sellf_fee'};
 const result=await run(ctx);assert.equal(result.data.scope.target,null);assert.equal(result.data.scope.budgetPosture,'unspecified');assert.deepEqual(result.data.alternatives,before);
});
test('qualitative low-budget context always quotes and narrows the scope without inventing a budget',async()=>{
 const ctx=context({budget:'',meetingNotes:'Çok bütçemiz yok, önce küçük başlayalım.'});
 ctx.scope.services.push({serviceId:'moderation',phase:'later',priority:3,reason:'Bütçe kısıtı nedeniyle sonra değerlendirilebilir.',briefQuote:ctx.brief.services,findingIds:[]});
 const result=await run(ctx);assert.equal(result.data.scope.budgetPosture,'limited');assert.equal(result.data.scope.selected.length,3);assert.equal(result.data.scope.deferred.length,1);assert.equal(result.data.scope.target,null);assert.equal(result.data.alternatives.length,2);assert.notEqual(result.data.recommendedAlternativeId,'growth_operations');
});
test('context inference preserves qualitative nuance and does not turn absence of a budget problem into a constraint',async()=>{
 const ctx=context({meetingNotes:'Bütçe kısıtımız yok. Bütçemiz az değil.'});
 assert.equal((await run(ctx)).data.scope.budgetPosture,'unspecified');
 ctx.brief=snapshotBrief({...ctx.brief,meetingNotes:'Bu ay yalnız pilotla başlayalım, genişleme sonra.'});ctx.audit.data.briefHash=briefHash(ctx.brief);
 ctx.scope.budget.posture='limited';ctx.scope.budget.quote=ctx.brief.meetingNotes;
 assert.equal((await run(ctx)).data.scope.budgetPosture,'limited');
});
test('an explicit monthly fee range can shape scope/price but cannot raise same-scope price or breach cost floor',async()=>{
 const ctx=context({meetingNotes:'Aylık Sellf teklifini 80–90 bin TL aralığında verelim.'});
 Object.assign(ctx.scope.budget,{targetQuote:ctx.brief.meetingNotes,targetScope:'sellf_fee'});
 const result=await run(ctx),bundle=result.data.alternatives[1];
 assert.deepEqual(result.data.scope.target,{scope:'sellf_fee',min:80000,max:90000,quote:ctx.brief.meetingNotes});assert.equal(bundle.monthlyAmount,90000);assert.equal(bundle.minimumAmount,79500);
 ctx.brief=snapshotBrief({...ctx.brief,meetingNotes:'Aylık Sellf teklifini 3 milyon TL verelim.'});ctx.audit.data.briefHash=briefHash(ctx.brief);ctx.scope.budget.targetQuote=ctx.brief.meetingNotes;
 assert.equal((await run(ctx)).data.alternatives[1].monthlyAmount,106000);
 ctx.brief=snapshotBrief({...ctx.brief,meetingNotes:'Aylık Sellf teklifini 1.000 TL verelim.'});ctx.audit.data.briefHash=briefHash(ctx.brief);ctx.scope.budget.targetQuote=ctx.brief.meetingNotes;
 const small=await run(ctx);assert.equal(small.data.alternatives.length,2);assert.equal(small.data.scope.selected.length,1);assert.ok(small.data.alternatives.every(a=>a.monthlyAmount>=a.minimumAmount&&a.budgetFit==='above'));assert.ok(small.data.notices.some(n=>n.includes('minimum')));
});
test('a numeric budget without scope and an explicit total-growth budget are not Sellf fee caps',async()=>{
 const ctx=context({budget:300000,meetingNotes:'Toplam aylık büyüme bütçesi 300 bin TL, reklam dahil.'});
 const original=(await run(ctx)).data.alternatives;
 Object.assign(ctx.scope.budget,{targetQuote:ctx.brief.meetingNotes,targetScope:'total_growth'});
 const result=await run(ctx);assert.equal(result.data.scope.target.scope,'total_growth');assert.deepEqual(result.data.alternatives,original);assert.ok(result.data.notices.some(n=>n.includes('uyum doğrulanamaz')));
});
test('monthly currency/range extraction rejects unrelated and invented figures',()=>{
 const ctx=context({meetingNotes:'Aylık Sellf teklif 100.000–150.000 TL.'});
 assert.equal(parseTarget(ctx.brief.meetingNotes,'sellf_fee',ctx.brief).max,15000000);
 for(const quote of ['Aylık teklif 3 milyon TL.','2026 ciro hedefi 3 milyon TL','Aylık reklam bütçesi 100 bin TL.'])assert.equal(parseTarget(quote,'sellf_fee',ctx.brief),null);
});
test('custom and zero-cost rows are pending, never free; even all-bespoke scope returns two priced initial alternatives',async()=>{
 const ctx=context({segment:'kobi'});ctx.scope.services=['ai','influencer','programmatic'].map(serviceId=>({...ctx.scope.services[0],serviceId}));
 const result=await run(ctx);assert.equal(result.status,'review');assert.equal(result.data.scope.pending.length,3);assert.equal(result.data.alternatives.length,2);assert.ok(result.data.alternatives.every(a=>a.monthlyAmount>0));assert.equal(result.data.scope.provisional,true);
 const custom=await run(ctx,{customCosts:[{serviceId:'ai',monthlyCost:12500.01}],influencerListAmount:100000});
 assert.equal(custom.data.scope.selected.find(s=>s.serviceId==='influencer').commissionAmount,10000);assert.ok(custom.data.alternatives[1].monthlyAmount>=custom.data.alternatives[1].minimumAmount);assertResult('pricing',custom);
 await assert.rejects(()=>run(context(),{customCosts:[{serviceId:'meta',monthlyCost:1}]}),/değiştirilemez/);
});
test('missing scope model still returns costed alternatives; wrong brief, unsupported services and duplicate webmaster cannot be accepted',async()=>{
 const ctx=context(),result=await pricingEngine.run({brief:ctx.brief},{audit:ctx.audit});assert.equal(result.status,'review');assert.equal(result.data.alternatives.length,2);
 const stale=context();stale.brief={...stale.brief,goals:'Different'};await assert.rejects(()=>run(stale),/doğrulanmış/);
 ctx.scope.services[0].serviceId='unknown';await assert.rejects(()=>run(ctx));
 const web=context();web.scope.services=['webmaster','ecommerce_webmaster'].map(serviceId=>({...web.scope.services[0],serviceId}));await assert.rejects(()=>run(web),/webmaster/);
});
test('scope provider has no search and receives only allowed catalogue IDs, selected brief and approved findings, never price control or CRM',async()=>{
 const ctx=context(),calls=[];ctx.audit.data.rawReport='PRIVATE LONG RAW';ctx.audit.data.contact='PRIVATE CONTACT';
 const provider=createResearchProvider({apiKey:'test',fetchImpl:async(url,options)=>{calls.push(JSON.parse(options.body));return new Response(JSON.stringify({id:'scope_12345678',status:'in_progress'}));}});
 await provider.planPricing(ctx.brief,ctx.audit.data);const request=calls[0],input=JSON.parse(request.input);
 assert.equal(request.tools,undefined);assert.equal(input.audit.rawReport,undefined);assert.equal(input.audit.contact,undefined);assert.ok(input.catalog.every(x=>!x.costs));assert.equal(request.background,true);
 assert.ok(scopeEnvelope(ctx.brief,ctx.audit.data).instructions.some(s=>s.includes('Teklif her zaman')));
});

function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(data){this.data=data;return this;}};}
const session='a'.repeat(43),host='preview.vercel.app',secret='test-pricing-secret';
function request(body,extra={}){return {method:'POST',headers:{host,origin:'https://'+host,cookie:'__Host-offer-research='+session,...extra},body};}
function signed(ctx,now=Date.now()){return createPricingProof(secret).encode({kind:'audit_ready',createdAt:now,briefHash:briefHash(ctx.brief),auditHash:digest(ctx.audit)},session,host);}
test('pricing API binds actual approved audit to host/session/brief; idempotent paid start and deterministic completion',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const ctx=context(),proof=signed(ctx),body={action:'start',requestId:'price_request_12345678',brief:ctx.brief,audit:ctx.audit,pricingProof:proof};let starts=0;
  const handler=createPricingHandler({getSecret:()=>secret,getProvider:()=>({configured:()=>true,async planPricing(){starts++;return {id:'scope_12345678'};},async poll(){return {status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(ctx.scope)}]}]};}})});
  const first=response(),again=response();await handler(request(body),first);await handler(request(body),again);assert.equal(starts,1);assert.equal(first.statusCode,202);
  const done=response();await handler(request({...body,action:'status',ticket:first.data.ticket}),done);assert.equal(done.statusCode,200);assert.equal(done.data.result.data.alternatives[1].monthlyAmount,106000);
  for(const bad of [{...body,audit:{...ctx.audit,status:'review'}},{...body,brief:{...ctx.brief,goals:'Changed'}}]){const res=response();await handler(request(bad),res);assert.equal(res.statusCode,422);}
  const other=response();await handler(request(body,{cookie:'__Host-offer-research='+'b'.repeat(43)}),other);assert.equal(other.statusCode,422);assert.equal(starts,1);
  const origin=response();await handler(request(body,{origin:'https://elsewhere.example'}),origin);assert.equal(origin.statusCode,403);
  process.env.VERCEL_ENV='production';const closed=response();await handler(request(body),closed);assert.equal(closed.statusCode,503);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('provider failure or invalid scope still returns priced alternatives once, without inventing budget or retrying paid POST',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const ctx=context({meetingNotes:'Çok bütçemiz yok.'}),body={action:'start',requestId:'price_request_12345678',brief:ctx.brief,audit:ctx.audit,pricingProof:signed(ctx)};let starts=0;
  const handler=createPricingHandler({getSecret:()=>secret,getProvider:()=>({configured:()=>true,async planPricing(){starts++;throw Error('provider unavailable');}})});
  for(let i=0;i<2;i++){const res=response();await handler(request(body),res);assert.equal(res.statusCode,200);assert.equal(res.data.result.data.alternatives.length,2);assert.equal(res.data.result.data.scope.target,null);assert.equal(res.data.result.status,'review');}
  assert.equal(starts,1);
  const invalid=createPricingHandler({getSecret:()=>secret,getProvider:()=>({configured:()=>true,async planPricing(){return {id:'scope_12345678'};},async poll(){return {status:'completed',steps:[{type:'model_output',content:[{type:'text',text:'{"price":3000000}'}]}]};}})});
  const start=response();await invalid(request(body),start);const done=response();await invalid(request({...body,action:'status',ticket:start.data.ticket}),done);assert.equal(done.statusCode,200);assert.equal(done.data.result.data.alternatives.length,2);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
