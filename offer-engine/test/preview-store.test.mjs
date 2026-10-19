import test from 'node:test';
import assert from 'node:assert/strict';
import {sealSession,readSession,setSession} from '../src/proposal/preview-session.mjs';
import {createPreviewStore} from '../src/proposal/preview-store.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {createPreviewGateway} from '../../supabase/functions/pipeline-offer-preview-store/handler.mjs';
test('test sessions are encrypted, host-bound, expiring and HttpOnly; tokens never appear in browser-visible state',()=>{
 const secret='s'.repeat(43),host='preview.vercel.app',value={accessToken:'private-jwt',refreshToken:'private-refresh',expiresAt:Date.now()+3600000,createdAt:Date.now()};
 const token=sealSession(value,secret,host),req={headers:{host,cookie:'__Host-offer-preview-session='+token}};
 assert.ok(!token.includes(value.accessToken));assert.deepEqual(readSession(req,secret),value);
 assert.equal(readSession({...req,headers:{...req.headers,host:'other.example'}},secret),null);
 assert.equal(readSession(req,'x'.repeat(43)),null);
 const expired=sealSession({...value,createdAt:Date.now()-8*86400000},secret,host);assert.equal(readSession({headers:{host,cookie:'__Host-offer-preview-session='+expired}},secret),null);
 let cookie;setSession({setHeader:(k,v)=>cookie=v},req,value,secret);assert.match(cookie,/Secure; HttpOnly; SameSite=Strict/);
});
test('preview store sends only high-level operations to its fixed isolated gateway and checks publication credentials',async()=>{
 const calls=[],url='https://example.supabase.co/functions/v1/pipeline-offer-preview-store';
 const store=createPreviewStore({enabled:true,url,key:'private-preview-key',fetchImpl:async(target,init)=>{calls.push({target,init,body:JSON.parse(init.body)});return {ok:true,json:async()=>[{id:'offer',version:2}]};}});
 const published=await store.publish('jwt','offer','s'.repeat(43));assert.equal(published.token.length,43);assert.equal(published.password.length,16);assert.equal(calls[0].target,url);assert.equal(calls[0].body.action,'publish');assert.equal(calls[0].body.passwordHash.includes(published.password),false);
 await assert.rejects(()=>store.access('bad','password','s'.repeat(43)),/geçersiz/);
 await assert.rejects(()=>createPreviewStore({enabled:true,url:'https://example.supabase.co/rest/v1/leads',key:'key'}).bootstrap(),/etkin değil/);
});
test('gateway rejects missing/wrong keys, unknown actions and real-user JWTs before any preview write',async()=>{
 const gatewayKey='k'.repeat(43),hash=createHash('sha256').update(gatewayKey).digest('hex'),calls=[];
 const env=n=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-key',SUPABASE_ANON_KEY:'public-key'})[n];
 const handler=createPreviewGateway({env,fetchImpl:async(url,init)=>{calls.push({url,init});if(url.includes('gateway_config'))return {ok:true,status:200,text:async()=>JSON.stringify([{key_hash:hash}])};if(url.endsWith('/auth/v1/user'))return {ok:true,status:200,text:async()=>JSON.stringify({id:randomUUID(),app_metadata:{}})};throw Error('Unexpected write');}});
 const request=(key,body)=>new Request('https://edge.example',{method:'POST',headers:{'Content-Type':'application/json',...(key?{'x-offer-store-key':key}:{})},body:JSON.stringify(body)});
 assert.equal((await handler(request('',{action:'bootstrap'}))).status,401);assert.equal(calls.length,0);
 assert.equal((await handler(request('x'.repeat(43),{action:'bootstrap'}))).status,403);assert.equal(calls.length,1);
 assert.equal((await handler(request(gatewayKey,{action:'select',path:'/rest/v1/leads'}))).status,422);
 assert.equal((await handler(request(gatewayKey,{action:'save',jwt:'real-user-jwt',args:{}}))).status,422);
 assert.ok(calls.every(c=>!c.init.method||c.init.method==='GET'));assert.ok(calls.every(c=>!c.url.includes('/rest/v1/leads')));
});
