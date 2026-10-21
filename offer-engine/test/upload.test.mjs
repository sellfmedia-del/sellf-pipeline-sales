import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {prepareUploadedLogo} from '../src/upload.mjs';
import handler from '../api/logo-upload.js';

async function screenshot({background='white',fill='#185FA5',gradient=false,format='png'}={}){
  const svg=`<svg width="500" height="180" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><rect width="500" height="180" fill="${gradient?'url(#g)':background}"/><rect x="50" y="40" width="400" height="100" fill="${fill}"/><rect x="120" y="70" width="260" height="40" fill="${background}"/></svg>`;
  const bytes=await sharp(Buffer.from(svg)).toFormat(format).toBuffer();
  return 'data:image/'+(format==='jpeg'?'jpeg':format)+';base64,'+bytes.toString('base64');
}
test('uploaded opaque screenshot loses its backdrop, retains solid logo and white artwork, and requires review',async()=>{
  const result=await prepareUploadedLogo(await screenshot());
  const logo=result.candidates[0];
  assert.equal(result.generated,false);assert.equal(result.sourceType,'upload');
  assert.equal(logo.quality.status,'review');assert.equal(logo.quality.transparency,true);
  const {data,info}=await sharp(Buffer.from(logo.image.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(data[3],0);
  const center=(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*4;
  assert.deepEqual([...data.subarray(center,center+4)],[255,255,255,255]);
  const solid=(20*info.width+20)*4;
  assert.deepEqual([...data.subarray(solid,solid+4)],[24,95,165,255]);
});
test('JPEG and WebP screenshots are processed; white logos on a dark backdrop remain white',async()=>{
  for(const format of ['jpeg','webp']){
    const result=await prepareUploadedLogo(await screenshot({format,background:'#111',fill:'white'}));
    assert.equal(result.candidates[0].quality.transparency,true);
    assert.ok(result.candidates[0].quality.lightFraction>.6);
    assert.notEqual(result.candidates[0].placement.background,'#ffffff');
  }
});
test('white-only wordmark has transparent letter counters as well as a transparent outer backdrop',async()=>{
  const result=await prepareUploadedLogo(await screenshot({background:'#111',fill:'white'}));
  const logo=result.candidates[0];
  const {data,info}=await sharp(Buffer.from(logo.image.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const center=(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*4;
  assert.equal(data[center+3],0);
  assert.equal(logo.placement.background,'#171717');
});
test('antialiased thin white lettering does not retain its dark enclosed background',async()=>{
  const svg='<svg width="500" height="180"><rect width="500" height="180" fill="#191919"/><rect x="50.4" y="35.4" width="399.2" height="109.2" rx="30.4" fill="#999"/><rect x="52.4" y="37.4" width="395.2" height="105.2" rx="28.4" fill="white"/><rect x="59" y="44" width="382" height="92" rx="22" fill="#191919"/></svg>';
  const png=await sharp(Buffer.from(svg)).png().toBuffer();
  const output=await prepareUploadedLogo('data:image/png;base64,'+png.toString('base64'));
  const {data,info}=await sharp(Buffer.from(output.candidates[0].image.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(data[(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*4+3],0);
});
test('complex backgrounds, clipped artwork and tiny logos cannot return an accepted fallback',async()=>{
  await assert.rejects(()=>prepareUploadedLogo(screenshot()),/Görsel/);
  await assert.rejects(()=>screenshot({gradient:true}).then(prepareUploadedLogo),/güvenle ayrılamadı/);
  const image=await sharp({create:{width:40,height:20,channels:3,background:'white'}}).composite([{input:Buffer.from('<svg width="20" height="6"><rect width="20" height="6" fill="black"/></svg>'),left:10,top:7}]).png().toBuffer();
  await assert.rejects(()=>prepareUploadedLogo('data:image/png;base64,'+image.toString('base64')),/fazla küçük/);
  const clipped=await sharp(Buffer.from('<svg width="500" height="180"><rect width="500" height="180" fill="white"/><rect x="0" y="20" width="400" height="100" fill="black"/></svg>')).png().toBuffer();
  await assert.rejects(()=>prepareUploadedLogo('data:image/png;base64,'+clipped.toString('base64')),/kenarına/);
});
test('invalid, disguised and oversized uploads are rejected before use',async()=>{
  for(const input of ['data:image/svg+xml;base64,PHN2Zz4=','https://example.com/logo.png','data:image/png;base64,%%%',null,'data:image/png;base64,'+'A'.repeat(3000000)])await assert.rejects(()=>prepareUploadedLogo(input));
  const png=await screenshot();
  await assert.rejects(()=>prepareUploadedLogo(png.replace('image/png','image/jpeg')),/PNG/);
});
test('upload endpoint stays preview-only and same-origin',async()=>{
  const original=process.env.VERCEL_ENV;
  const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.body=data;return this;}});
  try{
    process.env.VERCEL_ENV='production';let res=response();await handler({method:'POST',headers:{}},res);assert.equal(res.code,503);
    process.env.VERCEL_ENV='preview';res=response();await handler({method:'POST',headers:{host:'preview.example',origin:'https://other.example'}},res);assert.equal(res.code,403);
    res=response();await handler({method:'POST',headers:{host:'preview.example',origin:'https://preview.example'},body:{image:await screenshot()}},res);assert.equal(res.code,200);assert.equal(res.body.candidates[0].quality.transparency,true);
  }finally{if(original===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=original;}
});

test('near-white JPEG screenshot and monochrome letter counters become transparent without recoloring ink',async()=>{
 const image=await screenshot({background:'#f8f8f8',fill:'#151515',format:'jpeg'});
 const result=await prepareUploadedLogo(image);const logo=result.candidates[0];
 const {data,info}=await sharp(Buffer.from(logo.image.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(data[3],0);assert.equal(data[(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*4+3],0);assert.equal(logo.quality.changedSolid,0);
});
test('tiny edge color variation and already-transparent tightly cropped artwork need no repeat upload',async()=>{
 const image=await sharp(Buffer.from('<svg width="500" height="180"><rect width="500" height="180" fill="#fff"/><rect width="500" height="1" fill="#f4f4f4"/><rect x="50" y="40" width="400" height="100" fill="#185FA5"/></svg>')).png().toBuffer();
 assert.equal((await prepareUploadedLogo('data:image/png;base64,'+image.toString('base64'))).candidates[0].quality.transparency,true);
 const tight=await sharp(Buffer.from('<svg width="300" height="60"><rect width="300" height="60" rx="20" fill="#185FA5"/></svg>')).png().toBuffer();
 assert.equal((await prepareUploadedLogo('data:image/png;base64,'+tight.toString('base64'))).candidates[0].quality.touchesEdge,false);
});
