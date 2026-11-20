import test from 'node:test';
import assert from 'node:assert/strict';
import {BudgetError} from '../src/budget/ledger.mjs';
import {conversationKeys,sourceId} from '../src/bhs/conversation-contract.mjs';
import {advanceConversation,readConversation,persistConversationResult,maximumConversationTurns} from '../src/bhs/conversation-engine.mjs';
import {conversationAuditResult,validateConversationReport} from '../src/bhs/conversation-report.mjs';
import {canonicalSourceUrl,collectSourceViews,quoteWasSeen,emptyResearchProgress,updateResearchProgress,researchCoverage,researchClosureIssues,researchClosureVersion} from '../src/bhs/conversation-progress.mjs';
import {presentConversationSource} from '../src/bhs/conversation-source.mjs';
import {createResearchSnapshot,readResearchSnapshot} from '../src/bhs/research-snapshot.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {brief,source,peerSource,researchSources,researchSummary,researchProgressInput,completeResearchProgress,fixtureSourceResults,researchedReport,memoryLedger,assistantCall,scriptedProviders,semanticApproval} from './fixtures/bhs-conversation.mjs';

const id='d'.repeat(64),now=()=>Date.parse('2026-11-20T15:00:00Z');
const delta=changes=>({objective:researchProgressInput().objective,questions:[],sources:[],candidates:[],...changes});
const gap=()=>({id:'purchase',question:'Rakibin kendi ürün sayfasından sipariş yolu var mı?',access:'public',important:true,status:'open',answer:'',sourceIds:[],attemptedUrls:[],rationale:''});
function context(sources=researchSources){return {sources,knownUrls:new Set(sources.map(row=>row.url)),readAttempts:new Set(),toolIssues:[],
 views:collectSourceViews({results:[{content:JSON.stringify({sources:sources.map(row=>presentConversationSource(row))})}]},new Map(sources.map(row=>[row.id,row])))};}
function withGap(){const progress=completeResearchProgress();progress.questions.push(gap());return progress;}
async function seed(ledger,{progress=completeResearchProgress(),sources=researchSources,results=fixtureSourceResults(),count=1}={}){
 for(let at=0;at<count;at++)await ledger.once(conversationKeys.turn(id,at),{},0,async()=>at?{results:[],toolIssues:[]}:
  {sources,researchSummary:researchSummary(),researchProgress:progress,researchClosureVersion,results,toolIssues:[]});
}
test('four actually read related bodies qualify, while discovery and navigation cannot be counted',()=>{
 const progress=completeResearchProgress();assert.equal(researchCoverage(progress,researchSources).count,4);
 assert.equal(researchCoverage(progress,researchSources.map(row=>({...row,method:'search-snippet'}))).count,0);
 const menu=researchSources.map(row=>({...row,text:'* [Home](https://example.com/)\n* [Contact](https://example.com/contact)'}));
 assert.equal(researchCoverage(progress,menu).count,0);
 const irrelevant=updateResearchProgress(progress,delta({sources:[{sourceId:source.id,questionId:'brand',related:false,quote:'',reason:'Araştırma sorusuyla ilgili değil.'}]}),context());
 assert.equal(researchCoverage(irrelevant,researchSources).count,3);assert.ok(researchClosureIssues(irrelevant,researchSources).includes('four_distinct_read_sources_missing'));
});
test('tracking aliases and copied article bodies do not inflate four distinct source coverage',()=>{
 const rows=[source,{...researchSources[1],id:'S11111111',url:source.url+'?utm_source=copy&fbclid=x'},
  {...source,id:'S22222222',url:'https://copy.example.com/article'},researchSources[3]];
 const input={objective:'Ürün ve pazar kapsamı.',questions:[{...gap(),id:'all',status:'answered',answer:'Okunan ürün ve pazar açıklamaları.',sourceIds:rows.map(row=>row.id)}],
  sources:rows.map(row=>({sourceId:row.id,questionId:'all',related:true,quote:row.text,reason:'Ürün ve pazar sorusuna dayanak.'})),candidates:[]};
 const progress=updateResearchProgress(emptyResearchProgress(),input,context(rows));assert.equal(researchCoverage(progress,rows).count,2);
 assert.equal(canonicalSourceUrl('http://www.example.com/item/?utm_campaign=x&b=2&a=1#part'),'https://example.com/item?a=1&b=2');
 assert.notEqual(canonicalSourceUrl('https://example.com/?sku=1'),canonicalSourceUrl('https://example.com/?sku=2'));
});
test('adjacent delivered body chunks form one seen interval while omitted gaps stay unread',()=>{
 const known=new Map([[source.id,source]]),view=passages=>({id:source.id,passages,text:passages.map(row=>source.text.slice(row.start,row.end)).join('\n[…]\n')});
 const collect=passages=>collectSourceViews({results:[{content:JSON.stringify(view(passages))}]},known);
 assert.equal(quoteWasSeen(source,source.text,collect([{start:0,end:40},{start:40,end:source.text.length}])),true);
 assert.equal(quoteWasSeen(source,source.text,collect([{start:0,end:40},{start:60,end:source.text.length}])),false);
});
test('an unseen archive quote or a read-and-review in the same tool batch cannot certify source relevance',async()=>{
 const {ledger}=memoryLedger(),read=assistantCall('read_pages',{urls:researchSources.map(row=>row.url),purpose:'Kaynakları oku'},'read');
 const review=assistantCall('review_research',researchProgressInput(),'review');
 const providers=scriptedProviders(ledger,[assistantCall('search_web',{query:'Dar ürün ve pazar kaynakları',maxResults:4,purpose:'Keşif'}),
  {content:[...read.content,...review.content],stopReason:'tool_use'},assistantCall('review_research',researchProgressInput())]);
 await advanceConversation({brief,ledger,id,providers,now});
 const batched=await advanceConversation({brief,ledger,id,providers,now});assert.ok(batched.toolIssues.some(row=>row.code==='research_progress_invalid'));
 assert.equal(batched.researchProgress.proofs.length,0);
 const observed=await advanceConversation({brief,ledger,id,providers,now});assert.deepEqual(observed.toolIssues,[]);assert.equal(researchCoverage(observed.researchProgress,researchSources).count,4);
});
test('important public gaps survive omitted updates, block early writing and close only after a grounded answer',async()=>{
 const {ledger}=memoryLedger();await seed(ledger,{progress:withGap()});
 const providers=scriptedProviders(ledger,[assistantCall('review_research',delta({})),assistantCall('begin_report',researchSummary()),
  assistantCall('review_research',delta({questions:[{...gap(),status:'answered',answer:'Rakibin ürün sayfasında doğrudan sipariş seçeneği var.',sourceIds:[peerSource.id]}]})),
  assistantCall('begin_report',researchSummary()),assistantCall('finish_bhs',researchedReport())]);
 await advanceConversation({brief,ledger,id,providers,now});
 const early=await advanceConversation({brief,ledger,id,providers,now});assert.equal(early.finishRequested,false);assert.match(early.results[0].content,/important_public_questions_open/);
 for(let at=0;at<4;at++)await advanceConversation({brief,ledger,id,providers,now});
 const saved=await persistConversationResult({brief,ledger,id,now});assert.equal(conversationAuditResult(brief,saved).data.quality.contentComplete,true);
 assert.ok(saved.researchClosure.progress.questions.some(q=>q.access==='client'&&q.status==='open'));
});
test('a relevant pending candidate cannot be ignored after its question was answered; reasoned rejection is explicit',()=>{
 const pending=delta({candidates:[{url:peerSource.url,questionId:'competition',status:'pending',reason:'Karşılaştırma için incelenecek aday.'}]});
 const progress=updateResearchProgress(completeResearchProgress(),pending,context());assert.ok(researchClosureIssues(progress,researchSources).includes('relevant_candidates_unread'));
 const rejected=updateResearchProgress(progress,delta({candidates:[{...pending.candidates[0],status:'rejected',reason:'Bu alternatif mevcut soruyu değiştirmiyor; aynı kanıta dayalı tekrarlı inceleme gereksiz.'}]}),context());
 assert.deepEqual(researchClosureIssues(rejected,researchSources),[]);
});
test('unavailable public information requires a real attempt and stays visibly partial; private client data does not block research',()=>{
 const input=delta({questions:[{...gap(),status:'unavailable',rationale:'Kaynak okunamadı.'}]});
 assert.throws(()=>updateResearchProgress(withGap(),input,context()),e=>e.code==='research_progress_invalid');
 input.questions[0].attemptedUrls=[peerSource.url];const attempted=context();attempted.readAttempts.add(peerSource.url);
 const progress=updateResearchProgress(withGap(),input,attempted);assert.deepEqual(researchClosureIssues(progress,researchSources),[]);
 assert.ok(researchClosureIssues(progress,researchSources,{includeUnavailable:true}).includes('important_public_questions_unavailable'));
 assert.deepEqual(researchClosureIssues(completeResearchProgress(),researchSources),[]);
});
test('one unaffordable tool does not end funded useful work or prevent a free saved-source read',async()=>{
 const {ledger}=memoryLedger();await seed(ledger,{progress:withGap()});let actors=0,extractions=0;
 const providers=scriptedProviders(ledger,[assistantCall('specialist_read',{url:source.url,purpose:'Dar ürün incelemesi',mode:'posts',sampleSize:1}),
  assistantCall('read_saved_source',{sourceId:peerSource.id,offset:0})]);
 providers.specialist=async()=>{actors++;throw new BudgetError('budget_limit','Bu actor sığmıyor.');};providers.extract=async()=>{extractions++;throw Error('Tekrar satın alma yok');};
 const denied=await advanceConversation({brief,ledger,id,providers,now});assert.equal(denied.finishRequested,false);
 const read=await advanceConversation({brief,ledger,id,providers,now});assert.equal(providers.calls[1].options.final,false);
 assert.match(read.results[0].content,/doğrudan sipariş/);assert.equal(actors,1);assert.equal(extractions,0);
});
for(const stopReason of ['end_turn','max_tokens'])test('a '+stopReason+' reply cannot silently close funded research with important gaps',async()=>{
 const {ledger}=memoryLedger();await seed(ledger,{progress:withGap()});
 const providers=scriptedProviders(ledger,[{content:[{type:'text',text:'Araştırmayı yeterli buldum.'}],stopReason},assistantCall('read_saved_source',{sourceId:peerSource.id,offset:0})]);
 const first=await advanceConversation({brief,ledger,id,providers,now});assert.equal(first.finishRequested,false);
 await advanceConversation({brief,ledger,id,providers,now});assert.equal(providers.calls[1].options.final,false);
});
for(const limit of ['budget','deadline','turns'])test('the '+limit+' ceiling preserves useful output and partial source/gap status without extra research',async()=>{
 const {ledger,total}=memoryLedger({charged:limit==='budget'?4100:500});await seed(ledger,{progress:withGap(),count:limit==='turns'?maximumConversationTurns-2:1});
 const providers=scriptedProviders(ledger,[assistantCall('finish_bhs',researchedReport())]);providers.search=()=>assert.fail('Araştırma penceresi kapalı');
 const draft=await advanceConversation({brief,ledger,id,providers,now,...(limit==='deadline'?{deadline:now()+10000}:{})});assert.equal(draft.closed,undefined);
 const turn=await advanceConversation({brief,ledger,id,providers,now});
 assert.equal(turn.closed,true);assert.equal(turn.reason,'research_incomplete');assert.equal(providers.calls[0].options.final,true);assert.ok(total()<=5000);
 const saved=await persistConversationResult({brief,ledger,id,now}),audit=conversationAuditResult(brief,saved);
 assert.equal(audit.status,'ready');assert.equal(audit.data.fullReport,researchedReport().reportMarkdown);assert.equal(audit.data.quality.contentComplete,false);
 const snapshot=createResearchSnapshot(audit.data,brief);assert.ok(snapshot);assert.equal(directAuditResult(brief,readResearchSnapshot(snapshot)).data.quality.contentComplete,false);
});
test('quoting an unshown tail or an unreviewed search source never becomes a complete report through persistence or reuse',async()=>{
 const hidden='Bu son pasaj yalnız tam kaynak arşivinde kalmıştır ve ilk sunumda gösterilmemiştir.';
 const rows=researchSources.map(row=>row.id===source.id?{...row,text:row.text+'\n'+('Geçmişe ilişkin uzun ve bağımsız bir paragraf okunacak mevcut bölümün dışına taşar.\n'.repeat(400))+'\n'+hidden}:row);
 const ctx=context(rows),input=researchProgressInput();input.sources.find(row=>row.sourceId===source.id).quote=source.text;
 const progress=updateResearchProgress(emptyResearchProgress(),input,ctx),results=[{content:JSON.stringify({sources:rows.map(row=>presentConversationSource(row))})}];
 const {ledger}=memoryLedger();await seed(ledger,{sources:rows,progress,results});
 const invalid=researchedReport();invalid.sourceQuotes[0].quote=hidden;assert.deepEqual(validateConversationReport(invalid,rows),[]);
 const providers=scriptedProviders(ledger,[assistantCall('begin_report',researchSummary()),assistantCall('finish_bhs',invalid)]);
 await advanceConversation({brief,ledger,id,providers,now});await advanceConversation({brief,ledger,id,providers,now});
 const saved=await persistConversationResult({brief,ledger,id,now});assert.ok(saved.researchClosure.issues.includes('unseen_report_quote'));
 const audit=conversationAuditResult(brief,saved),snapshot=createResearchSnapshot(audit.data,brief);assert.equal(audit.data.quality.contentComplete,false);
 assert.equal(directAuditResult(brief,readResearchSnapshot(snapshot)).data.quality.contentComplete,false);
 const unread={...source,id:sourceId('https://snippet.example.com/'),url:'https://snippet.example.com/',method:'search-snippet'};
 const report=researchedReport();report.reportMarkdown+='\nArama sonucu iddiası ['+unread.id+']';report.sourceQuotes.push({sourceId:unread.id,quote:unread.text});
 assert.ok(researchClosureIssues(completeResearchProgress(),[...researchSources,unread],{report}).includes('unreviewed_report_source'));
});
test('the fallback analyst may quote its genuinely delivered source window and its read proof survives the final checkpoint',async()=>{
 const hidden='Amazon tarafında mevcut bir partner ile web sitesi sipariş kanallarının yönetimi bu paragrafta açıklanıyor.';
 const rows=researchSources.map(row=>row.id===source.id?{...row,text:row.text+'\n'+('Geçmişe ilişkin farklı ve uzun bir paragraf bu eski zaman aralığını anlatır.\n'.repeat(400))+'\n'+hidden}:row);
 const input=researchProgressInput();input.sources.find(row=>row.sourceId===source.id).quote=source.text;
 const progress=updateResearchProgress(emptyResearchProgress(),input,context(rows));
 const results=[{content:JSON.stringify({sources:rows.map(row=>presentConversationSource(row))})}],{ledger}=memoryLedger();
 await seed(ledger,{sources:rows,progress,results});
 const answer=researchedReport();answer.sourceQuotes[0].quote=hidden;
 const observedSources=rows.map(row=>presentConversationSource(row,{purpose:brief.goals+' '+brief.needs}));assert.ok(observedSources[0].text.includes(hidden));
 const providers={analystQuote:async()=>({reservation:100,finalReservation:800}),analyst:async(_messages,options)=>{if(options.review)return assistantCall('review_bhs',semanticApproval(answer));throw new BudgetError('provider_error','Sentetik kesinti');},
  fallbackReport:async()=>({data:answer,observedSources})};
 const draft=await advanceConversation({brief,ledger,id,providers,now});assert.equal(draft.closed,undefined);
 assert.ok(JSON.parse(draft.results[0].content).sources.find(row=>row.id===source.id).text.includes(hidden));
 const turn=await advanceConversation({brief,ledger,id,providers,now});assert.equal(turn.closed,true);assert.deepEqual(turn.closureIssues,[]);
 const saved=await persistConversationResult({brief,ledger,id,now});assert.equal(conversationAuditResult(brief,saved).data.quality.contentComplete,true);
 assert.ok((await readConversation(ledger,id)).sourceViews.get(source.id).ranges.some(row=>row.end===rows[0].text.length));
});
