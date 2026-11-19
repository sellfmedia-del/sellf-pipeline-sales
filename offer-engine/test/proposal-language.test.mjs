import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {localizeProposal,presentationSlots,proposalLanguage,validateTranslations} from '../src/proposal/language.mjs';
import {proposalEngine} from '../src/engines/proposal-engine.mjs';
import {pricingEngine} from '../src/engines/pricing-engine.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {brief as base} from './fixtures/bhs.mjs';
import {context} from './fixtures/evidence.mjs';
import {createProposalHandler} from '../api/proposal.js';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {logoProof} from '../src/proposal/logo-proof.mjs';
import {createOfferHandler} from '../api/offer.js';
import {addQuote} from '../src/pricing/currency.mjs';
import {randomUUID} from 'node:crypto';
import {teamDatabase,users,gatewayKey,tokens} from './fixtures/team-db.mjs';
import {createLedger} from '../src/budget/ledger.mjs';
import {createBoundedProviders} from '../src/budget/providers.mjs';
import {researchTariff} from '../src/bhs/research-tariff.mjs';
import {implementationContext,applyImplementation} from '../src/proposal/implementation-plan.mjs';

async function fixture(currency='TRY'){
 const brief=snapshotBrief({...base,services:'Meta ve Google Ads'}),data=context().report;
 Object.assign(data,{schemaVersion:'bhs-v1',briefHash:briefHash(brief),services:[],scoring:{total:null},quality:{checksPassed:true,semanticBenchmark:'passed'}});
 const audit={stage:'audit',status:'ready',data},pricing={stage:'pricing',...await pricingEngine.run({brief},{audit})};
 if(currency==='USD')Object.assign(pricing,addQuote(pricing,{currency,exchangeRate:{provider:'TCMB',kind:'ForexSelling',base:'USD',quote:'TRY',rate:44,publishedAt:'2026-11-04',checkedAt:'2026-11-04T08:00:00Z',source:'https://www.tcmb.gov.tr/kurlar/today.xml'}}));
 const logo={stage:'logo',status:'review',data:{generated:false,sourceType:'upload',candidates:[{image:'data:image/png;base64,AAA',quality:{transparency:true,matteStable:true,touchesEdge:false,changedSolid:0}}]}};
 return {brief,audit,pricing,logo};
}
test('language is independent of quote currency; only presentation slots change, internal audit and structural values stay exact',async()=>{
 for(const currency of ['TRY','USD']){
  const f=await fixture(currency),original=(await proposalEngine.run({brief:f.brief},f)).data,before=structuredClone(f);
  assert.equal(await localizeProposal(original,'tr'),original);
  let calls=0;
  const doc=await localizeProposal(original,'en',{providers:{async generate(stage,input,schema,options){calls++;assert.equal(stage,'proposal_translation');assert.equal(options.model,'gemini-3.8-flash');assert.ok(!JSON.stringify(input).includes('base64'));assert.ok(!JSON.stringify(input).includes('monthlyAmount'));const data={translations:input.texts.map(t=>'English: '+t)};options.validateData(data);return {data,model:options.model};}}});
  assert.equal(calls,1);assert.equal(doc.language,'en');assert.deepEqual(doc.quote,original.quote);assert.deepEqual(doc.logo,original.logo);assert.deepEqual(doc.valueSync,original.valueSync);assert.deepEqual(doc.bhs.sources,original.bhs.sources);assert.deepEqual(doc.bhs.scoring,original.bhs.scoring);
  const restored=structuredClone(doc),slots=presentationSlots(restored),oldSlots=presentationSlots(original);slots.forEach((s,i)=>s.obj[s.key]=oldSlots[i].text);delete restored.language;restored.provenance=original.provenance;
  assert.deepEqual(restored,original);assert.deepEqual(f,before);
 }
 assert.equal(proposalLanguage(), 'tr');for(const language of ['de','EN','',null])assert.throws(()=>proposalLanguage(language));
});
test('missing strings, HTML, added/changed numbers or signs are rejected; valid same-number translations pass',()=>{
 assert.doesNotThrow(()=>validateTranslations({translations:['Within 2–4 weeks.']},['2–4 hafta içinde.']));
 for(const translations of [[],['Within 3–4 weeks.'],['<script>2–4</script>'],[''],['Within 2–4 weeks.','extra']])assert.throws(()=>validateTranslations({translations},['2–4 hafta içinde.']));
 assert.throws(()=>validateTranslations({translations:['5%']},['-5%']));
 const source='Ana Sayfa > Nursery Management · 2s';
 assert.doesNotThrow(()=>validateTranslations({translations:['Home > Nursery Management · 2s']},[source]));
 for(const invalid of ['Home Nursery Management · 2s','Home >> Nursery Management · 2s','<img src=x> Nursery Management · 2s','Home > Nursery Management · 3s'])
  assert.throws(()=>validateTranslations({translations:[invalid]},[source]));
});
test('API signs the English snapshot and charges only the independent draft budget',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const f=await fixture(),secret='test-secret-language',session='s'.repeat(43),host='preview.vercel.app',codec=createPricingProof(secret),run='00000000-0000-4000-8000-000000000001';let ledgers=0;
  const body={action:'start',context:{leadId:'lead1',spaceId:'space1'},brief:{...f.brief,language:'en'},audit:f.audit,pricing:f.pricing,logo:{...f.logo.data,logoProof:logoProof(secret,host,f.logo.data)},proposalProof:codec.encode({kind:'pricing_ready',createdAt:Date.now(),briefHash:briefHash(f.brief),auditHash:digest(f.audit),pricingHash:digest(f.pricing),budgetLeadId:'lead1',budgetResearchRunId:run},session,host)};
  const request=body=>({method:'POST',headers:{host,origin:'https://'+host,cookie:'__Host-offer-research='+session},body});
  const response=()=>({setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}});
  const ledger={begin:async()=>({chargedKurus:0,capKurus:1000}),status:async()=>({chargedKurus:270,capKurus:1000})};
  const options={getSecret:()=>secret,getLedger:async(req,res,id,opts)=>{ledgers++;assert.equal(id,'lead1');assert.deepEqual(opts,{scope:digest(['proposal-draft-v1',run,null])});return ledger;},getProviders:()=>({generate:async(stage,input)=>({model:'test',data:{translations:input.texts.map(t=>'English: '+t)}})})};
  const res=response();await createProposalHandler(options)(request(body),res);assert.equal(res.code,200);assert.equal(res.data.result.data.language,'en');assert.equal(res.data.draftCost.chargedKurus,270);assert.equal(res.data.cost,undefined);
  const claims=codec.decode(res.data.saveProof,session,host,Date.now());assert.equal(claims.proposalHash,digest(res.data.result));
  let stored;
  const save=createOfferHandler({getSecret:()=>secret,getStore:()=>({configured:()=>true,portalConfigured:()=>false,async save(token,body){stored=body;return {id:'saved',version:1};}})});
  const saveRequest=request({action:'save',leadId:'lead1',spaceId:'space1',proposal:res.data.result,pricing:f.pricing,saveProof:res.data.saveProof,logoApproved:true,scopeApproved:true});saveRequest.headers.authorization='Bearer '+'x'.repeat(40);
  const saved=response();await save(saveRequest,saved);assert.equal(saved.code,200);assert.equal(stored.p_document.language,'en');assert.deepEqual(stored.p_document.alternatives,res.data.result.data.alternatives);
  const tr=response();await createProposalHandler(options)(request({...body,brief:{...f.brief,language:'tr'}}),tr);assert.equal(tr.code,200);assert.equal(ledgers,1);
  const failed=response();await createProposalHandler({...options,getProviders:()=>({generate:async()=>{throw Object.assign(Error('limit'),{code:'budget_limit'});}})})(request(body),failed);assert.equal(failed.code,422);assert.equal(failed.data.code,'budget_limit');assert.equal(failed.data.result,undefined);assert.equal(failed.data.draftCost.chargedKurus,270);
  const invalid=response();await createProposalHandler(options)(request({...body,brief:{...f.brief,language:'de'}}),invalid);assert.equal(invalid.code,422);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('English contract email uses the saved quote and localised labels without changing recipients or URLs',async()=>{
 const sandbox={window:{},URL,Intl};vm.runInNewContext(await readFile('../offers/proposal.js','utf8'),sandbox);
 for(const currency of ['TRY','USD']){
  const f=await fixture(currency),doc=(await proposalEngine.run({brief:f.brief},f)).data;doc.language='en';doc.version=1;doc.alternatives[1].name='Operations Package';
  const mail=new URL(sandbox.window.PipelineProposal.buildMailto(doc,{offerUrl:'https://preview.vercel.app/brand-teklifi',offerId:'offer1',alternativeId:'operations_bundle',name:'Jane Smith',email:'jane@example.com'}));
  assert.equal(mail.pathname,'yigit@sellfmedia.com,businessdevelopment@sellfmedia.com');assert.match(mail.searchParams.get('subject'),/^Contract request/);assert.match(mail.searchParams.get('body'),new RegExp(currency+' / month'));assert.ok(mail.searchParams.get('body').includes('Monthly service fee:'));
 }
});

async function scopedDraft(){
 const {audit,logo}=await fixture();
 const brief=snapshotBrief({...base,brandName:'Muffik',website:'https://muffik.example',
  goals:'Birleşik Krallık bağımsız kreşlerinde Royal seti için pilot',
  needs:'Royal açılış sayfası, yaş ve oda büyüklüğüne göre teklif, talep → teklif → sipariş takibi',
  services:'Royal sayfası ve seçili kreşlere erişim',meetingNotes:'Birleşik Krallık bağımsız kreşleri seçildi.'});
 const source=(id,url,method)=>({id,url,title:id,verification:{status:'quote_matched',method}});
 audit.data.briefHash=briefHash(brief);
 audit.data.sources=[source('royal','https://muffik.example/royal','html'),source('snippet','https://search.example','search-snippet')];
 audit.data.findings=[
  {id:'royal-observation',kind:'observation',dimension:'operations',priority:'high',sourceIds:['royal'],
   statement:'Royal seti ürün sayfası kullanım yaşı ve oda boyutuna göre set seçimini açıklıyor. Ürün fiyatı £204, normal fiyatı £240.'},
  {id:'unread-demand',kind:'observation',dimension:'operations',priority:'high',sourceIds:['snippet'],statement:'Kreşlere satış garantili.'}
 ];
 const standard={brief,serviceSelection:{alternatives:[
  {id:'growth_operations',services:[{serviceId:'growth_initial'},{serviceId:'b2b'}]},
  {id:'operations_bundle',services:[{serviceId:'b2b'}]}],projects:[{serviceId:'project_wordpress'}]}};
 const pricing={stage:'pricing',...await pricingEngine.run(standard,{audit})};
 return {brief,audit,pricing,logo};
}
const step=(serviceIds,action,measurement,findingIds=[])=>({serviceIds,action,measurement,briefQuote:'Royal',findingIds});
test('signed Turkish and English drafts each compose one brief-specific plan on the same independent account and retain exact prices',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const f=await scopedDraft(),secret='scoped-draft-secret',session='k'.repeat(43),host='preview.vercel.app';
  const codec=createPricingProof(secret),run='00000000-0000-4000-8000-000000000002';
  const body={action:'start',context:{leadId:'lead1',spaceId:'space1'},brief:f.brief,audit:f.audit,pricing:f.pricing,
   logo:{...f.logo.data,logoProof:logoProof(secret,host,f.logo.data)},proposalProof:codec.encode({kind:'pricing_ready',createdAt:Date.now(),
    briefHash:briefHash(f.brief),auditHash:digest(f.audit),pricingHash:digest(f.pricing),budgetLeadId:'lead1',budgetResearchRunId:run},session,host)};
  const request=body=>({method:'POST',headers:{host,origin:'https://'+host,cookie:'__Host-offer-research='+session},body});
  const response=()=>({setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
  const calls=[];
  const ledger={begin:async()=>({chargedKurus:0,capKurus:1000}),status:async()=>({chargedKurus:145,capKurus:1000})};
  const getLedger=async(_req,_res,id,opts)=>{
   assert.equal(id,'lead1');assert.equal(opts.scope,digest(['proposal-draft-v1',run,null]));return ledger;
  };
  const handler=createProposalHandler({getSecret:()=>secret,getLedger,getProviders:({ledger:used})=>{
   assert.equal(used,ledger);
   return {generate:async(stage,input,contract,options)=>{
    calls.push(stage);
    assert.deepEqual(input.implementation.findings.map(f=>f.id),['royal-observation']);
    assert.ok(!/base64|monthlyAmount|costSnapshot|Kreşlere satış garantili/.test(JSON.stringify(input.implementation)));
    assert.equal(input.implementation.brief.goals,f.brief.goals);
    const english=input.language==='en';
    const steps=[
     step(['project_wordpress'],english?'Build the Royal launch page for UK nurseries.':'Royal için Birleşik Krallık kreşlerine yönelik açılış sayfası hazırla.',
      english?'Check that the enquiry form records the nursery and room details.':'Talep formunda kreş ve oda bilgilerinin kaydedildiğini kontrol et.',['royal-observation']),
     step(['b2b'],english?'Run outreach to selected independent UK nurseries.':'Seçili Birleşik Krallık bağımsız kreşlerine Royal pilotu için eriş.',
      english?'Record replies and qualified enquiries by nursery.':'Yanıtları ve nitelikli talepleri kreş bazında kaydet.'),
     step(['b2b'],english?'Prepare a Royal quote by age group and room size.':'Yaş grubu ve oda büyüklüğüne göre Royal teklifi hazırla.',
      english?'Check that the quote matches the age and room details.':'Her teklifi yaş ve oda bilgileriyle karşılaştır.',['royal-observation']),
     step(['b2b'],english?'Link each enquiry, quote and order before reviewing the pilot.':'Pilot değerlendirmesi için talep, teklif ve sipariş kayıtlarını eşleştir.',
      english?'Compare progress from enquiry to quote to order.':'Talep, teklif ve sipariş geçişlerini karşılaştır.')
    ];
    const plans=[{groupId:'growth_operations',steps:[...steps.slice(0,3),{...steps[3],serviceIds:['b2b','growth_initial']}]},
     {groupId:'operations_bundle',steps}];
    const data={...(english?{translations:input.texts.map(text=>'EN '+text)}:{}),plans};
    options.validateData?.(data);return {model:'offline',data};
   }};
  }});
  for(const language of ['tr','en']){
   const res=response();await handler(request({...body,brief:{...f.brief,language}}),res);
   assert.equal(res.code,200);assert.equal(res.data.draftPlanStatus,'brief_linked');
   assert.deepEqual(res.data.draftCost,{chargedKurus:145,capKurus:1000});
   const result=res.data.result.data,steps=result.plans.operations_bundle.steps;
   assert.deepEqual(result.alternatives.map(a=>a.monthlyAmount),f.pricing.data.alternatives.map(a=>a.monthlyAmount));
   assert.equal(result.projectPlan.oneTimeAmount,f.pricing.data.projectPlan.oneTimeAmount);
   assert.equal(result.logo.image,f.logo.data.candidates[0].image);
   assert.equal(steps.length,4);
   assert.match(steps[2].title,language==='en'?/age group and room size/:/Yaş grubu ve oda büyüklüğüne/);
   assert.match(steps[3].measurement,language==='en'?/enquiry to quote to order/:/Talep, teklif ve sipariş/);
   assert.deepEqual(steps[0].sourceIds,['royal']);
   assert.deepEqual(steps[0].findingIds,['royal-observation']);
   assert.deepEqual(steps[1].findingIds,[]);
   assert.equal(result.language||'tr',language);
   assert.equal(codec.decode(res.data.saveProof,session,host,Date.now()).proposalHash,digest(res.data.result));
  }
  assert.deepEqual(calls,['proposal_implementation','proposal_translation']);
  const failed=response();
  await createProposalHandler({getSecret:()=>secret,getLedger,getProviders:()=>({generate:async()=>{throw Error('simulated unavailable');}})})(request(body),failed);
  assert.equal(failed.code,200);assert.equal(failed.data.draftPlanStatus,'standard');
  assert.deepEqual(failed.data.result.data.alternatives.map(a=>a.monthlyAmount),f.pricing.data.alternatives.map(a=>a.monthlyAmount));
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});

test('the monthly implementation validates service ownership, source links and offers without altering assignments',async()=>{
 const f=await scopedDraft();
 const pricing={stage:'pricing',...await pricingEngine.run({brief:f.brief,pricingMode:'monthly',monthlyPlan:{months:[
  {month:1,services:[],projects:[{serviceId:'project_wordpress'}]},{month:2,services:[{serviceId:'b2b'}]}
 ]}},{audit:f.audit})};
 const {data:doc}=await proposalEngine.run({brief:f.brief,planMode:'operations'},{...f,pricing});
 const context=implementationContext(doc,f.brief,f.audit.data,pricing.data,'operations');
 assert.equal(implementationContext(doc,f.brief,f.audit.data,pricing.data,'manual'),null);
 const first=step(['project_wordpress'],'Royal açılış sayfasını hazırlayın.','Yaş ve oda alanlarını kontrol edin.',['royal-observation']);
 const second=step(['b2b'],'Seçili kreşlere Royal pilot teklifini iletin.','Talep, teklif ve sipariş kayıtlarını eşleştirin.');
 const result=applyImplementation(doc,context,[{groupId:'month-2',steps:[second]},{groupId:'month-1',steps:[first]}],'tr');
 assert.deepEqual(result.monthlyPlan,doc.monthlyPlan);
 assert.deepEqual(result.plans.operations_bundle.steps.map(s=>s.time),['1. ay','2. ay']);
 assert.deepEqual(result.plans.operations_bundle.steps.map(s=>s.title),[first.action,second.action]);
 for(const invalid of [
  {...first,serviceIds:['b2b']},{...first,findingIds:['unread-demand']},{...first,briefQuote:'Onaylanmamış pazar'},
  {...first,action:'Royal için 42 dönüşüm taahhüt edin.'},{...first,action:'Royal için €204 ücret ekleyin.'},
  {...first,action:'Royal için Google Ads Reklam Yönetimi ekleyin.'}
 ])assert.equal(applyImplementation(doc,context,[{groupId:'month-1',steps:[invalid]}],'tr'),doc);
});

test('a registered teammate with a fully used BHS budget can produce an English draft, and PostgreSQL caps separate draft reservations at 10 TL',async()=>{
 const {db,rpc,gateway,apply}=await teamDatabase();
 try{
  await db.exec(await readFile(new URL('../../supabase/migrations/20261117150000_independent_offer_draft_budget.sql',import.meta.url),'utf8'));
  await apply();
  const scope='a'.repeat(64);
  const draftRequest=(op,args={})=>gateway(new Request('https://fixture.example',{
   method:'POST',headers:{'x-offer-store-key':gatewayKey},
   body:JSON.stringify({action:'draft_budget',jwt:tokens[1],leadId:'lead-1',scope,op,...args})
  }));
  assert.equal((await draftRequest('begin')).status,422);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261117163000_offer_draft_team_access.sql',import.meta.url),'utf8'));
  await assert.rejects(rpc('pipeline_offer_draft_budget_op',{
   p_owner:randomUUID(),p_lead:'lead-1',p_scope:scope,p_op:'begin'
  }),/team lead required/);
  const research=(p_op,extra={})=>rpc('pipeline_offer_production_budget_op',{p_owner:users[1],p_lead:'lead-1',p_op,...extra});
  await research('begin');
  await research('reserve',{p_step:'research:test',p_hash:'f'.repeat(64),p_token:randomUUID(),p_amount:4500});
  const draft=(op,args={})=>draftRequest(op,args).then(async response=>{assert.equal(response.status,200);return response.json();});
  const ledger=createLedger(draft);
  assert.deepEqual(await ledger.begin(),{chargedKurus:0,capKurus:1000});
  const f=await fixture(),original=(await proposalEngine.run({brief:f.brief},f)).data;
  original.bhs.summary='Ana Sayfa > Nursery Management · 2s';
  let generations=0;
  const providers=createBoundedProviders({ledger,geminiKey:'test',defaultModel:'gemini-2.5-flash',pricing:researchTariff,
   now:()=>Date.parse('2026-11-17T14:21:00Z'),researchFx:async()=>({usdTry:44,publishedAt:'2026-11-17'}),
   fetchImpl:async(url,options)=>{
    if(url.endsWith(':countTokens'))return Response.json({totalTokens:850});
    assert.ok(url.endsWith(':generateContent'));
    generations++;
    const body=JSON.parse(options.body);
    assert.ok(body.generationConfig.maxOutputTokens<16384);
    const {texts,implementation}=JSON.parse(body.contents[0].parts[0].text);
    const translated=JSON.stringify({translations:texts.map(s=>'English '+s)});
    return Response.json({modelVersion:'gemini-2.5-flash',usageMetadata:{promptTokenCount:850,candidatesTokenCount:600,totalTokenCount:1450},
     candidates:[{finishReason:implementation?'MAX_TOKENS':'STOP',content:{parts:[{text:implementation?translated.slice(0,-1)+',"plans":[{"groupId":':translated}]}}]});
   }});
  const english=await localizeProposal(original,'en',{providers});
  assert.equal(english.language,'en');
  assert.deepEqual(english.logo,original.logo);
  assert.deepEqual(english.quote,original.quote);
  assert.deepEqual(await localizeProposal(original,'en',{providers}),english);
  assert.equal(generations,1);
  const scoped=await scopedDraft(),scopedDocument=(await proposalEngine.run({brief:scoped.brief},scoped)).data;
  const implementation=implementationContext(scopedDocument,scoped.brief,scoped.audit.data,scoped.pricing.data,'growth');
  const clipped=await localizeProposal(scopedDocument,'en',{providers,implementation});
  assert.equal(clipped.language,'en');
  assert.deepEqual(clipped.alternatives.map(a=>a.monthlyAmount),scopedDocument.alternatives.map(a=>a.monthlyAmount));
  assert.ok(clipped.plans.operations_bundle.steps[0].title.startsWith('English '));
  assert.equal(generations,2);
  const used=(await ledger.status()).chargedKurus;
  assert.ok(used>0&&used<1000);
  const step=i=>({step:'model:proposal_translation:'+String(i).repeat(64),hash:'f'.repeat(64),token:randomUUID(),amount:1000-used});
  const claims=await Promise.all([draft('reserve',step(1)),draft('reserve',step(2))]);
  assert.equal(claims.filter(result=>result.claimed).length,1);
  assert.equal(claims.filter(result=>result.blocked).length,1);
  const reserved=claims.find(result=>result.claimed).step;
  await draft('uncertain',{step:reserved.step_key,hash:reserved.input_hash,token:reserved.claim_token,value:{code:'model_timeout'}});
  assert.deepEqual(await ledger.status(),{chargedKurus:1000,capKurus:1000});
  assert.equal((await draft('reserve',{...step(3),amount:1})).blocked,true);
  assert.equal((await research('status')).chargedKurus,5000);
  await assert.rejects(db.transaction(async tx=>{
   await tx.exec('set local role authenticated');
   await tx.query('select * from public.pipeline_offer_draft_budgets');
  }),/permission denied/);
 }finally{await db.close();}
});
