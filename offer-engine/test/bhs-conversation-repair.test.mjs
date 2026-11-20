import test from 'node:test';
import assert from 'node:assert/strict';
import {reportRepairLedger,repairConversationReport} from '../src/bhs/conversation-repair.mjs';
import {readConversationResult} from '../src/bhs/conversation-engine.mjs';
import {handleConversationAudit} from '../src/bhs/conversation-bridge.mjs';
import {conversationKeys} from '../src/bhs/conversation-contract.mjs';
import {createConversationProviders} from '../src/bhs/conversation-providers.mjs';
import {brief,source,report,memoryLedger,assistantCall} from './fixtures/bhs-conversation.mjs';

test('external validation costs enforce one aggregate 50 TRY ceiling without rewriting prior budget rows',async()=>{
 const {ledger}=memoryLedger({charged:1426}),env={OFFER_BHS_VALIDATION_RUN_ID:'selected-run',OFFER_BHS_VALIDATION_EXTERNAL_KURUS:'2569'};
 const capped=reportRepairLedger(ledger,'selected-run',env).ledger;
 assert.equal((await capped.status()).chargedKurus,3995);assert.equal((await ledger.status()).chargedKurus,1426);
 await assert.rejects(capped.once('model:too-large',{},1006,()=>{}),e=>e.code==='budget_limit');
 await capped.once('model:within-limit',{},1005,async()=>({}));assert.equal((await capped.status()).chargedKurus,5000);
 assert.equal((await ledger.status()).chargedKurus,2431);
 assert.equal((await reportRepairLedger(ledger,'another-run',env).ledger.status()).chargedKurus,2431);
});

test('retained-source report repair is explicit, purchases one writing call and supersedes only the displayed result',async()=>{
 const {ledger}=memoryLedger(),id='e'.repeat(64),original={reason:'provider_error',conversationSources:[source]};
 await ledger.once(conversationKeys.turn(id,0),{id},0,async()=>({sources:[source],results:[],toolIssues:[]}));
 await ledger.once(conversationKeys.result(id),{id},0,async()=>original);
 let paid=0;
 const getProviders=()=>({analystQuote:async(_,{writingOnly})=>{assert.equal(writingOnly,true);return {reservation:100,output:8000};},
  analyst:async(messages,options)=>{assert.equal(options.writingOnly,true);assert.match(messages[0].content,/Yeni kaynak veya araç isteme/);paid++;return assistantCall('finish_bhs',report());}});
 const base={brief,ledger,id,job:{researchRunId:'test-run'},getProviders,now:()=>Date.parse('2026-11-20T12:00:00Z'),meter:async({run,shortResearch})=>{assert.equal(shortResearch,true);await run();}};
 const result=await repairConversationReport(base);assert.equal(result.reason,undefined);assert.equal(result.conversationReport.reportMarkdown,report().reportMarkdown);
 await repairConversationReport(base);assert.equal(paid,1);assert.deepEqual((await ledger.get(conversationKeys.result(id))).value,original);
 assert.equal((await readConversationResult(ledger,id)).value.conversationReport.reportMarkdown,report().reportMarkdown);
});

test('a restart admits report-only recovery before a separately awaited advance, without buying new research',async()=>{
 const {ledger}=memoryLedger(),id='d'.repeat(64),job={researchRunId:'test-run'};
 await ledger.once(conversationKeys.turn(id,0),{id},0,async()=>({sources:[source],results:[],toolIssues:[]}));
 await ledger.once(conversationKeys.result(id),{id},0,async()=>({reason:'provider_error',conversationSources:[source]}));
 let paid=0,last;
 const options={brief,job,ledger,id,finish:value=>value,res:{status(code){this.code=code;return this;},json(body){last=body;return body;}},
  codec:{encode:()=> 'signed-recovery'},session:'session',host:'example.com',cost:()=>ledger.status(),
  getProviders:()=>({analystQuote:async()=>({reservation:100,output:8000}),analyst:async()=>{paid++;return assistantCall('finish_bhs',report());}}),
  meter:async({run})=>run()};
 await handleConversationAudit({...options,action:'start'});assert.equal(last.nextAction,'advance');assert.equal(paid,0);
 const completed=await handleConversationAudit({...options,action:'advance'});assert.equal(paid,1);assert.equal(completed.data.quality.contentComplete,true);
});

test('writing-only Claude repair uses visible output capacity and the supported between_tools mode',async()=>{
 const {ledger}=memoryLedger();let generation;
 const providers=createConversationProviders({ledger,anthropicKey:'synthetic',researchFx:async()=>({usdTry:50}),fetchImpl:async(url,init)=>{
  const body=JSON.parse(init.body);assert.equal(body.thinking.type,'between_tools');assert.equal(body.tool_choice.type,'auto');
  if(url.endsWith('/count_tokens'))return new Response(JSON.stringify({input_tokens:1000}));generation=body;
  return new Response(JSON.stringify({model:'claude-sonnet-5-5',content:assistantCall('finish_bhs',report()).content,stop_reason:'tool_use',usage:{input_tokens:1000,output_tokens:5000}}));
 }});
 await providers.analyst([{role:'user',content:'Write from retained sources.'}],{final:true,writingOnly:true});
 assert.equal(generation.max_tokens,8000);assert.equal(generation.output_config.effort,'medium');
});
