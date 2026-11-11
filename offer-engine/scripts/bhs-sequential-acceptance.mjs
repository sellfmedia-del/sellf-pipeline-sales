import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {brotliCompressSync,brotliDecompressSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {sequentialPhases} from '../src/bhs/sequential-contracts.mjs';
import {createSequentialProviders} from '../src/bhs/sequential-providers.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {localBudget} from '../test/fixtures/local-budget.mjs';
import {fetchQaCheckpoint} from './qa-checkpoint.mjs';
import {sequentialQaRequested} from './qa-acceptance-gate.mjs';

const caseName=process.env.OFFER_BHS_QA_CASE;
const allowed=sequentialQaRequested;
export async function runSequentialAcceptance(){
 if(!allowed())return {status:'not_requested'};
 const selected={est:{brandName:'Eyüp Sabri Tuncer',website:'https://www.eyupsabrituncer.com/',segment:'corporate'},tadim_final:{brandName:'Tadım',website:'https://www.tadim.com.tr/',segment:'corporate'},tadim_release:{brandName:'Tadım',website:'https://www.tadim.com.tr/',segment:'corporate'},tadim:{brandName:'Tadım',website:'https://www.tadim.com.tr/',segment:'corporate'},humm:{brandName:'Humm Organic',website:'https://humm.com.tr/',segment:'kobi'},muratbey:{brandName:'Muratbey',website:'https://www.muratbey.com.tr/',segment:'corporate'},sutas:{brandName:'Sütaş',website:'https://www.sutas.com.tr/',segment:'corporate'},duru:{brandName:'Duru Bulgur',website:'https://www.durubulgur.com/tr',segment:'corporate'}}[caseName];
 const brief=snapshotBrief({...selected,goals:'Türkiye pazarında sürdürülebilir ve kârlı büyüme.',needs:'Marka, sektör, rekabet ve müşteri geri bildirimleri üzerinden kaynaklı darboğaz araştırması.',services:'Büyüme danışmanlığı ve dijital pazarlama',meetingNotes:'Kamuya açık marka için sentetik kabul testi; gerçek CRM, müşteri veya satış verisi kullanılmıyor.'});
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
 await db.ledger.once('qa:infrastructure-allowance',{case:caseName,scope:'One standard Preview build'},500,async()=>({reservedKurus:500}));
 // One build may complete the real sequential report. Individual provider
 // timeouts and the shared 50 TRY ledger still bind every operation; there is
 // no need to rebuild/retest merely because several valid reviews took 6 min.
 const deadline=Date.now()+20*60000;
 let phase='not_started',result;
 async function save(){
  const receipts=await db.receipts(),cost=await db.ledger.status(),payload={case:caseName,briefHash:briefHash(brief),phase,cost,receipts};
  const data=brotliCompressSync(Buffer.from(JSON.stringify(payload))).toString('base64');
  await writeFile(path.join(output,'bhs-sequential-checkpoint.json'),JSON.stringify({encoding:'br-base64',case:caseName,phase,cost,data}));
  console.info(JSON.stringify({event:'bhs_v8_public_qa',phase,cost,completed:receipts.filter(r=>r.step_key.startsWith('audit:')&&r.state==='complete').length,paidReceipts:receipts.filter(r=>r.charge_kurus>0).length}));
 }
 try{
  for(phase of sequentialPhases.slice(0,-2)){
   if(Date.now()>=deadline)throw Object.assign(Error('QA build deadline reached; checkpoint retained.'),{code:'qa_deadline'});
   const providers=createSequentialProviders({ledger:db.ledger,phase,infrastructureOffsetKurus:500});
   await runBoundedStage({phase,brief,ledger:db.ledger,providers,researchVersion:'v8',researchModel:'claude-sonnet-5-5'});
   await save();
  }
  const synthesis=(await db.ledger.get(stageKey(brief,'synthesis','v8'))).value,audit=directAuditResult(brief,synthesis);
  result={case:caseName,status:audit.status==='ready'?'passed':'review',phase,cost:await db.ledger.status(),acceptance:audit.data.supervision.acceptance,audit,productionWrites:0};
 }catch(error){
  result={case:caseName,status:'blocked',phase,cost:await db.ledger.status(),code:error.code||'qa_failed',...(error.providerStatus?{providerStatus:error.providerStatus,providerReason:error.providerReason,parameterHints:error.parameterHints}:{}),...(error.validationDetail?{validationDetail:error.validationDetail}:{}),...(error.budgetDiagnostic?{budgetDetail:error.budgetDiagnostic}:{}),productionWrites:0};
 }finally{
  // The build allowance was reserved before the first paid stage; this is
  // an idempotent checkpoint and can never reset or add it a second time.
  await db.ledger.once('qa:infrastructure-allowance',{case:caseName,scope:'One standard Preview build'},500,async()=>({reservedKurus:500}));
  result.cost=await db.ledger.status();
  const rows=await db.receipts();
  const stagesToReview=new Set(['brand_review','brand','sector_review','sector','sector_validation','competition_review','competition','swot_review','swot','coverage_plan']);
  result.stageReviews=rows.filter(r=>r.state==='complete'&&stagesToReview.has(r.value?.phase)).map(r=>({phase:r.value.phase,decision:r.value.understandingDecision||r.value.decision,review:r.value.review,facts:r.value.facts,swot:r.value.swot}));
  result.costBreakdown={verifiedProviderAllowanceKurus:rows.filter(r=>r.value?.accountedKurus===r.charge_kurus&&r.value?.model||r.value?.accountedKurus===r.charge_kurus&&r.value?.credits!==undefined).reduce((n,r)=>n+r.charge_kurus,0),uncertainCommitmentKurus:rows.filter(r=>['reserved','uncertain'].includes(r.state)).reduce((n,r)=>n+r.charge_kurus,0),actorCommitmentKurus:rows.filter(r=>r.step_key.startsWith('apify:')).reduce((n,r)=>n+r.charge_kurus,0),infrastructureAllowanceKurus:1000};
  result.modelDiagnostics=rows.filter(r=>r.value?.rejectedOutput).map(r=>({model:r.value.model,role:r.value.role,rejection:r.value.rejectedOutput,usage:r.value.usage,committedKurus:r.charge_kurus}));
  await save();await writeFile(path.join(output,'bhs-sequential-acceptance.json'),JSON.stringify(result));await db.close();
 }
 console.info(JSON.stringify({event:'bhs_v8_public_qa_finished',...Object.fromEntries(Object.entries(result).filter(([k])=>k!=='audit'))}));
 return result;
}
if(allowed())await runSequentialAcceptance();
