import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {brief,quote} from './fixtures/bhs.mjs';
import {context,plan} from './fixtures/evidence.mjs';
import {createEvidenceCollector,evidenceSourceVerifier,evidenceExcerpts} from '../src/bhs/evidence.mjs';
import {synthesisEnvelope,readStoredEnvelope} from '../src/bhs/grounded-report.mjs';
import {assessSemantics,reportHash} from '../src/bhs/semantic.mjs';
import {createAuditEngine} from '../src/engines/audit-engine.mjs';

test('brief snapshots keep a missing budget and hash stable across server phases',()=>{
 const a=snapshotBrief(brief),b=snapshotBrief(a);assert.equal(b.budget,null);assert.equal(briefHash(a),briefHash(b));
});
test('collector uses visible fetched evidence and follows observed public links; scripts are not facts',async()=>{
 const read=async url=>({status:200,headers:{'content-type':'text/html'},body:Buffer.from('<title>Public source</title><script>INVENTED_PRIVATE_DATA</script><p>'+quote.repeat(20)+'</p><a href="/about">About company</a>')});
 const packet=await createEvidenceCollector({read})(snapshotBrief(brief),plan);
 assert.ok(packet.sources.length>=4);assert.ok(packet.sources.some(s=>s.finalUrl==='https://brand.example/about'));
 assert.ok(!JSON.stringify(packet).includes('INVENTED_PRIVATE_DATA'));
 assert.equal((await evidenceSourceVerifier(packet)({id:packet.sources[0].id,url:packet.sources[0].finalUrl,quote})).status,'quote_matched');
 assert.equal((await evidenceSourceVerifier(packet)({id:'ev999',url:brief.website,quote})).status,'not_in_evidence_packet');
});
test('a quote must occur inside one captured excerpt rather than across omitted page regions',async()=>{
 const {packet}=context();packet.sources[0].excerpts=[{text:'A'.repeat(30)+' first region.'},{text:'Second region. '+'B'.repeat(30)}];
 assert.equal((await evidenceSourceVerifier(packet)({id:'ev1',url:packet.sources[0].finalUrl,quote:'first region. Second region.'})).status,'quote_not_found');
 assert.ok(evidenceExcerpts('x'.repeat(20000)).length<=7);
});
test('synthesis input is recovered only from stored user input and bound to brief and evidence hashes',()=>{
 const {packet}=context(),sb=snapshotBrief(brief),envelope=synthesisEnvelope(sb,packet),text=JSON.stringify(envelope);
 for(const interaction of [{input:text},{input:[{type:'text',text}]},{steps:[{type:'user_input',content:[{type:'text',text}]}]}])assert.deepEqual(readStoredEnvelope(interaction,envelope.kind,sb),envelope);
 assert.throws(()=>readStoredEnvelope({steps:[{type:'model_output',content:[{type:'text',text}]}]},envelope.kind,sb));
 envelope.packet.sources[0].excerpts[0].text+='tampering';assert.throws(()=>readStoredEnvelope({input:JSON.stringify(envelope)},envelope.kind,sb));
});
test('semantic approval needs complete independent coverage and rejects changed evidence, entity, period and unsupported claims',()=>{
 const {packet,report,assessment}=context();assert.equal(assessSemantics(assessment,report,packet).status,'passed');
 for(const change of [a=>a.findings.pop(),a=>a.findings[0].verdict='uncertain',a=>a.checks.entityScope=false,a=>a.checks.periodComparability=false,a=>a.reportHash='b'.repeat(64),a=>a.dimensions.pop(),a=>a.findings.push(a.findings[0])]){
  const a=structuredClone(assessment);change(a);assert.equal(assessSemantics(a,report,packet).status,'failed');
 }
 report.dimensions[0].score=50;assessment.reportHash=reportHash(report);assert.equal(assessSemantics(assessment,report,packet).status,'failed');
});
test('grounded audit can finish with honest unknown scores; failed semantic support blocks downstream',async()=>{
 const input=context(),engine=createAuditEngine(),before=JSON.stringify(input);
 let result=await engine.run({brief,...input});assert.equal(result.status,'ready');assert.equal(result.data.quality.semanticBenchmark,'passed');assert.equal(result.data.scoring.total,null);assert.equal(JSON.stringify(input),before);
 input.assessment.findings[0].verdict='unsupported';result=await engine.run({brief,...input});assert.equal(result.status,'review');assert.equal(result.data.quality.checksPassed,false);
});
test('an unreadable page never becomes invented rendered evidence',async()=>{
 const read=async()=>({status:503,headers:{},body:Buffer.alloc(0)});
 await assert.rejects(()=>createEvidenceCollector({read,render:async()=>[]})(snapshotBrief(brief),plan),/Kanıt paketi/);
});

test('rendered public evidence waits for site scripts, follows visible country navigation and preserves source text',{skip:!process.env.LOGO_TEST_CHROMIUM},async()=>{
 const {chromium:playwright}=await import('playwright-core');
 const chromium=(await import('@sparticuz/chromium')).default;
 const {renderEvidencePages}=await import('../src/bhs/render-source.mjs');
 const browser=await playwright.launch({args:chromium.args.filter(arg=>!['--disable-web-security','--single-process'].includes(arg)),executablePath:process.env.LOGO_TEST_CHROMIUM,headless:true});
 try{
  const requested=[];
  const read=async url=>{requested.push(url);return {status:200,headers:{'content-type':'text/html; charset=utf-8'},body:Buffer.from(url.endsWith('/tr')?'<title>Brand Turkey</title><p>'+quote.repeat(3)+'</p>':'<p>Please select your country</p><button onclick="location.href=\'/tr\'">Türkiye</button><button>Global</button>')};};
  const results=await renderEvidencePages([{url:brief.website,finalUrl:brief.website}],{read,browser,validate:async()=>{},deadline:Date.now()+18000});
  assert.equal(results.length,1);assert.equal(results[0].finalUrl,'https://brand.example/tr');assert.ok(results[0].text.includes(quote));assert.ok(requested.includes('https://brand.example/tr'));
 }finally{await browser.close();}
});
