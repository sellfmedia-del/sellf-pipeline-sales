import test from 'node:test';
import assert from 'node:assert/strict';
import {selectProposalAudit} from '../src/proposal/audit-selection.mjs';
const row=(id,extra={})=>({id,dimension:'digital',priority:'high',statement:'Bulgu '+id,impact:'Hedefle bağlantılı mevcut etki.',sourceIds:['s1'],...extra});
test('presentation prioritizes critical and chosen-scope findings beyond input order without changing the research',()=>{
 const findings=Array.from({length:18},(_,i)=>row('f'+i,{dimension:'dim'+i,priority:['high','medium','low'][i%3]}));
 const audit={findings,summary:'Araştırma özeti.',criticalOpportunityFindingId:'f15',criticalRiskFindingId:'f12',rawReport:'PRIVATE FULL REPORT',benchmarks:[{internal:true}],meetingQuestions:[{internal:true}],sources:[{id:'s1',title:'Kaynak',url:'https://example.com',quote:'Internal excerpt'}],dimensions:[],scoring:{total:64,weights:['internal']}};
 const before=structuredClone(audit),out=selectProposalAudit(audit,{goals:'Bayi büyümesi'},{scope:{selected:[{findingIds:['f16']}]}});
 assert.ok(out.findings.some(f=>f.id==='f15'));assert.ok(out.findings.some(f=>f.id==='f12'));assert.ok(out.findings.some(f=>f.id==='f16'));
 assert.ok(out.findings.length>6);
 assert.equal(out.rawReport,undefined);assert.equal(out.benchmarks,undefined);assert.equal(out.meetingQuestions,undefined);assert.equal(out.sources[0].quote,undefined);assert.deepEqual(out.scoring,{total:64});assert.deepEqual(audit,before);
});
test('long report text is bounded, deduplicated and remains a visible excerpt; missing optional data does not block assembly',()=>{
 const statement=('Bu cümle mevcut araştırmanın önemli bir çıkarımını içeriyor. ').repeat(80);
 const audit={findings:[row('first',{statement}),row('duplicate',{statement}),row('other',{priority:'medium',statement:'İkinci temel çıkarım.'})],summary:statement,dimensions:[{id:'digital',score:null,dataStatus:'insufficient',rationale:statement,strengths:[statement]}]};
 const out=selectProposalAudit(audit);
 assert.equal(out.findings.length,1);assert.ok(out.findings.every(f=>f.statement.length<=160&&f.impact.length<=200));assert.ok(out.summary.length<=240);assert.ok(out.dimensions[0].rationale.length<=220);assert.equal(out.dimensions[0].score,null);assert.equal(out.dimensions[0].strengths,undefined);
 assert.deepEqual(selectProposalAudit({}).findings,[]);assert.deepEqual(selectProposalAudit({findings:[null]}).sources,[]);
});
test('brief relevance breaks ties without producing new statements or changing priorities or scores',()=>{
 const audit={findings:[row('irrelevant',{statement:'Farklı bir mevcut bulgu.'}),row('related',{statement:'Bayi ağı büyümesi hedefi için mevcut kanal.',goalConnection:'Bayi ağı büyümesi'}),row('unrelated',{statement:'Diğer mevcut bulgu.'})],dimensions:[{id:'digital',score:72,dataStatus:'partial',rationale:'Mevcut değerlendirme.'}],scoring:{total:72}};
 const out=selectProposalAudit(audit,{goals:'Bayi ağı büyümesi'});
 assert.equal(out.findings[0].id,'related');assert.equal(out.findings[0].statement,audit.findings[1].statement);assert.equal(out.findings[0].priority,'high');assert.equal(out.scoring.total,72);assert.equal(out.dimensions[0].score,72);
});

test('methodology headings and relevant fields have no artificial six-finding cap',()=>{
 const dimensions=['financial','operations','digital','perception','brand','market'];
 const findings=dimensions.flatMap(d=>Array.from({length:9},(_,i)=>row(d+i,{dimension:d,statement:d+' araştırma bulgusu '+i})));
 const out=selectProposalAudit({findings,dimensions:dimensions.map(id=>({id,rationale:'Mevcut gerekçe.',strengths:[],gaps:[]}))});
 assert.equal(out.dimensions.length,dimensions.length);assert.equal(out.findings.length,54);for(const d of out.dimensions){assert.equal(d.highlights.length,9);assert.equal(out.findings.filter(f=>f.dimension===d.id).length,9);}
});
