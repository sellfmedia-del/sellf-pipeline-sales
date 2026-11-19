import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {applyImplementation,writeImplementation} from '../src/proposal/implementation-plan.mjs';

const sandbox={window:{},URL,Intl};
vm.runInNewContext(await readFile(new URL('../../offers/proposal.js',import.meta.url),'utf8'),sandbox);
const resolve=(document,steps)=>JSON.parse(JSON.stringify(sandbox.window.PipelineProposal.implementationEvidence(document,steps)));
function fixture(){
 const findings=[
  {id:'product',kind:'observation',statement:'The set specification describes the age range.',sourceIds:['spec-a','spec-b']},
  {id:'audience',kind:'observation',statement:'The guide describes sensory play in early education.',sourceIds:['guide-a','guide-b']},
  {id:'unrelated',kind:'observation',statement:'A different product is sold to households.',sourceIds:['other']}
 ];
 const document={plans:{operations_bundle:{focus:'Pilot',steps:[{time:'Step 1',title:'Selected service'}]}},
  alternatives:[{id:'operations_bundle',monthlyAmount:12000}],logo:{image:'preserved-logo'},bhs:{findings,sources:[
   {id:'spec-a',title:'Product specification',url:'https://brand.example/set?utm_source=search#size'},
   {id:'spec-b',title:'Same specification',url:'https://brand.example/set#age'},
   {id:'guide-a',title:'Early education guide',url:'https://guide.example/sensory?lang=en&utm_campaign=research'},
   {id:'guide-b',title:'Same guide',url:'https://guide.example/sensory?lang=en#section'},
   {id:'other',title:'Other product',url:'https://brand.example/other'}
  ]}};
 const context={groups:[{id:'operations_bundle',services:[{id:'b2b'}]}],brief:{goals:'Run a controlled pilot.'},findings};
 return {document,context};
}

test('one page has one plan link while separate monthly observations retain their exact finding bindings',()=>{
 const {document}=fixture(),steps=[
  {findingIds:['product'],sourceIds:['spec-a','spec-b']},
  {findingIds:['audience'],sourceIds:['guide-a','guide-b']},
  {findingIds:['audience','audience'],sourceIds:['guide-a','guide-b','guide-a']}
 ];
 const before=structuredClone({document,steps}),result=resolve(document,steps);
 assert.equal(result.sources.length,2);
 assert.deepEqual(result.steps.map(step=>step.references),[[1],[2],[2]]);
 assert.deepEqual(result.steps.map(step=>step.findings.map(f=>f.id)),[['product'],['audience'],['audience']]);
 assert.equal(result.steps[1].findings[0].statement,document.bhs.findings[1].statement);
 assert.deepEqual({document,steps},before);
});

test('unrelated, unavailable or unverified observations cannot inherit a broad page reference',()=>{
 const {document}=fixture();document.bhs.findings.push(
  {id:'inference',kind:'inference',statement:'A strategy suggestion.',sourceIds:['guide-a']},
  {id:'unverified',kind:'observation',verification:'unverified',statement:'An unchecked claim.',sourceIds:['guide-a']});
 const result=resolve(document,[
  {findingIds:['audience'],sourceIds:['spec-a','other']},
  {findingIds:['missing','inference','unverified'],sourceIds:['guide-a']},
  {findingIds:[],sourceIds:['guide-a']},
  {findingIds:null,sourceIds:['guide-a']}
 ]);
 assert.equal(result.sources.length,0);assert.ok(result.steps.every(step=>step.references.length===0));
});

test('older saved plans retain links without guessing which finding justified their actions',()=>{
 const {document}=fixture(),steps=[{sourceIds:['spec-a','spec-b']},{sourceIds:['spec-b']},{title:'Uncited step'}];
 const result=resolve(document,steps);
 assert.equal(result.sources.length,1);assert.deepEqual(result.steps.map(step=>step.references),[[1],[1],[]]);
 assert.ok(result.steps.every(step=>step.legacy&&step.findings.length===0));
});

test('distinct meaningful query values remain distinct and source numbering belongs to the selected plan',()=>{
 const {document}=fixture();document.bhs.sources.push({id:'guide-fr',title:'French guide',url:'https://guide.example/sensory?lang=fr'});
 const first=resolve(document,[{sourceIds:['guide-a','guide-fr']}]),second=resolve(document,[{sourceIds:['spec-a']}]);
 assert.equal(first.sources.length,2);assert.equal(second.sources.length,1);assert.equal(second.sources[0].number,1);
 assert.equal(first.sources[1].title,'French guide');assert.equal(second.sources[0].title,'Product specification');
});

test('invalid protocols, credentialed URLs and absent sources never become plan links',()=>{
 const {document}=fixture();
 for(const [id,url] of [['script','javascript:alert(1)'],['data','data:text/html,unsafe'],['credentials','https://user:password@example.com/path'],['malformed','https://[invalid']])
  document.bhs.sources.push({id,title:id,url});
 const result=resolve(document,[{sourceIds:['script','data','credentials','malformed','missing']}]);
 assert.deepEqual(result.sources,[]);assert.deepEqual(result.steps[0].references,[]);
});

test('TR and English generation preserve selected finding IDs, exact copy and prices without a repair call',async()=>{
 for(const language of ['tr','en']){
  const {document,context}=fixture(),before=structuredClone({document,context});let calls=0;
  const action=language==='tr'?'Ürün özelliklerini pilot talep sayfasında açıklayın.':'Describe the set specification on the pilot enquiry page.';
  const generated=[{groupId:'operations_bundle',steps:[{serviceIds:['b2b'],briefQuote:context.brief.goals,findingIds:['product'],action,
   measurement:language==='tr'?'Talep kaydını kontrol edin.':'Check the enquiry record.'}]}];
  const result=language==='tr'?await writeImplementation(document,context,{generate:async(_stage,_input,_schema,options)=>{
   calls++;assert.equal(options.maxOutputTokens,2320);return {data:{plans:generated}};
  }}):applyImplementation(document,context,generated,language);
  const step=result.plans.operations_bundle.steps[0];
  assert.deepEqual(step.findingIds,['product']);assert.deepEqual(step.sourceIds,['spec-a','spec-b']);assert.equal(step.title,action);
  assert.equal(resolve(result,[step]).sources.length,1);
  assert.deepEqual(result.alternatives,document.alternatives);assert.deepEqual(result.logo,document.logo);assert.deepEqual(result.bhs,document.bhs);
  assert.deepEqual({document,context},before);assert.equal(calls,language==='tr'?1:0);
 }
});

test('brief-led steps carry explicit empty finding IDs and never borrow general research links',()=>{
 const {document,context}=fixture();
 const result=applyImplementation(document,context,[{groupId:'operations_bundle',steps:[{serviceIds:['b2b'],briefQuote:context.brief.goals,
  findingIds:[],action:'Review the pilot enquiry records.',measurement:'Compare enquiry stages.'}]}],'en');
 assert.deepEqual(result.plans.operations_bundle.steps[0].findingIds,[]);
 assert.equal(result.plans.operations_bundle.steps[0].sourceIds,undefined);
 assert.deepEqual(resolve(result,result.plans.operations_bundle.steps).sources,[]);
});
