import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {finishLogo} from '../src/pixels.mjs';
import {isPublicAddress,resolveTarget} from '../src/network.mjs';

async function image(content){return sharp(Buffer.from(`<svg width="500" height="160" xmlns="http://www.w3.org/2000/svg">${content}</svg>`)).png().toBuffer();}
test('native transparency preserves solid colors and generates a padded transparent PNG',async()=>{
  const result=await finishLogo(await image('<rect x="50" y="45" width="400" height="70" fill="#185FA5"/>'));
  assert.equal(result.quality.method,'native-transparency');assert.equal(result.quality.status,'ready');assert.equal(result.quality.changedSolid,0);
  const {data,info}=await sharp(result.png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(data[3],0);const center=(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*4;assert.deepEqual([...data.subarray(center,center+4)],[24,95,165,255]);
});
test('opaque white backdrop is removed while enclosed white artwork remains opaque',async()=>{
  const result=await finishLogo(await image('<rect width="500" height="160" fill="white"/><rect x="50" y="30" width="400" height="100" fill="#F20"/><rect x="120" y="65" width="260" height="30" fill="white"/>'));
  assert.equal(result.quality.status,'ready');assert.equal(result.quality.method,'edge-matte');
  const {data,info}=await sharp(result.png).raw().toBuffer({resolveWithObject:true});
  assert.equal(data[3],0);const center=(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*4;assert.deepEqual([...data.subarray(center,center+4)],[255,255,255,255]);
});
test('complex backdrops are not silently approved',async()=>{
  const result=await finishLogo(await image('<defs><linearGradient id="g"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><rect width="500" height="160" fill="url(#g)"/><rect x="50" y="30" width="400" height="100" fill="black"/>'));
  assert.equal(result.quality.status,'review');assert.equal(result.quality.matteStable,false);
});
test('an empty white crop cannot become an approved logo',async()=>{const bytes=await image('<rect width="500" height="160" fill="white"/>');await assert.rejects(()=>finishLogo(bytes));});
test('clipped artwork is flagged for review',async()=>{
  const result=await finishLogo(await image('<rect x="0" y="30" width="400" height="100" fill="black"/>'));
  assert.equal(result.quality.status,'review');assert.equal(result.quality.touchesEdge,true);
});
test('public address guard rejects private, loopback, mapped and metadata ranges',()=>{
  for(const address of ['127.0.0.1','10.1.2.3','172.16.1.1','192.168.1.1','169.254.169.254','::1','fc00::1','::ffff:127.0.0.1','100.64.1.1','0.0.0.0'])assert.equal(isPublicAddress(address),false,address);
  assert.equal(isPublicAddress('8.8.8.8'),true);
});
test('DNS rebinding and credential-bearing URLs are rejected before fetching',async()=>{
  await assert.rejects(()=>resolveTarget('https://brand.example',async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]));
  await assert.rejects(()=>resolveTarget('https://user:password@brand.example'));
  await assert.rejects(()=>resolveTarget('http://169.254.169.254/'));
  await assert.rejects(()=>resolveTarget('file:///etc/passwd'));
});
