// Explicit, isolated real-provider acceptance. Never runs in the ordinary build.
import {writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createLedger} from '../src/budget/ledger.mjs';
import {createBoundedProviders} from '../src/budget/providers.mjs';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {createPricingHandler} from '../api/pricing.js';
import {createProposalHandler} from '../api/proposal.js';
import {prepareUploadedLogo} from '../src/upload.mjs';
import {logoProof} from '../src/proposal/logo-proof.mjs';
import {offerGeminiKey} from '../src/config.mjs';
import {response} from '../test/fixtures/offer.mjs';
if(process.env.VERCEL_ENV!=='preview'||process.argv[2]!=='--run'||process.env.VERCEL_GIT_COMMIT_REF!=='qa/pro-25-full-20261105'||process.env.VERCEL_PROJECT_ID!=='prj_B6Q6FIgq9NjbBlb6ga03cn6PD3jJ'||Date.now()>Date.parse('2026-11-06T12:00:00Z'))throw Error('Explicit isolated acceptance required');
const secret=offerGeminiKey();if(!secret)throw Error('Preview provider not configured');
let charged=500,generations=0;const rows=new Map(),runId=randomUUID();
const ledger=createLedger(async(op,a={})=>{
 if(['begin','status'].includes(op))return {chargedKurus:charged,capKurus:5000};
 const old=rows.get(a.step);if(op==='get')return old||null;
 if(op==='reserve'){
  if(old){if(old.input_hash!==a.hash)throw Error('Changed input');if(!(old.state==='uncertain'&&old.charge_kurus===0&&a.amount===0))return {claimed:false,step:old};}
  if(charged+a.amount>5000)return {blocked:true};charged+=a.amount;
  const step={state:'reserved',input_hash:a.hash,claim_token:a.token,charge_kurus:a.amount,created_at:new Date().toISOString()};rows.set(a.step,step);return {claimed:true,step};
 }
 if(!old||old.claim_token!==a.token)throw Error('Changed reservation');if(old.state==='complete')return old;
 if(op==='complete')charged-=old.charge_kurus-a.amount;
 const row={...old,state:op,value:a.value,charge_kurus:op==='complete'?a.amount:old.charge_kurus};rows.set(a.step,row);return row;
});
const brief={brandName:'Organised Mums',website:'https://www.theorganisedmums.co.uk/',segment:'corporate',goals:'ABD pazarına e-ticaret genişlemesini değerlendirmek.',needs:'Kamuya açık ürün, teslimat, kanal ve rakip verilerine dayalı planlama.',services:'Stratejik danışmanlık, dijital pazarlama ve altyapı planlama.',meetingNotes:'Bağımsız, sentetik kalite testi. Gerçek müşteri görüşmesi veya beyanı değildir. Kamuya açık doğrulanmış olgularla hipotezleri ayır.',budget:null,language:'en',currency:'TRY'};
const host='isolated-acceptance.example';let cookie='';const getProviders=options=>createBoundedProviders({...options,defaultModel:'gemini-2.5-pro',fetchImpl:async(url,init)=>{if(url.endsWith(':generateContent'))generations++;return fetch(url,init);}});
const handler=createBoundedAuditHandler({getSecret:()=>secret,getResearchModel:()=> 'gemini-2.5-pro',getLedger:async(_q,_r,_lead,options)=>{if(options?.researchRunId!==runId)throw Error('Run isolation failed');return ledger;},getProviders});
async function call(fn,body){const res=response();await fn({method:'POST',headers:{host,origin:'https://'+host,cookie},body},res);const set=res.headers['Set-Cookie'];if(set)cookie=(Array.isArray(set)?set:[set]).find(x=>x.startsWith('__Host-offer-research')).split(';')[0];return res;}
const summary={passed:false,runIsolation:true,capKurus:5000,productionWrites:0,customerWrites:0,mailSends:0,newRun:true,modelPolicyChanged:true,researchModel:'gemini-2.5-pro',supportModel:'gemini-2.5-pro'};let ticket;
await mkdir('offer-engine/public/qa-repair',{recursive:true});
try{
 const start=await call(handler,{action:'start',requestId:'isolated_fresh_offer_acceptance',context:{leadId:'isolated-repair',spaceId:'isolated-space',researchRunId:runId},brief});
 if(start.code!==200)throw Object.assign(Error('BHS start failed'),{code:start.data.code});
 ticket=start.data.ticket;let finished;
 for(let i=0;i<6;i++){const res=await call(handler,{action:'advance',brief,ticket});ticket=res.data.ticket||ticket;if(res.code>=400)throw Object.assign(Error('BHS stage failed'),{code:res.data.code});if(res.data.result){finished=res.data;break;}}
 if(!finished)throw Error('BHS did not finish');
 const audit=finished.result,d=audit.data;
 Object.assign(summary,{sourceCount:d.sources.length,findingCount:d.findings.length,availableAreas:d.researchCoverage.filter(a=>a.status!=='unavailable').length,coverage:d.researchCoverage.length,continuity:d.researchContinuity?.status||null});
 await writeFile('offer-engine/public/qa-repair/audit.json',JSON.stringify({brief,audit}));
 if(d.researchContinuity||d.findings.length<4||d.sources.length<4||summary.availableAreas<12)throw Error('Research depth acceptance failed');
 const pricing=await call(createPricingHandler({getSecret:()=>secret}),{action:'start',brief,audit,pricingProof:finished.pricingProof});
 if(pricing.code!==200)throw Error('Pricing failed');
 await writeFile('offer-engine/public/qa-repair/pricing.json',JSON.stringify(pricing.data.result));
 const image='data:image/png;base64,'+(await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160"><rect width="400" height="160" fill="white"/><text x="40" y="95" font-family="sans-serif" font-size="40" fill="#333">QA LOGO</text></svg>')).png().toBuffer()).toString('base64');
 const logo=await prepareUploadedLogo(image,{localFirst:true,locate:()=>{throw Error('Unexpected paid localisation');}});
 const proposal=await call(createProposalHandler({getSecret:()=>secret,getLedger:async(_q,_r,_lead,options)=>{if(options?.researchRunId!==runId)throw Error('Translation escaped run');return ledger;},getProviders}),{action:'start',context:{leadId:'isolated-repair',spaceId:'isolated-space'},brief,audit,pricing:pricing.data.result,proposalProof:pricing.data.proposalProof,logo:{...logo,logoProof:logoProof(secret,host,logo)}});
 if(proposal.code!==200)throw Object.assign(Error('English proposal failed'),{code:proposal.data.code});
 summary.englishProposal=proposal.data.result.data.language==='en';summary.alternatives=proposal.data.result.data.alternatives.length;summary.logoTransparent=logo.candidates[0].quality.transparency;
 await writeFile('offer-engine/public/qa-repair/proposal.json',JSON.stringify(proposal.data.result));
 const before=generations,cost=charged;const resumed=await call(handler,{action:'status',brief,ticket});if(resumed.code!==200||generations!==before||charged!==cost)throw Error('Reload repeated a provider call');
 summary.reloadReused=true;summary.passed=summary.englishProposal&&summary.alternatives===2&&summary.logoTransparent;
}catch(error){summary.code=error.code||'acceptance_failed';summary.error=String(error.message).replaceAll(secret,'[credential]').slice(0,160);}
summary.committedCeilingKurus=charged;summary.generations=generations;summary.uncertainKurus=[...rows.values()].filter(r=>r.state==='uncertain').reduce((s,r)=>s+r.charge_kurus,0);
await writeFile('offer-engine/public/qa-repair/result.json',JSON.stringify(summary));
await writeFile('offer-engine/public/qa-repair/checkpoint.json',JSON.stringify({charged,rows:[...rows]}));
console.log('FRESH_OFFER_ACCEPTANCE '+JSON.stringify(summary));
// Keep the preview available for inspection when the real provider fails.
// result.json.passed is the acceptance gate; a READY build alone is not success.
