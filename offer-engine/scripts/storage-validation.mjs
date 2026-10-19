// Opt-in isolated database validation. NEVER called by an ordinary build.
// Creates only synthetic preview users/cards/versions and validates mailto
// draft preparation. No Gemini generation, live Pipeline writes or real emails.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {writeTemplateExample} from './template-example.mjs';
import {createPreviewStore} from '../src/proposal/preview-store.mjs';
import {createPreviewSessionHandler} from '../api/preview-session.js';
import {createOfferHandler} from '../api/offer.js';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
if(process.env.VERCEL_ENV!=='preview'||process.env.OFFER_PREVIEW_MODE!=='true')throw Error('Isolated preview required.');
const output={kind:'isolated-real-storage-validation',passed:false,geminiCalls:0,realMailSends:0,mailTransport:'mailto',productionDataAccess:false,checks:[]};
const host=process.env.VERCEL_URL,origin='https://'+host,research=randomBytes(32).toString('base64url');
let cookie='__Host-offer-research='+research,fixture;
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}};}
const request=body=>({method:'POST',headers:{host,origin,cookie},body});
async function invoke(handler,body,expected=200){const r=response();await handler(request(body),r);assert.equal(r.statusCode,expected,r.data?.error);return r.data;}
try{
 let phase='gateway_health';output.phase=phase;
 const store=createPreviewStore();assert.equal((await store.call('health')).productionDataAccess,false);
 output.phase='bootstrap';const start=response();await createPreviewSessionHandler()(request({action:'start'}),start);assert.equal(start.statusCode,200,start.data?.error);fixture=start.data.fixture;
 cookie+='; '+start.headers['Set-Cookie'].split(';')[0];
 const lead=fixture.rows.leads[0];output.testLeadId=lead.id;output.checks.push('real_auth_session_and_separate_card');
 const {proposal:base,pricing,audit,brief}=await writeTemplateExample(),codec=createPricingProof(process.env.OFFER_GEMINI_API_KEY);
 const handler=createOfferHandler();
 function body(proposal,price=pricing){return {action:'save',leadId:lead.id,spaceId:lead.space_id,proposal,pricing:price,logoApproved:true,scopeApproved:true,saveProof:codec.encode({kind:'proposal_ready',createdAt:Date.now(),briefHash:base.data.provenance.briefHash,auditHash:digest(audit),pricingHash:digest(price),proposalHash:digest(proposal),leadId:lead.id,spaceId:lead.space_id},research,host)};}
 output.phase='first_save';const first={...base,runId:randomUUID()},saved=await invoke(handler,body(first));assert.equal(saved.offer.version,1);
 const fixtureNow=await invoke(createPreviewSessionHandler(),{action:'start'});assert.equal(Number(fixtureNow.fixture.rows.leads[0].value),first.data.valueSync.amount);output.checks.push('atomic_version_and_value_update');
 const duplicate=await invoke(handler,body(first));assert.equal(duplicate.offer.version,1);assert.equal(duplicate.offer.reused,true);output.checks.push('idempotent_save');
 output.phase='revision';const revised=structuredClone(first);revised.runId=randomUUID();revised.data.recommendedAlternativeId='operations_bundle';revised.data.valueSync.amount=revised.data.alternatives[1].monthlyAmount;
 const revision=await invoke(handler,body(revised));assert.equal(revision.offer.version,2);
 const afterRevision=await invoke(createPreviewSessionHandler(),{action:'start'});assert.equal(Number(afterRevision.fixture.rows.leads[0].value),revised.data.alternatives[1].monthlyAmount);output.checks.push('revision_updates_only_test_card_value');
 output.phase='rollback';const invalid=structuredClone(revised);invalid.runId=randomUUID();invalid.data.schemaVersion='invalid';await invoke(handler,body(invalid),422);
 const afterFailure=await invoke(createPreviewSessionHandler(),{action:'start'});assert.equal(Number(afterFailure.fixture.rows.leads[0].value),revised.data.valueSync.amount);assert.equal(afterFailure.fixture.latest.version,2);output.checks.push('invalid_save_rolls_back_version_and_value');
 output.phase='publication';const published=await invoke(handler,{action:'publish',offerId:revision.offer.id});assert.ok(published.url.startsWith(origin+'/offers/customer.html#'));
 await invoke(handler,{action:'access',token:published.token,password:'wrong'},422);
 const access=await invoke(handler,{action:'access',token:published.token,password:published.password});assert.equal(access.version,2);assert.equal(access.document.logo.reviewed,true);output.checks.push('password_protected_persisted_customer_view');
 output.phase='contract_mailto';const sandbox={window:{},URL,Intl};vm.runInNewContext(await readFile('../offers/proposal.js','utf8'),sandbox);
 const draft=new URL(sandbox.window.PipelineProposal.buildMailto(access.document,{offerUrl:published.url,offerId:access.id,alternativeId:'operations_bundle',name:'Sentetik Test Yetkilisi',email:'test@example.invalid'}));
 assert.equal(draft.pathname,'yigit@sellfmedia.com,businessdevelopment@sellfmedia.com');const text=draft.searchParams.get('body');assert.ok(text.includes(published.url));assert.ok(!text.includes(published.password));assert.ok(text.includes(new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(revised.data.alternatives[1].monthlyAmount)+' TL / ay'));
 assert.equal((await invoke(handler,{action:'outbox'})).requests.length,0);output.checks.push('publication_without_mail_provider_and_mailto_draft_without_password_or_queue');
 output.phase='owner_isolation';const second=createPreviewStore(),other=await second.bootstrap();assert.deepEqual(await second.list(other.accessToken,lead.id),[]);await assert.rejects(()=>second.save(other.accessToken,{p_lead_id:lead.id,p_space_id:lead.space_id,p_request_id:randomUUID(),p_document:first.data,p_pricing:pricing.data}));output.checks.push('cross_owner_read_and_write_rejected');
 output.passed=true;output.phase='complete';output.monthlyValue=revised.data.valueSync.amount;output.version=2;output.contractRequests=0;output.mailDrafts=1;
}catch(error){output.failure=String(error.message||'validation_failed').slice(0,240);}
await writeFile('public/storage-validation.json',JSON.stringify(output,null,2));
console.log(JSON.stringify({isolatedStorageValidation:output.passed,phase:output.phase}));
