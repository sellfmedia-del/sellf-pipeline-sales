import test from 'node:test';
import assert from 'node:assert/strict';
import {groundOfferReport,validateGroundedOutput} from '../src/bhs/source-gate.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {context} from './fixtures/evidence.mjs';
import {brief} from './fixtures/bhs.mjs';
import {methodologyAreas} from '../src/bhs/methodology-areas.mjs';
function good(){const c=context();c.report.researchCoverage=Object.fromEntries(methodologyAreas.map(a=>[a.key,{status:'observed',observation:'Kaynakta bayi ağı gözlemi.',sourceIds:['ev1']}]));return c;}
test('read sources and literal quotes retain all methodology areas and the original findings without an AI reviewer',()=>{
 const c=good(),before=structuredClone(c.report),r=groundOfferReport(c.report,c);
 assert.equal(r.sources.length,4);assert.equal(r.findings.length,6);assert.equal(r.researchCoverage.length,24);
 assert.equal(r.researchCoverage.filter(a=>a.status==='observed').length,24);assert.deepEqual(r.findings,c.report.findings);assert.deepEqual(c.report,before);
 assert.ok(r.sources.every(s=>s.verification.status==='quote_matched'));assert.doesNotThrow(()=>validateGroundedOutput(c.report,c));
 const audit=directAuditResult(brief,{report:c.report,analysisPacket:c.packet});assert.equal(audit.data.quality.scope,'read-source-and-quote-filter');
});
test('fabricated URLs, fabricated quotes and unsupported numbers cannot reach a document or survive repeated normalization',()=>{
 for(const mutate of [c=>c.report.sources[0].url='https://invented.example/',c=>c.report.sources[0].quote='An invented financial statement not present in the read source.',c=>c.report.findings[0].statement='Revenue grew 999999 percent.']){
  const c=good();mutate(c);const before=structuredClone(c.report);assert.throws(()=>validateGroundedOutput(c.report,c),e=>Boolean(e.safeData));
  const audit=directAuditResult(brief,{report:c.report,analysisPacket:c.packet});assert.ok(!audit.data.findings.some(f=>f.statement.includes('999999')));
  assert.ok(!audit.data.sources.some(s=>s.url.includes('invented')));assert.equal(audit.data.quality.contentComplete,false);assert.deepEqual(c.report,before);
  const again=groundOfferReport(audit.data.report,c);assert.deepEqual(again.findings,audit.data.findings);
 }
});
test('disjoint source excerpts cannot be stitched into a fabricated quotation',()=>{
 const c=good();c.packet.sources[0].excerpts=[{text:'A separate first paragraph with unrelated data.',offset:0},{text:'Another unrelated later paragraph in the document.',offset:1000}];
 c.report.sources[0].quote='unrelated data. Another unrelated later paragraph';
 assert.ok(!groundOfferReport(c.report,c).sources.some(s=>s.id==='ev1'));
});
test('search snippets remain labelled partial evidence and an absent packet cannot authorize facts or scores',()=>{
 const c=good(),record=c.packet.sources[0],snippet={url:record.url,title:record.title,content:record.excerpts[0].text};
 c.packet.sources=[];c.searchEvidence=[{results:[snippet]}];const r=groundOfferReport(c.report,c);
 assert.equal(r.sources.length,1);assert.match(r.sources[0].scope,/tam sayfa okunmuş değildir/);
 const unknown=directAuditResult(brief,{report:c.report});assert.equal(unknown.data.findings.length,0);assert.equal(unknown.data.sources.length,0);assert.equal(unknown.data.scoring.total,null);
 assert.ok(unknown.data.dimensions.every(d=>d.score===null));assert.match(unknown.data.rawReport,/## 9. Kaynaklar/);
});

test('numbers must match whole signed tokens, not substrings of another value or year',()=>{
 const c=good();c.packet.sources[0].excerpts=[{offset:0,text:'The company had 1000 users and a -10 percent decline in 2026.'}];c.report.sources[0].quote=c.packet.sources[0].excerpts[0].text;
 c.report.findings[0].statement='The company had 10 users.';c.report.findings[1].statement='Growth was +10 percent.';
 const r=groundOfferReport(c.report,c);assert.ok(!r.findings.some(f=>['f0','f1'].includes(f.id)));
});
