import assert from 'node:assert/strict';
import test from 'node:test';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {statisticalNeedSupported,statisticalScopeInstruction,statisticalScopeIssue} from '../src/bhs/statistical-scope.mjs';
import {customerFinding,qualifyScopedFinding} from '../src/bhs/scoped-findings.mjs';
import {scopedEvidence} from '../src/bhs/scoped-research.mjs';
import {writeScopedSynthesis} from '../src/bhs/collection-first.mjs';
import {selectProposalAudit} from '../src/proposal/audit-selection.mjs';
import {groundOfferReport} from '../src/bhs/source-gate.mjs';

// Synthetic wording/layout. Value and source population mirror the DfE
// 2024/25 release, not a live provider response or a new market estimate:
// https://explore-education-statistics.service.gov.uk/find-statistics/special-educational-needs-in-england/2024-25
const quote='In England in 2025, 18.8% of pupils in state-funded nursery schools receive an EHC plan or SEN support.';
const source={id:'stat',url:'https://statistics.example/nursery',title:'School Census',quote,method:'html',retrievedAt:'2026-11-19'};
const correct="2025'te İngiltere'de devlet destekli anaokullarındaki öğrencilerin %18,8'i EHC planı veya SEN desteği kapsamında.";
const english='In England in 2025, 18.8% of pupils in state-funded nursery schools receive SEN support or an EHC plan.';
const issue=(value,cards=[source],options={})=>statisticalScopeIssue(value,cards,options);
const brief=snapshotBrief({brandName:'Example Nursery Supply',website:'https://brand.example/',segment:'corporate',
 goals:'Build a UK private nursery pilot.',services:'B2B',needs:'Understand nursery needs and buying behavior.',meetingNotes:''});
const need={id:'needs',section:'market_context',target:'Private nursery pupils',market:'United Kingdom',metric:'Pupil SEN support rate',
 expected:'The need indicator for private nursery pupils.',period:'2025',quantity:1,query:'UK private nursery pupil SEN support rate',
 country:'GB',language:'en',first:'tavily',since:''};
function fixture(){
 const receipt={id:need.id,urls:[source.url],facts:[source]};
 return {brief,brand:{packet:{version:'sellf-evidence-v1',asOf:'2026-11-19',entities:[{id:'brand',role:'brand',name:brief.brandName,website:brief.website}],sources:[]},facts:[],
  brandUnderstanding:{understanding:'A supplier to UK nurseries.'},briefUnderstanding:{understanding:brief.goals}},
  plan:{needs:[need],scopedResearch:true,adaptiveResearch:true,orderedResearch:true,qualityReport:true,verifiedResults:true,
   readEvidenceOnly:true,targetedEvidence:true,taskReporting:true,qualifyReportFindings:true,sectionedSynthesis:true,
   boundedReportParts:true,reportRecovery:true,reportOnlyAfterResearch:true,questionEvidence:true,cleanResearchEvidence:true,preserveStatisticalScope:true},
  rounds:[{closed:true,stopReason:'research_budget_exhausted',receipts:[receipt],
   decisions:[{id:need.id,sufficient:true,proofs:[source.id],answerFit:{status:'direct',reason:'The school statistic was read.'}}]}]};
}
const row=(observation=correct)=>({section:'market_context',area:'',rank:1,quadrant:'none',peerId:'',kind:'observation',needIds:[need.id],observation,
 analysis:'This education need indicator can inform a nursery pilot hypothesis.',action:'Test buyer priorities with a small nursery pilot.',
 measurement:'Qualified nursery quote requests recorded in the CRM.',limitation:'Private nursery purchasing has not been measured.',question:''});
function memory(observation=correct){
 const saved=new Map();let calls=0;
 return {saved,get calls(){return calls;},readCheckpoint:async(name,key)=>saved.get(name+JSON.stringify(key)),
  checkpoint:async(name,key,run)=>{const value=await run();saved.set(name+JSON.stringify(key),value);return value;},
  manager:async(_stage,input,_schema,options)=>{
   calls++;assert.ok(input.instruction.includes(statisticalScopeInstruction));assert.ok(options.maxOutputTokens<=2200);
   const proof=Object.keys(input.sources).find(id=>input.sources[id].at(-1).includes('18.8%'));
   return {model:'offline',data:{findings:Array.isArray(input.scope)?[{...row(observation),proof:[proof]}]:[],benchmarks:[],questions:[],hasMore:false}};
  }};
}

test('the same value remains valid with its pupil denominator, institution, geography and year in either report language',()=>{
 assert.equal(issue(correct),undefined);assert.equal(issue(english),undefined);
 assert.equal(issue(english.replace('18.8%','18.80%')),undefined);
});

test('state-funded pupil prevalence cannot become private nursery prevalence or a share of institutions',()=>{
 for(const text of [english.replace('state-funded','private'),english.replace('pupils in state-funded nursery schools','state-funded nursery schools'),
  correct.replace('öğrencilerin','kurumların'),english.replace('state-funded ',''),english.replace('nursery','primary')])
  assert.equal(issue(text),'statistical_scope_unconfirmed',text);
});

test('England cannot become the whole UK and another paper cannot supply the missing scope',()=>{
 assert.equal(issue(english.replace('England','the United Kingdom')),'statistical_scope_unconfirmed');
 const other={...source,url:'https://other.example/study',quote:'In the United Kingdom in 2024, 18.8% of private nursery schools recorded a new enquiry.'};
 assert.equal(issue('In the United Kingdom in 2025, 18.8% of pupils in private nursery schools receive SEN support.',[source,other]),'statistical_scope_unconfirmed');
 assert.equal(issue(english.replace('England','the United Kingdom'),[source,{...other,method:'search-snippet'}]),'statistical_scope_unconfirmed');
});

test('scope vocabulary also protects patients at private French clinics, without any brand or percentage special case',()=>{
 const clinical={method:'pdf',quote:'In France in 2023, 29.6% of patients in private clinics reported unmet support needs.'};
 const valid="2023'te Fransa'daki özel kliniklerde hastaların %29,6'sı destek ihtiyacı bildirdi.";
 assert.equal(issue(valid,[clinical]),undefined);
 assert.equal(issue(valid.replace('Fransa','Almanya'),[clinical]),'statistical_scope_unconfirmed');
 assert.equal(issue(valid.replace('özel','devlet destekli'),[clinical]),'statistical_scope_unconfirmed');
 assert.equal(issue(valid.replace('hastaların','kurumların'),[clinical]),'statistical_scope_unconfirmed');
});

test('an academic data period cannot be replaced by a publication, access or current year',()=>{
 const academic={...source,title:'Published 2026',quote:quote.replace('2025','2024/25')};
 assert.equal(issue(english.replace('2025','2024/25'),[academic]),undefined);
 assert.equal(issue(english.replace('2025','2024/2025'),[academic]),undefined);
 for(const value of [english.replace('2025','2026'),english.replace('in 2025, ',''),english])
  assert.equal(issue(value,[academic]),'statistical_scope_unconfirmed');
 const undated={...academic,quote:quote.replace(' in 2025','')};
 assert.equal(issue(english.replace('2025','2026'),[undated]),'statistical_scope_unconfirmed');
});

test('a neighboring rate cannot donate another group, country or year',()=>{
 const mixed={...source,quote:quote+' In the United Kingdom in 2024, 24.1% of pupils in private nursery schools receive SEN support.'};
 assert.equal(issue(english,[mixed]),undefined);
 assert.equal(issue('In the United Kingdom in 2024, 24.1% of pupils in private nursery schools receive SEN support.',[mixed]),undefined);
 assert.equal(issue('In the United Kingdom in 2024, 18.8% of pupils in private nursery schools receive SEN support.',[mixed]),'statistical_scope_unconfirmed');
});

test('an educational need indicator does not establish commercial demand; hypotheses and explicit limitations remain possible',()=>{
 const cards=[source],byId=new Map([[need.id,need]]),base=row();
 assert.ok(qualifyScopedFinding(base,cards,byId,{statisticalScope:true}));
 for(const analysis of ['This proves strong demand for sensory sets.','Bu oran güçlü satın alma talebini gösteriyor.','Bu oran doğrulanmış yüksek talebi gösteriyor.'])
  assert.equal(qualifyScopedFinding({...base,analysis},cards,byId,{statisticalScope:true}),null,analysis);
 for(const analysis of ['A high demand hypothesis could be tested in a nursery pilot.','Yüksek satın alma talebi bir hipotez olarak sınanmalı.','Bu veri satın alma talebini kanıtlamaz.'])
  assert.ok(qualifyScopedFinding({...base,analysis},cards,byId,{statisticalScope:true}),analysis);
});

test('financial discounts and nonstatistical observations retain their existing validation path',()=>{
 assert.equal(issue('A product discount is 18.8%.',[{method:'html',quote:'The product has an 18.8% price discount.'}]),undefined);
 assert.equal(issue('The quote form records room dimensions.'),undefined);
});

test('narrow but useful source data is retained without completing a broader private-UK research task',()=>{
 const args=fixture(),before=structuredClone(args);
 const evidence=scopedEvidence(args.brand,args.plan,args.rounds);
 assert.equal(evidence.coverage[0].status,'open');assert.equal(evidence.coverage[0].researchStatus,'partially_verified');
 assert.equal(evidence.coverage[0].proofs.length,1);assert.deepEqual(args,before);
 const exact={...need,target:'State-funded nursery pupils',market:'England',expected:'The pupil need indicator.'};
 assert.equal(statisticalNeedSupported(exact,[source]),true);
 assert.equal(statisticalNeedSupported({...exact,period:'2026'},[source]),false);
 assert.equal(statisticalNeedSupported({...exact,metric:'Number of nursery schools',expected:'Institution count'},[source]),false);
 const legacy={...args.plan,preserveStatisticalScope:false};
 assert.equal(scopedEvidence(args.brand,legacy,args.rounds).coverage[0].status,'confirmed');
});

test('the controller can use a separate direct answer without letting a narrower statistic block every other proof',()=>{
 const direct={method:'html',quote:'In the United Kingdom in 2025, private nursery managers reported their purchasing approval process.'};
 assert.equal(statisticalNeedSupported(need,[source,direct]),true);
});

test('report pages preserve the scoped finding and an open target question, then restore without a new writer call',async()=>{
 const args=fixture(),providers=memory();
 const result=await writeScopedSynthesis({...args,providers});
 assert.equal(result.report.findings.length,1);assert.equal(result.report.findings[0].statement,correct);
 assert.equal(result.report.verifiedResearch.metrics[0].status,'open');
 assert.ok(result.report.meetingQuestions.some(question=>question.question.includes(need.metric)));
 const count=providers.calls;
 const restored=await writeScopedSynthesis({...args,providers,allowWrite:false});
 assert.deepEqual(restored.report,result.report);assert.equal(providers.calls,count);
 const selected=selectProposalAudit(result.report,brief);
 assert.equal(selected.findings[0].statement,correct);
});

test('a generalized cached statistic is filtered at source verification and proposal projection without changing inputs or prices',async()=>{
 const args=fixture(),result=await writeScopedSynthesis({...args,providers:memory()});
 const cached=structuredClone(result.report),before=structuredClone(result.report);
 cached.findings[0].statement=english.replace('state-funded','private').replace('England','the United Kingdom');
 cached.findings[0].reportExcerpt=cached.findings[0].statement;
 cached.summary=cached.findings[0].statement;
 const prices={alternatives:[{id:'growth',total:12000}]},priceBefore=structuredClone(prices);
 assert.equal(customerFinding(cached.findings[0],cached),false);
 const selected=selectProposalAudit(cached,brief,prices);
 assert.equal(selected.findings.length,0);assert.deepEqual(prices,priceBefore);
 const grounded=groundOfferReport(cached,{packet:result.analysisPacket,brief,scopedFindings:true,preserveQualifiedImpacts:true});
 assert.equal(grounded.findings.length,0);
 assert.ok(grounded.meetingQuestions.some(question=>question.question.includes(need.metric)));
 assert.deepEqual(result.report,before);
});
