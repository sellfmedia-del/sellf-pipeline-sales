import test from 'node:test';
import assert from 'node:assert/strict';
import {runBoundedStage,stageKey} from '../src/bhs/bounded-research.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {brief as raw} from './fixtures/bhs.mjs';
import {context,plan} from './fixtures/evidence.mjs';
import {normalized} from '../src/bhs/verify.mjs';
import {focusEvidence,boundedReportSchema,compactReportSchema,hydrateReport} from '../src/bhs/bounded-contract.mjs';
import {providerSchema} from '../src/bhs/schema.mjs';
const brief=snapshotBrief(raw);
test('source normalization removes JSONB-incompatible null bytes and repairs broken Unicode',()=>{
 const value=normalized('SILVER\u0000LINE \ud800 bilgi');assert.equal(value,'SILVERLINE � bilgi');assert.equal(value.isWellFormed(),true);assert.ok(!JSON.stringify(value).includes('\\u0000'));
});
test('generation grammar enforces coverage and binds all references to read evidence',()=>{
 const packet=enough(),focused=focusEvidence(packet,brief),schema=providerSchema(boundedReportSchema(focused),{arrayBounds:true});
 assert.equal(schema.properties.findings.minItems,12);assert.equal(schema.properties.findings.maxItems,12);
 assert.equal(schema.properties.sources.minItems,8);assert.equal(schema.properties.competitors.minItems,3);
 assert.deepEqual(schema.properties.sources.items.properties.id.enum,focused.sources.map(x=>x.id));
 assert.ok(!schema.properties.sources.items.properties.id.enum.includes('invented'));
 assert.ok(focused.sources.every(s=>s.excerpts.length<=4));
 assert.deepEqual(schema.properties.findings.items.properties.sourceIds.items.enum,focused.sources.map(x=>x.id));
});
function enough(){const packet=context().packet;packet.sources.push(...packet.sources.map((s,i)=>({...s,id:'ev'+(i+5),url:s.url+'?document=2',finalUrl:s.finalUrl+'?document=2'})));return packet;}
test('compact report restores only verified metadata and leaves unmeasured benchmarks unknown',()=>{
 const packet=enough(),source=packet.sources[0],peer=packet.entities.find(x=>x.role==='competitor');
 const schema=compactReportSchema(packet);assert.equal(schema.properties.sources.items.properties.url,undefined);
 const value={sources:[{id:source.id}],competitors:[{id:peer.id}],findings:[{statement:'Kanıtlı bulgu'}],benchmarks:[]};
 const report=hydrateReport(value,packet);
 assert.equal(report.sources[0].url,source.finalUrl);assert.equal(report.competitors[0].website,peer.website);
 assert.equal(report.benchmarks.length,8);assert.ok(report.benchmarks.every(x=>x.entries.every(e=>e.value===null&&e.sourceIds.length===0)));
 assert.equal(value.sources[0].url,undefined);
 assert.throws(()=>hydrateReport({...value,sources:[{id:'invented'}]},packet));
});
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
