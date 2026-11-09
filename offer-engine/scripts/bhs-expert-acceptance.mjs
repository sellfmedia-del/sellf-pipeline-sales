// Explicit branch/commit-gated public-brand QA. No database, user/customer
// records, publication, mail, environment changes or external subscriptions.
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createLedger} from '../src/budget/ledger.mjs';
import {createBoundedProviders} from '../src/budget/providers.mjs';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {createPricingHandler} from '../api/pricing.js';
import {createProposalHandler} from '../api/proposal.js';
import {offerGeminiKey} from '../src/config.mjs';
import {response,offerFixture} from '../test/fixtures/offer.mjs';
import {logoProof} from '../src/proposal/logo-proof.mjs';
import {expertVersion} from '../src/bhs/expert-report.mjs';

const branch='feat/bhs-expert-evidence-v6';
export const acceptanceEnabled=()=>process.env.VERCEL_ENV==='preview'&&(process.env.VERCEL_PROJECT_ID==='prj_B6Q6FIgq9NjbBlb6ga03cn6PD3jJ'||/^sellf-pipeline-sales-[a-z0-9]+-yigit-konuks-projects\.vercel\.app$/.test(process.env.VERCEL_URL||''))&&process.env.VERCEL_GIT_COMMIT_REF===branch&&String(process.env.VERCEL_GIT_COMMIT_MESSAGE||'').includes('[BHS_EXPERT_ACCEPTANCE_20261109]')&&Date.now()<Date.parse('2026-11-13T00:00:00Z');
const brands=[['Gümüşsuyu','https://www.gumussuyu.com.tr/'],['Humm Organic','https://www.humm.com.tr/'],['Rebel Burger','https://www.instagram.com/rebel_bybundle/'],['Anker Turizm','https://www.ankertravel.com/'],['Blum Coffee House','https://www.blumcoffeehouse.com/']];
export async function runExpertAcceptance(){
 if(!acceptanceEnabled())return;
 const secret=offerGeminiKey();if(!secret||!(process.env.OFFER_TAVILY_API_KEY||process.env.TAVILY_API_KEY))throw Error('Isolated preview provider configuration is missing.');
 const results=[];let index=0;
 async function runBrand([brandName,website]){
  const rows=new Map();let charged=500,generations=0,searches=0,cookie;
  const host='expert-acceptance.example',leadId='isolated-expert-'+randomUUID(),brief={brandName,website,segment:'corporate',currency:'TRY',language:'tr',budget:null,goals:'Türkiye pazarında sürdürülebilir ve ölçülebilir büyüme fırsatlarını incelemek.',needs:'Ürün/teklif/kanal ve rakip farklarını dış kaynaklarla doğrulamak; gözlem ile iç veri gerektiren hipotezi ayırmak.',services:'Kullanıcının seçtiği hizmetler ayrıca hesaplanır.',meetingNotes:'Yalnız kamuya açık marka testi; müşteri görüşmesi, özel dosya veya iç performans verisi değildir. Türkiye pazarı. Ülke/domain yönlenmesini açıkça belirt.'};
  const ledger=createLedger(async(op,a={})=>{
   if(['begin','status'].includes(op))return {chargedKurus:charged,capKurus:5000};
   if(op==='get')return rows.get(a.step)||null;
   const old=rows.get(a.step);
   if(op==='reserve'){
    if(old){if(old.input_hash!==a.hash)throw Error('Changed isolated receipt');return {claimed:false,step:old};}
    if(charged+a.amount>5000)return {blocked:true};charged+=a.amount;
    rows.set(a.step,{state:'reserved',input_hash:a.hash,claim_token:a.token,charge_kurus:a.amount,created_at:new Date().toISOString()});return {claimed:true};
   }
   if(old?.claim_token!==a.token)throw Error('Changed isolated claim');if(old.state==='complete')return old;
   if(op==='complete')charged-=old.charge_kurus-a.amount;
   const row={...old,state:op,value:a.value,charge_kurus:op==='complete'?a.amount:old.charge_kurus};rows.set(a.step,row);return row;
  });
  const handler=createBoundedAuditHandler({getSecret:()=>secret,getLedger:async()=>ledger,getProviders:options=>createBoundedProviders({...options,fetchImpl:async(url,init)=>{if(url.endsWith(':generateContent'))generations++;if(url==='https://api.tavily.com/search')searches++;return fetch(url,init);}}),logger:{info(){},error:v=>console.info('BHS_EXPERT_STAGE_ERROR '+v)}});
  async function call(h,body){const res=response();await h({method:'POST',headers:{host,origin:'https://'+host,cookie},body},res);const cookies=res.headers['Set-Cookie'];if(cookies)cookie=(Array.isArray(cookies)?cookies:[cookies]).find(c=>c.startsWith('__Host-offer-research')).split(';')[0];return res;}
  const summary={brandName,website,passed:false,databaseWrites:0,mailSends:0,capKurus:5000,researchVersion:expertVersion,manualSemanticReview:'pending',stages:[]};
  let audit;
  try{
   const started=await call(handler,{action:'start',requestId:randomUUID(),brief,context:{leadId,spaceId:'isolated-expert'}});
   if(started.code!==200)throw Object.assign(Error('Start failed'),{code:started.data.code});let ticket=started.data.ticket,finished;
   for(let step=0;step<4;step++){
    let res=await call(handler,{action:'advance',brief,ticket});ticket=res.data.ticket||ticket;
    summary.stages.push({phase:res.data.phase,status:res.code,costKurus:charged});
    console.info('BHS_EXPERT_PROGRESS '+JSON.stringify({brandName,...summary.stages.at(-1)}));
    if(res.code>=400){summary.failureCode=res.data.code;if(!res.data.continuationAvailable)throw Object.assign(Error('Research stage failed'),{code:res.data.code});res=await call(handler,{action:'continue',brief,ticket});summary.explicitZeroCostHandoff=true;}
    if(res.data.result){finished=res.data;break;}
   }
   if(!finished)throw Error('No research result');audit=finished.result;
   const d=audit.data;Object.assign(summary,{findings:d.findings.length,sources:d.sources.length,peers:d.competitors.length,availableAreas:d.researchCoverage.filter(c=>c.status!=='unavailable').length,coverage:d.researchCoverage.length,fullResearch:!d.researchContinuity&&d.methodologyVersion===expertVersion});
   const entries=[...rows.entries()],synthesis=entries.find(([key,row])=>key.startsWith('audit:synthesis:')&&row.state==='complete')?.[1].value,planning=entries.find(([key,row])=>key.startsWith('audit:source_plan:')&&row.state==='complete')?.[1].value;
   const generated=entries.filter(([key,row])=>key.startsWith('model:synthesis:')&&row.state==='complete').map(([,row])=>row.value.data).find(v=>Array.isArray(v?.findings));
   summary.rawFindings=generated?.findings.length;summary.rawCoverageKeys=Object.keys(generated?.coverage||{}).length;
   summary.projectionIssues=Object.fromEntries([...new Set((synthesis?.report?.transfer?.issues||[]).map(i=>i.reason))].map(reason=>[reason,synthesis.report.transfer.issues.filter(i=>i.reason===reason).length]));
   summary.peerDiagnostics=(planning?.plan?.entities||[]).filter(e=>e.role==='competitor').map(e=>({name:e.name,website:e.website,relationship:generated?.peers?.find(p=>p.entityId===e.id)?.relationship||'unconfirmed',accepted:d.competitors.some(p=>p.id===e.id)}));
   const priced=await call(createPricingHandler({getSecret:()=>secret}),{action:'start',brief,audit,pricingProof:finished.pricingProof,serviceSelection:{services:[{serviceId:'onsite_seo'}],projects:[]}});
   if(priced.code!==200)throw Object.assign(Error('Selected pricing failed'),{code:priced.data.code});
   const f=await offerFixture(),logo={...f.logo.data,logoProof:logoProof(secret,host,f.logo.data)};
   const proposal=await call(createProposalHandler({getSecret:()=>secret}),{action:'start',brief,audit,pricing:priced.data.result,proposalProof:priced.data.proposalProof,logo,context:{leadId,spaceId:'isolated-expert'}});
   if(proposal.code!==200)throw Object.assign(Error('Proposal composition failed'),{code:proposal.data.code});
   summary.offerFlowPassed=Boolean(proposal.data.saveProof)&&proposal.data.result.data.alternatives.length===2;
   summary.passed=summary.fullResearch&&d.findings.length>0&&d.dimensions.length===6&&d.researchCoverage.length===24&&d.sources.every(s=>s.verification?.status==='quote_matched')&&summary.offerFlowPassed;
  }catch(error){summary.code=error.code||'acceptance_failed';summary.error=String(error.message||'Acceptance failed').replaceAll(secret,'[credential]').slice(0,180);}
  Object.assign(summary,{chargedKurus:charged,generations,searches,uncertainReservationsKurus:[...rows.values()].filter(r=>r.state==='uncertain').reduce((n,r)=>n+r.charge_kurus,0),costNote:'Verified provider usage plus retained uncertain reservations and a virtual 5 TRY infrastructure allowance; not a provider invoice.'});
  if(charged>5000||searches>14)throw Error('Isolated acceptance exceeded the existing ceiling');
  const value={summary,brief,...(audit?{audit}:{})};results.push(value);
  console.info('BHS_EXPERT_ACCEPTANCE '+JSON.stringify(summary));
 }
 // Two independent public brands at a time; page reads are already bounded.
 await Promise.all(Array.from({length:2},async()=>{while(index<brands.length){const brand=brands[index++];await runBrand(brand);}}));
 const safe={generatedAt:new Date().toISOString(),commit:process.env.VERCEL_GIT_COMMIT_SHA,databaseWrites:0,mailSends:0,manualSemanticReview:'pending',results};
 await mkdir('public/expert-review',{recursive:true});await writeFile('public/expert-review/results.json',JSON.stringify(safe,null,2));
 await writeFile('public/expert-review/index.html','<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BHS uzman akışı — izole karşılaştırma</title><style>body{font:16px/1.6 system-ui;max-width:1050px;margin:40px auto;padding:0 20px;background:#f5f6fa;color:#202532}article{background:white;padding:24px;margin:20px 0;border:1px solid #ddd;border-radius:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere}h1{line-height:1.2}small{color:#596274}</style><h1>BHS uzman akışı</h1><p>İzole kamuya açık marka testleri. Müşteri kaydı, yayınlama veya e-posta işlemi yapılmadı. Maliyet gösterimi sağlayıcı tüketimi ve altyapı rezervini içerir.</p><main></main><script>fetch("results.json").then(r=>r.json()).then(data=>{for(const x of data.results){const a=document.createElement("article"),h=document.createElement("h2"),s=document.createElement("p"),p=document.createElement("pre");h.textContent=x.summary.brandName;s.textContent=(x.summary.passed?"Teknik akış geçti":"İnceleme gerekli")+" · "+(x.summary.chargedKurus/100).toFixed(2)+" TL · "+(x.summary.findings||0)+" bulgu · "+(x.summary.peers||0)+" rakip";p.textContent=x.audit?.data?.rawReport||x.summary.error||"Araştırma tamamlanamadı";a.append(h,s,p);document.querySelector("main").append(a);}})</script></html>');
}
