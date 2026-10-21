import test from 'node:test';
import assert from 'node:assert/strict';
import {researchUrl,researchHost} from '../src/bhs/research-url.mjs';
import {parseSourcePlan} from '../src/bhs/source-plan.mjs';
import {prepareResearchInput} from '../src/bhs/research-input.mjs';
import {createEvidenceCollector} from '../src/bhs/evidence.mjs';
import {runBoundedStage,stageKey,followupQueries} from '../src/bhs/direct-research.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {resolveTarget} from '../src/network.mjs';
import {brief as raw} from './fixtures/bhs.mjs';
import {plan as fixture} from './fixtures/evidence.mjs';

const brief=snapshotBrief({...raw,brandName:'Multi Management Turkey',website:'https://multi.eu/tr/'});
function incidentPlan(){
 const plan=structuredClone(fixture);
 const addresses=['multi.eu/tr/','ece.com/tr/','cefic.com.tr','jll.com.tr'];
 const names=['Multi Management Turkey','ECE Türkiye','Cefic Turkey','JLL Turkey'];
 plan.entities.forEach((e,i)=>{e.name=names[i];e.website=addresses[i];});
 plan.sources=addresses.map(url=>({url,purpose:'Official company and product information'}));
 return plan;
}
function cached(plan,version){
 const value={plan,searches:[]},rows=new Map([[stageKey(brief,'source_plan',version),{state:'complete',value}]]);
 return {value,ledger:{get:async key=>rows.get(key),once:async(key,_input,amount,run)=>{
  assert.equal(amount,0);if(rows.get(key)?.state==='complete')return rows.get(key).value;
  const result=await run();rows.set(key,{state:'complete',value:result});return result;
 }}};
}
const page=()=>({status:200,headers:{'content-type':'text/html'},body:Buffer.from('<main>'+('Official products, delivery terms, customer support and company information. '.repeat(25))+'</main>')});

test('research addresses accept bare, www, HTTP and HTTPS forms without changing paths or query values',()=>{
 for(const input of ['x.com','https://x.com',' https://x.com/ '])assert.equal(researchUrl(input),'https://x.com/');
 assert.equal(researchUrl('www.x.com/path?A=One%20Two'),'https://www.x.com/path?A=One%20Two');
 assert.equal(researchUrl('//multi.eu/tr/'),'https://multi.eu/tr/');
 assert.equal(researchUrl('http://multi.eu/tr/'),'http://multi.eu/tr/');
 assert.equal(researchUrl('https://multi.eu/tr/#contact'),'https://multi.eu/tr/');
 assert.equal(researchHost('www.multi.eu/tr/'),'multi.eu');
});

test('unusable addresses cannot turn into invented web destinations or bypass existing public-network checks',async()=>{
 for(const value of [undefined,null,42,'','N/A','not available','/contact','javascript:alert(1)','mailto:info@example.com','file:///etc/passwd','https://user:pass@example.com','https://example.com:8080/','https://bad..example/','https://example.com\\@evil.example/']){
  assert.equal(researchUrl(value),'',String(value));assert.equal(researchHost(value),'',String(value));
 }
 await assert.rejects(resolveTarget(researchUrl('127.0.0.1')),/herkese açık değil/);
 await assert.rejects(resolveTarget(researchUrl('metadata.google.internal')),/kullanılamaz/);
});

test('source planning normalizes model output without mutating the paid original or changing entity scope',()=>{
 const plan=incidentPlan(),before=structuredClone(plan),normalized=parseSourcePlan(plan);
 assert.deepEqual(plan,before);
 assert.deepEqual(normalized.entities.map(e=>e.website),['https://multi.eu/tr/','https://ece.com/tr/','https://cefic.com.tr/','https://jll.com.tr/']);
 assert.deepEqual(normalized.sources.map(s=>s.url),normalized.entities.map(e=>e.website));
 assert.deepEqual(normalized.entities.map(({website,...e})=>e),plan.entities.map(({website,...e})=>e));
 assert.deepEqual(parseSourcePlan(normalized),normalized);
});

test('historical packet filtering survives the exact incident addresses and an unusable entity without admitting unrelated sources',()=>{
 const plan=incidentPlan();plan.entities[2].website='N/A';
 const sources=[{id:'brand',url:brief.website},{id:'peer',url:'https://ece.com/tr/'},{id:'named-peer',url:'https://publisher.example/cefic',title:'Cefic Turkey market report'},{id:'unrelated',url:'https://unrelated.example/'},{id:'invalid',url:'N/A',title:'Cefic Turkey'}];
 const evidence={packet:{entities:plan.entities,sources},searches:[]},before=structuredClone(evidence);
 assert.deepEqual(prepareResearchInput(brief,evidence).packet.sources.map(s=>s.id),['brand','peer','named-peer']);
 assert.deepEqual(evidence,before);
 assert.ok(followupQueries(brief,plan).some(q=>q.includes('"Cefic Turkey"')));
 assert.ok(!followupQueries(brief,plan).some(q=>q.includes('site:N/A')));
});

for(const version of ['v3','v4','v5'])test(`cached ${version} source plan reaches evidence with the incident URLs and no repeated planner call`,async()=>{
 const plan=incidentPlan(),before=structuredClone(plan),{value,ledger}=cached(plan,version),reads=[],extractions=[];let searches=0;
 const result=await runBoundedStage({phase:'evidence',brief,ledger,researchVersion:version,
  collect:createEvidenceCollector({read:async url=>{reads.push(url);return page();},render:()=>assert.fail('no browser needed'),maxSources:4}),
  providers:{generate:()=>assert.fail('no repeated paid plan'),search:async query=>{searches++;return {query,results:[]};},extract:async urls=>{extractions.push(urls);return {pages:[]};}}
 });
 assert.equal(result.packet.sources.length,4);
 assert.deepEqual(new Set(reads),new Set(['https://multi.eu/tr/','https://ece.com/tr/','https://cefic.com.tr/','https://jll.com.tr/']));
 assert.equal(searches,version==='v3'?6:12);assert.equal(extractions.length,version==='v3'?0:1);
 if(extractions.length)assert.deepEqual(extractions[0],reads);
 assert.deepEqual(value.plan,before);assert.deepEqual(plan,before);
 assert.equal(prepareResearchInput(brief,result).packet.sources.length,4);
});

test('a genuinely unusable competitor address is skipped individually while all remaining evidence is retained',async()=>{
 const plan=incidentPlan();plan.entities[1].website='N/A';plan.sources[1].url='javascript:alert(1)';
 const {ledger}=cached(plan,'v5'),reads=[],extractions=[];
 const result=await runBoundedStage({phase:'evidence',brief,ledger,researchVersion:'v5',
  collect:createEvidenceCollector({read:async url=>{reads.push(url);return page();},maxSources:4}),
  providers:{generate:()=>assert.fail('no recovery model'),search:async query=>({query,results:[]}),extract:async urls=>{extractions.push(urls);return {pages:[]};}}
 });
 assert.equal(result.packet.entities.length,4);assert.equal(result.packet.entities[1].website,'N/A');
 assert.equal(result.packet.sources.length,3);assert.equal(reads.length,3);
 assert.deepEqual(extractions[0],['https://multi.eu/tr/','https://cefic.com.tr/','https://jll.com.tr/']);
 assert.equal(result.packet.unavailable.length,0);
});
