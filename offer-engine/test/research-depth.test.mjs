import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceExcerpts,sourceLinks} from '../src/bhs/evidence.mjs';
import {followupQueries,balancedSearchUrls} from '../src/bhs/direct-research.mjs';
import {selectProposalAudit} from '../src/proposal/audit-selection.mjs';
import {plan} from './fixtures/evidence.mjs';
import {directReportSchema,directResearchInstruction} from '../src/bhs/direct-report.mjs';
import {researchTopics} from '../src/bhs/research-topics.mjs';

test('source excerpts retain nonfinancial methodology evidence on a long financial-heavy page',()=>{
 const text=('Revenue profit financial growth investment. '.repeat(600))+'\n'+('Customer review rating returns support team shipping subscription checkout. '.repeat(35));
 const excerpts=evidenceExcerpts(text);assert.ok(excerpts.some(e=>e.text.includes('subscription checkout')));assert.ok(excerpts.some(e=>e.text.includes('Revenue profit')));assert.ok(excerpts.length<=7);
 const links=sourceLinks('<a href="/products">Products</a><a href="/shipping">Shipping</a><a href="/subscribe">Subscribe</a><a href="/careers">Careers</a>','https://example.com');assert.equal(links.length,4);
});
test('every peer gets a distinct follow-up and later search topics enter the crawl before repeated early results',()=>{
 const queries=followupQueries({brandName:'Example'},plan);assert.equal(queries.length,6);
 for(const e of plan.entities.filter(e=>e.role==='competitor'))assert.ok(queries.some(q=>q.includes('site:'+new URL(e.website).hostname)));
 const urls=balancedSearchUrls([{results:[{url:'https://a.example/first'},{url:'https://a.example/second'}]},{results:[{url:'https://b.example/reviews'}]}]);assert.deepEqual(urls,['https://a.example/first','https://b.example/reviews','https://a.example/second']);
});
test('customer selection keeps independent medium-priority research and benchmark evidence; brief demand cannot outrank research',()=>{
 const findings=[{id:'brief',kind:'brief',dimension:'digital',statement:'We need SEO',priority:'high',sourceIds:[]},...['a','b'].map(id=>({id,kind:'observation',dimension:'digital',statement:'Researched '+id,priority:'medium',sourceIds:['source']}))];
 const out=selectProposalAudit({findings,dimensions:[{id:'digital',strengths:['Strength one','Strength two'],gaps:['Gap one','Gap two']}],sources:[{id:'source',url:'https://example.com'}],competitors:[{id:'peer',name:'Peer'}],benchmarks:[{metric:'differentiator',entries:[{entityId:'brand',value:'Researched feature',sourceIds:['source']},{entityId:'peer',value:null,sourceIds:[]}]}]},{goals:'We need SEO'},{scope:{selected:[{findingIds:['brief']}]}});
 assert.deepEqual(out.findings.map(f=>f.id),['a','b']);assert.equal(out.dimensions[0].highlights.length,6);assert.equal(out.benchmarks[0].entries[1].value,null);assert.equal(out.competitors[0].name,'Peer');assert.equal(out.rawReport,undefined);
});
test('report contract explicitly covers every approved methodology area without introducing a second reviewer',()=>{
 assert.ok(directReportSchema.required.includes('researchCoverage'));const instruction=directResearchInstruction();for(const topics of Object.values(researchTopics))for(const topic of topics)assert.ok(instruction.includes(topic));assert.ok(instruction.includes('markanın o alanda başarısız olduğunu kanıtlamaz'));
});
