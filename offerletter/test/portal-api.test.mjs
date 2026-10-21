import test from 'node:test';
import assert from 'node:assert/strict';
import {createPortalHandler} from '../api/offer.js';
const headers={host:'offerletter.sellfmedia.com',origin:'https://offerletter.sellfmedia.com'};
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};}
async function request(handler,body,extra={}){const res=response();await handler({method:'POST',headers,body,...extra},res);return res;}
test('public portal forwards only customer credentials to the fixed Pipeline endpoint',async()=>{
 const calls=[],document={brand:{name:'Synthetic brand'},alternatives:[]};
 const handler=createPortalHandler({fetchImpl:async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>({id:'synthetic-offer',version:1,document,privateField:'never returned'})};}});
 const res=await request(handler,{action:'access',slug:'synthetic-brand-teklifi',password:'synthetic-password',jwt:'never-forward',proposal:{},leadId:'never-forward'},{headers:{...headers,authorization:'Bearer never-forward',cookie:'never-forward'}});
 assert.equal(res.code,200);assert.deepEqual(res.data,{id:'synthetic-offer',version:1,document});assert.equal(res.headers['Cache-Control'],'private, no-store');
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://sales.sellfmedia.com/api/offer');
 assert.deepEqual(calls[0].init.headers,{'Content-Type':'application/json',Origin:'https://sales.sellfmedia.com'});
 assert.deepEqual(JSON.parse(calls[0].init.body),{action:'access',slug:'synthetic-brand-teklifi',password:'synthetic-password'});
});
test('public portal rejects operator actions, foreign origins, malformed bodies and unbounded credentials without forwarding',async()=>{
 const handler=createPortalHandler({fetchImpl:()=>assert.fail('must not call Pipeline')});
 for(const action of ['save','publish','list','outbox','request'])assert.equal((await request(handler,{action})).code,403);
 assert.equal((await request(handler,{action:'access'},{headers:{...headers,origin:'https://evil.example'}})).code,403);
 assert.equal((await request(handler,'{')).code,400);
 assert.equal((await request(handler,{action:'access',slug:'x'.repeat(121),password:'test'})).code,422);
 assert.equal((await request(handler,{action:'access',slug:'brand-teklifi',password:'x'.repeat(129)})).code,422);
 assert.equal((await request(handler,{action:'access',token:'bad',password:'test'})).code,422);
});
test('incorrect passwords do not disclose a document and transient failures remain retryable',async()=>{
 const denied=createPortalHandler({fetchImpl:async()=>({ok:false,status:422,json:async()=>({error:'upstream detail'})})});
 const res=await request(denied,{action:'access',slug:'brand-teklifi',password:'wrong'});assert.equal(res.code,422);assert.deepEqual(Object.keys(res.data),['error']);
 const unavailable=createPortalHandler({fetchImpl:async()=>{throw Error('private diagnostic');}});
 const failed=await request(unavailable,{action:'access',slug:'brand-teklifi',password:'test'});assert.equal(failed.code,502);assert.ok(!failed.data.error.includes('private'));
});
