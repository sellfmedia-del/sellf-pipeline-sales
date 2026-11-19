import assert from 'node:assert/strict';
import test from 'node:test';
import {brandPublisherHosts,brandProductSources,retainBrandPublishers} from '../src/bhs/brand-publishers.mjs';
import {comparisonCanStart,comparisonReferenceVerified,qualifyProductPeers} from '../src/bhs/product-comparison.mjs';
import {planScopedResearch,understandScopedBrand,scopedEvidence} from '../src/bhs/scoped-research.mjs';
import {assertSchema} from '../src/bhs/schema.mjs';

const website='https://marque.eu/',alternate='https://marque.com/';
const name='Marque Products s.r.o.',address='Example Street 12, Prague 10000';
const legalQuote=`Site operator: ${name}. Registered office: ${address}.`;
const page=(url,text=legalQuote,extra={})=>({id:url,url,finalUrl:url,method:'html',title:'Marque',
 excerpts:[{text,offset:0}],...extra});
const owner=(url,extra={})=>({website:new URL(url).origin+'/',sourceUrl:url,legalName:name,address,quote:legalQuote,...extra});
const primary=website+'contact',other=alternate+'contact';
const packet=()=>({sources:[page(primary),page(other)]});
const reference={id:'reference',section:'product',comparisonProduct:'Royal set',comparisonRole:'reference',country:'GB'};
const rivals={...reference,id:'rivals',section:'competition',comparisonRole:'rivals'};
const product=alternate+'sets-of-orthopedic-mats/set-of-orthopedic-mats-royal/';
const fact={id:'royal',needId:reference.id,url:product,title:'Set of orthopedic mats ROYAL',method:'html',
 quote:'ROYAL orthopedic mats include 30 pieces for nursery movement and sensory play.'};
const decisions=new Map([[reference.id,{sufficient:true,proofs:[fact.id]}]]);

test('alternate publishers require the same quoted legal operator and address on read sources',()=>{
 const original=packet(),snapshot=structuredClone(original);
 const saved=retainBrandPublishers(original,[owner(primary),owner(other)]);
 assert.deepEqual(original,snapshot);
 assert.deepEqual([...brandPublisherHosts(website,saved)],['marque.eu','marque.com']);
 assert.equal(saved.publisherIdentities.length,2);
 // Repeat checkpoints preserve the evidence without duplicating records.
 assert.equal(retainBrandPublishers(saved,[owner(other)]).publisherIdentities.length,2);
 const unmatched=retainBrandPublishers(original,[owner(primary),owner(other,{address:'Different Street 2, London'})]);
 assert.deepEqual([...brandPublisherHosts(website,unmatched)],['marque.eu']);
 const differentName='Marque Distributor Ltd';
 const distributor=page(other,legalQuote.replace(name,differentName));
 const independent=retainBrandPublishers({sources:[page(primary),distributor]},[owner(primary),
  owner(other,{legalName:differentName,quote:distributor.excerpts[0].text})]);
 assert.deepEqual([...brandPublisherHosts(website,independent)],['marque.eu']);
});

test('search snippets, email similarity and unsupported or transplanted identity claims never verify a host',()=>{
 const cases=[
  {sources:[page(primary),page(other,legalQuote,{method:'search-snippet'})]},
  {sources:[page(primary),page(other,legalQuote,{metadataOnly:true})]},
  {sources:[page(primary),page(other,'Contact store@marque.eu for Marque products.')]},
  {sources:[page(primary),page(other,'Marque is our supplier.')]},
 ];
 for(const p of cases){
  const saved=retainBrandPublishers(p,[owner(primary),owner(other)]);
  assert.deepEqual([...brandPublisherHosts(website,saved)],['marque.eu']);
 }
 const forged={...packet(),publisherIdentities:[owner(primary),owner(other,{sourceUrl:alternate+'invented'})]};
 assert.deepEqual([...brandPublisherHosts(website,forged)],['marque.eu']);
 const accepted=retainBrandPublishers(packet(),[owner(primary),owner(other)]);
 const changed={...accepted,sources:[page(primary),page(other,'Only a cookie notice remains here.')]};
 assert.deepEqual([...brandPublisherHosts(website,changed)],['marque.eu']);
 const manufacturer=`Manufacturer: ${name}. Registered office: ${address}.`;
 const supplier=retainBrandPublishers({sources:[page(primary),page(other,manufacturer)]},
  [owner(primary),owner(other,{quote:manufacturer})]);
 assert.deepEqual([...brandPublisherHosts(website,supplier)],['marque.eu']);
});

test('an official registry must explicitly declare the original website before connecting a matching operator',()=>{
 const registry='https://find-and-update.company-information.service.gov.uk/company/01234567';
 const declared=legalQuote+' Official website: https://marque.eu/';
 const p={sources:[page(registry,declared),page(other)]};
 const saved=retainBrandPublishers(p,[owner(registry,{website,quote:declared}),owner(other)]);
 assert.deepEqual([...brandPublisherHosts(website,saved)],['marque.eu','marque.com']);
 for(const tail of [' Contact: info@marque.eu',' Official website: https://marque.eu.example/']){
  const quote=legalQuote+tail;
  const unconfirmed=retainBrandPublishers({sources:[page(registry,quote),page(other)]},
   [owner(registry,{website,quote}),owner(other)]);
  assert.deepEqual([...brandPublisherHosts(website,unconfirmed)],['marque.eu']);
 }
});

test('actual redirect chains remain official while metadata-only redirect claims do not',()=>{
 const moved='https://marque.example/';
 const p={sources:[page(website,legalQuote,{finalUrl:alternate}),page(alternate,legalQuote,{finalUrl:moved})]};
 assert.deepEqual([...brandPublisherHosts(website,p)],['marque.eu','marque.com','marque.example']);
 assert.deepEqual([...brandPublisherHosts(website,{sources:[page(website,legalQuote,{finalUrl:alternate,metadataOnly:true})]})],['marque.eu']);
 assert.deepEqual([...brandPublisherHosts(website)],['marque.eu']);
});

test('product identity survives reordered product titles on a verified publisher without accepting general pages',()=>{
 const p=retainBrandPublishers(packet(),[owner(primary),owner(other)]);
 const check=(f,need=reference)=>comparisonReferenceVerified(need,[need,rivals],[f],decisions,website,p);
 assert.equal(check(fact),true);
 assert.equal(comparisonCanStart(rivals,[reference,rivals],[fact],decisions,website,p),true);
 assert.equal(check({...fact,url:alternate+'about-muffik/'}),false);
 assert.equal(check({...fact,url:alternate+'en/about.html'}),false);
 assert.equal(check({...fact,url:alternate+'guides/royal-set'}),false);
 assert.equal(check({...fact,url:alternate+'collections/royal/'}),false);
 assert.equal(check({...fact,url:alternate+'en/collections/royal/'}),false);
 assert.equal(check({...fact,method:'search-snippet'}),false);
 assert.equal(check({...fact,metadataOnly:true}),false);
 assert.equal(check(fact,{...reference,comparisonProduct:'Royal Max set'}),false);
 assert.equal(comparisonReferenceVerified(reference,[reference],[fact],decisions,website,packet()),false);
 assert.equal(comparisonReferenceVerified(reference,[reference],[fact],new Map([[reference.id,{sufficient:false,proofs:[fact.id]}]]),website,p),false);
});

test('a verified alternate product page supports comparison while missing fields and own-site rivals stay unverified',()=>{
 const p=retainBrandPublishers(packet(),[owner(primary),owner(other)]);
 const candidate={id:'peer',needId:rivals.id,url:'https://other-brand.example/products/texture',method:'html',
  quote:'Texture Kit is a tactile mat set for nurseries. GBP 180.'};
 const checked=new Map([...decisions,[rivals.id,{sufficient:true,proofs:[candidate.id]}]]);
 const match={referenceProof:fact.id,candidateProof:candidate.id,referenceClass:'orthopedic mats',candidateClass:'tactile mat set',
  referenceFields:[{field:'pieces',value:'30 pieces',proof:fact.id},{field:'price',value:'GBP 240',proof:fact.id}],
  candidateFields:[{field:'price',value:'GBP 180',proof:candidate.id}]};
 const peer={url:candidate.url,product:'Texture Kit',market:'United Kingdom',channel:'Nurseries',relationship:'direct',productMatch:match};
 const own={...peer,url:product,productMatch:{...match,candidateProof:fact.id}};
 const [verified,excluded]=qualifyProductPeers([peer,own],[reference,rivals],[fact,candidate],checked,website,p);
 assert.equal(verified.relationship,'direct');
 assert.equal(verified.verifiedProductMatch.reference.fields.pieces.value,'30 pieces');
 assert.equal(verified.verifiedProductMatch.reference.fields.price,undefined);
 assert.equal(verified.verifiedProductMatch.reference.fields.footprint,undefined);
 assert.equal(verified.verifiedProductMatch.candidate.fields.price.value,'GBP 180');
 assert.equal(excluded.relationship,'candidate');
});

test('brand checkpoints retain quoted publisher identity and the planner receives observed product sources',async()=>{
 const linked=page(other,legalQuote,{technicalSignals:{navigation:[{url:product,label:'ROYAL mat set'},
  {url:'https://retailer.example/products/royal',label:'Retail partner'}]}});
 const current={...packet(),sources:[page(primary),linked]};
 const brief={brandName:'Marque',website,goals:'UK nursery pilot',needs:'Start with Royal set',services:'B2B',meetingNotes:''};
 const snapshot=structuredClone(brief);
 const result=await understandScopedBrand({brief,packet:current,providers:{managedBudgetVersion:24,manager:async(stage,input,contract)=>{
  assert.equal(stage,'bhs-scoped-brand');assert.equal(input.card,undefined);assert.equal(input.brief,undefined);
  assert.match(input.instruction,/sitenin kendi işletmecisiyle karıştırma/);
  const data={understanding:'Marque makes orthopedic mat sets.',pages:[],searches:[],publishers:[owner(primary),owner(other)]};
  assertSchema(data,contract);return {data};
 }}});
 assert.equal(result.done,true);
 const context=brandProductSources(website,result.packet);
 assert.deepEqual(context.find(row=>row.url===other).productLinks,[{url:product,label:'ROYAL mat set'}]);
 assert.equal(context.find(row=>row.url===other).status,'official');
 await planScopedResearch({brief,identity:{understanding:result.value.understanding},briefUnderstanding:{understanding:'UK nursery pilot'},packet:result.packet,
  providers:{managedBudgetVersion:22,manager:async(stage,input)=>{
   assert.equal(stage,'bhs-scoped-plan');assert.deepEqual(input.publisherSources,context);
   assert.match(input.instruction,/ürünün tam adı ve doğrulanmış resmî alan adıyla tek dar arama/);
   return {data:{needs:[{...reference,target:'Royal set',market:'United Kingdom',metric:'Product class and use',
    expected:'The named product on its official product page',query:'site:marque.com "Royal set"',
    period:'',quantity:1,first:'tavily',since:'',language:'en'}]}};
  }}});
 assert.deepEqual(brief,snapshot);
 const failedRead=brandProductSources(website,{sources:[page(other,legalQuote,{method:'search-snippet'})]});
 assert.deepEqual(failedRead,[]);
 assert.equal(brandProductSources(website,current).find(row=>row.url===other).status,'unconfirmed');
});

test('publisher hints stay bounded and historical packets without identity records remain usable',()=>{
 const sources=Array.from({length:24},(_,i)=>page('https://brand'+i+'.example/about'));
 for(const [i,source] of sources.entries())source.technicalSignals={navigation:Array.from({length:30},(_,j)=>({
  url:'https://brand'+i+'.example/products/'+j+'x'.repeat(900),label:'Product '+j}))};
 const hints=brandProductSources(website,{sources,publisherIdentities:{invalid:true}});
 assert.ok(JSON.stringify(hints).length<8100);
 assert.ok(hints.flatMap(row=>row.productLinks).length<=8);
 assert.deepEqual([...brandPublisherHosts(website,{sources:[]})],['marque.eu']);
 assert.deepEqual(brandProductSources(website),[]);
});

test('saved product research keeps a verified alternate as the brand rather than a competitor candidate',()=>{
 const saved=retainBrandPublishers({...packet(),asOf:'2026-11-19',entities:[{id:'brand',role:'brand',website}]},
  [owner(primary),owner(other)]);
 const own={name:'Marque',url:product,product:'Royal set',relationship:'candidate'};
 const result=scopedEvidence({packet:saved},{needs:[{...reference,metric:'Royal product identity'}],
  focusedProductComparison:true,targetedEvidence:true,readEvidenceOnly:true,qualityReport:true},[{peers:[own],
  receipts:[{id:reference.id,facts:[fact],urls:[product]}],decisions:[{id:reference.id,sufficient:true,proofs:[fact.id]}]}]);
 assert.equal(result.coverage[0].status,'confirmed');
 assert.deepEqual(result.competitorCandidates,[]);
 assert.deepEqual(result.packet.entities.map(row=>row.role),['brand']);
 assert.deepEqual([...brandPublisherHosts(website,result.packet)],['marque.eu','marque.com']);
});
