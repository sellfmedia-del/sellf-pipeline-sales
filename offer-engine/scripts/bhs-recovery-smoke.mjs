// Explicit preview-build acceptance. Real public research/models, in-memory
// budget only. No database, customer record, auth account, publication or mail.
import {writeFile} from 'node:fs/promises';
import {createLedger} from '../src/budget/ledger.mjs';
import {createBoundedProviders} from '../src/budget/providers.mjs';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {createPricingHandler} from '../api/pricing.js';
import {createProposalHandler} from '../api/proposal.js';
import {offerGeminiKey} from '../src/config.mjs';
import {logoProof} from '../src/proposal/logo-proof.mjs';
import {offerFixture} from '../test/fixtures/offer.mjs';

if(process.env.VERCEL_ENV!=='preview'||process.argv[2]!=='--run')throw Error('Explicit preview-only acceptance required.');
const secret=offerGeminiKey();if(!secret||!(process.env.OFFER_TAVILY_API_KEY||process.env.TAVILY_API_KEY))throw Error('Preview provider configuration missing.');
const host='isolated-bhs-acceptance.example',rows=new Map();let charged=500,cookie,injected503=0,realGenerations=0;
const ledger=createLedger(async(op,a={})=>{
 if(['begin','status'].includes(op))return {chargedKurus:charged,capKurus:5000};
 if(op==='get')return rows.get(a.step)||null;
 const old=rows.get(a.step);
 if(op==='reserve'){
  if(old){if(old.input_hash!==a.hash)throw Error('Changed input');if(!(old.charge_kurus===0&&a.amount===0&&old.state==='uncertain'))return {claimed:false,step:old};}
  if(charged+a.amount>5000)return {blocked:true};
  charged+=a.amount;rows.set(a.step,{state:'reserved',input_hash:a.hash,claim_token:a.token,charge_kurus:a.amount});return {claimed:true};
 }
 if(old?.claim_token!==a.token)throw Error('Reservation ownership changed');
 if(old.state==='complete')return old;
 if(op==='complete')charged-=old.charge_kurus-a.amount;
 const row={...old,state:op,value:a.value,charge_kurus:op==='complete'?a.amount:old.charge_kurus};rows.set(a.step,row);return row;
});
const brief={brandName:'Huel',website:'https://huel.com/',segment:'corporate',goals:'UK e-commerce growth through measurable acquisition and repeat purchase.',needs:'Review publicly observable product, channel, customer journey and positioning evidence.',services:'Growth danışmanlığı, Meta ve Google Ads operasyonları.',meetingNotes:'Isolated public-brand acceptance, not an actual client meeting or private customer claim.',budget:null,currency:'TRY',language:'tr'};
const handler=createBoundedAuditHandler({getSecret:()=>secret,getLedger:async()=>ledger,getProviders:({manualRecoveryRound})=>createBoundedProviders({ledger,manualRecoveryRound,fetchImpl:async(url,init)=>{
 if(url.endsWith(':generateContent')){
  const body=JSON.parse(init.body),input=JSON.parse(body.contents[0].parts[0].text);
  if(input.searches&&!input.packet&&!manualRecoveryRound){injected503++;return Response.json({error:{message:'Injected isolated acceptance outage'}},{status:503});}
  realGenerations++;
 }
 return fetch(url,init);
}})});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(n){this.code=n;return this;},json(value){this.data=value;return this;}});
async function call(run,body){const res=response();await run({method:'POST',headers:{host,origin:'https://'+host,cookie},body},res);const cookies=res.headers['Set-Cookie'];if(cookies)cookie=(Array.isArray(cookies)?cookies:[cookies]).find(x=>x.startsWith('__Host-offer-research')).split(';')[0];return res;}
const summary={passed:false,kind:'real-public-research-with-injected-outage',databaseWrites:0,budgetReset:false,realMailSends:0};
try{
 const start=await call(handler,{action:'start',requestId:'isolated_bhs_acceptance_20261104',brief,context:{leadId:'isolated-acceptance',spaceId:'isolated-space'}});
 if(start.code!==200)throw Object.assign(Error('Start failed'),{code:start.data.code});
 let ticket=start.data.ticket;
 const failed=await call(handler,{action:'advance',brief,ticket});
 if(failed.code!==422||!failed.data.recoveryAvailable||injected503!==2)throw Object.assign(Error('Outage did not expose explicit recovery'),{code:failed.data.code});
 const beforeRecovery=charged;
 const accepted=await call(handler,{action:'recover',brief,ticket});
 if(accepted.code!==202||charged!==beforeRecovery)throw Error('Recovery changed the budget before work');
 let result;
 for(let phase=0;phase<4;phase++){
  const res=await call(handler,{action:'advance',brief,ticket});ticket=res.data.ticket||ticket;
  if(res.code>=400)throw Object.assign(Error('Real research failed'),{code:res.data.code,phase:res.data.phase});
  if(res.data.result){result=res.data;break;}
 }
 if(!result)throw Error('Research did not finish');
 const data=result.result.data;
 if(data.researchCoverage.length!==24||data.sources.length<3||data.findings.length<3)throw Error('Research quality acceptance not met');
 const fixture=await offerFixture(),logo={...fixture.logo.data,logoProof:logoProof(secret,host,fixture.logo.data)};
 const price=await call(createPricingHandler({getSecret:()=>secret}),{action:'start',brief,audit:result.result,pricingProof:result.pricingProof});
 if(price.code!==200)throw Error('Pricing handoff failed');
 const proposal=await call(createProposalHandler({getSecret:()=>secret}),{action:'start',context:{leadId:'isolated-acceptance',spaceId:'isolated-space'},brief,audit:result.result,pricing:price.data.result,proposalProof:price.data.proposalProof,logo});
 if(proposal.code!==200||proposal.data.result.data.alternatives.length!==2)throw Error('Proposal handoff failed');
 const cost=charged,stages=realGenerations;
 const resumed=await call(handler,{action:'status',brief,ticket});
 if(resumed.code!==200||charged!==cost||realGenerations!==stages)throw Error('Reload repeated paid work');
 Object.assign(summary,{passed:true,injected503,realGenerations,sourceCount:data.sources.length,findingCount:data.findings.length,methodologyAreas:data.researchCoverage.length,quality:data.quality,prices:proposal.data.result.data.alternatives.map(a=>a.monthlyAmount),reusedOnReload:true});
}catch(error){Object.assign(summary,{code:error.code||'acceptance_failed',error:error.message,phase:error.phase||null,injected503,realGenerations});}
summary.committedKurus=charged;summary.capKurus=5000;summary.uncertainReservationsKurus=[...rows.values()].filter(r=>r.state==='uncertain').reduce((sum,r)=>sum+r.charge_kurus,0);
// No raw prompt, response, key, session or customer data in the acceptance file.
await writeFile('offer-engine/public/bhs-recovery-acceptance.json',JSON.stringify(summary,null,2));
console.log('BHS_RECOVERY_ACCEPTANCE '+JSON.stringify(summary));
if(!summary.passed)process.exitCode=1;
