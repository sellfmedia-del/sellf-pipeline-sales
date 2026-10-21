import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeCompleteDirectReport,directAuditResult} from '../src/bhs/direct-report.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';

test('the recorded One More provider response recovers all 24 areas without regenerating research',()=>{
 const raw=JSON.parse(readFileSync(new URL('./fixtures/one-more-recorded-report.json',import.meta.url),'utf8')),before=structuredClone(raw);
 const report=normalizeCompleteDirectReport(raw),brief=snapshotBrief({brandName:'One More Global',website:'https://onemoreglobalinc.com/',segment:'corporate',goals:'ABD pazarında perakende büyümesi.',needs:'MLM satışlarından perakende kanalına geçiş.',services:'Growth ve dijital operasyon kapsamı.',meetingNotes:'Sentetik tekrar testi; yeni müşteri beyanı değildir.',budget:null});
 const result=directAuditResult(brief,{report});
 assert.equal(result.status,'ready');assert.deepEqual(result.data.quality.methodologyCoverage,{expected:24,present:24});assert.deepEqual(raw,before);
 assert.deepEqual(report.findings,raw.findings);assert.deepEqual(report.sources,raw.sources);assert.deepEqual(report.dimensions,raw.dimensions);assert.deepEqual(report.originalReport.benchmarks,raw.benchmarks);
 assert.equal(report.researchCoverage.find(a=>a.topic==='Awareness: içerik, reklam ve organik erişim').status,'unavailable');
});
