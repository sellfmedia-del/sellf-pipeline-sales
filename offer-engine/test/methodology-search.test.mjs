import test from 'node:test';
import assert from 'node:assert/strict';
import {methodologySearchQueries,groupedMethodologyQueries} from '../src/bhs/methodology-search.mjs';
import {methodologyAreas} from '../src/bhs/methodology-areas.mjs';
import {plan,context} from './fixtures/evidence.mjs';
import {brief} from './fixtures/bhs.mjs';
import {quoteSearch} from '../src/budget/ledger.mjs';
import {stageKey,runBoundedStage} from '../src/bhs/direct-research.mjs';
import {snapshotBrief} from '../src/bhs/brief.mjs';

test('every methodology area gets a targeted query; the first page-reading candidates span all six dimensions',()=>{
 const queries=methodologySearchQueries(brief,plan);assert.equal(queries.length,24);assert.equal(new Set(queries.map(q=>q.key)).size,24);assert.equal(new Set(queries.map(q=>q.query)).size,24);assert.deepEqual(new Set(queries.map(q=>q.key)),new Set(methodologyAreas.map(a=>a.key)));assert.equal(new Set(queries.slice(0,6).map(q=>q.dimension)).size,6);
 assert.ok(queries.every(q=>q.query.length<=500));assert.match(queries.find(q=>q.key==='digital_4').query,/Instagram.*followers/);assert.match(queries.find(q=>q.key==='digital_5').query,/Meta Ad Library/);
 const local=methodologySearchQueries({...brief,website:'https://marka.com.tr'},plan);assert.match(local.find(q=>q.key==='perception_2').query,/şikayet/);
 // More specific discovery queries, same conservative credit allowance. Full
 // source pages and advanced extraction are still read before Pro analysis.
 assert.equal(2*quoteSearch()+24*quoteSearch('basic'),14*quoteSearch());assert.throws(()=>quoteSearch('auto'));
});
test('new BHS research actually searches every area in bounded batches and reads the results, without a review loop',async()=>{
 const normalizedBrief=snapshotBrief(brief),{packet}=context(),rows=new Map([[stageKey(normalizedBrief,'source_plan','v5'),{state:'complete',value:{plan,searches:[]}}]]);let active=0,maxActive=0;const searched=[];
 const ledger={get:async k=>rows.get(k),once:async(_k,_input,amount,run)=>{assert.equal(amount,0);return run();}};
 const providers={search:async(query,options)=>{assert.equal(options.depth,'basic');assert.equal(options.maxResults,12);active++;maxActive=Math.max(maxActive,active);searched.push(query);const index=searched.length;await new Promise(r=>setImmediate(r));active--;return {query,results:[{url:'https://source.example/'+index,title:'Brand result',content:'Test Brand source evidence'}]};},extract:async()=>({pages:[]}),generate:()=>assert.fail('evidence stage must not run a review model')};
 const result=await runBoundedStage({phase:'evidence',brief:normalizedBrief,ledger,providers,researchVersion:'v5',collect:async(_brief,_plan,options)=>{assert.ok(options.extraSources.length>=4);return packet;}});assert.equal(searched.length,12);assert.equal(result.searchCount,12);assert.ok(maxActive<=6);assert.ok(result.packet.sources.length);
});
test('grouped searches retain all 24 distinct areas and the same 144 candidate slots with half the discovery credits',()=>{
 const groups=groupedMethodologyQueries(brief,plan);assert.equal(groups.length,12);assert.deepEqual(new Set(groups.flatMap(g=>g.keys)),new Set(methodologyAreas.map(a=>a.key)));assert.equal(groups.flatMap(g=>g.keys).length,24);assert.equal(groups.length*12,24*6);assert.ok(groups.every(g=>g.query.length<=500));assert.equal(new Set(groups.slice(0,6).flatMap(g=>g.areas.map(a=>a.dimension))).size,6);
});
