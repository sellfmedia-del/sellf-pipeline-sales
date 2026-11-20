import {writeFile} from 'node:fs/promises';
import {brotliDecompressSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {localBudget} from '../test/fixtures/local-budget.mjs';
import {createConversationProviders} from '../src/bhs/conversation-providers.mjs';
import {conversationAuditResult,validateConversationReport} from '../src/bhs/conversation-report.mjs';
import {advanceConversation,persistConversationResult} from '../src/bhs/conversation-engine.mjs';
import {conversationKeys} from '../src/bhs/conversation-contract.mjs';

// Explicit one-deployment acceptance of an already purchased source archive.
// Never called on production or an ordinary build. No database or CRM access.
const env=process.env;
if(env.VERCEL_ENV!=='preview'||env.OFFER_BHS_FINAL_QA_APPROVED!=='true'||
 env.VERCEL_GIT_COMMIT_SHA!==env.OFFER_BHS_FINAL_QA_COMMIT||
 !/^[a-f0-9]{40}$/.test(env.OFFER_BHS_FINAL_QA_COMMIT||''))throw Error('Final QA not authorized for this deployment.');
const raw=brotliDecompressSync(Buffer.from(env.OFFER_BHS_FINAL_QA_SEED||'','base64'),{maxOutputLength:800000});
if(createHash('sha256').update(raw).digest('hex')!==env.OFFER_BHS_FINAL_QA_SEED_SHA)throw Error('Final QA seed mismatch.');
const seed=JSON.parse(raw);
if(seed.runId!=='a02ee33d-1e50-4644-aaaa-d0e92d22298e'||seed.brief.website!=='https://dokucosmetics.com/'||
 !Number.isSafeInteger(seed.committedKurus)||seed.committedKurus<500||seed.committedKurus>2775||seed.turns?.length!==5||!/^[a-f0-9]{64}$/.test(seed.checkpointHash||''))
 throw Error('Unapproved retained-source QA context.');
const db=await localBudget({lead:'retained-final-'+seed.runId});
// Keep the original run's full commitment, including its existing base reserve.
await db.ledger.once('qa:prior-commitment',{originJob:seed.originJob,runId:seed.runId},seed.committedKurus-500,
 async()=>({priorCommittedKurus:seed.committedKurus,scope:'retained original research; no refund or budget reset'}));
// Existing project uses Enhanced builds: $0.030/min. Ten minutes at 60 TRY/USD,
// tax and FX allowance fit in 22.25 TRY. Reserve before any provider dispatch.
await db.ledger.once('qa:build-allowance',{scope:'One approved Enhanced preview build, ten-minute envelope'},2225,
 async()=>({reservedKurus:2225,scope:'conservative build commitment'}));
for(const turn of seed.turns)await db.ledger.once(conversationKeys.turn(seed.checkpointHash,turn.index),
 {originJob:seed.originJob,index:turn.index},0,async()=>turn);
const started=Date.now(),deadline=started+200000;
const providers=createConversationProviders({ledger:db.ledger,executionDeadline:deadline,
 fetchImpl:(url,init)=>{
  if(init?.method==='POST'&&!String(url).startsWith('https://api.anthropic.com/v1/messages'))throw Error('Final QA cannot purchase research or another model.');
  return fetch(url,init);
 }});
let reason;
try{
 for(let attempt=0;attempt<2;attempt++){
  const turn=await advanceConversation({brief:seed.brief,ledger:db.ledger,id:seed.checkpointHash,providers,deadline});
  if(turn.closed){reason=turn.reason;break;}
 }
}catch(error){reason=error.code||'qa_failed';}
const stored=await persistConversationResult({brief:seed.brief,ledger:db.ledger,id:seed.checkpointHash,reason});
const issues=stored.conversationReport?validateConversationReport(stored.conversationReport,stored.conversationSources):['report_unavailable'];
const cost=await db.ledger.status();
const audit=conversationAuditResult(seed.brief,stored,{reason:stored.reason});
const result={kind:'retained-source-final-acceptance',runId:seed.runId,originJob:seed.originJob,
 status:audit.data.quality.contentComplete?'complete':'review',reason,issues,
 priorCommittedKurus:seed.committedKurus,buildReserveKurus:2225,cost,
 elapsedSeconds:Math.round((Date.now()-started)/1000),newResearchCalls:0,productionWrites:0,
 semanticReview:'pending',audit};
// Preserve inspectable paid output even if schema validation fails. Opaque
// thinking/signatures stay private; ordinary and production builds remove this.
const receipts=(await db.receipts()).filter(row=>row.step_key.startsWith('model:')).map(row=>({
 key:row.step_key,state:row.state,chargedKurus:row.charge_kurus,stopReason:row.value?.stopReason,usage:row.value?.usage,
 content:row.value?.content?.filter(block=>['text','tool_use'].includes(block.type))}));
await writeFile('public/bhs-final-receipts.json',JSON.stringify(receipts));
await writeFile('public/bhs-final-acceptance.json',JSON.stringify(result));
await writeFile('public/bhs-final-report.md',audit.data.fullReport);
console.info(JSON.stringify({event:'bhs_retained_final_qa',status:result.status,reason,issues,cost,
 elapsedSeconds:result.elapsedSeconds,newResearchCalls:0,productionWrites:0}));
await db.close();
