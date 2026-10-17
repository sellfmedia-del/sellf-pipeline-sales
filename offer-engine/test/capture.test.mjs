import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import chromium from '@sparticuz/chromium';
import {chromium as playwright} from 'playwright-core';
import {captureWebsiteLogo} from '../src/capture.mjs';

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
