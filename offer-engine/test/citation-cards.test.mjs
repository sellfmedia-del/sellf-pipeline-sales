import test from 'node:test';
import assert from 'node:assert/strict';
import {citationInput} from '../src/bhs/citation-cards.mjs';
import {groundOfferReport} from '../src/bhs/source-gate.mjs';
import {recoverModelStage} from '../src/budget/model-recovery.mjs';
import {context} from './fixtures/evidence.mjs';
function fixture(){
 const c=context(),url=c.packet.sources[0].url;
 const price='The Mum Planner regular price £39.99. A practical family planner with weekly pages and reusable planning tools.';
 const shipping='For UK orders, parcels are delivered in 2-4 business days. International shipping times vary by destination.';
 c.packet.sources[0]={...c.packet.sources[0],excerpts:[{text:price,offset:0},{text:shipping,offset:price.length+10}]};
 const transport=citationInput({packet:c.packet,searchEvidence:[]}),proof=transport.cards.find(x=>x.url===url&&x.quote.includes('£39.99'));
 const source={id:proof.id,url,quote:shipping,title:'Brand',sourceType:'primary'};
 const finding={...c.report.findings[0],id:'price',kind:'observation',statement:'The Mum Planner fiyatı £39,99 olarak listeleniyor.',reportExcerpt:'The Mum Planner fiyatı £39,99 olarak listeleniyor.',impact:'Fiyat seviyesi görüşmede değerlendirilecek.',goalConnection:'Güncel hizmet kapsamı için doğrulanacak bağlam.',sourceIds:[proof.id]};
 return {c,transport,proof,source,finding,url,price,shipping};
}
test('a selected source proof binds the actual read price; legacy shipping-only citations still cannot support a price',()=>{
 const f=fixture(),report={...f.c.report,sources:[f.source],findings:[f.finding],researchCoverage:[]};
 const packet={...f.c.packet,citationCards:f.transport.cards};
 const got=groundOfferReport(report,{packet});assert.equal(got.findings.length,1);assert.equal(got.sources[0].quote,f.proof.quote);
 assert.equal(groundOfferReport(report,{packet:f.c.packet}).findings.length,0,'legacy quote rules are unchanged');
});
test('known proof IDs restore their exact URL/quote and can be referenced without a model-generated source list',()=>{
 const f=fixture(),raw={...f.c.report,sources:[],findings:[f.finding],researchCoverage:[]},packet={...f.c.packet,citationCards:f.transport.cards};
 const got=groundOfferReport(raw,{packet});assert.equal(got.findings.length,1);assert.equal(got.sources[0].url,f.url);assert.equal(got.sources[0].quote,f.proof.quote);
 raw.sources=[{...f.source,url:'https://invented.example/',quote:'An invented quotation must never become evidence.'}];
 assert.equal(groundOfferReport(raw,{packet}).sources[0].url,f.url);
 raw.sources={malformed:true};assert.equal(groundOfferReport(raw,{packet}).findings.length,1,'trusted references survive malformed source formatting');
});
test('forged cards, invented IDs and conflicting numbers fail the unchanged source and numeric checks',()=>{
 const f=fixture(),fake=citationInput({packet:{...f.c.packet,sources:[{...f.c.packet.sources[0],excerpts:[{text:'An invented price of £999.99 is never present in the actual source packet.'}]}]},searchEvidence:[]}).cards[0];
 const packet={...f.c.packet,citationCards:[...f.transport.cards,fake]},report={...f.c.report,sources:[{...f.source,id:fake.id,quote:fake.quote}],findings:[{...f.finding,sourceIds:[fake.id],statement:'Fiyat £999,99.'}],researchCoverage:[]};
 assert.equal(groundOfferReport(report,{packet}).findings.length,0);
 report.sources=[f.source];report.findings=[{...f.finding,statement:'The Mum Planner fiyatı £49,99 olarak listeleniyor.'}];
 assert.equal(groundOfferReport(report,{packet}).findings.length,0);
 const ship=f.transport.cards.find(c=>c.url===f.url&&c.quote.includes('2-4'));
 report.sources=[{...f.source,id:ship.id,quote:ship.quote}];report.findings=[{...f.finding,sourceIds:[ship.id],statement:'Teslimat 1-3 iş günü sürer.'}];
 assert.equal(groundOfferReport(report,{packet}).findings.length,0);
});
test('visible Markdown label compression stays bound to read text and search proofs remain labelled as snippets',()=>{
 const f=fixture(),text='The Mum Planner [product details](https://brand.example/planner) regular price £39.99. Includes weekly planning tools.';
 const packet={...f.c.packet,sources:[{...f.c.packet.sources[0],excerpts:[{text,offset:0}]}]};
 const transport=citationInput({packet:{...packet,sources:[{...packet.sources[0],excerpts:[{text:text.replace('[product details](https://brand.example/planner)','product details')}]}]},searchEvidence:[]});
 const proof=transport.cards[0],raw={...f.c.report,sources:[],findings:[{...f.finding,sourceIds:[proof.id]}],researchCoverage:[]};
 assert.equal(groundOfferReport(raw,{packet:{...packet,citationCards:transport.cards}}).findings.length,1);
 const search={url:'https://search.example/brand',title:'Partial result',content:f.price};
 const snippet=citationInput({packet:{...f.c.packet,sources:[]},searchEvidence:[{results:[search]}]});
 raw.findings[0].sourceIds=[snippet.cards[0].id];
 const got=groundOfferReport(raw,{packet:{...f.c.packet,sources:[],citationCards:snippet.cards},searchEvidence:[{results:[search]}]});
 assert.equal(got.sources[0].verification.method,'search-snippet');assert.match(got.sources[0].scope,/tam sayfa okunmuş değildir/);
});
test('a useful filtered report is reused immediately with identical content and no paid replacement; sparse projections still get one alternate',async()=>{
 const f=fixture(),base=groundOfferReport({...f.c.report,sources:[{...f.source,quote:f.proof.quote}],findings:[f.finding],researchCoverage:[]},{packet:f.c.packet});
 const data={...base,findings:Array.from({length:4},(_,i)=>({...base.findings[0],id:'verified_'+i}))},safe={data,issues:['source_projection_incomplete']};let calls=0;
 const result=await recoverModelStage(async()=>{calls++;throw Object.assign(Error(),{code:'model_output_invalid',safeResult:safe});},'synthesis',{model:'gemini-3.1-pro-preview'},{wait:()=>assert.fail('no replacement wait')});
 assert.equal(result,safe);assert.equal(calls,1);
 calls=0;const sparse={data:base};await recoverModelStage(async()=>{if(++calls===1)throw Object.assign(Error(),{code:'model_output_invalid',safeResult:sparse});throw Object.assign(Error(),{providerStatus:503});},'synthesis',{model:'gemini-3.1-pro-preview'},{wait:async()=>{}});
 assert.equal(calls,2);
});
