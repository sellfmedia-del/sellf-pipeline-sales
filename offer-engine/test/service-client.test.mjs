import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const script=await readFile(new URL('../../offers/service-client.js',import.meta.url),'utf8');
function client(fetch){
 const window={};vm.runInNewContext(script,{window,fetch,crypto:{randomUUID:()=> 'request_1234567890'},AbortSignal,setTimeout:fn=>{fn();}});return window;
}
test('audit status retries bounded transport failures with the same signed job and never starts a new job',async()=>{
 const calls=[],api=client(async(url,init)=>{calls.push({url,init});if(calls.length<3)throw TypeError('Failed to fetch');return new Response(JSON.stringify({phase:'research',status:'in_progress',ticket:'existing-ticket'}));});
 const payload={action:'status',brief:{brandName:'Private Brand'},ticket:'existing-ticket'};
 assert.equal((await api.PipelineAuditRequest(payload)).status,'in_progress');assert.equal(calls.length,3);
 for(const call of calls){assert.equal(call.init.body,JSON.stringify(payload));assert.equal(call.init.credentials,'same-origin');assert.ok(call.init.signal);}
});
test('exhausted status transport failures expose a safe resume flag; paid starts and advances are never retried',async()=>{
 for(const action of ['status','start','advance','cancel']){
  let count=0;const api=client(async()=>{count++;throw TypeError('Failed to fetch SECRET');});
  await assert.rejects(()=>api.PipelineAuditRequest({action,ticket:'signed-job'}),error=>{assert.equal(error.code,'audit_transport');assert.equal(error.canResume,action==='status');assert.ok(!error.message.includes('SECRET'));return true;});
  assert.equal(count,action==='status'?3:1);
 }
});
test('structured provider failures stop immediately; only transient HTTP failures on status reads retry',async()=>{
 let count=0;const api=client(async()=>{count++;return new Response(JSON.stringify({code:'quota',error:'Usage limit reached'}),{status:429});});
 await assert.rejects(()=>api.PipelineAuditRequest({action:'status'}),error=>error.code==='quota');assert.equal(count,1);
 for(const action of ['start','advance','status']){
  let attempts=0;const transient=client(async()=>{attempts++;return new Response('<html>gateway timeout</html>',{status:504});});
  await assert.rejects(()=>transient.PipelineAuditRequest({action}),error=>error.code==='audit_transport');assert.equal(attempts,action==='status'?3:1);
 }
});
