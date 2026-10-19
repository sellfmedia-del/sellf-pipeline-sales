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

test('only genuinely adjacent captured text can repair a boundary-spanning literal quote',async()=>{
 const {packet}=context(),source=packet.sources[0];source.excerpts=[{offset:0,text:'The company provides kitchen '},{offset:29,text:'appliances through an authorized dealer network.'}];
 assert.equal((await evidenceSourceVerifier(packet)({id:source.id,url:source.finalUrl,quote})).status,'quote_matched');
 source.excerpts[1].offset=5000;
 assert.equal((await evidenceSourceVerifier(packet)({id:source.id,url:source.finalUrl,quote})).status,'quote_not_found');
});
test('a thin public page can supply explicitly labelled publisher metadata without inventing body content',async()=>{
 const {publicMetadata}=await import('../src/bhs/evidence.mjs');
 assert.equal(publicMetadata('<meta name="description" content="Brand Turkey kitchen appliances">'),'Brand Turkey kitchen appliances');
 assert.equal(publicMetadata('<meta name="description" content="Türkiye\'nin Brand mutfak ürünleri">'),"Türkiye'nin Brand mutfak ürünleri");
 const read=async()=>({status:200,headers:{'content-type':'text/html'},body:Buffer.from('<title>Brand</title><meta name="description" content="Brand Turkey kitchen appliances official site">')});
 const packet=await createEvidenceCollector({read,render:async()=>[]})(snapshotBrief(brief),plan);
 assert.ok(packet.sources.every(s=>s.metadataOnly));assert.ok(packet.sources.some(s=>s.finalUrl===snapshotBrief(brief).website));assert.ok(packet.sources.every(s=>s.excerpts[0].text==='Brand Turkey kitchen appliances official site'));
});
test('discovery hints accept only provider-cited public primary candidates, not uncited model links',async()=>{
 const {discoverySourceHints}=await import('../src/bhs/discovery-hints.mjs');
 const text='[kap.org.tr](https://publisher.example/verified) [brand.example](https://publisher.example/uncited) [news.example](https://publisher.example/news)';
 const hints=discoverySourceHints({steps:[{type:'model_output',content:[{type:'text',text,annotations:['verified','news'].map(path=>({type:'url_citation',url:'https://publisher.example/'+path}))}]}]},snapshotBrief(brief));
 assert.deepEqual(hints,['https://publisher.example/verified']);
});

test('core source coverage is required before starting the paid report writer',async()=>{
 const {assertCoreEvidence}=await import('../src/bhs/evidence.mjs');const {packet}=context();assert.equal(assertCoreEvidence(packet,snapshotBrief(brief)),packet);
 packet.sources.shift();assert.throws(()=>assertCoreEvidence(packet,snapshotBrief(brief)),/kimlik okunamadı/);
 const p=context().packet;p.sources=p.sources.slice(0,3);assert.throws(()=>assertCoreEvidence(p,snapshotBrief(brief)),/üç rakibin/);
});

test('official registry identity requires the exact declared website, never email, lookalikes or unrelated news',async()=>{
 const {declaresWebsite,reportBrandIdentity,packetBrandIdentity}=await import('../src/bhs/identity.mjs');
 const website='https://www.brand.example/';
 assert.equal(declaresWebsite('İnternet Adresi https://www.brand.example/ Kuruluş',website),true);
 for(const text of ['info@brand.example','www.brand.example.attacker.com','www.brand.example.tr','www.other.example'])assert.equal(declaresWebsite(text,website),false);
 const source={url:'https://kap.org.tr/tr/api/file/download/official',sourceType:'primary',quote:'Şirketin İnternet Adresi www.brand.example olarak bildirilmiştir.'};
 assert.equal(reportBrandIdentity(source,{website}),true);
 assert.equal(reportBrandIdentity({...source,url:'https://kap.org.tr.attacker.com/'},{website}),false);
 assert.equal(reportBrandIdentity({...source,sourceType:'secondary'},{website}),false);
 assert.equal(packetBrandIdentity({sources:[{finalUrl:source.url,excerpts:[{text:source.quote}]}]},{website}),true);
});

test('bounded editing cannot change sources, scores, numeric facts or nonexistent findings',async()=>{
 const {applyEdits,interpretationIssues}=await import('../src/bhs/editor.mjs');const {report}=context();
 const edited=applyEdits(report,{edits:[{target:'finding.impact',id:report.findings[0].id,value:'Bu ilişki saha verileriyle sınanacak bir hipotezdir.'}]});assert.equal(edited.findings[0].statement,report.findings[0].statement);assert.deepEqual(edited.sources,report.sources);
 for(const edit of [{target:'finding.impact',id:'unknown',value:'Unknown'},{target:'finding.impact',id:report.findings[0].id,value:'Increase 999%'},{target:'dimension.score',id:'financial',value:'90'}])assert.throws(()=>applyEdits(report,{edits:[edit]}));
 report.dimensions[0].rationale='Rakip finansalları kamuya açık olmadığından puan verilmedi.';assert.ok(interpretationIssues(report).length);report.dimensions[0].rationale='Rakip finansalları bu taramada doğrulanmış kaynak paketinde bulunmadığından puan verilmedi.';assert.deepEqual(interpretationIssues(report),[]);
});
test('authenticated source-plan brand IDs and mixed brief/context references do not erase real evidence',async()=>{
 const {packet,report,assessment}=context();packet.entities[0].id='test-brand';report.benchmarks.forEach(b=>b.entries[0].entityId='test-brand');
 report.findings[1].kind='brief';report.findings[1].sourceIds=[];report.serviceRecommendations[0].findingIds=['f0','f1'];
 const {reportHash}=await import('../src/bhs/semantic.mjs');const {evidenceHash}=await import('../src/bhs/evidence.mjs');assessment.reportHash=reportHash(report);assessment.packetHash=evidenceHash(packet);
 assert.equal((await createAuditEngine().run({brief,packet,report,assessment})).status,'ready');
 report.serviceRecommendations[0].findingIds=['f1'];assessment.reportHash=reportHash(report);assert.equal((await createAuditEngine().run({brief,packet,report,assessment})).status,'review');
});

test('leading meeting questions and unsupported public-data absence cannot pass silently',async()=>{
 const {applyEdits,interpretationIssues}=await import('../src/bhs/editor.mjs');const {report}=context();
 report.meetingQuestions[0].question='Sessizlik üstünlüğünüz nasıl satılıyor?';report.competitors[0].scaleReason='Finansal ciro verisi kamuya açık olmamakla birlikte aynı ölçektedir.';
 assert.equal(interpretationIssues(report).length,2);
 const edited=applyEdits(report,{edits:[{target:'question.question',id:'q0',value:'Sessizlik iddiası bağımsız olarak ölçülmüş müdür?'},{target:'competitor.scaleReason',id:report.competitors[0].id,value:'Bu taramada aynı dönem finansal veri bulunmadı; ürün kapsamı üzerinden karşılaştırılmıştır.'}]});assert.deepEqual(interpretationIssues(edited),[]);
 assert.throws(()=>applyEdits(report,{edits:[{target:'question.question',id:'q999',value:'Unknown question'}]}));
});
