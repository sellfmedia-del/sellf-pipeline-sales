import test from 'node:test';
import assert from 'node:assert/strict';
import {createLedger} from '../src/budget/ledger.mjs';
import {stageBudgetLedger} from '../src/bhs/sequential-providers.mjs';
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
test('Haiku fallback quotes both prompt-price tiers without borrowing the cheaper long-context rate',()=>{
 assert.equal(quoteSupervised('fallbackWorker',100000,1000,now()),Math.ceil((100000*.1+1000*.5)/1e6*60*1.2*100));
 assert.equal(quoteSupervised('fallbackWorker',100001,1000,now()),Math.ceil((100001*.5+1000*2.5)/1e6*60*1.2*100));
});
const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
const json=v=>new Response(JSON.stringify(v));
const roleAnswer=(body,data)=>json({model:body.model,usage:{input_tokens:100,output_tokens:50},stop_reason:body.tools?'tool_use':'end_turn',content:body.tools?[{type:'tool_use',id:'toolu_synthetic',name:'emit_bhs_stage',input:data}]:[{type:'text',text:JSON.stringify(data)}]});
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
 assert.equal(res.code,200);assert.equal(res.data.manager.authenticated,true);assert.equal(res.data.paidCalls,0);assert.equal(res.data.apify.defaultPolicyCount,13);assert.equal(res.data.apify.accountUsername,'synthetic-owner');
 assert.ok(calls.every(u=>!u.includes('/runs')&&!u.includes('/messages')&&!u.includes(':generateContent')));assert.ok(!JSON.stringify(res.data).includes('private-'));
 const prod=response();await createSupervisedReadiness({env:{VERCEL_ENV:'production'},fetchImpl})({method:'GET'},prod);assert.equal(prod.code,404);
});

const validWorker=()=>json({modelVersion:supervisedModels.worker,usageMetadata:{promptTokenCount:100,candidatesTokenCount:40,thoughtsTokenCount:10,totalTokenCount:150},candidates:[{finishReason:'STOP',content:{parts:[{text:'{"ok":true}'}]}}]});
const v8Providers=(db,t)=>createSupervisedProviders({ledger:db.ledger,anthropicKey:'private-manager',geminiKey:'private-worker',base,now,fetchImpl:t.fetchImpl,receiptVersion:'v8',delay:async()=>{}});
test('a source-qualified operator task longer than 1200 characters is preserved and reused without another paid call',async()=>{
 const instruction='Kaynağı doğrula. '.repeat(100)+'Son sınır: doğrulanamayan sahiplik ve ciroyu olgu olarak sunma.';
 assert.ok(instruction.length>1200&&instruction.length<2048);
 const db=account(),t=transport({onGenerate:async()=>json({model:supervisedModels.manager,usage:{input_tokens:100,output_tokens:600},stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({instruction,queries:[],actorRequests:[]})}]})});
 const p=v8Providers(db,t),first=await p.manager('v8-brand-plan',{},taskSchema,{maxOutputTokens:2048});
 assert.equal(first.data.instruction,instruction);const n=t.calls.length,cost=await db.ledger.status();
 assert.deepEqual(await p.manager('v8-brand-plan',{},taskSchema,{maxOutputTokens:2048}),first);
 assert.equal(t.calls.length,n);assert.deepEqual(await db.ledger.status(),cost);
 const invalid=transport({onGenerate:async()=>json({model:supervisedModels.manager,usage:{input_tokens:100,output_tokens:1600},stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({instruction:'x'.repeat(6001),queries:[],actorRequests:[]})}]})});
 await assert.rejects(v8Providers(account(),invalid).manager('v8-brand-plan',{},taskSchema,{maxOutputTokens:2048}),e=>e.code==='model_output_invalid');
});
test('one explicit transient rejection receives a separately funded retry while its original commitment stays charged',async()=>{
 const db=account();let generated=0;
 const t=transport({onGenerate:async()=>++generated===1?new Response(JSON.stringify({error:{code:503,message:'Temporarily unavailable.'}}),{status:503}):validWorker()});
 const p=v8Providers(db,t),answer=await p.worker('extract',{},schema,{maxOutputTokens:512});assert.equal(answer.data.ok,true);assert.equal(generated,2);
 const rows=[...db.rows.values()];assert.equal(rows.filter(r=>r.state==='uncertain'&&r.charge_kurus>0).length,1);assert.ok(rows.find(r=>r.state==='uncertain').charge_kurus>0);
 const cost=await db.ledger.status();await v8Providers(db,t).worker('extract',{},schema,{maxOutputTokens:512});assert.equal(generated,2);assert.deepEqual(await db.ledger.status(),cost);
});
test('repeated service errors, ambiguous timeouts and insufficient budget cannot buy an unbounded attempt',async()=>{
 for(const kind of ['twice','timeout','budget']){
  const db=account(kind==='budget'?4935:500);let generated=0;
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
 assert.equal([...db.rows.values()].filter(r=>r.state==='uncertain'&&r.charge_kurus>0).length,2);
 const call=t.calls.find(c=>c.url.endsWith('/messages'));assert.deepEqual(JSON.parse(call.body.messages[0].content),{proofIds:['p_original']});
 assert.ok(call.body.system.startsWith(input.instruction));
 const cost=await db.ledger.status(),calls=t.calls.length;
 assert.deepEqual(await v8Providers(db,t).worker('extract',input,schema,{maxOutputTokens:512}),answer);
 assert.equal(t.calls.length,calls);assert.deepEqual(await db.ledger.status(),cost);
 await p.manager('review',input,schema,{maxOutputTokens:512});assert.equal(operators,2);
});


test('a free token-count billing rejection routes to the priced fallback before any Google generation is reserved',async()=>{
 const db=account();let googleGenerations=0;
 const t=transport({onGenerate:async(url,body)=>{if(url.endsWith(':generateContent')){googleGenerations++;assert.fail('No Google generation');}return roleAnswer(body,{ok:true});}});
 const original=t.fetchImpl;t.fetchImpl=async(url,options)=>url.endsWith(':countTokens')?new Response(JSON.stringify({error:{message:'Billing required.'}}),{status:403}):original(url,options);
 const out=await v8Providers(db,t).worker('extract',{},schema,{maxOutputTokens:512});
 assert.equal(out.model,supervisedModels.fallbackWorker);assert.equal(googleGenerations,0);assert.equal([...db.rows.values()].filter(r=>r.state==='uncertain').length,0);
 const cost=await db.ledger.status(),calls=t.calls.length;await v8Providers(db,t).worker('extract',{},schema,{maxOutputTokens:512});assert.deepEqual(await db.ledger.status(),cost);assert.equal(t.calls.length,calls);
});
test('Haiku structured extraction requires exactly the named output tool and retains invalid paid replies',async()=>{
 for(const kind of ['valid','wrong','duplicate','truncated']){
  const db=account();let generated=0;
  const t=transport({onGenerate:async(_url,body)=>{
   generated++;assert.equal(body.thinking,undefined);assert.equal(body.max_tokens,512);assert.deepEqual(body.tool_choice,{type:'tool',name:'emit_bhs_stage'});
   const call={type:'tool_use',id:'toolu_test',name:kind==='wrong'?'other':'emit_bhs_stage',input:{ok:true}};
   return json({model:body.model,usage:{input_tokens:100,output_tokens:50},stop_reason:kind==='truncated'?'max_tokens':'tool_use',content:kind==='duplicate'?[call,{...call,id:'toolu_duplicate'}]:[call]});
  }});
  const original=t.fetchImpl;t.fetchImpl=async(url,options)=>url.endsWith(':countTokens')?new Response(JSON.stringify({error:{message:'Billing required.'}}),{status:403}):original(url,options);
  const run=()=>v8Providers(db,t).worker('extract',{},schema,{maxOutputTokens:512});
  if(kind==='valid')assert.equal((await run()).data.ok,true);else await assert.rejects(run(),e=>e.code==='incomplete');
  const cost=await db.ledger.status();assert.ok(cost.chargedKurus>500);
  if(kind==='valid')await run();else await assert.rejects(run(),e=>e.code==='incomplete');
  assert.equal(generated,1);assert.deepEqual(await db.ledger.status(),cost);
 }
});
test('a definitive Google billing rejection routes this job to Claude without retrying Google or discarding its commitment',async()=>{
 const db=account();let workers=0,operators=0;
 const t=transport({onGenerate:async (url,body)=>{
  if(url.endsWith(':generateContent')){workers++;return new Response(JSON.stringify({error:{message:'Billing required for this project.'}}),{status:403});}
  operators++;return roleAnswer(body,{ok:true});
 }});
 const p=v8Providers(db,t),answer=await p.worker('brand',{},schema,{maxOutputTokens:512});
 assert.equal(answer.model,supervisedModels.fallbackWorker);assert.equal(workers,1);assert.equal(operators,1);
 const uncertain=[...db.rows.values()].find(r=>r.state==='uncertain'&&r.value?.providerStatus===403);assert.ok(uncertain.charge_kurus>0);
 const cost=await db.ledger.status(),calls=t.calls.length;
 assert.deepEqual(await v8Providers(db,t).worker('brand',{},schema,{maxOutputTokens:512}),answer);
 assert.equal(t.calls.length,calls);assert.deepEqual(await db.ledger.status(),cost);
 await v8Providers(db,t).worker('sector',{},schema,{maxOutputTokens:512});assert.equal(workers,1);assert.equal(operators,2);
 await p.manager('review',{},schema,{maxOutputTokens:512});assert.equal(operators,3);
 assert.equal([...db.rows.values()].find(r=>r.state==='uncertain').charge_kurus,uncertain.charge_kurus);
});
test('a billing fallback cannot spend the protected reserve, bypass validation or replace an ambiguous timeout',async()=>{
 for(const kind of ['budget','invalid','timeout','permission']){
  const db=account(kind==='budget'?4390:500);let operators=0,workers=0;
  const t=transport({onGenerate:async (url,body)=>{
   if(url.endsWith(':generateContent')){workers++;if(kind==='timeout')throw new DOMException('Timed out','TimeoutError');return new Response(JSON.stringify({error:{message:kind==='permission'?'Permission denied':'Billing required.'}}),{status:403});}
   operators++;return roleAnswer(body,{ok:false});
  }});
  const run=()=>v8Providers(db,t).worker('brand',{},schema,{maxOutputTokens:512,reserveForFollowingKurus:600,validateData:d=>{if(!d.ok)throw Error('bad proof');}});
  await assert.rejects(run());const cost=await db.ledger.status();await assert.rejects(run());
  assert.equal(workers,kind==='budget'?0:1);assert.equal(operators,kind==='invalid'?1:0);assert.deepEqual(await db.ledger.status(),cost);assert.ok(cost.chargedKurus<=4400);
 }
});
test('Claude operator fallback keeps output validation and cannot consume protected final-stage funds',async()=>{
 for(const kind of ['invalid','budget','timeout','quota']){
  const db=account(kind==='budget'?4300:500);let operators=0,workers=0;
  const t=transport({onGenerate:async url=>{
   if(url.endsWith(':generateContent')){workers++;if(kind==='timeout')throw new DOMException('Timed out','TimeoutError');return new Response(JSON.stringify({error:{message:'Unavailable'}}),{status:kind==='quota'?429:503});}
   operators++;return json({model:supervisedModels.manager,usage:{input_tokens:100,output_tokens:50},stop_reason:'end_turn',content:[{type:'text',text:'{"ok":false}'}]});
  }});
  await assert.rejects(v8Providers(db,t).worker('extract',{},schema,{maxOutputTokens:512,reserveForFollowingKurus:600,validateData:data=>{if(!data.ok)throw Error('fabricated proof');}}));
  assert.equal(operators,kind==='invalid'?1:0);assert.equal(workers,['timeout','quota'].includes(kind)?1:2);
  const cost=await db.ledger.status();assert.ok(cost.chargedKurus<=4400);
  await assert.rejects(v8Providers(db,t).worker('extract',{},schema,{maxOutputTokens:512,reserveForFollowingKurus:600,validateData:data=>{if(!data.ok)throw Error('fabricated proof');}}));
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
 assert.equal(result.savedTaskCount,1);assert.equal(result.taskPolicies,14);assert.equal(result.tasks[0].options.maxTotalChargeUsd,.03);
 assert.equal(calls.length,2);assert.ok(calls.every(c=>c.method==='GET'&&!c.url.includes('/runs')));
 assert.ok(!JSON.stringify(result).includes('privateSession'));
 const invalid=await inspectApifyPolicies({token:'private-policy',fetchImpl:async url=>json(url.includes('?')?{data:{items:[task],total:1}}:{data:{...task,actId:'anotherActor',options:{maxTotalChargeUsd:.03}}})});
 assert.equal(invalid.taskPolicies,13);assert.equal(invalid.complete,false);
});

test('a long internal review explanation preserves the verdict and original wording within the existing generation budget',async()=>{
 const notes='Kaynak eşleşmesi ile ticari çıkarım ayrı değerlendirilir. '.repeat(32);
 assert.ok(notes.length>1400&&notes.length<6000);
 const data={acceptedIds:[],rejectedIds:[],decision:'limited',missing:[],notes,nextTask:{instruction:'Sektörü incele.',queries:[],actorRequests:[]},repairTask:{instruction:'Kaynak eşleşmesini düzelt.',queries:[],actorRequests:[]}};
 const db=account(),t=transport({onGenerate:async()=>json({model:supervisedModels.manager,usage:{input_tokens:100,output_tokens:700},stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(data)}]})}),p=v8Providers(db,t);
 assert.deepEqual((await p.manager('v8-brand-review',{},reviewSchema,{maxOutputTokens:4096})).data,data);
 assert.equal(t.calls.find(c=>c.url.endsWith('/messages')).body.max_tokens,8192);
 const calls=t.calls.length;await p.manager('v8-brand-review',{},reviewSchema,{maxOutputTokens:4096});assert.equal(t.calls.length,calls);
});

test('jsonb key reordering cannot change the v8 paid request or its receipt after reconnect',async()=>{
 for(const role of ['manager','worker']){
  const db=account(),t=transport(),first={instruction:'Read only the supplied sources.',facts:[{id:'a',source:{url:'https://example.test/',quote:'Original public evidence.'}}],brief:{brand:'Public',market:'TR'}};
  const reordered={brief:{market:'TR',brand:'Public'},facts:[{source:{quote:'Original public evidence.',url:'https://example.test/'},id:'a'}],instruction:first.instruction};
  const answer=await v8Providers(db,t)[role]('stable-jsonb',first,schema,{maxOutputTokens:512}),calls=t.calls.length,cost=await db.ledger.status();
  assert.deepEqual(await v8Providers(db,t)[role]('stable-jsonb',reordered,schema,{maxOutputTokens:512}),answer);
  assert.equal(t.calls.length,calls);assert.deepEqual(await db.ledger.status(),cost);
 }
});

test('v8 evidence operators use low reasoning without consuming the caller visible-output allowance; v7 routing is unchanged',async()=>{
 for(const version of ['v7','v8']){
  const db=account(),t=transport(),p=createSupervisedProviders({ledger:db.ledger,anthropicKey:'private-manager',geminiKey:'private-worker',base,now,fetchImpl:t.fetchImpl,receiptVersion:version});
  await p.worker('single-source-extract',{},schema,{maxOutputTokens:512});
  const body=t.calls.find(c=>c.url.endsWith(':generateContent')).body;
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,version==='v8'?'LOW':'MINIMAL');assert.equal(body.generationConfig.maxOutputTokens,version==='v8'?3584:512);
  assert.ok((await db.ledger.status()).chargedKurus<5000);
 }
});

test('packed evidence verdicts use minimal reasoning and retain a funded output allowance',async()=>{
 const db=account(),t=transport();
 await v8Providers(db,t).worker('packed-review',{},schema,{maxOutputTokens:750,compactWorker:true,compactVerdicts:true});
 const {generationConfig}=t.calls.find(c=>c.url.endsWith(':generateContent')).body;
 assert.equal(generationConfig.thinkingConfig.thinkingLevel,'MINIMAL');
 assert.equal(generationConfig.maxOutputTokens,1134);
 assert.ok((await db.ledger.status()).chargedKurus<5000);
});

test('implicit cached input is part of the prompt and is conservatively funded without an assumed discount',async()=>{
 const db=account(),t=transport({onGenerate:async()=>json({modelVersion:supervisedModels.worker,usageMetadata:{promptTokenCount:100,cachedContentTokenCount:80,candidatesTokenCount:40,thoughtsTokenCount:10,totalTokenCount:150},candidates:[{finishReason:'STOP',content:{parts:[{text:'{"ok":true}'}]}}]})});
 const p=v8Providers(db,t),answer=await p.worker('cached-extract',{},schema,{maxOutputTokens:512});assert.equal(answer.data.ok,true);assert.equal(answer.billingBasis,'implicit-cache-undiscounted-upper-bound');
 const calls=t.calls.length,cost=await db.ledger.status();await p.worker('cached-extract',{},schema,{maxOutputTokens:512});assert.equal(t.calls.length,calls);assert.deepEqual(await db.ledger.status(),cost);
});

test('a rejected provider usage result retains its raw response and full paid commitment without another generation',async()=>{
 const db=account(),t=transport({onGenerate:async()=>json({modelVersion:supervisedModels.worker,usageMetadata:{promptTokenCount:100,candidatesTokenCount:40,thoughtsTokenCount:10,totalTokenCount:999},candidates:[{finishReason:'STOP',content:{parts:[{text:'{"ok":true}'}]}}]})});
 await assert.rejects(v8Providers(db,t).worker('bad-usage',{},schema,{maxOutputTokens:512}),e=>e.code==='provider_accounting');
 const wire=[...db.rows.entries()].find(([key,row])=>key.endsWith(':response')&&row.state==='complete');assert.equal(wire[1].value.usageMetadata.totalTokenCount,999);assert.equal(wire[1].charge_kurus,0);
 const calls=t.calls.length,cost=await db.ledger.status();await assert.rejects(v8Providers(db,t).worker('bad-usage',{},schema,{maxOutputTokens:512}),e=>e.code==='budget_uncertain');assert.equal(t.calls.length,calls);assert.deepEqual(await db.ledger.status(),cost);
});

test('v8 content supervisors think adaptively inside the same quoted output cap while the short initial task stays lightweight',async()=>{
 for(const stage of ['v8-brand-plan','v8-brand-review','v8-sector-validation','v8-competition-review','v8-swot-review','v8-coverage-plan','v8-final-report']){
  const db=account(),t=transport();await v8Providers(db,t).manager(stage,{},schema,{maxOutputTokens:4096});
  const body=t.calls.find(c=>c.url.endsWith('/messages')).body;
  assert.equal(body.thinking.type,stage==='v8-brand-plan'?'between_tools':'adaptive');assert.equal(body.output_config.effort,['v8-brand-plan','v8-final-report'].includes(stage)?'high':'medium');assert.equal(body.max_tokens,stage==='v8-brand-plan'?4096:stage==='v8-final-report'?12288:8192);
  assert.ok((await db.ledger.status()).chargedKurus<5000);
 }
});

test('Claude schema preflight can switch transport before buying the single validated review',async()=>{
 const db=account(4176),t=transport();let rejected=0;
 const p=v8Providers(db,{...t,fetchImpl:async(url,options)=>{
  const body=options.body?JSON.parse(options.body):null;
  if(url.endsWith('/count_tokens')&&body.output_config.format){
   rejected++;assert.equal((await db.ledger.status()).chargedKurus,4176);
   return new Response(JSON.stringify({error:{message:'Output schema is too complex'}}),{status:400});
  }
  return t.fetchImpl(url,options);
 }});
 const result=await p.manager('v8-final-report',{},schema,{maxOutputTokens:4096});
 assert.deepEqual(result.data,{ok:true});assert.equal(rejected,1);
 const generations=t.calls.filter(c=>c.url.endsWith('/messages'));
 assert.equal(generations.length,1);assert.equal(generations[0].body.output_config.format,undefined);
 assert.equal((await db.ledger.status()).chargedKurus,4176+result.accountedKurus);
});

test('historical scraper caps require exact account and actor ownership and never become active policies',async()=>{
 const {historicalApifyLimits}=await import('../src/bhs/supervised-readiness.mjs');const {actorIds}=await import('../src/bhs/apify-inputs.mjs');let calls=0;
 const out=await historicalApifyLimits({token:'private-test',userId:'ExactAccount',fetchImpl:async(url,options)=>{
  calls++;assert.ok(url.endsWith('/runs/last'));assert.equal(options.method,undefined);const actId=url.split('/acts/')[1].split('/')[0];
  return json({data:{actId,userId:actId===actorIds['apify/instagram-profile-scraper']?'ExactAccount':'DifferentAccount',id:'Run1234567890123',startedAt:'2026-11-10',meta:{origin:'WEB'},options:{maxTotalChargeUsd:.003,isMaxTotalChargeUsdSetByUser:true}}});
 }});
 assert.equal(calls,Object.keys(actorIds).length);assert.equal(out.length,1);assert.equal(out[0].maxTotalChargeUsd,.003);assert.equal(out[0].basis,'historical_explicit_run_option_not_active_policy');
});

test('the live 3837-kurus failure admits the same review under the shared cap without a hidden next-stage allocation',async()=>{
 const db=account(3837),t=transport(),p=v8Providers({...db,ledger:stageBudgetLedger(db.ledger,'competition_review')},t);
 const result=await p.manager('v8-competition-review',{},schema,{maxOutputTokens:4096});
 assert.equal(result.data.ok,true);assert.equal(t.calls.find(c=>c.url.endsWith('/messages')).body.max_tokens,8192);assert.ok((await db.ledger.status()).chargedKurus<=5000);
});
test('a smaller affordable thinking envelope keeps all visible output and is immutable after settlement and reconnect',async()=>{
 const db=account(4400),t=transport(),scoped=()=>({...db,ledger:stageBudgetLedger(db.ledger,'competition_review')});
 const answer=await v8Providers(scoped(),t).manager('v8-competition-review',{},schema,{maxOutputTokens:4096});
 const body=t.calls.find(c=>c.url.endsWith('/messages')).body;assert.ok(body.max_tokens>=4096&&body.max_tokens<8192);
 assert.ok([...db.rows.keys()].some(k=>k.startsWith('admission:')));const status=await db.ledger.status();
 assert.ok(status.chargedKurus<=5000);const calls=t.calls.length;
 assert.deepEqual(await v8Providers(scoped(),t).manager('v8-competition-review',{},schema,{maxOutputTokens:4096}),answer);
 assert.equal(t.calls.length,calls);assert.deepEqual(await db.ledger.status(),status);
});
test('a clipped-envelope timeout is never bought again under a different balance or maximum',async()=>{
 const db=account(4400),t=transport({onGenerate:async()=>{throw new DOMException('Timed out','TimeoutError');}}),scoped=()=>({...db,ledger:stageBudgetLedger(db.ledger,'competition_review')});
 const call=()=>v8Providers(scoped(),t).manager('v8-competition-review',{},schema,{maxOutputTokens:4096});
 await assert.rejects(call());const status=await db.ledger.status(),calls=t.calls.length;
 await assert.rejects(call(),e=>e.code==='budget_uncertain');assert.equal(t.calls.length,calls);assert.deepEqual(await db.ledger.status(),status);assert.ok(status.chargedKurus<=5000);
});
test('an account that cannot fund the full visible contract rejects before any paid call and preserves all prior charges',async()=>{
 const db=account(4900),t=transport(),p=v8Providers({...db,ledger:stageBudgetLedger(db.ledger,'competition_review')},t);
 await assert.rejects(p.manager('v8-competition-review',{},schema,{maxOutputTokens:4096}),e=>e.code==='budget_limit'&&e.budgetDiagnostic.followingReserveKurus===0);
 assert.equal(t.calls.filter(c=>c.url.endsWith('/messages')).length,0);assert.equal((await db.ledger.status()).chargedKurus,4900);
});

test('the compact final audit is never purchased with a truncated output allowance',async()=>{
 const db=account(4780),t=transport(),p=v8Providers({...db,ledger:stageBudgetLedger(db.ledger,'synthesis')},t);
 await assert.rejects(p.manager('v8-final-report',{},schema,{maxOutputTokens:2304,plainJson:true,compactReview:true}),e=>e.code==='budget_limit'&&e.budgetDiagnostic.minimumOutputTokens===2304);
 assert.equal(t.calls.filter(c=>c.url.endsWith('/messages')).length,0);
 assert.equal((await db.ledger.status()).chargedKurus,4780);
});

test('a large counted review can use a complete smaller response instead of reserving an arbitrary 4096-token minimum',async()=>{
 const db=account(4264),t=transport({onGenerate:async(_url,b)=>json({model:b.model,usage:{input_tokens:30000,output_tokens:1000},stop_reason:'end_turn',content:[{type:'text',text:'{"ok":true}'}]})});
 const counted={...t,fetchImpl:(url,options)=>url.endsWith('/count_tokens')?Promise.resolve(json({input_tokens:30000})):t.fetchImpl(url,options)};
 const scoped=()=>({...db,ledger:stageBudgetLedger(db.ledger,'competition_review')});
 const result=await v8Providers(scoped(),counted).manager('v8-competition-review',{},schema,{maxOutputTokens:4096});
 assert.equal(result.data.ok,true);const request=t.calls.find(c=>c.url.endsWith('/messages'));assert.ok(request.body.max_tokens>=1024&&request.body.max_tokens<4096);assert.ok((await db.ledger.status()).chargedKurus<=5000);
 const cost=await db.ledger.status(),calls=t.calls.length;await v8Providers(scoped(),counted).manager('v8-competition-review',{},schema,{maxOutputTokens:4096});assert.deepEqual(await db.ledger.status(),cost);assert.equal(t.calls.length,calls);
});
test('a short response allowance cannot accept truncated JSON or bypass source/content validation',async()=>{
 for(const mode of ['truncated','unsupported']){
  const db=account(4264),t=transport({onGenerate:async(_url,b)=>json({model:b.model,usage:{input_tokens:30000,output_tokens:1000},stop_reason:mode==='truncated'?'max_tokens':'end_turn',content:[{type:'text',text:'{"ok":true}'}]})});
  const counted={...t,fetchImpl:(url,options)=>url.endsWith('/count_tokens')?Promise.resolve(json({input_tokens:30000})):t.fetchImpl(url,options)};
  const scoped=()=>({...db,ledger:stageBudgetLedger(db.ledger,'competition_review')});
  const call=()=>v8Providers(scoped(),counted).manager('v8-competition-review',{},schema,{maxOutputTokens:4096,validateData:()=>{throw Error('Unknown proof');}});
  await assert.rejects(call(),e=>e.code===(mode==='truncated'?'incomplete':'model_output_invalid'));const status=await db.ledger.status(),calls=t.calls.length;
  await assert.rejects(call());assert.equal(t.calls.length,calls);assert.deepEqual(await db.ledger.status(),status);assert.ok(status.chargedKurus<=5000);
 }
});
