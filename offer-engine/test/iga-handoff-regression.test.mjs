import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceConversation,readConversation,persistConversationResult} from '../src/bhs/conversation-engine.mjs';
import {createConversationProviders,conversationTransportVersion} from '../src/bhs/conversation-providers.mjs';
import {conversationKeys,conversationVersion} from '../src/bhs/conversation-contract.mjs';
import {researchWorkPolicyVersion} from '../src/bhs/conversation-work.mjs';
import {marketAnalysisVersion} from '../src/bhs/conversation-market.mjs';
import {conversationAuditResult} from '../src/bhs/conversation-report.mjs';
import {draftBudgetFor} from '../src/budget/ledger.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {logoProof} from '../src/proposal/logo-proof.mjs';
import {createPricingHandler} from '../api/pricing.js';
import {createProposalHandler} from '../api/proposal.js';
import {createOfferHandler} from '../api/offer.js';
import {brief,marketResearchSummary,memoryLedger,report,researchedReport,researchProgressInput,researchSources,
 semanticApproval,source} from './fixtures/bhs-conversation.mjs';
import {offerFixture,response} from './fixtures/offer.mjs';

const now=()=>Date.parse('2026-11-23T13:38:00Z'),id=briefHash(brief);
const reply=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers});
const nativeError=()=>reply({error:{type:'invalid_request_error',message:'Tools schema failed compilation. SUPPLIED_PRIVATE_INPUT'}},400,{'request-id':'req_synthetic_reject'});

test('a rejected Claude research request hands the same BHS to funded research, then writes and reviews it without repeating the rejection',async()=>{
 const {ledger,total}=memoryLedger();
 await ledger.once(conversationKeys.policy(id),{},0,async()=>({engine:conversationVersion,transportVersion:conversationTransportVersion,
  analysisVersion:marketAnalysisVersion,reviewPolicyVersion:researchWorkPolicyVersion}));
 const final=researchedReport();
 const decisions=[
  ['read_pages',{urls:[source.url],purpose:'marka'}],
  ['search_web',{query:'Seçili pazar ve rakip',purpose:'pazar'}],
  ['read_pages',{urls:researchSources.slice(1).map(s=>s.url),purpose:'rakip ve pazar sayfaları'}],
  ['review_research',researchProgressInput()],
  ['begin_report',marketResearchSummary()],
  ['review_bhs',semanticApproval(final,{reviewPolicyVersion:researchWorkPolicyVersion})]
 ];
 let claudeCounts=0,claudeWrites=0,geminiDecisions=0,geminiWrites=0,toolsCounted;
 const providers=createConversationProviders({ledger,now,anthropicKey:'synthetic',geminiKey:'synthetic',tavilyKey:'synthetic',apifyToken:null,
  researchFx:()=>({usdTry:50}),fetchImpl:async(url,init)=>{
   const body=JSON.parse(init.body);
   if(url.endsWith('/count_tokens')){claudeCounts++;toolsCounted=body.tools;return reply({input_tokens:1200});}
   if(url.endsWith('/v1/messages')){claudeWrites++;assert.deepEqual(body.tools,toolsCounted);
    assert.equal(body.tools.find(t=>t.name==='review_bhs').strict,undefined);
    assert.equal(body.tools.find(t=>t.name==='finish_bhs').strict,true);
    return nativeError();}
   if(url.endsWith(':countTokens'))return reply({totalTokens:1800});
   assert.match(url,/:generateContent$/u);
   const payload=JSON.parse(body.contents[0].parts[0].text);
   assert.ok(JSON.stringify(payload).includes(brief.goals));
   let output;
   if(payload.tools){
    const [name,input]=decisions[geminiDecisions++];
    assert.ok(payload.tools.some(t=>t.name===name));
    if(geminiDecisions>1)assert.ok(JSON.stringify(payload).includes(source.text));
    output={name,input};
   }else{geminiWrites++;assert.equal(body.generationConfig.maxOutputTokens,20000);assert.ok(geminiDecisions>=5);output=final;}
   return reply({modelVersion:'gemini-3.8-flash',candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(output)}]}}],
    usageMetadata:{promptTokenCount:1700,candidatesTokenCount:400}});
  }});
 let searches=0,reads=[];
 providers.search=async()=>{searches++;return {results:researchSources.slice(1).map(s=>({...s,method:'search-snippet'}))};};
 providers.extract=async({urls},options)=>{assert.ok(options.remainingReserve>600);reads.push(...urls);return {results:researchSources.filter(s=>urls.includes(s.url))};};
 for(let i=0;i<7;i++)await advanceConversation({brief,ledger,id,providers,now});
 const state=await readConversation(ledger,id),saved=await persistConversationResult({brief,ledger,id,now});
 const rejected=await ledger.get('model:conversation:claude-request:'+id+':0');
 assert.equal(rejected.charge_kurus,0);assert.equal(rejected.value.providerRequestId,'req_synthetic_reject');
 assert.deepEqual(rejected.value.parameterHints,['tool_schema']);assert.doesNotMatch(JSON.stringify(rejected),/SUPPLIED_PRIVATE_INPUT/);
 assert.equal(state.turns[0].toolIssues[0].providerReason,'invalid_request_error');
 assert.equal(claudeCounts,1);assert.equal(claudeWrites,1);assert.equal(geminiWrites,1);assert.equal(geminiDecisions,6);
 assert.equal(searches,1);assert.deepEqual(reads,researchSources.map(s=>s.url));assert.ok(total()<=5000);
 assert.equal(saved.conversationReport.reportMarkdown,final.reportMarkdown);
 assert.equal(conversationAuditResult(brief,saved).data.quality.contentComplete,true);
 const charged=total();await advanceConversation({brief,ledger,id,providers,now});assert.equal(total(),charged);
});

test('partial BHS actions survive a writer failure on the signed monthly proposal and persist in the saved draft',async t=>{
 const startedAt=Date.now(),now=()=>startedAt;
 const previous=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 t.after(()=>{if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;});
 const b=snapshotBrief({...brief,goals:'Yıllık üyelikte retention ve B2B büyümesi',needs:'CRM ve kurumsal paketler'});
 const raw=report();
 raw.reportMarkdown+='\n## Büyüme planı\n### Kurumsal satış\n* **Aksiyon:** Kurumsal B2B satın alma yolunu değerlendir.\n* **Ölçüm:** B2B sözleşmelerinden gelen dönüşümü izle.\n'+
  '### Üyelik\n* **Aksiyon:** CRM verisi ile üst pakete geçişi değerlendir.\n* **Ölçüm:** Yenileme oranı ve paketler arası geçiş.\n'+
  '### Kesinleşmemiş anlaşma\n* **Aksiyon:** 2027 anlaşması için öncelikli erişim sözü ver.\n* **Ölçüm:** Duyuru sonrası talep.\n'+
  '## Önceliklendirilmiş fırsatlar ve aksiyonlar\n'+
  '**Öncelik 1 – Yenileme yolculuğu (CRM).** Yıllık üyeler için yenileme akışı kur. Neden: LTV için yenileme önemlidir. Nasıl: Üyeye kullanım özeti gönder. Ölçüm: Yıllık yenileme oranı.\n'+
  '**Öncelik 2 – Google Ads.** Google Ads kampanyası aç. Ölçüm: Reklam dönüşümleri.';
 const audit={stage:'audit',...conversationAuditResult(b,{conversationReport:raw,conversationSources:[],reason:'semantic_review_unavailable'})};
 const secret='synthetic-iga-regression',session='S'.repeat(43),host='preview.vercel.app',context={leadId:'lead-1',spaceId:'space-1'};
 const request=body=>({method:'POST',headers:{host,origin:'https://'+host,cookie:'__Host-offer-research='+session,authorization:'Bearer '+'X'.repeat(40)},body:JSON.parse(JSON.stringify(body))});
 const codec=createPricingProof(secret),proof=codec.encode({kind:'audit_ready',createdAt:now(),briefHash:briefHash(b),auditHash:digest(audit),budgetLeadId:context.leadId},session,host);
 const priced=response();
 await createPricingHandler({getSecret:()=>secret,now})(request({action:'start',brief:b,audit,pricingProof:proof,pricingMode:'monthly',
  monthlyPlan:{months:[{month:1,services:[{serviceId:'account',description:'Özel açılış açıklaması'}]},{month:2,services:[{serviceId:'b2b'},{serviceId:'email_marketing'}]},{month:3,services:[{serviceId:'email_marketing'}]}]}}),priced);
 assert.equal(priced.code,200,JSON.stringify(priced.data));
 const {logo}=await offerFixture(),args={action:'start',brief:b,audit,context,pricing:priced.data.result,proposalProof:priced.data.proposalProof,
  logo:{...logo.data,logoProof:logoProof(secret,host,logo.data)},planMode:'operations'};
 let writers=0;const warnings=[];
 const h=createProposalHandler({getSecret:()=>secret,now,logger:{warn:value=>warnings.push(JSON.parse(value))},
  getLedger:async()=>({begin:async()=>({capKurus:1000,chargedKurus:0}),status:async()=>({capKurus:1000,chargedKurus:0})}),
  getProviders:()=>({generate:async(_stage,input)=>{writers++;assert.equal(input.implementation.proposedActions[0].action,'Kurumsal B2B satın alma yolunu değerlendir.');throw Error('synthetic writer failure');}})});
 const out=response();await h(request(args),out);assert.equal(out.code,200,JSON.stringify(out.data));
 const steps=out.data.result.data.plans.operations_bundle.steps;
 assert.equal(steps[0].bhsActions,undefined);assert.equal(steps[2].bhsActions,undefined);
 assert.deepEqual(steps[1].bhsActions.map(a=>a.measurement),['Pilot için nitelikli kurumsal görüşme ve teklife geçiş sayılarını izle.',
  'Pilot grubunda paket geçişini ve yenileme oranını ayrı ayrı izle.']);
 assert.doesNotMatch(JSON.stringify(steps),/öncelikli erişim sözü/);
 assert.equal(out.data.draftPlanStatus,'bhs_retained');
 assert.deepEqual(out.data.result.data.monthlyPlan.months.map(m=>m.monthlyAmount),priced.data.result.data.monthlyPlan.months.map(m=>m.monthlyAmount));
 const invalid=response();await h(request({...args,logo:logo.data}),invalid);assert.equal(invalid.data.code,'proposal_logo');assert.equal(writers,1);
 assert.equal(invalid.headers['X-Offer-Request-Id'],warnings.at(-1).requestId);
 const saved=response();
 await createOfferHandler({getSecret:()=>secret,now,getStore:()=>({save:async(_jwt,data)=>{
  assert.deepEqual(data.p_document.plans.operations_bundle.steps,steps);return {id:'synthetic-draft',version:1};
 }})})(request({action:'save',...context,proposal:out.data.result,pricing:priced.data.result,saveProof:out.data.saveProof,logoApproved:true,scopeApproved:true}),saved);
 assert.equal(saved.code,200,JSON.stringify(saved.data));

 const optedIn=response();await h(request({...args,bhsCalendar:true}),optedIn);
 assert.equal(optedIn.code,200,JSON.stringify(optedIn.data));
 const calendar=optedIn.data.result.data,scheduled=calendar.plans.operations_bundle.steps;
 assert.deepEqual(calendar.monthlyPlan,out.data.result.data.monthlyPlan);
 assert.deepEqual(scheduled.map(s=>s.title),steps.map(s=>s.title));
 assert.match(scheduled[0].title,/Özel açılış açıklaması/);
 assert.notEqual(optedIn.data.result.inputHash,out.data.result.inputHash);
 assert.deepEqual(scheduled[1].bhsActions.map(({title,measurement,recommendation})=>({title,measurement,recommendation})),[
  {title:'Yıllık üyeler için yenileme akışı kur. Üyeye kullanım özeti gönder.',measurement:'Yıllık yenileme oranı.',recommendation:true},
  {title:'Kurumsal B2B satın alma yolunu değerlendir.',measurement:'B2B sözleşmelerinden gelen dönüşümü izle.',recommendation:true}
 ]);
 assert.equal(scheduled[2].bhsActions[0].title,'CRM verisi ile üst pakete geçişi değerlendir.');
 assert.doesNotMatch(JSON.stringify(scheduled),/Google Ads kampanyası|erişim sözü|LTV için yenileme/);
 const savedCalendar=response();
 await createOfferHandler({getSecret:()=>secret,now,getStore:()=>({save:async(_jwt,data)=>{
  assert.deepEqual(data.p_document.plans.operations_bundle.steps,scheduled);return {id:'synthetic-calendar',version:2};
 }})})(request({action:'save',...context,proposal:optedIn.data.result,pricing:priced.data.result,saveProof:optedIn.data.saveProof,logoApproved:true,scopeApproved:true}),savedCalendar);
 assert.equal(savedCalendar.code,200,JSON.stringify(savedCalendar.data));

 const retainer=response();
 await createPricingHandler({getSecret:()=>secret,now})(request({action:'start',brief:b,audit,pricingProof:proof,
  serviceSelection:{alternatives:[
   {id:'growth_operations',services:[{serviceId:'email_marketing'}]},
   {id:'operations_bundle',services:[{serviceId:'b2b'}]}
  ]}}),retainer);
 assert.equal(retainer.code,200,JSON.stringify(retainer.data));
 const retained=response();
 await h(request({...args,pricing:retainer.data.result,proposalProof:retainer.data.proposalProof,bhsCalendar:true,
  planMode:'manual',manualSteps:[{time:'İlk görüşme',title:'Elle yazılan başlangıç adımı'}]}),retained);
 assert.equal(retained.code,200,JSON.stringify(retained.data));
 const {growth_operations:growth,operations_bundle:operations}=retained.data.result.data.plans;
 assert.equal(growth.steps[0].title,'Elle yazılan başlangıç adımı');
 assert.ok(growth.steps[0].bhsActions.every(row=>row.recommendation&&row.serviceIds.join(',')==='email_marketing'));
 assert.deepEqual(operations.steps[0].bhsActions.map(row=>row.serviceIds),[['b2b']]);

 const enriched=response();
 await createProposalHandler({getSecret:()=>secret,now,
  getLedger:async()=>({begin:async()=>({capKurus:1000,chargedKurus:0}),status:async()=>({capKurus:1000,chargedKurus:0})}),
  getProviders:()=>({generate:async()=>({data:{plans:[
   {groupId:'growth_operations',steps:[{serviceIds:['email_marketing'],briefQuote:'retention',findingIds:[],action:'Üyelik e-posta akışını hazırla.',measurement:'Yenileme e-postası etkileşimini izle.'}]},
   {groupId:'operations_bundle',steps:[{serviceIds:['b2b'],briefQuote:'B2B büyümesi',findingIds:[],action:'Kurumsal görüşme planını hazırla.',measurement:'Görüşmeden teklife geçişi izle.'}]}
  ]}})})})(request({...args,pricing:retainer.data.result,proposalProof:retainer.data.proposalProof,bhsCalendar:true}),enriched);
 assert.equal(enriched.code,200,JSON.stringify(enriched.data));
 assert.equal(enriched.data.draftPlanStatus,'brief_linked');
 assert.deepEqual(enriched.data.result.data.alternatives,retained.data.result.data.alternatives);
 assert.deepEqual(enriched.data.result.data.plans.growth_operations.steps[0].bhsActions,growth.steps[0].bhsActions);
 assert.deepEqual(enriched.data.result.data.plans.operations_bundle.steps[0].bhsActions,operations.steps[0].bhsActions);
});

test('the existing draft gateway namespace accepts implementation receipts without changing translation identities',async t=>{
 const previous=Object.fromEntries(['VERCEL_ENV','OFFER_PRODUCTION_ENABLED'].map(k=>[k,process.env[k]]));
 Object.assign(process.env,{VERCEL_ENV:'production',OFFER_PRODUCTION_ENABLED:'true'});
 t.after(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 const items=[],stored=new Map();
 const ledger=await draftBudgetFor({headers:{authorization:'Bearer '+'X'.repeat(40)}},response(),'lead-1',{scope:'a'.repeat(64),store:{call:async(action,args)=>{
  assert.equal(action,'draft_budget');const {op,step,amount,value}=args;
  if(op==='begin'||op==='status')return {capKurus:1000,chargedKurus:0};
  assert.match(step,/^model:proposal_translation:[a-f0-9]{64}$/u);items.push([op,step]);
  if(op==='get')return stored.get(step);
  if(op==='reserve'){
   if(stored.has(step))return {claimed:false,step:stored.get(step)};
   return {claimed:true};
  }
  assert.equal(op,'complete');const result={state:'complete',charge_kurus:amount,value};stored.set(step,result);return result;
 }}});
 const key='a'.repeat(64),translate='model:proposal_translation:'+key,implementation='model:proposal_implementation:'+key;
 let writes=0;
 for(const step of [translate,implementation,implementation])
  await ledger.once(step,{step},9,async()=>{writes++;return {accountedKurus:9};});
 assert.equal(writes,2);assert.equal(items[0][1],translate);
 assert.equal(stored.size,2);assert.ok([...stored].every(([step])=>step.startsWith('model:proposal_translation:')));
});
