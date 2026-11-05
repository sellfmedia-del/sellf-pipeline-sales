import {methodologyAreas} from '../src/bhs/methodology-areas.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {validateGroundedOutput} from '../src/bhs/source-gate.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {readReusableResearch,researchCacheKey} from '../src/bhs/reuse.mjs';
import {continuationAudit,restoreContinuation} from '../src/bhs/continuity.mjs';
import {createResearchSnapshot,readResearchSnapshot} from '../src/bhs/research-snapshot.mjs';
import {createPricingHandler} from '../api/pricing.js';
import {createReuseHandler,loadSavedSynthesis} from '../api/offer-reuse.js';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {createProposalHandler} from '../api/proposal.js';
import {createOfferHandler} from '../api/offer.js';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {briefHash} from '../src/bhs/brief.mjs';
import {stageKey,runBoundedStage} from '../src/bhs/direct-research.mjs';
import {tariff,tariffReadiness,hash} from '../src/budget/ledger.mjs';
import {context} from './fixtures/evidence.mjs';
import {offerFixture,memoryLedger,response,sourceId,runId} from './fixtures/offer.mjs';
const now=Date.parse('2026-11-04T12:00:00Z'),host='guards.preview.example',secret='isolated-guard-tests',session='s'.repeat(43),jwt='j'.repeat(40);
const req=body=>({method:'POST',headers:{host,origin:'https://'+host,cookie:'__Host-offer-research='+session,authorization:'Bearer '+jwt},body});
const preview=async run=>{const env=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';try{await run();}finally{if(env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=env;}};
function saved(f,c,at=now){return {step_key:'audit:synthesis:'+f.hash,created_at:new Date(at).toISOString(),value:{report:c.report,analysisPacket:c.packet,researchContext:{brief:f.brief,briefHash:f.hash}}};}

test('empty JSON, headings, source lists and meeting-only content cannot be a ready BHS; supported coverage alone remains useful',async()=>{
 const f=await offerFixture(),c=context();
 for(const report of [{},{summary:'An empty model answer'}, {...c.report,findings:[],researchCoverage:[]},{...c.report,findings:c.report.findings.map(f=>({...f,kind:'brief'})),researchCoverage:[]}]){
  assert.throws(()=>validateGroundedOutput(report,{packet:c.packet,brief:f.brief}),e=>e.code==='research_empty');
  const audit=directAuditResult(f.brief,{report,analysisPacket:c.packet});assert.equal(audit.status,'review');assert.equal(audit.data.quality.checksPassed,false);
 }
 const report={...c.report,findings:[],researchCoverage:[{dimension:methodologyAreas[0].dimension,topic:methodologyAreas[0].topic,status:'partial',observation:'Kaynakta bayi ağı gözlemi.',sourceIds:['ev1']}]};
 assert.doesNotThrow(()=>validateGroundedOutput(report,{packet:c.packet,brief:f.brief}));
 assert.equal(continuationAudit(f.brief,{synthesis:{report,analysisPacket:c.packet},reason:'quota'}).data.researchContinuity.status,'partial');
});
test('independent cache/evidence read failures and malformed newest content cannot hide a valid completed alternative',async()=>{
 const f=await offerFixture(),c=context(),good=saved(f,c,now-86400000),older=researchCacheKey(f.brief,now-7*86400000),current=researchCacheKey(f.brief,now);
 for(const newest of ['throws','empty','unreadable','malformed']){
  const ledger={get:async key=>{
   if(key===current){if(newest==='throws')throw Error('transient read');return {state:'complete',value:saved(f,{report:newest==='empty'?{}:c.report,packet:newest==='malformed'?{sources:{bad:true}}:null})};}
   if(key===older)return {state:'complete',value:good};throw Error('isolated historic read failure');
  }};
  const recovered=await readReusableResearch(f.brief,ledger,now);assert.deepEqual(recovered.report,c.report);
  const audit=await restoreContinuation(f.brief,continuationAudit(f.brief,{reason:'budget_limit'}),ledger,now);assert.equal(audit.data.researchContinuity.status,'partial');
 }
 const legacy=saved(f,{report:c.report,packet:null});
 const result=await readReusableResearch(f.brief,{get:async key=>{if(key===current)return {state:'complete',value:legacy};if(key.startsWith('audit:evidence:evidence-v4:'))return {state:'complete',value:{packet:c.packet}};throw Error('other key unavailable');}},now);
 assert.ok(result.analysisPacket);assert.equal(result.reuse.incrementalResearchCalls,0);
 const expired=saved(f,c,now-8*86400000);
 assert.equal(await readReusableResearch(f.brief,{get:async()=>({state:'complete',value:expired})},now),null,'automatic freshness rule remains seven days');
});
test('completed legacy empty stages restore research or explicitly hand off; never sign empty success or replay paid stages',()=>preview(async()=>{
 const f=await offerFixture();
 for(const canRestore of [false,true]){
  const ledger=memoryLedger(['source_plan','evidence','synthesis','scope'].map(phase=>[stageKey(f.brief,phase,'v5'),{state:'complete',value:phase==='synthesis'?{report:{}}:phase==='scope'?{scopePlan:f.scope}: {}}]));
  if(canRestore)ledger.rows.set(researchCacheKey(f.brief,now),{state:'complete',value:saved(f,context())});
  const handler=createBoundedAuditHandler({getLedger:async()=>ledger,getSecret:()=>secret,validateWebsite:async()=>{},getProviders:()=>assert.fail('no provider'),runStage:()=>assert.fail('no paid stage replay'),now:()=>now,logger:{}}),res=response();
  await handler(req({action:'start',brief:f.brief,requestId:'legacy_empty_request_2026',context:{leadId:'lead-1',spaceId:'space-1'}}),res);
  assert.equal(res.code,200);assert.equal(res.data.result.data.researchContinuity.status,canRestore?'partial':'unavailable');assert.ok(res.data.pricingProof);
  const price=response();await createPricingHandler({getSecret:()=>secret,now:()=>now})(req({action:'start',brief:f.brief,audit:res.data.result,pricingProof:res.data.pricingProof}),price);assert.equal(price.code,200);
 }
}));
test('restored research survives pricing → proposal → save → another authorised user → later saved-offer reuse without discovery/synthesis',()=>preview(async()=>{
 const now=Date.now();
 const f=await offerFixture(),c=context(),base=continuationAudit(f.brief,{reason:'budget_limit'}),snapshot=saved(f,c,now);
 const restored=await restoreContinuation(f.brief,base,{get:async key=>key===researchCacheKey(f.brief,now)?{state:'complete',value:snapshot}:null},now);
 const audit={stage:'audit',...restored},codec=createPricingProof(secret),proof=codec.encode({kind:'audit_ready',createdAt:now,briefHash:f.hash,auditHash:digest(audit),budgetLeadId:'lead-1'},session,host);
 const priced=response();await createPricingHandler({getSecret:()=>secret,now:()=>now})(req({action:'start',brief:f.brief,audit,pricingProof:proof}),priced);assert.equal(priced.code,200);assert.ok(priced.data.result.data.researchSnapshot);
 const {savedLogo}=await import('../api/offer-reuse.js');const logo=savedLogo(f.row.customer_document,secret,host);
 const proposal=response();await createProposalHandler({getSecret:()=>secret,now:()=>now})(req({action:'start',brief:f.brief,audit,pricing:priced.data.result,proposalProof:priced.data.proposalProof,logo,context:{leadId:'lead-1',spaceId:'space-1'}}),proposal);
 assert.equal(proposal.code,200);assert.equal(JSON.stringify(proposal.data.result).includes('researchSnapshot'),false,'internal capture never enters public customer content');
 let savedRow;const store={configured:()=>true,portalConfigured:()=>true,save:async(_token,args)=>{savedRow={id:sourceId,lead_id:'lead-1',space_id:'space-1',pricing_snapshot:args.p_pricing,customer_document:args.p_document};return {id:sourceId,state:'draft',version:1};}};
 const savedResponse=response();await createOfferHandler({getSecret:()=>secret,getStore:()=>store,now:()=>now})(req({action:'save',leadId:'lead-1',spaceId:'space-1',logoApproved:true,scopeApproved:true,proposal:proposal.data.result,pricing:priced.data.result,saveProof:proposal.data.saveProof}),savedResponse);assert.equal(savedResponse.code,200,JSON.stringify(savedResponse.data));assert.ok(savedRow.pricing_snapshot.researchSnapshot);
 const nextNow=now+8*86400000,claims=await loadSavedSynthesis(savedRow,{get:()=>assert.fail('another owner has no original model rows')});
 assert.equal(claims.synthesis.reuse.researchedAt,snapshot.created_at);assert.equal(claims.synthesis.reuse.contextNeedsConfirmation,true);
 const currentBrief={...f.brief,brandName:'Test Alt Marka',services:'Meta ve Google Ads',goals:'Yeni pazar hedefi'};let scopeCalls=0;
 const reuse=createReuseHandler({getStore:()=>({detail:async token=>{assert.equal(token,'k'.repeat(40));return savedRow;}}),getLedger:async()=>memoryLedger(),getSecret:()=>secret,now:()=>nextNow,getProviders:()=>({generate:async stage=>{assert.equal(stage,'scope');scopeCalls++;return {data:{scope:f.scope,copy:f.copy}};},search:()=>assert.fail('no discovery'),extract:()=>assert.fail('no evidence rerun')})});
 const request=req({action:'prepare',sourceOfferId:sourceId,researchRunId:runId,brief:currentBrief,context:{leadId:'lead-1',spaceId:'space-1'}});request.headers.authorization='Bearer '+'k'.repeat(40);
 const result=response();await reuse(request,result);assert.equal(result.code,200,JSON.stringify(result.data));assert.equal(scopeCalls,1);assert.equal(result.data.result.data.findings.length,restored.data.findings.length);assert.equal(result.data.result.data.researchReuse.researchedAt,snapshot.created_at);
 const nextPrice=response();await createPricingHandler({getSecret:()=>secret,now:()=>nextNow})(req({action:'start',brief:currentBrief,audit:result.data.result,pricingProof:result.data.pricingProof}),nextPrice);assert.equal(nextPrice.code,200);
 const second=readResearchSnapshot(nextPrice.data.result.data.researchSnapshot);assert.equal(second.sourceContext.brandName,f.brief.brandName,'variant cannot relabel original research identity');assert.equal(second.researchedAt,snapshot.created_at);assert.equal(second.report.findings.length,restored.data.findings.length);
}));
test('snapshot corruption, inflated payloads and empty research fail closed; full methodology and partial snippet labels survive',async()=>{
 const f=await offerFixture();f.audit.data.researchAsOf='2026-10-19';
 const snapshot=createResearchSnapshot(f.audit.data,f.brief),decoded=readResearchSnapshot(snapshot);
 assert.equal(decoded.report.researchCoverage.length,24);assert.equal(decoded.report.dimensions.length,6);assert.equal(decoded.report.findings.length,f.audit.data.findings.length);assert.equal(decoded.researchedAt,'2026-10-19');
 assert.throws(()=>readResearchSnapshot({...snapshot,digest:'0'.repeat(64)}));assert.throws(()=>readResearchSnapshot({...snapshot,data:'!'}));assert.throws(()=>readResearchSnapshot({...snapshot,data:'a'.repeat(280001)}));
 assert.throws(()=>readResearchSnapshot({...snapshot,data:deflateRawSync(Buffer.alloc(1800001,32)).toString('base64url')}));
 const bad={...decoded,sourceContext:{brandName:'Other'}};assert.throws(()=>readResearchSnapshot({...snapshot,digest:hash(bad),data:deflateRawSync(Buffer.from(JSON.stringify(bad))).toString('base64url')}));
 assert.equal(createResearchSnapshot(continuationAudit(f.brief,{reason:'quota'}).data,f.brief),null);
 const c=context(),record=c.packet.sources[0];c.packet.sources=[];const partial=directAuditResult(f.brief,{report:c.report,analysisPacket:c.packet,searchEvidence:[{results:[{url:record.url,title:record.title,content:record.excerpts[0].text}]}]}).data;
 const roundtrip=readResearchSnapshot(createResearchSnapshot(partial,f.brief));assert.ok(roundtrip.report.sources.every(s=>s.verification.method==='search-snippet'&&s.scope.includes('tam sayfa okunmuş değildir')));
});
test('tariff health exposes approaching expiry without extending rates, changing limits or allowing expired paid work',()=>{
 const expires=Date.parse(tariff.expires);assert.equal(tariffReadiness(expires-8*86400000).status,'valid');assert.equal(tariffReadiness(expires-86400000).status,'review_due');assert.equal(tariffReadiness(expires).paidCallsAllowed,false);assert.equal(tariffReadiness(expires).status,'expired');assert.equal(tariff.normalTargetKurus,3000);assert.equal(tariff.capKurus,5000);
});
