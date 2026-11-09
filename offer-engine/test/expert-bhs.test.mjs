import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {brief as raw} from './fixtures/bhs.mjs';
import {plan as legacyPlan} from './fixtures/evidence.mjs';
import {expertContext,projectExpertReport,unsafeExpertClaim,qualifyExpertFinding,expertInstruction,expertVersion,expertSchema} from '../src/bhs/expert-report.mjs';
import {validateExpertOutput} from '../src/bhs/expert-research.mjs';
import {recoverModelStage} from '../src/budget/model-recovery.mjs';
import {runExpertAcceptance,acceptanceEnabled} from '../scripts/bhs-expert-acceptance.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {createResearchSnapshot,readResearchSnapshot} from '../src/bhs/research-snapshot.mjs';
import {methodologyAreas} from '../src/bhs/methodology-areas.mjs';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {createPricingProof} from '../src/pricing/proof.mjs';
import {createEvidenceCollector} from '../src/bhs/evidence.mjs';
import {response,offerFixture} from './fixtures/offer.mjs';

const brief=snapshotBrief({...raw,website:'https://brand.example/',brandName:'Brand'});
const plan={...legacyPlan,entities:legacyPlan.entities.map(e=>({...e,website:e.role==='brand'?brief.website:e.website,scope:'Planners and family calendars',audienceReason:'Family planner customers'}))};
const page=(url,text,id='ev1')=>({id,url,finalUrl:url,title:'Family planners',method:'html',excerpts:[{id:'p0',offset:0,text}],retrievedAt:'2026-11-09T00:00:00Z',contentHash:'a'.repeat(64)});
const packet=()=>({version:'sellf-evidence-v1',briefHash:briefHash(brief),asOf:'2026-11-09',entities:plan.entities,sources:[page(brief.website,'Family planners cost $24.95. Subscribe to our newsletter for product updates and delivery information.'),page(plan.entities[1].website,'Family planners and calendars include a monthly subscription for household planning.','ev2')],unavailable:[]});
function fixture(){
 const evidence={packet:packet(),searches:[]},context=expertContext(brief,evidence),source=context.cards.find(c=>c.url===brief.website&&c.quote.includes('24.95')),peer=context.cards.find(c=>c.url===plan.entities[1].website);
 const fact={id:'f1',dimension:'funnel',kind:'observation',observation:'Ürün fiyatı $24.95 olarak gösteriliyor.',sourceIds:[source.id],commercialHypothesis:'İlk sipariş teklifinin etkisi değerlendirilebilir.',limitation:'Satın alma dönüşümü ölçülmedi.',question:'İlk sipariş teklifinin katkısını nasıl ölçüyorsunuz?',priority:'high'};
 const peerFact={...fact,id:'f2',dimension:'competition',observation:'Rakip, aile planlayıcısı için abonelik seçeneğini sunuyor.',sourceIds:[peer.id]};
 const value={findings:[fact,peerFact],peers:[{entityId:plan.entities[1].id,relationship:'direct',sourceIds:[peer.id],reason:'Aynı planlayıcı ürün grubu.'}],dimensions:[{id:'funnel',score:60,findingIds:['f1'],comparisonFindingIds:['f2'],bandReason:'Kaynaklı fiyat ve abonelik kıyası.'}],coverage:Object.fromEntries(methodologyAreas.map(a=>[a.key,{status:a.key==='funnel_4'?'observed':'unavailable',findingIds:a.key==='funnel_4'?['f1']:[],note:'Bu araştırmada veri bulunamadı; görüşmede doğrulanacak.'}])),benchmarks:[],overviewIds:['f1'],opportunityId:'f1',riskId:null};
 return {context,value};
}
test('expert prompt preserves six weights, 24 fields, nine sections and never selects prices',()=>{
 const t=expertInstruction();for(const value of ['%25','%20','%15','%10','dokuz','Takipçi = çalışan','Hizmet','Fiyat'])assert.ok(t.toLowerCase().includes(value.toLowerCase()));
 assert.equal(Object.keys(expertSchema.properties.coverage.properties).length,24);assert.equal(expertSchema.properties.dimensions.maxItems,6);
 assert.ok(t.includes('score=null'));assert.ok(t.toLowerCase().includes('veri yokluğunu'));
});
test('compact evidence IDs bind actual paragraphs and remain much smaller than repeated full source JSON',()=>{
 const before=packet(),copy=structuredClone(before),context=expertContext(brief,{packet:before,searches:[]});assert.deepEqual(before,copy);
 assert.ok(context.cards.length);assert.ok(context.cards.every(c=>/^e\d+$/.test(c.id)&&c.quote.length>=24&&c.quote.length<=200));
 assert.ok(context.input.sources[0].sections.some(s=>s.text.includes('24.95')));assert.ok(!JSON.stringify(context.input).includes('proof_'));
});
test('expert projection reaches existing nine-section contract and saved research without extra model calls',()=>{
 const {context,value}=fixture(),report=projectExpertReport(value,context);
 assert.equal(report.findings.length,2);assert.equal(report.competitors.length,1);assert.equal(report.researchCoverage.length,24);
 assert.equal(report.dimensions.find(d=>d.id==='funnel').score,60);
 const audit=directAuditResult(brief,{report,analysisPacket:context.packet,methodologyVersion:expertVersion});
 assert.equal(audit.status,'ready');assert.equal(audit.data.scoring.total,null);assert.match(audit.data.rawReport,/## 9\. Kaynaklar/);
 assert.match(audit.data.findings[0].impact,/Hipotez:.*Sınır:/);assert.ok(!audit.data.findings[0].impact.includes('Bu dış kaynak'));
 const restored=readResearchSnapshot(createResearchSnapshot(audit.data,brief));assert.equal(restored.report.findings.length,2);assert.match(restored.report.findings[0].impact,/Satın alma dönüşümü ölçülmedi/);
});
test('unmatched claims cannot revive through report summaries, strengths, coverage or scores',()=>{
 const {context,value}=fixture();value.findings.push({...value.findings[0],id:'unsafe',observation:'Meta Pixel kurulu değildir; ROAS ölçümü imkansızdır.'});
 value.overviewIds=['unsafe'];value.dimensions[0].findingIds=['unsafe'];value.coverage.funnel_4.findingIds=['unsafe'];
 const report=projectExpertReport(value,context);assert.equal(report.findings.length,2);assert.ok(!report.summary.includes('imkansız'));assert.equal(report.dimensions.find(d=>d.id==='funnel').score,null);assert.equal(report.researchCoverage.find(a=>a.topic.includes('Intent')).status,'unavailable');
});
test('read Markdown link labels retain verified facts without accepting fabricated cleaned quotes',()=>{
 const {value}=fixture(),p=packet();p.sources[0].excerpts[0].text='Family [planners](https://brand.example/products/) cost $24.95. Subscribe to our newsletter for product updates and delivery information.';
 const context=expertContext(brief,{packet:p,searches:[]}),id=context.cards.find(c=>c.url===brief.website&&c.quote.includes('24.95')).id;
 value.findings[0].sourceIds=[id];const report=projectExpertReport(value,context);
 assert.ok(report.findings.some(f=>f.id==='f1'));assert.equal(report.sources.find(s=>s.id===id).verification.status,'quote_matched');
 context.known.get(id).quote='Fabricated product price is $24.95 and delivery is always free.';
 assert.ok(!projectExpertReport(value,context).findings.some(f=>f.id==='f1'));
});
test('verified www peer redirects preserve the competitor, while a missing score reason cannot earn a score',()=>{
 const {context,value}=fixture(),peer=context.input.entities[1],proof=context.known.get(value.peers[0].sourceIds[0]);
 peer.website='https://www.'+new URL(peer.website).hostname+'/';
 const report=projectExpertReport(value,context);assert.equal(report.competitors.length,1);assert.equal(new URL(report.competitors[0].website).hostname,new URL(proof.url).hostname);
 value.dimensions[0].bandReason='';assert.equal(projectExpertReport(value,context).dimensions.find(d=>d.id==='funnel').score,null);
});
test('a cited paragraph keeps adjacent verified proof chunks instead of cutting off the supporting sentence',()=>{
 const {value}=fixture(),p=packet();p.sources[0].excerpts[0].text='Family planners '+('with reusable household planning pages and helpful delivery details '.repeat(5))+'cost $24.95 and include practical calendar pages';
 const context=expertContext(brief,{packet:p,searches:[]});value.findings[0].sourceIds=[context.cards[0].id];
 assert.ok(!context.cards[0].quote.includes('24.95'));assert.ok(projectExpertReport(value,context).findings.some(f=>f.id==='f1'));
});
test('past real failure classes are rejected without treating factual website signals as performance',()=>{
 assert.equal(unsafeExpertClaim({observation:'140 çalışan bulunmaktadır.'},'140 followers'),'followers_not_employees');
 assert.equal(unsafeExpertClaim({observation:'Shopify kullanmadığı için teknolojide geride.'},'Shopify platform'),'platform_not_performance');
 assert.equal(unsafeExpertClaim({observation:'Trafik artışı gelirde önemli bir artış göstergesidir.'},'Organic traffic rose'),'proxy_not_profit');
 assert.equal(unsafeExpertClaim({observation:'Bot hatası müşterilerin erişemediğini gösteriyor.'},'HTTP_403'),'reader_failure_not_brand_failure');
 assert.equal(unsafeExpertClaim({observation:'İndirilen HTML içinde analitik etiketi görülemedi.',commercialHypothesis:'Görüşmede ölçüm tercihleri doğrulanabilir.'},'analyticsTags:false'),null);
 assert.equal(unsafeExpertClaim({observation:'Rakip Shopify kullanıyor.',commercialHypothesis:'Bu hız ve maliyet avantajı sağlayabilir.'},'platformHints: shopify'),'platform_not_performance');
 assert.equal(unsafeExpertClaim({observation:'Toplam 11 şikayet listeleniyor.'},'11 Ağustos: Eksik ürün şikayeti'),'quantity_unit_unconfirmed');
 assert.equal(unsafeExpertClaim({observation:'Toplam 11 şikayet listeleniyor.'},'11 şikayet listeleniyor'),null);
 assert.equal(unsafeExpertClaim({observation:'16 takipçi bulunuyor.'},'16 followers'),null);
 assert.equal(unsafeExpertClaim({observation:'2.585 takipçi bulunuyor.'},'2,585 followers'),null);
 assert.equal(unsafeExpertClaim({observation:'12 limandan sefer var.'},'Alış Saati 12:00; Kuşadası, Bodrum'),'quantity_unit_unconfirmed');
});
test('a same-name cup designer cannot be silently accepted as a burger competitor',()=>{
 const {context,value}=fixture(),p={...plan.entities[1],scope:'Burger restaurant',audienceReason:'Smash burger customers'};
 context.input.entities=plan.entities.map(e=>e.id===p.id?p:e);const report=projectExpertReport(value,context);assert.equal(report.competitors.length,0);assert.equal(report.dimensions.find(d=>d.id==='funnel').score,null);
});
test('English/US observations cannot diagnose the Turkish checkout without target-market evidence',()=>{
 const {context,value}=fixture();const id=value.findings[0].sourceIds[0];context.known.get(id).url='https://brand.example/en/';value.findings[0].observation='Türkiye müşterileri Euro fiyat nedeniyle satın alma yapamıyor.';
 const report=projectExpertReport(value,context);assert.ok(!report.findings.some(f=>f.id==='f1'));assert.ok(report.transfer.issues.some(x=>x.reason==='market_scope_mismatch'));
});
test('v6 starts from identity, keeps the search ceiling and existing proposal stage, and reuses each durable stage',async()=>{
 const rows=new Map(),calls=[],{value}=fixture();
 const ledger={get:async key=>rows.get(key),once:async(key,input,amount,run)=>{assert.equal(amount,0);if(rows.has(key))return rows.get(key).value;const v=await run();rows.set(key,{state:'complete',value:v});return v;}};
 const providers={search:async(q,options)=>{calls.push(['search',q,options]);return {query:q,results:[]};},generate:async(stage,_input,_schema,options)=>{calls.push(['model',stage,options]);return {data:stage==='source_plan'?{...plan,researchQueries:dimensionsForTest()}:value,model:options.model};}};
 const collect=async(_b,_p,options)=>{calls.push(['read',options]);return packet();};
 const run=phase=>runBoundedStage({phase,brief,ledger,providers,collect,researchVersion:'v6',researchModel:'gemini-2.5-pro'});
 for(const phase of ['source_plan','evidence','synthesis','scope'])await run(phase);
 assert.equal(calls[0][0],'read');assert.ok(calls.filter(x=>x[0]==='search').length<=14);assert.equal(calls.filter(x=>x[0]==='model').length,3);
 const synth=calls.find(x=>x[0]==='model'&&x[1]==='synthesis');assert.equal(synth[2].maxOutputTokens,16384);
 const count=calls.length;await run('synthesis');assert.equal(calls.length,count);assert.notEqual(stageKey(brief,'evidence','v6'),stageKey(brief,'evidence','v5'));
});
test('v6 preserves the exact v5 proposal scope/copy request and result',async()=>{
 const f=await offerFixture(),inputs=[],outputs=[];
 for(const version of ['v5','v6']){
  const rows=new Map([[stageKey(f.brief,'synthesis',version),{state:'complete',value:f.synthesis}]]);
  const ledger={get:async k=>rows.get(k),once:async(_k,_i,_a,run)=>run()};
  const copy={...f.copy,headline:'Markaya özel hedefler.'};
  const providers={generate:async(...args)=>{inputs.push(args);return {data:{scope:f.scope,copy},usage:{test:true}};}};
  outputs.push(await runBoundedStage({phase:'scope',brief:f.brief,ledger,providers,researchVersion:version,researchModel:'gemini-2.5-pro'}));
 }
 assert.deepEqual(inputs[0],inputs[1]);assert.deepEqual(outputs[0],outputs[1]);assert.equal(outputs[1].proposalCopy.headline,'Markaya özel hedefler.');
});
test('empty or fabricated projected output enters bounded recovery instead of becoming an empty BHS',async()=>{
 const {context,value}=fixture();assert.throws(()=>validateExpertOutput({},context));
 assert.equal(validateExpertOutput(value,context).findings.length,2);
 assert.throws(()=>validateExpertOutput({researchCoverage:[],sources:[{id:'x',url:brief.website,quote:'A fabricated long enough source quote.'}],findings:[{id:'bad',statement:'Fabricated.',sourceIds:['x']}]},context));
 const models=[];
 const result=await recoverModelStage(async opts=>{models.push(opts.model);const data=models.length===1?{}:value;try{validateExpertOutput(data,context);}catch(e){e.code='model_output_invalid';throw e;}return {data};},'synthesis',{model:'gemini-2.5-pro'},{wait:async()=>{}});
 assert.deepEqual(models,['gemini-2.5-pro','gemini-4-argon']);assert.equal(result.data,value);
});
test('a peer product paragraph already read is retained when the model cited only its newsletter',()=>{
 const {value}=fixture(),p=packet();p.sources[1].excerpts=[{text:'Subscribe to our newsletter to receive useful updates about our company.'},{text:'Family planners and calendars are available in our product catalogue for households.'}];
 const context=expertContext(brief,{packet:p,searches:[]});value.peers[0].sourceIds=[context.cards.find(c=>c.url===plan.entities[1].website&&c.quote.startsWith('Subscribe')).id];
 const report=projectExpertReport(value,context);assert.equal(report.competitors.length,1);assert.ok(report.competitors[0].sourceIds.some(id=>report.sources.find(s=>s.id===id).quote.includes('Family planners')));
});
test('actual redirect provenance can confirm peer identity, but an unrelated host cannot',()=>{
 const {value}=fixture(),p=packet(),peer=p.sources[1];peer.finalUrl='https://verified-new-peer.example/products';
 const context=expertContext(brief,{packet:p,searches:[]});const id=context.cards.find(c=>c.url===peer.finalUrl).id;
 value.peers[0].sourceIds=[id];value.findings[1].sourceIds=[id];
 assert.equal(projectExpertReport(value,context).competitors[0].website,'https://verified-new-peer.example');
 delete context.input.sources.find(s=>s.url===peer.finalUrl).requestedUrl;
 assert.equal(projectExpertReport(value,context).competitors.length,0);
});
test('followups can add missing sources after a bounded first pass without repeating completed reads',async()=>{
 const p={entities:[plan.entities[0]],sources:Array.from({length:24},(_,i)=>({url:brief.website+'page-'+i,purpose:'Research'}))},read=[];
 const collect=createEvidenceCollector({allowPartialPlan:true,read:async url=>{read.push(url);return {status:200,headers:{'content-type':'text/html'},body:Buffer.from('<title>Brand planners</title><main>'+('Brand family planners catalogue and delivery information. '.repeat(40))+'</main>')};}});
 const first=await collect(brief,p,{sourceLimit:16});assert.equal(first.sources.length,16);
 const second=await collect(brief,{...p,sources:[{url:brief.website+'missing-reviews',purpose:'Customer reviews'}]},{initialPacket:first,extraSources:[brief.website+'missing-reviews']});
 assert.ok(second.sources.some(s=>s.url.endsWith('missing-reviews')));assert.equal(new Set(read).size,read.length);assert.ok(second.sources.length<=24);
});
test('observed technical proxies retain neutral questions without diagnosing unmeasured losses',()=>{
 for(const [observation,commercialHypothesis,quote] of [
  ['Internet Explorer uyarısı var.','Eski altyapı teknik borç yaratır.','Internet Explorer'],
  ['İndirilen HTML içinde Meta Pixel görülmedi.','Dönüşüm takibi ve retargeting kaybı var.','{"metaPixelTag":false}'],
  ['E-posta ve web alan adları farklı.','SEO otoritesi bölünmüş ve DMARC bozuk.','email domains'],
  ['16 takipçi listeleniyor.','Hesap aktif yönetilmiyor.','16 followers']
 ]){const f=qualifyExpertFinding({observation,commercialHypothesis,limitation:'Ölçülmedi.',question:'Neden?'},quote);assert.equal(f.observation,observation);assert.notEqual(f.commercialHypothesis,commercialHypothesis);assert.match(f.limitation,/kanıt|göster/);}
});
function dimensionsForTest(){return ['financial','operations','funnel','digital','perception','competition'].map(d=>({dimension:d,query:'Brand '+d,purpose:d+' research'}));}
test('partial competitor plans do not block identity collection; seeded URLs are not downloaded again',async()=>{
 const p={entities:[plan.entities[0]],sources:[{url:brief.website,purpose:'Identity'}]};let reads=0;
 const collect=createEvidenceCollector({allowPartialPlan:true,read:async()=>{reads++;return {status:200,headers:{'content-type':'text/html'},body:Buffer.from('<title>Brand planners</title><main>'+('Family planners and newsletters. '.repeat(50))+'</main>')};}});
 const first=await collect(brief,p);const second=await collect(brief,p,{initialPacket:first});assert.equal(reads,1);assert.equal(second.sources.length,1);
});
test('new signed jobs use v6 while already signed v5 jobs retain their original version',async t=>{
 const prior=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';t.after(()=>{if(prior===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=prior;});
 const secret='expert-handler-secret',host='expert.example',cookie='__Host-offer-research='+'x'.repeat(43),seen=[];
 const codec=createPricingProof(secret),rows=new Map();
 const handler=createBoundedAuditHandler({getSecret:()=>secret,getLedger:async()=>({begin:async()=>{},status:async()=>({chargedKurus:500,capKurus:5000}),get:async key=>rows.get(key)}),getProviders:()=>({configured:()=>true}),validateWebsite:async()=>{},runStage:async opts=>{seen.push(opts.researchVersion);},logger:{}});
 const start=response();await handler({method:'POST',headers:{host,origin:'https://'+host,cookie},body:{action:'start',requestId:'expert_handler_start_1',brief,context:{leadId:'lead',spaceId:'space'}}},start);
 assert.equal(codec.decode(start.data.ticket,'x'.repeat(43),host).researchVersion,'v6');
 const old=codec.encode({kind:'bounded_audit',createdAt:Date.now(),briefHash:briefHash(brief),auditHash:briefHash(brief),leadId:'lead',spaceId:'space',researchVersion:'v5',researchModel:'gemini-2.5-pro'},'x'.repeat(43),host);
 const next=response();await handler({method:'POST',headers:{host,origin:'https://'+host,cookie},body:{action:'advance',ticket:old,brief}},next);assert.deepEqual(seen,['v5']);
});
test('BHS public acceptance is confined to its explicit preview commit; ordinary builds remove QA output',async()=>{
 if(acceptanceEnabled())await runExpertAcceptance();
 else await runExpertAcceptance();
});
