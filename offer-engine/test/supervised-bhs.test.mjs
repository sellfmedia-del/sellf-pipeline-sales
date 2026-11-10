import test from 'node:test';
import assert from 'node:assert/strict';
import {createLedger} from '../src/budget/ledger.mjs';
import {createSupervisedProviders,quoteSupervised,supervisedModels} from '../src/bhs/supervised-providers.mjs';
import {actorChargeLimit,safeActorInput,matchedActorTasks,inspectApifyPolicies} from '../src/bhs/apify-policy.mjs';
import {remapWorkerProofs,runSupervisedStage} from '../src/bhs/supervised-research.mjs';
import {stageKey} from '../src/bhs/direct-research.mjs';
import {createSupervisedReadiness} from '../src/bhs/supervised-readiness.mjs';
import {response} from './fixtures/offer.mjs';
import {expertContext} from '../src/bhs/expert-report.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {brief as raw} from './fixtures/bhs.mjs';
import {taskSchema,reviewSchema} from '../src/bhs/sequential-contracts.mjs';
const now=()=>Date.parse('2026-11-09T12:00:00Z');
const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
const json=v=>new Response(JSON.stringify(v));
function account(initial=500){
 const rows=new Map();let charged=initial;
 return {rows,ledger:createLedger(async(op,a={})=>{
  if(op==='begin'||op==='status')return {chargedKurus:charged,capKurus:5000};
  if(op==='get')return rows.get(a.step)||null;
  const prior=rows.get(a.step);
  if(op==='reserve'){
   if(prior){assert.equal(prior.input_hash,a.hash);return {claimed:false,step:prior};}
   if(charged+a.amount>5000)return {blocked:true};
   charged+=a.amount;const step={state:'reserved',input_hash:a.hash,claim_token:a.token,charge_kurus:a.amount};rows.set(a.step,step);return {claimed:true,step};
  }
  assert.equal(prior.claim_token,a.token);
  if(op==='complete'){charged-=prior.charge_kurus-a.amount;prior.charge_kurus=a.amount;}
  const row={...prior,state:op,value:a.value};rows.set(a.step,row);return row;
 })};
}
function transport({onGenerate,invalid=false}={}){
 const calls=[];
 return {calls,fetchImpl:async(url,opts)=>{
  const body=opts?.body?JSON.parse(opts.body):null;calls.push({url,body,headers:opts?.headers});
  if(url.includes('tcmb'))return new Response('<Tarih_Date Tarih="09.11.2026"><Currency CurrencyCode="USD"><ForexSelling>44</ForexSelling></Currency></Tarih_Date>');
  if(url.includes('count_tokens'))return json({input_tokens:100});
  if(url.includes(':countTokens'))return json({totalTokens:100});
  if(onGenerate)return onGenerate(url,body);
  if(url.includes('anthropic'))return json({model:supervisedModels.manager,usage:{input_tokens:100,output_tokens:50},stop_reason:'end_turn',content:[{type:'text',text:invalid?'bad-json':'{"ok":true}'}]});
  return json({modelVersion:supervisedModels.worker,usageMetadata:{promptTokenCount:100,candidatesTokenCount:40,thoughtsTokenCount:10,totalTokenCount:150},candidates:[{finishReason:'STOP',content:{parts:[{text:'{"ok":true}'}]}}]});
 }};
}
const base={configured:()=>true,generate:async()=>({legacyScope:true})};
function providers(db,t){return createSupervisedProviders({ledger:db.ledger,anthropicKey:'private-manager',geminiKey:'private-worker',base,now,fetchImpl:t.fetchImpl});}
test('manager and worker use distinct APIs, count inputs, settle actual usage and reuse receipts',async()=>{
 const db=account(),t=transport(),p=providers(db,t);
 const manager=await p.manager('plan',{instruction:'Plan',brief:{name:'Public'}},schema,{maxOutputTokens:512});
 const worker=await p.worker('extract',{instruction:'Extract'},schema,{maxOutputTokens:512});
 assert.equal(manager.model,'claude-sonnet-5-5');assert.equal(worker.model,'gemini-3.1-flash-lite');
 assert.ok(manager.accountedKurus<manager.reservedKurus);assert.ok(worker.accountedKurus<worker.reservedKurus);
 const cost=await db.ledger.status();assert.equal(cost.chargedKurus,500+manager.accountedKurus+worker.accountedKurus);
 const count=t.calls.length;
 await p.manager('plan',{instruction:'Plan',brief:{name:'Public'}},schema,{maxOutputTokens:512});
 assert.equal(t.calls.length,count);assert.equal((await p.generate()).legacyScope,true);
 const request=t.calls.find(c=>c.url.endsWith('/messages')).body;
 assert.equal(request.max_tokens,512);assert.equal(request.tools,undefined);assert.equal(request.output_config.format.type,'json_schema');
 assert.ok(!JSON.stringify(request).includes('private-manager'));
});
test('ambiguous paid timeout retains its reservation across a new worker instance',async()=>{
 const db=account(),t=transport({onGenerate:async()=>{throw new DOMException('Timed out','TimeoutError');}});
 await assert.rejects(providers(db,t).manager('review',{},schema,{maxOutputTokens:512}));
 const cost=await db.ledger.status();assert.ok(cost.chargedKurus>500);
 const calls=t.calls.length;
 await assert.rejects(providers(db,t).manager('review',{},schema,{maxOutputTokens:512}),e=>e.code==='budget_uncertain');
 assert.equal(t.calls.length,calls);assert.deepEqual(await db.ledger.status(),cost);
});
test('invalid output settles known usage but never silently buys another answer',async()=>{
 const db=account(),t=transport({invalid:true}),p=providers(db,t);
 await assert.rejects(p.manager('final',{},schema,{maxOutputTokens:512}),e=>e.code==='invalid_report');
 const n=t.calls.length,cost=await db.ledger.status();
 await assert.rejects(p.manager('final',{},schema,{maxOutputTokens:512}),e=>e.code==='invalid_report');
 assert.equal(t.calls.length,n);assert.deepEqual(await db.ledger.status(),cost);assert.ok(cost.chargedKurus<500+quoteSupervised('manager',4216,512,now()));
});
test('following-stage budget is kept even when the provider has account credit',async()=>{
 const db=account(4390),t=transport();
 await assert.rejects(providers(db,t).manager('final',{},schema,{maxOutputTokens:16384}),e=>e.code==='budget_limit');
 assert.equal(t.calls.filter(c=>c.url.endsWith('/messages')).length,0);assert.equal((await db.ledger.status()).chargedKurus,4390);
});
test('concurrent identical calls cannot duplicate paid work',async()=>{
 const db=account(),t=transport(),p=providers(db,t);
 const values=await Promise.allSettled([p.worker('extract',{},schema,{maxOutputTokens:512}),p.worker('extract',{},schema,{maxOutputTokens:512})]);
 assert.ok(values.some(v=>v.status==='fulfilled'));
 assert.equal(t.calls.filter(c=>c.url.endsWith(':generateContent')).length,1);
});
test('unverifiable usage stays reserved and model changes cannot pass as the selected manager',async()=>{
 const db=account(),t=transport({onGenerate:async()=>json({model:'unapproved',usage:{input_tokens:100,output_tokens:50},stop_reason:'end_turn',content:[]})});
 await assert.rejects(providers(db,t).manager('final',{},schema,{maxOutputTokens:512}),e=>e.code==='provider_accounting');
 assert.ok((await db.ledger.status()).chargedKurus>500);
});
const policy={actor:'apify/instagram-profile-scraper',actorId:'actor1',task:{id:'task1',actId:'actor1',options:{maxTotalChargeUsd:.03}},requestedUsd:.1,remainingKurus:3000,pricing:{pricingModel:'PAY_PER_EVENT',isPPEPlatformUsagePaidByUser:false}};
test('saved .03 actor limit is never raised to the .40 maximum',()=>{
 const result=actorChargeLimit(policy);assert.equal(result.maxTotalChargeUsd,.03);
 const limited=actorChargeLimit({...policy,remainingKurus:1650});assert.ok(limited.maxTotalChargeUsd<.03);assert.ok(limited.reservedKurus<=50);
 assert.equal(matchedActorTasks('actor1',[policy.task,{...policy.task,id:'cheaper',options:{maxTotalChargeUsd:.01}}])[0].id,'cheaper');
});
test('unverified console form, mismatched Task and excluded platform fees cannot start an actor',()=>{
 for(const patch of [{task:null},{task:{...policy.task,actId:'other'}},{task:{...policy.task,options:{maxTotalChargeUsd:.5}}},{pricing:{pricingModel:'FREE'}},{pricing:{pricingModel:'PAY_PER_EVENT',isPPEPlatformUsagePaidByUser:true}}])assert.throws(()=>actorChargeLimit({...policy,...patch}));
});
test('SEO and Instagram inputs are finite and expensive extras stay disabled',()=>{
 assert.deepEqual(safeActorInput(policy.actor,'https://www.instagram.com/sellfmedia/'),{usernames:['sellfmedia'],includeAboutSection:false});
 const seo=safeActorInput('logiover/website-seo-audit-crawler','https://brand.example/');assert.equal(seo.maxPagesToCrawl,5);assert.equal(seo.useProxy,false);
 assert.throws(()=>safeActorInput(policy.actor,'https://instagram.com/p/privatepost/'));
});
test('proof IDs are rebound by original URL and quote after correction changes paragraph order',()=>{
 const a={id:'e1',url:'https://brand.example/',quote:'A verified public product price.'},b={id:'e1',url:'https://other.example/',quote:'A different company and price.'};
 const result=remapWorkerProofs([{id:'w1',sourceIds:['e1']}],{known:new Map([['e1',a]])},{cards:[b,{...a,id:'e9'}]});
 assert.deepEqual(result[0].sourceIds,['e9']);
 assert.deepEqual(remapWorkerProofs([{id:'w1',sourceIds:['e1']}],{known:new Map([['e1',a]])},{cards:[b]}),[]);
});
test('v7 stage receipts cannot reuse or overwrite v6 results',()=>{
 assert.notEqual(stageKey({brand:'test'},'evidence','v7'),stageKey({brand:'test'},'evidence','v6'));
 assert.notEqual(stageKey({brand:'test'},'workers','v7'),stageKey({brand:'test'},'review','v7'));
});
test('worker assignments reject a fabricated proof before supervisor review',async()=>{
 const brief=snapshotBrief({...raw,website:'https://brand.example/'}),packet={version:'sellf-evidence-v1',briefHash:briefHash(brief),asOf:'2026-11-09',entities:[],sources:[{id:'ev1',url:brief.website,finalUrl:brief.website,method:'html',title:'Brand',excerpts:[{text:'Public product prices and delivery conditions are listed here.'}]}]};
 const p={worker:async(stage,input,schema,opts)=>{opts.validateData({candidates:[{dimension:'funnel',sourceIds:['invented'],observation:'false',uncertainty:'',question:''}],gaps:[]});}};
 await assert.rejects(runSupervisedStage({phase:'workers',brief,providers:p,previous:async()=>({packet,searches:[]})}),e=>e.code==='model_output_invalid');
 assert.ok(expertContext(brief,{packet,searches:[]}).cards.length);
});
test('readiness is preview-only and probes catalogues without paid endpoints or secret output',async()=>{
 const calls=[],env={VERCEL_ENV:'preview',ANTHROPIC_API_KEY:'private-a',GEMINI_API_KEY:'private-g',APIFY_API_TOKEN:'private-p'};
 const fetchImpl=async url=>{calls.push(url);return json(url.endsWith('/users/me')?{data:{username:'synthetic-owner',email:'private-email@example.invalid'}}:url.includes('actor-tasks')?{data:{items:[],total:0}}:{});};
 const h=createSupervisedReadiness({env,fetchImpl}),res=response();await h({method:'GET'},res);
 assert.equal(res.code,200);assert.equal(res.data.manager.authenticated,true);assert.equal(res.data.paidCalls,0);assert.equal(res.data.apify.taskPolicies,0);assert.equal(res.data.apify.accountUsername,'synthetic-owner');
 assert.ok(calls.every(u=>!u.includes('/runs')&&!u.includes('/messages')&&!u.includes(':generateContent')));assert.ok(!JSON.stringify(res.data).includes('private-'));
 const prod=response();await createSupervisedReadiness({env:{VERCEL_ENV:'production'},fetchImpl})({method:'GET'},prod);assert.equal(prod.code,404);
});

const validWorker=()=>json({modelVersion:supervisedModels.worker,usageMetadata:{promptTokenCount:100,candidatesTokenCount:40,thoughtsTokenCount:10,totalTokenCount:150},candidates:[{finishReason:'STOP',content:{parts:[{text:'{"ok":true}'}]}}]});
const v8Providers=(db,t)=>createSupervisedProviders({ledger:db.ledger,anthropicKey:'private-manager',geminiKey:'private-worker',base,now,fetchImpl:t.fetchImpl,receiptVersion:'v8',delay:async()=>{}});
test('a source-qualified operator task longer than 1200 characters is preserved and reused without another paid call',async()=>{
 const instruction='Kaynağı doğrula. '.repeat(100)+'Son sınır: doğrulanamayan sahiplik ve ciroyu olgu olarak sunma.';
 assert.ok(instruction.length>1200&&instruction.length<2048);
 const db=account(),t=transport({onGenerate:async()=>json({model:supervisedModels.manager,usage:{input_tokens:100,output_tokens:600},stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({instruction,queries:[]})}]})});
 const p=v8Providers(db,t),first=await p.manager('v8-brand-plan',{},taskSchema,{maxOutputTokens:2048});
 assert.equal(first.data.instruction,instruction);const n=t.calls.length,cost=await db.ledger.status();
 assert.deepEqual(await p.manager('v8-brand-plan',{},taskSchema,{maxOutputTokens:2048}),first);
 assert.equal(t.calls.length,n);assert.deepEqual(await db.ledger.status(),cost);
 const invalid=transport({onGenerate:async()=>json({model:supervisedModels.manager,usage:{input_tokens:100,output_tokens:1600},stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({instruction:'x'.repeat(6001),queries:[]})}]})});
 await assert.rejects(v8Providers(account(),invalid).manager('v8-brand-plan',{},taskSchema,{maxOutputTokens:2048}),e=>e.code==='model_output_invalid');
});
test('one explicit transient rejection receives a separately funded retry while its original commitment stays charged',async()=>{
 const db=account();let generated=0;
 const t=transport({onGenerate:async()=>++generated===1?new Response(JSON.stringify({error:{code:503,message:'Temporarily unavailable.'}}),{status:503}):validWorker()});
 const p=v8Providers(db,t),answer=await p.worker('extract',{},schema,{maxOutputTokens:512});assert.equal(answer.data.ok,true);assert.equal(generated,2);
 const rows=[...db.rows.values()];assert.equal(rows.filter(r=>r.state==='uncertain').length,1);assert.ok(rows.find(r=>r.state==='uncertain').charge_kurus>0);
 const cost=await db.ledger.status();await v8Providers(db,t).worker('extract',{},schema,{maxOutputTokens:512});assert.equal(generated,2);assert.deepEqual(await db.ledger.status(),cost);
});
test('repeated service errors, ambiguous timeouts and insufficient budget cannot buy an unbounded attempt',async()=>{
 for(const kind of ['twice','timeout','budget']){
  const db=account(kind==='budget'?4380:500);let generated=0;
  const t=transport({onGenerate:async()=>{generated++;if(kind==='timeout')throw new DOMException('Timed out','TimeoutError');return new Response(JSON.stringify({error:{code:503,message:'Temporarily unavailable.'}}),{status:503});}});
  await assert.rejects(v8Providers(db,t).worker('extract',{},schema,{maxOutputTokens:512}));
  assert.equal(generated,kind==='twice'?4:1);const cost=await db.ledger.status();assert.ok(cost.chargedKurus<=5000);
  await assert.rejects(v8Providers(db,t).worker('extract',{},schema,{maxOutputTokens:512}));assert.equal(generated,kind==='twice'?4:1);assert.deepEqual(await db.ledger.status(),cost);
 }
});

test('explicit Gemini outage hands the same task to Claude once and reuses it after restart without changing manager review',async()=>{
 const db=account();let workers=0,operators=0;
 const t=transport({onGenerate:async url=>{
  if(url.endsWith(':generateContent')){workers++;return new Response(JSON.stringify({error:{message:'Unavailable'}}),{status:503});}
  operators++;return json({model:supervisedModels.manager,usage:{input_tokens:100,output_tokens:50},stop_reason:'end_turn',content:[{type:'text',text:'{"ok":true}'}]});
 }});
 const input={instruction:'Extract only the cited source.',proofIds:['p_original']},p=v8Providers(db,t);
 const answer=await p.worker('extract',input,schema,{maxOutputTokens:512});
 assert.equal(answer.model,supervisedModels.manager);assert.equal(workers,2);assert.equal(operators,1);
 assert.equal([...db.rows.values()].filter(r=>r.state==='uncertain').length,2);
 const call=t.calls.find(c=>c.url.endsWith('/messages'));assert.deepEqual(JSON.parse(call.body.messages[0].content),{proofIds:['p_original']});
 assert.ok(call.body.system.startsWith(input.instruction));
 const cost=await db.ledger.status(),calls=t.calls.length;
 assert.deepEqual(await v8Providers(db,t).worker('extract',input,schema,{maxOutputTokens:512}),answer);
 assert.equal(t.calls.length,calls);assert.deepEqual(await db.ledger.status(),cost);
 await p.manager('review',input,schema,{maxOutputTokens:512});assert.equal(operators,2);
});

test('Claude operator fallback keeps output validation and cannot consume protected final-stage funds',async()=>{
 for(const kind of ['invalid','budget','timeout','quota']){
  const db=account(kind==='budget'?4300:500);let operators=0,workers=0;
  const t=transport({onGenerate:async url=>{
   if(url.endsWith(':generateContent')){workers++;if(kind==='timeout')throw new DOMException('Timed out','TimeoutError');return new Response(JSON.stringify({error:{message:'Unavailable'}}),{status:kind==='quota'?429:503});}
   operators++;return json({model:supervisedModels.manager,usage:{input_tokens:100,output_tokens:50},stop_reason:'end_turn',content:[{type:'text',text:'{"ok":false}'}]});
  }});
  await assert.rejects(v8Providers(db,t).worker('extract',{},schema,{maxOutputTokens:512,validateData:data=>{if(!data.ok)throw Error('fabricated proof');}}));
  assert.equal(operators,kind==='invalid'?1:0);assert.equal(workers,['timeout','quota'].includes(kind)?1:2);
  const cost=await db.ledger.status();assert.ok(cost.chargedKurus<=4400);
  await assert.rejects(v8Providers(db,t).worker('extract',{},schema,{maxOutputTokens:512,validateData:data=>{if(!data.ok)throw Error('fabricated proof');}}));
  // A blocked admission may repeat a free token count, never a paid generation.
  assert.equal(t.calls.filter(c=>c.url.endsWith('/messages')).length,operators);assert.deepEqual(await db.ledger.status(),cost);
 }
});

test('saved scraper caps are read from matching Task details without exposing inputs or executing Actors',async()=>{
 const task={id:'task12345678901',actId:'hGO9TU7F0OD97VxNC'},calls=[];
 const result=await inspectApifyPolicies({token:'private-policy',fetchImpl:async(url,options)=>{
  calls.push({url,method:options.method||'GET'});
  return json(url.includes('?')?{data:{items:[task],total:1}}:{data:{...task,options:{maxTotalChargeUsd:.03},input:{privateSession:'must-not-leak'}}});
 }});
 assert.equal(result.savedTaskCount,1);assert.equal(result.taskPolicies,1);assert.equal(result.tasks[0].options.maxTotalChargeUsd,.03);
 assert.equal(calls.length,2);assert.ok(calls.every(c=>c.method==='GET'&&!c.url.includes('/runs')));
 assert.ok(!JSON.stringify(result).includes('privateSession'));
 const invalid=await inspectApifyPolicies({token:'private-policy',fetchImpl:async url=>json(url.includes('?')?{data:{items:[task],total:1}}:{data:{...task,actId:'anotherActor',options:{maxTotalChargeUsd:.03}}})});
 assert.equal(invalid.taskPolicies,0);assert.equal(invalid.complete,false);
});

test('a long internal review explanation preserves the verdict and original wording within the existing generation budget',async()=>{
 const notes='Kaynak eşleşmesi ile ticari çıkarım ayrı değerlendirilir. '.repeat(32);
 assert.ok(notes.length>1400&&notes.length<6000);
 const data={acceptedIds:[],rejectedIds:[],decision:'limited',missing:[],notes,nextTask:{instruction:'Sektörü incele.',queries:[]},repairTask:{instruction:'Kaynak eşleşmesini düzelt.',queries:[]}};
 const db=account(),t=transport({onGenerate:async()=>json({model:supervisedModels.manager,usage:{input_tokens:100,output_tokens:700},stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(data)}]})}),p=v8Providers(db,t);
 assert.deepEqual((await p.manager('v8-brand-review',{},reviewSchema,{maxOutputTokens:4096})).data,data);
 assert.equal(t.calls.find(c=>c.url.endsWith('/messages')).body.max_tokens,4096);
 const calls=t.calls.length;await p.manager('v8-brand-review',{},reviewSchema,{maxOutputTokens:4096});assert.equal(t.calls.length,calls);
});
