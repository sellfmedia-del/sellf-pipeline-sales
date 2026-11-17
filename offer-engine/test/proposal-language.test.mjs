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

test('a fully used BHS budget can produce an English draft, and PostgreSQL caps separate draft reservations at 10 TL',async()=>{
 const {db,rpc,gateway}=await teamDatabase();
 try{
  await db.exec(await readFile(new URL('../../supabase/migrations/20261117150000_independent_offer_draft_budget.sql',import.meta.url),'utf8'));
  const research=(p_op,extra={})=>rpc('pipeline_offer_production_budget_op',{p_owner:users[0],p_lead:'lead-1',p_op,...extra});
  await research('begin');
  await research('reserve',{p_step:'research:test',p_hash:'f'.repeat(64),p_token:randomUUID(),p_amount:4500});
  const scope='a'.repeat(64),draft=(op,args={})=>gateway(new Request('https://fixture.example',{
   method:'POST',headers:{'x-offer-store-key':gatewayKey},
   body:JSON.stringify({action:'draft_budget',jwt:tokens[0],leadId:'lead-1',scope,op,...args})
  })).then(async response=>{assert.equal(response.status,200);return response.json();});
  const ledger=createLedger(draft);
  assert.deepEqual(await ledger.begin(),{chargedKurus:0,capKurus:1000});
  const f=await fixture(),original=(await proposalEngine.run({brief:f.brief},f)).data;
  let generations=0;
  const providers=createBoundedProviders({ledger,geminiKey:'test',defaultModel:'gemini-2.5-flash',pricing:researchTariff,
   now:()=>Date.parse('2026-11-17T14:21:00Z'),researchFx:async()=>({usdTry:44,publishedAt:'2026-11-17'}),
   fetchImpl:async(url,options)=>{
    if(url.endsWith(':countTokens'))return Response.json({totalTokens:850});
    assert.ok(url.endsWith(':generateContent'));
    generations++;
    const body=JSON.parse(options.body);
    assert.ok(body.generationConfig.maxOutputTokens<16384);
    const {texts}=JSON.parse(body.contents[0].parts[0].text);
    return Response.json({modelVersion:'gemini-2.5-flash',usageMetadata:{promptTokenCount:850,candidatesTokenCount:600,totalTokenCount:1450},
     candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({translations:texts.map(s=>'English '+s)})}]}}]});
   }});
  const english=await localizeProposal(original,'en',{providers});
  assert.equal(english.language,'en');
  assert.deepEqual(english.logo,original.logo);
  assert.deepEqual(english.quote,original.quote);
  assert.deepEqual(await localizeProposal(original,'en',{providers}),english);
  assert.equal(generations,1);
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
