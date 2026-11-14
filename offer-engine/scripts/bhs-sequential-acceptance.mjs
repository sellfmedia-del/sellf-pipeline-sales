import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {brotliCompressSync,brotliDecompressSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {sequentialPhases} from '../src/bhs/sequential-contracts.mjs';
import {createSequentialProviders} from '../src/bhs/sequential-providers.mjs';
import {managedPhaseBudget} from '../src/bhs/managed-budget.mjs';
import {runMeteredBhsPhase} from '../src/bhs/job-worker.mjs';
import {meteredBhsStage} from '../src/bhs/job-infrastructure.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {localBudget} from '../test/fixtures/local-budget.mjs';
import {fetchQaCheckpoint} from './qa-checkpoint.mjs';
import {sequentialQaRequested} from './qa-acceptance-gate.mjs';

const caseName=process.env.OFFER_BHS_QA_CASE;
const allowed=sequentialQaRequested;
export async function runSequentialAcceptance(){
 if(!allowed())return {status:'not_requested'};
 const selected={tadim_final:{brandName:'Tadım',website:'https://www.tadim.com.tr/',segment:'corporate'},tadim_release:{brandName:'Tadım',website:'https://www.tadim.com.tr/',segment:'corporate'},tadim:{brandName:'Tadım',website:'https://www.tadim.com.tr/',segment:'corporate'},humm:{brandName:'Humm Organic',website:'https://humm.com.tr/',segment:'kobi'},muratbey:{brandName:'Muratbey',website:'https://www.muratbey.com.tr/',segment:'corporate'},sutas:{brandName:'Sütaş',website:'https://www.sutas.com.tr/',segment:'corporate'},duru:{brandName:'Duru Bulgur',website:'https://www.durubulgur.com/tr',segment:'corporate'}}[caseName];
 const cases={
  muratbey_france:{brandName:'Muratbey',website:'https://www.muratbey.com.tr/',segment:'corporate',goals:'Fransa pazarına giriş ve yerel perakende dağıtımı.',needs:'Fransa satış kanalları, doğrudan ikameler, ürün uyumu, depolama ve dağıtım gereklilikleri.'},
  teksan_b2b:{brandName:'Teksan',website:'https://www.teksan.com/',segment:'corporate',goals:'Türkiye pazarında B2B satış fırsatlarını ve nitelikli talebi artırmak.',needs:'Endüstriyel alıcılar, ürün seçimi, teklif alma ve servis kanallarındaki darboğazları belirlemek.'}
 };
 const brief=snapshotBrief({goals:'Türkiye pazarında sürdürülebilir ve kârlı büyüme.',needs:'Marka, sektör, rekabet ve müşteri geri bildirimleri üzerinden kaynaklı darboğaz araştırması.',...selected,...cases[caseName],services:'Büyüme danışmanlığı ve dijital pazarlama',meetingNotes:'Kamuya açık marka için sentetik kabul testi; gerçek CRM, müşteri veya satış verisi kullanılmıyor.'});
 let seed;
 const snapshot=process.env.OFFER_BHS_QA_SEED_SNAPSHOT;
 const snapshots={duru:'duru-retained-20261110',tadim:'tadim-retained-20261110',tadim_final:'tadim-final-retained-20261110',tadim_release:'tadim-release-retained-20261110'};
 const allowedSnapshots=caseName==='tadim_release'?[snapshots[caseName],'tadim-release-market-retained-20261110','tadim-release-expert-retained-20261110']:[snapshots[caseName]];
 if(snapshot&&!allowedSnapshots.includes(snapshot))throw Error('Unapproved QA receipt snapshot.');
 const seedData=snapshot?JSON.parse(await readFile(new URL('../test/fixtures/'+snapshot+'.json',import.meta.url),'utf8')).data:process.env.OFFER_BHS_QA_SEED_URL?await fetchQaCheckpoint(process.env.OFFER_BHS_QA_SEED_URL):process.env.OFFER_BHS_QA_SEED;
 if(seedData){
  const payload=JSON.parse(brotliDecompressSync(Buffer.from(seedData,'base64'),{maxOutputLength:12000000}).toString('utf8'));
  if(payload.briefHash!==briefHash(brief)||payload.case!==caseName)throw Error('QA checkpoint belongs to another brief.');seed=payload.receipts;
 }
 const db=await localBudget({lead:'public-'+caseName+'-v8',seed}),output=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');await mkdir(output,{recursive:true});
 const managed=process.env.OFFER_BHS_QA_MANAGED==='1';
 const outage=process.env.OFFER_BHS_QA_OUTAGE;
 const outageFamilies={claude:'api.anthropic.com',gemini:'generativelanguage.googleapis.com',tavily:'api.tavily.com'};
 if(outage&&!Object.hasOwn(outageFamilies,outage))throw Error('Unknown QA outage.');
 let simulatedRejections=0;
 const qaFetch=outage?async(url,init)=>{
  if(new URL(url).hostname!==outageFamilies[outage])return fetch(url,init);
  simulatedRejections++;
  const error=outage==='claude'?{type:'invalid_request_error',message:'You have reached your specified API usage limits.'}:{message:'Service unavailable.'};
  return new Response(JSON.stringify({error}),{status:outage==='claude'?400:outage==='tavily'?432:503});
 }:fetch;
 if(outage){
  const probe=await Promise.allSettled(['users/me','actor-tasks?limit=1'].map(async endpoint=>{
   if(!process.env.APIFY_API_TOKEN)return {endpoint,status:'missing'};
   const response=await fetch('https://api.apify.com/v2/'+endpoint,{headers:{Authorization:'Bearer '+process.env.APIFY_API_TOKEN},signal:AbortSignal.timeout(8000),redirect:'error'});
   return {endpoint,status:response.status};
  }));
  console.info(JSON.stringify({event:'bhs_qa_apify_connection',checks:probe.map(check=>check.status==='fulfilled'?check.value:{status:'unavailable'})}));
 }
 const started=Date.now();
 if(!managed)await db.ledger.once('qa:infrastructure-allowance',{case:caseName,scope:'One standard Preview build'},500,async()=>({reservedKurus:500}));
 // One build may complete the real sequential report. Individual provider
 // timeouts and the shared 50 TRY ledger still bind every operation; there is
 // no need to rebuild/retest merely because several valid reviews took 6 min.
 const deadline=Date.now()+20*60000;
 let phase='not_started',result;
 async function save(){
  const receipts=await db.receipts(),cost=await db.ledger.status(),payload={case:caseName,briefHash:briefHash(brief),phase,cost,receipts};
  if(!managed){
   const data=brotliCompressSync(Buffer.from(JSON.stringify(payload))).toString('base64');
   await writeFile(path.join(output,'bhs-sequential-checkpoint.json'),JSON.stringify({encoding:'br-base64',case:caseName,phase,cost,data}));
  }
  console.info(JSON.stringify({event:'bhs_v8_public_qa',phase,cost,completed:receipts.filter(r=>r.step_key.startsWith('audit:')&&r.state==='complete').length,paidReceipts:receipts.filter(r=>r.charge_kurus>0).length}));
 }
 try{
  for(phase of sequentialPhases.slice(0,managed?-1:-2)){
   if(Date.now()>=deadline)throw Object.assign(Error('QA build deadline reached; checkpoint retained.'),{code:'qa_deadline'});
   const budget=managed?await managedPhaseBudget({ledger:db.ledger,brief,phase,enabled:true}):{ledger:db.ledger};
   const providers=createSequentialProviders({ledger:budget.ledger,phase,fetchImpl:qaFetch,infrastructureOffsetKurus:managed?400:500,
    ...(managed?{collectionFirst:true,managedAudit:budget.managedAudit,managedBudgetVersion:budget.managedBudgetVersion,phaseLimitKurus:budget.phaseCeiling}:{})});
   const options={phase,brief,ledger:budget.ledger,providers,researchVersion:'v8',researchModel:'claude-sonnet-5-5',phaseCeiling:budget.phaseCeiling};
   if(managed)await runMeteredBhsPhase({id:'qa-'+caseName,phase,briefHash:briefHash(brief),researchVersion:'v8'},options,
    {meter:params=>meteredBhsStage({...params,region:'iad1'})});
   else await runBoundedStage(options);
   await save();
  }
  const synthesis=(await db.ledger.get(stageKey(brief,'synthesis','v8'))).value,audit=directAuditResult(brief,synthesis);
  result={case:caseName,status:audit.status==='ready'?'passed':'review',phase,cost:await db.ledger.status(),acceptance:audit.data.supervision.acceptance,audit,productionWrites:0};
 }catch(error){
  if(outage&&!error.code)console.info(JSON.stringify({event:'bhs_qa_unexpected',phase,name:error.name,location:error.stack?.split('\n').find(line=>line.includes('/offer-engine/src/'))?.trim()}));
  result={case:caseName,status:'blocked',phase,cost:await db.ledger.status(),code:error.code||'qa_failed',...(error.providerStatus?{providerStatus:error.providerStatus,providerOperation:error.providerOperation,providerReason:error.providerReason,parameterHints:error.parameterHints}:{}),...(error.validationDetail?{validationDetail:error.validationDetail}:{}),...(error.budgetDiagnostic?{budgetDetail:error.budgetDiagnostic}:{}),productionWrites:0};
 }finally{
  // The build allowance was reserved before the first paid stage; this is
  // an idempotent checkpoint and can never reset or add it a second time.
  if(!managed)await db.ledger.once('qa:infrastructure-allowance',{case:caseName,scope:'One standard Preview build'},500,async()=>({reservedKurus:500}));
  result.cost=await db.ledger.status();
  const rows=await db.receipts();
  const stagesToReview=new Set(['brand_review','brand','sector_review','sector','sector_validation','competition_review','competition','swot_review','swot','coverage_plan']);
  result.stageReviews=rows.filter(r=>r.state==='complete'&&stagesToReview.has(r.value?.phase)).map(r=>({phase:r.value.phase,decision:r.value.understandingDecision||r.value.decision,review:r.value.review,facts:r.value.facts,swot:r.value.swot}));
  result.costBreakdown={verifiedProviderAllowanceKurus:rows.filter(r=>r.value?.accountedKurus===r.charge_kurus&&r.value?.model||r.value?.accountedKurus===r.charge_kurus&&r.value?.credits!==undefined).reduce((n,r)=>n+r.charge_kurus,0),uncertainCommitmentKurus:rows.filter(r=>['reserved','uncertain'].includes(r.state)).reduce((n,r)=>n+r.charge_kurus,0),actorCommitmentKurus:rows.filter(r=>r.step_key.startsWith('apify:')).reduce((n,r)=>n+r.charge_kurus,0),infrastructureAllowanceKurus:1000};
  result.modelDiagnostics=rows.filter(r=>r.value?.rejectedOutput).map(r=>({model:r.value.model,role:r.value.role,rejection:r.value.rejectedOutput,usage:r.value.usage,committedKurus:r.charge_kurus}));
  if(managed){
    const stage=(name)=>rows.find(row=>row.state==='complete'&&row.step_key.startsWith('audit:'+name+':')&&row.value?.phase===name)?.value||{};
    const plan=stage('sector_sources').managedPlan;
    const reviewPhases=['coverage_sources','coverage_actors','coverage_discovery','coverage','report_draft'];
    const reviewBatches=reviewPhases.flatMap(phase=>stage(phase).reviews||[]);
    const reviewIssues=Object.fromEntries([...new Set(reviewBatches.map(batch=>batch.issue).filter(Boolean))].map(issue=>[issue,reviewBatches.filter(batch=>batch.issue===issue).length]));
    const reviewReceipts=rows.filter(row=>row.step_key.startsWith('model:')&&row.step_key.includes('managed-evidence'));
    console.info(JSON.stringify({event:'bhs_v8_qa_evidence_diagnostics',case:caseName,reviewIssues,modelIssues:reviewReceipts.filter(row=>row.value?.rejectedOutput||row.state==='uncertain').map(row=>({stage:row.step_key.split(':').slice(3,-1).join(':'),state:row.state,issue:row.value.rejectedOutput||row.value.code,providerStatus:row.value.providerStatus})),publishedFeedbackProofs:stage('competition_correction_draft').questionEvidence?.perception?.length||0}));
    const captures=['competition_draft','competition_review'].map(name=>{const value=stage(name);return {name,hints:value.peerHints?.length||0,pages:value.pages?.length||0,searches:value.searches?.length||0};});
    const drafts=rows.filter(row=>row.state==='complete'&&row.step_key.startsWith('audit:v8:checkpoint:managed-section-v3:')).map(row=>({section:row.value.section,kept:row.value.findings?.length,peers:row.value.peers?.length,returned:row.value.returned,rejected:row.value.rejected?.map(({quadrant,reason})=>[quadrant,reason])}));
    const acquisition=stage('sector_review');
    const scrapes=['competition_draft','competition_review','competition_correction_sources'].flatMap(phase=>stage(phase).scrapes||[]);
    console.info(JSON.stringify({event:'bhs_v8_qa_diagnostics',case:caseName,plannedPeers:plan?.peerNames?.length,captures,drafts,
     discovery:acquisition.discovery,reviewSources:acquisition.pages?.length,searchStatuses:acquisition.searches?.map(row=>row.providerStatus).filter(Boolean),
     scrapes:scrapes.map(({actor,status,reason,pages})=>({actor,status,reason,pages:pages?.length}))}));
   const {audit}=result;
   if(audit?.data){
    const data=audit.data;
    console.info(JSON.stringify({event:'bhs_v8_qa_content',case:caseName,peers:data.competitors?.map(({name,website})=>[name,website]),questionCoverage:data.supervision.questionCoverage}));
    for(const f of data.findings||[])console.info(JSON.stringify({event:'bhs_v8_qa_finding',case:caseName,section:f.bhsSection,quadrant:f.swotQuadrant,statement:f.statement,impact:f.impact,action:f.recommendation?.action,metric:f.recommendation?.measurement,source:data.sources.find(source=>source.id===f.sourceIds[0])?.url}));

   }
   for(const row of rows.filter(row=>row.state==='complete'&&Array.isArray(row.value?.commandResults))){
    console.info(JSON.stringify({event:'bhs_directed_qa_commands',case:caseName,phase:row.value.phase,peers:row.value.peers?.length,
     commands:row.value.commandResults.map(({command,reason,urls})=>[command.taskId,command.tool,command.country,command.limit,reason,urls.length])}));
   }
   const handoffs=rows.filter(row=>row.state==='complete'&&row.step_key.startsWith('model:bhs-v8:')&&row.step_key.includes(':v8-handoff:')&&!row.value.rejectedOutput&&!row.value.rejected)
    .map(row=>({stage:row.step_key.split(':').slice(5,-1).join(':'),model:row.value.model}));
   result={case:caseName,status:result.status,phase,code:result.code,providerStatus:result.providerStatus,providerOperation:result.providerOperation,
    providerReason:result.providerReason,parameterHints:result.parameterHints,validationDetail:result.validationDetail,
    elapsedSeconds:Math.round((Date.now()-started)/1000),cost:result.cost,
    reportIssue:audit?.data.supervision.reportIssue,sections:audit?.data.bhsSections?.map(({id,count,complete,missingQuadrants})=>({id,count,complete,missingQuadrants})),
    evidenceCoverage:audit?.data.supervision.evidenceCoverage,
    metricCoverage:audit?.data.supervision.metricCoverage?.map(({section,name,status})=>({section,name,status})),
    researchCostKurus:rows.find(row=>row.step_key.startsWith('audit:managed-synthesis-baseline:'))?.value?.chargedKurus,scopeSaved:rows.some(row=>row.step_key.startsWith('audit:scope:')&&row.state==='complete'),
    ...(outage?{outage,simulatedRejections,handoffs}:{}),productionWrites:0};
  }
  await save();await writeFile(path.join(output,'bhs-sequential-acceptance.json'),JSON.stringify(result));await db.close();
 }
 console.info(JSON.stringify({event:'bhs_v8_public_qa_finished',...Object.fromEntries(Object.entries(result).filter(([k])=>k!=='audit'))}));
 return result;
}
if(allowed())await runSequentialAcceptance();
