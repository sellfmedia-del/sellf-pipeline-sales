import test from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import vm from 'node:vm';
const here=new URL('../',import.meta.url);
test('bilingual website retains its pages and exposes only password-protected proposal routes',async()=>{
 const files=await readdir(new URL('site',here));for(const file of ['index.html','contact.html','search.html','portal.css','portal.js'])assert.ok(files.includes(file));
 const script=await readFile(new URL('site/portal.js',here),'utf8');assert.ok(!/\bfetch\s*\(/.test(script));assert.ok(!script.includes('sales.sellfmedia.com'));
 const config=JSON.parse(await readFile(new URL('vercel.json',here),'utf8'));
 for(const source of ['/iletisim','/teklifinizi-arayin','/en','/en/contact','/en/find-your-proposal'])assert.ok(config.rewrites.some(r=>r.source===source));
 const external=config.rewrites.filter(r=>r.destination.startsWith('https:'));
 assert.equal(external.length,6);assert.ok(external.every(r=>r.destination.startsWith('https://sales.sellfmedia.com/offers/')));
 assert.deepEqual(await readdir(new URL('api',here)),['offer.js']);
});
function submit(value){let callback;const status={textContent:''},input={value,attrs:{},setAttribute(k,v){this.attrs[k]=v},focus(){}},form={elements:{extension:input},querySelector:()=>status,addEventListener:(_,fn)=>callback=fn};return {input,status,form,run:()=>callback({preventDefault(){}})};}
test('extension form opens only valid local proposals and rejects executable/foreign/extra-path links in both languages',async()=>{
 const source=await readFile(new URL('site/portal.js',here),'utf8');
 for(const lang of ['tr','en'])for(const value of ['ornek-marka-teklifi','/ornek-marka-teklifi','https://offerletter.sellfmedia.com/ornek-marka-teklifi','ornek-teklifi-v2-a4f587f7','https://evil.example/ornek-teklifi','javascript:alert(1)','//evil.example/ornek-teklifi','https://offerletter.sellfmedia.com/ornek-teklifi?password=secret','bad/marka-teklifi']){
  const f=submit(value),destinations=[];vm.runInNewContext(source,{document:{documentElement:{lang},querySelectorAll:selector=>selector==='[data-offer-search]'?[f.form]:[]},location:{assign:value=>destinations.push(value)},URL,Date});f.run();
  const valid=['ornek-marka-teklifi','/ornek-marka-teklifi','https://offerletter.sellfmedia.com/ornek-marka-teklifi','ornek-teklifi-v2-a4f587f7'].includes(value);assert.equal(f.input.attrs['aria-invalid'],String(!valid),value);
  if(valid){assert.equal(destinations.length,1);assert.match(destinations[0],/^\/[a-z0-9-]+$/);assert.match(f.status.textContent,lang==='en'?/Opening/:/açılıyor/);}else{assert.equal(destinations.length,0);assert.match(f.status.textContent,lang==='en'?/Enter the extension/:/Size iletilen uzantıyı/);}
 }
});
