import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfferStore,tokenHash,passwordHash} from '../src/proposal/storage.mjs';
test('version save uses caller JWT plus the atomic RPC and no service-role credential',async()=>{
 const calls=[],store=createOfferStore({enabled:true,url:'https://example.supabase.co',key:'public-key',serviceKey:'private-key',fetchImpl:async(url,init)=>{calls.push({url,init});return {ok:true,status:200,text:async()=>JSON.stringify(url.endsWith('/auth/v1/user')?{id:'user1'}:{id:'offer1',version:1,monthlyAmount:123})};}});
 const result=await store.save('user-token',{p_lead_id:'lead1',p_space_id:'space1',p_request_id:'request1',p_document:{},p_pricing:{}});
 assert.equal(result.version,1);assert.equal(calls.length,2);assert.ok(calls[1].url.endsWith('/rest/v1/rpc/save_pipeline_offer'));
 assert.equal(calls[1].init.headers.Authorization,'Bearer user-token');assert.ok(!JSON.stringify(calls).includes('private-key'));
});
test('storage stays disabled without explicit configuration and fails before network; public access requires matching hashed credentials and published state',async()=>{
 let calls=0;const disabled=createOfferStore({enabled:false,fetchImpl:async()=>{calls++;}});await assert.rejects(()=>disabled.save('user',{}),/etkin değil/);assert.equal(calls,0);
 const secret='s'.repeat(32),token='t'.repeat(43),password='p'.repeat(16),requests=[];
 const store=createOfferStore({enabled:true,url:'https://example.supabase.co',key:'public',serviceKey:'private',fetchImpl:async(url,init)=>{requests.push({url,init});return {ok:true,status:200,text:async()=>JSON.stringify([{id:'offer1',version:1,customer_document:{}}])};}});
 const result=await store.access(token,password,secret);assert.equal(result.id,'offer1');assert.ok(requests[0].url.includes('state=eq.published'));assert.ok(requests[0].url.includes(tokenHash(token)));assert.ok(requests[0].url.includes(passwordHash(secret,token,password)));assert.ok(!requests[0].url.includes(password));
 assert.notEqual(passwordHash(secret,token,password),passwordHash(secret,'x'.repeat(43),password));assert.throws(()=>passwordHash('',token,password),/anahtarı/);
});

test('minimal successful inserts may have an empty response body',async()=>{
 const calls=[];const store=createOfferStore({enabled:true,url:'https://example.supabase.co',key:'public',serviceKey:'private',fetchImpl:async(url,init)=>{calls.push(init.method);return {ok:true,status:init.method==='POST'?201:200,text:async()=>init.method==='POST'?'':JSON.stringify([{id:'6e022659-7c82-4a60-987c-7bf52783c629',alternative_id:'operations_bundle',requester_name:'Test',requester_email:'test@example.invalid'}])};}});
 const result=await store.queue({id:'offer'},{requestId:'6e022659-7c82-4a60-987c-7bf52783c629',alternativeId:'operations_bundle',name:'Test',email:'test@example.invalid',monthlyAmount:10},{});assert.equal(result.requester_name,'Test');assert.deepEqual(calls,['POST','GET']);
});
