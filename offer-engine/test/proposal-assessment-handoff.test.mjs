import test from 'node:test';
import assert from 'node:assert/strict';
import {implementationContext,applyImplementation,writeImplementation,implementationPlansSchema} from '../src/proposal/implementation-plan.mjs';
import {selectProposalAudit} from '../src/proposal/audit-selection.mjs';
import {implementationAssessment} from '../src/proposal/assessment-handoff.mjs';

const goal='Run a controlled pilot for independent UK nurseries.';
const analysis='Hypothesis: A recorded enquiry pilot can test the selected nursery proposition. '+
 'Review the enquiry, quote and order records before choosing the next outreach step. '.repeat(3)+
 'Limitation: product usage evidence does not establish buyer demand or confirmed sales.';
function fixture(){
 const brief={brandName:'Example Brand',goals:goal,needs:'Validate enquiry tracking before expansion.',services:'B2B Dijital Pazarlama',meetingNotes:'An older market option is no longer selected.'};
 const audit={schemaVersion:'bhs-v2-direct',summary:'The nursery proposition needs a measured pilot.',sources:[
  {id:'read',url:'https://brand.example/product',title:'Product information',quote:'The product information describes how the sensory set is used.',verification:{status:'quote_matched',method:'html'}},
  {id:'snippet',url:'https://search.example/',title:'Unread search result',verification:{status:'quote_matched',method:'search-snippet'}}],
  findings:[
   {id:'fact',kind:'observation',dimension:'digital',priority:'high',bhsRank:2,statement:'The product information describes how the sensory set is used.',sourceIds:['read'],impact:analysis,
    goalConnection:'Test the nursery proposition through recorded enquiries.',decisionQuestion:'Does the enquiry record reach the CRM?',recommendation:{action:'Validate enquiry tracking before the pilot.',measurement:'Check the test enquiry record.'}},
   {id:'hypothesis',kind:'inference',dimension:'operations',priority:'high',bhsRank:1,statement:'A nursery pilot may test whether the proposition attracts suitable enquiries.',sourceIds:['read'],
    impact:'The pilot may inform the next channel decision; no conversion improvement is established.',goalConnection:'Review the nursery pilot before expansion.'},
   {id:'unread',kind:'observation',dimension:'operations',priority:'high',statement:'An unread result describes a different market.',sourceIds:['snippet'],impact:'Do not pass unread advice.'}
  ],meetingQuestions:[{question:'Who owns pilot follow-up?',findingIds:['fact']},{question:'Does the enquiry record reach the CRM?',findingIds:['fact']},
   {question:'Should we use the unread claim?',findingIds:['unread']}],
  supervision:{researchPlan:{briefScope:{market:'United Kingdom',audience:'Independent nurseries',objective:goal,decisions:[{decision:goal,field:'goals',quote:goal}]}}},dimensions:[]};
 const pricing={selectionMode:'explicit',alternatives:[{id:'operations_bundle',services:[{serviceId:'b2b',findingIds:['fact']}]}]};
 const document={copy:{headline:'Clear goals.',accent:'Growing together.',subtitle:'A controlled pilot.'},
  alternatives:[{id:'operations_bundle',available:true,monthlyAmount:12000,services:[{id:'b2b',name:'B2B Dijital Pazarlama'}]}],
  plans:{operations_bundle:{mode:'operations',focus:'Pilot',steps:[{time:'Step 1',title:'Selected service'}]}},logo:{image:'preserved-logo'},bhs:selectProposalAudit(audit,brief,pricing)};
 return {brief,audit,pricing,document};
}
const getContext=f=>implementationContext(f.document,f.brief,f.audit,f.pricing,'operations');
const generated=(context,changes={})=>[{groupId:'operations_bundle',steps:[{serviceIds:['b2b'],briefQuote:goal,findingIds:['fact'],
 action:'Validate enquiry tracking before reviewing the nursery pilot.',measurement:'Review recorded enquiries before deciding whether to expand or revise.',...changes}]}];

test('Claude analysis, goal links, recommendations and questions survive the compact handoff without cutting the final qualification',()=>{
 const f=fixture(),before=structuredClone(f),context=getContext(f);
 assert.deepEqual(context.findings.map(row=>row.id),['fact']);
 const guide=context.assessment.priorities.find(row=>row.findingId==='fact');
 assert.ok(f.document.bhs.findings.find(row=>row.id==='fact').impact.length<analysis.length);
 assert.equal(guide.analysis,analysis);assert.match(guide.analysis,/does not establish buyer demand or confirmed sales\.$/);
 assert.equal(guide.goalConnection,f.audit.findings[0].goalConnection);assert.equal(guide.question,f.audit.findings[0].decisionQuestion);
 assert.deepEqual(guide.recommendation,f.audit.findings[0].recommendation);
 assert.deepEqual(context.assessment.openQuestions,[{question:'Who owns pilot follow-up?',findingIds:['fact']}]);
 assert.deepEqual(f,before);
});

test('sourced inference remains decision guidance and is never promoted into the factual finding pool',()=>{
 const context=getContext(fixture()),guide=context.assessment.priorities.find(row=>row.findingId==='hypothesis');
 assert.equal(guide.kind,'inference');assert.match(guide.hypothesis,/may test/);assert.match(guide.analysis,/no conversion improvement/);
 assert.ok(!context.findings.some(row=>row.id==='hypothesis'));
});

test('Claude rank and critical choices order accepted facts before the existing sixteen-fact window',()=>{
 const f=fixture();f.audit.findings=Array.from({length:20},(_,i)=>({...f.audit.findings[0],id:'fact-'+i,bhsRank:20-i,
  priority:'high',statement:'The source describes a distinct approved product feature number '+String.fromCharCode(65+i)+'.'}));
 f.audit.criticalRiskFindingId='fact-17';f.document.bhs=selectProposalAudit(f.audit,f.brief,f.pricing);
 const context=getContext(f);assert.equal(context.findings.length,16);assert.equal(context.findings[0].id,'fact-17');assert.equal(context.findings[1].id,'fact-19');
 assert.equal(context.assessment.priorities[0].findingId,'fact-17');
 assert.ok(context.assessment.priorities.every(row=>context.findings.some(f=>f.id===row.findingId)));
});

test('the handoff is bounded by complete rows and reports omissions instead of removing uncertainty clauses',()=>{
 const f=fixture(),source=f.audit.findings[0];
 f.audit.findings=Array.from({length:30},(_,i)=>({...source,id:'long-'+i,impact:analysis.repeat(3),bhsRank:i+1}));
 f.document.bhs.findings=f.audit.findings.map(row=>({...row,impact:'Presentation excerpt.'}));
 const context=getContext(f),assessment=context.assessment;
 assert.ok(JSON.stringify(assessment).length<=8000);assert.ok(assessment.priorities.length>0&&assessment.priorities.length<=8);
 assert.ok(assessment.omittedFindingCount>0);assert.ok(assessment.priorities.every(row=>row.analysis===analysis.repeat(3)));
 assert.match(assessment.priorities[0].analysis,/does not establish buyer demand or confirmed sales\.$/);
});

test('a source-accepted question outside the compact factual window remains a question rather than disappearing or becoming evidence',()=>{
 const f=fixture(),source=f.audit.findings[0];
 f.audit.findings=Array.from({length:20},(_,i)=>({...source,id:'candidate-'+i,bhsRank:i+1}));
 f.audit.meetingQuestions=[{question:'Which internal record resolves the remaining decision?',findingIds:['candidate-19']}];
 f.document.bhs.findings=structuredClone(f.audit.findings);
 const context=getContext(f);
 assert.ok(!context.findings.some(row=>row.id==='candidate-19'));
 assert.deepEqual(context.assessment.openQuestions,[{question:'Which internal record resolves the remaining decision?',findingIds:['candidate-19']}]);
 assert.ok(!context.assessment.priorities.some(row=>row.findingId==='candidate-19'));
});

test('stale reuse context and unread or excluded findings cannot re-enter through assessment or linked questions',()=>{
 const f=fixture();f.audit.findings.push({id:'excluded',kind:'inference',sourceIds:['read'],impact:'A discarded diagnosis.'});
 const context=getContext(f),serialized=JSON.stringify(context.assessment);
 assert.doesNotMatch(serialized,/unread advice|discarded diagnosis|unread claim/);
 f.audit.researchReuse={contextNeedsConfirmation:true};
 const pending=getContext(f);assert.deepEqual(pending.findings,[]);assert.equal(pending.assessment,undefined);
});

test('accepted scope remains authoritative and internal reports, quotes, prices and logo bytes are absent from the handoff',()=>{
 const f=fixture();f.audit.rawReport='PRIVATE_FULL_REPORT';f.audit.sources[0].quote+=' PRIVATE_SOURCE_CORPUS';
 const context=getContext(f);
 assert.equal(context.approvedScope.market,'United Kingdom');assert.equal(context.approvedScope.audience,'Independent nurseries');
 assert.equal(context.approvedScope.objective,goal);
 assert.doesNotMatch(JSON.stringify(context),/PRIVATE_FULL_REPORT|PRIVATE_SOURCE_CORPUS|monthlyAmount|12000|preserved-logo/);
 assert.equal(implementationContext(f.document,f.brief,f.audit,f.pricing,'manual'),null);
});

test('the writer uses the existing single draft call, schema and token limits while receiving the full decision guidance',async()=>{
 const f=fixture(),context=getContext(f);let calls=0;
 const result=await writeImplementation(f.document,context,{generate:async(stage,input,schema,options)=>{
  calls++;assert.equal(stage,'proposal_implementation');assert.equal(input.implementation.assessment.priorities.find(row=>row.findingId==='fact').analysis,analysis);
  assert.deepEqual(schema.properties.plans,implementationPlansSchema);assert.equal(options.maxOutputTokens,2320);assert.equal(options.minOutputTokens,1000);
  assert.match(input.instruction,/not additional evidence/);assert.match(input.instruction,/validation steps/);assert.match(input.instruction,/never authorizes more paid research/);
  return {data:{plans:generated(context)}};
 }});
 assert.equal(calls,1);assert.equal(result.plans.operations_bundle.steps[0].title,'Validate enquiry tracking before reviewing the nursery pilot.');
 assert.deepEqual(result.plans.operations_bundle.steps[0].findingIds,['fact']);
 for(const key of ['alternatives','logo','bhs'])assert.deepEqual(result[key],f.document[key]);
});

test('assessment cannot authorize an unsupported number, inference citation, fee, guarantee or additional service',()=>{
 const f=fixture(),context=getContext(f);context.assessment.priorities[0].analysis+=' A hypothetical target is 99 orders.';
 for(const change of [{findingIds:['hypothesis']},{action:'Deliver 99 orders for the nursery pilot.'},{action:'Add a GBP 99 fee.'},
  {action:'Guarantee orders for the nursery pilot.'},{serviceIds:['google_ads']}])
  assert.equal(applyImplementation(f.document,context,generated(context,change),'en'),f.document);
});

test('missing and older optional assessment fields degrade to the existing brief-led plan without blocking it',()=>{
 const f=fixture();f.audit.findings=[null];f.audit.meetingQuestions=[null,{internal:true}];
 const minimal={bhs:{summary:'',findings:[]}};
 assert.equal(implementationAssessment(minimal,f.audit,[]),undefined);
 const context={brief:{goals:goal},groups:[{id:'operations_bundle',services:[{id:'b2b'}]}],findings:[]};
 const result=applyImplementation(f.document,context,generated(context,{findingIds:[]}),'en');
 assert.equal(result.plans.operations_bundle.steps[0].measurement,'Review recorded enquiries before deciding whether to expand or revise.');
});
