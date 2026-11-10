import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchQaCheckpoint} from '../scripts/qa-checkpoint.mjs';
import {sequentialQaRequested} from '../scripts/qa-acceptance-gate.mjs';
test('the release acceptance runs only on its exact opted-in Preview commit and Pipeline project',()=>{
 const env={VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_B6Q6FIgq9NjbBlb6ga03cn6PD3jJ',OFFER_BHS_QA_COMMIT:'a'.repeat(40),VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),OFFER_BHS_QA_CASE:'tadim_release'};
 assert.equal(sequentialQaRequested(env),true);
 for(const change of [{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{VERCEL_PROJECT_ID:'other-project'},{OFFER_BHS_QA_COMMIT:'b'.repeat(40)},{OFFER_BHS_QA_CASE:'unknown'},{OFFER_BHS_QA_COMMIT:''}])assert.equal(sequentialQaRequested({...env,...change}),false);
});
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
 assert.equal(payload.case,'tadim');assert.equal(500+payload.receipts.reduce((n,r)=>n+r.charge_kurus,0),2497);
 const incomplete=payload.receipts.find(r=>r.value?.rejectedOutput==='incomplete');
 assert.equal(incomplete.charge_kurus,48);assert.equal(incomplete.value.usage.thoughtsTokenCount,2343);assert.equal(incomplete.value.usage.candidatesTokenCount,715);
});
test('the release continuation retains the complete 19.65 TRY baseline, the failed Sonnet output and its 403 commitment',async()=>{
 const {readFile}=await import('node:fs/promises');const {brotliDecompressSync}=await import('node:zlib');
 const w=JSON.parse(await readFile(new URL('./fixtures/tadim-release-retained-20261110.json',import.meta.url),'utf8'));
 const payload=JSON.parse(brotliDecompressSync(Buffer.from(w.data,'base64')));
 assert.equal(payload.case,'tadim_release');assert.equal(500+payload.receipts.reduce((n,r)=>n+r.charge_kurus,0),1965);
 const route=payload.receipts.find(r=>r.step_key==='routing:bhs-v8:worker-billing');
 assert.equal(route.charge_kurus,0);assert.equal(route.value.recoveredDiagnostic.providerReason,'billing_required');
 const paid=payload.receipts.find(r=>r.step_key===route.value.recoveredDiagnostic.failedStep);
 assert.equal(paid.state,'uncertain');assert.equal(paid.value.providerStatus,403);assert.equal(paid.charge_kurus,108);
 const invalid=payload.receipts.find(r=>r.step_key.startsWith('model:bhs-v8:manager:v8-worker-billing-fallback:'));
 assert.equal(invalid.charge_kurus,269);assert.deepEqual(invalid.value.data.facts[0].sourceIds,[]);
});
test('all eleven actual paid repair facts replay under the finite extraction contract without a network call or lost proof',async()=>{
 const {readFile}=await import('node:fs/promises');const {brotliDecompressSync}=await import('node:zlib');
 const {sequentialContext,phaseExtractionSchema,withProofIds,validateProofRows}=await import('../src/bhs/sequential-contracts.mjs');
 const {assertSchema}=await import('../src/bhs/schema.mjs');
 const p=JSON.parse(brotliDecompressSync(Buffer.from(JSON.parse(await readFile(new URL('./fixtures/tadim-release-retained-20261110.json',import.meta.url),'utf8')).data,'base64')));
 const row=p.receipts.find(r=>r.step_key.startsWith('model:bhs-v8:fallbackWorker:')&&r.step_key.includes('repair-extract:'));
 const stage=p.receipts.find(r=>r.step_key.startsWith('audit:brand_correction_sources:')).value;
 const c=sequentialContext({brandName:'Tadım',website:'https://www.tadim.com.tr/'},stage);
 assert.equal(row.value.data.facts.length,11);assert.equal(row.charge_kurus,42);
 assertSchema(row.value.data,withProofIds(phaseExtractionSchema('brand'),c));validateProofRows(row.value.data.facts,c);
 for(const topic of ['identity','products','business_model','market'])assert.ok(row.value.data.facts.some(f=>f.topic===topic));
 const expanded=Array.from({length:75},(_,i)=>({...row.value.data.facts[i%11],id:'additional_'+i}));
 assertSchema({...row.value.data,facts:expanded},withProofIds(phaseExtractionSchema('brand'),c));validateProofRows(expanded,c);
});
test('the real paid repair resumes its PostgreSQL stage after removing count ceilings with zero additional provider calls',async()=>{
 const {readFile}=await import('node:fs/promises');const {brotliDecompressSync}=await import('node:zlib');
 const {localBudget}=await import('./fixtures/local-budget.mjs');const {snapshotBrief,briefHash}=await import('../src/bhs/brief.mjs');
 const {createSequentialProviders}=await import('../src/bhs/sequential-providers.mjs');const {runSequentialStage}=await import('../src/bhs/sequential-research.mjs');
 const brief=snapshotBrief({brandName:'Tadım',website:'https://www.tadim.com.tr/',segment:'corporate',goals:'Türkiye pazarında sürdürülebilir ve kârlı büyüme.',needs:'Marka, sektör, rekabet ve müşteri geri bildirimleri üzerinden kaynaklı darboğaz araştırması.',services:'Büyüme danışmanlığı ve dijital pazarlama',meetingNotes:'Kamuya açık marka için sentetik kabul testi; gerçek CRM, müşteri veya satış verisi kullanılmıyor.'});
 const p=JSON.parse(brotliDecompressSync(Buffer.from(JSON.parse(await readFile(new URL('./fixtures/tadim-release-retained-20261110.json',import.meta.url),'utf8')).data,'base64')));
 assert.equal(briefHash(brief),p.briefHash);const db=await localBudget({seed:p.receipts});let networkCalls=0;
 try{const before=await db.ledger.status(),providers=createSequentialProviders({ledger:db.ledger,phase:'brand_correction_draft',anthropicKey:'synthetic',geminiKey:'synthetic',fetchImpl:async()=>{networkCalls++;assert.fail('Paid reply must be reused');}});
  const out=await runSequentialStage({phase:'brand_correction_draft',brief,providers,previous:async name=>p.receipts.find(r=>r.step_key.startsWith('audit:'+name+':')).value});
  assert.equal(out.workerData.facts.length,15);assert.equal(networkCalls,0);assert.equal((await db.ledger.status()).chargedKurus,before.chargedKurus);
 }finally{await db.close();}
});

test('the actual empty paid operator reply is rejected without another purchase and stays available for expert correction',async()=>{
 const {readFile}=await import('node:fs/promises');const {brotliDecompressSync}=await import('node:zlib');
 const {localBudget}=await import('./fixtures/local-budget.mjs');const {snapshotBrief}=await import('../src/bhs/brief.mjs');
 const {createSequentialProviders}=await import('../src/bhs/sequential-providers.mjs');const {runSequentialStage}=await import('../src/bhs/sequential-research.mjs');
 const brief=snapshotBrief({brandName:'Tadım',website:'https://www.tadim.com.tr/',segment:'corporate',goals:'Türkiye pazarında sürdürülebilir ve kârlı büyüme.',needs:'Marka, sektör, rekabet ve müşteri geri bildirimleri üzerinden kaynaklı darboğaz araştırması.',services:'Büyüme danışmanlığı ve dijital pazarlama',meetingNotes:'Kamuya açık marka için sentetik kabul testi; gerçek CRM, müşteri veya satış verisi kullanılmıyor.'});
 const p=JSON.parse(brotliDecompressSync(Buffer.from(JSON.parse(await readFile(new URL('./fixtures/tadim-final-retained-20261110.json',import.meta.url),'utf8')).data,'base64'))),db=await localBudget({seed:p.receipts});let calls=0;
 try{
  const cost=await db.ledger.status(),providers=createSequentialProviders({ledger:db.ledger,phase:'brand_draft',anthropicKey:'synthetic',geminiKey:'synthetic',fetchImpl:async()=>{calls++;assert.fail('Already paid');}});
  const out=await runSequentialStage({phase:'brand_draft',brief,providers,previous:async name=>p.receipts.find(r=>r.step_key.startsWith('audit:'+name+':')).value});
  assert.equal(calls,0);assert.deepEqual(out.workerData.facts,[]);assert.equal(out.operatorValidation.rejectedCandidates[0].reason,'empty_statement');assert.equal((await db.ledger.status()).chargedKurus,cost.chargedKurus);
 }finally{await db.close();}
});

test('a real paid truncated sector reply advances only its empty draft, preserving every charge for mandatory expert review',async()=>{
 const {readFile}=await import('node:fs/promises');const {brotliDecompressSync}=await import('node:zlib');
 const {localBudget}=await import('./fixtures/local-budget.mjs');const {snapshotBrief}=await import('../src/bhs/brief.mjs');
 const {createSequentialProviders}=await import('../src/bhs/sequential-providers.mjs');const {runSequentialStage}=await import('../src/bhs/sequential-research.mjs');
 const brief=snapshotBrief({brandName:'Tadım',website:'https://www.tadim.com.tr/',segment:'corporate',goals:'Türkiye pazarında sürdürülebilir ve kârlı büyüme.',needs:'Marka, sektör, rekabet ve müşteri geri bildirimleri üzerinden kaynaklı darboğaz araştırması.',services:'Büyüme danışmanlığı ve dijital pazarlama',meetingNotes:'Kamuya açık marka için sentetik kabul testi; gerçek CRM, müşteri veya satış verisi kullanılmıyor.'});
 const p=JSON.parse(brotliDecompressSync(Buffer.from(JSON.parse(await readFile(new URL('./fixtures/tadim-final-retained-20261110.json',import.meta.url),'utf8')).data,'base64'))),db=await localBudget({seed:p.receipts});let calls=0;
 try{
  const cost=await db.ledger.status(),providers=createSequentialProviders({ledger:db.ledger,phase:'sector_draft',anthropicKey:'synthetic',geminiKey:'synthetic',fetchImpl:async()=>{calls++;assert.fail('No second purchase');}});
  const out=await runSequentialStage({phase:'sector_draft',brief,providers,previous:async name=>p.receipts.find(r=>r.step_key.startsWith('audit:'+name+':')&&r.state==='complete').value});
  assert.equal(calls,0);assert.deepEqual(out.workerData.facts,[]);assert.equal(out.operatorValidation.rejectedOutput.code,'incomplete');assert.equal(out.operatorValidation.independentSourceReviewRequired,true);assert.equal((await db.ledger.status()).chargedKurus,cost.chargedKurus);
 }finally{await db.close();}
});
