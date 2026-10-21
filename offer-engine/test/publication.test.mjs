import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewStore} from '../src/proposal/preview-store.mjs';
import {brandSlug,validSlug,publicationUrl} from '../src/proposal/publication.mjs';
import {sealSession} from '../src/proposal/preview-session.mjs';
const secret='s'.repeat(43),id='a4f587f7-fbf0-4b26-a2bb-35ae3a490af1',url='https://example.supabase.co/functions/v1/pipeline-offer-preview-store';
function setup(run){return createPreviewStore({enabled:true,url,key:'key',portalSecret:secret,fetchImpl:async(_url,init)=>{const body=JSON.parse(init.body);const value=await run(body);return {ok:true,json:async()=>value};}});}
test('brand URL is a safe Turkish transliteration with no capability or password',()=>{
 assert.equal(brandSlug('Çağrı Şirketi A.Ş.'),'cagri-sirketi-a-s-teklifi');assert.ok(validSlug('marka-teklifi'));assert.ok(validSlug('marka-teklifi-v2-a4f587f7'));
 for(const slug of ['../marka','marka&owner_id=other','marka/teklifi','marka?token=secret'])assert.equal(validSlug(slug),false);
 assert.equal(publicationUrl('preview.vercel.app',{slug:'marka-teklifi',token:'PRIVATE',password:'PRIVATE'}),'https://preview.vercel.app/marka-teklifi');
});
test('production customer links use the configured Offerletter origin while preview links stay isolated',()=>{
 const previous={VERCEL_ENV:process.env.VERCEL_ENV,OFFER_PUBLIC_ORIGIN:process.env.OFFER_PUBLIC_ORIGIN};
 try{
  process.env.VERCEL_ENV='production';process.env.OFFER_PUBLIC_ORIGIN='https://offerletter.sellfmedia.com';
  assert.equal(publicationUrl('sales.sellfmedia.com',{slug:'multi-management-turkey-teklifi',password:'PRIVATE'}),'https://offerletter.sellfmedia.com/multi-management-turkey-teklifi');
  process.env.VERCEL_ENV='preview';assert.equal(publicationUrl('preview.vercel.app',{slug:'marka-teklifi'}),'https://preview.vercel.app/marka-teklifi');
 }finally{for(const [key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
test('repeated publish reuses exact credentials; collision chooses a versioned path',async()=>{
 let row={id,version:2,state:'draft',customer_document:{brand:{name:'Marka'}}},writes=0,collision=true;
 const store=setup(async body=>{
  if(body.action==='publication')return row;
  if(body.action==='publish'){writes++;if(collision&&body.slug==='marka-teklifi'){const e=Error('Taken');e.code='slug_unavailable';throw e;}row={...row,state:'published',operator_link_envelope:body.operatorLinkEnvelope};return [{id,version:2}];}
  throw Error('Unexpected request');
 });
 const first=await store.publish('jwt',id,secret);assert.equal(first.slug,'marka-teklifi-v2-a4f587f7');assert.equal(writes,2);
 const next=await store.publish('jwt',id,secret);assert.deepEqual(next,first);assert.equal(writes,2);
});
test('clean-path access still requires password verification and returns no operator credentials',async()=>{
 const link={slug:'marka-teklifi',token:'t'.repeat(43),password:'private-password'},calls=[];
 const store=setup(async body=>{calls.push(body);if(body.action==='resolve_slug')return {id,operator_link_envelope:sealSession(link,secret,'published-link:'+id)};if(body.action==='access')return {id,version:2,customer_document:{brand:{name:'Marka'}}};throw Error('Unexpected request');});
 const result=await store.accessSlug(link.slug,link.password,secret);assert.equal(result.id,id);assert.equal(calls[1].action,'access');assert.equal(calls[1].password,undefined);assert.equal(calls[1].passwordHash.length,64);assert.equal(calls[1].token,undefined);assert.equal(result.password,undefined);
 await assert.rejects(()=>store.accessSlug('../bad','password',secret));
});
