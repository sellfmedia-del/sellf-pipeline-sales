import assert from 'node:assert/strict';
import test from 'node:test';
import {gunzipSync} from 'node:zlib';
import {snapshotBrief} from '../src/bhs/brief.mjs';
import {createEvidenceCollector,researchHtmlText} from '../src/bhs/evidence.mjs';
import {readResearchPages,writeScopedSynthesis} from '../src/bhs/collection-first.mjs';
import {runScopedDefaults,scopedEvidence} from '../src/bhs/scoped-research.mjs';
import {customerFinding,qualifyScopedFinding,readableFinding} from '../src/bhs/scoped-findings.mjs';
import {cleanEvidenceText,consentEvidenceRequested,evidenceQualityInstruction,researchGapStatement,substantiveEvidence} from '../src/bhs/research-text.mjs';
import {groundOfferReport} from '../src/bhs/source-gate.mjs';
import {selectProposalAudit} from '../src/proposal/audit-selection.mjs';

const brief=snapshotBrief({brandName:'Example Nursery Supply',website:'https://brand.example/',segment:'corporate',
 goals:'Improve UK nursery quote conversion.',services:'B2B',needs:'Catalogue and quote workflow.',meetingNotes:''});
const entity={id:'brand',role:'brand',name:brief.brandName,website:brief.website,
 scope:'Wholesale nursery supplier.',audienceReason:'Nurseries.',scaleReason:'Not measured.',geographyReason:'United Kingdom.'};
const collectorPlan={entities:[entity],sources:[{url:brief.website,purpose:'Read the public catalogue.'}]};
const cookie='We use cookies to improve your website experience.\nAccept all cookies.\nReject optional cookies.\nCookie settings.';
const quotes=['The supplier provides a wholesale catalogue to registered nursery retailers.',
 'The enquiry form records room dimensions and the intended age group before a quote is issued.'];
const observations=['The brand supplies nursery retailers through its wholesale catalogue.',
 'Enquiries include room dimensions alongside the intended age group.'];
const needs=quotes.map((_,i)=>({id:'n'+i,section:'operations',target:brief.brandName,market:'United Kingdom',
 metric:i?'Quote form fields':'Catalogue access',expected:'The directly read process.',period:'',quantity:1,
 query:'Example Nursery Supply '+(i?'quote form':'wholesale catalogue'),country:'GB',language:'en',first:'tavily',since:''}));
function fixture(){
 const facts=quotes.map((quote,i)=>({id:'fact'+i,url:brief.website+'page-'+i,title:'Process evidence',method:'html',quote}));
 const receipts=facts.map((fact,i)=>({id:needs[i].id,urls:[fact.url],facts:[fact]}));
 return {brief,brand:{packet:{version:'sellf-evidence-v1',asOf:'2026-11-19',entities:[entity],sources:[]},facts:[],
  brandUnderstanding:{understanding:'A supplier to UK nurseries.'},briefUnderstanding:{understanding:brief.goals}},
  plan:{needs,scopedResearch:true,adaptiveResearch:true,orderedResearch:true,qualityReport:true,verifiedResults:true,
   readEvidenceOnly:true,targetedEvidence:true,taskReporting:true,qualifyReportFindings:true,sectionedSynthesis:true,
   boundedReportParts:true,reportRecovery:true,reportOnlyAfterResearch:true,questionEvidence:true,cleanResearchEvidence:true},
  rounds:[{closed:true,stopReason:'research_budget_exhausted',receipts,
   decisions:receipts.map(r=>({id:r.id,sufficient:true,proofs:r.facts.map(f=>f.id),answerFit:{status:'direct',reason:'The process is directly described.'}}))}]};
}
function finding(input,i,observation=observations[i]){
 const proof=Object.entries(input.sources).find(([,row])=>row.at(-1).includes(quotes[i]))?.[0];
 assert.ok(proof);
 return {section:'operations',area:'',rank:i+1,quadrant:'none',peerId:'',kind:'observation',needIds:[needs[i].id],observation,proof:[proof],
  analysis:'This process detail can guide the nursery pilot.',action:'Check the process against a recorded customer journey.',
  measurement:'Quote requests linked to issued quotes in the CRM.',limitation:'Conversion was not measured.',question:''};
}
const empty={findings:[],benchmarks:[],questions:[],hasMore:false};
function memory(writer){
 const saved=new Map();let calls=0;
 return {saved,get calls(){return calls;},readCheckpoint:async(name,key)=>saved.get(name+JSON.stringify(key)),
  checkpoint:async(name,key,run)=>{const value=await run();saved.set(name+JSON.stringify(key),value);return value;},
  manager:async(stage,input,contract,options)=>{calls++;return writer(stage,input,contract,options);}};
}

test('HTML cleanup removes nested consent widgets without swallowing product, company or policy content',()=>{
 const html='<main><div id="onetrust-banner-sdk"><div><p>'+cookie+'</p></div><button>Accept</button></div>'+
  '<h1>Cookie selection box</h1><p>We use cookies to decorate the gift box.</p><p>SKU Biscuit-Blue · £19.99 · VAT included.</p>'+
  '<section id="cookie-policy"><p>The policy explains the company data retention period.</p></section>'+
  '<p>Operator: Example Nursery Supply Limited.</p></main>';
 const text=researchHtmlText(html);
 assert.doesNotMatch(text,/website experience|Accept all|Reject optional/);
 for(const value of ['Cookie selection box','decorate the gift box','£19.99','VAT included','data retention period','Example Nursery Supply Limited'])assert.ok(text.includes(value));
 assert.ok(researchHtmlText(html,{preserveConsent:true}).includes('Accept all'));
 assert.match(researchHtmlText('<script>const fake="<div class=\"cookie-banner\">";</script><main><p>'+quotes[0]+'</p></main>'),/wholesale catalogue/);
 assert.match(researchHtmlText('<div id="cookie-banner"><p>Unclosed widget</p><main><p>'+quotes[1]+'</p></main>'),/room dimensions/);
 assert.equal(researchHtmlText('<div class="CookieConsent"><div>Marketing preferences</div>Accept all</div><p>'+quotes[0]+'</p>'),quotes[0]);
});

test('plain text cleanup preserves a following fact, numerical tables and explicitly requested consent evidence',()=>{
 assert.equal(cleanEvidenceText(cookie+'\n'+quotes[1]),quotes[1]);
 assert.equal(cleanEvidenceText(cookie.replaceAll('\n',' ')+ ' '+quotes[0]),quotes[0]);
 assert.equal(cleanEvidenceText('Royal · 12 pieces · £49.99\nVAT included.'),'Royal · 12 pieces · £49.99\nVAT included.');
 assert.equal(cleanEvidenceText(cookie,{preserveConsent:true}),cookie);
 assert.equal(substantiveEvidence(cookie),false);
 assert.equal(consentEvidenceRequested({metric:'Cookie consent choices'}),true);
 assert.equal(consentEvidenceRequested({name:'Çerez izin ayarları'}),true);
 assert.equal(consentEvidenceRequested({metric:'Cookie gift box ingredients'}),false);
 for(const gap of ['Satış verisi bulunamadı.','Satın alma kanıtı tespit edilemedi.','No evidence of nursery purchasing was found.'])assert.equal(researchGapStatement(gap),true);
 for(const fragment of ['… room sizes.','The nursery catalogue and.','The quote form for.','Room details…'])assert.equal(readableFinding(fragment),false);
});

test('the collector archives original text while its complete research view contains the relevant body',async()=>{
 const checkpoints=[];
 const body='<div id="cookie-banner"><div>'+cookie.repeat(25)+'</div></div><main><p>'+quotes[0].repeat(30)+'</p></main>';
 const collector=createEvidenceCollector({allowPartialPlan:true,clock:()=>0,read:async()=>({status:200,headers:{'content-type':'text/html'},body:Buffer.from(body)}),render:async()=>[]});
 const packet=await readResearchPages(brief,collectorPlan,[brief.website],{
  checkpoint:async(name,input,run)=>{const value=await run();checkpoints.push({name,input,value});return value;}
 },collector,{complete:true});
 assert.equal(packet.sources.length,1);
 const page=JSON.parse(gunzipSync(Buffer.from(checkpoints[0].value.data,'base64')).toString());
 assert.ok(page.text.includes('Accept all cookies'));
 assert.ok(page.researchText.includes('wholesale catalogue'));
 assert.doesNotMatch(page.researchText,/Accept all|website experience/);
 const full=gunzipSync(Buffer.from(packet.sources[0].fullText,'base64')).toString();
 assert.equal(full,page.researchText);
 assert.ok(full.length<page.text.length);
 assert.ok(packet.sources[0].excerpts.every(row=>!row.text.includes('Accept all')));
});

test('render recovery archives the rendered body rather than an inherited static-page rawText',async()=>{
 const pages=[];
 const rendered=cookie+'\n'+quotes[1].repeat(20);
 const collector=createEvidenceCollector({allowPartialPlan:true,clock:()=>0,
  read:async()=>({status:200,headers:{'content-type':'text/html'},body:Buffer.from('<div id="cookie-banner">'+cookie+'</div><main>Short process page.</main>')}),
  render:async candidates=>candidates.map(candidate=>({...candidate,text:rendered}))});
 const packet=await collector(brief,collectorPlan,{explicitSourcesOnly:true,prioritySources:[brief.website],allowEmpty:true,
  archivePages:async rows=>pages.push(...rows)});
 const page=pages.find(row=>row.method==='rendered');
 assert.equal(page.text,rendered);
 assert.ok(page.researchText.includes('room dimensions'));
 assert.doesNotMatch(page.researchText,/Accept all/);
 assert.equal(packet.sources[0].method,'rendered');
});

test('a targeted Tavily result is cleaned without another search, scraper or extraction call',async()=>{
 let searches=0;
 const result=await runScopedDefaults([needs[0]],{managedBudgetVersion:24,
  search:async(query,options)=>{searches++;assert.equal(query,needs[0].query);assert.equal(options.maxResults,1);return {results:[{url:brief.website,title:'Catalogue',content:cookie+'\n'+quotes[0]}]};},
  worker:()=>assert.fail('No extra extraction call'),searchGemini:()=>assert.fail('No extra Gemini search'),enrich:()=>assert.fail('No scraper call')},
  ()=>assert.fail('No unrequested source read'));
 assert.equal(searches,1);
 assert.ok(result[0].facts.every(row=>!row.quote.includes('Accept all')));
 assert.ok(result[0].facts.some(row=>row.quote===quotes[0]));
});

test('cookie-only accepted receipts remain archived but cannot confirm an ordinary information need',()=>{
 const args=fixture();
 args.rounds[0].receipts[0].facts[0].quote=cookie;
 const original=structuredClone(args);
 const evidence=scopedEvidence(args.brand,args.plan,args.rounds);
 assert.equal(evidence.coverage.find(row=>row.id==='n0').status,'open');
 assert.equal(evidence.coverage.find(row=>row.id==='n0').proofs.length,0);
 assert.equal(evidence.coverage.find(row=>row.id==='n1').status,'confirmed');
 assert.deepEqual(args,original,'Raw receipts, decisions and brief must not be rewritten');
 const consent=structuredClone(args);consent.plan.needs[0].metric='Cookie consent choices';
 assert.equal(scopedEvidence(consent.brand,consent.plan,consent.rounds).coverage[0].status,'confirmed');
 const legacy={...args.plan,cleanResearchEvidence:false};
 assert.equal(scopedEvidence(args.brand,legacy,args.rounds).coverage[0].status,'confirmed','Pinned legacy receipt interpretation remains compatible');
});

test('research gaps become questions while complete useful findings and saved page reuse survive',async()=>{
 const args=fixture();
 const providers=memory(async(_stage,input,_contract,options)=>{
  assert.ok(options.maxOutputTokens<=2200);
  assert.ok(input.instruction.includes(evidenceQualityInstruction));
  return {model:'offline',data:Array.isArray(input.scope)?{...empty,findings:[finding(input,0,'Satın alma kanıtı yok.'),finding(input,1)]}:empty};
 });
 const original=structuredClone(args);
 const result=await writeScopedSynthesis({...args,providers});
 assert.deepEqual(result.report.findings.map(row=>row.statement),[observations[1]]);
 assert.ok(result.report.meetingQuestions.some(row=>row.question.includes('Catalogue access')&&row.question.endsWith('?')));
 assert.ok([...providers.saved.values()].every(saved=>!JSON.stringify(saved.data.findings).includes('Satın alma kanıtı yok')));
 const calls=providers.calls;
 const restored=await writeScopedSynthesis({...args,providers,allowWrite:false});
 assert.deepEqual(restored.report,result.report);assert.equal(providers.calls,calls);assert.deepEqual(args,original);
});

test('source-backed negative conditions and explicitly requested consent controls remain eligible',()=>{
 const need=new Map([['n0',needs[0]]]);
 const negative={section:'operations',kind:'observation',needIds:['n0'],observation:'Marka mağazadan teslim hizmeti sunmadığını belirtiyor.',analysis:'The delivery scope affects the pilot.'};
 assert.ok(qualifyScopedFinding(negative,[{method:'html',quote:'Click and collect is not available. Home delivery only.'}],need,{contentQuality:true}));
 const attributed={...negative,observation:'Denetçi, satış kayıtlarının doğrulanamadığını bildirdi.'};
 const proof={method:'pdf',quote:'The auditor reported that sales records could not be verified.'};
 assert.equal(researchGapStatement(attributed.observation,{sources:[proof]}),false);
 assert.equal(researchGapStatement('Denetçi, satış kayıtlarının doğrulanamadığını belirtiyor.',{sources:[proof]}),false);
 assert.ok(qualifyScopedFinding(attributed,[proof],need,{contentQuality:true}));
 const consent=new Map([['n0',{metric:'Cookie consent choices'}]]);
 const control={...negative,observation:'Site çerez tercihlerinde kabul ve ret seçeneklerini gösteriyor.'};
 assert.ok(qualifyScopedFinding(control,[{method:'html',quote:cookie}],consent,{contentQuality:true}));
});

test('legacy proposal handoff removes gap diagnoses and cookie findings while preserving prices and useful research',()=>{
 const good={id:'good',kind:'observation',dimension:'operations',bhsSection:'operations',priority:'high',statement:observations[1],
  sourceIds:['valid'],impact:'The enquiry process supports the pilot.',researchNeedIds:['n1']};
 const bad={...good,id:'gap',statement:'Satın alma davranışı doğrulanamadı.',researchNeedIds:['n0']};
 const noise={...good,id:'cookie',statement:'We use cookies to improve your website experience.',sourceIds:['cookie'],researchNeedIds:['noise']};
 const audit={summary:bad.statement,findings:[bad,noise,good],dimensions:[{id:'operations',score:80,dataStatus:'sufficient',rationale:bad.statement,gaps:[]}],
  bhsSections:[{id:'operations',findingIds:['gap','cookie','good'],count:3,complete:true}],meetingQuestions:[],
  verifiedResearch:{metrics:[{id:'n0',name:'Catalogue access',sourceIds:['valid'],status:'confirmed'},
   {id:'n1',name:'Quote form fields',sourceIds:['valid'],status:'confirmed'},{id:'noise',name:'Buyer feedback',sourceIds:['cookie'],status:'confirmed'}]},
  sources:[{id:'valid',url:brief.website,quote:quotes[1]},{id:'cookie',url:brief.website+'privacy',quote:cookie}]};
 const prices={alternatives:[{id:'growth',total:12000}],scope:{selected:[{id:'b2b',findingIds:['good']}]}};
 const original=structuredClone({audit,prices});
 const selected=selectProposalAudit(audit,brief,prices);
 assert.deepEqual(selected.findings.map(row=>row.id),['good']);
 assert.equal(selected.bhsSections[0].complete,false);
 assert.equal(selected.verifiedResearch.metrics.find(row=>row.id==='noise').status,'open');
 assert.ok(selected.meetingQuestions.some(q=>q.includes('Catalogue access')));
 assert.ok(selected.dimensions[0].highlights.every(row=>!row.text.includes('doğrulanamadı')));
 assert.ok(!selected.sources.some(row=>row.id==='cookie'));
 assert.equal(customerFinding(bad,audit),false);
 assert.deepEqual({audit,prices},original);
});

test('the final source gate also converts cached gap findings into neutral open questions',async()=>{
 const args=fixture();
 const providers=memory(async(_stage,input)=>({data:Array.isArray(input.scope)?{...empty,findings:[finding(input,0),finding(input,1)]}:empty}));
 const result=await writeScopedSynthesis({...args,providers});
 const unsafe=structuredClone(result.report),good=unsafe.findings[0];
 unsafe.findings.push({...good,id:'old-gap',statement:'Satın alma kanıtı yok.',reportExcerpt:'Satın alma kanıtı yok.',researchNeedIds:['n0']});
 unsafe.summary='Satın alma kanıtı yok.';
 const grounded=groundOfferReport(unsafe,{packet:result.analysisPacket,brief,scopedFindings:true,preserveQualifiedImpacts:true});
 assert.ok(!grounded.findings.some(row=>row.id==='old-gap'));
 assert.equal(grounded.findings.length,result.report.findings.length);
 assert.ok(grounded.meetingQuestions.some(row=>row.question.includes('Catalogue access')));
 assert.doesNotMatch(grounded.summary,/kanıtı yok/);
});

test('research gaps hidden only in summary, coverage or dimension notes cannot become proposal highlights',()=>{
 const good={id:'good',kind:'observation',dimension:'operations',statement:observations[1],sourceIds:['valid']};
 const audit={summary:'Satın alma kanıtı yok.',findings:[good],sources:[{id:'valid',url:brief.website,quote:quotes[1]}],
  bhsSections:[{id:'operations',findingIds:['good'],count:1,complete:true}],
  dimensions:[{id:'operations',rationale:'Satın alma davranışı doğrulanamadı.',strengths:['Known quote workflow.'],gaps:['Bu araştırmada veri bulunamadı.'],score:80}],
  scoring:{total:80},researchCoverage:[{dimension:'operations',observation:'Bu araştırmada veri bulunamadı.',sourceIds:['valid']},
   {dimension:'operations',observation:'Room dimensions are recorded before quoting.',sourceIds:['valid']}]};
 const original=structuredClone(audit),selected=selectProposalAudit(audit,brief);
 assert.equal(selected.findings.length,1);assert.equal(selected.summary,observations[1]);assert.equal(selected.scoring.total,null);
 assert.ok(selected.dimensions[0].highlights.some(row=>row.text.includes('Room dimensions')));
 assert.ok(selected.dimensions[0].highlights.some(row=>row.text.includes('Known quote workflow')));
 assert.ok(selected.dimensions[0].highlights.every(row=>!researchGapStatement(row.text)));
 assert.ok(selected.meetingQuestions.some(question=>question.endsWith('?')));
 assert.deepEqual(audit,original);
});
