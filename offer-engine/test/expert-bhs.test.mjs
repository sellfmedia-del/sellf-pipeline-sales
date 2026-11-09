import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {brief as raw} from './fixtures/bhs.mjs';
import {plan as legacyPlan} from './fixtures/evidence.mjs';
import {expertContext,expertModelInput,projectExpertReport,unsafeExpertClaim,qualifyExpertFinding,expertInstruction,expertVersion,expertSchema} from '../src/bhs/expert-report.mjs';
import {validateExpertOutput,generateExpert} from '../src/bhs/expert-research.mjs';
import {recoverModelStage} from '../src/budget/model-recovery.mjs';
import {runExpertAcceptance} from '../scripts/bhs-expert-acceptance.mjs';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {createPricingHandler} from '../api/pricing.js';
import {createProposalHandler} from '../api/proposal.js';
import {logoProof} from '../src/proposal/logo-proof.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {createResearchSnapshot,readResearchSnapshot} from '../src/bhs/research-snapshot.mjs';
import {methodologyAreas} from '../src/bhs/methodology-areas.mjs';
import {createBoundedAuditHandler} from '../src/bhs/bounded-handler.mjs';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
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
test('lossless model transport preserves repeated paragraph facts and all server proof chunks',()=>{
 const p=packet(),repeated='Family planner delivery returns newsletter and household ordering information '.repeat(5);
 p.sources[0].excerpts.push({text:repeated});p.sources[1].excerpts.push({text:repeated});
 const context=expertContext(brief,{packet:p,searches:[]}),original=structuredClone(context.input),input=expertModelInput(context);
 assert.deepEqual(context.input,original);assert.ok(JSON.stringify(input).length<JSON.stringify(original).length);
 for(let i=0;i<input.sources.length;i++)for(let j=0;j<input.sources[i].sections.length;j++){
  const s=input.sources[i].sections[j],before=original.sources[i].sections[j];assert.equal(s.text||input.sharedParagraphs[s.paragraphRef],before.text);assert.equal(s.proofIds[0],before.proofIds[0]);
  assert.ok(before.proofIds.every(id=>(context.proofGroups.get(s.proofIds[0])||[s.proofIds[0]]).includes(id)));
 }
});
test('expert projection reaches existing nine-section contract and saved research without extra model calls',()=>{
 const {context,value}=fixture(),report=projectExpertReport(value,context);
 assert.equal(report.findings.length,2);assert.equal(report.competitors.length,1);assert.equal(report.researchCoverage.length,24);
 assert.equal(report.dimensions.find(d=>d.id==='funnel').score,60);
 const audit=directAuditResult(brief,{report,analysisPacket:context.packet,methodologyVersion:expertVersion});
 assert.equal(audit.status,'ready');assert.equal(audit.data.scoring.total,null);assert.match(audit.data.rawReport,/## 9\. Kaynaklar/);
 assert.match(audit.data.findings[0].impact,/Hipotez:.*Sınır:/);assert.ok(!audit.data.findings[0].impact.includes('Bu dış kaynak'));
 assert.equal(audit.data.originalReport,undefined);assert.equal(audit.data.report.originalReport,undefined);
 assert.deepEqual(audit.data.sources,report.sources);assert.deepEqual(audit.data.findings,report.findings);
 const restored=readResearchSnapshot(createResearchSnapshot(audit.data,brief));assert.equal(restored.report.findings.length,2);assert.match(restored.report.findings[0].impact,/Satın alma dönüşümü ölçülmedi/);
});
test('the real rich BHS keeps every finding/source and reaches unchanged pricing/proposal limits',async t=>{
 const prior=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';t.after(()=>{if(prior===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=prior;});
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/rich-bhs-payload.json',import.meta.url),'utf8'));
 const sample=JSON.parse(inflateRawSync(Buffer.from(fixture.data,'base64')).toString('utf8')),normalizedBrief=snapshotBrief(sample.brief);
 assert.ok(JSON.stringify(sample.audit).length>600000,'The real incident must reproduce the existing size limit.');
 const packet={asOf:'2026-11-09',sources:sample.audit.data.sources.map(s=>({url:s.url,finalUrl:s.url,title:s.title,method:s.verification.method,excerpts:[{text:s.quote}]}))};
 const audit={stage:'audit',...directAuditResult(normalizedBrief,{report:sample.audit.data.report,analysisPacket:packet,methodologyVersion:expertVersion})};
 assert.deepEqual(audit.data.findings,sample.audit.data.findings);assert.deepEqual(audit.data.sources,sample.audit.data.sources);
 assert.ok(JSON.stringify(audit).length<600000);
 const host='bhs-rich-fixture.example',secret='bhs-fixture-only',session='x'.repeat(43),leadId='bhs-fixture-lead',headers={host,origin:'https://'+host,cookie:'__Host-offer-research='+session};
 const pricingProof=createPricingProof(secret).encode({kind:'audit_ready',createdAt:Date.now(),briefHash:briefHash(normalizedBrief),auditHash:digest(audit),budgetLeadId:leadId},session,host);
 const priced=response();await createPricingHandler({getSecret:()=>secret})({method:'POST',headers,body:{action:'start',brief:sample.brief,audit,pricingProof,serviceSelection:{services:[{serviceId:'onsite_seo'}],projects:[]}}},priced);
 assert.equal(priced.code,200);
 const f=await offerFixture(),logo={...f.logo.data,logoProof:logoProof(secret,host,f.logo.data)},composed=response();
 await createProposalHandler({getSecret:()=>secret})({method:'POST',headers,body:{action:'start',brief:sample.brief,audit,pricing:priced.data.result,proposalProof:priced.data.proposalProof,logo,context:{leadId,spaceId:'isolated-fixture'}}},composed);
 assert.equal(composed.code,200);assert.ok(composed.data.saveProof);
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
test('BHS alone switches to the existing priced Pro alternate and leaves time for a complete second attempt',async()=>{
 let now=1000;const calls=[],input={private:'unchanged'},schema={type:'object'},options={model:'gemini-2.5-pro',maxOutputTokens:16384,minOutputTokens:12288,thinkingLevel:'MEDIUM',validateData:()=>{}};
 const result=await generateExpert({generate:async(...args)=>{calls.push(args);if(calls.length===1){now+=160000;throw Object.assign(Error('Unavailable'),{code:'model_timeout'});}return {ok:true};}},'synthesis',input,schema,options,{now:()=>now});
 assert.deepEqual(result,{ok:true});assert.equal(calls.length,2);assert.equal(calls[0][3].recoveryDeadline,161000);assert.equal(calls[1][3].recoveryDeadline,251000);
 assert.equal(calls[1][3].model,'gemini-3.1-pro-preview');assert.equal(calls[1][1],input);assert.equal(calls[1][2],schema);
 for(const key of ['maxOutputTokens','minOutputTokens','thinkingLevel','validateData'])assert.equal(calls[1][3][key],options[key]);
 for(const code of ['budget_limit','budget_uncertain','quota','provider_accounting']){let count=0;await assert.rejects(generateExpert({generate:async()=>{count++;throw Object.assign(Error(),{code});}},'synthesis',input,schema,options),e=>e.code===code);assert.equal(count,1);}
 let count=0;await assert.rejects(generateExpert({generate:async()=>{count++;throw Object.assign(Error(),{providerStatus:503});}},'synthesis',input,schema,options),e=>e.code==='model_temporarily_unavailable'&&e.modelAttempts.length===2);assert.equal(count,2);
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
test('metadata-only pages keep their limitation and do not establish a read competitor product page',()=>{
 const {value}=fixture(),p=packet();p.sources[1].metadataOnly=true;
 const context=expertContext(brief,{packet:p,searches:[]});
 assert.equal(context.input.sources[1].metadataOnly,true);
 assert.ok(context.cards.filter(c=>c.url===p.sources[1].url).every(c=>c.metadataOnly&&c.scope.includes('meta verisi')));
 assert.equal(projectExpertReport(value,context).competitors.length,0);
});
test('a shared grounded finding supports multiple methodology areas without duplicating or losing it',()=>{
 const {value}=fixture(),p=packet();p.sources[0].excerpts.push({text:'Our family planner store runs on the WordPress ecommerce platform for its catalogue.'});
 const context=expertContext(brief,{packet:p,searches:[]}),proof=context.cards.find(c=>c.quote.includes('WordPress'));
 value.findings[0]={...value.findings[0],dimension:'digital',observation:'Markanın mağazası WordPress platformunu kullanıyor.',sourceIds:[proof.id]};
 value.coverage.operations_2={status:'partial',findingIds:['f1'],note:'Aynı doğrulanmış platformun operasyon boyutu.'};
 value.coverage.digital_2={status:'partial',findingIds:['f1'],note:'Doğrulanmış platform sinyali.'};
 const report=projectExpertReport(value,context);assert.equal(report.findings.length,2);
 const area=report.researchCoverage.find(a=>a.dimension==='operations'&&a.topic.includes('Platform'));
 assert.equal(area.status,'partial');assert.equal(area.observation,value.findings[0].observation);assert.deepEqual(area.sourceIds,report.findings[0].sourceIds);
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
test('reviewed public output does not revive locale, founder, holding, export or mismatched-shipping diagnoses',()=>{
 const cases=[
  ['Markanın Türkiye pazarına yönelik sitesinde Avro fiyatlar var.','Türkiye dönüşüm kaybı yaşar.','Avro prices','Hedef ülkelere'],
  ['Marka iki kardeş kurucu tarafından kurulmuştur.','Operasyon kuruculara aşırı bağımlı olabilir.','Founder story','Kritik görevler'],
  ['Marka bir holding tarafından satın alınmıştır.','Holdingin finansal gücü istikrarlı bir kaynak olduğunu düşündürür.','Holding acquisition','Ortaklık yapısının'],
  ['Marka ihracat yaptığını belirtiyor.','İhracat gelir kaynaklarını çeşitlendirir ve kur riskine karşı koruma sağlar.','Exports','Yurt içi'],
  ['Rakip abonelikte kargo almıyor.','Daha düşük kargo rakibe avantaj sağlar.','Shipping subscription','Benzer ürün'],
  ['Shopify platformu kullanılıyor.','Teknik yönetimi basitleştirir ve ürün geliştirmeye odaklanma sağlar.','Shopify','Platformun']
 ];
 for(const [observation,commercialHypothesis,quotes,prefix]of cases){const f=qualifyExpertFinding({observation,commercialHypothesis,limitation:'Bu standart bir uygulama değildir.',question:'Bu üstünlüğünüz nasıl satılıyor?',stance:'risk'},quotes);assert.equal(f.stance,'neutral');assert.ok(f.question.startsWith(prefix));assert.ok(!f.limitation.includes('standart bir uygulama değildir'));assert.notEqual(f.commercialHypothesis,commercialHypothesis);}
 assert.equal(unsafeExpertClaim({observation:'Tek bir fiziksel lokasyon var.'},'Akaretler office address'),'location_total_unconfirmed');
 const {context,value}=fixture();value.findings[0].dimension='perception';value.dimensions=[{...value.dimensions[0],id:'perception',score:85}];
 assert.equal(projectExpertReport(value,context).dimensions.find(d=>d.id==='perception').score,null,'Company positioning is not independent customer perception evidence.');
});
test('a neutralized technical proxy cannot remain a weakness or critical risk elsewhere in the report',()=>{
 const {value}=fixture(),p=packet();p.sources[0].excerpts.push({text:'Internet Explorer browser support is limited to the currently supported browser versions.'});
 const context=expertContext(brief,{packet:p,searches:[]}),id=context.cards.find(c=>c.quote.includes('Internet Explorer')).id;
 value.findings[0]={...value.findings[0],stance:'risk',observation:'Internet Explorer uyarısı bulunuyor.',commercialHypothesis:'Eski altyapı teknik borç yaratıyor.',sourceIds:[id]};value.riskId='f1';
 const report=projectExpertReport(value,context);assert.equal(report.findings.length,2);assert.equal(report.criticalRiskFindingId,null);assert.equal(report.dimensions.find(d=>d.id==='funnel').gaps.length,0);
 const legacy={researchCoverage:[],sources:[{id:'proof',url:brief.website,quote:context.cards[0].quote}],findings:[{id:'invented',dimension:'digital',kind:'observation',statement:'Meta Pixel eksik ve dönüşüm takibi yapılamaz.',sourceIds:['proof']}]};
 assert.throws(()=>validateExpertOutput(legacy,context));
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
 await runExpertAcceptance();
});
