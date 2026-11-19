import assert from 'node:assert/strict';
import test from 'node:test';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {BudgetError} from '../src/budget/ledger.mjs';
import {writeScopedSynthesis} from '../src/bhs/collection-first.mjs';
import {readPartialOutput} from '../src/bhs/partial-output.mjs';
import {createSequentialProviders} from '../src/bhs/sequential-providers.mjs';
import {managedPhaseBudget,researchCapKurus,synthesisCapKurus} from '../src/bhs/managed-budget.mjs';
import {assertSchema} from '../src/bhs/schema.mjs';
import {localBudget} from './fixtures/local-budget.mjs';

const brief=snapshotBrief({brandName:'Example Brand',website:'https://brand.example/',segment:'corporate',
 goals:'Improve wholesale conversion for UK nurseries.',services:'B2B',needs:'Understand the catalogue and enquiry process.',meetingNotes:''});
const quotes=[
 'Example Brand provides a wholesale catalogue to registered nursery retailers.',
 'The enquiry form records the room dimensions and age group before a quote is issued.',
 'Nursery buyers have reported delivery delays in recorded customer interviews.',
 'The sales team records the source of each incoming enquiry in its customer system.'
];
const observations=[
 'Registered nursery retailers can access the brand wholesale catalogue.',
 'The quote enquiry includes room dimensions alongside the intended age group.',
 'The interviewed nursery buyers reported delivery delays.',
 'An incoming enquiry has its source recorded by the sales team.'
];
const needs=quotes.map((_,index)=>({id:'need-'+index,section:'operations',target:'Example Brand',market:'United Kingdom',
 metric:['Wholesale catalogue','Quote form fields','Buyer feedback','Enquiry source'][index],expected:'A directly read source.',
 period:'',quantity:1,query:'Example Brand '+index,country:'GB',language:'en',first:'tavily',since:''}));
function fixture(overrides={}){
 const facts=quotes.map((quote,index)=>({id:'proof-'+index,url:brief.website+'evidence-'+index,title:'Evidence '+index,method:'html',quote}));
 const receipts=facts.map((fact,index)=>({id:needs[index].id,urls:[fact.url],facts:[fact]}));
 return {brief,brand:{packet:{version:'sellf-evidence-v1',asOf:'2026-11-19',entities:[{id:'brand',role:'brand',name:brief.brandName,website:brief.website}],sources:[]},
  facts:[],brandUnderstanding:{understanding:'A wholesale supplier serving UK nurseries.'},briefUnderstanding:{understanding:brief.goals}},
  plan:{needs,scopedResearch:true,adaptiveResearch:true,orderedResearch:true,qualityReport:true,verifiedResults:true,readEvidenceOnly:true,
   targetedEvidence:true,taskReporting:true,qualifyReportFindings:true,sectionedSynthesis:true,reportRecovery:true,boundedReportParts:true,reportOnlyAfterResearch:true},
  rounds:[{closed:true,stopReason:'research_budget_exhausted',receipts,decisions:receipts.map(row=>({id:row.id,sufficient:true,proofs:row.facts.map(f=>f.id)}))}],...overrides};
}
function finding(input,index,overrides={}){
 const proof=Object.entries(input.sources).find(([,row])=>row.at(-1).includes(quotes[index]))?.[0];
 assert.ok(proof,'The actual evidence must reach the writer');
 return {section:'operations',area:'',rank:1,quadrant:'none',peerId:'',observation:observations[index],proof:[proof],kind:'observation',needIds:[needs[index].id],
  analysis:'This process detail can guide the nursery conversion pilot.',action:'Check this process against a recorded customer journey.',
  measurement:'Enquiries linked to issued quotes in the CRM.',limitation:'Sales performance was not measured.',question:'',...overrides};
}
const empty={findings:[],benchmarks:[],questions:[],hasMore:false};
function memory(writer){
 const saved=new Map(),calls=[];
 const readCheckpoint=async(name,key)=>saved.get(name+JSON.stringify(key));
 return {saved,calls,readCheckpoint,checkpoint:async(name,key,run)=>{
  const value=await run();saved.set(name+JSON.stringify(key),value);return value;
 },manager:async(stage,input,contract,options)=>{
  calls.push({stage,input,options});
  assert.ok(options.maxOutputTokens<=2200);
  assert.equal(contract.properties.findings.maxItems,2);
  if(Array.isArray(input.scope))assert.ok(input.needs.length<=2);
  const result=await writer(stage,input,options);
  const normalized=options.normalizeData(result.data);
  assertSchema(normalized,contract);
  return {...result,data:normalized};
 }};
}

test('the last closed finding survives truncation without inventing its unfinished neighbour or a scalar',()=>{
 assert.deepEqual(readPartialOutput('{"findings":[{"statement":"Completed."}').data.findings,[{statement:'Completed.'}]);
 assert.deepEqual(readPartialOutput('{"findings":[{"statement":"Completed."}]').data.findings,[{statement:'Completed.'}]);
 assert.deepEqual(readPartialOutput('{"findings":[{"statement":"Completed."},{"statement":"Unfinished').data.findings,[{statement:'Completed.'}]);
 assert.deepEqual(readPartialOutput('{"findings":[{"statement":"Escaped \\\"quote\\\"."}').data.findings,[{statement:'Escaped "quote".'}]);
 assert.equal(readPartialOutput('{"counts":[12').data.counts,undefined);
 assert.equal(readPartialOutput('{"findings":[{"statement":"Unfinished').data.findings,undefined);
});

test('a clipped page retains complete findings and writes only its missing continuation',async()=>{
 const providers=memory(async(stage,input)=>{
  if(stage==='bhs-scoped-report-brief-page-0')return {model:'offline',usage:{output_tokens:2200},partialOutput:true,
   data:{...empty,findings:[finding(input,0)]}};
  if(stage==='bhs-scoped-report-brief-page-1'){
   assert.ok(input.existing.some(row=>row.includes(observations[0])));
   return {model:'offline',data:{...empty,findings:[finding(input,1)]}};
  }
  return {model:'offline',data:Array.isArray(input.scope)?{...empty,findings:[finding(input,2),finding(input,3)]}:empty};
 });
 const args=fixture();
 const first=await writeScopedSynthesis({...args,providers});
 assert.equal(first.supervision.reportIssue,undefined,'A successfully completed continuation resolves the clipped page');
 assert.deepEqual(first.report.findings.map(f=>f.statement),observations);
 assert.equal(providers.calls.filter(call=>call.stage.includes('brief-page')).length,2);
 const count=providers.calls.length;
 const restored=await writeScopedSynthesis({...args,providers,allowWrite:false});
 assert.deepEqual(restored.report,first.report);
 assert.equal(providers.calls.length,count,'Reading a saved report must not generate again');
 await writeScopedSynthesis({...args,providers});
 assert.equal(providers.calls.length,count,'An ordinary replay must also reuse completed pages');
});

test('budget denial preserves valid rows, creates no failed page checkpoint and resumes without paying for completed pages',async()=>{
 let denied=true;
 const providers=memory(async(stage,input)=>{
  if(stage.endsWith('brief-page-0'))return {data:{...empty,findings:[finding(input,0)],hasMore:true}};
  if(stage.endsWith('brief-page-1')){
   if(denied)throw new BudgetError('budget_limit','Synthetic writing budget denial.');
   assert.equal(input.existing.length,1);
   return {data:{...empty,findings:[finding(input,1)]}};
  }
  return {data:empty};
 });
 const args=fixture({plan:{...fixture().plan,needs:needs.slice(0,2)}});
 const partial=await writeScopedSynthesis({...args,providers});
 assert.equal(partial.supervision.reportIssue,'budget_limit');
 assert.ok(partial.report.findings.some(f=>f.statement===observations[0]));
 assert.ok(![...providers.saved.keys()].some(key=>key.includes('"part":"brief","page":1')));
 const free=await writeScopedSynthesis({...args,providers,allowWrite:false});
 assert.ok(free.report.findings.some(f=>f.statement===observations[0]));
 assert.equal(free.supervision.reportIssue,'report_checkpoint_missing');
 const before=providers.calls.filter(call=>call.stage.endsWith('brief-page-0')).length;
 denied=false;
 const resumed=await writeScopedSynthesis({...args,providers});
 assert.equal(resumed.supervision.reportIssue,undefined);
 assert.equal(resumed.report.findings.length,2);
 assert.equal(providers.calls.filter(call=>call.stage.endsWith('brief-page-0')).length,before);
});

test('invalid or repetitive continuations cannot overwrite validated findings or run an unbounded writer',async()=>{
 const providers=memory(async(stage,input)=>({data:Array.isArray(input.scope)?
  {...empty,findings:[finding(input,0)],hasMore:true}:empty}));
 const result=await writeScopedSynthesis({...fixture({plan:{...fixture().plan,needs:needs.slice(0,2)}}),providers});
 assert.equal(result.report.findings.length,1);
 assert.equal(result.supervision.reportIssue,'partial_model_document');
 assert.equal(providers.calls.filter(call=>call.stage.includes('brief-page')).length,2);
 for(const written of providers.saved.values())assert.ok(written.data.findings.every(row=>row.proof.length&&row.analysis&&row.action));
});

test('completed parts survive an earlier missing checkpoint and scope remains limited for an explicit gap report',async()=>{
 const args=fixture();
 const providers=memory(async(_stage,input)=>({data:Array.isArray(input.scope)?
  {...empty,findings:[finding(input,input.needs[0].id==='need-0'?0:2)]}:empty}));
 const full=await writeScopedSynthesis({...args,providers});
 assert.equal(full.report.findings.length,2);
 providers.saved.delete([...providers.saved.keys()].find(key=>key.includes('"part":"brief"')));
 const recovered=await writeScopedSynthesis({...args,providers,allowWrite:false});
 assert.deepEqual(recovered.report.findings.map(row=>row.statement),[observations[2]]);
 const gap=memory(async(_stage,input)=>{
  assert.ok(!input.scope?.quadrants,'An explicitly selected non-SWOT section must not start a SWOT writer');
  assert.deepEqual(input.existing,[['operations','Preserved existing finding.']]);
  return {data:{...empty,findings:[finding(input,input.needs[0].id==='need-0'?0:2)]}};
 });
 await writeScopedSynthesis({...args,providers:gap,sections:['operations'],existing:[['operations','Preserved existing finding.']]});
});

test('provider wire recovery, checkpoints and the unchanged research/writing caps work together without external calls',async t=>{
 const f=await localBudget();t.after(f.close);
 await managedPhaseBudget({ledger:f.ledger,brief,phase:'brand_plan',enabled:true});
 await f.ledger.once('prior-research',{},2500,async()=>({saved:true}));
 const budget=await managedPhaseBudget({ledger:f.ledger,brief,phase:'synthesis',enabled:true});
 assert.equal(researchCapKurus,3000);assert.equal(synthesisCapKurus,2000);assert.equal(budget.phaseCeiling,5000);
 let generations=0;
 const response=value=>new Response(JSON.stringify(value));
 const providers=createSequentialProviders({ledger:budget.ledger,phase:'synthesis',phaseLimitKurus:budget.phaseCeiling,
  managedAudit:true,managedBudgetVersion:24,collectionFirst:true,anthropicKey:'synthetic',geminiKey:'synthetic',
  researchFx:async()=>({usdTry:40,publishedAt:'2026-11-19'}),now:()=>Date.parse('2026-11-19T12:00:00Z'),fetchImpl:async(url,init)=>{
   const body=JSON.parse(init.body);
   if(url.endsWith('/count_tokens'))return response({input_tokens:1000});
   if(url.endsWith(':countTokens'))return response({totalTokens:1000});
   assert.ok(url.endsWith('/messages'),'Only the local Claude transport stub may be used');
   generations++;
   const input=JSON.parse(body.messages[0].content);
   const partial=Array.isArray(input.scope)&&!input.existing.length&&input.needs[0].id==='need-0';
   const index=input.existing.length?1:input.needs[0]?.id==='need-2'?2:0;
   const data=Array.isArray(input.scope)?{...empty,findings:index===2?[finding(input,2),finding(input,3)]:[finding(input,index)]}:empty;
   return response({model:body.model,usage:{input_tokens:1000,output_tokens:partial?body.max_tokens:700},
    stop_reason:partial?'max_tokens':'end_turn',content:[{type:'text',text:partial?'{"findings":['+JSON.stringify(data.findings[0]):JSON.stringify(data)}]});
  }});
 const args=fixture();
 const result=await writeScopedSynthesis({...args,providers});
 assert.equal(result.supervision.reportIssue,undefined);
 assert.equal(result.report.findings.length,4);
 const charged=(await f.ledger.status()).chargedKurus;
 assert.ok(charged>3000&&charged<=5000);
 const count=generations;
 const replay=await writeScopedSynthesis({...args,providers});
 assert.deepEqual(replay.report,result.report);assert.equal(generations,count);assert.equal((await f.ledger.status()).chargedKurus,charged);
 const receipts=await f.receipts();
 assert.ok(receipts.filter(row=>row.step_key.includes('checkpoint:scoped-report-page')).every(row=>row.state==='complete'&&row.charge_kurus===0));
 await f.ledger.once('other-existing-writing',{},5000-charged,async()=>({retained:true}));
 const before=(await f.ledger.status()).chargedKurus;
 const denied=await writeScopedSynthesis({...args,providers,existing:[['operations','A preserved prior finding.']]});
 assert.equal(denied.supervision.reportIssue,'budget_limit');
 assert.equal(generations,count,'An insufficient writing balance must not call the paid generation endpoint');
 assert.equal((await f.ledger.status()).chargedKurus,before,'No borrowing from another budget or releasing recorded spend');
});
