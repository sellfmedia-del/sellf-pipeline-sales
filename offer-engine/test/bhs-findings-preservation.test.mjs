import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {scopedEvidence} from '../src/bhs/scoped-research.mjs';
import {writeScopedSynthesis} from '../src/bhs/collection-first.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {selectProposalAudit} from '../src/proposal/audit-selection.mjs';
import {createEvidenceCollector,researchHtmlText} from '../src/bhs/evidence.mjs';
import {supportedNumbers} from '../src/bhs/numeric-evidence.mjs';

const brief=snapshotBrief({brandName:'Example Studio',website:'https://brand.example/',segment:'kobi',
 goals:'Grow sales of the Royal product through existing online routes.',needs:'Understand the product and sales journey.',services:'Growth',meetingNotes:''});
const entity={id:'brand',role:'brand',name:brief.brandName,website:brief.website,
 scope:'Tactile product design.',audienceReason:'Nurseries.',scaleReason:'Not measured.',geographyReason:'United Kingdom.'};
const quote='Royal is a tactile mat product designed for nursery play areas.';
const need={id:'product',section:'competition',sectionTitle:'Product and competitor research',target:brief.brandName,
 market:'United Kingdom',metric:'Royal product and price',expected:'Read the product and its current listed price.',
 period:'',quantity:1,query:'Example Studio Royal product price',country:'GB',language:'en',first:'tavily',since:'',
 comparisonProduct:'Royal',comparisonRole:'reference'};
const fact={id:'q-product',url:brief.website+'products/royal',title:'Royal tactile mat',method:'html',quote,item:'Royal'};
const fit=status=>({status,reason:status==='partial'?'Product type is read; the price is not stated.':'The requested product type is directly described.'});
function fixture({sufficient=false,assessment='partial',role='reference',source=fact}={}){
 const task={...need,comparisonRole:role};
 return {brief,brand:{packet:{version:'sellf-evidence-v1',asOf:'2026-11-20',entities:[entity],sources:[]},facts:[],
  brandUnderstanding:{understanding:'A studio selling tactile products.'},briefUnderstanding:{understanding:brief.goals}},
  plan:{needs:[task],scopedResearch:true,adaptiveResearch:true,orderedResearch:true,qualityReport:true,verifiedResults:true,
   readEvidenceOnly:true,targetedEvidence:true,taskReporting:true,qualifyReportFindings:true,focusedProductComparison:true,
   questionEvidence:true,cleanResearchEvidence:true,reportOnlyAfterResearch:true,sectionedSynthesis:true,boundedReportParts:true,
   parallelReportParts:true,compactResearchContext:true,reportRecovery:true,preserveStatisticalScope:true,classifyReportFindings:true},
  rounds:[{closed:true,stopReason:'research_budget_exhausted',receipts:[{id:task.id,urls:[source.url],facts:[source]}],
   decisions:[{id:task.id,sufficient,proofs:[source.id],answerFit:fit(assessment)}]}]};
}
const empty={findings:[],peers:[],benchmarks:[],questions:[],hasMore:false};
function row(input,overrides={}){
 const proof=Object.keys(input.sources).find(id=>input.sources[id].at(-1).includes(quote));
 assert.ok(proof,'Read evidence must reach the writer');
 return {section:'Ürün ve satış yolu',area:'operations',conditionScope:'internal',rank:1,quadrant:'none',peerId:'brand',kind:'observation',needIds:[need.id],
  observation:'Royal, kreş oyun alanları için tasarlanmış bir ürün olarak sunuluyor.',proof:[proof],
  analysis:'Ürün kullanım alanı satış mesajının hangi alıcıya yöneltileceğini belirlemeye yardımcı olabilir.',
  action:'Ürün mesajını mevcut satış sayfasıyla karşılaştırın.',measurement:'Ürün sayfasından gelen başvurular.',
  limitation:'Fiyat ve satış performansı doğrulanmadı.',question:'',...overrides};
}
async function write(args,createRow=()=>({})){return writeScopedSynthesis({...args,providers:{
 manager:async(_stage,input)=>({data:{...empty,findings:[row(input,createRow(input))]}})
}});}

test('a brand product reference is not required to have a competitor publisher even under a competition heading',()=>{
 const args=fixture({sufficient:true,assessment:'direct'});
 const evidence=scopedEvidence(args.brand,args.plan,args.rounds);
 assert.equal(evidence.coverage[0].status,'confirmed');
 assert.ok(!evidence.coverage[0].requiresPeer);
 assert.deepEqual(evidence.verifiedPeers,[]);
});

test('brand IDs and brand names identify the subject without becoming a missing competitor',async()=>{
 for(const peerId of ['brand',brief.brandName]){
  const args=fixture();
  const synthesis=await write(args,()=>({peerId}));
  const audit=directAuditResult(brief,synthesis).data;
  assert.equal(audit.findings.length,1);
  assert.deepEqual(audit.competitors,[]);
  assert.ok(!audit.findings[0].peerId);
  assert.deepEqual(audit.findings[0].researchNeedIds,[need.id]);
 }
});

test('an unrelated unknown peer ID is still rejected rather than treated as the brand',async()=>{
 const synthesis=await write(fixture(),()=>({peerId:'unverified-rival'}));
 assert.equal(synthesis.report.findings.length,0);
 assert.deepEqual(synthesis.report.competitors,[]);
});

test('an open product-price question keeps its read product observation through the final offer transfer',async()=>{
 // No comparable product has been verified, so verifiedProductProofs is empty.
 const args=fixture({role:'rivals'});
 const synthesis=await write(args);
 const audit=directAuditResult(brief,synthesis).data;
 const proposal=selectProposalAudit(audit,brief);
 for(const report of [audit,proposal]){
  assert.equal(report.findings.length,1);
  assert.match(report.findings[0].statement,/Royal/);
  assert.equal(report.verifiedResearch.metrics[0].status,'open');
  assert.equal(report.verifiedResearch.metrics[0].researchStatus,'partially_verified');
  assert.deepEqual(report.competitors,[]);
 }
 assert.match(audit.rawReport,/Royal/);
 assert.ok(audit.sources.every(s=>s.verification.status==='quote_matched'));
});

test('snippets and unrelated answers cannot enter a partial product observation',async()=>{
 for(const args of [fixture({source:{...fact,method:'search-snippet'}}),fixture({assessment:'unrelated'})]){
  const evidence=scopedEvidence(args.brand,args.plan,args.rounds);
  assert.equal(evidence.accepted.length,0);
  assert.equal(evidence.coverage[0].status,'open');
 }
});

test('a separate missing-price sentence becomes a question without erasing the supported product sentence',async()=>{
 const synthesis=await write(fixture(),()=>({observation:'Royal, kreş oyun alanları için tasarlanmış bir ürün olarak sunuluyor. Fiyat doğrulanamadı.'}));
 const audit=directAuditResult(brief,synthesis).data;
 assert.deepEqual(audit.findings.map(f=>f.statement),['Royal, kreş oyun alanları için tasarlanmış bir ürün olarak sunuluyor.']);
 assert.equal(audit.verifiedResearch.metrics[0].status,'open');
 assert.ok(audit.meetingQuestions.some(row=>row.question.includes(need.metric)));
});

test('bounded page checkpoints restore the partial product observation without another writer call',async()=>{
 const args=fixture({role:'rivals'}),saved=new Map();let calls=0;
 const providers={readCheckpoint:async(name,key)=>saved.get(name+JSON.stringify(key)),
  checkpoint:async(name,key,run)=>{const value=await run();saved.set(name+JSON.stringify(key),value);return value;},
  manager:async(_stage,input)=>{calls++;return {data:{...empty,findings:Array.isArray(input.scope)?[row(input)]:[]}};}};
 const first=await writeScopedSynthesis({...args,providers});const before=calls;
 assert.equal(first.report.findings.length,1);
 const restored=await writeScopedSynthesis({...args,providers,allowWrite:false});
 assert.equal(calls,before);assert.deepEqual(restored.report,first.report);
 assert.equal(restored.report.verifiedResearch.metrics[0].status,'open');
});

test('the indefinite article in bir ürün does not assert a catalogue count; explicit counts remain checked',()=>{
 for(const claim of ['Marka bir ürün sunuyor.','Royal bir ürün olarak listeleniyor.','Bir ürünün kullanım alanı açıklanıyor.'])
  assert.equal(supportedNumbers(claim,quote),true,claim);
 for(const claim of ['Marka 1 ürün sunuyor.','Marka yalnız bir ürün sunuyor.','Marka tek bir ürün sunuyor.','Marka toplam bir ürün sunuyor.',
  'Marka en az bir ürün sunuyor.','Marka bir adet ürün sunuyor.','Marka bir milyon ürün sunuyor.','Marka bir gün içinde teslim ediyor.'])
  assert.equal(supportedNumbers(claim,quote),false,claim);
});

test('visible page text retains product examples, team/contact regions and explicit outbound sales links',()=>{
 const html='<header><nav>Navigation controls</nav><p>Example Studio product design team.</p></header><main><p>'+quote+'</p>'+
  '<a href="https://www.shopier.com/example?item=royal&amp;lang=en">Buy Royal</a></main>'+
  '<aside><p>Deniz is responsible for product design.</p></aside><footer><p>Contact our sales team.</p>'+
  '<a href="https://wa.me/905551112233">Message us</a></footer>'+
  '<script>Invented paid order result</script><template>Hidden product</template>';
 const text=researchHtmlText(html);
 for(const value of [quote,'product design team','Deniz','Contact our sales team',
  'https://www.shopier.com/example?item=royal&lang=en','https://wa.me/905551112233'])assert.ok(text.includes(value),value);
 assert.doesNotMatch(text,/Invented paid order|Hidden product|Navigation controls/);
 assert.doesNotMatch(researchHtmlText('<a href="javascript:alert(1)">Open</a>'),/javascript|alert/);
});

test('read web observations reach grounded findings and the offer without claiming successful transactions',async()=>{
 const html='<main><p>'+quote+'</p><p>Deniz handles product design for Example Studio.</p></main>'+
  '<footer><p>Contact the Example Studio sales team.</p><a href="https://www.shopier.com/example">Buy Royal</a>'+
  '<a href="https://wa.me/905551112233">Message us</a></footer>';
 let reads=0;
 const collector=createEvidenceCollector({allowPartialPlan:true,read:async()=>{
  reads++;return {status:200,headers:{'content-type':'text/html'},body:Buffer.from(html)};
 },render:async()=>assert.fail('Readable HTML requires no render')});
 const packet=await collector(brief,{entities:[entity],sources:[{url:brief.website,purpose:'Read the product and sales routes.'}]},
  {explicitSourcesOnly:true,prioritySources:[brief.website],allowEmpty:true});
 const args=fixture();args.brand.packet=packet;args.plan.needs=[];args.rounds=[{closed:true,stopReason:'research_budget_exhausted'}];
 const observations=[
  ['Royal, kreş oyun alanları için tasarlanmış bir ürün olarak sunuluyor.',quote],
  ['Ana sayfadaki satın alma bağlantısı Shopier adresine yöneliyor.','https://www.shopier.com/example'],
  ['İletişim bölümünde WhatsApp adresine giden bir mesaj bağlantısı bulunuyor.','https://wa.me/905551112233'],
  ['Deniz, marka sayfasında ürün tasarımı rolüyle tanıtılıyor.','Deniz handles'],
  ['İletişim bölümünde markanın satış ekibine ulaşma çağrısı yer alıyor.','Contact the Example Studio']
 ];
 const synthesis=await writeScopedSynthesis({...args,providers:{manager:async(_stage,input)=>{
  if(!Array.isArray(input.scope))return {data:empty};
  const existing=new Set(input.existing.map(([,observation])=>observation));
  const remaining=observations.filter(([observation])=>!existing.has(observation));
  return {data:{...empty,hasMore:remaining.length>2,
  findings:remaining.slice(0,2).map(([observation,text])=>{
   const proof=Object.keys(input.sources).find(id=>input.sources[id].at(-1).includes(text));assert.ok(proof,text);
   return {...row(input),rank:observations.findIndex(([value])=>value===observation)+1,peerId:'',needIds:[],observation,proof:[proof],
    limitation:'Sayfadaki metin ve bağlantı gözlemidir; ödeme, mesaj iletimi ve satış sonucu test edilmedi.'};
  })}};
 }}});
 const audit=directAuditResult(brief,synthesis).data,proposal=selectProposalAudit(audit,brief);
 assert.equal(reads,1);
 for(const report of [audit,proposal]){
  assert.equal(report.findings.length,observations.length);
  assert.deepEqual(report.findings.map(f=>f.statement),observations.map(([statement])=>statement));
  const verified=new Set(audit.sources.filter(s=>s.verification?.status==='quote_matched').map(s=>s.id));
  assert.ok(report.findings.every(f=>f.sourceIds.every(id=>verified.has(id))));
 }
 assert.match(audit.rawReport,/Shopier/);assert.match(audit.rawReport,/WhatsApp/);assert.match(audit.rawReport,/Deniz/);
 assert.deepEqual(audit.competitors,[]);
});
