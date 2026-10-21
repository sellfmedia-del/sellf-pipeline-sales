import test from 'node:test';
import assert from 'node:assert/strict';
import {methodologyAreas,methodologyAreasSchema,normalizeMethodologyAreas,reportWithAreas} from '../src/bhs/methodology-areas.mjs';
import {completeDirectReportSchema,normalizeCompleteDirectReport} from '../src/bhs/direct-report.mjs';
import {context} from './fixtures/evidence.mjs';
import {researchTopics} from '../src/bhs/research-topics.mjs';
import {stageKey,runBoundedStage} from '../src/bhs/direct-research.mjs';
import {brief} from './fixtures/bhs.mjs';
const areas=()=>Object.fromEntries(methodologyAreas.map(a=>[a.key,{status:'unavailable',observation:'Bu alan için kamuya açık ölçüm bulunamadı.',sourceIds:[]} ]));

test('every approved methodology subarea has a fixed required field, independently of finding count',()=>{
 assert.equal(methodologyAreas.length,24);assert.deepEqual(methodologyAreas.map(a=>a.topic),Object.values(researchTopics).flat());assert.deepEqual(methodologyAreasSchema.required,methodologyAreas.map(a=>a.key));
 assert.deepEqual(completeDirectReportSchema.properties.researchCoverage,methodologyAreasSchema);
 const input=context().report;input.researchCoverage=areas();const out=normalizeCompleteDirectReport(input);assert.equal(out.researchCoverage.length,24);assert.equal(out.findings.length,input.findings.length);assert.equal(Array.isArray(input.researchCoverage),false);
});
test('missing methodology fields and invented source IDs cannot become a completed research report',()=>{
 const incomplete=areas();delete incomplete.digital_5;assert.throws(()=>normalizeMethodologyAreas(incomplete),/zorunlu alanları eksik/);
 const invented=areas();invented.financial_1={status:'observed',observation:'A claim',sourceIds:['invented']};assert.throws(()=>normalizeMethodologyAreas(invented,['real']),/kaynak referansı/);
 const unsourced=areas();unsourced.funnel_3={status:'observed',observation:'A claim',sourceIds:[]};assert.throws(()=>normalizeMethodologyAreas(unsourced),/kaynak referansı/);
});
test('historical completion preserves paid findings, aliases the same source URL, and adds all methodology areas',()=>{
 const old=context().report,before=structuredClone(old),a=areas(),source=old.sources[0];a.funnel_1={status:'partial',observation:'Source-specific research observation.',sourceIds:['actual_source']};
 const result=reportWithAreas(old,a,[{id:'actual_source',url:source.url,title:source.title,text:'Read source text',method:'html'}]);assert.deepEqual(old,before);assert.deepEqual(result.findings,old.findings);assert.equal(result.sources.length,old.sources.length);assert.equal(result.researchCoverage.length,24);assert.deepEqual(result.researchCoverage.find(c=>c.topic===researchTopics.funnel[0]).sourceIds,[source.id]);
});
test('v5 retains paid discovery/evidence and completes old methodology fields without another search or report review',async()=>{
 const {packet,report}=context(),rows=new Map(),calls=[];rows.set(stageKey(brief,'evidence','v4'),{state:'complete',value:{packet,searches:[]}});rows.set(stageKey(brief,'synthesis','v4'),{state:'complete',value:{report,model:'original-pro'}});
 const ledger={get:async k=>rows.get(k),once:async(k,_input,amount,run)=>{assert.equal(amount,0);if(rows.get(k)?.state==='complete')return rows.get(k).value;const value=await run();rows.set(k,{state:'complete',value});return value;}};
 const providers={search:()=>assert.fail('must not repeat search'),generate:async(stage,input,schema,options)=>{calls.push(stage);assert.equal(stage,'methodology_areas');assert.equal(input.report,undefined);assert.equal(options.model,'gemini-3.1-pro-preview');assert.equal(options.reserveForFollowingKurus,100);assert.deepEqual(schema.required,methodologyAreasSchema.required);return {data:areas()};}};
 const first=await runBoundedStage({phase:'synthesis',brief,ledger,providers,researchVersion:'v5'});assert.equal(first.report.researchCoverage.length,24);assert.deepEqual(first.report.findings,report.findings);assert.deepEqual(rows.get(stageKey(brief,'synthesis','v4')).value.report,report);
 await runBoundedStage({phase:'synthesis',brief,ledger,providers,researchVersion:'v5'});assert.deepEqual(calls,['methodology_areas']);assert.equal(stageKey(brief,'evidence','v5'),stageKey(brief,'evidence','v4'));assert.notEqual(stageKey(brief,'synthesis','v5'),stageKey(brief,'synthesis','v4'));
});

test('scope selection receives every methodology area alongside brief and findings without calculating model prices',async()=>{
 const report=context().report;report.researchCoverage=normalizeMethodologyAreas(areas());
 const ledger={get:async key=>key===stageKey(brief,'synthesis','v5')?{state:'complete',value:{report}}:null,once:async(_key,_input,amount,run)=>{assert.equal(amount,0);return run();}};
 const providers={generate:async(stage,input)=>{assert.equal(stage,'scope');assert.equal(input.audit.researchCoverage.length,24);assert.equal(input.brief.services,brief.services);assert.equal(input.audit.findings.length,report.findings.length);return {data:{scope:{summary:'Araştırma ve brief kapsamı.',budget:{posture:'unspecified',quote:null,targetQuote:null,targetScope:'unspecified'},services:[],exclusions:[]},copy:{headline:'Hedefler.',accent:'Birlikte büyüme.',subtitle:'Araştırmaya ve görüşmeye dayalı çalışma önerisi.',findingIds:[]}}};}};
 await runBoundedStage({phase:'scope',brief,ledger,providers,researchVersion:'v5'});
});
