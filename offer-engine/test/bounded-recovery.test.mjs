import test from 'node:test';
import assert from 'node:assert/strict';
import {runBoundedStage,stageKey} from '../src/bhs/bounded-research.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {brief as raw} from './fixtures/bhs.mjs';
import {context,plan} from './fixtures/evidence.mjs';
import {normalized} from '../src/bhs/verify.mjs';
const brief=snapshotBrief(raw);
test('source normalization removes JSONB-incompatible null bytes and repairs broken Unicode',()=>{
 const value=normalized('SILVER\u0000LINE \ud800 bilgi');assert.equal(value,'SILVERLINE � bilgi');assert.equal(value.isWellFormed(),true);assert.ok(!JSON.stringify(value).includes('\\u0000'));
});
function enough(){const packet=context().packet;packet.sources.push(...packet.sources.map((s,i)=>({...s,id:'ev'+(i+5),url:s.url+'?document=2',finalUrl:s.finalUrl+'?document=2'})));return packet;}
function fixture(){const rows=new Map([[stageKey(brief,'source_plan'),{state:'complete',value:{plan,searches:[]}}]]);return {rows,ledger:{get:async k=>rows.get(k),once:async(k,_input,amount,run)=>{assert.equal(amount,0);const value=await run();rows.set(k,{state:'complete',value});return value;}}};}
test('sufficient actual evidence skips the recovery model and reuses the packet',async()=>{
 const {ledger}=fixture(),packet=enough();
 const providers={search:async query=>({query,results:[]}),generate:()=>assert.fail('no recovery model needed')};
 const input={brief,ledger,providers,collect:async()=>packet};
 const evidence=await runBoundedStage({...input,phase:'evidence'});assert.deepEqual(evidence.coverageIssues,[]);
 assert.equal((await runBoundedStage({...input,phase:'source_recovery'})).skipped,true);
 const ready=await runBoundedStage({...input,phase:'recovery_evidence'});assert.equal(ready.recoveryUsed,false);assert.equal(ready.packet,packet);
});
test('incomplete evidence is persisted and receives one separate plan/read recovery before synthesis',async()=>{
 const {ledger,rows}=fixture(),incomplete=context().packet;incomplete.sources=incomplete.sources.slice(0,2);let generations=0;
 const providers={search:async query=>({query,results:[]}),generate:async stage=>{assert.equal(stage,'source_recovery');generations++;return {data:plan,usage:{}};}};
 const evidence=await runBoundedStage({phase:'evidence',brief,ledger,providers,collect:async()=>incomplete});
 assert.ok(evidence.coverageIssues.length);assert.equal(rows.get(stageKey(brief,'evidence')).value.packet,incomplete);
 await runBoundedStage({phase:'source_recovery',brief,ledger,providers});
 const ready=await runBoundedStage({phase:'recovery_evidence',brief,ledger,providers,collect:async()=>enough()});
 assert.equal(generations,1);assert.equal(ready.recoveryUsed,true);assert.equal(ready.packet.sources.length,8);
 await assert.rejects(runBoundedStage({phase:'recovery_evidence',brief,ledger,providers,collect:async()=>incomplete}),e=>e.code==='evidence_coverage');
 assert.equal(generations,1);
});
