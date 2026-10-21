import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {prepareUploadedLogo} from '../src/upload.mjs';
import {cropLogoRegion} from '../src/logo-region.mjs';
import {finishLogo} from '../src/pixels.mjs';

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

test('enclosed canvas is removable while intentional white artwork stays intact',async()=>{
 const source=await sharp(Buffer.from('<svg width="400" height="160"><rect width="400" height="160" fill="#fce5ea"/><rect x="30" y="20" width="340" height="120" rx="12" fill="red"/><rect x="38" y="28" width="324" height="104" rx="8" fill="#fce5ea"/><rect x="70" y="55" width="55" height="50" fill="white"/></svg>')).png().toBuffer();
 const result=await finishLogo(source,undefined,{chooseBackdrop:async(_image,geometry)=>{assert.equal(geometry.regions.length,1);return geometry.regions.map(r=>r.id);}});
 const {data,info}=await sharp(result.png).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(data[(60*info.width+150)*4+3],0);assert.ok([...data].some((v,i)=>i%4===3&&v===255));assert.equal(result.quality.changedSolid,0);
});

test('a shallow screenshot backdrop gradient is removed without treating cleared matte noise as damaged ink',async()=>{
 const width=400,height=160,raw=Buffer.alloc(width*height*3);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=(y*width+x)*3,v=244+Math.round(10*x/(width-1));raw[p]=raw[p+1]=raw[p+2]=v;}
 const source=await sharp(raw,{raw:{width,height,channels:3}}).composite([{input:Buffer.from('<svg width="400" height="160"><rect x="40" y="50" width="320" height="60" fill="#154696"/></svg>')}]).png().toBuffer();
 const result=await prepareUploadedLogo('data:image/png;base64,'+source.toString('base64'));
 assert.equal(result.candidates[0].quality.transparency,true);assert.equal(result.candidates[0].quality.changedSolid,0);assert.equal(result.candidates[0].quality.compositingError,0);
 const {data}=await sharp(Buffer.from(result.candidates[0].image.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let opaque=0;for(let p=0;p<data.length;p+=4)if(data[p+3]===255){assert.deepEqual([...data.subarray(p,p+3)],[21,70,150]);opaque++;}assert.equal(opaque,320*60);
});

test('bounded crop expansion recovers a slightly under-sized localization without another locator or backdrop call',async()=>{
 const source=await sharp(Buffer.from('<svg width="600" height="300"><rect width="600" height="300" fill="white"/><rect x="100" y="70" width="400" height="160" fill="#165baa"/></svg>')).png().toBuffer();
 let locateCalls=0,backdropCalls=0;
 const result=await prepareUploadedLogo('data:image/png;base64,'+source.toString('base64'),{locate:async()=>{locateCalls++;return {found:true,box:[290,190,710,810],backgroundPoints:[]};},chooseBackdrop:async()=>{backdropCalls++;return [];}});
 assert.equal(locateCalls,1);assert.ok(backdropCalls<=1);assert.equal(result.candidates[0].quality.width,424);assert.equal(result.candidates[0].quality.height,184);assert.equal(result.candidates[0].quality.touchesEdge,false);assert.equal(result.candidates[0].quality.changedSolid,0);
});
