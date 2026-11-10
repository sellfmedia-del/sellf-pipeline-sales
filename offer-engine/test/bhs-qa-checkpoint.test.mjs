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
test('the independent Sütaş case can resume its retained spending checkpoint',async()=>{
 const host='https://sellf-pipeline-sales-synthetic-yigit-konuks-projects.vercel.app';
 assert.equal(await fetchQaCheckpoint(host,{fetchImpl:async()=>new Response(JSON.stringify({case:'sutas',encoding:'br-base64',data:'retained-sutas-receipts'}))}),'retained-sutas-receipts');
});

test('the archived public Duru checkpoint preserves every previous charge including both service rejections',async()=>{
 const {readFile}=await import('node:fs/promises');const {brotliDecompressSync}=await import('node:zlib');
 const wrapper=JSON.parse(await readFile(new URL('./fixtures/duru-retained-20261110.json',import.meta.url),'utf8'));
 const payload=JSON.parse(brotliDecompressSync(Buffer.from(wrapper.data,'base64')));
 assert.equal(payload.case,'duru');assert.equal(payload.phase,'competition');assert.equal(payload.receipts.length,54);
 assert.equal(500+payload.receipts.reduce((n,r)=>n+r.charge_kurus,0),3943);
 const rejected=payload.receipts.filter(r=>r.value?.providerStatus===503);assert.equal(rejected.length,2);assert.equal(rejected.reduce((n,r)=>n+r.charge_kurus,0),232);
 assert.ok(payload.receipts.every(r=>r.charge_kurus>=0));
 // A captured public Tavily documentation page contains its literal example
 // placeholder. Keep original evidence immutable; reject actual key patterns.
 assert.ok(!/AIza|sk-ant-|apify_api_|tvly-/.test(JSON.stringify(payload).replaceAll('tvly-YOUR_API_KEY','PUBLIC_DOCUMENTATION_PLACEHOLDER')));
});

test('Tadım continuation keeps the paid truncated response and thought usage in its original account',async()=>{
 const {readFile}=await import('node:fs/promises');const {brotliDecompressSync}=await import('node:zlib');
 const wrapper=JSON.parse(await readFile(new URL('./fixtures/tadim-retained-20261110.json',import.meta.url),'utf8'));
 const payload=JSON.parse(brotliDecompressSync(Buffer.from(wrapper.data,'base64')));
 assert.equal(payload.case,'tadim');assert.equal(500+payload.receipts.reduce((n,r)=>n+r.charge_kurus,0),1874);
 const incomplete=payload.receipts.find(r=>r.value?.rejectedOutput==='incomplete');
 assert.equal(incomplete.charge_kurus,48);assert.equal(incomplete.value.usage.thoughtsTokenCount,2343);assert.equal(incomplete.value.usage.candidatesTokenCount,715);
});
