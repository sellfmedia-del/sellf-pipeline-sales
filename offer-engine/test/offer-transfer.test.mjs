import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {directAuditResult,normalizeCompleteDirectReport} from '../src/bhs/direct-report.mjs';
import {readPartialOutput} from '../src/bhs/partial-output.mjs';
import {selectProposalAudit} from '../src/proposal/audit-selection.mjs';
import {pricingEngine} from '../src/engines/pricing-engine.mjs';
import {proposalEngine} from '../src/engines/proposal-engine.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {assertResult} from '../src/contracts.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {context} from './fixtures/evidence.mjs';
import {brief as rawBrief} from './fixtures/bhs.mjs';
import {fallbackScope,validateScope} from '../src/pricing/scope.mjs';
const brief=snapshotBrief({...rawBrief,services:'Meta ve Google Ads'});

test('both actual One More failures survive transfer and keep original evidence and unverified observations',()=>{
 for(const file of ['one-more-recorded-report.json','one-more-fresh-report.json']){
  const raw=JSON.parse(readFileSync(new URL('./fixtures/'+file,import.meta.url))),before=structuredClone(raw);
  const report=normalizeCompleteDirectReport(raw),audit=directAuditResult(brief,{report}),selected=selectProposalAudit(audit.data,brief);
  assertResult('audit',audit);assert.equal(audit.status,'ready');assert.equal(audit.data.dimensions.length,6);assert.equal(audit.data.researchCoverage.length,24);
  assert.deepEqual(audit.data.originalReport,raw);assert.deepEqual(raw,before);assert.equal(audit.data.quality.contentComplete,false);
  const failingArea=file.includes('fresh')?'Sitede gelişmiş performans':'Ad Library';
  const area=selected.dimensions.flatMap(d=>d.highlights).find(h=>h.text.includes(failingArea));assert.ok(area);assert.equal(area.verification,'unverified');assert.deepEqual(area.sourceIds,[]);
  assert.equal(audit.data.findings.length,raw.findings.length);assert.equal(audit.data.benchmarks.length,raw.benchmarks.length);
  assert.ok(audit.data.sources.every(s=>!s.url.includes('...')));
 }
});

test('missing and malformed report shapes produce an honest consumable offer without inventing scores or measured facts',async()=>{
 const cases=[null,{},[],{findings:'bad',sources:[],dimensions:[]},{summary:42,researchCoverage:{digital_2:{status:'observed',observation:'Ölçülmemiş iddia.',sourceIds:['fake']}}},
  {...context().report,findings:[null,{id:'x',statement:'Doğrulanmamış bulgu',sourceIds:['unknown']}],sources:[{id:'unknown',url:'javascript:alert(1)'}],dimensions:[{id:'digital',score:101,strengths:null,gaps:{}}]}];
 for(const raw of cases){
  const before=structuredClone(raw),audit={stage:'audit',...directAuditResult(brief,{report:raw})};assertResult('audit',audit);
  assert.deepEqual(raw,before);assert.deepEqual(audit.data.originalReport,raw??{});assert.equal(audit.data.researchCoverage.length,24);assert.equal(audit.data.dimensions.length,6);assert.equal(audit.data.scoring.total,null);
  assert.ok(audit.data.dimensions.every(d=>d.score===null));assert.ok(audit.data.findings.every(f=>f.sourceIds.length===0));
  const scope={summary:'Briefte konuşulan kapsam.',budget:{posture:'unspecified',quote:null,targetQuote:null,targetScope:'unspecified'},services:[{serviceId:'meta',phase:'start',priority:1,reason:'Briefte konuşulan kanal.',briefQuote:brief.services,findingIds:[]}],exclusions:[]};
  const pricing={stage:'pricing',...await pricingEngine.run({brief,scope},{audit})};assertResult('pricing',pricing);
  const logo={stage:'logo',status:'review',data:{generated:false,candidates:[{image:'data:image/png;base64,AAA',quality:{transparency:true,matteStable:true,touchesEdge:false,changedSolid:0}}]}};
  const proposal=await proposalEngine.run({brief,copy:null},{audit,pricing,logo});assertResult('proposal',proposal);assert.equal(proposal.data.alternatives.length,2);assert.ok(proposal.data.alternatives.every(a=>a.monthlyAmount>0));
 }
});

test('partial JSON recovers only completed top-level values, preserving all original truncated text',()=>{
 const raw='{"summary":"Mevcut özet.","findings":[{"statement":"Mevcut bulgu."}],"sources":[{"url":"https://exa';
 const result=readPartialOutput(raw);assert.equal(result.data.summary,'Mevcut özet.');assert.equal(result.data.findings.length,1);assert.equal(result.data.sources,undefined);assert.equal(result.originalText,raw);
 assert.deepEqual(readPartialOutput('```json\n{"summary":"Tam özet."}\n```').data,{summary:'Tam özet.'});
 assert.equal(readPartialOutput('not JSON').data.summary,undefined);
 assert.deepEqual(readPartialOutput('{"findings":[{"statement":"Tam bulgu."},{"statement":"Eksik').data.findings,[{statement:'Tam bulgu.'}]);
 assert.equal({}.polluted,undefined);assert.equal(Object.hasOwn(readPartialOutput('{"__proto__":{"polluted":true},"summary":"a","bad":').data,'__proto__'),false);
});

test('deterministic fallback survives price-boundary revalidation but an untrusted fallback flag cannot authorize invented services',()=>{
 const audit={findings:[]},plan=fallbackScope(brief);assert.deepEqual(validateScope(plan,brief,audit),plan);
 assert.throws(()=>validateScope({...plan,services:[{serviceId:'invented'}]},brief,audit));
});

test('a malformed paid scope/copy response falls back once and still reaches priced proposal assembly',async()=>{
 const report=normalizeCompleteDirectReport(context().report),rows=new Map([[stageKey(brief,'synthesis','v5'),{state:'complete',value:{report}}]]);let calls=0;
 const ledger={get:async k=>rows.get(k),once:async(k,_input,amount,run)=>{assert.equal(amount,0);if(rows.has(k))return rows.get(k).value;const value=await run();rows.set(k,{state:'complete',value});return value;}};
 const providers={generate:async()=>{calls++;return {data:{scope:{services:[{serviceId:'invented'}]},copy:{headline:'Garantili %100 sonuç'}}};}};
 const input={phase:'scope',brief,ledger,providers,researchVersion:'v5'},scope=await runBoundedStage(input);await runBoundedStage(input);assert.equal(calls,1);
 const audit={stage:'audit',...directAuditResult(brief,{report})},pricing=await pricingEngine.run({brief,scope:scope.scopePlan},{audit});assertResult('pricing',pricing);assert.ok(pricing.data.scope.selected.some(s=>s.serviceId==='meta'));
 assert.equal(scope.proposalCopy.headline,'Net hedefler.');assert.equal(scope.proposalCopy.findingIds.length,0);
});

test('well formed paid content and long research remain unchanged through repeated projection',()=>{
 const raw=context().report;raw.summary='Ayrıntılı araştırma. '.repeat(1800);raw.researchCoverage={};
 const result=normalizeCompleteDirectReport(raw),again=normalizeCompleteDirectReport(result);
 assert.equal(result.summary,raw.summary);assert.deepEqual(result.findings,raw.findings);assert.deepEqual(result.benchmarks,raw.benchmarks);assert.deepEqual(again,result);assert.deepEqual(result.originalReport,raw);
});
