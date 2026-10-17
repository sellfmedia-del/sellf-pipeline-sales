import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import chromium from '@sparticuz/chromium';
import {chromium as playwright} from 'playwright-core';
import {captureWebsiteLogo,enterCountrySite} from '../src/capture.mjs';
import sharp from 'sharp';

test('rendered header logo is cropped and its white details survive background removal',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
  const browser=await playwright.launch({args:chromium.args,executablePath:process.env.LOGO_TEST_CHROMIUM,headless:true});
  try {
    const html='<html><head><title>Test Brand</title></head><body style="margin:0;background:#fff"><header style="height:110px;padding:25px 40px;background:#16385a"><a href="/" aria-label="Test Brand logo" style="display:inline-block;width:230px;height:60px"><svg xmlns="http://www.w3.org/2000/svg" width="230" height="60" viewBox="0 0 230 60"><rect x="8" y="8" width="214" height="44" fill="white"/><circle cx="40" cy="30" r="12" fill="#f24a3c"/></svg></a><span style="float:right;color:white">Menu</span></header><main><h1>Content</h1></main></body></html>';
    const result=await captureWebsiteLogo('https://brand.example/',{browser,testRoute:async()=>({status:200,headers:{'content-type':'text/html'},body:html})});
    assert.equal(result.generated,false);
    assert.ok(result.candidates.length>=1);
    assert.equal(result.candidates[0].quality.method,'native-transparency');
    assert.equal(result.candidates[0].quality.status,'ready');
    assert.equal(result.candidates[0].quality.changedSolid,0);
    assert.ok(result.candidates[0].quality.width>500);
    if(process.env.LOGO_TEST_OUTPUT){await writeFile(process.env.LOGO_TEST_OUTPUT,Buffer.from(result.candidates[0].image.split(',')[1],'base64'));await writeFile(process.env.LOGO_TEST_OUTPUT.replace('.png','-source.png'),Buffer.from(result.candidates[0].source.split(',')[1],'base64'));}
  } finally {await browser.close();}
});

test('public country selector follows its visible country button without guessing a route',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
  const browser=await playwright.launch({args:chromium.args,executablePath:process.env.LOGO_TEST_CHROMIUM,headless:true});
  try{
    const page=await browser.newPage();
    await page.route('https://brand.example/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:route.request().url().endsWith('/tr-TR')?'<header>Brand homepage</header>':'<p>Please select your country</p><button onclick="location.href=\'/tr-TR\'">Türkiye</button><button>Global</button>'}));
    await page.goto('https://brand.example/');
    await enterCountrySite(page,Date.now()+30000);
    assert.equal(page.url(),'https://brand.example/tr-TR');
    assert.match(await page.textContent('body'),/Brand homepage/);
  }finally{await browser.close();}
});

test('opaque raster uses native pixels and removes its backdrop despite transparent screenshot margins',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
  const browser=await playwright.launch({args:chromium.args,executablePath:process.env.LOGO_TEST_CHROMIUM,headless:true});
  try {
    const png=await sharp(Buffer.from('<svg width="900" height="240"><rect width="900" height="240" fill="white"/><rect x="30" y="30" width="840" height="180" fill="#164b8c"/><circle cx="140" cy="120" r="40" fill="white"/></svg>')).png().toBuffer();
    const html='<html><body><header><a href="/" aria-label="Brand logo"><img alt="Brand logo" src="/logo.png" style="width:225px;height:60px"></a></header></body></html>';
    const result=await captureWebsiteLogo('https://brand.example/',{browser,testRoute:async url=>({status:200,headers:{'content-type':url.endsWith('.png')?'image/png':'text/html'},body:url.endsWith('.png')?png:html})});
    const item=result.candidates[0];
    assert.equal(item.quality.sourceKind,'native-raster');
    assert.equal(item.quality.nativeWidth,900);
    assert.equal(item.quality.method,'edge-matte');
    assert.equal(item.quality.status,'ready');
    assert.ok(item.quality.width>800);
    const pixels=await sharp(Buffer.from(item.image.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(pixels.data[3],0);
    const p=((12+90)*pixels.info.width+12+110)*4;
    assert.deepEqual([...pixels.data.subarray(p,p+4)],[255,255,255,255]);
  }finally{await browser.close();}
});

test('country cookies created by the fresh public site reach its own navigation request',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
  const browser=await playwright.launch({args:chromium.args,executablePath:process.env.LOGO_TEST_CHROMIUM,headless:true});
  let cookieSeen=false;
  try{
    const result=await captureWebsiteLogo('https://brand.example/',{browser,testRoute:async(url,{headers={}}={})=>{
      if(url.endsWith('/tr-TR')){
        cookieSeen=headers.cookie?.includes('country=tr')&&headers.cookie?.includes('language=tr');
        return {status:200,headers:{'content-type':'text/html; charset=utf-8'},body:'<header><a href="/" aria-label="Brand logo"><svg width="240" height="80"><rect x="10" y="10" width="220" height="60" fill="#124589"/></svg></a></header>'};
      }
      return {status:200,headers:{'content-type':'text/html; charset=utf-8','set-cookie':'country=tr; Path=/\nlanguage=tr; Path=/'},body:'<p>Please select your country</p><button onclick="location.href=\'/tr-TR\'">Türkiye</button><button>Global</button>'};
    }});
    assert.equal(cookieSeen,true);
    assert.equal(result.finalUrl,'https://brand.example/tr-TR');
    assert.equal(result.candidates[0].quality.status,'ready');
  }finally{await browser.close();}
});
