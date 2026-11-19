import assert from 'node:assert/strict';
import test from 'node:test';
import {classifiedDimension,classificationIssue,classificationInstruction,internalDimensionText} from '../src/bhs/finding-classification.mjs';
import {writeScopedSynthesis} from '../src/bhs/collection-first.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {offerReport} from '../src/bhs/offer-report.mjs';
import {selectProposalAudit} from '../src/proposal/audit-selection.mjs';
import {resolveManagedGaps} from '../src/bhs/managed-gaps.mjs';

const brief=snapshotBrief({brandName:'Example Supply',website:'https://brand.example/',segment:'corporate',
 goals:'Develop a UK nursery enquiry pilot.',services:'B2B',needs:'Understand nursery needs and the supply process.',meetingNotes:''});
const facts=[
 {quote:'The school census describes educational support needs among pupils at state-funded nursery schools in England.',url:'https://statistics.example/nursery',
  observation:'England’s school census describes the support needs of pupils at state-funded nursery schools.',area:'competition',conditionScope:'external'},
 {quote:'An independent laboratory confirms that the supplier employs an in-house quality assurance team to inspect each production batch.',url:'https://laboratory.example/supplier',
  observation:'An independent laboratory confirms the supplier’s own team inspects every production batch.',area:'operations',conditionScope:'internal'},
 {quote:'The regulator requires suppliers to keep a traceable product compliance record for the market.',url:'https://regulator.example/products',
  observation:'Suppliers must retain a traceable product compliance record under the regulator’s market requirements.',area:'operations',conditionScope:'external'}
];
function fixture(indexes=[0]){
 const needs=indexes.map(i=>({id:'n'+i,section:'task_'+i,sectionTitle:'Research topic '+i,target:brief.brandName,market:'England',
  metric:['Pupil support indicator','Supplier quality controls','Product compliance records'][i],expected:'The directly read condition.',
  period:'',quantity:1,query:'Example Supply '+i,country:'GB',language:'en',first:'tavily',since:''}));
 const receipts=indexes.map(i=>({id:'n'+i,urls:[facts[i].url],facts:[{id:'fact'+i,...facts[i],title:'Evidence '+i,method:'html'}]}));
 return {brief,brand:{packet:{version:'sellf-evidence-v1',asOf:'2026-11-19',entities:[{id:'brand',role:'brand',name:brief.brandName,website:brief.website}],sources:[]},facts:[],
  brandUnderstanding:{understanding:'A supplier to UK nurseries.'},briefUnderstanding:{understanding:brief.goals}},
  plan:{needs,scopedResearch:true,adaptiveResearch:true,qualityReport:true,verifiedResults:true,readEvidenceOnly:true,targetedEvidence:true,
   taskReporting:true,qualifyReportFindings:true,sectionedSynthesis:true,boundedReportParts:true,reportRecovery:true,questionEvidence:true,
   cleanResearchEvidence:true,classifyReportFindings:true},
  rounds:[{closed:true,stopReason:'research_budget_exhausted',receipts,decisions:receipts.map(receipt=>({id:receipt.id,sufficient:true,
   proofs:receipt.facts.map(fact=>fact.id),answerFit:{status:'direct',reason:'The requested condition is directly described.'}}))}]};
}
function row(i,quadrant='none',changes={}){
 return {index:i,section:quadrant==='none'?'Research findings':'swot',area:facts[i].area,conditionScope:facts[i].conditionScope,quadrant,
  rank:1,peerId:'',kind:'observation',needIds:['n'+i],observation:facts[i].observation,
  analysis:'This condition can inform a focused nursery pilot hypothesis.',action:'Check the condition against the intended pilot process.',
  measurement:'Record the pilot enquiry outcome in the CRM.',limitation:'Commercial outcomes were not measured.',question:'',...changes};
}
function memory(rows,{classified=true}={}){
 const saved=new Map();let calls=0;
 return {get calls(){return calls;},saved,readCheckpoint:async(name,key)=>saved.get(name+JSON.stringify(key)),
  checkpoint:async(name,key,run)=>{const result=await run();saved.set(name+JSON.stringify(key),result);return result;},
  manager:async(_stage,input,contract,options)=>{
   calls++;assert.equal(input.instruction.includes(classificationInstruction),classified);
   assert.equal(Boolean(contract.properties.findings.items.properties.conditionScope),classified);
   assert.ok(options.maxOutputTokens<=2200);
   const selected=rows.filter(value=>Array.isArray(input.scope)?value.quadrant==='none':input.scope.quadrants.includes(value.quadrant));
   return {model:'offline',data:{findings:selected.flatMap(({index,...value})=>{
    const proof=input.coverage.find(metric=>metric.id==='n'+index)?.sources[0];
    if(!proof)return [];
    const result={...value,proof:[proof]};if(!classified)delete result.conditionScope;
    return [result];
   }),benchmarks:[],questions:[],hasMore:false}};
  }};
}

test('Claude can choose any methodology dimension directly or its exact subarea without an operational fallback',()=>{
 for(const dimension of ['financial','operations','funnel','digital','perception','competition'])
  assert.equal(classifiedDimension({area:dimension}),dimension);
 assert.equal(classifiedDimension({area:'digital_2'}),'digital');
 assert.equal(classifiedDimension({area:'',section:'Custom heading'}),undefined);
 assert.equal(classifiedDimension({area:'market_unknown'}),undefined);
});

test('internal capability, external opportunity and an operational requirement are distinct classifications',()=>{
 assert.equal(classificationIssue(row(1,'strength')),undefined);
 assert.equal(classificationIssue(row(0,'opportunity')),undefined);
 assert.equal(classificationIssue(row(2)),undefined);
 for(const value of [row(0,'strength'),row(0,'weakness'),row(1,'opportunity'),row(1,'threat'),row(0,'threat',{conditionScope:'mixed'}),row(1,'strength',{conditionScope:'unknown'})])
  assert.equal(classificationIssue(value),'swot_scope_mismatch');
});

test('the model-selected market dimension survives synthesis and proposal handoff instead of becoming operational',async()=>{
 const args=fixture(),before=structuredClone(args),result=await writeScopedSynthesis({...args,providers:memory([row(0)])});
 assert.equal(result.report.findings.length,1);const finding=result.report.findings[0];
 assert.equal(finding.dimension,'competition');assert.equal(finding.conditionScope,'external');
 assert.equal(finding.bhsSectionTitle,'Research findings');assert.deepEqual(finding.researchNeedIds,['n0']);
 assert.ok(result.report.dimensions.filter(d=>d.id==='operations').every(d=>!d.findingIds.length&&!d.strengths.length));
 const proposal=selectProposalAudit(result.report,brief);
 assert.equal(proposal.findings[0].dimension,'competition');assert.equal(proposal.findings[0].conditionScope,'external');
 assert.deepEqual(args,before);
});

test('an external opportunity stays a SWOT opportunity without populating internal strengths or fabricating three missing quadrants',async()=>{
 const result=await writeScopedSynthesis({...fixture(),providers:memory([row(0,'opportunity')])});
 assert.equal(result.report.findings.length,1);
 assert.equal(result.report.findings[0].swotQuadrant,'opportunity');
 const statement=result.report.findings[0].statement;
 assert.ok(result.report.dimensions.every(d=>!d.strengths.includes(statement)&&!d.gaps.some(value=>value.includes(statement))));
 const swot=result.report.bhsSections.find(section=>/^swot\b/iu.test(section.id));
 assert.deepEqual(swot.missingQuadrants,['strength','weakness','threat']);assert.equal(swot.complete,false);
});

test('an internal capability can be supported by an independent publisher rather than the brand hostname',async()=>{
 const result=await writeScopedSynthesis({...fixture([1]),providers:memory([row(1,'strength')])});
 const finding=result.report.findings[0];assert.equal(finding.dimension,'operations');assert.equal(finding.conditionScope,'internal');
 assert.equal(finding.swotQuadrant,'strength');
 assert.ok(result.report.dimensions.find(d=>d.id==='operations').strengths.includes(finding.statement));
 assert.ok(result.report.sources.some(source=>source.url.startsWith('https://laboratory.example/')));
});

test('a verified external compliance requirement can remain an important operational finding without becoming an internal weakness',async()=>{
 const result=await writeScopedSynthesis({...fixture([2]),providers:memory([row(2)])});
 assert.equal(result.report.findings.length,1);assert.equal(result.report.findings[0].dimension,'operations');
 assert.equal(result.report.findings[0].conditionScope,'external');assert.equal(result.report.findings[0].swotQuadrant,undefined);
 const statement=result.report.findings[0].statement;
 assert.ok(result.report.dimensions.every(d=>!d.strengths.includes(statement)&&!d.gaps.some(value=>value.includes(statement))));
});

test('a scope-conflicting SWOT row does not invent a strength and its saved proof remains available without extra research',async()=>{
 const args=fixture(),providers=memory([row(0,'strength')]),result=await writeScopedSynthesis({...args,providers});
 assert.equal(result.report.findings.length,0);
 assert.equal(result.report.verifiedResearch.metrics[0].status,'confirmed');
 assert.ok(result.report.verifiedResearch.metrics[0].sourceIds.length);
 assert.ok(result.report.verifiedResearch.reportRecovery.evidence.length);
 const calls=providers.calls,restored=await writeScopedSynthesis({...args,providers,allowWrite:false});
 assert.deepEqual(restored.report,result.report);assert.equal(providers.calls,calls);
 const gap=await resolveManagedGaps({action:'complete_gaps',brief,synthesis:{...result,supervision:{...result.supervision,reviewMode:'managed-audit'}},
  sections:result.report.bhsSections.filter(section=>!section.complete).map(section=>section.id),secret:'offline',
  baseLedger:{status:()=>assert.fail('a reporting classification issue must not buy research')}});
 assert.equal(gap,null);
});

test('a missing dimension is not silently assigned to operations; its paid source is retained for report recovery',async()=>{
 const result=await writeScopedSynthesis({...fixture(),providers:memory([row(0,'none',{area:''})])});
 assert.equal(result.report.findings.length,0);
 assert.ok(result.report.verifiedResearch.metrics[0].sourceIds.length);
 assert.ok(result.report.verifiedResearch.reportRecovery.evidence.length);
});

test('legacy derived strengths/gaps lose an external SWOT label while the original fact, sources and prices stay intact',async()=>{
 const result=await writeScopedSynthesis({...fixture(),providers:memory([row(0,'opportunity')])});
 const cached=structuredClone(result.report),finding=cached.findings[0];
 finding.dimension='operations';delete finding.conditionScope;
 const ops=cached.dimensions.find(d=>d.id==='operations');ops.findingIds=[finding.id];ops.strengths=[finding.statement];
 ops.gaps=['Doğrulanacak hipotez: '+finding.statement];
 const prices={alternatives:[{id:'growth',total:12000}]},before=structuredClone({cached,prices});
 assert.equal(internalDimensionText(finding.statement,[finding]),false);
 const normalized=offerReport(cached),proposal=selectProposalAudit(cached,brief,prices);
 assert.equal(normalized.findings.length,1);assert.equal(normalized.sources.length,cached.sources.length);
 assert.deepEqual(normalized.dimensions.find(d=>d.id==='operations').strengths,[]);
 assert.deepEqual(normalized.dimensions.find(d=>d.id==='operations').gaps,[]);
 assert.ok(proposal.dimensions.find(d=>d.id==='operations').highlights.every(row=>!/^Güçlü yön:|^Gelişim alanı:/u.test(row.text)));
 assert.equal(proposal.findings[0].swotQuadrant,'opportunity');assert.deepEqual({cached,prices},before);
});

test('saved pre-classification writer requests keep their original contract and replay without a new paid call',async()=>{
 const args=fixture();delete args.plan.classifyReportFindings;
 const providers=memory([row(0,'none',{area:''})],{classified:false});
 const result=await writeScopedSynthesis({...args,providers}),calls=providers.calls;
 assert.equal(result.report.findings.length,1);
 const restored=await writeScopedSynthesis({...args,providers,allowWrite:false});
 assert.deepEqual(restored.report,result.report);assert.equal(providers.calls,calls);
});

test('duplicate cleanup does not merge contradictory internal and external classifications into one confirmed need binding',async()=>{
 const result=await writeScopedSynthesis({...fixture(),providers:memory([row(0)])});
 const cached=structuredClone(result.report),finding=cached.findings[0];
 cached.verifiedResearch.metrics.push({...cached.verifiedResearch.metrics[0],id:'other'});
 cached.findings.push({...finding,id:'other_finding',conditionScope:'internal',researchNeedIds:['other']});
 const proposal=selectProposalAudit(cached,brief);
 assert.equal(proposal.findings.length,1);assert.deepEqual(proposal.findings[0].researchNeedIds,['n0']);
 assert.equal(proposal.findings[0].conditionScope,'external');
});
