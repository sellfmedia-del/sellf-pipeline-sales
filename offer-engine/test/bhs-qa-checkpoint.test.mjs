import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchQaCheckpoint} from '../scripts/qa-checkpoint.mjs';
test('QA checkpoint follows only same-origin authentication redirects and retains all receipt payload bytes',async()=>{
 let calls=0;const host='https://sellf-pipeline-sales-synthetic-yigit-konuks-projects.vercel.app';
 const data=await fetchQaCheckpoint(host+'/?_vercel_share=synthetic',{fetchImpl:async(url,options)=>{
  calls++;if(calls===1)return new Response(null,{status:307,headers:{location:'/bhs-sequential-checkpoint.json','set-cookie':'qa=synthetic; Secure; HttpOnly'}});
  assert.equal(new URL(url).origin,host);assert.equal(options.headers.Cookie,'qa=synthetic');return new Response(JSON.stringify({case:'humm',encoding:'br-base64',data:'all-prior-receipts'}));
 }});assert.equal(data,'all-prior-receipts');assert.equal(calls,2);
 await assert.rejects(fetchQaCheckpoint('https://other.example/',{fetchImpl:()=>assert.fail()}));
 await assert.rejects(fetchQaCheckpoint(host,{fetchImpl:async()=>new Response(null,{status:307,headers:{location:'https://other.example/'}})}));
});
