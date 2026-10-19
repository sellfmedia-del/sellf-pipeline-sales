// Explicit public-fixture probe; the normal build never invokes this script.
import {writeFile,mkdir} from 'node:fs/promises';
import {createResearchProvider,modelText,citationUrls,interactionFailure} from '../src/bhs/provider.mjs';
import {parseSourcePlan} from '../src/bhs/source-plan.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';
if(process.env.VERCEL_ENV!=='preview'||!['--discover','--resume-plan'].includes(process.argv[2]))throw Error('Explicit preview-only evidence probe required.');
const provider=createResearchProvider();
const brief=snapshotBrief({brandName:'Silverline TR',segment:'corporate',website:'https://www.silverline.com/tr-TR',goals:'Türkiye pazarında bayi ağını ve kârlı büyümeyi değerlendirmek.',needs:'B2B bayi büyümesi ile tüketici talebi, satış sonrası servis ve dijital varlıklar arasındaki ilişkiyi araştırmak.',services:'Büyüme danışmanlığı, pazarlama ve operasyon seçeneklerinin araştırmaya dayalı değerlendirilmesi.',meetingNotes:'Kamuya açık kaynaklarla kalite karşılaştırması için hazırlanmış test briefidir. Hedefler test senaryosudur; müşteri beyanı değildir. Eski örnek rapordaki sayıları doğru kabul etme.',budget:''});
const proof={test:'public-synthetic-silverline-evidence',brief,status:'starting'};
const log=(event,data={})=>console.log('EVIDENCE_PROBE '+JSON.stringify({event,...data}));
try{
 let plan;
 if(process.argv[2]==='--discover'){
  const research=await provider.poll(process.argv[3]);
  plan=await provider.discoverSources(brief,research);
 }else plan=await provider.poll(process.argv[3]);
 proof.sourcePlanId=plan.id;log('source_plan_started',{id:plan.id});
 const until=Date.now()+12*60*1000;
 while(['queued','in_progress'].includes(plan.status)){
  if(Date.now()>until)throw Error('Source plan deadline exceeded.');
  log('running',{id:plan.id,status:plan.status});await new Promise(r=>setTimeout(r,15000));plan=await provider.poll(plan.id);
 }
 if(plan.status!=='completed')throw interactionFailure(plan);
 proof.sourcePlan=parseSourcePlan(JSON.parse(modelText(plan)));proof.citations=citationUrls(plan);proof.status='source_plan_complete';
 log('source_plan_completed',{entities:proof.sourcePlan.entities.length,sources:proof.sourcePlan.sources.length});
}catch(error){proof.status='failed';proof.error={code:error.code||'probe_error',providerReason:error.providerReason||null,providerCodes:error.providerCodes||[],parameterHints:error.parameterHints||[]};log('failed',proof.error);}
await mkdir('public',{recursive:true});await writeFile('public/evidence-probe.json',JSON.stringify(proof));
