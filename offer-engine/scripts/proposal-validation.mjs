// Explicit diagnostic only. Ordinary builds never start provider calls.
import {isDeepStrictEqual} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {createResearchProvider,modelText} from '../src/bhs/provider.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {pricingEngine} from '../src/engines/pricing-engine.mjs';
import {proposalEngine} from '../src/engines/proposal-engine.mjs';
import {prepareUploadedLogo} from '../src/upload.mjs';
import {assertResult} from '../src/contracts.mjs';
import {context} from '../test/fixtures/evidence.mjs';
import {brief as base} from '../test/fixtures/bhs.mjs';
if(process.env.VERCEL_ENV!=='preview')throw Error('Protected preview required.');
const provider=createResearchProvider(),reuse=process.argv.find(a=>a.startsWith('--reuse='))?.slice(8);
let output={kind:'synthetic-live-proposal-composition-check',notARealBrandBhs:true,asOf:new Date().toISOString(),deepResearchCalls:0,proposalCalls:reuse?0:1,passed:false};
try{
 const brief=snapshotBrief({...base,brandName:'Sentetik Test Marka',services:'Meta ve Google Ads'}),data=context().report;
 Object.assign(data,{schemaVersion:'bhs-v1',briefHash:briefHash(brief),summary:'Sentetik test verisi: bayi ağı ile talep kanalları birlikte doğrulanmalı.',services:[],rawReport:'Sentetik test raporu; gerçek marka araştırması değildir.',scoring:{total:null,note:'Gerçek şirket verisi yok.'},quality:{checksPassed:true,semanticBenchmark:'passed'}});
 const audit={stage:'audit',status:'ready',data};
 const pricing={stage:'pricing',...await pricingEngine.run({brief,scope:{summary:'Ölçümlü kanal başlangıcı.',budget:{posture:'unspecified',quote:null,targetQuote:null,targetScope:'unspecified'},services:['meta','google_ads'].map(serviceId=>({serviceId,phase:'start',priority:1,reason:'Seçili reklam kanalı.',briefQuote:brief.services,findingIds:['f0']})),exclusions:['Reklam bütçesi hariç.']}},{audit})};
 const image='data:image/png;base64,'+(await readFile('public/examples/logo-white.png')).toString('base64');
 const logo={stage:'logo',status:'review',data:await prepareUploadedLogo(image)};
 output.phase='provider';
 let job=reuse?await provider.poll(reuse):await provider.composeProposal(brief,audit.data,pricing.data);output.interactionId=job.id;
 const started=Date.now();while(['queued','in_progress'].includes(job.status)&&Date.now()-started<120000){await new Promise(r=>setTimeout(r,3000));job=await provider.poll(job.id);}
 output.providerStatus=job.status;
 if(job.status!=='completed')throw Error('Provider job did not complete.');
 output.phase='decode';const copy=JSON.parse(modelText(job));output.copy=copy;output.phase='projection';const manualSteps=[{time:'Müşteri onayıyla',title:'Özel başlangıç adımı'}],checks=[];
 for(const planMode of ['growth','operations','manual']){
  const result=await proposalEngine.run({brief,copy,planMode,manualSteps},{audit,pricing,logo});assertResult('proposal',result);
  if(JSON.stringify(result.data.alternatives.map(a=>a.monthlyAmount))!==JSON.stringify(pricing.data.alternatives.map(a=>a.monthlyAmount))||result.data.logo.image!==logo.data.candidates[0].image||result.data.bhs.scoring.total!==null||result.status!=='review')throw Error('Projection check failed.');
  if(planMode==='manual'&&!isDeepStrictEqual(result.data.plans.operations_bundle.steps,manualSteps))throw Error('Manual plan changed.');
  checks.push({mode:planMode,passed:true,alternatives:result.data.alternatives.map(a=>({id:a.id,monthlyAmount:a.monthlyAmount})),operationsIncludesGrowth:result.data.plans.operations_bundle.steps.some(s=>/Tam BHS|Strateji/.test(s.title))});
 }
 output={...output,passed:true,provider:provider.model,copy,checks,pricesUnchanged:true,logoUnchanged:true,unknownScoresPreserved:true,crmWrites:0,mailSends:0};
}catch(error){output.reason=error.code||'composition_validation_failed';if(/^(Teklif|Manuel|Başlangıç|Logo|Motor|Müşteri|İki|Fiyat|Projection|Manual|Provider)/.test(error.message))output.validationIssue=error.message;}
await writeFile('public/proposal-validation.json',JSON.stringify(output,null,2));
console.log(JSON.stringify({proposalProviderCheck:output.passed,reason:output.reason||null}));
