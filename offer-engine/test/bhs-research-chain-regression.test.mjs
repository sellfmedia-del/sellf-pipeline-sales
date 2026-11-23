import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {runConversationJob} from '../src/bhs/conversation-bridge.mjs';
import {readConversation} from '../src/bhs/conversation-engine.mjs';
import {conversationQuote} from '../src/bhs/conversation-providers.mjs';
import {conversationKeys,sourceId} from '../src/bhs/conversation-contract.mjs';
import {researchWorkPolicyVersion} from '../src/bhs/conversation-work.mjs';
import {offeringAnalysisVersion} from '../src/bhs/conversation-offerings.mjs';
import {briefHash} from '../src/bhs/brief.mjs';
import {createPricingProof} from '../src/pricing/proof.mjs';
import {pricingEngine} from '../src/engines/pricing-engine.mjs';
import {proposalEngine} from '../src/engines/proposal-engine.mjs';
import {createResearchSnapshot,readResearchSnapshot} from '../src/bhs/research-snapshot.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {assertResult} from '../src/contracts.mjs';
import {brief,source,peerSource,researchSources,researchProgressInput,marketResearchSummary,report,
 memoryLedger,assistantCall,scriptedProviders,semanticApproval} from './fixtures/bhs-conversation.mjs';
import {strongNarrativeReport,weakClaim,correctedClaim} from './fixtures/bhs-strong-narrative.mjs';
import {offerFixture,response} from './fixtures/offer.mjs';

const id=briefHash(brief),secret='A'.repeat(43),host='preview.vercel.app';
const now=()=>Date.parse('2026-11-23T08:00:00Z');
const thinking={type:'thinking',thinking:'Sentetik marka, hedef ve ilk kaynak değerlendirmesi.',signature:'synthetic-original-thinking'};
const extraDiscovery=[1,2].map(n=>{
 const url='https://discovery.example.com/'+n;
 return {id:sourceId(url),url,title:'Sentetik aday '+n,text:'Arama sonucu açıklaması. Kaynağın asıl gövdesi henüz okunmadı.'};
});
const discovery=[...researchSources.slice(1),...extraDiscovery].map(row=>({...row,method:'search-snippet'}));
const candidate={url:peerSource.url,questionId:'competition',status:'selected',reason:'Aynı ihtiyaca dönük aday; asıl sayfa okunmalı.'};
function openResearch(){
 const progress=researchProgressInput();
 progress.questions=progress.questions.map(q=>['market','competition'].includes(q.id)?{...q,status:'open',answer:'',sourceIds:[]}:q);
 progress.sources=progress.sources.filter(row=>row.sourceId===source.id);
 progress.candidates=[candidate];
 return progress;
}
function scopedPatch(draft,before,after){
 return {...semanticApproval(draft,{reviewPolicyVersion:researchWorkPolicyVersion}),verdict:'patch',
  issues:[{id:'measurement',reason:'Sayfa metni reklam performansını doğrulamaz.',resolution:'Korunan pasajda iddianın kesinlik sınırını düzelt.',sourceIds:[],question:'',access:'analysis'}],
  patches:[{issueId:'measurement',path:'reportMarkdown',operation:'replace_text',before,after}]};
}
function unreadPeerPatch(draft){
 const patch=scopedPatch(draft,correctedClaim,'Rakip sipariş koşulu doğrulandı. ['+peerSource.id+']');
 patch.claimChecks.push({path:'reportMarkdown',text:correctedClaim,kind:'source_fact',
  basis:'Arama özetine atfedilen fakat henüz okunmayan rakip bilgisi.',sourceIds:[peerSource.id],briefQuote:'',verification:'',issueId:'measurement'});
 return patch;
}

async function session(ledger){
 let job,enqueues=0;
 const queue={find:async()=>job||null,enqueue:async(spec,input,budget)=>{
  enqueues++;
  job={...spec,id:'11111111-1111-4111-8111-111111111111',budgetId:budget.id,briefHash:id,brief:input,
   phase:'brand_plan',state:'queued',createdAt:now(),leaseToken:'B'.repeat(32),leaseUntil:now()+360000,conversationCompletion:true};
  return job;
 },read:async()=>job,pause:async()=>{job.state='queued';},advance:async(_,{nextPhase,checkpointKey})=>{
  assert.equal(nextPhase,'complete');assert.equal(checkpointKey,conversationKeys.result(id));
  assert.equal((await ledger.get(checkpointKey)).state,'complete');
  return Object.assign(job,{phase:nextPhase,state:'complete'});
 }};
 const forbidden=()=>assert.fail('Unexpected live provider, legacy controller or website check');
 const handler=createBoundedAuditHandler({getLedger:async()=>ledger,getQueue:async()=>queue,isBackgroundEnabled:()=>true,isConversationEnabled:()=>true,
  getResearchVersion:()=>'v8',getResearchModel:()=>'claude-sonnet-5-5',getSecret:()=>secret,getProviders:forbidden,runStage:forbidden,
  getConversationProviders:forbidden,validateWebsite:forbidden,logger:{},now});
 let ticket;
 const request=async action=>{
  const out=response();
  await handler({method:'POST',headers:{host,origin:'https://'+host,cookie:'__Host-offer-research='+secret},
   body:{action,requestId:'synthetic_chain_regression',brief,context:{leadId:'synthetic-chain',spaceId:'synthetic-space'},...(ticket&&action!=='start'?{ticket}:{})}},out);
  ticket=out.data.ticket||ticket;
  return out;
 };
 for(let attempt=0;attempt<2;attempt++){
  const started=await request('start');
  assert.equal(started.code,202,JSON.stringify(started.data));
 }
 assert.equal(enqueues,1);
 return {request,job,queue};
}

test('the anonymous one-body/five-snippet chain preserves budget, review and offer handoff',async t=>{
 const previous=process.env.VERCEL_ENV;
 process.env.VERCEL_ENV='preview';
 t.after(()=>{if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;});
 for(const complete of [true,false]){
  await t.test(complete?'an affordable focused continuation reaches a read and reviewed offer':'a genuinely tight balance reaches a usable partial offer after two rejected reviews',async()=>{
   const {ledger,total}=memoryLedger({charged:complete?1170:2440});
   const {request,job,queue}=await session(ledger);
   const draft=complete?strongNarrativeReport({flawed:true}):report();
   if(!complete)draft.reportMarkdown+='\n\n## Ölçümün sınırı\n'+correctedClaim;
   const first=assistantCall('read_pages',{urls:[source.url],purpose:'Marka ve ürünün ilk kaynağı'},'brand');
   first.content.unshift(thinking);
   const invalid=scopedPatch(draft,'Taslakta yer almayan önceki cümle.',correctedClaim);
   const replies=[first,
    assistantCall('search_web',{query:'Seçili Türkiye ürün pazarı ve doğrudan alternatifler',purpose:'Pazar ve rakip keşfi',maxResults:5},'discover'),
    assistantCall('review_research',openResearch(),'open')
   ];
   if(complete){
    replies.push(
     assistantCall('begin_report',marketResearchSummary(),'too_early_handoff'),
     assistantCall('finish_bhs',report(),'too_early_report'),
     assistantCall('read_pages',{urls:researchSources.slice(1).map(row=>row.url),purpose:'Pazar, kullanım ve rakip gövdeleri'},'read'),
     assistantCall('review_research',{...researchProgressInput(),candidates:[candidate]},'adjudicate'),
     assistantCall('begin_report',marketResearchSummary(),'handoff'));
   }
   replies.push(assistantCall('finish_bhs',draft,'draft'),assistantCall('review_bhs',invalid,'invalid'),
    assistantCall('review_bhs',complete?scopedPatch(draft,weakClaim,correctedClaim):unreadPeerPatch(draft),'last_review'));
   const providers=scriptedProviders(ledger,replies);
   const quote=providers.analystQuote,extract=providers.extract;
   providers.analystQuote=(messages,options)=>providers.calls.length===3||options.final?
    conversationQuote(20000,options):quote(messages,options);
   let searches=0;const reads=[];
   providers.search=async()=>{searches++;return {results:discovery};};
   providers.extract=async input=>{reads.push(...input.urls);return extract(input);};
   const step=()=>runConversationJob({job,queue,ledger,getProviders:()=>providers,meter:({run})=>run(),now});
   for(let i=0;i<3;i++)assert.equal((await step()).status,'queued');
   let state=await readConversation(ledger,id);
   assert.equal(state.sources.filter(row=>row.method==='search-snippet').length,5);
   assert.equal(state.researchProgress.candidates[0].status,'pending');
   assert.deepEqual(state.researchProgress.proofs.map(row=>row.sourceId),[source.id]);
   assert.equal(conversationQuote(20000,{availableKurus:5000-total(),analysisVersion:offeringAnalysisVersion}).funded,false);
   assert.equal((await request('status')).code,202);

   for(let i=3;i<replies.length;i++){
    const result=await step();
    assert.equal(result.status,i===replies.length-1?'complete':'queued');
   }
   state=await readConversation(ledger,id);
   const decision=providers.calls[3].options;
   assert.equal(decision.final,!complete);
   if(complete){
    assert.ok(decision.quote.output<1000&&decision.quote.toolReserveKurus>0);
    for(const i of [3,4]){
     assert.equal(state.turns[i].toolIssues[0].code,'research_needed');
     assert.equal(state.turns[i].reportDraft,undefined);
    }
    assert.equal(state.researchProgress.candidates[0].status,'selected');
    assert.ok(state.researchProgress.proofs.some(row=>row.sourceId===peerSource.id));
   }else{
    assert.equal(decision.quote.output,20000);
    assert.equal(state.researchProgress.candidates[0].status,'pending');
    assert.equal(state.final.reason,'semantic_review_unavailable');
    assert.equal(state.final.semanticReview.lastFeedback.category,'claim');
   }
   const rejected=state.turns.at(-2);
   assert.equal(rejected.semanticReview.lastFeedback.path,'reportMarkdown');
   assert.deepEqual(rejected.reportDraft,draft);
   assert.equal(state.final.semanticReview.attempts,2);
   const lastMessages=providers.calls.at(-1).messages;
   assert.ok(lastMessages.some(row=>Array.isArray(row.content)&&row.content.some(block=>block.signature===thinking.signature)));
   assert.ok(JSON.stringify(lastMessages).includes(brief.meetingNotes));
   assert.equal(searches,1);
   assert.deepEqual(reads,complete?researchSources.map(row=>row.url):[source.url]);
   assert.equal(providers.calls.filter(call=>call.options.final).length,1);

   const charged=total(),out=await request('status');
   assert.equal(out.code,200,JSON.stringify(out.data));
   const audit=out.data.result,expected=complete?draft.reportMarkdown.replace(weakClaim,correctedClaim):draft.reportMarkdown;
   assert.equal(audit.status,'ready');assert.equal(audit.data.quality.contentComplete,complete);
   assert.equal(audit.data.fullReport,expected);
   assert.equal(audit.data.conversationTransfer.counts.bodyAvailable,complete?4:1);
   assert.equal(audit.data.conversationTransfer.counts.discoveryOnly,complete?2:5);
   assert.equal(audit.data.sources.some(row=>row.id===peerSource.id),complete);
   const proof=createPricingProof(secret).decode(out.data.pricingProof,secret,host,now());
   assert.equal(proof.kind,'audit_ready');
   const saved=readResearchSnapshot(createResearchSnapshot(audit.data,brief)),reused=directAuditResult(brief,saved);
   assert.equal(reused.data.fullReport,expected);
   assert.equal(reused.data.quality.contentComplete,complete);
   assert.deepEqual(reused.data.conversationTransfer,audit.data.conversationTransfer);
   const pricing={stage:'pricing',...await pricingEngine.run({brief,serviceSelection:{services:[{serviceId:'meta'}],projects:[]}},{audit:reused})};
   const {logo}=await offerFixture(),proposal=await proposalEngine.run({brief,copy:audit.data.proposalCopy},{audit:reused,pricing,logo});
   assertResult('proposal',proposal);
   assert.deepEqual(pricing.data.scope.selected.map(row=>row.serviceId),['meta']);
   assert.equal(proposal.data.brand.name,brief.brandName);
   assert.equal((await request('status')).data.result.data.fullReport,expected);
   assert.equal(providers.calls.length,replies.length);
   assert.equal(total(),charged);
   assert.equal(out.data.cost.capKurus,5000);
   assert.ok(charged<=5000);
  });
 }
});
