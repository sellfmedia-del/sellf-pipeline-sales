import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {prepareUploadedLogo} from '../src/upload.mjs';
import {cropLogoRegion} from '../src/logo-region.mjs';

test('screenshot localization cuts original pixels and excludes browser chrome and unrelated navigation',async()=>{
 const source=await sharp(Buffer.from('<svg width="1000" height="600"><rect width="1000" height="600" fill="#ddd"/><rect x="0" y="60" width="1000" height="100" fill="white"/><rect x="30" y="85" width="250" height="50" fill="#165baa"/><rect x="650" y="90" width="220" height="35" fill="black"/><rect x="0" y="180" width="1000" height="420" fill="#ad4052"/></svg>')).png().toBuffer();
 let calls=0;const result=await prepareUploadedLogo('data:image/png;base64,'+source.toString('base64'),{locate:async input=>{assert.deepEqual(input,source);calls++;return {found:true,box:[85/600*1000,30,135/600*1000,280],backgroundPoints:[]};}});
 assert.equal(calls,1);const logo=result.candidates[0];assert.equal(logo.quality.transparency,true);assert.equal(logo.quality.changedSolid,0);assert.equal(logo.quality.width,274);assert.equal(logo.quality.height,74);
 const {data}=await sharp(Buffer.from(logo.image.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});let ink=0;for(let i=0;i<data.length;i+=4)if(data[i+3]===255){assert.deepEqual([...data.subarray(i,i+3)],[22,91,170]);ink++;}assert.equal(ink,250*50);
});
test('locator cannot accept missing, reversed or out-of-range boxes; transparency never needs a paid locator',async()=>{
 const source=await sharp({create:{width:250,height:60,channels:4,background:{r:20,g:80,b:150,alpha:1}}}).extend({top:10,bottom:10,left:10,right:10,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
 for(const region of [{found:false,box:[]},{found:true,box:[0,0,10,1001]},{found:true,box:[500,500,200,200]}])await assert.rejects(cropLogoRegion(source,region),/tespit/);
 const result=await prepareUploadedLogo('data:image/png;base64,'+source.toString('base64'),{locate:()=>assert.fail('transparent input requires no paid localization')});assert.equal(result.candidates[0].quality.transparency,true);
});

test('Retina page screenshots over four megapixels retain a normal header-sized logo',async()=>{
 const source=await sharp(Buffer.from('<svg width="2560" height="1600"><rect width="2560" height="1600" fill="white"/><rect x="80" y="80" width="132" height="90" fill="#185FA5"/><rect x="800" y="80" width="1000" height="100" fill="black"/></svg>')).png().toBuffer();
 const result=await prepareUploadedLogo('data:image/png;base64,'+source.toString('base64'),{locate:async()=>({found:true,box:[50,31.25,106.25,82.8125],backgroundPoints:[]})});
 assert.equal(result.candidates[0].quality.width,156);assert.equal(result.candidates[0].quality.changedSolid,0);assert.equal(result.candidates[0].quality.transparency,true);
});
