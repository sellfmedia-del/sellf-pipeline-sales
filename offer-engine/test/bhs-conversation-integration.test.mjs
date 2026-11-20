import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {runConversationJob} from '../src/bhs/conversation-bridge.mjs';
import {createPricingProof} from '../src/pricing/proof.mjs';
import {briefHash} from '../src/bhs/brief.mjs';
import {pricingEngine} from '../src/engines/pricing-engine.mjs';
import {proposalEngine} from '../src/engines/proposal-engine.mjs';
import {assertResult} from '../src/contracts.mjs';
import {advanceConversation,readConversation,persistConversationResult} from '../src/bhs/conversation-engine.mjs';
import {conversationAuditResult} from '../src/bhs/conversation-report.mjs';
import {brief,source,report,memoryLedger,assistantCall,scriptedProviders} from './fixtures/bhs-conversation.mjs';
import {offerFixture,response} from './fixtures/offer.mjs';

const secret='A'.repeat(43),now=()=>Date.parse('2026-11-20T10:00:00Z'),id=briefHash(brief);
test('authenticated background start/reconnect/finalize keeps one new engine and reaches unchanged explicit pricing/proposal without legacy model calls',async()=>{
 const previous=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const {ledger}=memoryLedger();let job,enqueues=0;
  const queue={find:async()=>job||null,enqueue:async(spec,input,budget)=>{enqueues++;job={...spec,id:'11111111-1111-4111-8111-111111111111',budgetId:budget.id,briefHash:id,brief:input,state:'queued',phase:'brand_plan',createdAt:now(),leaseToken:'B'.repeat(32),leaseUntil:now()+360000};return job;},
   read:async()=>job,pause:async()=>{job.state='queued';},advance:async(_,{nextPhase})=>{job.phase=nextPhase;job.state='queued';},cancel:async()=>{job.state='cancelled';}};
  const legacy=()=>assert.fail('the new BHS cannot enter the old research controller');
  const handler=createBoundedAuditHandler({getLedger:async()=>ledger,getQueue:async()=>queue,isBackgroundEnabled:()=>true,isConversationEnabled:()=>true,
   getResearchVersion:()=>'v8',getResearchModel:()=>'claude-sonnet-5-5',getSecret:()=>secret,getProviders:legacy,runStage:legacy,
   getConversationProviders:()=>assert.fail('browser polling must not call a model'),validateWebsite:()=>assert.fail('the old blocking website gate must not run'),logger:{},now});
  const req={method:'POST',headers:{host:'preview.vercel.app',origin:'https://preview.vercel.app',cookie:'__Host-offer-research='+secret},
   body:{action:'start',requestId:'synthetic_conversation_start',brief,context:{leadId:'synthetic-conversation',spaceId:'synthetic-space'}}};
  let out=response();await handler(req,out);assert.equal(out.code,202,JSON.stringify(out.data));assert.equal(out.data.phase,'conversation');
  const ticket=out.data.ticket;out=response();await handler(req,out);assert.equal(out.code,202);assert.equal(enqueues,1);
  const providers=scriptedProviders(ledger,[assistantCall('read_pages',{urls:[brief.website],purpose:'Markayı anla'}),assistantCall('begin_report',{reason:'Bulguları bütün olarak değerlendir'}),assistantCall('finish_bhs',report())]);
  for(let at=0;at<3;at++)await runConversationJob({job,queue,ledger,getProviders:()=>providers,meter:({run})=>run(),now});
  out=response();await handler({...req,body:{action:'status',brief,ticket}},out);assert.equal(out.code,200,JSON.stringify(out.data));
  assert.equal(out.data.result.data.fullReport,report().reportMarkdown);assert.equal(providers.calls.length,3);
  const proof=createPricingProof(secret).decode(out.data.pricingProof,secret,'preview.vercel.app',now());assert.equal(proof.kind,'audit_ready');
  const audit=out.data.result,pricing={stage:'pricing',...await pricingEngine.run({brief,serviceSelection:{services:[{serviceId:'meta'}],projects:[]}},{audit})};
  assert.deepEqual(pricing.data.scope.selected.map(row=>row.serviceId),['meta']);assertResult('pricing',pricing);
  const existing=await offerFixture(),proposal=await proposalEngine.run({brief,copy:audit.data.proposalCopy},{audit,pricing,logo:existing.logo});
  assertResult('proposal',proposal);assert.equal(proposal.data.brand.name,brief.brandName);assert.ok(pricing.data.researchSnapshot===undefined);
 }finally{if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;}
});
test('a Claude outage uses a separately funded Gemini answer over retained Tavily evidence, not another Claude attempt',async()=>{
 const {ledger}=memoryLedger();let claude=0,gemini=0,read=0;
 const providers={analystQuote:async()=>({reservation:200,finalReservation:900}),analyst:async()=>{claude++;throw Object.assign(Error('unavailable'),{code:'provider_error',providerStatus:503});},
  extract:async()=>{read++;return {results:[source]};},fallbackReport:async({sources})=>{gemini++;assert.equal(sources[0].id,source.id);return {data:report()};}};
 await advanceConversation({brief,ledger,id,providers,now});const saved=await persistConversationResult({brief,ledger,id,now});
 assert.equal(claude,1);assert.equal(gemini,1);assert.equal(read,1);assert.equal(conversationAuditResult(brief,saved).data.quality.contentComplete,true);
});
test('two invalid final answers retain the whole draft for honest review rather than buying an unlimited repair loop',async()=>{
 const {ledger}=memoryLedger(),invalid=report();invalid.sourceQuotes[0].quote='Uydurma bir kaynak cümlesi.';
 const providers=scriptedProviders(ledger,[assistantCall('read_pages',{urls:[brief.website],purpose:'Kaynağı oku'}),assistantCall('begin_report',{reason:'Kaynak hazır'}),assistantCall('finish_bhs',invalid),assistantCall('finish_bhs',invalid)]);
 for(let at=0;at<4;at++)await advanceConversation({brief,ledger,id,providers,now});
 const state=await readConversation(ledger,id);assert.equal(state.final.reason,'report_review_required');
 const saved=await persistConversationResult({brief,ledger,id,now}),audit=conversationAuditResult(brief,saved,{reason:saved.reason});
 assert.equal(audit.data.fullReport,invalid.reportMarkdown);assert.equal(audit.data.quality.contentComplete,false);assert.equal(audit.data.sources.length,0);
 assert.equal(providers.calls.length,4);
});
