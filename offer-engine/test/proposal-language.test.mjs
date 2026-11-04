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
test('API signs the English snapshot, uses the same card/run budget, and never mislabels a failed translation',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const f=await fixture(),secret='test-secret-language',session='s'.repeat(43),host='preview.vercel.app',codec=createPricingProof(secret),run='00000000-0000-4000-8000-000000000001';let ledgers=0;
  const body={action:'start',context:{leadId:'lead1',spaceId:'space1'},brief:{...f.brief,language:'en'},audit:f.audit,pricing:f.pricing,logo:{...f.logo.data,logoProof:logoProof(secret,host,f.logo.data)},proposalProof:codec.encode({kind:'pricing_ready',createdAt:Date.now(),briefHash:briefHash(f.brief),auditHash:digest(f.audit),pricingHash:digest(f.pricing),budgetLeadId:'lead1',budgetResearchRunId:run},session,host)};
  const request=body=>({method:'POST',headers:{host,origin:'https://'+host,cookie:'__Host-offer-research='+session},body});
  const response=()=>({setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}});
  const ledger={status:async()=>({chargedKurus:2700,capKurus:5000})};
  const options={getSecret:()=>secret,getLedger:async(req,res,id,opts)=>{ledgers++;assert.equal(id,'lead1');assert.equal(opts.researchRunId,run);return ledger;},getProviders:()=>({generate:async(stage,input)=>({model:'test',data:{translations:input.texts.map(t=>'English: '+t)}})})};
  const res=response();await createProposalHandler(options)(request(body),res);assert.equal(res.code,200);assert.equal(res.data.result.data.language,'en');assert.equal(res.data.cost.chargedKurus,2700);
  const claims=codec.decode(res.data.saveProof,session,host,Date.now());assert.equal(claims.proposalHash,digest(res.data.result));
  let stored;
  const save=createOfferHandler({getSecret:()=>secret,getStore:()=>({configured:()=>true,portalConfigured:()=>false,async save(token,body){stored=body;return {id:'saved',version:1};}})});
  const saveRequest=request({action:'save',leadId:'lead1',spaceId:'space1',proposal:res.data.result,pricing:f.pricing,saveProof:res.data.saveProof,logoApproved:true,scopeApproved:true});saveRequest.headers.authorization='Bearer '+'x'.repeat(40);
  const saved=response();await save(saveRequest,saved);assert.equal(saved.code,200);assert.equal(stored.p_document.language,'en');assert.deepEqual(stored.p_document.alternatives,res.data.result.data.alternatives);
  const tr=response();await createProposalHandler(options)(request({...body,brief:{...f.brief,language:'tr'}}),tr);assert.equal(tr.code,200);assert.equal(ledgers,1);
  const failed=response();await createProposalHandler({...options,getProviders:()=>({generate:async()=>{throw Object.assign(Error('limit'),{code:'budget_limit'});}})})(request(body),failed);assert.equal(failed.code,422);assert.equal(failed.data.code,'budget_limit');assert.equal(failed.data.result,undefined);assert.equal(failed.data.cost.chargedKurus,2700);
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
