import assert from 'node:assert/strict';
import test from 'node:test';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {sequentialPhases} from '../src/bhs/sequential-contracts.mjs';
import {runSequentialStage} from '../src/bhs/sequential-research.mjs';
import {planScopedResearch,reviewScopedResearch,runScopedDefaults,scopedEvidence,understandScopedBrand} from '../src/bhs/scoped-research.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {actorInput} from '../src/bhs/apify-inputs.mjs';
import {BudgetError} from '../src/budget/ledger.mjs';
import {recoverManagedSectionSynthesis,scopedRounds,writeScopedSynthesis} from '../src/bhs/collection-first.mjs';
import {createSequentialProviders} from '../src/bhs/sequential-providers.mjs';
import {quoteSearch} from '../src/budget/ledger.mjs';
import {reserveStageQuote} from '../src/bhs/supervised-providers.mjs';
import {sourceLinks} from '../src/bhs/evidence.mjs';
import {workerInfraReservationKurus} from '../src/bhs/job-infrastructure.mjs';
import {localBudget} from './fixtures/local-budget.mjs';
import {selectProposalAudit} from '../src/proposal/audit-selection.mjs';
import {localizeProposal} from '../src/proposal/language.mjs';
import {compositionEnvelope,offerCopy} from '../src/proposal/composition.mjs';
import {mergeManagedGapReport} from '../src/bhs/managed-gaps.mjs';
import {continuationAudit,restoreContinuation} from '../src/bhs/continuity.mjs';
import {scopedCoverage} from '../src/bhs/managed-report.mjs';
import {boundScopedEvidence} from '../src/bhs/scoped-evidence-index.mjs';
import {parseSourcePlan} from '../src/bhs/source-plan.mjs';
import {assertSchema} from '../src/bhs/schema.mjs';
import {verifiedBuyerProcess} from '../src/bhs/buyer-procurement.mjs';
import {groundOfferReport} from '../src/bhs/source-gate.mjs';

const brief=snapshotBrief({brandName:'Marque',website:'https://marque.fr/',segment:'corporate',goals:'Fransa pazarı ve aktif dağıtıcıları',services:'Growth',needs:'Dağıtım',meetingNotes:''});
const identity={understanding:'Marque SAS gıda üreticisi. Türkiye’de perakende kanalına satış yapıyor.'};
const briefUnderstanding={understanding:'Marka Fransa’ya girmek istiyor. Teklif aktif dağıtıcı araştırmasını kapsamalı.'};
const needs=[{section:'readiness',id:'t0',target:'Marque ürünleri',market:'Fransa',metric:'Aktif distribütörler',
 expected:'Ürün grubu ile uyumlu distribütör',period:'',quantity:10,query:'distributeurs actifs alimentation France marque',country:'FR',language:'fr',first:'both',since:''},
 {section:'digital',id:'t1',target:'Marque',market:'Fransa',metric:'Son 30 günün etkileşimi',expected:'Tarihli gönderi etkileşimleri',period:'Son 30 gün',
 quantity:10,query:'Marque Instagram son 30 gün etkileşim',country:'FR',language:'fr',first:'tavily',since:'2026-10-16'}];
const packet={version:'sellf-evidence-v1',asOf:'2026-11-15',entities:[{id:'brand',role:'brand',name:'Marque',website:brief.website}],
 sources:[{id:'ev1',url:brief.website,finalUrl:brief.website,title:'Marque',method:'html',excerpts:[{id:'a',text:'Marque produces packaged groceries and distributes to supermarkets in France.',offset:0}]}]};
const instagram='https://www.instagram.com/marque/';
const post='https://www.instagram.com/p/known/';
const quote='Marque runs a direct wholesale catalogue for supermarket customers in France.';
const postQuote='PublishedAt 2026-11-10 likesCount 84 commentsCount 6.';
const about='https://marque.fr/our-story';
const draft=overrides=>({approve:false,newNeeds:[],decisions:[],commands:[],peers:[],...overrides});
const searchQuotes={tavily:62,gemini:1044};
const openingCapacity=remainingKurus=>({remainingKurus,capKurus:3000,quotes:searchQuotes,
 defaults:Object.keys(searchQuotes).filter(t=>searchQuotes[t]<=remainingKurus),configuredDefaults:Object.keys(searchQuotes),actors:[],configuredActors:[]});

const instagramScope={section:'digital',target:'Marque Instagram',market:'Fransa',country:'FR',language:'fr'};
const engagement={id:'engagement',metric:'Son 30 günün etkileşimi',expected:'Son 30 günün gönderilerinde beğeni ve yorum toplamı',
 query:'Marque Instagram interactions publications derniers 30 jours',first:'tavily',quantity:3,period:'Son 30 gün',since:'2026-10-16'};
const frequency={...engagement,id:'frequency',metric:'Son 30 günün paylaşım sıklığı',expected:'Son 30 günün tarihli gönderi sayısı',
 query:'Marque Instagram nombre publications derniers 30 jours',first:'gemini',quantity:8};
const followers={...engagement,id:'followers',metric:'Güncel takipçi sayısı',expected:'Resmî hesaptaki takipçi sayısı',
 query:'Marque Instagram nombre abonnés officiel',quantity:1,period:'',since:''};

test('procurement is planned, verified and transferred by buyer group and question',async()=>{
 const scope={section:'buying',sectionTitle:'Satın alma yapısı',target:'Kreş alıcıları',market:'Birleşik Krallık',country:'GB',language:'en'};
 const measurement=(id,buyerSegment,buyingDimension)=>({id,buyerSegment,buyingDimension,metric:buyingDimension,
  buyerSourceSegment:id.startsWith('b0')?'independent nurseries':'nursery chains',
  expected:'O alıcı grubunun satın alma prosedürü',query:buyerSegment+' '+buyingDimension+' United Kingdom',first:'tavily',quantity:1,
  period:'',since:'',comparisonProduct:'',comparisonRole:'none'});
 const measurements=['Bağımsız kreşler','Kreş zincirleri'].flatMap((segment,i)=>
  ['decisionMaker','approval','channel'].map((dimension,j)=>measurement('b'+i+j,segment,dimension)));
 const controllerVersion={managedBudgetVersion:22};
 const planned=await planScopedResearch({brief,identity,briefUnderstanding,asOf:packet.asOf,packet,providers:{...controllerVersion,
  manager:async(_stage,input,contract,{normalizeData})=>{
   assert.match(input.instruction,/bağımsız işletmeler ile bir zincire bağlı işletmeleri ayrı araştır/);
   const output={needs:[{...scope,measurements}]};
   assertSchema(output,contract);
   return {data:normalizeData(output)};
  }}});
 assert.deepEqual(planned.needs.map(({id,buyerSegment,buyingDimension})=>[id,buyerSegment,buyingDimension]),
  measurements.map(({id,buyerSegment,buyingDimension})=>[id,buyerSegment,buyingDimension]));
 const record=(id,segment,market,value,passage,method='html')=>({
  quote:passage,method,id,url:'https://buyers.example/policies/'+id,title:id,item:id,
  buyerProcess:{proof:id,segment,market,value,passage}
 });
 const owner=record('owner','independent nurseries','United Kingdom','owners decide on purchases',
  'At independent nurseries in the United Kingdom, owners decide on purchases.');
 const limited=record('limited','independent nurseries','England','approval by the manager',
  'For independent nurseries in England, purchase orders require approval by the manager.');
 const supplier=record('supplier','independent nurseries','United Kingdom','supplier catalogue',
  'Our supplier catalogue lists play mats for independent nurseries in the United Kingdom.');
 const wrongBuyer={...owner,id:'other-buyer',buyerProcess:{...owner.buyerProcess,proof:'other-buyer'}};
 const unread=record('unread','nursery chains','United Kingdom','central approval',
  'For nursery chains in the United Kingdom, orders require central approval.','search-snippet');
 const chain=record('chain','nursery chains','United Kingdom','staff place orders through the approved supplier portal',
  'For nursery chains in the United Kingdom, staff place orders through the approved supplier portal.');
 const facts=[owner,limited,supplier,wrongBuyer,unread,chain];
 const receipts=facts.map(({buyerProcess,...fact},i)=>({id:measurements[i].id,facts:[fact],urls:[fact.url]}));
 const attempted=facts.map((fact,i)=>({id:measurements[i].id,sufficient:true,proofs:[fact.id],buyerProcess:fact.buyerProcess}));
 const plan={...planned,adaptiveResearch:true,qualityReport:true,taskReporting:true,readEvidenceOnly:true,
  targetedEvidence:true,verifiedResults:true,qualifyReportFindings:true,procurementResearch:true};
 const review=await reviewScopedResearch({identity,briefUnderstanding,brief,packet,plan,rounds:[{receipts}],last:true,
  providers:{...controllerVersion,manager:async(stage,input,contract)=>{
   assert.equal(stage,'bhs-scoped-clearance');
   assert.match(input.instruction,/Daha dar pazarı yeterli sayma/);
   const data=draft({approve:true,decisions:attempted});
   assertSchema(data,contract);
   return {data};
  }}});
 assert.equal(review.approved,false);
 assert.deepEqual(review.openNeeds,['b01','b02','b10','b11']);
 let delegated=false;
 const fallback=await reviewScopedResearch({identity,briefUnderstanding,brief,packet,plan:{...plan,needs:planned.needs.slice(0,2),
  orderedResearch:true,reportOnlyAfterResearch:true},rounds:[{receipts:receipts.slice(0,2)}],last:true,
  providers:{...controllerVersion,manager:()=>{throw new BudgetError('not_configured','fixture');},
   worker:async(stage,input,contract)=>{
    delegated=true;
    assert.equal(stage,'bhs-scoped-evidence-check');
    assert.deepEqual(input.tasks.map(task=>[task.buyerSourceSegment,task.buyingDimension]),
     [['independent nurseries','decisionMaker'],['independent nurseries','approval']]);
    const data={decisions:attempted.slice(0,2).map(row=>({...row,read:'',nextQuery:''}))};
    assertSchema(data,contract);
    return {data};
   }}});
 assert.equal(delegated,true);
 assert.deepEqual(fallback.decisions.map(row=>[row.id,row.sufficient,row.buyerProcess?.market]),[
  ['b00',true,'United Kingdom'],['b01',false,'England']
 ]);
 const rounds=[{receipts},{...review,closed:true,stopReason:'research_budget_exhausted'}];
 const brand={packet,facts:[],brandUnderstanding:identity,briefUnderstanding};
 const synthesis=await writeScopedSynthesis({brief,brand,plan,rounds,allowWrite:false,
  providers:{manager:()=>assert.fail('formatting saved procurement must be free')}});
 const audit=directAuditResult(brief,synthesis).data;
 const rows=audit.verifiedResearch.buyerProcurement;
 assert.deepEqual(rows.map(row=>[row.needId,row.evidence?.value,Boolean(row.hypothesis)]),[
  ['b00',owner.buyerProcess.value,false],['b01',limited.buyerProcess.value,true],['b02',undefined,true],
  ['b10',undefined,true],['b11',undefined,true],['b12',chain.buyerProcess.value,false]
 ]);
 assert.equal(rows[1].evidence.market,'England');
 assert.equal(rows[1].evidence.coversTarget,false);
 assert.deepEqual(audit.bhsSections[0].openMetrics.map(row=>row.id),review.openNeeds);
 assert.match(audit.rawReport,/Kaynaklı gözlem · independent nurseries · England/);
 const proposal=selectProposalAudit(audit,brief);
 assert.equal(proposal.verifiedResearch.buyerProcurement.length,6);
 assert.ok(rows[0].evidence.sourceIds.every(id=>proposal.sources.some(source=>source.id===id&&source.url===owner.url)));
 const translated=await localizeProposal({bhs:proposal,copy:{},alternatives:[],plans:{}},'en',{providers:{
  generate:async(_stage,{texts})=>{
   assert.ok(texts.includes(rows[1].hypothesis));
   assert.ok(texts.includes(rows[1].evidence.market));
   assert.ok(!texts.includes(rows[1].evidence.sourceIds[0]));
   return {model:'fixture',data:{translations:texts.map(text=>'EN '+text)}};
  }
 }});
 assert.equal(translated.bhs.verifiedResearch.buyerProcurement[1].hypothesis,'EN '+rows[1].hypothesis);
 const withoutOwner={...synthesis,analysisPacket:{...synthesis.analysisPacket,
  sources:synthesis.analysisPacket.sources.filter(source=>source.url!==owner.url),
  citationCards:synthesis.analysisPacket.citationCards.filter(source=>source.url!==owner.url)}};
 const savedAudit=directAuditResult(brief,withoutOwner).data;
 const regrounded=savedAudit.verifiedResearch.buyerProcurement[0];
 assert.equal(regrounded.evidence,undefined);
 assert.match(regrounded.hypothesis,/pilotta/);
 assert.equal(savedAudit.verifiedResearch.metrics.find(metric=>metric.id==='b00').status,'open');
 assert.deepEqual(savedAudit.verifiedResearch.metrics.find(metric=>metric.id==='b00').sourceIds,[]);
});

test('buyer evidence verifies the action with its group and market in the full source sentence',()=>{
 const en={segment:'independent pharmacies',market:'United Kingdom',country:'GB',language:'en'};
 const tr={segment:'bağımsız eczaneler',market:'Türkiye',country:'TR',language:'tr'};
 const fr={segment:'distributeurs indépendants',market:'France',target:'Fransa',country:'FR',language:'fr'};
 const de={segment:'unabhängige Einzelhändler',market:'Deutschland',target:'Almanya',country:'DE',language:'de'};
 const chain={...en,segment:'nursery chains'};
 const confirm=(scope,dimension,value,quote)=>({scope,dimension,value,quote,expected:'target'});
 const reject=(scope,dimension,value,quote,passage)=>({scope,dimension,value,quote,passage,expected:null});
 const cases=[
  confirm(en,'decisionMaker','owners decide on purchases','At independent pharmacies in the United Kingdom, owners decide on purchases.'),
  confirm(fr,'decisionMaker','la responsable des achats décide','Chez les distributeurs indépendants en France, la responsable des achats décide.'),
  confirm(en,'approval','must be approved by the head pharmacist','At independent pharmacies in the United Kingdom, purchase orders must be approved by the head pharmacist.'),
  confirm(tr,'approval','yönetici onayına tabidir','Türkiye genelinde bağımsız eczaneler için satın alma talepleri yönetici onayına tabidir.'),
  confirm(tr,'channel','siparişlerini bayi portalı üzerinden verir','Türkiye genelinde bağımsız eczaneler siparişlerini bayi portalı üzerinden verir.'),
  confirm(fr,'approval','approuvées par la direction','En France, les commandes des distributeurs indépendants doivent être approuvées par la direction.'),
  confirm(de,'approval','von der Einkaufsleitung genehmigen lassen','In Deutschland müssen unabhängige Einzelhändler Bestellungen von der Einkaufsleitung genehmigen lassen.'),
  {...confirm({...en,market:'England',target:en.market},'approval','approval by the regional manager',
   'For independent pharmacies in England, purchase orders require approval by the regional manager.'),expected:'limited'},
  {...confirm({...fr,market:'Île-de-France'},'decisionMaker','la responsable des achats décide',
   'Chez les distributeurs indépendants en Île-de-France, la responsable des achats décide.'),expected:'limited'},
  {...confirm({segment:'independent clinics',market:'Ontario',target:'Kanada',country:'CA',language:'en'},'approval','approval by the clinic manager',
   'For independent clinics in Ontario, Canada, orders require approval by the clinic manager.'),expected:'limited'},
  reject(fr,'decisionMaker','la responsable des achats décide','Chez les distributeurs indépendants en Île-de-France, la responsable des achats décide.'),
  reject(en,'decisionMaker','clerks provide price quotes',
   'At independent pharmacies in the United Kingdom, owners decide on purchases and clerks provide price quotes.'),
  reject(en,'decisionMaker','decide on purchases',
   'At independent pharmacies in the United Kingdom, owners decide on purchases.'),
  reject(en,'approval','must be approved by',
   'At independent pharmacies in the United Kingdom, purchase orders must be approved by the head pharmacist.'),
  reject(en,'channel','place orders through the supplier portal',
   'Independent pharmacies in the United Kingdom display catalogues; wholesalers place orders through the supplier portal.'),
  reject(chain,'channel','place orders through the approved supplier portal',
   'In the United Kingdom, nursery chains do not place orders through the approved supplier portal.'),
  reject(chain,'channel','place orders through the approved supplier portal',
   'No nursery chains in the United Kingdom place orders through the approved supplier portal.'),
  reject(en,'approval','approval by the head pharmacist',
   'At independent pharmacies in the United Kingdom, orders are processed without approval by the head pharmacist.'),
  reject(chain,'channel','place orders through the approved supplier portal',
   'In the United Kingdom, nursery chains plan to place orders through the approved supplier portal next year.'),
  reject(chain,'channel','place orders through the approved supplier portal',
   'It is prohibited for United Kingdom nursery chains to place orders through the approved supplier portal.',
   'United Kingdom nursery chains to place orders through the approved supplier portal.'),
  reject({...fr,segment:'independent distributors'},'channel','place orders through the manufacturer supplier portal',
   'This policy does not apply in France. Independent distributors in Belgium place orders through the manufacturer supplier portal.'),
  reject(chain,'channel','approved supplier portal','In the United Kingdom, the approved supplier portal lists articles for nursery chains.'),
  {...confirm(en,'decisionMaker','owners decide on purchases','At independent pharmacies in the United Kingdom, owners decide on purchases.'),method:'search-snippet',expected:null},
  {...confirm(en,'decisionMaker','owners decide on purchases','At independent pharmacies in the United Kingdom, owners decide on purchases.'),factNeed:'another',expected:null}
 ];
 for(const {scope,dimension,value,quote,passage=quote,expected,method='pdf',factNeed='buyer'} of cases){
  const {segment,market,target=market,country,language}=scope;
  const need={id:'buyer',buyerSegment:segment,buyerSourceSegment:segment,buyingDimension:dimension,market:target,country,language};
  const result=verifiedBuyerProcess(need,{proof:'q',segment,market,value,passage},['q'],[{id:'q',needId:factNeed,method,quote}]);
  assert.equal(result?(result.coversTarget?'target':'limited'):null,expected,quote);
 }
});

test('procurement does not inherit quantitative or peer requirements from its export heading',async()=>{
 const need={...needs[0],id:'buyer',section:'İhracat pazarı',sectionTitle:'İhracat pazarındaki rakip alıcılar',
  metric:'İhracat için satın alma kararı',buyerSegment:'Bağımsız distribütörler',buyerSourceSegment:'distributeurs indépendants',
  buyingDimension:'decisionMaker',comparisonRole:'rivals',comparisonProduct:'Marque'};
 const passage='Chez les distributeurs indépendants en France, la responsable des achats décide.';
 const fact={id:'q',method:'pdf',url:'https://buyers.example/rules',item:'rules',title:'Acheteurs',quote:passage};
 const claim={proof:'q',segment:'distributeurs indépendants',market:'France',value:'la responsable des achats décide',passage};
 const receipts=[{id:need.id,urls:[fact.url],facts:[fact]}];
 const plan={needs:[need],procurementResearch:true,focusedProductComparison:true,qualityReport:true,
  verifiedResults:true,scopeMarketCounts:true,readEvidenceOnly:true,taskReporting:true};
 const result=await reviewScopedResearch({identity,briefUnderstanding,brief,packet,plan,rounds:[{receipts}],last:true,
  providers:{managedBudgetVersion:22,manager:async(_stage,_input,contract)=>{
   const data=draft({approve:true,decisions:[{id:need.id,sufficient:true,proofs:['q'],buyerProcess:claim}]});
   assertSchema(data,contract);
   return {data};
  }}});
 assert.equal(result.approved,true);
 const evidence=scopedEvidence({packet},plan,[{receipts},result]);
 assert.equal(evidence.coverage[0].status,'confirmed');
 assert.equal(evidence.coverage[0].marketMeasures,undefined);
 assert.equal(evidence.coverage[0].requiresPeer,undefined);
 assert.equal(evidence.approved,true);
});

test('a later partial procurement report preserves confirmed evidence and coverage',()=>{
 const evidence={sourceIds:['prior'],coversTarget:true};
 const buyer={needId:'buyer',segment:'Bağımsız distribütörler',dimension:'approval',targetMarket:'Fransa',evidence};
 const originalMetric={id:'buyer',section:'supply',status:'confirmed',sourceIds:['prior']};
 const patchMetric={...originalMetric,status:'open',researchStatus:'partially_verified',sourceIds:['patch']};
 const common={findings:[],competitors:[],dimensions:[],meetingQuestions:[]};
 const original={...common,sources:[{id:'prior'}],verifiedResearch:{metrics:[originalMetric],buyerProcurement:[buyer]}};
 const patch={...common,sources:[{id:'patch'}],verifiedResearch:{metrics:[patchMetric],buyerProcurement:[
  {...buyer,evidence:{...evidence,sourceIds:['patch']},hypothesis:'Yeni örneklem kısmi'}
 ]}};
 const merged=mergeManagedGapReport(original,patch,['supply'],{taskReporting:true});
 assert.deepEqual(merged.verifiedResearch.buyerProcurement,[buyer]);
 assert.equal(merged.verifiedResearch.metrics[0].status,'confirmed');
 assert.deepEqual(merged.verifiedResearch.metrics[0].sourceIds,['prior']);
 assert.equal(scopedCoverage(merged,[patchMetric],true,true,false,true).some(section=>section.openMetrics?.length),false);
});

test('a negative buyer statement remains a pilot hypothesis through the audit and proposal',async()=>{
 const need={...needs[0],id:'buyer',section:'purchasing',sectionTitle:'Satın alma',metric:'Sipariş kanalı',first:'gemini',
  buyerSegment:'Kreş zincirleri',buyerSourceSegment:'nursery chains',buyingDimension:'channel',market:'United Kingdom',country:'GB',language:'en'};
 const url='https://buyers.example/terms';
 const passage='In the United Kingdom, nursery chains do not place orders through the approved supplier portal.';
 const receipts=await runScopedDefaults([need],{
  managedBudgetVersion:22,searchGemini:async()=>({results:[{url}]}),
  worker:async()=>assert.fail('procurement review must retain reader context rather than model extracts')
 },async()=>({sources:[{url,method:'html',excerpts:[{text:passage}]}]}));
 const fact=receipts[0].facts[0];
 assert.equal(fact.quote,passage);
 const buyerProcess={proof:fact.id,segment:'nursery chains',market:'United Kingdom',value:'place orders through the approved supplier portal',passage};
 const plan={needs:[need],procurementResearch:true,adaptiveResearch:true,qualityReport:true,verifiedResults:true,readEvidenceOnly:true,taskReporting:true};
 const report=await writeScopedSynthesis({brief,brand:{packet,facts:[],brandUnderstanding:identity,briefUnderstanding},plan,allowWrite:false,
  rounds:[{approved:true,receipts,decisions:[{id:need.id,sufficient:true,proofs:[fact.id],buyerProcess}]}],
  providers:{manager:async()=>assert.fail('saved research does not call a provider')}});
 const audit=directAuditResult(brief,report).data;
 assert.equal(audit.verifiedResearch.buyerProcurement[0].evidence,undefined);
 const proposal=selectProposalAudit(audit,brief);
 assert.equal(proposal.verifiedResearch.buyerProcurement[0].evidence,undefined);
 assert.match(proposal.verifiedResearch.buyerProcurement[0].hypothesis,/pilotta/);
});

test('task titles survive planning and saved source reads determine the user-visible gap states',async()=>{
 const fields=[
  {id:'price',section:'T_FIYAT',sectionTitle:'Royal set fiyatlandırması',metric:'Royal set için Türkiye satış fiyatları'},
  {id:'buyer',section:'T_ALICI',sectionTitle:'Alıcı davranışı',metric:'Alıcıların başvuru kanalları'},
  {id:'royal',section:'T_ROYAL',sectionTitle:'Royal set ürün deneyimi',metric:'Royal set kullanım koşulları'},
  {id:'social',section:'T_IG',sectionTitle:'Sosyal medya performansı',metric:'Instagram etkileşimi'},
  {id:'pending',section:'T_KANAL',sectionTitle:'Satış altyapısı',metric:'Bayilerin satış kayıtları'},
  {id:'failed',section:'T_PAZAR',sectionTitle:'Hedef pazar',metric:'Hedef pazarda satış kanalları'}
 ];
 const grouped=fields.map(({id,section,sectionTitle,metric})=>({...instagramScope,section,sectionTitle,
  measurements:[{...engagement,id,metric,first:'gemini',comparisonProduct:'',comparisonRole:'none',buyerSegment:'',buyerSourceSegment:'',buyingDimension:'none'}]}));
 const version={managedBudgetVersion:22};
 const planned=await planScopedResearch({brief,identity,briefUnderstanding,asOf:packet.asOf,packet,providers:{...version,
  manager:async(stage,input,contract,{normalizeData,responseSchema})=>{
   assert.equal(stage,'bhs-scoped-plan');
   assert.match(input.instruction,/sectionTitle görevin satış ekranındaki başlığıdır/);
   const response={needs:grouped};
   assertSchema(response,contract);
   const data=normalizeData(response);
   assertSchema(data,responseSchema);
   return {data};
  }}});
 assert.deepEqual(planned.needs.map(n=>n.sectionTitle),fields.map(n=>n.sectionTitle));
 const [price,buyer,royal,social]=planned.needs;
 const unread='https://catalogue.fr/prices';
 const royalUrl='https://marque.fr/royal';
 const socialUrl='https://marque.fr/social';
 const providers={...version,searchGemini:async need=>({results:need.id==='buyer'?[]:
  [{url:{price:unread,royal:royalUrl,social:socialUrl}[need.id]}]}),
  geminiWorker:async()=>({data:{results:[]}})};
 const receipts=await runScopedDefaults([price,buyer,royal,social],providers,async urls=>{
  const [url]=urls;
  if(url===unread)return {sources:[],unavailable:[{url,reason:'HTTP_403'}]};
  return {sources:[{url,method:'html',excerpts:[{text:'Marque publishes public information about its product range and order process.'}]}]};
 });
 assert.deepEqual(receipts[0].sourceReads,[{url:unread,readable:false}]);
 assert.deepEqual(receipts[2].sourceReads,[{url:royalUrl,readable:true}]);
 const plan={needs:planned.needs,taskReporting:true,verifiedResults:true,readEvidenceOnly:true,targetedEvidence:true,qualityReport:true};
 const rounds=[{receipts:[...receipts,{id:'failed',attempts:[{tool:'gemini',issue:'provider_error'}],urls:[],facts:[]}],decisions:[{id:'royal',proofs:[receipts[2].facts[0].id],sufficient:false},
  {id:'social',proofs:[receipts[3].facts[0].id],sufficient:true}]}];
 const evidence=scopedEvidence({packet},plan,rounds);
 const sections=scopedCoverage({findings:[]},evidence.coverage,true,true,false,true);
 assert.deepEqual(sections.map(s=>[s.id,s.title,s.openMetrics[0].id,s.openMetrics[0].status,s.openMetrics[0].statusLabel]),[
  ['T_FIYAT',fields[0].sectionTitle,'price','source_unreadable','Kaynak okunamadı'],
  ['T_ALICI',fields[1].sectionTitle,'buyer','searched','Arama yapıldı, yeterli kanıt bulunamadı'],
  ['T_ROYAL',fields[2].sectionTitle,'royal','partially_verified','Ölçüm kısmen doğrulandı'],
  ['T_IG',fields[3].sectionTitle,'social','missing_from_report','Doğrulandı, rapora aktarılamadı'],
  ['T_KANAL',fields[4].sectionTitle,'pending','not_searched','Aranmadı'],
  ['T_PAZAR',fields[5].sectionTitle,'failed','search_incomplete','Arama tamamlanamadı']
 ]);
 rounds.push({receipts:[{id:'price',sourceReads:[{url:unread,readable:true}]}]});
 assert.equal(scopedEvidence({packet},plan,rounds).coverage[0].researchStatus,'searched');
});

test('a verified pharmacy finder follows its business impact into operations without creating a missing task',async()=>{
 const scopeBrief=snapshotBrief({...brief,brandName:'NBT İlaç',goals:'Eczane kanalıyla satışa yönlendirmeyi ölçmek',needs:'Eczane Bul ve bayi satışları'});
 const permit={...needs[1],id:'finder',section:'B_UYUM',sectionTitle:'Mevzuat ve uyum',metric:'Eczane Bul ile satış noktasına yönlendirme'};
 const followUp={...needs[1],id:'rules',section:'B_UYUM',sectionTitle:'Mevzuat ve uyum',metric:'Yönlendirmeye ilişkin güncel kural'};
 const quote='Eczane Bul haritası ziyaretçiye şehir seçtirerek ilgili satış noktalarını listeliyor.';
 const fact={id:'finder-proof',url:brief.website+'eczane-bul',title:'Eczane Bul',method:'html',item:'Satış noktası',quote};
 const plan={needs:[permit,followUp],taskReporting:true,sectionedSynthesis:true,readEvidenceOnly:true,verifiedResults:true,
  targetedEvidence:true,orderedResearch:true,qualityReport:true,adaptiveResearch:true,scopedResearch:true,reportOnlyAfterResearch:true};
 const scopedBrand={packet,facts:[],brandUnderstanding:identity,briefUnderstanding:{understanding:scopeBrief.goals}};
 const rounds=[{closed:true,stopReason:'research_budget_exhausted',receipts:[{id:permit.id,facts:[fact],urls:[fact.url]}],
  decisions:[{id:permit.id,sufficient:true,proofs:[fact.id]}]}];
 const providers={manager:async(stage,input)=>{
  if(stage.endsWith('-swot'))return {data:{findings:[],benchmarks:[],questions:[]}};
  assert.equal(stage,'bhs-scoped-report-brief');
  assert.equal(input.needs[0].sectionTitle,'Mevzuat ve uyum');
  assert.match(input.instruction,/birebir sığmasa da rapora al/);
  const proof=Object.entries(input.sources).find(([,row])=>row[1].includes(quote))[0];
  const base={section:'Operasyonel verimlilik',area:'',rank:1,quadrant:'none',peerId:'',kind:'observation',needIds:[permit.id],
   observation:quote,proof:[proof],analysis:'Satışa yönlendirmeyi şehir bazında değerlendirmek için başlangıç sağlar.',
   action:'Harita tıklamalarını ilgili satış noktasıyla eşleştir.',measurement:'Satış noktası bazında yönlendirme sayısı.',limitation:'',question:''};
  return {data:{findings:[base,{...base,rank:2,observation:'Doğrulanmamış mevzuat iddiası.',needIds:[followUp.id]}],
   benchmarks:[],questions:[]}};
 }};
 const args={brief:scopeBrief,brand:scopedBrand,plan,rounds,providers};
 const synthesis=await writeScopedSynthesis(args);
 const audit=directAuditResult(scopeBrief,synthesis).data;
 const item=audit.findings.find(f=>f.statement===quote);
 assert.equal(item.dimension,'operations');
 assert.equal(item.bhsSection,'operations');
 assert.deepEqual(item.researchNeedIds,[permit.id]);
 assert.ok(item.sourceIds.length);
 assert.equal(audit.bhsSections.find(s=>s.id==='operations').title,'Operasyonel verimlilik');
 assert.deepEqual(audit.bhsSections.find(s=>s.id==='B_UYUM').openMetrics.map(m=>m.id),[followUp.id]);
 assert.ok(!audit.findings.some(f=>f.statement==='Doğrulanmamış mevzuat iddiası.'));
 assert.ok(selectProposalAudit(audit,scopeBrief).findings.some(f=>f.id===item.id&&f.sourceIds.length));
 const patch=await writeScopedSynthesis({...args,sections:['B_UYUM']});
 const original={...audit,findings:[],competitors:[],verifiedResearch:{metrics:[]}};
 const merged=mergeManagedGapReport(original,patch.report,['B_UYUM'],{taskReporting:true});
 assert.ok(merged.findings.some(f=>f.id===item.id&&f.bhsSection==='operations'));
});

test('sectioned synthesis connects each brief to its own sales workflow and retains verified parts after a clipped answer',async()=>{
 const fixtures=[
  {name:'NBT İlaç',goals:'Bayi satış takibi kurmak',needs:'Bayi kimliği, dönem ve satış çıktısı',quote:'Bayi sipariş formu bayi kodu, ürün kodu ve sipariş tarihini kaydediyor.',
   action:'Bayi kodu ve sipariş tarihini satış raporuna bağla.',measurement:'Bayi bazında aylık sipariş ve satış toplamı.',
   question:'Bayi kodu sipariş ve gerçekleşen satış kayıtlarında nasıl eşleştiriliyor?'},
  {name:'Muffik',goals:'Başvuru → teklif → sipariş dönüşümünü izlemek',needs:'Her aşamanın zaman damgası ve kaynağı',quote:'Başvuru formu talep kaydı açıyor ve onaydan sonra teklif gönderiliyor.',
   action:'Başvuruyu, teklif kaydını ve sipariş olayını talep kimliğiyle eşleştir.',measurement:'Başvuru → teklif ve teklif → sipariş dönüşüm oranı.',
   question:'Teklif ve gerçekleşen sipariş aynı talep kimliğiyle eşleşiyor mu?'}
 ];
 for(const fixture of fixtures){
  const scopedBrief=snapshotBrief({...brief,brandName:fixture.name,goals:fixture.goals,needs:fixture.needs});
  const scopedBrand={packet,facts:[],brandUnderstanding:identity,briefUnderstanding:{understanding:fixture.goals+' için ölçüm tasarımı.'}};
  const metrics=Array.from({length:6},(_,i)=>({...needs[1],id:'m'+i,section:i<3?'SATIŞ':'KAPSAM',metric:i===0?fixture.needs:'Araştırma '+i}));
  const plan={needs:metrics,scopedResearch:true,qualityReport:true,verifiedResults:true,readEvidenceOnly:true,sectionedSynthesis:true,
   adaptiveResearch:true,targetedEvidence:true,orderedResearch:true,reportOnlyAfterResearch:true};
  const primary={id:'first',url:about,title:fixture.name,item:'Süreç',method:'html',quote:fixture.quote};
  const missingField={id:'second',url:brief.website+'form',title:'Başvuru formu',item:'Süreç alanı',method:'html',
   quote:'Form, talep alanını zorunlu tutuyor ve sipariş durumunu bu ekranda göstermiyor.'};
  const marketReport={id:'third',url:'https://chamber.fr/market',title:'Kanal araştırması',item:'Pazar',method:'pdf',
   quote:'Fransa perakende araştırması, mevcut üyeler için toplu sipariş talebini belgeliyor.'};
  const snippet={id:'unread',url:'https://not-opened.example/',title:'Arama',item:'Arama',method:'search-snippet',
   quote:'Dönüşümün yüzde 47 olduğu iddia ediliyor.'};
  const last={id:'last',url:'https://commerce.fr/registry',title:'Kanal kaydı',item:'Kanal',method:'html',
   quote:'Kanal rehberi tedarikçilerin sipariş onaylarını çevrimiçi kullandığını belirtiyor.'};
  const receipts=[[primary],[missingField],[marketReport],[last],[snippet]].map((facts,i)=>({id:metrics[i].id,urls:facts.map(f=>f.url),facts}));
  const round={closed:true,stopReason:'research_budget_exhausted',receipts,decisions:receipts.map(r=>({id:r.id,sufficient:true,proofs:r.facts.map(f=>f.id)}))};
  const args={brief:scopedBrief,brand:scopedBrand,plan,rounds:[round]};
  const requests=[],saved=new Map();
  const readCheckpoint=async(name,key)=>saved.get(name+JSON.stringify(key));
  const providers={readCheckpoint,checkpoint:async(name,key,run)=>{
   const result=await run();saved.set(name+JSON.stringify(key),result);return result;
  },manager:async(stage,input,contract,options)=>{
   requests.push(stage);
   assert.equal(input.brief.goals,fixture.goals);
   assert.equal(input.brief.needs,fixture.needs);
   assert.equal(options.maxOutputTokens,2600);
   assert.ok(contract.properties.findings.maxItems<=7);
   assert.ok(!Object.values(input.sources).some(row=>row[1].includes(snippet.quote)));
   const proof=fact=>Object.entries(input.sources).find(([,row])=>row[1].includes(fact.quote))?.[0];
   const base={section:'SATIŞ',area:'',rank:1,quadrant:'none',peerId:'',kind:'observation',needIds:[],
    analysis:'Süreç verileri satış kararındaki belirsizliği azaltabilir.',action:fixture.action,measurement:fixture.measurement,limitation:'İç kayıtlarla doğrulanacak.',question:''};
   const found=(fact,index,overrides={})=>({...base,observation:fact.quote,proof:[proof(fact)],needIds:[metrics[index].id],...overrides});
   let data;
   if(stage.endsWith('-brief')){
    assert.deepEqual(input.needs.map(n=>n.id),['m0','m1','m2']);
    assert.equal(input.needs[0].metric,fixture.needs);
    assert.match(input.instruction,/başvuru → teklif → sipariş/);
    data={findings:[found(primary,0),{...base,observation:snippet.quote,proof:['not-sent']}],benchmarks:[],questions:[fixture.question]};
   }else if(stage.endsWith('-swot')){
    assert.deepEqual(input.scope.quadrants,['strength','weakness','opportunity','threat']);
    assert.ok(input.existing.some(row=>row.includes(primary.quote)));
    data={findings:[
     found(missingField,1,{quadrant:'weakness'}),
     found(marketReport,2,{quadrant:'opportunity'}),
     found(primary,0,{quadrant:'strength',observation:primary.quote.replace(/\.$/,' ve ekip bu alanları eşleştirebilir.'),kind:'inference'}),
     found(missingField,1,{quadrant:'threat',observation:'Formda talep alanı zorunludur.'})
    ],benchmarks:[],questions:['Rakiplerin teslimat süresi hedef pazarda nasıl doğrulanabilir?']};
   }else{
    assert.deepEqual(input.needs.map(n=>n.id),['m3','m4','m5']);
    assert.ok(input.existing.some(row=>row.includes(marketReport.quote)));
    data={findings:[found(last,3,{section:'KAPSAM'})],benchmarks:[],questions:[]};
   }
   const normalized=options.normalizeData(data);
   assertSchema(normalized,contract);
   if(stage.endsWith('-topics'))assert.equal(options.acceptPartialData(normalized),true);
   return {data:normalized,model:'offline',usage:{input_tokens:100},partialOutput:stage.endsWith('-topics')};
  }};
  const synthesis=await writeScopedSynthesis({...args,providers});
  assert.deepEqual(requests,['bhs-scoped-report-brief','bhs-scoped-report-swot','bhs-scoped-report-topics']);
  assert.equal(synthesis.supervision.reportIssue,'partial_model_document');
  assert.equal(synthesis.usage.parts.length,3);
  const restored=await writeScopedSynthesis({...args,allowWrite:false,providers:{readCheckpoint,manager:()=>assert.fail('read only recovery')}});
  assert.deepEqual(restored.report,synthesis.report);
  const result=directAuditResult(scopedBrief,restored).data;
  const finding=result.findings.find(f=>f.statement===primary.quote);
  assert.equal(finding.recommendation.action,fixture.action);
  assert.equal(finding.recommendation.measurement,fixture.measurement);
  assert.ok(result.meetingQuestions.some(q=>q.question===fixture.question));
  const swot=result.bhsSections.find(section=>section.id==='swot');
  assert.equal(swot.complete,false);
  assert.ok(swot.missingQuadrants.includes('threat'));
  assert.ok(!swot.missingQuadrants.includes('weakness'));
  assert.ok(result.findings.some(f=>f.statement===last.quote));
  assert.ok(!result.findings.some(f=>f.statement===snippet.quote));
  assert.match(result.rawReport,/Kanıt bekleyen SWOT kolları · .*Tehdit/);
 }
});

test('a sectioned report keeps the brief questions when the evidence supports no finding',async()=>{
 const need={...needs[1],section:'SATIŞ',metric:'Başvuru → teklif geçişi'};
 const plan={needs:[need],scopedResearch:true,qualityReport:true,verifiedResults:true,readEvidenceOnly:true,sectionedSynthesis:true,
  adaptiveResearch:true,targetedEvidence:true,orderedResearch:true,reportOnlyAfterResearch:true};
 const scopedBrand={packet:{...packet,sources:[]},facts:[],brandUnderstanding:identity,briefUnderstanding};
 const question='Başvurudan teklife geçen kayıtlar hangi sistemde ve hangi tarih alanıyla izleniyor?';
 const result=await writeScopedSynthesis({brief,brand:scopedBrand,plan,rounds:[{closed:true,stopReason:'research_budget_exhausted'}],
  providers:{manager:async(stage,input)=>{
   assert.equal(stage,'bhs-scoped-report-brief');
   assert.equal(input.needs[0].metric,need.metric);
   return {data:{findings:[],benchmarks:[],questions:[question]}};
  }}});
 assert.deepEqual(result.report.findings,[]);
 assert.ok(result.report.meetingQuestions.some(q=>q.question===question));
 assert.equal(result.report.bhsSections.find(s=>s.id==='swot').missingQuadrants.length,4);
});

test('scoped report recovery restores later parts without the first part or any model call',async()=>{
 const metrics=Array.from({length:6},(_,index)=>({...needs[0],id:'part-'+index,metric:'Dağıtım kanalı '+index}));
 const plan={needs:metrics,scopedResearch:true,adaptiveResearch:true,orderedResearch:true,qualityReport:true,
  verifiedResults:true,readEvidenceOnly:true,targetedEvidence:true,sectionedSynthesis:true,reportRecovery:true,reportOnlyAfterResearch:true};
 const proofs=[
  {id:'retail',url:about,title:'Marque dağıtım',method:'html',quote:'Marque runs a direct wholesale catalogue for supermarket customers in France.'},
  {id:'orders',url:'https://market.example/orders',title:'Sipariş rehberi',method:'pdf',quote:'French distributors accept purchase orders through their existing supplier accounts.'}
 ];
 const receipts=proofs.map((proof,index)=>({id:metrics[index*3].id,urls:[proof.url],facts:[proof]}));
 const args={brief,brand:{packet,facts:[],brandUnderstanding:identity,briefUnderstanding},plan,
  rounds:[{closed:true,stopReason:'research_budget_exhausted',receipts,decisions:receipts.map(row=>({id:row.id,sufficient:true,proofs:row.facts.map(p=>p.id)}))}]};
 const saved=new Map();
 const readCheckpoint=async(_name,key)=>saved.get(JSON.stringify(key));
 const providers={readCheckpoint,checkpoint:async(_name,key,write)=>{
  const result=await write();saved.set(JSON.stringify(key),result);return result;
 },manager:async(stage,input,_schema,options)=>{
  const index=Number(stage.endsWith('-topics'));
  const swot=stage.endsWith('-swot');
  assert.deepEqual(input.existing,[]);
  if(stage.endsWith('-brief'))assert.equal(options.reserveForFollowingKurus,660);
  const proof=Object.entries(input.sources).find(([,row])=>row[1].includes(proofs[index].quote))?.[0];
  const observation=swot?'Marque operates its own wholesale catalogue for French supermarkets.':proofs[index].quote;
  return {model:'offline',data:{findings:[{section:'readiness',rank:1,quadrant:swot?'strength':'none',
   observation,proof:[proof],needIds:[metrics[index*3].id],kind:'observation',
   analysis:'Kanal kapsamı dağıtım önceliğini etkileyebilir.',action:'Dağıtım kanalını bir örnek siparişle sınayın.',
   measurement:'Başvuruyu siparişe bağlayan kayıt.',limitation:'Satış hacmi doğrulanmadı.'}],benchmarks:[],questions:[]}};
 }};
 const initial=await writeScopedSynthesis({...args,providers});
 assert.equal(initial.report.findings.length,3);
 assert.equal(saved.size,3);
 assert.equal(initial.supervision.reportIssue,undefined);
 saved.delete([...saved.keys()].find(key=>JSON.parse(key).part==='brief'));
 const restored=await writeScopedSynthesis({...args,allowWrite:false,providers:{readCheckpoint,manager:()=>assert.fail('no model call')}});
 assert.equal(restored.supervision.reportIssue,'report_checkpoint_missing');
 const findings=restored.report.findings;
 assert.equal(findings.length,2);
 assert.ok(findings.some(f=>f.swotQuadrant==='strength'));
 assert.ok(findings.some(f=>f.statement===proofs[1].quote));
});

test('failed synthesis carries accepted evidence and decision checks into a free partial handoff',async()=>{
 const researchNeeds=[
  {...needs[0],metric:'Marque toptan sipariş akışı',decisionId:'distribution'},
  {...needs[0],id:'external',metric:'Fransa distribütörlerinin sipariş kanalı',decisionId:'distribution'},
  {...needs[1],id:'missing',metric:'Bayi siparişinden teslimata geçen süre',decisionId:'distribution'}
 ];
 const plan={needs:researchNeeds,scopedResearch:true,adaptiveResearch:true,orderedResearch:true,qualityReport:true,
  verifiedResults:true,readEvidenceOnly:true,taskReporting:true,qualifyReportFindings:true,targetedEvidence:true,
  sectionedSynthesis:true,reportRecovery:true,reportOnlyAfterResearch:true,
  briefScope:{objective:brief.goals,decisions:[{id:'distribution',decision:'Fransa’da distribütör kanalını seçme'}]}};
 const facts=[
  {id:'catalogue',url:about,title:'Marka toptan satış sayfası',method:'html',quote},
  {id:'trade',url:'https://market.example/catalogue',title:'Toptan sipariş şartları',method:'pdf',
   quote:'French distributors take wholesale orders through the supplier account portal.'},
  {id:'snippet',url:'https://snippet.example/',title:'Arama sonucu',method:'search-snippet',quote:'A search snippet claims deliveries take three days.'}
 ];
 const receipts=facts.map((fact,index)=>({id:researchNeeds[index].id,urls:[fact.url],facts:[fact]}));
 const args={brief,brand:{packet,facts:[],brandUnderstanding:identity,briefUnderstanding},plan,
  rounds:[{closed:true,stopReason:'research_budget_exhausted',receipts,decisions:receipts.map(row=>({id:row.id,sufficient:false,proofs:row.facts.map(f=>f.id)}))}]};
 const providerStages=[];
 const failure=await writeScopedSynthesis({...args,providers:{manager:async stage=>{
  providerStages.push(stage);
  throw Object.assign(Error('simulated interruption'),{code:'model_deadline'});
 }}});
 assert.deepEqual(providerStages,['bhs-scoped-report-brief','bhs-scoped-report-swot']);
 assert.equal(failure.supervision.reportIssue,'model_deadline');
 const restored=await recoverManagedSectionSynthesis(brief,async stage=>
  ({sector_sources:{managedPlan:{...plan,compactQueue:true}},brand:args.brand,'scoped-tail':args.rounds})[stage],
  {readCheckpoint:async()=>undefined,manager:()=>assert.fail('no additional calls')});
 assert.deepEqual(restored.report,failure.report);
 const partial=continuationAudit(brief,{synthesis:restored,reason:restored.supervision.reportIssue});
 assert.equal(partial.status,'ready');
 assert.equal(partial.data.researchContinuity.status,'partial');
 assert.equal(partial.data.researchContinuity.additionalPaidCalls,0);
 assert.equal(partial.data.quality.contentComplete,false);
 assert.deepEqual(partial.data.findings,[]);
 assert.ok(partial.data.bhsSections.find(section=>section.id==='swot').missingQuadrants.includes('threat'));
 const recovery=partial.data.verifiedResearch.reportRecovery;
 assert.deepEqual(recovery.evidence.map(row=>row.needId),['t0','external']);
 assert.ok(recovery.hypotheses.some(row=>row.question.includes('Fransa’da distribütör kanalını seçme')));
 assert.deepEqual(recovery.hypotheses.filter(row=>row.quadrant).map(row=>row.quadrant),['strength','weakness','opportunity','threat']);
 const byId=new Map(partial.data.sources.map(source=>[source.id,source]));
 assert.ok(recovery.hypotheses.find(row=>row.quadrant==='opportunity').sourceIds.every(id=>byId.get(id).url===facts[1].url));
 assert.ok(partial.data.meetingQuestions.some(row=>row.question.includes(researchNeeds[2].metric)));
 assert.match(partial.data.rawReport,/Kısmi raporda korunan kanıtlar/);
 const selected=selectProposalAudit(partial.data,brief);
 assert.equal(selected.findings.length,0);
 assert.ok(selected.sources.some(source=>source.url===facts[0].url));
 assert.ok(!selected.sources.some(source=>source.url===facts[2].url));
 const unsafe=structuredClone(restored.report);
 unsafe.verifiedResearch.reportRecovery.evidence.push({needId:'missing',sourceIds:recovery.evidence[0].sourceIds});
 const grounded=groundOfferReport(unsafe,{brief,packet:restored.analysisPacket});
 assert.ok(!grounded.verifiedResearch.reportRecovery.evidence.some(row=>row.needId==='missing'));
});

test('the compact plan keeps each measurement’s own action, sample size, timeframe and proof identity',async()=>{
 const planStages=[];
 const providers={managedBudgetVersion:19,manager:async(stage,input,schema,options)=>{
  planStages.push(stage);
  assert.match(input.instruction,/eczane kanalının payı ayrı ölçümlerdir/);
  const response={needs:[{...instagramScope,measurements:stage.endsWith('compact')?[engagement,frequency,followers]:[]}]};
  assertSchema(response,schema);
  const data=options.normalizeData(response);
  assertSchema(data,options.responseSchema);
  return {data};
 }};
 const result=await planScopedResearch({brief,identity,briefUnderstanding,asOf:packet.asOf,providers,packet});
 assert.deepEqual(planStages,['bhs-scoped-plan','bhs-scoped-plan-compact']);
 assert.deepEqual(result.needs,[engagement,frequency,followers].map(metric=>({...instagramScope,...metric})));
 const searches=[];
 const example={url:instagram,title:'Marque',content:postQuote};
 const receipts=await runScopedDefaults(result.needs,{...providers,
  search:async (query,options)=>{searches.push(['tavily',query,options.maxResults,options.since]);return {results:[example]};},
  searchGemini:async (need,options)=>{searches.push(['gemini',need.query,options.maxResults,options.since]);return {results:[]};}
 },()=>assert.fail('no Gemini URLs were returned'));
 assert.deepEqual(searches,[engagement,frequency,followers].map(metric=>[metric.first,metric.query,metric.quantity,metric.since]));
 assert.equal(receipts[0].facts[0].url,receipts[2].facts[0].url);
 assert.notEqual(receipts[0].facts[0].id,receipts[2].facts[0].id);
});

test('an engagement proof cannot clear the frequency task and follow-up needs get separate commands',async()=>{
 const plan={needs:[engagement,frequency].map(metric=>({...instagramScope,...metric})),
  orderedResearch:true,reportOnlyAfterResearch:true,targetedEvidence:true};
 const saved={id:'eng-proof',url:instagram,title:'Marque',quote:postQuote,item:'Instagram post',method:'html'};
 // Both openings have run; only engagement has a usable proof. The controller
 // must not use that proof to close the separately searched frequency need.
 const rounds=[{openingSearch:true,receipts:[{id:engagement.id,query:engagement.query,urls:[instagram],facts:[saved],attempts:[{tool:'tavily'}],defaultAttempt:true},
  {id:frequency.id,query:frequency.query,urls:[],facts:[],attempts:[{tool:'gemini'}],defaultAttempt:true}]}];
 const priceScope={section:'FİYAT',target:'Marque aynı ürün varyantı',market:'Fransa',country:'FR',language:'fr'};
 const price={...followers,id:'price',metric:'Kendi sitesinde ve pazaryerinde aynı varyantın birim fiyat farkı',
  expected:'Aynı ürün kodu, aynı satış birimi ve para biriminde iki fiyat',query:'Marque produit référence prix boutique marketplace',quantity:2};
 const queries=[];
 const providers={managedBudgetVersion:19,researchCapacity:async()=>openingCapacity(1800),
  manager:async(stage,input,schema,options)=>{
   assert.equal(stage,'bhs-scoped-review');
   assert.match(input.instruction,/Bir ölçümün kanıtıyla diğerini kapatma/);
   assert.deepEqual(input.waitingNeeds,[]);
   const response=draft({approve:true,newNeeds:[{...priceScope,measurements:[price]}],
    decisions:[engagement,frequency].map(metric=>({id:metric.id,sufficient:true,proofs:[saved.id]})),
    commands:[{id:price.id,tool:'tavily',query:price.query,url:'',mode:'default',limit:price.quantity}]});
   assertSchema(response,schema);
   const data=options.normalizeData(response);
   assertSchema(data,options.responseSchema);
   return {data};
  },
  search:async(query,options)=>{queries.push([query,options.maxResults]);return {results:[]};}
 };
 const round=await reviewScopedResearch({identity,briefUnderstanding,plan,rounds,providers,brief,packet,readPages:()=>assert.fail()});
 assert.equal(round.approved,false);
 assert.deepEqual(round.newNeeds,[{...priceScope,...price}]);
 assert.deepEqual(queries,[[price.query,price.quantity]]);
 assert.equal(round.commandResults[0].status,'executed');
 const result=scopedEvidence({packet},plan,[...rounds,round]);
 assert.deepEqual(result.coverage.map(({id,status})=>[id,status]),[[engagement.id,'confirmed'],[frequency.id,'open'],[price.id,'open']]);
 assert.deepEqual(result.coverage.find(row=>row.id===frequency.id).proofs,[]);
});

test('a cited search snippet is opened before another paid search and only the publisher proof can clear the task',async()=>{
 const need={...instagramScope,...engagement};
 const plan={needs:[need],orderedResearch:true,reportOnlyAfterResearch:true,targetedEvidence:true,readEvidenceOnly:true};
 const url=post;
 const captured='2026-11-10T09:30:00Z';
 const [receipt]=await runScopedDefaults([need],{managedBudgetVersion:20,
  search:async()=>({results:[{url,title:'Official post',content:postQuote}]})},()=>assert.fail());
 const snippet=receipt.facts[0];
 const rounds=[{receipts:[{...receipt,defaultAttempt:true}],reviewedProofIds:[snippet.id]}];
 let reads=0;
 const providers={managedBudgetVersion:20,researchCapacity:async()=>openingCapacity(1800),
  manager:async(stage,input)=>{
   assert.equal(stage,'bhs-scoped-review');
   assert.match(input.instruction,/veri dönemi ile yayın ve erişim tarihini ayır/);
   const proof=input.findings.find(f=>f.method==='html');
   return {data:draft({approve:true,decisions:[{id:need.id,sufficient:true,proofs:[(proof||snippet).id]}],
    commands:proof?[]:[{id:need.id,tool:'tavily',query:'Unnecessary repeat query',url:'',mode:'default',limit:1}]})};
  },
  search:()=>assert.fail('read the already discovered page before another paid search')
 };
 const review=()=>reviewScopedResearch({identity,briefUnderstanding,plan,rounds,providers,brief,packet,readPages:async urls=>{
  assert.deepEqual(urls,[url]);
  reads++;
  return {sources:[{url,title:snippet.title,method:'html',retrievedAt:captured,excerpts:[{text:postQuote}]}]};
 }});
 rounds.push(await review());
 assert.equal(rounds.at(-1).approved,false);
 assert.deepEqual(rounds.at(-1).decisions[0].proofs,[]);
 assert.deepEqual(rounds.at(-1).commandResults.map(({tool,status})=>[tool,status]),[['read','executed'],['tavily','not_dispatched']]);
 const publisher=rounds.at(-1).receipts[0].facts[0];
 assert.notEqual(publisher.id,snippet.id);
 assert.equal(publisher.retrievedAt,captured);
 rounds.push(await review());
 assert.equal(reads,1);
 assert.equal(rounds.at(-1).stopReason,'evidence_confirmed');
 assert.deepEqual(scopedEvidence({packet},plan,rounds).coverage[0].proofs.map(f=>f.id),[publisher.id]);
});

test('search-only and metadata-only sources remain outside claims, partial recovery and verified competitors',async()=>{
 const price={...needs[0],id:'price',section:'FİYAT',metric:'Türkiye liste fiyatı',first:'tavily'};
 const peerNeed={...needs[0],id:'peers',section:'RAKIP',first:'tavily'};
 const social={...instagramScope,...engagement};
 const plan={scopedResearch:true,verifiedResults:true,qualityReport:true,adaptiveResearch:true,targetedEvidence:true,
  orderedResearch:true,reportOnlyAfterResearch:true,readEvidenceOnly:true,needs:[price,peerNeed,social]};
 const brand={packet,facts:[],brandUnderstanding:identity,briefUnderstanding};
 const makeFact=(id,url,quote,method='html')=>({id,url,quote,method,title:id,item:id});
 const priceSnippet=makeFact('price-snippet','https://retailer.fr/product/159','Türkiye 2026 ürün liste fiyatı 159 TL olarak belirtiliyor.','search-snippet');
 const socialMetadata={...makeFact('meta',instagram,'Marque Instagram hesabında ayda 22 paylaşım.'),metadataOnly:true};
 const direct=makeFact('direct','https://comparable.fr/catalogue','Comparable sells packaged groceries in France for supermarket distribution.');
 const candidate=makeFact('candidate','https://suggested.fr/groceries','Suggested sells packaged groceries in France for supermarket distribution.','search-snippet');
 const readSocial=makeFact('read-post',post,postQuote,'extracted');
 const readAlso=makeFact('also-read','https://other.fr/story','Marque goods are available through the brand website.');
 const peer=(fact,name)=>({name,url:fact.url,product:'Packaged groceries',market:'France',channel:'Supermarkets',priceBand:'',relationship:'direct'});
 const receipt=(need,facts)=>({id:need.id,urls:facts.map(f=>f.url),facts,attempts:[{tool:'tavily'}]});
 const terminal={closed:true,stopReason:'research_budget_exhausted',peers:[peer(direct,'Comparable'),peer(candidate,'Suggested')],
  receipts:[receipt(price,[priceSnippet,readAlso]),receipt(peerNeed,[direct,candidate]),receipt(social,[socialMetadata,readSocial])],
  decisions:[{id:price.id,sufficient:true,proofs:[priceSnippet.id]},{id:peerNeed.id,sufficient:false,proofs:[direct.id,candidate.id]},
   {id:social.id,sufficient:true,proofs:[socialMetadata.id,readSocial.id]}]};
 const summaryArgs={brief,brand,plan,rounds:[terminal]};
 const saved=await writeScopedSynthesis({...summaryArgs,providers:{},allowWrite:false});
 const drafted=await writeScopedSynthesis({...summaryArgs,providers:{manager:async(_stage,input)=>{
  const proof=fragment=>Object.entries(input.sources).find(([,row])=>row[1].includes(fragment))?.[0];
  assert.equal(proof('159 TL'),undefined);
  assert.equal(proof('ayda 22'),undefined);
  assert.equal(proof('Suggested sells'),undefined);
  assert.ok(Object.values(input.documents).every(row=>['html','extracted'].includes(row[2])));
  assert.deepEqual(input.coverage.find(m=>m.id===price.id).sources,[]);
  const base={area:'',quadrant:'none',peerId:'',kind:'observation',analysis:'Kanalı değerlendirmeye yardımcı olur.',
   action:'Satış kanallarını incele.',measurement:'',limitation:'',question:''};
  return {data:{findings:[
   {...base,rank:1,section:'Dijital',needIds:[social.id],observation:'Gönderi 84 beğeni aldı.',proof:[proof(postQuote)]},
   {...base,rank:2,section:'Fiyat',needIds:[price.id],observation:'Marque ürünleri marka sitesinde yer alıyor.',proof:[proof(readAlso.quote)]},
   {...base,rank:3,section:'Pazar',needIds:[],peerId:'Suggested',observation:'Suggested doğrudan rakip.',proof:[proof(direct.quote)]}
  ],peers:[],benchmarks:[],questions:[]}};
 }}});
 for(const synthesis of [saved,drafted]){
  const result=directAuditResult(brief,synthesis).data;
  assert.equal(synthesis.supervision.metricCoverage.find(m=>m.id===price.id).status,'open');
  assert.equal(synthesis.supervision.metricCoverage.find(m=>m.id===social.id).status,'confirmed');
  assert.deepEqual(result.competitors.map(c=>c.name),['Comparable']);
  assert.deepEqual(result.verifiedResearch.competitorCandidates,[{name:'Suggested',url:candidate.url}]);
  assert.deepEqual(selectProposalAudit(result,brief).competitors.map(c=>c.name),['Comparable']);
  assert.match(result.rawReport,/Doğrulanacak rakip adayları\s+Suggested/);
  assert.ok(result.findings.some(f=>f.statement.includes('84')));
  assert.ok(!result.findings.some(f=>/159 TL|ayda 22|Suggested doğrudan|marka sitesinde yer alıyor/.test(f.statement)));
  assert.ok(result.sources.every(source=>source.verification.method!=='search-snippet'&&source.url!==instagram));
 }
});

test('an unreadable publisher page stays open and the next source is tried without retrying that URL',async()=>{
 const need={...instagramScope,...followers};
 const plan={needs:[need],orderedResearch:true,reportOnlyAfterResearch:true,targetedEvidence:true,readEvidenceOnly:true};
 const snippet={id:'cached-snippet',url:instagram,title:'Instagram',quote:'Marque hesabının 1532 takipçisi olduğu listeleniyor.',
  method:'search-snippet',item:'Official account'};
 const rounds=[{receipts:[{id:need.id,query:need.query,urls:[instagram],attempts:[{tool:'tavily'}],defaultAttempt:true,facts:[snippet]}]}];
 const nextQuery='Marque Instagram compte officiel statistiques source';
 const searchCalls=[];
 let readCalls=0;
 const args={identity,briefUnderstanding,plan,rounds,brief,packet,readPages:async()=>{
  readCalls++;
  return {sources:[],unavailable:[{url:instagram,reason:'HTTP_403'}]};
 },providers:{
  managedBudgetVersion:20,researchCapacity:async()=>openingCapacity(1800),
  manager:async()=>({data:draft({approve:true,decisions:[{id:need.id,sufficient:true,proofs:[snippet.id]}],
   commands:[{id:need.id,tool:'tavily',query:nextQuery,url:'',mode:'default',limit:2}]})}),
  search:async(query,options)=>{searchCalls.push([query,options.maxResults]);return {results:[]};}
 }};
 rounds.push(await reviewScopedResearch(args));
 rounds.push(await reviewScopedResearch(args));
 assert.equal(readCalls,1);
 assert.deepEqual(searchCalls,[[nextQuery,2]]);
 assert.equal(rounds.at(-1).approved,false);
 assert.equal(scopedEvidence({packet},plan,rounds).coverage[0].status,'open');
});

test('a source plan validation failure stays isolated and a different affordable need still runs',async()=>{
 const target={...needs[0],first:'tavily'};
 const independent={...needs[1],section:target.section};
 const plan={needs:[target],orderedResearch:true,reportOnlyAfterResearch:true,targetedEvidence:true};
 const original={id:'saved',item:'Katalog',title:'Marque',url:about,quote,method:'search-snippet'};
 const rounds=[{receipts:[{id:target.id,query:target.query,urls:[about],attempts:[{tool:'tavily'}],facts:[original],defaultAttempt:true}],
  decisions:[{id:target.id,proofs:[original.id],sufficient:false}],reviewedProofIds:[original.id]}];
 const dispatched=[];
 let reads=0;
 const review=()=>reviewScopedResearch({identity,briefUnderstanding,plan,rounds,brief,packet,
  readPages:async()=>{reads++;parseSourcePlan({entities:[],sources:[]},{allowPartial:true});},
  providers:{managedBudgetVersion:18,modelHandoff:true,researchCapacity:async()=>openingCapacity(1600),
   manager:async(stage,input)=>{
    assert.equal(stage,'bhs-scoped-review');
    assert.ok(input.findings.some(fact=>fact.id===original.id));
    if(reads)assert.equal(input.publisherReadAvailable,false);
    // Claude adds the independent question while requesting this read. It is
    // still available if the source reader fails on the earlier question.
    return {data:draft({newNeeds:reads?[]:[independent],commands:[{id:target.id,tool:'read',url:about,query:'',mode:'default',limit:1}]})};
   },
   worker:async()=>({data:{decisions:[]}}),
   searchGemini:()=>assert.fail('grounded results require the unavailable reader'),
   search:async query=>{dispatched.push(query);return {results:[{url:instagram,title:'Marque',content:postQuote}]};}
  }});
 rounds.push(await review());
 assert.equal(rounds.at(-1).commandResults[0].status,'source_plan_invalid');
 assert.equal(rounds.at(-1).sourceReaderIssue,'source_plan_invalid');
 assert.equal(rounds.at(-1).closed,false);
 rounds.push(await review());
 assert.equal(rounds.at(-1).receipts[0].id,independent.id);
 assert.ok(rounds.at(-1).receipts[0].facts.length);
 rounds.push(await review());
 assert.equal(rounds.at(-1).stopReason,'research_source_plan_invalid');
 assert.equal(rounds.at(-1).closed,true);
 assert.deepEqual(dispatched,[independent.query]);
 assert.equal(reads,1);
 const synthesis=await writeScopedSynthesis({brief,brand:{packet,facts:[],brandUnderstanding:identity,briefUnderstanding},plan,rounds,providers:{},allowWrite:false});
 assert.equal(synthesis.supervision.researchStopReason,'research_source_plan_invalid');
 assert.equal(synthesis.supervision.sourceReaderIssue,'source_plan_invalid');
 assert.ok(synthesis.report.findings.length);
});

test('sales gaps use human names and distinguish blocked searches, weak sources and saved facts without report analysis',async()=>{
 const brand={packet,facts:[],brandUnderstanding:identity,briefUnderstanding};
 const targets=[{...needs[1],id:'ig',section:'DİJİTAL',metric:'instagram_marka'},
  {...needs[1],id:'yt',section:'DİJİTAL',metric:'youtube_marka',period:''},
  {...needs[1],id:'p',section:'FİYAT',metric:'E-ticaret sitesindeki liste fiyatları'},
  {...needs[1],id:'c',section:'KANAL',metric:'pazaryeri'},
  {...needs[1],id:'r',section:'PAZAR',metric:'influencer_pazar'}];
 const plan={needs:targets,qualityReport:true,targetedEvidence:true,orderedResearch:true,adaptiveResearch:true,verifiedResults:true};
 const fact={id:'recorded_price',url:about,quote,title:'Marque',method:'html',item:'Katalog'};
 const round={closed:true,stopReason:'research_budget_exhausted',receipts:[
  {id:'ig',facts:[],urls:[],attempts:[{tool:'tavily',issue:'budget_limit'}]},
  {id:'yt',facts:[],urls:[],attempts:[{tool:'tavily'}]},
  {id:'p',facts:[fact],urls:[fact.url]},
  {id:'c',facts:[],urls:[],missingDefaults:['tavily'],issues:['scraper_requires_default_tools']},
  {id:'r',facts:[],urls:[],actorStarted:true,issues:['actor_time_limit']}],
  commandResults:[{id:'c',status:'not_dispatched'},{id:'r',status:'executed'}],
  decisions:[{id:'p',sufficient:true,proofs:[fact.id]}]};
 const synthesis=await writeScopedSynthesis({brief,brand,plan,rounds:[round],providers:{manager:()=>assert.fail('formatting saved research is free')},allowWrite:false});
 const audit=continuationAudit(brief,{synthesis,reason:'budget_limit'}).data;
 const digital=audit.bhsSections.find(s=>s.id==='DİJİTAL');
 assert.equal(digital.title,'Dijital varlıklar');
 assert.deepEqual(digital.openMetrics,[
  {name:'Instagram’da son 30 günün etkileşimi',status:'not_searched'},
  {name:'Markanın YouTube hesabı',status:'insufficient_sources'}]);
 assert.deepEqual(audit.bhsSections.find(s=>s.id==='FİYAT').openMetrics,[{name:'E-ticaret sitesindeki liste fiyatları',status:'missing_from_report'}]);
 assert.equal(audit.bhsSections.find(s=>s.id==='KANAL').openMetrics[0].status,'not_searched');
 assert.equal(audit.bhsSections.find(s=>s.id==='PAZAR').openMetrics[0].status,'insufficient_sources');
 assert.ok(audit.findings.some(f=>f.researchEvidenceOnly));
 assert.doesNotMatch(audit.researchContinuity.notice,/Ek kanıt gereken|instagram_marka|youtube_marka/);
 assert.ok(!audit.meetingQuestions.some(q=>q.question.includes('instagram_marka')));
 const covered=scopedCoverage({competitors:[],findings:[{id:'finished',bhsSection:'FİYAT',researchNeedIds:['p'],sourceIds:['ev2']}]},
  synthesis.supervision.metricCoverage,true,true);
 assert.equal(covered.find(s=>s.id==='FİYAT').openMetrics,undefined);
 const historical=scopedCoverage({findings:[]},[{id:'old',section:'pazar',name:'reklam_maliyet',status:'open'}],true,true)[0];
 assert.deepEqual(historical.openMetrics,[{name:'Reklam maliyetleri',status:'unknown'}]);
 // Reports without need receipts retain the original legacy label adapter.
 const stale={data:{...audit,verifiedResearch:undefined,researchContinuity:{...audit.researchContinuity,notice:'Eski araştırma. Ek kanıt gereken bölümler: PAZAR.'},
  bhsSections:[{id:'PAZAR',title:'PAZAR',complete:false,openMetrics:[{name:'reklam_maliyet',status:'needs_evidence'}]}]}};
 const restored=(await restoreContinuation(brief,stale,{get:()=>assert.fail('saved statuses are formatted without launching research')})).data;
 assert.equal(restored.bhsSections[0].title,'Pazar analizi');
 assert.deepEqual(restored.bhsSections[0].openMetrics,historical.openMetrics);
 assert.equal(restored.researchContinuity.notice,'Eski araştırma.');
});

test('the active worker covers Claude’s planned openings before Claude adds a deeper question',async()=>{
 const topics=['rakipler','pazar','pazaryeri','fiyat','müşteri deneyimi','Instagram','YouTube','bilinirlik','influencer','reklam maliyeti'];
 const opening=topics.map((section,i)=>({...needs[0],id:'N'+(i+1),section,query:'Açılış: '+section,first:'tavily'}));
 const deeper={...opening[0],id:'D1',query:'Rakip ürün sayfasında ayrıntılı fiyat karşılaştırması'};
 const planNeeds=opening;
 const saved=new Map([['brand',{decision:'accepted',collectionFirst:true,packet,facts:[],brandUnderstanding:identity,briefUnderstanding}]]);
 let charged=1300,reviewed=0;
 const dispatched=[],waves=[],checkpoints=[];
 const providers={collectionFirst:true,managedAudit:true,managedBudgetVersion:16,infrastructureOffsetKurus:300,
  researchCapacity:async()=>openingCapacity(3000-charged),
  worker:async(stage,{tasks},_schema,options)=>{
   assert.equal(stage,'bhs-scoped-evidence-check');
   assert.ok(charged+options.reserveForFollowingKurus+5<=3000,`${charged} spent, ${options.reserveForFollowingKurus} reserved`);
   charged+=5;
   checkpoints.push({prior:dispatched.length,ids:tasks.map(task=>task.id)});
   return {data:{decisions:tasks.map(({id})=>({id,sufficient:false,proofs:[],read:'',nextQuery:''}))}};
  },
  manager:async(stage,input)=>{
   if(stage==='bhs-scoped-plan')return {data:{needs:planNeeds}};
   assert.equal(stage,'bhs-scoped-review');
   assert.deepEqual(dispatched,opening.map(n=>n.query));
   assert.deepEqual(input.waitingNeeds,[]);
   assert.ok(input.findings.some(f=>f.needId==='N10'));
   reviewed++;
   return {data:draft({newNeeds:[deeper],commands:[{id:deeper.id,tool:'tavily',query:deeper.query,url:'',mode:'default',limit:3}]})};
  },
  search:async(query,options)=>{
   assert.ok(charged+62<=3000);
   charged+=51;
   assert.equal(options.countryCode,'FR');
   dispatched.push(query);
   return {results:[{url:post,content:postQuote}]};
  }};
 for(const phase of sequentialPhases.slice(sequentialPhases.indexOf('sector_sources'))){
  charged+=300;
  const result=await runSequentialStage({phase,brief,providers,previous:async p=>saved.get(p),collect:()=>assert.fail('unrequested page read')});
  charged-=275;
  saved.set(phase,result);
  if(result.openingSearch)waves.push(result.receipts.map(r=>r.id));
  if(reviewed)break;
 }
 assert.deepEqual(waves,[['N1','N2','N3'],['N4','N5','N6'],['N7','N8','N9'],['N10']]);
 assert.deepEqual(checkpoints,waves.map((ids,i)=>({prior:Math.min((i+1)*3,10),ids})));
 assert.equal(reviewed,1);
 assert.equal(dispatched.at(-1),deeper.query);
 assert.ok(charged<3000);
});

test('an expensive opening preference is deferred when it would crowd out the other opening searches',async()=>{
 const first={...needs[0],first:'gemini'};
 const second={...needs[1],first:'tavily'};
 const plan={orderedResearch:true,reportOnlyAfterResearch:true,targetedEvidence:true,needs:[first,second]};
 const searches=[];
 const providers={managedBudgetVersion:15,infrastructureOffsetKurus:300,
  researchCapacity:async()=>openingCapacity(1100),
  manager:()=>assert.fail('the opening search still fits'),
  searchGemini:()=>assert.fail('retain funding for the two opening topics'),
  search:async(query,{maxResults,since})=>{searches.push({query,maxResults,since});return {results:[]};}
 };
 const args={identity,briefUnderstanding,plan,providers,brief,packet,readPages:()=>assert.fail()};
 const round=await reviewScopedResearch({...args,rounds:[]});
 assert.equal(round.receipts[0].attempts[0].tool,'tavily');
 assert.deepEqual(round.receipts[0].toolRouting,{requestedTool:'gemini',selectedTool:'tavily',reason:'opening_budget_reserved'});
 assert.deepEqual(searches.map(s=>s.query),[first.query,second.query]);
 const seenFirst={...round,receipts:[{...round.receipts[0],attempts:[{tool:'tavily',issue:'provider_timeout'}]}]};
 const next=await reviewScopedResearch({...args,rounds:[seenFirst]});
 assert.deepEqual(next.receipts.map(r=>r.id),[second.id]);
 assert.deepEqual(searches.at(-1),{query:second.query,maxResults:second.quantity,since:second.since});
});

test('a funded Gemini preference retains a budget for the following opening topic',async()=>{
 const first={...needs[0],first:'gemini'};
 const plan={orderedResearch:true,reportOnlyAfterResearch:true,targetedEvidence:true,needs:[first,needs[1]]};
 const providers={managedBudgetVersion:15,infrastructureOffsetKurus:300,
  researchCapacity:async()=>openingCapacity(1500),
  withCeiling:ceiling=>{
   assert.equal(ceiling,3000-300-62);
   return {...providers,searchGemini:async need=>{assert.deepEqual(need,first);return {results:[]};}};
  },
  manager:()=>assert.fail('the opening search still fits'),
  search:()=>assert.fail('use the funded first tool')
 };
 const result=await reviewScopedResearch({identity,briefUnderstanding,plan,rounds:[],providers,brief,packet,readPages:()=>assert.fail()});
 assert.deepEqual(result.receipts.map(r=>[r.id,r.attempts[0].tool]),[[first.id,'gemini']]);
 assert.equal(result.receipts[0].toolRouting,undefined);
});

test('an unaffordable planned tool is recorded and a follow-up uses the same need when the tool fits',async()=>{
 const need={...needs[1],first:'gemini'};
 const other={...needs[0],section:need.section,first:'tavily'};
 const plan={orderedResearch:true,reportOnlyAfterResearch:true,targetedEvidence:true,needs:[need,other]};
 const searched=[];
 let remaining=600;
 const providers={managedBudgetVersion:18,researchCapacity:async()=>openingCapacity(remaining),
  search:async query=>{searched.push(['tavily',query]);return {results:[{url:instagram,content:quote}]};},
  searchGemini:async requested=>{searched.push(['gemini',requested.query]);assert.deepEqual(requested,need);return {results:[]};},
  worker:async()=>({data:{decisions:[]}}),manager:async(stage,input)=>{
   assert.equal(stage,'bhs-scoped-review');
   assert.deepEqual(input.previous[0].toolRouting,{requestedTool:'gemini',selectedTool:'tavily',reason:'budget_limit'});
   return {data:draft({decisions:[{id:need.id,sufficient:false,proofs:[]}],
    commands:[{id:need.id,tool:'gemini',query:need.query,url:'',mode:'default',limit:need.quantity}]})};
  }};
 const args={identity,briefUnderstanding,plan,providers,brief,packet,readPages:()=>assert.fail()};
 const first=await reviewScopedResearch({...args,rounds:[]});
 assert.deepEqual(first.receipts[0].toolRouting,{requestedTool:'gemini',selectedTool:'tavily',reason:'budget_limit'});
 remaining=1500;
 const followUp=await reviewScopedResearch({...args,rounds:[first]});
 assert.deepEqual(searched,[['tavily',need.query],['tavily',other.query],['gemini',need.query]]);
 assert.equal(followUp.receipts[0].id,need.id);
 assert.equal(followUp.receipts[0].toolRouting,undefined);
 assert.equal(followUp.commandResults[0].status,'executed');
});

test('an unaffordable explicit search keeps the selected need, query and sample size on the alternate tool',async()=>{
 const plan={orderedResearch:true,reportOnlyAfterResearch:true,targetedEvidence:true,needs};
 const command={id:needs[1].id,tool:'gemini',query:'Marque Instagram France avis',url:'',mode:'default',limit:3};
 const providers={managedBudgetVersion:14,researchCapacity:async()=>openingCapacity(200),
  manager:async()=>({data:draft({commands:[command]})}),searchGemini:()=>assert.fail(),
  search:async(query,{maxResults,since})=>{
   assert.equal(query,command.query);
   assert.equal(maxResults,command.limit);
   assert.equal(since,needs[1].since);
   return {results:[]};
  }};
 const result=await reviewScopedResearch({identity,briefUnderstanding,plan,rounds:[],providers,brief,packet,readPages:()=>assert.fail()});
 assert.equal(result.commandResults[0].status,'budget_limit');
 assert.equal(result.receipts[0].id,command.id);
 assert.deepEqual(result.receipts[0].toolRouting,{requestedTool:'gemini',selectedTool:'tavily',reason:'budget_limit'});
});

test('a specialized command first searches the missing default for its own need, then keeps the actual actor receipt',async()=>{
 const need=needs[1];
 const plan={orderedResearch:true,reportOnlyAfterResearch:true,targetedEvidence:true,needs:[need]};
 const command={id:need.id,tool:'apify/instagram-scraper',query:'',url:instagram,mode:'posts',limit:3};
 const seed={receipts:[{id:need.id,query:need.query,attempts:[{tool:'tavily'}],urls:[instagram],facts:[],defaultAttempt:true}]};
 const called=[];
 const providers={managedBudgetVersion:18,researchCapacity:async()=>({...openingCapacity(1600),actors:[command.tool]}),
  manager:async()=>({data:draft({commands:[command]})}),search:()=>assert.fail('the first Tavily result is already saved'),
  searchGemini:async requested=>{called.push('gemini');assert.deepEqual(requested,{...need,first:'gemini'});return {results:[]};},
  enrich:async request=>{
   called.push(request.actor);
   assert.equal(request.maxResults,command.limit);
   assert.equal(request.since,need.since);
   assert.equal(request.url,instagram);
   return {status:'complete',runId:'synthetic',pages:[{url:post,text:postQuote}]};
  },worker:async()=>({data:{results:[]}})};
 const args={identity,briefUnderstanding,plan,providers,brief,packet,readPages:()=>assert.fail()};
 const prerequisite=await reviewScopedResearch({...args,rounds:[seed]});
 assert.equal(prerequisite.commandResults[0].status,'default_searched_first');
 assert.deepEqual(prerequisite.receipts[0].toolRouting,{requestedTool:command.tool,selectedTool:'gemini',reason:'required_default_first'});
 const result=await reviewScopedResearch({...args,rounds:[seed,prerequisite]});
 assert.deepEqual(called,['gemini',command.tool]);
 assert.equal(result.commandResults[0].status,'executed');
 assert.equal(result.receipts[0].attempts[0].tool,command.tool);
 assert.equal(result.receipts[0].facts[0].url,post);
});

test('publisher identity and social links are usable after a catalogue with many product links',async()=>{
 const corporate='https://marque.com/contact',html='<a href="/product">Ürün</a>'.repeat(100)+
  '<a href="/iletisim">İletişim</a><a href="'+corporate+'">Corporate</a><a href="'+instagram+'"></a>';
 const identityLinks=sourceLinks(html,brief.website,{identity:true});
 assert.deepEqual(identityLinks.map(link=>link.url),[new URL('/iletisim',brief.website).href,corporate,instagram]);
 const original={...packet,sources:[{...packet.sources[0],technicalSignals:{identityLinks}}]};
 const model={managedBudgetVersion:14,manager:async(stage,input)=>{
  if(stage==='bhs-scoped-plan'){
   assert.ok(input.publisherLinks.some(link=>link.url===instagram));
   return {data:{needs:[needs[1]]}};
  }
  assert.equal(input.card,undefined);
  assert.ok(input.sources[0].links.some(link=>link.url===corporate));
  assert.equal(input.readReceipts[0].status,'read');
  return {data:{...identity,pages:[],searches:[]}};
 }};
 const prior={value:{...identity,pages:[corporate],searches:[]}};
 const brand=await understandScopedBrand({brief,packet:original,providers:model,prior,readPages:async urls=>{
  assert.deepEqual(urls,[corporate]);
  return {sources:[{...packet.sources[0],url:corporate,finalUrl:corporate}]};
 }});
 assert.ok(brand.packet.sources.some(s=>s.url===corporate));
 assert.equal((await planScopedResearch({brief,identity,briefUnderstanding,asOf:packet.asOf,providers:model,packet:brand.packet})).needs[0].id,'t1');
});

test('an unavailable controller can use the saved narrow query with the affordable alternate',async()=>{
 const need={...needs[1],first:'gemini'};
 const plan={targetedEvidence:true,qualityReport:true,reportOnlyAfterResearch:true,orderedResearch:true,needs:[need]};
 let used=0;
 const providers={managedBudgetVersion:14,manager:async()=>{throw new BudgetError('budget_limit','synthetic admission');},
  researchCapacity:async()=>({remainingKurus:3000-2615-workerInfraReservationKurus,minimumDefaultKurus:62,
   defaults:['tavily'],configuredDefaults:['tavily','gemini'],actors:[]}),
  search:async(query,opts)=>{
   used++;assert.equal(query,need.query);assert.equal(opts.since,need.since);assert.equal(opts.maxResults,need.quantity);
   return {results:[{url:post,content:postQuote}]};
  }};
 const recovered=await reviewScopedResearch({identity,briefUnderstanding,plan,rounds:[],providers,brief,packet,readPages:()=>assert.fail()});
 assert.equal(used,1);assert.equal(recovered.closed,false);assert.equal(recovered.receipts[0].attempts[0].tool,'tavily');
 const final=await reviewScopedResearch({identity,briefUnderstanding,plan,rounds:[recovered],providers,brief,packet,readPages:()=>assert.fail()});
 assert.equal(used,1);assert.equal(final.closed,true);
});

test('after a controller budget rejection, a compact check reads the official source before the next paid search',async()=>{
 const market={...needs[0],id:'N2',section:'pazar',first:'tavily',metric:'2025 mobilya ihracatı',target:'Mobilya',market:'Türkiye'};
 const price={...needs[0],id:'N4',section:'fiyat',first:'tavily',metric:'YRP-210 iki kanalda fiyat kıyası',query:'YRP-210 site:magaza.example TL'};
 const plan={targetedEvidence:true,qualityReport:true,reportOnlyAfterResearch:true,orderedResearch:true,needs:[market,price]};
 const pdf='https://ticaret.gov.tr/raporlar/mobilya-2025.pdf';
 const shop='https://magaza.example/yrp-210';
 const marketplace='https://pazaryeri.example/yrp-210';
 const variant='https://pazaryeri.example/yrp-211';
 const source=(id,url,quote)=>({id,url,title:'Publisher',item:quote,method:'search-snippet',quote});
 const prior={issue:'budget_limit',receipts:[
  {id:market.id,query:market.query,urls:[pdf],facts:[source('reportLink',pdf,'Mobilya sektörü 2025 faaliyet raporu yayımlandı.')],defaultAttempt:true,attempts:[{tool:'tavily'}]},
  {id:price.id,query:price.query,urls:[shop,variant],facts:[source('shopPrice',shop,'YRP-210 Üçlü koltuk. 24.900 TL / adet.'),
   source('wrongSku',variant,'YRP-211 Köşe koltuk. 28.900 TL / adet.')],defaultAttempt:true,attempts:[{tool:'tavily'}]}
 ]};
 const events=[];
 const matchQuery='YRP-210 üçlü koltuk site:pazaryeri.example';
 const providers={managedBudgetVersion:16,researchCapacity:async()=>openingCapacity(350),
  manager:()=>assert.fail('the unavailable full controller must not be retried for each new receipt'),
  worker:async(stage,{tasks})=>{
   assert.equal(stage,'bhs-scoped-evidence-check');
   events.push('check '+tasks.map(t=>t.id).join('/'));
   return {data:{decisions:tasks.map(task=>{
    if(task.id===market.id){
     const table=task.sources.find(s=>s.method==='pdf');
     if(table){assert.match(table.quote,/milyon USD/);return {id:task.id,proofs:[table.id,'shopPrice'],sufficient:true,read:'',nextQuery:''};}
     return {id:task.id,proofs:[],sufficient:false,read:'reportLink',nextQuery:''};
    }
    const comparable=task.sources.find(s=>s.url===marketplace);
    return {id:task.id,proofs:['shopPrice',...(comparable?[comparable.id]:[])],sufficient:Boolean(comparable),
     read:comparable?'':'unknown-source',nextQuery:comparable?'':matchQuery};
   })}};
  },
  search:async(query,options)=>{
   assert.equal(query,matchQuery);assert.equal(options.maxResults,price.quantity);
   events.push('search '+query);
   return {results:[{url:marketplace,content:'YRP-210 Üçlü koltuk. 26.400 TL / adet.'}]};
  }};
 const readPages=async(urls,focus)=>{
  assert.deepEqual(urls,[pdf]);assert.ok(focus.includes('ihracatı'));events.push('read report');
  return {sources:[{url:pdf,title:'2025 Mobilya',method:'pdf',excerpts:[{text:'2025 Türkiye mobilya ihracatı tablosu. Ticaret Bakanlığı. 4.500 milyon USD.'}]}]};
 };
 const args={identity,briefUnderstanding,plan,providers,brief,packet,readPages};
 const first=await reviewScopedResearch({...args,rounds:[prior]});
 assert.deepEqual(events,['check N2/N4','read report','check N2','search '+matchQuery]);
 const verified=first.decisions.find(row=>row.id===market.id);
 assert.deepEqual(verified.proofs,[first.receipts[0].facts[0].id]);
 assert.equal(first.decisions.find(row=>row.id===price.id).sufficient,false);
 const final=await reviewScopedResearch({...args,rounds:[prior,first]});
 assert.deepEqual(events.slice(4),['check N4']);
 assert.equal(final.stopReason,'evidence_confirmed');
 const coverage=scopedEvidence({packet},plan,[prior,first,final]).coverage;
 assert.deepEqual(coverage.find(c=>c.id===price.id).proofs.map(p=>p.url),[shop,marketplace]);
});

test('a compact check that cannot fit preserves receipts and allows another affordable exact query',async()=>{
 const need={...needs[1],first:'gemini'};
 const plan={targetedEvidence:true,reportOnlyAfterResearch:true,orderedResearch:true,needs:[need]};
 const saved={issue:'budget_limit',receipts:[{id:need.id,query:need.query,urls:[post],defaultAttempt:true,attempts:[{tool:'gemini'}],
  facts:[{id:'old',url:post,title:'Post',quote:postQuote,item:'Post',method:'html'}]}]};
 let checked=0,searched=0;
 const providers={managedBudgetVersion:16,researchCapacity:async()=>openingCapacity(searched?10:62),
  manager:()=>assert.fail('full reviewer remains unaffordable'),
  worker:async()=>{checked++;throw new BudgetError('budget_limit','compact request does not fit');},
  search:async query=>{assert.equal(query,need.query);searched++;return {results:[]};}};
 const args={identity,briefUnderstanding,plan,providers,brief,packet,readPages:()=>assert.fail('no read selected')};
 const first=await reviewScopedResearch({...args,rounds:[saved]});
 assert.equal(first.closed,false);assert.equal(first.evidenceReviewIssue,'budget_limit');
 const second=await reviewScopedResearch({...args,rounds:[saved,first]});
 assert.equal(second.stopReason,'research_budget_exhausted');
 assert.equal(checked,2);assert.equal(searched,1);
 assert.equal(scopedEvidence({packet},plan,[saved,first,second]).coverage[0].status,'open');
});

test('the compact proof check uses the capped ledger and replays its saved provider response',async t=>{
 const {ledger,close}=await localBudget();t.after(close);
 await ledger.once('synthetic-research-spend',{},2380,async()=>({}));
 const need={...needs[0],first:'tavily'};
 const plan={targetedEvidence:true,reportOnlyAfterResearch:true,orderedResearch:true,needs:[need]};
 const saved={issue:'budget_limit',receipts:[{id:need.id,query:need.query,urls:[about],defaultAttempt:true,attempts:[{tool:'tavily'}],
  facts:[{id:'publisher',url:about,title:'Catalogue',quote,item:'Catalogue',method:'html'}]}]};
 let generated=0;
 const providers=createSequentialProviders({ledger,phase:'report_draft',phaseLimitKurus:3000,managedBudgetVersion:16,
  anthropicKey:'fixture',geminiKey:'fixture',now:()=>Date.parse('2026-11-16T12:00:00Z'),researchFx:async()=>({usdTry:44}),
  fetchImpl:async(url,{body})=>{
   assert.match(url,/generativelanguage\.googleapis\.com/);
   if(url.endsWith(':countTokens'))return Response.json({totalTokens:1150});
   assert.ok(url.endsWith(':generateContent'));
   const request=JSON.parse(body);
   const input=JSON.parse(request.contents[0].parts[0].text);
   assert.deepEqual(input.tasks.map(task=>[task.id,task.newProofs]),[[need.id,['publisher']]]);
   assert.equal(request.generationConfig.thinkingConfig.thinkingLevel,'MINIMAL');
   assert.ok(request.generationConfig.maxOutputTokens<=1224);
   generated++;
   const data={decisions:[{id:need.id,sufficient:true,proofs:['publisher'],read:'',nextQuery:''}]};
   return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}],
    usageMetadata:{promptTokenCount:1150,candidatesTokenCount:100,totalTokenCount:1250}});
  }});
 const args={identity,briefUnderstanding,plan,providers,brief,packet,rounds:[saved],readPages:()=>assert.fail('unexpected source read')};
 const first=await reviewScopedResearch(args);
 assert.equal(first.stopReason,'evidence_confirmed');
 const charge=(await ledger.status()).chargedKurus;
 assert.ok(charge>2880&&charge<=3000);
 assert.deepEqual(await reviewScopedResearch(args),first);
 assert.equal((await ledger.status()).chargedKurus,charge);
 assert.equal(generated,1);
});

test('an executed read and invalid external need ID are reported back without purchasing the command again',async()=>{
 const need={...needs[0],first:'tavily'};
 const plan={targetedEvidence:true,qualityReport:true,reportOnlyAfterResearch:true,orderedResearch:true,needs:[need]};
 const args={identity,briefUnderstanding,plan,brief,packet};
 const read={id:need.id,tool:'read',mode:'default',query:'',url:about,limit:1};
 const initial={receipts:[{id:need.id,query:need.query,urls:[about],facts:[],issues:[],defaultAttempt:true,attempts:[{tool:'tavily'}]}]};
 const commands=[read,{...read,limit:2},{...read,id:'c1'}];
 let reads=0,review=0;
 const providers={managedBudgetVersion:14,researchCapacity:async()=>({remainingKurus:690,defaults:['tavily'],actors:[]}),
  manager:async(_stage,input)=>{
   if(review)assert.equal(input.commandHistory[0].status,'executed');
   return {data:draft({commands:[commands[review++]]})};
  },worker:async()=>({data:{results:[]}}),search:()=>assert.fail('duplicated query')};
 const readPages=async()=>{reads++;return {sources:[{...packet.sources[0],url:about,finalUrl:about}]};};
 const first=await reviewScopedResearch({...args,rounds:[initial],providers,readPages});
 const second=await reviewScopedResearch({...args,rounds:[initial,first],providers,readPages});
 const third=await reviewScopedResearch({...args,rounds:[initial,first,second],providers,readPages});
 assert.equal(reads,1);assert.equal(second.commandResults[0].status,'duplicate');assert.equal(third.commandResults[0].status,'need_unavailable');
});

test('source transport preserves every alias and retains valid parts of a clipped draft',async()=>{
 const metrics={...needs[0],section:'PAZAR',first:'tavily'};
 const url='https://publisher.fr/market-figures',product='https://publisher.fr/category-cpc';
 const plan={targetedEvidence:true,qualityReport:true,adaptiveResearch:true,scopedResearch:true,orderedResearch:true,
  reportOnlyAfterResearch:true,needs:[metrics]};
 const fact=(id,target,quote)=>({id,url:target,title:'Kamu verileri',item:id,quote,method:'search-snippet'});
 const receipts=[{id:metrics.id,facts:[
  fact('a',url,'Kategori yılına ilişkin perakende kayıtları kaynak tablosundan derlendi. Kasım mobilya kampanyası 27 Kasım 2026 tarihinde gerçekleştirildi.'),
  fact('b',product,'Kategori Google Ads tahmini tıklama maliyeti: Ev dekorasyon5 - 18 TL, ulusal arama reklamları.')
 ]}];
 const providers={manager:async(_stage,input)=>{
  const alias=part=>Object.entries(input.sources).find(([,row])=>row[1].includes(part))[0];
  const base={section:'Pazar',needIds:[metrics.id],area:'',quadrant:'none',peerId:'',kind:'observation',analysis:'Kampanya planlaması için kullanılabilir.',
   action:'Kampanya planını gözden geçir.',measurement:'Dönüşüm oranı',limitation:'',question:''};
  assert.ok(Object.values(input.documents).some(doc=>doc[0]===url));
  return {model:'offline',partialOutput:true,data:{findings:[
   {...base,rank:1,observation:'Kasım mobilya kampanyası 27 Kasım 2026 tarihinde gerçekleştirildi.',proof:[alias('perakende kayıtları')]},
   {...base,rank:2,observation:'Ev dekorasyonunda Google Ads maliyet tahmini 5–18 TL. Aynı sektörün toplam cirosu 999 milyon TL.',proof:[alias('dekorasyon5')]},
   {...base,rank:3,observation:'Kategori toplam cirosu 999 milyon TL.',proof:[alias('dekorasyon5')]}
  ],peers:[],benchmarks:[],questions:[]}};
 }};
 const result=await writeScopedSynthesis({brief,brand:{packet,facts:[],brandUnderstanding:identity,briefUnderstanding},plan,
  rounds:[{closed:true,stopReason:'research_budget_exhausted',receipts}],providers});
 assert.equal(result.report.findings.length,2);
 assert.match(result.report.findings[1].statement,/5–18 TL/);
 assert.doesNotMatch(result.report.findings[1].statement,/999/);
 assert.equal(result.report.bhsSections.find(s=>s.id==='PAZAR').complete,false);
});

test('short Tavily receipts reach the controller without an extra extraction call',async()=>{
 const [receipt]=await runScopedDefaults([needs[1]],{managedBudgetVersion:13,
  search:async()=>({results:[{url:instagram,content:postQuote}]}),worker:()=>assert.fail('redundant model call')},
 ()=>assert.fail('read must be selected by the controller'));
 assert.equal(receipt.facts[0].quote,postQuote);
 assert.equal(receipt.facts[0].method,'search-snippet');
 assert.equal(receipt.facts[0].preliminary,true);
});

test('scoped transfer ties Claude’s headings and rivals to evidence and retains qualified traffic estimates',async()=>{
 const rival={url:'https://comparable.fr/catalogue',name:'Comparable',product:'Packaged groceries',market:'France',channel:'Online wholesale',priceBand:''};
 const traffic={id:'qtraffic',url:'https://traffic.fr/marque',title:'Traffic estimate',item:'Traffic estimate',quote:'Marque website traffic estimate — Monthly visits: 2,570.',method:'search-snippet'};
 const product={id:'qproduct',url:rival.url,title:rival.name,item:rival.name,quote:'Comparable distributes packaged groceries via an online wholesale catalogue.',method:'extracted'};
 const plan={qualityReport:true,adaptiveResearch:true,scopedResearch:true,orderedResearch:true,reportOnlyAfterResearch:true,
  needs:[{...needs[0],section:'rakipler'},{...needs[1],section:'kanal',metric:'Kanal bazında oturum sayısı'}]};
 const brand={packet,facts:[],brandUnderstanding:identity,briefUnderstanding};
 const receipts=[{id:'t0',facts:[product]},{id:'t1',facts:[traffic]}];
 const terminal={approved:false,closed:true,stopReason:'research_budget_exhausted',peers:[rival],receipts,
  decisions:[{id:'t0',sufficient:true,proofs:[product.id]},{id:'t1',sufficient:false,proofs:[traffic.id]}]};
 const snippets={...terminal,receipts:[{id:'t0',facts:[{...product,method:'search-snippet'}]},receipts[1]]};
 assert.equal(scopedEvidence(brand,plan,[snippets]).coverage[0].status,'open');
 assert.equal(scopedEvidence(brand,plan,[terminal]).coverage[0].status,'confirmed');
 const providers={manager:async(_stage,input)=>{
  const proof=url=>Object.entries(input.sources).find(([,row])=>row[0]===url)[0];
  const base={area:'',rank:1,quadrant:'none',peerId:'',kind:'observation',analysis:'Kanal seçimi için başlangıç noktası oluşturuyor.',
   action:'Toptan satış kataloğunu karşılaştır.',question:'Kanal satış verisini paylaşabilir misiniz?',measurement:'Sipariş sayısı',limitation:''};
  return {model:'claude-sonnet-5-5',partialOutput:true,data:{findings:[
   {...base,section:'Rakiplerin Satış Kanalları',needIds:['t0'],peerId:rival.name,observation:'Comparable paketli gıdaları çevrimiçi toptan satış kataloğuyla dağıtıyor.',proof:[proof(rival.url)]},
   {...base,rank:2,section:'Kanal Stratejisi ve Kârlılık',needIds:['t1'],observation:'Marque sitesi ayda 2.570 ziyaret alıyor.',
    action:'2.570 doğrudan oturumu satışa çevir.',measurement:'2.570 doğrudan oturum',proof:[proof(traffic.url)]}
  ],peers:[{entityId:rival.name,relationship:'direct',reason:'Çevrimiçi toptan satış ve paketli gıda.',sourceIds:[proof(rival.url)]}],benchmarks:[],questions:[],invalidObservations:[]}};
 }};
 const synthesis=await writeScopedSynthesis({brief,brand,plan,rounds:[terminal],providers});
 const result=directAuditResult(brief,synthesis);
 const report=result.data.report;
 assert.equal(report.competitors[0]?.name,rival.name);
 assert.equal(report.bhsSections.find(s=>s.id==='rakipler')?.complete,true);
 assert.equal(report.findings.length,2);
 assert.deepEqual(report.bhsSections.find(s=>s.id==='kanal'),{id:'kanal',title:'Kanal Stratejisi ve Kârlılık',findingIds:[report.findings[1].id],count:1,missingQuadrants:[],complete:false});
 assert.match(report.findings[1].statement,/trafik tahminine göre/);
 assert.match(report.findings[1].recommendation.action,/GA4/);
 assert.doesNotMatch(report.findings[1].recommendation.action,/2\.570/);
 assert.ok(result.data.supervision.acceptance.issues.includes('partial_model_document'));
});

test('verified rivals, sources and measurements survive clipped writing and no-model offer recovery',async t=>{
 const {ledger,close}=await localBudget();t.after(close);
 const market={...needs[0],id:'market',section:'PAZAR',metric:'2025 Türkiye mobilya ihracatı',first:'tavily'};
 const rivals={...needs[0],id:'rivals',section:'RAKIP',metric:'Koltuk rakiplerinde ürün, fiyat ve satış kanalı',first:'tavily'};
 const digital={...needs[1],id:'digital',section:'DİJİTAL',metric:'Tek gönderi beğenisi'};
 const plan={scopedResearch:true,qualityReport:true,adaptiveResearch:true,targetedEvidence:true,orderedResearch:true,
  reportOnlyAfterResearch:true,verifiedResults:true,needs:[rivals,market,digital]};
 const brand={packet,facts:[],brandUnderstanding:identity,briefUnderstanding};
 const official='https://ticaret.gov.tr/ornek/mobilya.pdf';
 const passage='2025 Türkiye mobilya ihracatı 4.500 milyon USD olarak kaydedildi.';
 const other='2024 Türkiye yatak ihracatı 2.050 milyon USD olarak kaydedildi.';
 const measure={proof:'m1',amount:'4.500',unit:'milyon USD',year:'2025',category:'mobilya ihracatı',passage};
 const peer=(name,url,relationship)=>({name,url,relationship,product:'Modüler koltuk',market:'Türkiye',channel:'Kendi perakendesi',priceBand:''});
 const peers=[peer('Alfemo','https://alfemo.com.tr/koltuk','direct'),peer('Vivense','https://vivense.com/koltuk','direct'),peer('Başka Mağaza','https://baska.example/koltuk','candidate')];
 const fact=(id,url,quote,method='html')=>({id,url,quote,method,item:id,title:'Kaynak'});
 const receipt=(need,facts)=>({id:need.id,query:need.query,urls:facts.map(f=>f.url),defaultAttempt:true,attempts:[{tool:'tavily'}],facts});
 const terminal={scopedRound:true,closed:true,stopReason:'research_budget_exhausted',peers,receipts:[
  receipt(rivals,peers.map(({name,url},i)=>fact('r'+i,url,`${name} modüler koltuk seçeneklerini kendi perakende kataloğunda listeliyor.`))),
  receipt(market,[fact('m1',official,passage+' '+other,'pdf')]),receipt(digital,[fact('d1',post,postQuote)])],
 decisions:[{id:rivals.id,sufficient:false,proofs:['r0','r1','r2']},{id:market.id,sufficient:true,proofs:['m1'],marketMeasures:[measure]},
  {id:digital.id,sufficient:true,proofs:['d1']}]};
 await ledger.once('synthetic-research-receipt',{},2169,async()=>terminal);
 const stored=(await ledger.get('synthetic-research-receipt')).value;
 const providers={manager:async(_stage,input)=>{
  const alias=text=>Object.entries(input.sources).find(([,row])=>row[1].includes(text))[0];
  assert.deepEqual(input.coverage.find(m=>m.id===market.id).marketMeasures[0].sources,[alias(passage)]);
  const base={area:'',quadrant:'none',peerId:'',kind:'observation',analysis:'Mevcut kapsam görüşmede değerlendirilebilir.',action:'Satış kanallarını karşılaştır.',measurement:'',limitation:'',question:''};
  return {model:'offline',partialOutput:true,data:{findings:[
   {...base,rank:1,section:'Pazar',needIds:[market.id],observation:'2025 Türkiye yatak ihracatı 4.500 milyon USD olarak kaydedildi.',proof:[alias(passage)]},
   {...base,rank:2,section:'Dijital',needIds:[digital.id],observation:'Gönderi 84 beğeni aldı.',proof:[alias(postQuote)]}
  ],peers:[],benchmarks:[],questions:[]}};
 }};
 const written=await writeScopedSynthesis({brief,brand,plan,rounds:[stored],providers});
 const recovered=await recoverManagedSectionSynthesis(brief,async phase=>{
  if(phase==='sector_sources')return {managedPlan:plan};
  if(phase==='brand')return brand;
  if(phase===scopedRounds[0])return stored;
  if(phase==='scoped-tail')return [];
 },{manager:()=>assert.fail('no extra report purchase')});
 for(const synthesis of [written,recovered]){
  const audit=directAuditResult(brief,synthesis).data;
  const proposal=selectProposalAudit(audit,brief);
  assert.deepEqual(proposal.competitors.map(p=>p.name).sort(),['Alfemo','Vivense']);
  assert.ok(proposal.competitors.every(p=>p.sourceIds.length&&p.sourceIds.every(id=>proposal.sources.some(s=>s.id===id))));
  assert.equal(proposal.verifiedResearch.metrics.find(m=>m.id===rivals.id).status,'open');
  assert.equal(proposal.verifiedResearch.metrics.find(m=>m.id===market.id).status,'confirmed');
  assert.equal(proposal.bhsSections.find(s=>s.id==='PAZAR').complete,false);
  assert.ok(proposal.findings.some(f=>f.statement===passage));
  assert.ok(!proposal.findings.some(f=>f.statement.includes('2025 Türkiye yatak')));
  assert.match(audit.rawReport,/Vivense/);
 }
 const counts=written.report.verifiedResearch.metrics.map(metric=>[metric.id,metric.status]);
 const patch={...recovered.report,verifiedResearch:{metrics:recovered.report.verifiedResearch.metrics.map(metric=>({...metric,status:'open'}))}};
 const merged=mergeManagedGapReport(written.report,patch,['PAZAR']);
 assert.deepEqual(merged.verifiedResearch.metrics.map(metric=>[metric.id,metric.status]),counts.map(([id,status])=>[id,id===market.id?'open':status]));
 assert.equal(merged.findings.filter(f=>f.statement===passage).length,1);
 assert.equal(merged.competitors.length,2);
 assert.equal((await ledger.status()).chargedKurus,2669);
});

test('market review keeps a metric open unless amount, unit, year and category share one read passage',async()=>{
 const need={...needs[0],id:'market',section:'pazar',metric:'2025 mobilya ihracatı',first:'tavily'};
 const plan={targetedEvidence:true,verifiedResults:true,qualityReport:true,orderedResearch:true,reportOnlyAfterResearch:true,needs:[need]};
 const quote='2025 mobilya ihracatı 4.500 milyon USD olarak kaydedildi. 2024 yatak ihracatı 2.050 milyon EUR olarak kaydedildi.';
 const fact={id:'m1',url:'https://ticaret.gov.tr/ornek.pdf',method:'pdf',quote,title:'Tablo',item:'Mobilya'};
 const round={receipts:[{id:need.id,query:need.query,urls:[fact.url],defaultAttempt:true,attempts:[{tool:'tavily'}],facts:[fact]}]};
 const measure={proof:fact.id,amount:'4.500',year:'2025',category:'mobilya ihracatı',unit:'milyon USD',passage:quote.split('. 2024')[0]+'.'};
 for(const bad of [{...measure,year:'2024'},{...measure,amount:'2.050'},{...measure,unit:'milyon EUR'},
  {...measure,category:'yatak ihracatı'},{...measure,passage:quote}]){
  const providers={managedBudgetVersion:17,manager:async()=>({data:draft({approve:true,decisions:[{id:need.id,sufficient:true,proofs:[fact.id],marketMeasures:[bad]}]})})};
  const result=await reviewScopedResearch({identity,briefUnderstanding,plan,providers,brief,packet,rounds:[round]});
  assert.equal(result.approved,false);
  assert.deepEqual(result.decisions[0].marketMeasures,[]);
  assert.deepEqual(result.decisions[0].proofs,[fact.id]);
 }
 const providers={managedBudgetVersion:17,manager:async()=>({data:draft({approve:true,decisions:[{id:need.id,sufficient:true,proofs:[fact.id],marketMeasures:[measure]}]})})};
 const accepted=await reviewScopedResearch({identity,briefUnderstanding,plan,providers,brief,packet,rounds:[round]});
 assert.equal(accepted.stopReason,'evidence_confirmed');
 assert.deepEqual(accepted.decisions[0].marketMeasures,[measure]);
});

test('a partial report carries each question’s sources and preserves England’s count without closing the UK question',async()=>{
 const brand={packet,facts:[],brandUnderstanding:identity,briefUnderstanding};
 const market={...needs[0],id:'market',section:'market_demand',market:'Birleşik Krallık',period:'2025',
  metric:'Aktif kreş sayısı',expected:'Kreş sayısı ve istatistiğin kapsadığı bölge'};
 const play={...needs[0],id:'play',section:'nursery_demand',market:'Birleşik Krallık',metric:'Duyusal oyun talebi'};
 const regulations={...needs[0],id:'safety',section:'compliance',market:'Birleşik Krallık',metric:'Ürün güvenliği'};
 const prices={...needs[0],id:'prices',section:'pricing',market:'Birleşik Krallık',metric:'GBP liste fiyatları'};
 const source=(id,url,quote,method='html')=>({id,url,quote,method,title:id,item:id,retrievedAt:'2026-11-17T15:56:18.374Z'});
 const passage='In 2025, England had 59,700 registered childcare providers.';
 const census=source('census','https://statistics.example/childcare',passage);
 const guide=source('guide','https://safety.example/guidance','Great Britain guidance for placing toys on the market. Skip to main content.');
 const price=source('price','https://catalogue.example/sets','Sensory play set costs £149.00 per pack.','search-snippet');
 const pages=Array.from({length:20},(_,i)=>source('approved'+i,'https://nurseries.example/activity','Activities for nursery sensory play differ by room size and supported age group. Section '+(i+1)+'.'));
 const receipt=(need,facts)=>({id:need.id,urls:facts.map(f=>f.url),facts,attempts:[{tool:'tavily'}]});
 const measure={proof:census.id,amount:'59,700',year:'2025',unit:'providers',category:'registered childcare providers',passage};
 const round={closed:true,stopReason:'research_budget_exhausted',receipts:[receipt(play,pages),receipt(market,[census]),receipt(regulations,[guide]),receipt(prices,[price])],
  decisions:[{id:play.id,sufficient:true,proofs:pages.map(f=>f.id)},{id:market.id,sufficient:true,proofs:[census.id],marketMeasures:[measure]}]};
 const plan={needs:[play,market,regulations,prices],adaptiveResearch:true,verifiedResults:true,taskReporting:true,
  readEvidenceOnly:true,qualityReport:true,targetedEvidence:true,orderedResearch:true,scopeMarketCounts:true,qualifyReportFindings:true};
 const saved=await writeScopedSynthesis({brief,brand,plan,rounds:[round],allowWrite:false,providers:{manager:()=>assert.fail('must not call a model')}});
 const audit=directAuditResult(brief,saved).data;
 const metric=id=>audit.verifiedResearch.metrics.find(m=>m.id===id);
 assert.equal(metric(market.id).status,'open');
 assert.equal(metric(market.id).marketMeasures[0].geography,'İngiltere');
 assert.equal(metric(market.id).marketMeasures[0].year,'2025');
 const measurement=audit.findings.find(f=>f.researchNeedIds?.includes(market.id));
 assert.match(measurement.statement,/İngiltere için 2025 verisinde .* 59,700 providers kaydedildi\.$/u);
 assert.ok(selectProposalAudit(audit,brief).findings.some(f=>f.id===measurement.id));
 assert.equal(audit.findings.filter(f=>f.researchNeedIds?.includes(play.id)).length,0);
 assert.ok(metric(play.id).evidence.some(s=>s.status==='verified'));
 assert.deepEqual(metric(regulations.id).evidence,[{url:guide.url,title:guide.title,status:'read',geography:'Büyük Britanya',accessed:'2026-11-17'}]);
 assert.deepEqual(metric(prices.id).evidence,[{url:price.url,title:price.title,status:'discovered'}]);
 assert.match(audit.rawReport,/Hedef pazar Birleşik Krallık · Aranan dönem 2025/);
 assert.match(audit.rawReport,/Metinde geçen coğrafya İngiltere/);
 assert.doesNotMatch(audit.rawReport,/£149/);
 assert.doesNotMatch(JSON.stringify(selectProposalAudit(audit,brief)),/catalogue\.example|safety\.example/);
 const patch=structuredClone(saved.report);
 patch.verifiedResearch.metrics.find(m=>m.id===prices.id).evidence=[{url:'https://other-catalogue.example/product',status:'discovered'}];
 const merged=mergeManagedGapReport(saved.report,patch,['pricing']);
 assert.deepEqual(merged.verifiedResearch.metrics.find(m=>m.id===prices.id).evidence.map(s=>s.url),[price.url,'https://other-catalogue.example/product']);
 const edited=await writeScopedSynthesis({brief,brand,plan,rounds:[round],providers:{manager:async(_stage,input)=>{
  const alias=Object.entries(input.sources).find(([,row])=>row[1]===passage)[0];
  const base={area:'',rank:1,section:'Pazar',needIds:[market.id],quadrant:'none',peerId:'',kind:'observation',analysis:'Hedef kitleye yönelik başlangıç bilgisi sağlar.',
   action:'Dağıtıcı erişimini pazarla karşılaştır.',measurement:'',limitation:'',question:'',proof:[alias]};
  return {data:{findings:[{...base,observation:'In 2025, the United Kingdom had 59,700 registered childcare providers.'}],benchmarks:[],questions:[],peers:[]}};
 }}});
 const revised=directAuditResult(brief,edited).data;
 assert.ok(revised.findings.some(f=>f.statement===measurement.statement));
 assert.ok(!revised.findings.some(f=>/United Kingdom had/.test(f.statement)));
});

test('the scoped writer keeps usage, requires buyer evidence for demand, and drops copied and duplicate text',async()=>{
 const brand={packet,facts:[],brandUnderstanding:identity,briefUnderstanding};
 const usage={...needs[0],id:'usage',section:'market_demand',sectionTitle:'Duyusal oyun talebi',metric:'Kreşlerde duyusal oyun talebi'};
 const buying={...usage,id:'demand',section:'buyer_demand',sectionTitle:'Duyusal setlerin talebi',metric:'Kreşlerde raporlanan duyusal set siparişleri'};
 const source=(id,quote)=>({id,url:'https://publisher.example/'+id,title:id,quote,method:'html',item:id});
 const features=source('features','Supplier guidance describes a sensory room as supporting supervised sensory activities and says nursery managers can purchase kits.');
 const menu=source('menus','Nursery Management | Contact Us | Privacy Policy.');
 const survey=source('survey','Surveyed nursery managers in France reported ordering sensory play kits for classrooms.');
 const plan={needs:[usage,buying],qualifyReportFindings:true,taskReporting:true,readEvidenceOnly:true,adaptiveResearch:true,
  targetedEvidence:true,qualityReport:true,verifiedResults:true,sectionedSynthesis:true,orderedResearch:true};
 const round={closed:true,stopReason:'research_budget_exhausted',receipts:[{id:usage.id,facts:[features,menu],urls:[features.url,menu.url]},
  {id:buying.id,facts:[survey],urls:[survey.url]}],decisions:[{id:usage.id,sufficient:true,proofs:[features.id,menu.id]},
  {id:buying.id,sufficient:true,proofs:[survey.id]}]};
 const use='Kılavuz, duyusal odaların kreşlerde gözetimli duyusal oyun etkinliklerini desteklediğini açıklıyor.';
 const demand='Fransa’daki ankette kreş yöneticileri, duyusal oyun setlerine taleplerini sınıfları için verdikleri siparişlerle gösterdi.';
 const synthesis=await writeScopedSynthesis({brief,brand,plan,rounds:[round],providers:{manager:async(stage,input)=>{
  if(stage.endsWith('-swot'))return {data:{findings:[],benchmarks:[],questions:[]}};
  assert.match(input.instruction,/Talep için hedef kitlenin gözlenen satın alma davranışı/);
  const proof=f=>Object.entries(input.sources).find(([,row])=>row[1]===f.quote)[0];
  const base={rank:1,section:'Duyusal oyun talebi',area:'',quadrant:'none',peerId:'',kind:'observation',needIds:[usage.id],proof:[proof(features)],
   analysis:'Bu kullanım biçimi, kurulum senaryosunu değerlendirmeye yardımcı olur.',action:'Örnek kurulum koşullarını incele.',measurement:'',limitation:'',question:''};
  return {data:{findings:[{...base,observation:use},{...base,rank:2,observation:'Kılavuz, kreşlerde duyusal odaların gözetimli duyusal oyun etkinliklerini desteklediğini açıklıyor.'},
   {...base,rank:3,observation:'Kreşlerde duyusal oyun setlerine güçlü talep var.'},{...base,rank:4,observation:features.quote},
   {...base,rank:5,observation:'ivities, or guided sensory play sessions.'},{...base,rank:6,observation:menu.quote,proof:[proof(menu)]},
   {...base,rank:7,section:'Satın alma davranışı',observation:demand,proof:[proof(survey)],needIds:[buying.id]}],benchmarks:[],questions:[]}};
 }}});
 const audit=directAuditResult(brief,synthesis).data;
 assert.deepEqual(audit.findings.map(f=>f.statement),[use,demand]);
 assert.equal(audit.findings[0].bhsSectionTitle,'Kullanım ve uygulama');
 assert.deepEqual(audit.findings[0].researchNeedIds,[]);
 assert.equal(audit.verifiedResearch.metrics.find(m=>m.id===usage.id).status,'open');
 assert.deepEqual(audit.bhsSections.find(s=>s.id===usage.section).openMetrics.map(m=>m.id),[usage.id]);
 assert.deepEqual(selectProposalAudit(audit,brief).findings.map(f=>f.statement),[use,demand]);
});

test('a previously signed fallback cannot copy source fragments through offer sections, summary or intro',()=>{
 const fragment='ivities, or guided sensory play sessions.';
 const valid='Açık katalog, ürünleri yaş grubuna göre sınıflandırıyor.';
 const raw={id:'raw',statement:fragment,kind:'observation',dimension:'perception',sourceIds:['one'],researchEvidenceOnly:true};
 const authored={...raw,id:'authored',statement:valid,researchEvidenceOnly:false};
 const audit={summary:fragment,findings:[raw,authored],sources:[{id:'one',url:about}],
  dimensions:[{id:'perception',rationale:fragment,strengths:[fragment],gaps:[]}],
  researchCoverage:[{dimension:'perception',observation:fragment,sourceIds:['one']}],
  bhsSections:[{id:'usage',findingIds:['raw','authored'],count:2,complete:true}],meetingQuestions:[]};
 const proposal=selectProposalAudit(audit,brief);
 assert.deepEqual(proposal.findings.map(f=>f.id),['authored']);
 assert.deepEqual(proposal.bhsSections[0].findingIds,['authored']);
 assert.doesNotMatch(JSON.stringify(proposal),/guided sensory/);
 assert.deepEqual(compositionEnvelope(brief,audit,{scope:{selected:[]}}).findings.map(f=>f.id),['authored']);
 assert.deepEqual(offerCopy({headline:'Net hedefler.',accent:'Birlikte büyüme.',subtitle:'Görüşmeye dayalı işbirliği.',findingIds:['raw']},audit).findingIds,[]);
});

test('a product-specific search opens only after the brand product page has been reviewed',async()=>{
 const focus={...needs[0],market:'United Kingdom',country:'GB',language:'en',comparisonProduct:'Royal',first:'tavily'};
 const reference={...focus,id:'royal',section:'product',comparisonRole:'reference',query:'Marque Royal product class and use'};
 const rivals={...focus,id:'peers',section:'competition',comparisonRole:'rivals',query:'UK nursery textured interlocking activity mat sets'};
 const planned=await planScopedResearch({brief:{...brief,meetingNotes:'Royal kıyaslanacak.'},identity,briefUnderstanding,asOf:packet.asOf,packet,
  providers:{managedBudgetVersion:22,manager:async(_stage,input,_contract,{normalizeData})=>{
   assert.equal(input.commercialBrief.meetingNotes,'Royal kıyaslanacak.');
   assert.match(input.instruction,/Önce reference göreviyle/);
   return {data:normalizeData({needs:[rivals,reference]})};
  }}});
 assert.equal(planned.needs[0].comparisonProduct,'Royal');
 const plan={...planned,focusedProductComparison:true,taskReporting:true,qualityReport:true,orderedResearch:true,targetedEvidence:true,
  reportOnlyAfterResearch:true,readEvidenceOnly:true};
 const requests=[];
 const referencePage='https://marque.fr/products/royal';
 const providers={managedBudgetVersion:22,researchCapacity:async()=>openingCapacity(2800),search:async query=>{
  requests.push(query);return {results:[{url:referencePage,content:'Royal product page and mat set description.'}]};
 }};
 const execute=rounds=>reviewScopedResearch({brief,identity,briefUnderstanding,packet,plan,rounds,providers,readPages:()=>assert.fail('no real page read')});
 const first=await execute([]);
 assert.deepEqual(requests,[reference.query]);
 const official={id:'page',url:referencePage,title:'Royal mat set',quote:'Royal tactile mat set for nursery movement games.',method:'html',item:'Royal'};
 await execute([{...first,receipts:[{id:reference.id,facts:[official],urls:[official.url],attempts:[{tool:'tavily'}],defaultAttempt:true}],
  decisions:[{id:reference.id,sufficient:true,proofs:[official.id]}]}]);
 assert.deepEqual(requests,[reference.query,rivals.query]);
});

test('product comparison keeps same-page GBP and specs and stops broad or cross-variant offers from qualifying',async()=>{
 const brand={packet,facts:[],brandUnderstanding:identity,briefUnderstanding};
 const scope={...needs[0],market:'United Kingdom',country:'GB',language:'en',comparisonProduct:'Royal',first:'tavily'};
 const reference={...scope,id:'reference',section:'product',comparisonRole:'reference',metric:'Royal ürün sınıfı'};
 const rivals={...scope,id:'rivals',section:'competition',comparisonRole:'rivals',metric:'Royal ile karşılaştırılabilir ürünler'};
 const prices={...rivals,id:'prices',section:'pricing',metric:'Muadil ürünlerin GBP fiyatı'};
 const source=(id,url,quote,method='html')=>({id,url,quote,method,title:id,item:id});
 const owned=source('official','https://marque.fr/products/royal','Royal tactile mat set. SKU RY-1. 24 pieces. Covers 2 m² assembled. Ages 3–6 years. £240 including VAT. Delivery in 3 days.');
 const close=source('close','https://play.example/products/texture','Texture Pack tactile mat kit. SKU TX-18. 18 pieces. Tile size 30 cm. Ages 4–7 years. VAT excluded.');
 const listed=source('listed',close.url,'Texture Pack SKU TX-18 costs GBP 180. Delivery in 5 days.');
 const different=source('different','https://play.example/products/texture-mini','Texture Mini costs £65 including VAT. Delivery in 2 days.');
 const room=source('room','https://room.example/products/bubble-room','Bubble Room sensory room equipment includes lighting and a bubble tube. GBP 900.');
 const catalogue=source('catalogue','https://catalogue.example/collections/sensory','General Cat tactile mat products are available by type.');
 const snippet=source('snippet','https://other.example/products/tex','Other Tex tactile mat kit. GBP 96.','search-snippet');
 const receipt=(need,facts)=>({id:need.id,urls:facts.map(f=>f.url),facts});
 const selected=(need,proofs)=>({id:need.id,sufficient:true,proofs:proofs.map(f=>f.id)});
 const entry=(field,value,fact)=>({field,value,proof:fact.id});
 const peer=(fact,product,candidateClass)=>({name:fact.title,product,url:fact.url,market:'United Kingdom',channel:'Nursery supply',priceBand:'',relationship:'direct',
  productMatch:{referenceProof:owned.id,candidateProof:fact.id,referenceClass:'tactile mat set',candidateClass,
   referenceFields:[entry('sku','RY-1',owned),entry('pieces','24 pieces',owned),entry('footprint','Covers 2 m² assembled',owned),entry('age','Ages 3–6 years',owned),entry('price','£240',owned),entry('vat','including VAT',owned),entry('delivery','Delivery in 3 days',owned)],candidateFields:[]}});
 const direct=peer(close,'Texture Pack','tactile mat kit');
 direct.productMatch.candidateFields=[entry('sku','TX-18',close),entry('pieces','18 pieces',close),entry('footprint','Tile size 30 cm',close),
  entry('age','Ages 4–7 years',close),entry('price','£65',different),entry('price','GBP 180',listed),entry('vat','VAT excluded',close),entry('delivery','Delivery in 5 days',listed)];
 const peers=[peer(room,'Bubble Room','sensory room equipment'),peer(catalogue,'General Cat','tactile mat products'),peer(snippet,'Other Tex','tactile mat kit'),direct];
 const rounds=[{closed:true,stopReason:'research_budget_exhausted',peers,receipts:[receipt(reference,[owned]),receipt(rivals,[close,room,catalogue,snippet]),receipt(prices,[different,listed])],
  decisions:[selected(reference,[owned]),selected(rivals,[close,room,catalogue,snippet]),selected(prices,[different,listed])]}];
 const plan={needs:[reference,rivals,prices],focusedProductComparison:true,qualityReport:true,taskReporting:true,verifiedResults:true,
  readEvidenceOnly:true,targetedEvidence:true,adaptiveResearch:true,orderedResearch:true,qualifyReportFindings:true};
 const synthesis=await writeScopedSynthesis({brief,brand,plan,rounds,allowWrite:false,providers:{manager:()=>assert.fail('saved comparison must be free')}});
 const audit=directAuditResult(brief,synthesis).data;
 const [row]=audit.verifiedResearch.productComparisons;
 assert.deepEqual(audit.competitors.map(p=>p.name),['close']);
 assert.deepEqual(audit.verifiedResearch.indirectAlternatives.map(p=>p.url),[room.url]);
 assert.deepEqual(audit.verifiedResearch.competitorCandidates.map(p=>p.url),[catalogue.url,snippet.url]);
 assert.deepEqual(audit.verifiedResearch.metrics.map(m=>m.status),['confirmed','confirmed','confirmed']);
 assert.equal(row.reference.name,'Royal');
 assert.equal(row.candidate.url,close.url);
 assert.deepEqual(row.fields.map(f=>f.reference?.value),['RY-1','24 pieces','Covers 2 m² assembled','Ages 3–6 years','£240','including VAT','Delivery in 3 days']);
 assert.deepEqual(row.fields.map(f=>f.candidate?.value),['TX-18','18 pieces',undefined,'Ages 4–7 years','GBP 180','VAT excluded','Delivery in 5 days']);
 assert.doesNotMatch(audit.rawReport,/Liste fiyatı[^\n]*£65/);
 assert.equal(continuationAudit(brief,{synthesis,reason:'budget_limit'}).data.researchContinuity.status,'partial');
 const legacy={...synthesis.report,verifiedResearch:{...synthesis.report.verifiedResearch,productComparisons:[],indirectAlternatives:[]}};
 const merged=mergeManagedGapReport(legacy,synthesis.report,['pricing']);
 assert.equal(merged.verifiedResearch.productComparisons[0].fields.find(f=>f.key==='price').candidate.value,'GBP 180');
 const authored=await writeScopedSynthesis({brief,brand,plan,rounds,providers:{manager:async(_stage,input)=>{
  const comparison=input.coverage.find(m=>m.id===prices.id).verifiedProductProofs[0];
  const otherVariant=Object.entries(input.sources).find(([,row])=>row[1].includes('£65'))[0];
  const base={rank:1,section:'Rakip fiyatları',area:'',quadrant:'none',peerId:comparison.peerId,kind:'observation',needIds:[prices.id],
   analysis:'Bu fiyat, satış teklifini değerlendirmeye yardımcı olur.',action:'Vergi ve teslimatı karşılaştır.',measurement:'',limitation:'',question:''};
  return {data:{findings:[{...base,observation:'Texture Pack için £65 liste fiyatı gösteriliyor.',proof:[comparison.required[0],otherVariant]},
   {...base,rank:2,observation:'Texture Pack ürünü GBP 180 liste fiyatıyla sunuluyor.',proof:[comparison.required[0]]}],benchmarks:[],questions:[],peers:[]}};
 }}});
 assert.deepEqual(directAuditResult(brief,authored).data.findings.map(f=>f.statement),['Texture Pack ürünü GBP 180 liste fiyatıyla sunuluyor.']);
});

test('large source lists fit the offer transport while preserving access to the first source in every question',()=>{
 const metrics=Array.from({length:12},(_,i)=>({evidence:Array.from({length:20},(_,j)=>({
  url:'https://publisher.example/'+i+'/'+j+'/'+('x'.repeat(1500)),status:j?'discovered':'verified'}))}));
 boundScopedEvidence(metrics);
 assert.ok(JSON.stringify(metrics).length<46000);
 assert.ok(metrics.every(metric=>metric.evidence[0].status==='verified'&&metric.additionalEvidence===true));
});

test('Claude plans scoped research after brand and brief, then writes and transfers a partial report with the saved evidence',async()=>{
 const saved=new Map(),calls=[];
 let reviewCount=0;
 const providers={collectionFirst:true,managedAudit:true,managedBudgetVersion:10,
  claudeManager:async(stage,input)=>{
   calls.push(stage);
   if(stage==='bhs-scoped-brand'){
    assert.equal(input.card,undefined);
    assert.equal(input.brief,undefined);
    if(!input.priorUnderstanding)return {data:{...identity,pages:[about],searches:[]}};
    assert.ok(input.sources.some(s=>s.url===about));
    return {data:{...identity,pages:[],searches:[]}};
   }
   if(stage==='bhs-scoped-brief'){
    assert.deepEqual(input.identity,identity);
    assert.equal(input.card.goals,brief.goals);
    return {data:briefUnderstanding};
   }
   if(stage==='bhs-scoped-plan'){
    assert.deepEqual(input.briefUnderstanding,briefUnderstanding);
    assert.equal(input.asOf,'2026-11-15');
    return {data:{needs}};
   }
   if(stage==='bhs-scoped-review'){
    reviewCount++;
    const decisions=[{id:'t0',proofs:input.findings.filter(f=>f.needId==='t0'&&!f.preliminary).map(f=>f.id)}];
    const scrape={id:'t1',tool:'apify/instagram-scraper',url:instagram,query:'',mode:'posts',limit:10};
    if(reviewCount===2)assert.deepEqual(input.previous.find(r=>r.missingDefaults)?.missingDefaults,['gemini']);
    return {data:draft({decisions,commands:reviewCount===2?[{...scrape,tool:'gemini',query:needs[1].query}]:reviewCount<=3?[scrape]:[]})};
   }
   if(stage==='bhs-scoped-clearance')return {data:draft({})};
   assert.equal(stage,'bhs-scoped-report');
   assert.equal(input.sections,undefined);
   assert.equal(input.approved,false);
   assert.ok(input.coverage.every(m=>m.status==='open'));
   assert.ok(Object.values(input.sources).some(row=>row[0]===post));
   assert.ok(Object.values(input.sources).some(row=>row[0]==='https://publisher.fr/extra'));
   const proof=Object.entries(input.sources).find(([,row])=>row[0]==='https://publisher.fr/wholesale')[0];
   return {model:'claude-sonnet-5-5',data:{findings:[{section:'Dağıtım hazırlığı',area:'',rank:1,quadrant:'none',peerId:'',
    observation:'Marque Fransa’daki süpermarketler için toptan satış kataloğu sunuyor.',proof:[proof],kind:'observation',
    analysis:'Katalog, distribütör görüşmelerinde ürün uygunluğunu değerlendirmek için başlangıç sağlar.',
    action:'Katalogdan Fransız süpermarketlerle ürün örtüşmesini kontrol et.',measurement:'Dağıtıcıların kategori listesinde eşleşen ürünleri kaydet.',
    limitation:'Ürünlerin raf performansı doğrulanmadı.',question:'Katalogla hangi Fransız zincirlerine ulaşıldı?'}],peers:[],benchmarks:[],questions:[],invalidObservations:[]}};
  },
  search:async(query,options)=>{
   calls.push('tavily');
   assert.equal(options.countryCode,'FR');
   assert.equal(options.language,'fr');
   assert.equal(options.maxResults,10);
   if(query.includes('Instagram')){
    assert.equal(options.since,'2026-10-16');
    return {results:[{url:instagram,title:'Marque',content:quote}]};
   }
   throw Object.assign(new BudgetError('provider_error','Tavily unavailable'),{providerStatus:433});
  },
  searchGemini:async(need)=>{
   calls.push('gemini-search');
   assert.equal(need.quantity,10);
   if(need.id==='t1'){
    assert.equal(need.since,'2026-10-16');
    assert.equal(need.query,needs[1].query);
    return {results:[]};
   }
   assert.equal(need.query,needs[0].query);
   return {results:[{url:'https://publisher.fr/wholesale',title:'Wholesale',content:quote},
    {url:'https://publisher.fr/extra',title:'Extra',content:'Marque maintains a separate case packing catalogue for regional wholesale.'}]};
  },
  geminiWorker:async(stage,{requests})=>{
   assert.equal(stage,'bhs-scoped-extract');
   calls.push('gemini');
   return {data:{results:requests.flatMap(({need,sources})=>need.id==='t1'&&!sources.some(s=>s.url===post)?[]:[
    {id:need.id,facts:sources.length?[{proof:sources[0].proof,item:need.section,quote:need.id==='t1'?postQuote:quote}]:[],nextQuery:''}
   ])}};
  },
  availableActors:async()=>['apify/instagram-scraper'],
  enrich:async(request)=>{
   calls.push('scraper');
   assert.equal(request.url,instagram);
   assert.equal(request.maxResults,10);
   assert.equal(request.since,'2026-10-16');
   return {status:'complete',pages:[{url:post,text:postQuote}]};
  }
 };
 for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('synthesis')+1)){
  saved.set(phase,await runSequentialStage({phase,brief,providers,previous:async name=>saved.get(name),
   collect:async(_brief,_plan,options)=>{
    assert.equal(options.archivePages,undefined);
    const [url]=options.prioritySources;
    if(url===brief.website)return {...packet,sources:[{...packet.sources[0],technicalSignals:{navigation:[{url:about,label:'Our story'}]}}]};
    return {...packet,sources:url===about?[{...packet.sources[0],url,finalUrl:url}]:[]};
   }}));
 }
 assert.deepEqual(calls.slice(0,4),['bhs-scoped-brand','bhs-scoped-brand','bhs-scoped-brief','bhs-scoped-plan']);
 assert.ok(calls.indexOf('tavily')<calls.indexOf('gemini'));
 assert.equal(calls.filter(c=>c==='scraper').length,1);
 assert.equal(calls.filter(c=>c==='gemini-search').length,2);
 assert.ok(calls.indexOf('gemini')<calls.indexOf('scraper'));
 const synthesis=saved.get('synthesis');
 assert.equal(calls.at(-1),'bhs-scoped-report');
 assert.equal(synthesis.supervision.researchApproved,false);
 assert.equal(synthesis.supervision.metricCoverage.find(m=>m.id==='t1').status,'open');
 assert.equal(synthesis.model,'claude-sonnet-5-5');
 const result=directAuditResult(brief,synthesis);
 assert.equal(result.status,'review');
 assert.equal(result.data.report.bhsSections.find(s=>s.id==='Dağıtım hazırlığı').count,1);
 assert.equal(result.data.report.bhsSections.find(s=>s.id==='Dağıtım hazırlığı').complete,true);
 assert.match(result.data.report.findings[0].recommendation.action,/Katalogdan/);
 assert.equal(result.data.report.meetingQuestions[0].question,'Katalogla hangi Fransız zincirlerine ulaşıldı?');
});

test('new needs start with Tavily and Gemini and Claude can confirm a metric with one adequate source',async()=>{
 const identified={...needs[0],quantity:2};
 const newNeed={...needs[1],id:'new1',first:'both'};
 const plan={needs:[identified,...needs.slice(1)]};
 const original=needs.map(n=>({id:n.id,defaultAttempt:true,urls:['https://publisher.fr/'],facts:[{
  id:'q'+n.id,item:n.section,url:'https://publisher.fr/',quote,title:'Publisher',method:'extracted'
 }]}));
 const calls=[];
 const providers={
  claudeManager:async()=>({data:draft({approve:true,newNeeds:[newNeed],decisions:original.map(r=>({id:r.id,sufficient:true,proofs:[r.facts[0].id]})),
   commands:[{id:'new1',tool:'apify/instagram-scraper',query:'',url:instagram,mode:'posts',limit:3}]})}),
  availableActors:async()=>['apify/instagram-scraper'],
  enrich:async()=>assert.fail('scraper cannot run before a new need has used its defaults'),
  search:async()=>{calls.push('tavily');return {results:[]};},
  searchGemini:async()=>{calls.push('gemini-search');return {results:[]};},
  geminiWorker:async()=>{calls.push('gemini');return {data:{results:[]}};}
 };
 const round=await reviewScopedResearch({identity,briefUnderstanding,plan,rounds:[{receipts:original}],providers,brief,packet,readPages:async()=>({sources:[]})});
 assert.deepEqual(calls,['tavily','gemini-search']);
 assert.equal(round.newNeeds[0].id,'new1');
 const coverage=scopedEvidence({packet},plan,[{receipts:original},round]);
 assert.equal(coverage.approved,false);
 assert.equal(coverage.coverage.find(row=>row.id===identified.id).status,'confirmed');
});

test('an unaffordable grounded brand search leaves the brief and a usable plan funded',async()=>{
 const saved=new Map(),calls=[];
 const orderedNeeds=needs.map(need=>({...need,first:'tavily'}));
 const providers={collectionFirst:true,managedAudit:true,managedBudgetVersion:12,withCeiling(limit){
  return {...this,claudeManager:(stage,input)=>manager(stage,input,limit),searchGemini:async need=>{
   assert.equal(need.query,'Marque produits et marché');
   assert.equal(limit,1600);
   throw new BudgetError('budget_limit','Grounded search reserve does not fit in discovery');
  },search:async(query,options)=>{
   assert.equal(limit,1600);
   assert.equal(query,'Marque produits et marché');
   assert.equal(options.maxResults,1);
   calls.push('tavily');
   return {results:[{url:about,title:'Marque'}]};
  }};
 },claudeManager:(stage,input)=>manager(stage,input,3000)};
 async function manager(stage,input,limit){
  calls.push(stage);
  if(stage==='bhs-scoped-brand'){
   assert.equal(limit,1600);
   if(!input.priorUnderstanding)return {data:{...identity,pages:[],searches:[{query:'Marque produits et marché',tool:'gemini',limit:1}]}};
   if(input.lookupReceipts.at(-1)?.tool==='gemini'){
    assert.equal(input.lookupReceipts.at(-1).issue,'budget_limit');
    assert.ok(!calls.includes('tavily'));
    return {data:{...identity,pages:[],searches:[{query:'Marque produits et marché',tool:'tavily',limit:1}]}};
   }
   assert.ok(input.sources.some(s=>s.url===about));
   return {data:{...identity,pages:[],searches:[]}};
  }
  if(stage==='bhs-scoped-brief'){
   assert.equal(limit,2200);
   throw new BudgetError('budget_limit','Use the compact brief call');
  }
  if(stage==='bhs-scoped-brief-compact'){
   assert.equal(limit,2200);
   assert.equal(input.card.goals,brief.goals);
   return {data:briefUnderstanding};
  }
  assert.equal(limit,3000);
  assert.deepEqual(input.briefUnderstanding,briefUnderstanding);
  if(stage==='bhs-scoped-plan')return {data:{needs:[]}};
  assert.equal(stage,'bhs-scoped-plan-compact');
  return {data:{needs:orderedNeeds}};
 }
 for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('sector_sources')+1)){
  saved.set(phase,await runSequentialStage({phase,brief,providers,previous:async name=>saved.get(name),
   collect:async(_brief,_plan,{prioritySources:[url]})=>({...packet,sources:[{...packet.sources[0],url,finalUrl:url}]})}));
 }
 assert.deepEqual(calls,['bhs-scoped-brand','bhs-scoped-brand','tavily','bhs-scoped-brand','bhs-scoped-brief','bhs-scoped-brief-compact','bhs-scoped-plan','bhs-scoped-plan-compact']);
 assert.deepEqual(saved.get('sector_sources').managedPlan.needs,orderedNeeds);
 assert.equal(saved.get('sector_sources').managedPlan.orderedResearch,true);
});

test('an already-read brand page preserves the sources through the brief and into planning',async()=>{
 const saved=new Map(),reads=[],calls=[];
 const orderedNeed={...needs[0],first:'tavily'};
 const providers={collectionFirst:true,managedAudit:true,managedBudgetVersion:12,withCeiling(){return this;},
  async claudeManager(stage,input){
   calls.push(stage);
   if(stage==='bhs-scoped-brand')return {data:{...identity,pages:[about],searches:[]}};
   if(stage==='bhs-scoped-brief')return {data:briefUnderstanding};
   assert.equal(stage,'bhs-scoped-plan');
   assert.equal(input.asOf,packet.asOf);
   assert.deepEqual(input.identity,identity);
   assert.deepEqual(input.briefUnderstanding,briefUnderstanding);
   return {data:{needs:[orderedNeed]}};
  }};
 const previous=async phase=>{
  if(!saved.has(phase))throw new BudgetError('stage_pending','Missing checkpoint');
  return saved.get(phase);
 };
 const run=phase=>runSequentialStage({phase,brief,providers,previous,
  collect:async(_brief,_plan,{prioritySources:[url]})=>{
   reads.push(url);
   return {...packet,sources:[{...packet.sources[0],url,finalUrl:url,technicalSignals:{navigation:[{url:about,label:'Our story'}]}}]};
  }});
 for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('brand')+1))saved.set(phase,await run(phase));
 assert.equal(saved.get('brand_draft').brandDiscovery.done,true);
 assert.deepEqual(saved.get('brand').packet.sources.map(source=>source.finalUrl),[brief.website,about]);
 assert.deepEqual((await run('sector_sources')).managedPlan.needs,[orderedNeed]);

 // A checkpoint from the previous deployment can have a completed brief but
 // lose its packet after the last successful source read.
 for(const phase of sequentialPhases.slice(sequentialPhases.indexOf('brand_draft'),sequentialPhases.indexOf('brand')+1)){
  saved.set(phase,{...saved.get(phase),packet:undefined});
 }
 assert.deepEqual((await run('sector_sources')).managedPlan.needs,[orderedNeed]);
 assert.deepEqual(reads,[brief.website,about]);
 assert.deepEqual(calls,['bhs-scoped-brand','bhs-scoped-brand','bhs-scoped-brief','bhs-scoped-plan','bhs-scoped-plan']);
});

for(const recovered of [true,false])test(`an unreadable brand homepage ${recovered?'recovers through targeted search':'leaves unknowns open and still uses the brief'}`,async()=>{
 const saved=new Map(),reads=[],searches=[];
 const alternate='https://marque-group.fr/about',query='Marque official company identity and products';
 const unknown={understanding:'Markanın ürünleri, kurumsal kimliği ve faaliyet pazarı doğrulanmadı.'};
 const orderedNeed={...needs[0],first:'tavily'};
 const providers={collectionFirst:true,managedAudit:true,managedBudgetVersion:14,withCeiling(){return this;},
  async claudeManager(stage,input){
   if(stage==='bhs-scoped-brand'){
    assert.equal(input.card,undefined);
    assert.deepEqual(input.readReceipts[0],{url:brief.website,status:'HTTP_403'});
    if(!input.priorUnderstanding)return {data:{...unknown,pages:[brief.website],searches:[]}};
    if(!input.lookupReceipts.length){
     assert.deepEqual(input.readReceipts.at(-1),{url:brief.website,status:'page_not_read'});
     return {data:{...unknown,pages:[],searches:[{query,tool:'gemini',limit:1}]}};
    }
    assert.deepEqual(input.lookupReceipts[0],{query,tool:'gemini',issue:'provider_unavailable'});
    if(input.lookupReceipts.length===1)return {data:{...unknown,pages:[],searches:[{query,tool:'tavily',limit:2}]}};
    assert.deepEqual(input.sources.map(source=>source.url),recovered?[alternate]:[]);
    return {data:{...(recovered?identity:unknown),pages:[],searches:[]}};
   }
   assert.deepEqual(input.identity,recovered?identity:{...unknown,sourceStatus:'no_readable_sources'});
   if(stage==='bhs-scoped-brief'){
    assert.equal(input.card.goals,brief.goals);
    return {data:briefUnderstanding};
   }
   assert.equal(stage,'bhs-scoped-plan');
   assert.deepEqual(input.briefUnderstanding,briefUnderstanding);
   return {data:{needs:[orderedNeed]}};
  },
  async searchGemini(need){
   assert.equal(need.query,query);
   searches.push('gemini');
   throw new BudgetError('provider_unavailable','Synthetic provider outage');
  },
  async search(value,options){
   assert.equal(value,query);
   assert.equal(options.maxResults,2);
   searches.push('tavily');
   return {results:[{url:brief.website,title:'Marque'},...(recovered?[{url:alternate,title:'Marque Group'}]:[])]};
  }};
 for(const phase of sequentialPhases.slice(0,sequentialPhases.indexOf('sector_sources')+1)){
  saved.set(phase,await runSequentialStage({phase,brief,providers,previous:async name=>saved.get(name),
   collect:async(_brief,_plan,{prioritySources:[url]})=>{
    reads.push(url);
    if(url===brief.website)return {...packet,sources:[],unavailable:[{url,reason:'HTTP_403'}]};
    assert.equal(url,alternate);
    return {...packet,sources:[{...packet.sources[0],url,finalUrl:url}]};
   }}));
 }
 assert.deepEqual(searches,['gemini','tavily']);
 assert.deepEqual(reads,recovered?[brief.website,alternate]:[brief.website]);
 assert.deepEqual(saved.get('sector_sources').managedPlan.needs,[orderedNeed]);
});

test('an undiscovered page is reported to the brand controller once and is never fetched',async()=>{
 const empty={...packet,sources:[]},choice={...identity,pages:['https://unobserved.example/'],searches:[]};
 let choices=0;
 const providers={managedBudgetVersion:14,async manager(_stage,input){
  choices++;
  assert.deepEqual(input.readReceipts.at(-1),{url:choice.pages[0],status:'page_not_read'});
  return {data:choice};
 }};
 const discover=prior=>understandScopedBrand({brief,packet:empty,providers,prior,readPages:()=>assert.fail('Unobserved URL')});
 const corrected=await discover({value:choice});
 assert.equal(corrected.done,false);
 assert.equal((await discover(corrected)).done,true);
 assert.equal(choices,1);
});

test('ordered research runs one exact command, then returns the evidence to the controller before its next choice',async()=>{
 const plan={orderedResearch:true,reportOnlyAfterResearch:true,needs:[{...needs[0],first:'tavily'},needs[1]]};
 const requests=[],query='distributeurs indépendants alimentation bio France';
 const first={id:needs[0].id,tool:'tavily',query,url:'',mode:'default',limit:3};
 const second={id:needs[1].id,tool:'gemini',query:needs[1].query,url:'',mode:'default',limit:2};
 const providers={managedBudgetVersion:12,modelHandoff:true,
  manager:async(stage,input,schema)=>{
   assert.equal(stage,'bhs-scoped-review');
   assert.equal(schema.properties.commands.maxItems,1);
   if(!input.previous.length)return {data:draft({commands:[first,second]})};
   assert.deepEqual(requests.map(r=>r[0]),['tavily','worker']);
   assert.equal(input.previous[0].query,query);
   assert.ok(input.findings.some(f=>f.quote===quote));
   return {data:draft({commands:[second]})};
  },
  search:async(q,o)=>{requests.push(['tavily',q,o.maxResults,o.countryCode]);return {results:[{url:about,title:'Marque',content:quote}]};},
  searchGemini:async(need)=>{requests.push(['gemini',need.query,need.quantity,need.since]);return {results:[{url:post,title:'Post',content:postQuote}]};},
  geminiWorker:async()=>assert.fail('evidence extraction must be able to hand off to Claude'),
  worker:async(stage,input)=>{requests.push(['worker',stage,input.requests.length]);return {data:{results:[]}};}
 };
 const args={identity,briefUnderstanding,plan,providers,brief,packet,readPages:async()=>({sources:[]})};
 const one=await reviewScopedResearch({...args,rounds:[]});
 assert.equal(one.receipts.length,1);
 const two=await reviewScopedResearch({...args,rounds:[one]});
 assert.equal(two.receipts.length,1);
 assert.deepEqual(requests,[['tavily',query,3,'FR'],['worker','bhs-scoped-extract',1],['gemini',needs[1].query,2,needs[1].since],['worker','bhs-scoped-extract',1]]);
});

test('an unavailable brief or twice-empty plan never commits the start of research',async()=>{
 let calls=0;
 const providers={collectionFirst:true,managedAudit:true,managedBudgetVersion:12,claudeManager:async()=>{
  calls++;
  return {data:{needs:[]}};
 }};
 for(const understanding of [undefined,briefUnderstanding]){
  const brand={collectionFirst:true,decision:'accepted',packet,brandUnderstanding:identity,briefUnderstanding:understanding};
  await assert.rejects(runSequentialStage({phase:'sector_sources',brief,providers,previous:async()=>brand}),{code:'research_start_unavailable',
   researchPlanIssue:understanding?'research_plan_empty':'brief_understanding_unavailable'});
 }
 assert.equal(calls,2);
});

test('Instagram receives the requested date and sample size',()=>{
 const selected=actorInput({actor:'apify/instagram-scraper',url:instagram,since:'2026-10-16',maxResults:10},
  {brief,packet,searches:[{results:[{url:instagram}]}]});
 assert.equal(selected.input.onlyPostsNewerThan,'2026-10-16');
 assert.equal(selected.input.resultsLimit,10);
 assert.throws(()=>actorInput({actor:'apify/instagram-scraper',url:instagram,since:'2026-10-16',maxResults:15,exactScope:true},
  {brief,packet,searches:[{results:[{url:instagram}]}]}),{code:'actor_scope_unsupported'});
});

test('an explicit gap run reuses completed research and dispatches only a new task in the requested section',async()=>{
 const existing=[['readiness','Marque has a French wholesale catalogue.',null,null]];
 const newNeed={...needs[0],id:'regional',first:'tavily',query:'grossistes régionaux catalogue alimentaire Marque France'};
 const repeated={...needs[0],id:'duplicate'};
 const outOfScope={...needs[1],id:'other',query:'Different Instagram account'};
 const calls=[];
 const providers={claudeManager:async(_,input)=>{
  assert.deepEqual(input.existing,existing);
  assert.deepEqual(input.eligibleSections,['readiness']);
  return {data:draft({newNeeds:[repeated,newNeed,outOfScope]})};
 },search:async query=>{
  calls.push(query);
  return {results:[]};
 }};
 const plan={needs};
 const saved={approved:true,decisions:[],receipts:[]};
 const round=await reviewScopedResearch({identity,briefUnderstanding,plan,rounds:[saved],providers,brief,packet,
  readPages:async()=>({sources:[]}),eligibleSections:['readiness'],existing,gap:true});
 assert.deepEqual(calls,[newNeed.query]);
 assert.deepEqual(round.newNeeds,[newNeed]);
 assert.equal(scopedEvidence({packet},plan,[saved,round]).approved,false);
});

test('a provider outage allows the configured Gemini handoff to write from the existing evidence',async()=>{
 const synthesis=await writeScopedSynthesis({brief,brand:{packet,facts:[],brandUnderstanding:identity,briefUnderstanding},plan:{needs,scopedResearch:true},rounds:[],
  providers:{modelHandoff:true,claudeManager:async()=>assert.fail('single-provider route bypasses handoff'),manager:async(stage,input)=>{
   assert.equal(stage,'bhs-scoped-report');
   assert.equal(input.approved,false);
   assert.ok(Object.values(input.sources).some(source=>source[0]===brief.website));
   return {model:'gemini-3.8-flash',providerHandoff:{from:'claude',to:'gemini'},data:{findings:[],questions:['Son satış kanalının verisi paylaşılabilir mi?']}};
  }}});
 assert.equal(synthesis.supervision.reportModel,'gemini-3.8-flash');
 assert.deepEqual(synthesis.supervision.reportHandoff,{from:'claude',to:'gemini'});
 assert.equal(synthesis.report.meetingQuestions[0].question,'Son satış kanalının verisi paylaşılabilir mi?');
});

test('an affordable open need prevents approval and uses Claude’s saved focused query when the controller gives no command',async()=>{
 const plan={needs:[needs[0]],reportOnlyAfterResearch:true};
 const searched=[];
 const providers={claudeManager:async(_,input)=>{
  assert.match(input.instruction,/araştırma çağrısı bütçeye sığıyorsa yazıma geçme/);
  return {data:draft({approve:true})};
 },researchCapacity:async()=>({remainingKurus:100,defaults:['tavily'],configuredDefaults:['tavily'],actors:[]}),
 search:async(query,options)=>{searched.push([query,options.maxResults]);return {results:[]};}};
 const execution={identity,briefUnderstanding,plan,providers,brief,packet,readPages:async()=>({sources:[]})};
 const first=await reviewScopedResearch({...execution,rounds:[]});
 assert.equal(first.approved,false);
 assert.equal(first.closed,false);
 assert.deepEqual(searched,[[needs[0].query,10]]);
 const duplicate=await reviewScopedResearch({...execution,rounds:[first]});
 assert.equal(duplicate.closed,false);
 assert.equal(searched.length,1);
});

test('an unaffordable controller does not close research while a focused provider call fits',async()=>{
 const plan={needs:[needs[0]],reportOnlyAfterResearch:true};
 const providers={claudeManager:async()=>{throw new BudgetError('budget_limit','model reservation');},
  researchCapacity:async()=>({remainingKurus:62,defaults:['tavily'],configuredDefaults:['tavily','gemini'],actors:[]}),
  search:async()=>({results:[]})};
 const round=await reviewScopedResearch({identity,briefUnderstanding,plan,rounds:[],providers,brief,packet,readPages:async()=>({sources:[]})});
 assert.equal(round.closed,false);
 assert.equal(round.receipts[0].attempts[0].tool,'tavily');
});

test('synthesis accepts an incomplete report only after the research budget closes',async()=>{
 const plan={needs:[{...needs[0],first:'tavily'}],scopedResearch:true,adaptiveResearch:true,reportOnlyAfterResearch:true,orderedResearch:true};
 const facts=[{id:'q-one',item:'Wholesale',url:about,quote,title:'Marque',method:'extracted'}];
 const receipts=[{id:needs[0].id,facts,attempts:[],urls:[about]}];
 const approvedEvidence={receipts,decisions:[{id:needs[0].id,sufficient:true,proofs:['q-one']}]};
 const partialEvidence={receipts,decisions:[{id:needs[0].id,sufficient:false,proofs:['q-one']}]};
 let written=0;
 const providers={claudeManager:async(stage,input)=>{
  if(stage==='bhs-scoped-review')return {data:draft({})};
  written++;
  assert.equal(stage,'bhs-scoped-report');
  assert.equal(input.coverage[0].status,'open');
  assert.equal(input.stopReason,'research_budget_exhausted');
  assert.ok(Object.values(input.sources).some(source=>source[0]===about));
  return {model:'claude-sonnet-5-5',data:{findings:[],questions:[]}};
 },researchCapacity:async()=>({remainingKurus:61,defaults:[],configuredDefaults:['tavily','gemini'],actors:[]})};
 const args={brief,brand:{packet,facts:[],brandUnderstanding:identity,briefUnderstanding},plan,providers};
 await assert.rejects(writeScopedSynthesis({...args,rounds:[{closed:true,issue:'no_executable_research_command'}]}),{code:'research_needs_open'});
 await assert.rejects(writeScopedSynthesis({...args,rounds:[approvedEvidence]}),{code:'research_needs_open'});
 assert.equal(written,0);
 const round=await reviewScopedResearch({identity,briefUnderstanding,plan,rounds:[],providers,brief,packet,readPages:async()=>({sources:[]})});
 assert.equal(round.closed,true);
 assert.equal(round.stopReason,'research_budget_exhausted');
 await writeScopedSynthesis({...args,rounds:[partialEvidence,round]});
 assert.equal(written,1);
});

test('research affordability uses the actual Tavily reservation and the research ceiling',async()=>{
 const reservation=reserveStageQuote(quoteSearch('basic'));
 let chargedKurus=3000-reservation;
 const ledger={status:async()=>({capKurus:5000,chargedKurus})};
 const providers=createSequentialProviders({ledger,phase:'report_draft',phaseLimitKurus:3000,
  geminiKey:'test-gemini',tavilyKey:'test-tavily',apify:{availableActors:async()=>[]},
  fetchImpl:async()=>assert.fail('affordability must not start a provider call')});
 assert.deepEqual((await providers.researchCapacity()).defaults,['tavily']);
 chargedKurus++;
 assert.deepEqual((await providers.researchCapacity()).defaults,[]);
});
