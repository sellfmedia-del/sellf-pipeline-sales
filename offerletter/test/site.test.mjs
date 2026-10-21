import test from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import vm from 'node:vm';
const here=new URL('../',import.meta.url);
test('website preview contains the three requested pages and keeps integration outside this release',async()=>{
 const files=await readdir(new URL('site',here));for(const file of ['index.html','contact.html','search.html','portal.css','portal.js'])assert.ok(files.includes(file));
 const script=await readFile(new URL('site/portal.js',here),'utf8');assert.ok(!/\bfetch\s*\(/.test(script));assert.ok(!script.includes('sales.sellfmedia.com'));assert.ok(!script.includes('location.assign'));
 const apiFiles=await readdir(new URL('api',here)).catch(error=>{if(error.code==='ENOENT')return [];throw error;});assert.equal(apiFiles.length,0);
});
function submit(value){let callback;const status={textContent:''},input={value,attrs:{},setAttribute(k,v){this.attrs[k]=v},focus(){}},form={elements:{extension:input},querySelector:()=>status,addEventListener:(_,fn)=>callback=fn};return {input,status,form,run:()=>callback({preventDefault(){}})};}
test('extension form rejects executable/foreign/extra-path links and only confirms valid local extensions',async()=>{
 const source=await readFile(new URL('site/portal.js',here),'utf8');
 for(const value of ['ornek-marka-teklifi','/ornek-marka-teklifi','https://offerletter.sellfmedia.com/ornek-marka-teklifi','ornek-teklifi-v2-a4f587f7','https://evil.example/ornek-teklifi','javascript:alert(1)','//evil.example/ornek-teklifi','https://offerletter.sellfmedia.com/ornek-teklifi?password=secret','bad/marka-teklifi']){
  const f=submit(value);vm.runInNewContext(source,{document:{querySelectorAll:selector=>selector==='[data-offer-search]'?[f.form]:[]},URL,Date});f.run();
  const valid=['ornek-marka-teklifi','/ornek-marka-teklifi','https://offerletter.sellfmedia.com/ornek-marka-teklifi','ornek-teklifi-v2-a4f587f7'].includes(value);assert.equal(f.input.attrs['aria-invalid'],String(!valid),value);assert.match(f.status.textContent,valid?/bağlantı adımı/:/Size iletilen uzantıyı/);
 }
});
