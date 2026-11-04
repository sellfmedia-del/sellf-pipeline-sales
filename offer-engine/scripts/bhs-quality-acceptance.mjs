// Explicit QA build only. Public brand, real providers, in-memory 30 TRY cap.
// No Supabase, customer record, auth account, mail, publication or env writes.
import {writeFile} from 'node:fs/promises';
import {offerGeminiKey} from '../src/config.mjs';
import {createLedger} from '../src/budget/ledger.mjs';
import {createBoundedProviders} from '../src/budget/providers.mjs';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {createPricingHandler} from '../api/pricing.js';
import {createProposalHandler} from '../api/proposal.js';
import {logoProof} from '../src/proposal/logo-proof.mjs';
import {offerFixture,response} from '../test/fixtures/offer.mjs';
if(process.env.VERCEL_ENV!=='preview'||process.argv[2]!=='--run')throw Error('Explicit preview acceptance required');
if(process.env.VERCEL_PROJECT_ID!=='prj_B6Q6FIgq9NjbBlb6ga03cn6PD3jJ'&&!/^sellf-pipeline-sales-[a-z0-9]+-yigit-konuks-projects\.vercel\.app$/.test(process.env.VERCEL_URL||'')){console.log('BHS_QUALITY_ACCEPTANCE skipped: other project');process.exit(0);}
if(process.env.VERCEL_GIT_COMMIT_REF!=='qa/bhs-quality-continuity-real'||Date.now()>Date.parse('2026-11-05T00:00:00Z'))throw Error('Explicit current QA branch required');
const secret=offerGeminiKey();if(!secret||!(process.env.OFFER_TAVILY_API_KEY||process.env.TAVILY_API_KEY))throw Error('Preview providers not configured');
const host='bhs-acceptance.example',rows=new Map();let charged=500,cookie,generations=0;
const ledger=createLedger(async(op,a={})=>{
 if(['begin','status'].includes(op))return {chargedKurus:charged,capKurus:3000};
 if(op==='get')return rows.get(a.step)||null;
 const old=rows.get(a.step);
 if(op==='reserve'){
  if(old){if(old.input_hash!==a.hash)throw Error('Changed input');if(!(old.state==='uncertain'&&old.charge_kurus===0&&a.amount===0))return {claimed:false,step:old};}
  if(charged+a.amount>3000)return {blocked:true};charged+=a.amount;
  rows.set(a.step,{state:'reserved',input_hash:a.hash,claim_token:a.token,charge_kurus:a.amount,created_at:new Date().toISOString()});return {claimed:true};
 }
 if(old?.claim_token!==a.token)throw Error('Changed reservation');if(old.state==='complete')return old;
 if(op==='complete')charged-=old.charge_kurus-a.amount;
 const row={...old,state:op,value:a.value,charge_kurus:op==='complete'?a.amount:old.charge_kurus};rows.set(a.step,row);return row;
});
const brief={brandName:'Huel',website:'https://huel.com/',segment:'corporate',goals:'ABD e-ticaretinde ölçülebilir müşteri edinimi ve tekrar satın alma fırsatları.',needs:'Kamuya açık ürün, abonelik, konumlandırma ve müşteri yolculuğu kanıtlarını incelemek.',services:'Growth danışmanlığı, Meta ve Google Ads operasyonları.',meetingNotes:'Bağımsız kamuya açık marka testi; gerçek müşteri görüşmesi değildir. Ülke, para birimi, dönem ve rakip ölçeği farklılıklarını açıkça belirt.',currency:'TRY',language:'tr',budget:null};
const auditHandler=createBoundedAuditHandler({getSecret:()=>secret,getLedger:async()=>ledger,getProviders:options=>createBoundedProviders({...options,fetchImpl:async(url,init)=>{if(url.endsWith(':generateContent'))generations++;return fetch(url,init);}})});
async function call(handler,body){const res=response();await handler({method:'POST',headers:{host,origin:'https://'+host,cookie},body},res);const cookies=res.headers['Set-Cookie'];if(cookies)cookie=(Array.isArray(cookies)?cookies:[cookies]).find(c=>c.startsWith('__Host-offer-research')).split(';')[0];return res;}
const summary={passed:false,kind:'public-brand-provider-acceptance',databaseWrites:0,budgetReset:false,mailSends:0,capKurus:3000,source:'actual provider responses; no injected outage',manualSemanticReview:'not_completed'};
try{
 const start=await call(auditHandler,{action:'start',requestId:'isolated_quality_acceptance_20261104',brief,context:{leadId:'isolated-quality',spaceId:'isolated-space'}});
 if(start.code!==200)throw Object.assign(Error('Start failed'),{code:start.data.code});let ticket=start.data.ticket,finished;
 for(let phase=0;phase<4;phase++){
  let res=await call(auditHandler,{action:'advance',brief,ticket});ticket=res.data.ticket||ticket;
  if(res.code>=400){
   summary.failureCode=res.data.code;
   if(!res.data.continuationAvailable)throw Object.assign(Error('No safe continuation'),{code:res.data.code});
   const before=charged,count=generations;
   res=await call(auditHandler,{action:'continue',brief,ticket});
   if(res.code!==200||charged!==before||generations!==count)throw Error('Continuation did not stay zero-cost');
   summary.explicitZeroCostHandoff=true;
  }
  if(res.data.result){finished=res.data;break;}
 }
 if(!finished)throw Error('No audit/handoff result');
 const audit=finished.result,data=audit.data;
 summary.research=data.researchContinuity?.status||(data.quality.contentComplete?'complete':'partial');
 summary.sourceCount=data.sources.length;summary.findingCount=data.findings.length;summary.coverage=data.researchCoverage.length;summary.qualityIssues=data.quality.issues.length;
 if(summary.coverage!==24||data.sources.some(s=>s.verification?.status!=='quote_matched'))throw Error('Source/coverage contract failed');
 await writeFile('offer-engine/public/bhs-quality-audit.json',JSON.stringify({brief,audit},null,2));
 const cost=charged,count=generations;
 const price=await call(createPricingHandler({getSecret:()=>secret}),{action:'start',brief,audit,pricingProof:finished.pricingProof});
 if(price.code!==200)throw Error('Pricing failed');
 const f=await offerFixture(),logo={...f.logo.data,logoProof:logoProof(secret,host,f.logo.data)};
 const proposal=await call(createProposalHandler({getSecret:()=>secret}),{action:'start',context:{leadId:'isolated-quality',spaceId:'isolated-space'},brief,audit,pricing:price.data.result,proposalProof:price.data.proposalProof,logo});
 if(proposal.code!==200||proposal.data.result.data.alternatives.length!==2||!proposal.data.saveProof)throw Error('Proposal failed');
 const resumed=await call(auditHandler,{action:'status',brief,ticket});
 if(resumed.code!==200||charged!==cost||generations!==count)throw Error('Reload or handoff repeated work');
 Object.assign(summary,{passed:true,signedPricing:true,signedProposal:true,reloadReused:true,downstreamGenerations:generations-count});
}catch(error){summary.code=typeof error.code==='string'?error.code:'acceptance_failed';summary.error=String(error.message||'Failure').replaceAll(secret,'[credential]').slice(0,250);}
summary.generations=generations;summary.committedCeilingKurus=charged;summary.uncertainReservationsKurus=[...rows.values()].filter(r=>r.state==='uncertain').reduce((sum,r)=>sum+r.charge_kurus,0);summary.costNote='Conservative usage/reservation envelope, not a provider invoice; includes a virtual 500-kurus infrastructure allowance.';
await writeFile('offer-engine/public/bhs-quality-acceptance.json',JSON.stringify(summary,null,2));console.log('BHS_QUALITY_ACCEPTANCE '+JSON.stringify(summary));if(!summary.passed)process.exitCode=1;
