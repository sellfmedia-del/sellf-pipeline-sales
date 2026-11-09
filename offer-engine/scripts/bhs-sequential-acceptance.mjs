import {writeFile,mkdir} from 'node:fs/promises';
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

const project='prj_B6Q6FIgq9NjbBlb6ga03cn6PD3jJ';
const allowed=()=>process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_PROJECT_ID===project&&/^[a-f0-9]{40}$/.test(process.env.OFFER_BHS_QA_COMMIT||'')&&process.env.OFFER_BHS_QA_COMMIT===process.env.VERCEL_GIT_COMMIT_SHA&&process.env.OFFER_BHS_QA_CASE==='humm';
export async function runSequentialAcceptance(){
 if(!allowed())return {status:'not_requested'};
 const brief=snapshotBrief({brandName:'Humm Organic',website:'https://humm.com.tr/',segment:'kobi',goals:'Türkiye pazarında sürdürülebilir ve kârlı büyüme.',needs:'Marka, sektör, rekabet ve müşteri geri bildirimleri üzerinden kaynaklı darboğaz araştırması.',services:'Büyüme danışmanlığı ve dijital pazarlama',meetingNotes:'Kamuya açık marka için sentetik kabul testi; gerçek CRM, müşteri veya satış verisi kullanılmıyor.'});
 let seed;
 const seedData=process.env.OFFER_BHS_QA_SEED_URL?await fetchQaCheckpoint(process.env.OFFER_BHS_QA_SEED_URL):process.env.OFFER_BHS_QA_SEED;
 if(seedData){
  const payload=JSON.parse(brotliDecompressSync(Buffer.from(seedData,'base64'),{maxOutputLength:12000000}).toString('utf8'));
  if(payload.briefHash!==briefHash(brief)||payload.case!=='humm')throw Error('QA checkpoint belongs to another brief.');seed=payload.receipts;
 }
 const db=await localBudget({lead:'public-humm-v8',seed}),output=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');await mkdir(output,{recursive:true});
 await db.ledger.once('qa:infrastructure-allowance',{case:'humm',scope:'One standard Preview build'},500,async()=>({reservedKurus:500}));
 const deadline=Date.now()+6*60000;
 let phase='not_started',result;
 async function save(){
  const receipts=await db.receipts(),cost=await db.ledger.status(),payload={case:'humm',briefHash:briefHash(brief),phase,cost,receipts};
  const data=brotliCompressSync(Buffer.from(JSON.stringify(payload))).toString('base64');
  await writeFile(path.join(output,'bhs-sequential-checkpoint.json'),JSON.stringify({encoding:'br-base64',case:'humm',phase,cost,data}));
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
  result={case:'humm',status:audit.status==='ready'?'passed':'review',phase,cost:await db.ledger.status(),acceptance:audit.data.supervision.acceptance,audit,productionWrites:0};
 }catch(error){
  result={case:'humm',status:'blocked',phase,cost:await db.ledger.status(),code:error.code||'qa_failed',...(error.providerStatus?{providerStatus:error.providerStatus,providerReason:error.providerReason,parameterHints:error.parameterHints}:{}),...(error.validationDetail?{validationDetail:error.validationDetail}:{}),...(error.budgetDiagnostic?{budgetDetail:error.budgetDiagnostic}:{}),productionWrites:0};
 }finally{
  // The build allowance was reserved before the first paid stage; this is
  // an idempotent checkpoint and can never reset or add it a second time.
  await db.ledger.once('qa:infrastructure-allowance',{case:'humm',scope:'One standard Preview build'},500,async()=>({reservedKurus:500}));
  result.cost=await db.ledger.status();
  await save();await writeFile(path.join(output,'bhs-sequential-acceptance.json'),JSON.stringify(result));await db.close();
 }
 console.info(JSON.stringify({event:'bhs_v8_public_qa_finished',...Object.fromEntries(Object.entries(result).filter(([k])=>k!=='audit'))}));
 return result;
}
if(allowed())await runSequentialAcceptance();
