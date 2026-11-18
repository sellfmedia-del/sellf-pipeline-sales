import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebsiteIdentityCheck} from '../src/bhs/website-identity.mjs';

const website='https://www.muffik.eu/';
const html=content=>({status:200,headers:{'content-type':'text/html; charset=utf-8'},body:Buffer.from(content)});
const redirect=location=>({status:302,headers:{location}});
function fixture(pages){
 const resolved=[],visited=[];
 const check=createWebsiteIdentityCheck({
  resolve:async url=>{
   resolved.push(url);
   if(new URL(url).hostname==='127.0.0.1')throw Error('private IP');
   return {url:new URL(url),address:{address:'8.8.8.8',family:4}};
  },
  makeReader:options=>async url=>{
   assert.equal(options.hardDeadline,true);
   await options.resolve(url);visited.push(url);
   const page=pages[url];
   if(page instanceof Error)throw page;
   assert.ok(page,'Unexpected fetch: '+url);return page;
  }
 });
 return {check,resolved,visited};
}

test('reads the supplied brand site and distinguishes a different publisher from a generic page',async()=>{
 const other='https://www.selfmedia.com/',generic='https://store.co.uk/',tr='https://www.nbtilac.com.tr/';
 const {check}=fixture({
  [website]:html('<head><title>Welcome</title></head>'),
  [other]:html('<head><title>Self Media – Agence digitale</title></head>'),
  [generic]:html('<head><title>Online Store</title><meta content="Store" property="og:site_name"></head>'),
  [tr]:html('<head><title>NBT İlaç A.Ş.</title></head>')
 });
 assert.deepEqual(await check({brandName:'Muffik',website}),{status:'verified',website});
 assert.deepEqual(await check({brandName:'Muffik',website:other}),{status:'mismatch',website:other});
 assert.deepEqual(await check({brandName:'Muffik',website:generic}),{status:'unconfirmed',website:generic});
 assert.deepEqual(await check({brandName:'NBT İlaç A.Ş.',website:tr}),{status:'verified',website:tr});
});

test('reports the landing page for a legitimate alias and catches cross-brand redirects',async()=>{
 const alias='https://www.muffik.com/',page='https://sensoryplay.shop/kids';
 const {check,resolved}=fixture({
  [website]:redirect(alias),[alias]:redirect(page+'?visit=secret'),
  [page+'?visit=secret']:html('<script type="application/ld+json">{"@graph":[{"@type":["Organization"],"name":"Muffik Ltd."}]}</script>')
 });
 assert.deepEqual(await check({brandName:'Muffik',website}),{status:'verified',website:page});
 assert.deepEqual(resolved,[website,alias,page+'?visit=secret']);
 const other='https://www.selfmedia.com/';
 const wrong=fixture({[website]:redirect(other),[other]:html('<meta content="Self Media" property="og:site_name">')});
 assert.deepEqual(await wrong.check({brandName:'Muffik',website}),{status:'mismatch',website:other});
});

test('rejects private, malformed and circular redirects without contacting unsafe addresses',async()=>{
 for(const target of ['http://127.0.0.1/admin','file:///etc/passwd',website]){
  const {check,visited}=fixture({[website]:redirect(target)});
  assert.deepEqual(await check({brandName:'Muffik',website}),{status:'invalid_redirect',website});
  assert.deepEqual(visited,[website]);
 }
});

test('an unavailable HTML page is not evidence of a different brand',async()=>{
 const alias='https://muffik-distribution.example/',parent='https://sensoryplay.shop/';
 const {check}=fixture({[website]:{status:403,headers:{}},[alias]:Error('HTTP timeout'),
  [parent]:html('<head><title>Muffik | Sensory Play</title><meta name="application-name" content="Sensory Play"></head>')});
 assert.equal((await check({brandName:'Muffik',website})).status,'verified');
 assert.equal((await check({brandName:'Muffik',website:alias})).status,'unconfirmed');
 assert.equal((await check({brandName:'Muffik',website:parent})).status,'unconfirmed');
});
