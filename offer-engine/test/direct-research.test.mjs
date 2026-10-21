import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {phases,stageKey,runBoundedStage,seedQueries} from '../src/bhs/direct-research.mjs';
import {directAuditResult,directResearchInstruction} from '../src/bhs/direct-report.mjs';
import {assertResult} from '../src/contracts.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {brief as raw} from './fixtures/bhs.mjs';
import {context,plan} from './fixtures/evidence.mjs';
const brief=snapshotBrief(raw);
function cachedLedger(){const rows=new Map();return {rows,ledger:{get:async k=>rows.get(k),once:async(k,_input,amount,run)=>{assert.equal(amount,0);if(rows.get(k)?.state==='complete')return rows.get(k).value;const value=await run();rows.set(k,{state:'complete',value});return value;}}};}
test('approved BHS methodology reaches Pro verbatim and the deployed flow has no reviewer or recovery loop',()=>{
 const original=readFileSync(new URL('../src/bhs/methodology.txt',import.meta.url),'utf8');
 assert.ok(directResearchInstruction().includes(original));assert.deepEqual(phases,['source_plan','evidence','synthesis','scope','complete']);
 assert.equal(seedQueries(brief).length,8);assert.ok(seedQueries(brief).every(q=>q.length<=500&&!q.includes(brief.meetingNotes)));
});
test('discovery searches start together and source limitations do not start a second audit',async()=>{
 const {ledger}=cachedLedger(),{packet,report}=context(),generated=[];let release,started=0;
 const pending=new Promise(r=>release=r);
 const providers={search:async query=>{started++;await pending;return {query,results:[]};},generate:async(stage,input,_schema,options)=>{
  generated.push(stage);
  if(stage==='source_plan')return {data:plan};
  if(stage==='synthesis'){assert.ok(input.instruction.includes('ÖN BHS HESAPLAMA'));assert.equal(options.model,'gemini-3.1-pro-preview');return {data:report,usage:{},model:options.model};}
  assert.fail('no extra reviewer or recovery model');
 }};
 const planning=runBoundedStage({phase:'source_plan',brief,ledger,providers});await new Promise(r=>setImmediate(r));assert.equal(started,2);release();await planning;
 packet.unavailable=[{url:plan.entities[1].website,reason:'HTTP_403'}];
 await runBoundedStage({phase:'evidence',brief,ledger,providers,collect:async()=>packet});assert.equal(started,14);
 const synthesis=await runBoundedStage({phase:'synthesis',brief,ledger,providers});assert.deepEqual(synthesis.report,report);assert.deepEqual(generated,['source_plan','synthesis']);
});
test('handoff preserves complete model JSON without semantic approval, recomputes only weighted arithmetic, and rejects unsafe URLs',()=>{
 const {report}=context();report.competitors[0].scaleReason='Kamuya açık ciro verisi bu kaynakta yer almamaktadır.';
 report.dimensions.forEach(d=>d.score=60);const before=structuredClone(report),result=directAuditResult(brief,{report});
 assert.equal(result.status,'ready');assert.equal(result.data.scoring.total,60);assert.deepEqual(result.data.report,before);assert.deepEqual(report,before);
 assert.equal(result.data.quality.scope,'json-format-only');assert.equal(result.data.quality.semanticBenchmark,'not_requested');assertResult('audit',result);
 assert.ok(result.data.rawReport.includes('## 9. Kaynaklar'));assert.ok(result.data.rawReport.includes('Ön BHS: 60/100'));
 report.sources[0].url='javascript:alert(1)';assert.throws(()=>directAuditResult(brief,{report}),/bağlantı/);
});
test('same card reuses the completed paid report without invoking a model again',async()=>{
 const {ledger,rows}=cachedLedger(),stored={report:context().report,model:'stored-pro'};
 rows.set(stageKey(brief,'synthesis'),{state:'complete',value:stored});
 const result=await runBoundedStage({phase:'synthesis',brief,ledger,providers:{generate:()=>assert.fail('must reuse paid report')}});
 assert.deepEqual(result,stored);assert.equal(directAuditResult(brief,result).status,'ready');
});

test('new research reuses paid historical discovery, reads essential pages once, and preserves the old report version',async()=>{
 const {ledger,rows}=cachedLedger(),{packet}=context();
 rows.set(stageKey(brief,'source_plan','v3'),{state:'complete',value:{plan,searches:[]}});
 rows.set(stageKey(brief,'evidence','v3'),{state:'complete',value:{packet,searches:[]}});
 let extracted=0;const providers={search:()=>assert.fail('no repeated searches'),generate:()=>assert.fail('no repeated planner'),extract:async urls=>{extracted++;assert.equal(urls[0],brief.website);assert.equal(urls.length,4);return {pages:[{url:brief.website,text:'Official products, customer delivery and subscription terms. '.repeat(4)}]};}};
 await runBoundedStage({phase:'source_plan',brief,ledger,providers});const result=await runBoundedStage({phase:'evidence',brief,ledger,providers});assert.equal(extracted,1);assert.ok(result.packet.sources.some(s=>s.method==='extracted'));assert.deepEqual(rows.get(stageKey(brief,'evidence','v3')).value.packet,packet);
 assert.notEqual(stageKey(brief,'synthesis','v3'),stageKey(brief,'synthesis','v4'));
});
