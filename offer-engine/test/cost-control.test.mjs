import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reusableResearch,researchCacheKey} from '../src/bhs/reuse.mjs';
import {consumedModel,consumedSearch,quoteModel} from '../src/budget/ledger.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {pricingEngine} from '../src/engines/pricing-engine.mjs';
import {selectProposalAudit} from '../src/proposal/audit-selection.mjs';
const now=Date.parse('2026-10-21T13:00:00Z'),raw=JSON.parse(readFileSync(new URL('./fixtures/one-more-fresh-report.json',import.meta.url)));
const brief=snapshotBrief({brandName:'One More Global',website:'https://onemoreglobalinc.com/',segment:'corporate',goals:'ABD perakende büyümesi.',needs:'MLM modelinden perakendeye geçiş.',services:'Meta ve Google Ads',meetingNotes:'Güncellenmiş görüşme notu.',budget:null});
const row={step_key:'model:synthesis:old-paid-request',created_at:'2026-10-21T12:00:00Z',value:{data:raw,model:'gemini-3.1-pro-preview',accountedKurus:1332,reservedKurus:1800}};
test('recorded usage with every methodology area fits the 20–30 TRY normal target without cutting Pro reasoning or report output',()=>{
 // Real cold Huel token usage, unchanged Pro model/output/thinking. Search
 // credit rate is the maximum public PAYG rate; free credits are not assumed.
 const fx=49.6015,cost=500+consumedSearch(2,fx)*3+consumedSearch(1,fx)*12+consumedModel('gemini-3.1-pro-preview',9337,1068,fx,now)+consumedModel('gemini-3.1-pro-preview',35015,10119,fx,now)+consumedModel('gemini-3.8-flash',4504,590,fx,now);
 assert.ok(cost>=2000&&cost<=3000,'Total including 5 TRY infrastructure allowance: '+cost);
 assert.ok(consumedModel('gemini-3.1-pro-preview',35015,10119,fx,now)<quoteModel('gemini-3.1-pro-preview',35015,10119,now));
 assert.equal(consumedModel('gemini-3.1-pro-preview',10000,1000,fx,now,10000),Math.ceil((10000*.2+1000*12)/1e6*fx*1.03*100));
 assert.throws(()=>consumedModel('gemini-3.1-pro-preview',10000,1000,fx,now,10001));assert.throws(()=>consumedSearch(1,61));
});
test('legacy paid same-brand report is recoverable after a brief edit, with identity checks and explicit context uncertainty',()=>{
 const result=reusableResearch(brief,[row],now);assert.deepEqual(result.report,raw);assert.equal(result.reuse.exactBrief,false);assert.equal(result.reuse.contextNeedsConfirmation,true);
 assert.equal(reusableResearch({...brief,brandName:'Arbonne'},[row],now),null);assert.equal(reusableResearch({...brief,website:'https://different.example/'},[row],now),null);
 assert.equal(reusableResearch(brief,[{...row,created_at:'2026-09-01T00:00:00Z'}],now),null);
 const exact={...row,value:{...row.value,researchContext:{brief,briefHash:briefHash(brief)}}};assert.equal(reusableResearch(brief,[exact],now).reuse.exactBrief,true);
});
test('the reported 42.77 TRY card resumes a paid report under a changed brief with zero research calls, preserves cost and reaches pricing',async()=>{
 const rows=new Map([[researchCacheKey(brief),{state:"complete",value:{...row,created_at:new Date().toISOString()}}]]),cost={capKurus:5000,chargedKurus:4277};let calls=0;
 const ledger={get:async k=>rows.get(k),status:async()=>cost,once:async(k,_input,amount,run)=>{assert.equal(amount,0);if(rows.has(k))return rows.get(k).value;const value=await run();if(Object.hasOwn(value,'accountedKurus'))assert.equal(value.accountedKurus,amount,'SQL settlement requires paid usage to stay out of a free coordinator');rows.set(k,{state:'complete',value});return value;}};
 const providers={search:()=>assert.fail('no new search'),extract:()=>assert.fail('no new extraction'),generate:async stage=>{calls++;assert.equal(stage,'scope');const error=Error('No scope budget');error.code='budget_limit';throw error;}};
 for(const phase of ['source_plan','evidence','synthesis','scope'])await runBoundedStage({phase,brief,ledger,providers,researchVersion:'v5'});
 const synthesis=rows.get(stageKey(brief,'synthesis','v5')).value,audit={stage:'audit',...directAuditResult(brief,synthesis)},scope=rows.get(stageKey(brief,'scope','v5')).value;
 assert.equal(calls,1);assert.equal(cost.chargedKurus,4277);assert.deepEqual(audit.data.originalReport,raw);assert.equal(audit.data.researchCoverage.length,24);assert.equal(audit.data.briefHash,briefHash(brief));
 const pricing=await pricingEngine.run({brief,scope:scope.scopePlan},{audit});assert.equal(pricing.data.alternatives.length,2);assert.ok(selectProposalAudit(audit.data).findings.every(f=>f.verification==='unverified'));
});
