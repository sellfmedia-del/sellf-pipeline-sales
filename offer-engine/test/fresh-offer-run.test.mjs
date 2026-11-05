import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {createPricingHandler} from '../api/pricing.js';
import {createPricingProof} from '../src/pricing/proof.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {researchCacheKey} from '../src/bhs/reuse.mjs';
import {prepareUploadedLogo} from '../src/upload.mjs';
import {context} from './fixtures/evidence.mjs';
import {offerFixture,memoryLedger,response} from './fixtures/offer.mjs';
const host='runs.preview.example',secret='isolated-fresh-run-tests',session='s'.repeat(43);
const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222';
const req=body=>({method:'POST',headers:{host,origin:'https://'+host,cookie:'__Host-offer-research='+session},body});
test('a fresh card run isolates old commitments; signed resume and downstream pricing retain the same run',async()=>{
 const oldEnv=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const f=await offerFixture(),old=memoryLedger(),a=memoryLedger(),b=memoryLedger();
  old.status=async()=>({chargedKurus:4980,capKurus:5000});
  const ledgers=new Map([[first,a],[second,b]]),seen=[];
  const handler=createBoundedAuditHandler({getSecret:()=>secret,validateWebsite:async()=>{},
   getLedger:async(_req,_res,lead,options)=>{assert.equal(lead,'lead-1');seen.push(options?.researchRunId);return ledgers.get(options?.researchRunId)||old;},
   getProviders:()=>({configured:()=>true}),
   runStage:async({phase,brief,ledger,researchVersion,freshResearch})=>{assert.equal(freshResearch,true);ledger.rows.set(stageKey(brief,phase,researchVersion),{state:'complete',value:phase==='synthesis'?f.synthesis:phase==='scope'?{scopePlan:f.scope,proposalCopy:f.copy}:{}});}
  });
  const start=response();await handler(req({action:'start',requestId:'fresh_run_request_1111',brief:f.brief,context:{leadId:'lead-1',spaceId:'space-1',researchRunId:first}}),start);
  assert.equal(start.code,200);assert.equal(start.data.cost.chargedKurus,500);
  let ticket=start.data.ticket,done;
  for(let i=0;i<4;i++){const res=response();await handler(req({action:'advance',brief:f.brief,ticket,context:{researchRunId:second}}),res);assert.ok([200,202].includes(res.code));ticket=res.data.ticket||ticket;if(res.data.result)done=res.data;}
  if(!done){const res=response();await handler(req({action:'status',brief:f.brief,ticket}),res);assert.equal(res.code,200);done=res.data;}
  assert.ok(done?.pricingProof);assert.ok(seen.every(id=>id===first),'client cannot change the signed run when resuming');
  const claims=createPricingProof(secret).decode(done.pricingProof,session,host,Date.now());assert.equal(claims.budgetResearchRunId,first);
  const price=response();await createPricingHandler({getSecret:()=>secret})(req({action:'start',brief:f.brief,audit:done.result,pricingProof:done.pricingProof}),price);assert.equal(price.code,200);
  const next=response();await handler(req({action:'start',requestId:'fresh_run_request_2222',brief:f.brief,context:{leadId:'lead-1',spaceId:'space-1',researchRunId:second}}),next);
  assert.equal(next.data.phase,'source_plan');assert.equal(b.rows.size,0);assert.equal((await old.status()).chargedKurus,4980);
  const invalid=response();await handler(req({action:'start',requestId:'fresh_run_request_3333',brief:f.brief,context:{leadId:'lead-1',researchRunId:'invalid'}}),invalid);assert.equal(invalid.code,422);
 }finally{if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;}
});
test('explicit fresh research cannot consume a partial brand cache at planning or synthesis',async()=>{
 const f=await offerFixture(),c=context(),ledger=memoryLedger([[researchCacheKey(f.brief),{state:'complete',value:{created_at:new Date().toISOString(),value:{report:c.report,analysisPacket:c.packet,researchContext:{brief:f.brief,briefHash:f.hash}}}}]]);
 let plans=0,syntheses=0;
 const providers={search:async()=>({results:[]}),generate:async stage=>{if(stage==='source_plan'){plans++;throw Error('fresh planning reached');}syntheses++;throw Error('fresh synthesis reached');}};
 await assert.rejects(runBoundedStage({phase:'source_plan',brief:f.brief,ledger,providers,researchVersion:'v5',freshResearch:true}),/fresh planning reached/);
 ledger.rows.set(stageKey(f.brief,'evidence','v5'),{state:'complete',value:{packet:c.packet,searches:[]}});
 await assert.rejects(runBoundedStage({phase:'synthesis',brief:f.brief,ledger,providers,researchVersion:'v5',freshResearch:true}),/fresh synthesis reached/);
 assert.equal(plans,1);assert.equal(syntheses,1);
});
test('a compact logo uses pixel checks without localisation; provider failure retains verified transparency and marks interior review',async()=>{
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160"><rect width="400" height="160" fill="white"/><rect x="55" y="40" width="260" height="80" fill="#706551"/><rect x="85" y="60" width="25" height="40" fill="white"/></svg>';
 const image='data:image/png;base64,'+(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');
 let located=0,backdrop=0;
 const result=await prepareUploadedLogo(image,{localFirst:true,locate:async()=>{located++;throw Error('unnecessary localisation');},chooseBackdrop:async()=>{backdrop++;throw Object.assign(Error('provider down'),{code:'provider_error'});}});
 assert.equal(located,0);assert.equal(backdrop,1);
 const q=result.candidates[0].quality;assert.equal(q.transparency,true);assert.equal(q.changedSolid,0);assert.equal(q.interiorReviewRequired,true);assert.equal(q.requiresReview,true);
 assert.notEqual(result.candidates[0].image,image);assert.equal(result.candidates[0].source,image);
});
