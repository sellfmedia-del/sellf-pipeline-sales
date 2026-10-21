import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceExcerpts,sourceLinks} from '../src/bhs/evidence.mjs';
import {followupQueries,balancedSearchUrls} from '../src/bhs/direct-research.mjs';
import {selectProposalAudit} from '../src/proposal/audit-selection.mjs';
import {plan} from './fixtures/evidence.mjs';
import {directReportSchema,directResearchInstruction} from '../src/bhs/direct-report.mjs';
import {researchTopics} from '../src/bhs/research-topics.mjs';
import {prepareResearchInput} from '../src/bhs/research-input.mjs';
import {researchHtmlText} from '../src/bhs/evidence.mjs';

test('source excerpts retain nonfinancial methodology evidence on a long financial-heavy page',()=>{
 const text=('Revenue profit financial growth investment. '.repeat(600))+'\n'+('Customer review rating returns support team shipping subscription checkout. '.repeat(35));
 const excerpts=evidenceExcerpts(text);assert.ok(excerpts.some(e=>e.text.includes('subscription checkout')));assert.ok(excerpts.some(e=>e.text.includes('Revenue profit')));assert.ok(excerpts.length<=7);
 const links=sourceLinks('<a href="/products">Products</a><a href="/shipping">Shipping</a><a href="/subscribe">Subscribe</a><a href="/careers">Careers</a>','https://example.com');assert.equal(links.length,4);
});
test('every peer gets a distinct follow-up and later search topics enter the crawl before repeated early results',()=>{
 const queries=followupQueries({brandName:'Example',website:'https://brand.example/'},plan);assert.equal(queries.length,12);
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

test('irrelevant tool landing pages and other companies cannot crowd out brand research',()=>{
 const brief={brandName:'One More Global Inc.',website:'https://onemoreglobalinc.com/'},sources=[{id:'brand',finalUrl:brief.website,title:'Official brand',excerpts:[{text:'Products and delivery'}]},{id:'unrelated',finalUrl:'https://linkedin.com/jobs/energy',title:'ON.energy logistics jobs',excerpts:[{text:'Logistics role'}]},{id:'tool',finalUrl:'https://similarweb.com/website/',title:'Website Traffic Checker',excerpts:[{text:'Try our generic analytics platform'}]},{id:'news',finalUrl:'https://publisher.example/news',title:'One More Global opens a new market',excerpts:[{text:'Reported brand event'}]}];
 const out=prepareResearchInput(brief,{packet:{entities:[],sources},searches:[{query:'q',results:[{url:'https://generic.example/',title:'Search engine tools',content:'No specific brand data'},{url:'https://publisher.example/social',title:'One More Global Inc. social channels',content:'Brand-specific signals'}]}]});
 assert.deepEqual(out.packet.sources.map(s=>s.id),['brand','news']);assert.equal(out.searchEvidence[0].results.length,1);assert.equal(sources.length,4);
 assert.equal(researchHtmlText('<header>MENU MENU</header><nav>MENU</nav><main><p>Actual product subscription terms</p></main><footer>MENU MENU</footer>'),'Actual product subscription terms');
});
