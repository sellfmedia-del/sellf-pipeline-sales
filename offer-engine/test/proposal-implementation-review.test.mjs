import assert from 'node:assert/strict';
import test from 'node:test';
import {randomBytes} from 'node:crypto';
import {applyImplementation,writeImplementation,implementationInstruction,implementationPlansSchema} from '../src/proposal/implementation-plan.mjs';
import {implementationReviewNotice} from '../../offers/implementation-review.mjs';
import {offerFixture,response} from './fixtures/offer.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {pricingEngine} from '../src/engines/pricing-engine.mjs';
import {createProposalHandler} from '../api/proposal.js';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {logoProof} from '../src/proposal/logo-proof.mjs';

const measurement151='Review pilot enquiries, issued quotes and confirmed orders in CRM then decide which nursery outreach channels to retain or revise based on the results.';
const trMeasurement='Pilot taleplerini, hazırlanan teklifleri ve siparişleri CRM kayıtlarında karşılaştır; kreş segmentlerini ve sürdürülecek erişim kanalını sonuçlara göre seç.';
const goal='Develop a controlled nursery outreach pilot and review the enquiry, quote and order records.';
function fixture(){
 const groups=Array.from({length:6},(_,i)=>({id:'month-'+(i+1),month:i+1,services:[{id:'b2b',name:'B2B Dijital Pazarlama'}]}));
 const document={pricingMode:'monthly',plans:{operations_bundle:{focus:'Nursery pilot',steps:groups.map(group=>({time:group.month+'. ay',title:'B2B Dijital Pazarlama'}))}},
  monthlyPlan:{months:groups.map(group=>({month:group.month,monthlyAmount:12000,services:[{id:'b2b',name:'B2B Dijital Pazarlama'}]}))},
  alternatives:[{id:'operations_bundle',monthlyAmount:12000}],logo:{image:'preserved-logo'},bhs:{findings:[{id:'f1',statement:'The supplier records nursery enquiries.'}],sources:[{id:'s1',url:'https://brand.example/'}]}};
 const context={brief:{goals:goal,needs:'',services:'B2B Dijital Pazarlama',meetingNotes:''},groups,
  findings:[{id:'f1',statement:'The supplier records nursery enquiries and quotes in the CRM.',sourceIds:['s1']}]};
 const generated=groups.map(group=>({groupId:group.id,steps:[{serviceIds:['b2b'],briefQuote:goal,findingIds:['f1'],
  action:group.month===6?'Review the nursery pilot, enquiry-to-quote-to-order conversion and decide which outreach channel to retain.':'Run a controlled outreach pilot for selected nurseries.',
  measurement:group.month===6?measurement151:'Record replies and qualified enquiries in the CRM.'}]}));
 return {document,context,generated};
}
function apply(args){let review;const result=applyImplementation(args.document,args.context,args.generated,'en',{onReview:value=>{review=value;}});return {result,review};}

test('a 151-character sixth-month measurement keeps the full pilot and channel decision instead of reverting to a service list',()=>{
 const args=fixture(),before=structuredClone(args),{result,review}=apply(args);
 assert.equal(measurement151.length,151);
 assert.equal(result.plans.operations_bundle.steps.length,6);
 assert.equal(result.plans.operations_bundle.steps[5].title,args.generated[5].steps[0].action);
 assert.equal(result.plans.operations_bundle.steps[5].measurement,measurement151);
 assert.deepEqual(result.plans.operations_bundle.steps.map(step=>step.time),args.document.plans.operations_bundle.steps.map(step=>step.time));
 assert.equal(review.groups[5].status,'normalized');
 assert.deepEqual(review.groups[5].reasons[0],{code:'copy_length_tolerance',step:1,field:'measurement',receivedLength:151,length:151,targetLength:140});
 for(const key of ['monthlyPlan','alternatives','logo','bhs'])assert.deepEqual(result[key],args.document[key]);
 assert.deepEqual(args,before);
});

test('ordinary whitespace and canonical Unicode normalize without removing a word, source reference or price',()=>{
 const args=fixture();args.generated[5].steps[0].action='  Pilot verimini\nve c\u0327ıktılarını  değerlendir.  ';
 args.generated[5].steps[0].measurement='  '+measurement151.replace(' in CRM ','\n in CRM\t ')+'  ';
 const {result,review}=apply(args);
 assert.equal(result.plans.operations_bundle.steps[5].title,'Pilot verimini ve çıktılarını değerlendir.');
 assert.equal(result.plans.operations_bundle.steps[5].measurement,measurement151);
 assert.deepEqual(result.plans.operations_bundle.steps[5].sourceIds,['s1']);
 assert.ok(review.groups[5].reasons.some(reason=>reason.code==='copy_whitespace_normalized'));
});

test('a small action overrun is retained whole under the same bounded presentation policy',()=>{
 const args=fixture();
 const action='Review recorded nursery enquiries, issued quotes and confirmed orders, compare the pilot response patterns across the selected nursery segments, and decide whether the outreach process should be retained or revised.';
 assert.ok(action.length>205&&action.length<=246);args.generated[5].steps[0].action=action;
 const {result,review}=apply(args);
 assert.equal(result.plans.operations_bundle.steps[5].title,action);
 assert.ok(review.groups[5].reasons.some(reason=>reason.code==='copy_length_tolerance'&&reason.field==='action'));
});

test('a genuinely excessive sentence is rejected visibly for that month while the other five validated months remain intact',()=>{
 const args=fixture();args.generated[5].steps[0].measurement=measurement151+' Check each retained channel against its recorded pilot outcomes.';
 const {result,review}=apply(args);
 assert.ok(result.plans.operations_bundle.steps.slice(0,5).every(step=>step.measurement));
 assert.equal(result.plans.operations_bundle.steps[5].title,args.document.plans.operations_bundle.steps[5].title);
 assert.equal(result.plans.operations_bundle.steps[5].measurement,undefined);
 assert.equal(review.groups[5].status,'rejected');assert.equal(review.groups[5].reasons[0].code,'copy_too_long');
 assert.match(implementationReviewNotice(review),/6\. ay:.*uzunluk.*başlangıç adımı korunuyor/);
});

test('the full over-target sentence still passes every commitment, amount and channel gate before it can be accepted',()=>{
 for(const [measurement,code] of [
  [measurement151+' Guaranteed.','unsafe_content'],
  [measurement151.replace('the results.','42 orders.'),'unsupported_quantity'],
  [measurement151.replace('the results.','Google Ads.'),'unpriced_channel'],
  [measurement151.replace('the results.','two weeks.'),'unapproved_timing']
 ]){
  const args=fixture();args.generated[5].steps[0].measurement=measurement;
  const {result,review}=apply(args);
  assert.equal(result.plans.operations_bundle.steps[5].measurement,undefined,measurement);
  assert.equal(review.groups[5].reasons[0].code,code);
 }
});

test('small copy overruns never relax service ownership, exact brief quotation or finding provenance',()=>{
 for(const [changes,code] of [
  [{serviceIds:['google_ads']},'service_scope_mismatch'],[{findingIds:['invented']},'finding_reference_invalid'],
  [{briefQuote:'An unapproved customer objective.'},'brief_reference_invalid'],[{briefQuote:'',findingIds:[]},'basis_missing']
 ]){
  const args=fixture();Object.assign(args.generated[5].steps[0],changes);
  const {result,review}=apply(args);
  assert.equal(result.plans.operations_bundle.steps[5].measurement,undefined);
  assert.equal(review.groups[5].reasons[0].code,code);
 }
});

test('only presentation copy has a bounded tolerance; identifiers and brief quotes retain their original contract',()=>{
 const args=fixture();args.context.brief.goals='A'.repeat(221);args.generated[5].steps[0].briefQuote=args.context.brief.goals;
 const {result,review}=apply(args);
 assert.equal(result.plans.operations_bundle.steps[5].measurement,undefined);
 assert.equal(review.groups[5].reasons[0].code,'invalid_structure');
});

test('duplicate, absent and malformed groups have explicit reasons instead of a silently accepted service-list fallback',()=>{
 const args=fixture();args.generated=[args.generated[5],args.generated[5],{groupId:'month-1',steps:'invalid'}];
 const {result,review}=apply(args);
 assert.equal(result,args.document);
 assert.equal(review.groups[5].reasons[0].code,'duplicate_group');
 assert.equal(review.groups[0].reasons[0].code,'invalid_structure');
 assert.equal(review.groups[1].reasons[0].code,'missing_plan');
 const notice=implementationReviewNotice(review);
 assert.match(notice,/6\. ay:.*çelişen plan kayıtları/);assert.match(notice,/2\. ay:.*plan dönmedi/);
});

test('seller notices do not echo model text, unknown identifiers, URLs or internal numeric diagnostics',()=>{
 const notice=implementationReviewNotice({groups:[{groupId:'<script>private-key</script>',status:'rejected',reasons:[{code:'<script>https://unsafe.example</script>',receivedLength:999999}]},
  {groupId:'unknown',status:'rejected',reasons:[{code:'constructor'}]},
  {month:6,status:'normalized',reasons:[{code:'copy_length_tolerance'}]}]});
 assert.match(notice,/Plan adımı: Plan adımı doğrulanamadı/);assert.match(notice,/6\. ay:.*anlamı kesilmeden korundu/);
 assert.doesNotMatch(notice,/<|private-key|https:|999999|function Object/);
});

test('the writer keeps its existing prompt, schema and token budget while accepting an already generated near-limit plan',async()=>{
 const args=fixture();let calls=0,review;
 const result=await writeImplementation(args.document,args.context,{generate:async(stage,input,contract,options)=>{
  calls++;assert.equal(stage,'proposal_implementation');assert.equal(input.instruction,implementationInstruction);
  assert.deepEqual(contract.properties.plans,implementationPlansSchema);
  assert.equal(contract.properties.plans.items.properties.steps.items.properties.measurement.maxLength,140);
  assert.equal(options.maxOutputTokens,2920);assert.equal(options.minOutputTokens,1000);
  return {data:{plans:structuredClone(args.generated)}};
 }},{onImplementationReview:value=>{review=value;}});
 assert.equal(calls,1);assert.equal(result.plans.operations_bundle.steps[5].measurement,measurement151);
 assert.equal(review.groups[5].status,'normalized');
 // Reapplying a retained model response is a local operation, never a repair call.
 assert.equal(apply(args).result.plans.operations_bundle.steps[5].measurement,measurement151);assert.equal(calls,1);
});

test('the signed monthly API preserves the sixth-month plan in TR and English under the separate 10 TL draft budget',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const f=await offerFixture(),brief=snapshotBrief({...f.brief,goals:goal,services:'B2B Dijital Pazarlama',needs:'Review a nursery outreach pilot.',meetingNotes:''});
  f.audit.data.briefHash=briefHash(brief);f.audit.status='ready';
  const pricing={stage:'pricing',...await pricingEngine.run({brief,pricingMode:'monthly',monthlyPlan:{months:Array.from({length:6},(_,i)=>({month:i+1,services:[{serviceId:'b2b'}]}))}},{audit:f.audit})};
  const host='implementation.preview.example',secret='synthetic-implementation-secret',session=randomBytes(32).toString('base64url'),codec=createPricingProof(secret);
  const run='12345678-1234-4234-8234-123456789012';let calls=0;
  for(const [language,invalidLast,unavailable] of [['tr',false,false],['en',false,false],['en',true,false],['tr',false,true]]){
   const ledger={begin:async()=>({chargedKurus:0,capKurus:1000}),status:async()=>({chargedKurus:125,capKurus:1000})};
   const handler=createProposalHandler({getSecret:()=>secret,getLedger:async(_req,_res,id,options)=>{
    assert.equal(id,'lead1');assert.equal(options.scope,digest(['proposal-draft-v1',run,null]));return ledger;
   },getProviders:()=>({generate:async(stage,input,_contract,options)=>{
    calls++;assert.equal(stage,language==='en'?'proposal_translation':'proposal_implementation');
    if(unavailable)throw Error('simulated provider outage');
    const plans=input.implementation.groups.map(group=>({groupId:group.id,steps:[{serviceIds:group.services.map(service=>service.id),briefQuote:input.implementation.brief.goals,findingIds:[],
     action:language==='en'?'Review the nursery pilot and choose the next outreach channel.':'Kreş pilotunu değerlendirip bir sonraki erişim kanalını seç.',measurement:group.month===6?
      (invalidLast?measurement151.replace('the results.','42 orders.'):language==='en'?measurement151:trMeasurement):
       language==='en'?'Record replies and qualified enquiries in the CRM.':'Yanıtları ve nitelikli talepleri CRM kayıtlarında izle.'}]}));
    const data={...(language==='en'?{translations:input.texts.map(text=>'EN '+text)}:{}),plans};
    options.validateData?.(data);return {model:'offline',data};
   }})});
   const body={action:'start',context:{leadId:'lead1',spaceId:'space1'},brief:{...brief,language},audit:f.audit,pricing,
    logo:{...f.logo.data,logoProof:logoProof(secret,host,f.logo.data)},proposalProof:codec.encode({kind:'pricing_ready',createdAt:Date.now(),
     briefHash:briefHash(brief),auditHash:digest(f.audit),pricingHash:digest(pricing),budgetLeadId:'lead1',budgetResearchRunId:run},session,host)};
   const before=structuredClone(body),res=response();
   await handler({method:'POST',headers:{host,origin:'https://'+host,cookie:'__Host-offer-research='+session},body},res);
   assert.equal(res.code,200);assert.equal(res.data.draftPlanStatus,unavailable?'standard':invalidLast?'partial':'brief_linked');
   assert.deepEqual(res.data.draftCost,{chargedKurus:125,capKurus:1000});
   assert.equal(res.data.draftPlanReview.groups[5].status,invalidLast||unavailable?'rejected':'normalized');
   const doc=res.data.result.data;assert.equal(doc.plans.operations_bundle.steps.length,6);
   assert.equal(doc.plans.operations_bundle.steps[5].measurement,invalidLast||unavailable?undefined:language==='en'?measurement151:trMeasurement);
   assert.equal(doc.language||'tr',language);assert.equal(doc.draftPlanReview,undefined);
   assert.deepEqual(doc.alternatives.map(row=>row.monthlyAmount),pricing.data.alternatives.map(row=>row.monthlyAmount));
   assert.equal(doc.logo.image,f.logo.data.candidates[0].image);
   assert.equal(codec.decode(res.data.saveProof,session,host,Date.now()).proposalHash,digest(res.data.result));
   if(invalidLast)assert.match(implementationReviewNotice(res.data.draftPlanReview),/6\. ay:.*sayısal iddia doğrulanamadı/);
   if(unavailable)assert.match(implementationReviewNotice(res.data.draftPlanReview),/6\. ay:.*plan oluşturulamadı/);
   assert.deepEqual(body,before);
  }
  assert.equal(calls,4);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
