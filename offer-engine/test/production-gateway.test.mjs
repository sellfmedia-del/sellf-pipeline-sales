import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProductionGateway} from '../../supabase/functions/pipeline-offer-store/handler.mjs';
import {runtimeStore,offersEnabled,authorizeProduction} from '../src/runtime.mjs';
import {createLedger,budgetFor} from '../src/budget/ledger.mjs';
const owner='33565c0c-67ea-4435-9df8-6814035dfd11',other='c96b0083-7180-4c2d-bded-a4b1a83dd500',key='k'.repeat(43),jwt='real-pipeline-session-jwt';
function setup({preview=false,owns=true}={}){
 const calls=[];
 const gateway=createProductionGateway({env:n=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only',SUPABASE_ANON_KEY:'public'})[n],fetchImpl:async(url,init)=>{
  calls.push({url,init});let value;
  if(url.includes('gateway_config'))value=[{key_hash:createHash('sha256').update(key).digest('hex')}];
  else if(url.endsWith('/auth/v1/user')){assert.equal(init.headers.Authorization,'Bearer '+jwt);assert.equal(init.headers.apikey,'public');value={id:owner,app_metadata:preview?{pipeline_offer_preview:true}:{}};}
  else if(url.includes('/rest/v1/leads?'))value=[{id:'lead-1',space_id:'space-1'}];
  else if(url.includes('/rest/v1/spaces?')){assert.ok(url.includes('user_id=eq.'+owner));value=owns?[{id:'space-1'}]:[];}
  else if(url.includes('/rpc/'))value={id:'offer',version:1};
  else if(url.includes('pipeline_offer_versions?'))value=[];
  else throw Error('Unexpected access '+url);
  return {ok:true,text:async()=>JSON.stringify(value)};
 }});
 return {calls,request:(body,k=key)=>gateway(new Request('https://edge.example',{method:'POST',headers:{'Content-Type':'application/json','x-offer-store-key':k},body:JSON.stringify(body)}))};
}
test('production gateway requires its own server key and an Auth-verified real Pipeline user, with no bootstrap or bulk CRM operations',async()=>{
 for(const action of ['bootstrap','refresh','sync_cards','delete_cards','queue','claim','mark']){
  const {request,calls}=setup();assert.equal((await request({action,jwt})).status,422);assert.equal(calls.filter(c=>c.init.method!=='GET').length,0);
 }
 const {request,calls}=setup();assert.equal((await request({action:'authorize',jwt},'x'.repeat(43))).status,403);
 assert.equal(calls.length,1);
 const synthetic=setup({preview:true});assert.equal((await synthetic.request({action:'authorize',jwt})).status,422);
});
test('wrong-owner card cannot read offers, allocate research, or save a quote, even when legacy CRM RLS is disabled',async()=>{
 for(const body of [{action:'list',leadId:'lead-1'},{action:'budget',leadId:'lead-1',op:'begin'},{action:'save',args:{p_lead_id:'lead-1',p_space_id:'space-1',p_request_id:'request-1234567890'}}]){
  const {request,calls}=setup({owns:false});assert.equal((await request({...body,jwt})).status,422);
  assert.ok(calls.every(c=>c.init.method==='GET'));
  assert.ok(calls.every(c=>!c.url.includes('/rpc/')&&!c.url.includes('pipeline_offer_versions')));
 }
});
test('production save pins verified owner server-side and cannot change any CRM field through generic writes',async()=>{
 const {request,calls}=setup();const response=await request({action:'save',jwt,args:{p_owner:other,p_lead_id:'lead-1',p_space_id:'space-1',p_request_id:'request-1234567890',p_document:{},p_pricing:{}}});
 assert.equal(response.status,200);const writes=calls.filter(c=>c.init.method!=='GET');assert.equal(writes.length,1);assert.ok(writes[0].url.endsWith('/rpc/save_pipeline_offer_production'));assert.equal(JSON.parse(writes[0].init.body).p_owner,owner);
 assert.equal(writes[0].init.headers.apikey,'server-only');
 const listed=await request({action:'list',jwt,leadId:'lead-1'});assert.equal(listed.status,200);const lookup=calls.find(c=>c.url.includes('pipeline_offer_versions?'));assert.ok(lookup.url.includes('owner_id=eq.'+owner));
});
test('production ledger uses the real bearer session; old encrypted test cookies do not grant production access',async()=>{
 const old={...process.env};process.env.VERCEL_ENV='production';process.env.OFFER_PRODUCTION_ENABLED='true';
 try{
  assert.equal(offersEnabled(),true);let calls=0;
  const store={call:async(action,body)=>{calls++;assert.equal(action,'budget');assert.equal(body.jwt,jwt);assert.equal(body.leadId,'lead-1');return {chargedKurus:500};}};
  const ledger=await budgetFor({headers:{authorization:'Bearer '+jwt}},{},'lead-1',{store});assert.equal((await ledger.begin()).chargedKurus,500);assert.equal(calls,1);
  await assert.rejects(()=>budgetFor({headers:{cookie:'__Host-offer-preview-session=test'}},{},'lead-1',{store}),/oturumu/);assert.equal(calls,1);
  await assert.rejects(()=>authorizeProduction({headers:{}}),/Pipeline oturumu/);
  delete process.env.OFFER_PRODUCTION_ENABLED;assert.equal(offersEnabled(),false);
 }finally{for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);}
});
