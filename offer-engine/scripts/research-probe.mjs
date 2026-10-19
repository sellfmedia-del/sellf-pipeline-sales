// Explicit one-off CI probe. Never runs as part of the normal build or on a
// production deployment. Input is a public, synthetic Silverline test scenario.
import {writeFile,mkdir} from 'node:fs/promises';
import {createResearchProvider,modelText,citationUrls,interactionFailure} from '../src/bhs/provider.mjs';
import {createAuditEngine} from '../src/engines/audit-engine.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';

const mode=process.argv[2];
if(process.env.VERCEL_ENV!=='preview'||!['--start','--resume'].includes(mode))throw Error('Explicit preview-only probe required.');
const provider=createResearchProvider();
const brief=snapshotBrief({brandName:'Silverline TR',segment:'corporate',website:'https://www.silverline.com/tr-TR',goals:'Türkiye pazarında bayi ağını ve kârlı büyümeyi değerlendirmek.',needs:'B2B bayi büyümesi ile tüketici talebi, satış sonrası servis ve dijital varlıklar arasındaki ilişkiyi araştırmak.',services:'Büyüme danışmanlığı, pazarlama ve operasyon seçeneklerinin araştırmaya dayalı değerlendirilmesi.',meetingNotes:'Kalite karşılaştırması için hazırlanmış test briefidir. Hedefler test senaryosudur; yeni müşteri beyanı veya doğrulanmış ticari sonuç değildir. Marka ankastre ve mutfak ürünleri alanında Türkiye pazarında incelenecek. Rakipler ölçek, hedef kitle ve coğrafya ile gerekçelendirilerek seçilmeli. Eski örnek rapordaki sayısal sonuçları veya iddiaları doğru kabul etme; güncel kaynaklardan bağımsız araştır.',budget:''});
const proof={test:'public-synthetic-silverline',startedAt:new Date().toISOString(),agent:provider.agent,model:provider.model,status:'starting'};
const log=(event,details={})=>console.log('BHS_PROBE '+JSON.stringify({event,...details}));
async function waitFor(initial){
  let value=initial;
  const deadline=Date.now()+60*60*1000;
  while(['queued','in_progress'].includes(value.status)){
    log('running',{id:value.id,status:value.status});
    if(Date.now()>deadline){await provider.cancel(value.id);throw Error('Probe deadline exceeded.');}
    await new Promise(resolve=>setTimeout(resolve,15000));
    value=await provider.poll(value.id);
  }
  if(value.status!=='completed')throw interactionFailure(value);
  return value;
}
try{
  log('starting');
  const start=mode==='--resume'?await provider.poll(process.argv[3]):await provider.start(brief,new Date().toISOString().slice(0,10));
  proof.researchId=start.id;log('research_started',{id:start.id});
  const research=await waitFor(start);
  log('research_completed',{characters:modelText(research).length,citations:citationUrls(research).length});
  const finalOutput=(research.steps||[]).filter(step=>step.type==='model_output').at(-1);
  proof.research={id:research.id,status:research.status,usage:research.usage,steps:finalOutput?[{type:'model_output',content:(finalOutput.content||[]).filter(part=>part.type==='text')}]:[]};
  const structured=process.argv[4]?await provider.poll(process.argv[4]):await provider.structure(brief,research);
  proof.structureId=structured.id;log('structure_started',{id:structured.id});
  proof.structure={id:structured.id,status:structured.status,text:modelText(structured),usage:structured.usage};
  const structure=await waitFor(structured);
  // Keep only the final structured answer so verification can be debugged or
  // replayed without another paid research/extraction request.
  proof.structure={id:structure.id,status:structure.status,text:modelText(structure),usage:structure.usage};
  log('verification_started',{characters:proof.structure.text.length});
  proof.result=await createAuditEngine().run({brief,research,structure});
  proof.status=proof.result.status;
  log('completed',{status:proof.status,quality:proof.result.data.quality,score:proof.result.data.scoring});
}catch(error){
  proof.status='failed';proof.error={code:error.code||'probe_error',interactionStatus:error.interactionStatus||null,providerStatus:error.providerStatus||null,providerReason:error.providerReason||null};
  // Error.message from arbitrary upstream code is deliberately not logged.
  log('failed',proof.error);
}
proof.finishedAt=new Date().toISOString();
// Output remains behind the unchanged Vercel deployment protection. No private
// notes, live CRM data, provider key, session cookie or signed job ticket exists.
await mkdir('public',{recursive:true});
await writeFile('public/bhs-probe.json',JSON.stringify(proof));
