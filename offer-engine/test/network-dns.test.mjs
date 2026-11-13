import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createDnsLookup} from '../src/network-dns.mjs';
import {createPublicFetcher,resolveTarget} from '../src/network.mjs';
const address={address:'8.8.8.8',family:4};
const failure=code=>Object.assign(new Error('synthetic DNS failure'),{code,syscall:'getaddrinfo'});

test('temporary EBUSY and EAI_AGAIN recover with bounded DNS-only retries',async()=>{
 let calls=0;const delays=[];
 const lookup=createDnsLookup({resolve:async(host,options)=>{assert.equal(host,'brand.example');assert.deepEqual(options,{all:true});if(++calls===1)throw failure('EBUSY');if(calls===2)throw failure('EAI_AGAIN');return [address];},wait:async ms=>delays.push(ms)});
 const target=await resolveTarget('https://brand.example/path',lookup);
 assert.equal(target.url.href,'https://brand.example/path');assert.deepEqual(target.address,address);assert.equal(calls,3);assert.deepEqual(delays,[200,500]);
});
test('same-host bursts share one in-flight lookup without caching later DNS answers',async()=>{
 let calls=0,finish;const lookup=createDnsLookup({resolve:async()=>{calls++;return new Promise(done=>finish=done);}});
 const burst=Array.from({length:16},()=>resolveTarget('https://brand.example/',lookup));
 await new Promise(done=>setImmediate(done));assert.equal(calls,1);finish([address]);await Promise.all(burst);
 const next=resolveTarget('https://brand.example/redirect',lookup);await new Promise(done=>setImmediate(done));assert.equal(calls,2);
 finish([{address:'127.0.0.1',family:4}]);await assert.rejects(next,/herkese açık değil/);
});
test('different-host bursts keep resolver concurrency bounded and release queued work after failures',async()=>{
 let active=0,max=0,calls=0;const lookup=createDnsLookup({resolve:async host=>{calls++;active++;max=Math.max(max,active);await new Promise(done=>setImmediate(done));active--;if(host==='bad.example')throw failure('ENOTFOUND');return [address];}});
 const result=await Promise.allSettled(['bad.example',...Array.from({length:15},(_,i)=>'brand'+i+'.example')].map(host=>resolveTarget('https://'+host,lookup)));
 assert.equal(max,4);assert.equal(calls,16);assert.equal(result.filter(r=>r.status==='fulfilled').length,15);
});
test('persistent busy errors stop after four lookups; permanent DNS failures are not retried',async()=>{
 for(const [code,expected]of [['EBUSY',4],['ENOTFOUND',1]]){
  let calls=0;const waits=[],lookup=createDnsLookup({resolve:async()=>{calls++;throw failure(code);},wait:async ms=>waits.push(ms)});
  await assert.rejects(resolveTarget('https://brand.example/',lookup),e=>e.code===code);assert.equal(calls,expected);assert.equal(waits.length,expected-1);
 }
});
test('successful retries still reject any private DNS answer and preserve IPv4 preference',async()=>{
 let calls=0;const lookup=createDnsLookup({resolve:async()=>{if(!calls++)throw failure('EBUSY');return [address,{address:'10.0.0.1',family:4}];},wait:async()=>{}});
 await assert.rejects(resolveTarget('https://brand.example/',lookup),/herkese açık değil/);
 const target=await resolveTarget('https://brand.example/',createDnsLookup({resolve:async()=>[{address:'2606:4700:4700::1111',family:6},address]}));assert.deepEqual(target.address,address);
});

test('a BHS source deadline bounds both a stalled lookup and a continuously active response',async t=>{
 const keepAlive=setTimeout(()=>{},1000);t.after(()=>clearTimeout(keepAlive));
 const never=Promise.withResolvers();
 const stalled=createPublicFetcher({deadline:Date.now()+40,hardDeadline:true,resolve:()=>never.promise});
 await assert.rejects(stalled('https://brand.example/'),error=>error.name==='TimeoutError');
 never.resolve({url:new URL('https://brand.example/'),address});

 const server=createServer((request,response)=>{
  response.writeHead(200,{'Content-Type':'text/plain'});
  const interval=setInterval(()=>response.write('ongoing'),10);
  response.once('close',()=>clearInterval(interval));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const resolve=async()=>({url:new URL('http://127.0.0.1:'+server.address().port),address:{address:'127.0.0.1',family:4}});
 const read=createPublicFetcher({deadline:Date.now()+100,hardDeadline:true,resolve});
 await assert.rejects(read('https://brand.example/'),error=>error.name==='AbortError');
});
