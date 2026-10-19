import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotBrief,briefHash,dimensions} from '../src/bhs/brief.mjs';
import {researchPrompt} from '../src/bhs/prompts.mjs';
import {createResearchProvider,citationUrls,modelText} from '../src/bhs/provider.mjs';
import {verifyReport,createSourceVerifier} from '../src/bhs/verify.mjs';
import {createTicketCodec} from '../src/bhs/ticket.mjs';
import {createAuditEngine} from '../src/engines/audit-engine.mjs';
import {createAuditHandler} from '../api/audit.js';

const brief={brandName:'Test Brand',segment:'corporate',website:'https://brand.example/',goals:'Bayileri verimli büyütmek',needs:'Servis ve talep ilişkisini anlamak',services:'Growth ve operasyon',meetingNotes:'Müşterinin doğrulanacak beyanı.',budget:''};
const quote='The company provides kitchen appliances through an authorized dealer network.';
function fixture(){
 const sources=['https://brand.example/about','https://peer-one.example/about','https://peer-two.example/about','https://peer-three.example/about'].map((url,i)=>({id:'s'+i,url,title:'Public source '+i,quote,publishedAt:'2026-09-01',period:'2026',scope:'Türkiye kitchen appliances',sourceType:'primary'}));
 const competitors=sources.slice(1).map((s,i)=>({id:'peer'+i,name:'Peer '+i,website:s.url,scaleReason:'Benzer ölçek sinyalleri.',audienceReason:'Aynı müşteri kitlesi.',geographyReason:'Aynı hedef pazar.',sourceIds:[s.id]}));
 const findings=dimensions.map((d,i)=>({id:'f'+i,dimension:d.id,kind:'observation',statement:'Kaynakta bayi ağı gözlemleniyor.',reportExcerpt:'Bayi ağı gözlemi '+i,sourceIds:['s0'],impact:'Talep ve servis ilişkisi doğrulanmalı.',goalConnection:'Bayi büyümesi hedefiyle ilişkili.',priority:'medium'}));
 const benchmarks=['webTraffic','domainAuthority','socialAudience','reviews','adActivity','contentMaturity','revenueOrGrowth','differentiator'].map(metric=>({metric,entries:['brand',...competitors.map(p=>p.id)].map(entityId=>({entityId,value:null,unit:null,period:null,sourceIds:[]}))}));
 return {summary:'Fixture for machine validation only, not a real brand audit.',sources,competitors,findings,dimensions:dimensions.map((d,i)=>({id:d.id,score:40+i*5,rationale:'Kaynaklı gözlem ve rakip kıyaslamasına dayalı ön değerlendirme.',dataStatus:'partial',findingIds:['f'+i],comparisonCompetitorIds:['peer0'],strengths:['Bayi ağı'],gaps:['İç veri yok'],onboardingQuestions:['Gerçek kanal verisi nedir?']})),benchmarks,criticalOpportunityFindingId:'f2',criticalRiskFindingId:'f1',meetingQuestions:dimensions.slice(0,5).map((d,i)=>({dimension:d.id,question:'Doğrulanacak soru '+i,findingIds:['f'+i]})),serviceRecommendations:[{id:'service1',name:'Growth',hypothesis:'Bayi talebi ve servis akışı birlikte doğrulanmalı mı?',findingIds:['f1'],measurement:'Kanal katkı marjı ve tekrar satın alma'}]};
}
function research(report=fixture()){return {id:'research_12345678',status:'completed',steps:[{type:'user_input',content:[{type:'text',text:'PRIVATE INPUT'}]},{type:'model_output',content:[{type:'text',text:quote+'\n'+report.findings.map(f=>f.reportExcerpt).join('\n'),annotations:report.sources.map(s=>({type:'url_citation',url:s.url}))}]}]};}
const ok=async()=>({status:'quote_matched'});
const verify=(report,extra={})=>verifyReport(report,{brief:snapshotBrief(brief),rawReport:modelText(research()),citations:citationUrls(research()),verifySource:ok,asOf:'2026-10-19',...extra});

test('brief snapshot excludes CRM objects, logo, credentials and contact fields and keeps all research context',()=>{
 const value=snapshotBrief({...brief,lead:{secret:'x'},logo:'image',email:'private@example.com',source:{leadId:'lead'}});
 assert.deepEqual(Object.keys(value),['brandName','segment','website','goals','needs','services','meetingNotes','budget']);
 assert.equal(value.budget,null);assert.equal(value.meetingNotes,brief.meetingNotes);
 assert.equal(briefHash(value),briefHash(snapshotBrief(brief)));
 assert.throws(()=>snapshotBrief({...brief,website:'javascript:alert(1)'}));
 assert.throws(()=>snapshotBrief({...brief,needs:'a'.repeat(10001)}));
});
test('research uses original six dimensions, three to five peers, nine sections and latest missing-data override',()=>{
 const prompt=researchPrompt(snapshotBrief(brief),'2026-10-19');
 for(const text of ['3–5','240 karakter','Dokuz','null','ÖN BHS HESAPLAMA',brief.goals,brief.meetingNotes])assert.ok(prompt.includes(text));
 assert.equal(dimensions.reduce((sum,d)=>sum+d.weight,0),1);
});
test('valid machine evidence produces deterministic weighted score, immutable source data and clear review limits',async()=>{
 const report=fixture(),before=JSON.stringify(report),result=await verify(report);
 assert.equal(result.status,'ready');assert.equal(result.data.scoring.total,49.75);
 assert.equal(result.data.quality.semanticBenchmark,'pending');assert.equal(JSON.stringify(report),before);
});
test('missing score stays unknown; weights are never renormalized and evidence checks can still pass',async()=>{
 const report=fixture();report.dimensions[0].score=null;report.dimensions[0].dataStatus='insufficient';
 const result=await verify(report);assert.equal(result.status,'ready');assert.equal(result.data.scoring.total,null);
});
test('missing or duplicate dimensions and unsupported scores cannot pass',async()=>{
 for(const change of [r=>r.dimensions[0].dataStatus='insufficient',r=>r.dimensions[0].findingIds=[],r=>r.dimensions[0].comparisonCompetitorIds=[],r=>r.dimensions[0].id='operations']){
  const report=fixture();change(report);assert.equal((await verify(report)).status,'review');
 }
});
test('fabricated citations, unreachable sources, future dates and changed report excerpts stop downstream',async()=>{
 for(const change of [r=>r.sources[0].url='https://fabricated.example/',r=>r.sources[0].publishedAt='2030-01-01',r=>r.findings[0].reportExcerpt='Not in report']){
  const r=fixture();change(r);assert.equal((await verify(r)).status,'review');
 }
 assert.equal((await verify(fixture(),{verifySource:async()=>({status:'unavailable'})})).status,'review');
});
test('peers need sources and comparable identities; benchmark values need evidence',async()=>{
 for(const change of [r=>r.competitors.pop(),r=>r.competitors[0].sourceIds=[],r=>r.competitors[0].website=brief.website,r=>r.benchmarks[0].entries[0].value='100000',r=>r.benchmarks[1].metric='webTraffic']){
  const r=fixture();change(r);assert.equal((await verify(r)).status,'review');
 }
});
test('brief statements cannot masquerade as external evidence or justify scores or service recommendations',async()=>{
 const r=fixture();r.findings[1].kind='brief';r.findings[1].sourceIds=[];
 const result=await verify(r);assert.equal(result.status,'review');assert.ok(result.data.quality.issues.some(x=>x.includes('Hizmet')));
});
test('SSRF is blocked for source verification even when a model calls it a cited source',async()=>{
 const verifier=createSourceVerifier();
 for(const url of ['http://127.0.0.1/','http://169.254.169.254/','http://localhost/'])await assert.rejects(()=>verifier({url,quote}));
});
test('audit engine only accepts completed research plus valid structured JSON, preserving original report',async()=>{
 const engine=createAuditEngine({verifySource:ok}),r=research();
 const structure={id:'structure_12345678',status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(fixture())}]}]};
 const result=await engine.run({brief,research:r,structure});assert.equal(result.status,'ready');assert.equal(result.data.rawReport,modelText(r));
 assert.equal(result.data.briefHash,briefHash(snapshotBrief(brief)));
 await assert.rejects(()=>engine.run({brief,research:{...r,status:'incomplete'},structure}),/tamamlanmadı/);
 await assert.rejects(()=>engine.run({brief,research:r,structure:{...structure,steps:[]}}),/eksik/);
});
test('provider uses actual background Interactions API; no fake JSON mode on Deep Research; structure does not search',async()=>{
 const calls=[];
 const provider=createResearchProvider({apiKey:'test-provider-key',fetchImpl:async(url,options)=>{
  calls.push({url,options});return new Response(JSON.stringify({id:'interaction_12345678',status:'in_progress'}));
 }});
 await provider.start(snapshotBrief(brief),'2026-10-19');await provider.structure(snapshotBrief(brief),'research_12345678');await provider.poll('research_12345678');
 const start=JSON.parse(calls[0].options.body),structure=JSON.parse(calls[1].options.body);
 assert.equal(start.agent,'deep-research-max-preview-04-2026');assert.equal(start.background,true);assert.equal(start.store,true);assert.equal(start.response_format,undefined);
 assert.deepEqual(start.tools.map(t=>t.type),['google_search','url_context']);
 assert.equal(structure.response_format.mime_type,'application/json');assert.equal(structure.tools,undefined);assert.equal(structure.previous_interaction_id,'research_12345678');
 assert.ok(calls[2].url.endsWith('?include_input=false'));
 assert.throws(()=>provider.poll('../other'),/kimliği/);
});
test('missing config and provider failures never leak upstream messages or secrets',async()=>{
 await assert.rejects(()=>createResearchProvider({apiKey:''}).start(brief,'2026-10-19'),/bağlantısı/);
 const provider=createResearchProvider({apiKey:'hidden-secret',fetchImpl:async()=>new Response('SECRET error body',{status:403})});
 await assert.rejects(()=>provider.start(brief,'2026-10-19'),e=>!e.message.includes('SECRET')&&!e.message.includes('hidden-secret'));
});
test('job tickets bind brief, browser session, deployment and expiry and reject tampering',()=>{
 const codec=createTicketCodec('server-secret'),job={phase:'research',researchId:'research_12345678',startedAt:10000,hash:'a'.repeat(64)};
 const token=codec.encode(job,'session1','preview.vercel.app');assert.deepEqual(codec.decode(token,'session1','preview.vercel.app',10001),job);
 for(const [s,h,n,t]of [['session2','preview.vercel.app',10001,token],['session1','other.vercel.app',10001,token],['session1','preview.vercel.app',99999999,token],['session1','preview.vercel.app',10001,token+'x']])assert.throws(()=>codec.decode(t,s,h,n));
});
function response(){return {code:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
function request(body,cookie='__Host-offer-research='+'s'.repeat(43)){return {method:'POST',headers:{host:'preview.vercel.app',origin:'https://preview.vercel.app',cookie},body};}
test('API background lifecycle is signed, dedupes starts within an instance, and cannot reuse changed brief',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  let starts=0,structures=0;
  const provider={configured:()=>true,async start(){starts++;return {id:'research_12345678'};},async poll(id){return {id,status:'completed'};},async structure(){structures++;return {id:'structure_12345678'};},async cancel(){return {};}};
  const handler=createAuditHandler({getProvider:()=>provider,getSecret:()=> 'secret',validateWebsite:async()=>{},engine:{version:'test',async run(){return {status:'ready',data:{findings:[],services:[]}};}}});
  const body={action:'start',brief,requestId:'request_1234567890'};
  const first=response();await handler(request(body),first);assert.equal(first.code,202);
  const duplicate=response();await handler(request(body),duplicate);assert.equal(starts,1);assert.equal(first.body.ticket,duplicate.body.ticket);
  const changed=response();await handler(request({action:'status',brief:{...brief,goals:'Changed'},ticket:first.body.ticket}),changed);assert.equal(changed.body.code,'changed_brief');
  const status=response();await handler(request({action:'status',brief,ticket:first.body.ticket}),status);assert.equal(status.body.phase,'research_complete');
  const next=response();await handler(request({action:'structure',brief,ticket:first.body.ticket}),next);assert.equal(structures,1);
  const repeated=response();await handler(request({action:'structure',brief,ticket:first.body.ticket}),repeated);assert.equal(structures,1);
  const final=response();await handler(request({action:'status',brief,ticket:next.body.ticket}),final);assert.equal(final.body.phase,'complete');
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('API gates production, origin and missing credentials without starting paid jobs',async()=>{
 const old=process.env.VERCEL_ENV;
 try{
  const handler=createAuditHandler({getProvider:()=>({configured:()=>false})});
  process.env.VERCEL_ENV='production';const prod=response();await handler(request({}),prod);assert.equal(prod.code,503);
  process.env.VERCEL_ENV='preview';const cross=response(),req=request({});req.headers.origin='https://other.example';await handler(req,cross);assert.equal(cross.code,403);
  const missing=response();await handler(request({action:'start',brief}),missing);assert.equal(missing.code,503);assert.equal(missing.body.code,'not_configured');
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('source verifier checks visible HTML quotes, strips scripts, follows bounded redirects and flags PDFs',async()=>{
 const make=body=>({status:200,headers:{'content-type':'text/html'},body:Buffer.from(body)});
 let verifier=createSourceVerifier({read:async()=>make('<html><p>The company provides kitchen appliances through an authorized dealer network.</p></html>')});
 assert.equal((await verifier({url:'https://brand.example/',quote})).status,'quote_matched');
 verifier=createSourceVerifier({read:async()=>make('<script>'+quote+'</script><p>Other text</p>')});
 assert.equal((await verifier({url:'https://brand.example/',quote})).status,'quote_not_found');
 let calls=0;
 verifier=createSourceVerifier({read:async()=>{calls++;return {status:302,headers:{location:'/again'},body:Buffer.from('')};}});
 assert.equal((await verifier({url:'https://brand.example/',quote})).status,'redirect_limit');assert.equal(calls,4);
 verifier=createSourceVerifier({read:async()=>({status:200,headers:{'content-type':'application/pdf'},body:Buffer.from('PDF')})});
 assert.equal((await verifier({url:'https://brand.example/',quote})).status,'unsupported_format');
});
