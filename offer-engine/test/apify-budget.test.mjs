import test from 'node:test';
import assert from 'node:assert/strict';
import {createApifyAdapter} from '../src/bhs/apify-adapter.mjs';
import {actorIds,actorInput} from '../src/bhs/apify-inputs.mjs';
import {createLedger} from '../src/budget/ledger.mjs';
import {brief,packet} from './fixtures/sequential.mjs';
const now=()=>Date.parse('2026-11-10T12:00:00Z'),json=v=>new Response(JSON.stringify(v));
const actor='apify/instagram-profile-scraper',request={actor,url:'https://www.instagram.com/acmeorganic/',countryCode:'TR',language:'tr',purpose:'Doğru markanın profilini doğrula.'};
const context=()=>({brief,packet:packet(),searches:[],geo:{countryCode:'TR',language:'tr'}});
function account(){
 const rows=new Map();let charged=500;
 const ledger=createLedger(async(op,a={})=>{
  if(['begin','status'].includes(op))return {chargedKurus:charged,capKurus:5000};
  if(op==='get')return rows.get(a.step)||null;
  const prior=rows.get(a.step);
  if(op==='reserve'){
   if(prior){assert.equal(prior.input_hash,a.hash);return {claimed:false,step:prior};}
   if(charged+a.amount>5000)return {blocked:true};charged+=a.amount;
   const step={input_hash:a.hash,claim_token:a.token,charge_kurus:a.amount,state:'reserved'};rows.set(a.step,step);return {claimed:true,step};
  }
  assert.equal(prior.claim_token,a.token);
  if(op==='complete'){charged-=prior.charge_kurus-a.amount;prior.charge_kurus=a.amount;}
  const step={...prior,state:op,value:a.value};rows.set(a.step,step);return step;
 });return {ledger,rows};
}
function transport({cap=.01,extraFees=false,timeout=false,echoCap=true,wrongIdentity=false,large=false}={}){
 const calls=[];
 const task={id:'Task1234567890123',actId:actorIds[actor],options:{maxTotalChargeUsd:cap}};
 const fetchImpl=async(url,options)=>{
  calls.push({url,body:options?.body?JSON.parse(options.body):null});
  if(url.includes('/acts/')&&!url.includes('/runs?'))return json({data:{pricingInfos:[{startedAt:'2026-01-01',pricingModel:'PAY_PER_EVENT',isPPEPlatformUsagePaidByUser:extraFees}]}});
  if(url.includes('/runs?')){if(timeout)throw new DOMException('Timed out','TimeoutError');return json({data:{id:'Run12345678901234',options:echoCap?{maxTotalChargeUsd:Number(new URL(url).searchParams.get('maxTotalChargeUsd'))}:{}}});}
  if(url.includes('/abort'))return json({data:{status:'ABORTED'}});
  if(url.includes('/actor-runs/'))return json({data:{status:'SUCCEEDED',defaultDatasetId:'Data1234567890123',usageTotalUsd:.0023}});
  if(url.includes('/datasets/'))return large?new Response('x',{headers:{'content-length':'1000001'}}):json([{username:wrongIdentity?'other-company':'acmeorganic',fullName:'Acme Organic',followersCount:123,postsCount:14,biography:'Acme Organic organik atıştırmalık ürünleri.',externalUrl:brief.website,privatePhone:'must not become evidence'}]);
  throw Error('Unexpected API request '+url);
 };
 return {calls,fetchImpl,task};
}
function adapter(db,t,options={}){return createApifyAdapter({ledger:db.ledger,token:'test-token',fetchImpl:t.fetchImpl,now,delay:async()=>{},getTaskPolicies:async()=>[t.task],...options});}
test('actor start explicitly carries the smaller Task cap and all fees share the same 50 TRY account',async()=>{
 const db=account(),t=transport(),a=adapter(db,t),result=await a.enrich(request,context());
 assert.equal(result.status,'complete');assert.equal(result.pages.length,1);assert.ok(!JSON.stringify(result.pages).includes('must not become evidence'));
 const start=t.calls.find(c=>c.url.includes('/runs?'));assert.equal(new URL(start.url).searchParams.get('maxTotalChargeUsd'),'.01'.replace(/^\./,'0.'));assert.equal(new URL(start.url).searchParams.get('timeout'),'60');
 assert.deepEqual(start.body,{usernames:['acmeorganic'],includeAboutSection:false});
 assert.equal((await db.ledger.status()).chargedKurus,500+72+10);
 const merged=a.mergeEvidence(packet(),[result]);assert.ok(merged.sources.some(s=>s.provenance?.actor===actor));
});
test('resuming after other charges reuses the original run even when the remaining budget is smaller',async()=>{
 const db=account(),t=transport({cap:.04}),a=adapter(db,t);await a.enrich(request,context());
 await db.ledger.once('later-model',{},3000,async()=>({saved:true}));
 const cost=await db.ledger.status();await a.enrich(request,context());
 assert.equal(t.calls.filter(c=>c.url.includes('/runs?')).length,1);assert.equal(t.calls.filter(c=>c.url.includes('/datasets/')).length,1);assert.deepEqual(await db.ledger.status(),cost);
});
test('an ambiguous Actor start holds its entire charge and is never replayed',async()=>{
 const db=account(),t=transport({timeout:true}),a=adapter(db,t);
 await assert.rejects(a.enrich(request,context()));const cost=await db.ledger.status();assert.equal(cost.chargedKurus,572);
 await assert.rejects(a.enrich(request,context()),e=>e.code==='budget_uncertain');assert.equal(t.calls.filter(c=>c.url.includes('/runs?')).length,1);assert.deepEqual(await db.ledger.status(),cost);
});
test('missing Task policy, additional platform fees and insufficient overall budget prevent a paid start',async()=>{
 for(const mode of ['no-policy','extra-fees','no-budget']){
  const db=account(),t=transport({extraFees:mode==='extra-fees'}),a=adapter(db,t,mode==='no-policy'?{getTaskPolicies:async()=>[]}:{});
  if(mode==='no-budget')await db.ledger.once('prior',{},4000,async()=>({saved:true}));
  const before=await db.ledger.status();
  if(mode==='no-policy')assert.equal((await a.enrich(request,context())).reason,'actor_limit_unverified');else await assert.rejects(a.enrich(request,context()));
  assert.equal(t.calls.filter(c=>c.url.includes('/runs?')).length,0);assert.deepEqual(await db.ledger.status(),before);
 }
});
test('missing echoed cap aborts the remote run and does not release the reservation',async()=>{
 const db=account(),t=transport({echoCap:false}),a=adapter(db,t);
 await assert.rejects(a.enrich(request,context()),e=>e.code==='actor_limit_unverified');assert.equal(t.calls.filter(c=>c.url.includes('/abort')).length,1);assert.equal((await db.ledger.status()).chargedKurus,572);
});
test('wrong company records and oversized datasets cannot become evidence',async()=>{
 const wrong=account(),t=transport({wrongIdentity:true});assert.equal((await adapter(wrong,t).enrich(request,context())).pages.length,0);
 const big=account(),large=transport({large:true});await assert.rejects(adapter(big,large).enrich(request,context()),e=>e.code==='actor_output_limit');assert.equal((await big.ledger.status()).chargedKurus,582);
});
test('every recommended Actor has a finite schema-specific input; geography and unseen URLs fail closed',()=>{
 const targets={
  'harvestapi/linkedin-company-search':'https://www.linkedin.com/company/acme-organic/',
  'harvestapi/linkedin-post-search':'https://www.linkedin.com/company/acme-organic/',
  'curious_coder/linkedin-jobs-scraper':'https://www.linkedin.com/jobs/search/?f_C=1234',
  'apify/instagram-profile-scraper':request.url,'apify/instagram-scraper':request.url,
  'compass/crawler-google-places':'https://www.google.com/maps/place/acme/',
  'jmlp/meta-ad-library-scraper':'https://www.facebook.com/acmeorganic',
  'logiover/website-seo-audit-crawler':brief.website,'apify/website-content-crawler':brief.website,
  'clockworks/tiktok-scraper':'https://www.tiktok.com/@acmeorganic',
  'fatihtahta/trendyol-scraper':'https://www.trendyol.com/acme/product-p-123456',
  'junglee/free-amazon-product-scraper':'https://www.amazon.com.tr/dp/B012345678',
  'damilo/google-shopping-apify':brief.website
 };
 const c=context();c.packet.sources[0].technicalSignals.navigation.push(...Object.values(targets).map(url=>({url})));
 for(const [actor,url]of Object.entries(targets)){const built=actorInput({...request,actor,url},c);assert.ok(built.maxItems>0&&built.maxItems<=10,actor);assert.ok(!JSON.stringify(built.input).includes('cookies'));}
 assert.throws(()=>actorInput({...request,actor:'jmlp/meta-ad-library-scraper',url:targets['jmlp/meta-ad-library-scraper'],countryCode:'US'},c),e=>e.code==='actor_locale_unverified');
 assert.throws(()=>actorInput({...request,url:'https://www.instagram.com/unknown/'},c),e=>e.code==='actor_source_unverified');
 const seo=actorInput({...request,actor:'logiover/website-seo-audit-crawler',url:brief.website},c);assert.equal(seo.input.maxPagesToCrawl,5);
 const video=actorInput({...request,actor:'clockworks/tiktok-scraper',url:targets['clockworks/tiktok-scraper']},c);assert.equal(video.input.aiVideoDescription,false);assert.equal(video.input.downloadSubtitlesOptions,'NEVER_DOWNLOAD_SUBTITLES');
});
