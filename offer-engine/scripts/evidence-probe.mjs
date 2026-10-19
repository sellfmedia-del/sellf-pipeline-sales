// Explicit public-fixture probe; the normal build never invokes this script.
import {applyEdits} from '../src/bhs/editor.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import {createResearchProvider,modelText,citationUrls,interactionFailure} from '../src/bhs/provider.mjs';
import {parseSourcePlan} from '../src/bhs/source-plan.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {parseGroundedReport,readStoredEnvelope} from '../src/bhs/grounded-report.mjs';
import {createAuditEngine} from '../src/engines/audit-engine.mjs';
import {discoverySourceHints} from '../src/bhs/discovery-hints.mjs';
import {createEvidenceCollector,assertCoreEvidence} from '../src/bhs/evidence.mjs';
if(process.env.VERCEL_ENV!=='preview'||!['--discover','--resume-plan','--collect','--synthesize','--resume-synthesis','--resume-review'].includes(process.argv[2]))throw Error('Explicit preview-only evidence probe required.');
const provider=createResearchProvider();
const brief=snapshotBrief({brandName:'Silverline TR',segment:'corporate',website:'https://www.silverline.com/tr-TR',goals:'Türkiye pazarında bayi ağını ve kârlı büyümeyi değerlendirmek.',needs:'B2B bayi büyümesi ile tüketici talebi, satış sonrası servis ve dijital varlıklar arasındaki ilişkiyi araştırmak.',services:'Büyüme danışmanlığı, pazarlama ve operasyon seçeneklerinin araştırmaya dayalı değerlendirilmesi.',meetingNotes:'Kamuya açık kaynaklarla kalite karşılaştırması için hazırlanmış test briefidir. Hedefler test senaryosudur; müşteri beyanı değildir. Eski örnek rapordaki sayıları doğru kabul etme.',budget:''});
const proof={test:'public-synthetic-silverline-evidence',brief,status:'starting'};
const log=(event,data={})=>console.log('EVIDENCE_PROBE '+JSON.stringify({event,...data}));
try{
 async function completed(job){
  const until=Date.now()+12*60*1000;
  while(['queued','in_progress'].includes(job.status)){
   if(Date.now()>until)throw Error('Deadline exceeded.');
   log('running',{id:job.id,status:job.status});await new Promise(r=>setTimeout(r,15000));job=await provider.poll(job.id,{includeInput:true});
  }
  if(job.status!=='completed')throw interactionFailure(job);
  return job;
 }
 async function finish(synthesis,review){
  let packet,report;
  if(!review){
   synthesis=await completed(synthesis);proof.synthesisId=synthesis.id;proof.synthesisText=modelText(synthesis);
   // Reload stored input even if the creation response did not echo it.
   synthesis=await provider.poll(synthesis.id,{includeInput:true});
   packet=readStoredEnvelope(synthesis,'sellf-bhs-synthesis-v1',brief).packet;
   report=parseGroundedReport(modelText(synthesis));
   let revision=await provider.revise(brief,packet,report);proof.revisionId=revision.id;log('revision_started',{id:revision.id});
   revision=await completed(revision);proof.editorPatch=JSON.parse(modelText(revision));
   report=applyEdits(report,proof.editorPatch);
   review=await provider.assess(brief,packet,report);proof.semanticId=review.id;log('semantic_started',{id:review.id});
  }
  review=await completed(review);review=await provider.poll(review.id,{includeInput:true});
  const context=readStoredEnvelope(review,'sellf-bhs-semantic-v1',brief);
  proof.evidence=context.packet;proof.report=context.report;proof.semanticText=modelText(review);proof.semanticId=review.id;
  proof.result=await createAuditEngine().run({brief,packet:context.packet,report:context.report,assessment:JSON.parse(modelText(review)),synthesisId:proof.synthesisId,semanticId:review.id});
  proof.status='complete';log('result',{status:proof.result.status,issues:proof.result.data.quality.issues});
 }
 if(process.argv[2]==='--resume-synthesis'){await finish(await provider.poll(process.argv[3],{includeInput:true}));}
 else if(process.argv[2]==='--resume-review'){await finish(null,await provider.poll(process.argv[3],{includeInput:true}));}
 else {
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
 proof.sourcePlan=parseSourcePlan(JSON.parse(modelText(plan)));proof.citations=citationUrls(plan);proof.sourcePlanUsage=plan.usage;proof.stepCounts=(plan.steps||[]).reduce((counts,s)=>(counts[s.type]=(counts[s.type]||0)+1,counts),{});proof.status='source_plan_complete';
 log('source_plan_completed',{entities:proof.sourcePlan.entities.length,sources:proof.sourcePlan.sources.length});
 if(['--collect','--synthesize'].includes(process.argv[2])){
  const research=await provider.poll('v1_Chc2eGZXYXByLUVlR0Uxc2dQdC1HSGlRdxIXNnhmV2Fwci1FZUdFMXNnUHQtR0hpUXc');
  proof.evidence=await createEvidenceCollector()(brief,proof.sourcePlan,{extraSources:discoverySourceHints(research,brief)});proof.status='evidence_ready';
  log('evidence_ready',{sources:proof.evidence.sources.length,methods:proof.evidence.sources.map(s=>s.method),unavailable:proof.evidence.unavailable.length});
  if(process.argv[2]==='--synthesize'){assertCoreEvidence(proof.evidence,brief);const synthesis=await provider.synthesize(brief,proof.evidence);proof.synthesisId=synthesis.id;log('synthesis_started',{id:synthesis.id});await finish(synthesis);}
 }
 }
}catch(error){proof.status='failed';proof.error={code:error.code||'probe_error',providerReason:error.providerReason||null,providerCodes:error.providerCodes||[],parameterHints:error.parameterHints||[]};log('failed',proof.error);}
await mkdir('public',{recursive:true});await writeFile('public/evidence-probe.json',JSON.stringify(proof));
