import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../src/budget/ledger.mjs';
import {projectModelBrief,businessMeetingNotes,redactInputText,protectConversationMessages,ensureModelInputContext,modelInputVersion} from '../src/bhs/conversation-input.mjs';
import {canonicalConversationHash} from '../src/bhs/conversation-context.mjs';
import {conversationMessages,advanceConversation,readConversation,persistConversationResult} from '../src/bhs/conversation-engine.mjs';
import {createConversationProviders,modelReservation,conversationModels} from '../src/bhs/conversation-providers.mjs';
import {analystInstruction,conversationKeys,conversationVersion,finalReportSchema} from '../src/bhs/conversation-contract.mjs';
import {presentConversationSource} from '../src/bhs/conversation-source.mjs';
import {repairConversationReport} from '../src/bhs/conversation-repair.mjs';
import {conversationAuditResult} from '../src/bhs/conversation-report.mjs';
import {brief,source,peerSource,researchSources,researchProgressInput,researchSummary,memoryLedger,assistantCall,scriptedProviders,semanticApproval} from './fixtures/bhs-conversation.mjs';
import {strongNarrativeReport} from './fixtures/bhs-strong-narrative.mjs';

const id='9'.repeat(64),now=()=>Date.parse('2026-11-21T14:00:00Z'),json=value=>new Response(JSON.stringify(value));
const password='DemoPrivate910!',email='private.contact910@example.com',phone='+90 555 123 45 67';
const dirty=()=>({...brief,goals:brief.goals+' İletişim: '+email,meetingNotes:[
 '21 Kasım 2026 · Arama · İlgili kişiye ulaşılamadı.',
 '21.11.2026 · Takip · Kendisine ulaşamadık; Amazon tarafında mevcut partner var.',
 'Marka Türkiye önceliğini, UK B2B büyümesini ve bayi ağını geliştirmek istiyor.',
 'Bütçe 35.000 TL; hedef +35%; 2026-11-21; ürün SKU 1234567890.',
 'Teklif şifresi: '+password+'; iletişim '+email+'; Telefon: '+phone,
 'Şifre sıfırlama hizmeti değerlendiriliyor; karar merkezi iki ülkede.',
 'Müşterilerin destek çağrılarına marka tarafından geç dönüş yapıldığı görüşmede belirtildi.'
 ].join('\n')});
const hidden=text=>{for(const value of [password,email,phone])assert.equal(text.includes(value),false);};
const state=()=>({turns:[],sources:[],researchProgress:{objective:'',questions:[],candidates:[],proofs:[]}});

test('the model projection separates clear CRM follow-up and credentials while preserving business goals, numbers, partners and source records',()=>{
 const original=dirty(),before=structuredClone(original),projection=projectModelBrief(original),text=JSON.stringify(projection.brief);
 hidden(text);assert.doesNotMatch(projection.brief.meetingNotes,/İlgili kişiye ulaşılamadı|Kendisine ulaşamadık/);
 for(const item of ['Amazon tarafında mevcut partner','UK B2B','bayi ağını','35.000 TL','+35%','2026-11-21','1234567890','Şifre sıfırlama hizmeti','iki ülkede','Müşterilerin destek çağrılarına'])assert.ok(text.includes(item));
 assert.ok(projection.boundary.redactions>=3);assert.equal(projection.boundary.crmExcluded,2);assert.deepEqual(original,before);
 assert.equal(projection.brief.brandName,brief.brandName);assert.equal(projection.brief.budget,brief.budget);
});

test('ambiguous business communication and genuine customer-service problems are retained instead of becoming a keyword-based exclusion',()=>{
 const notes='Telefon açılmadı.\nAmazon partnerinden dönüş alınamadı.\nMüşterilerin çağrılarına dönüş yapılmıyor.\nArama motoru optimizasyonu yapılacak.\nYönetim büyüme kararı için üç ay onay süresi istiyor.';
 assert.equal(businessMeetingNotes(notes).text,notes);assert.equal(businessMeetingNotes(notes).excluded,0);
 const mixed=businessMeetingNotes('Satış takibi: Kendisine ulaşılamadı; müşteri UK pazarına B2B girmek istiyor.');
 assert.doesNotMatch(mixed.text,/ulaşılamadı/);assert.match(mixed.text,/UK pazarına B2B/);
});

test('credential assignments, quoted passphrases, tokens and signed URLs are removed without deleting harmless service names or public product URLs',()=>{
 const values=['Şifre: '+password,'parola "private phrase 910"','API key: sk-proj-syntheticPrivate910abc','Authorization: Bearer synthetic-token-910abc',
 'https://portal.example.com/offer?password='+password,'https://preview.example.com/?_vercel_share=privateShare910','https://user:private@example.com/account',
 'DB_PASSWORD=privateDb910','Token: privateToken910','postgresql://user:private@example.com/database','0532 123 45 67',
 'https://portal.example.com/?email=private%40example.com'];
 for(const input of values){const result=redactInputText(input);assert.ok(result.redactions>0);assert.equal(result.text.includes(password),false);assert.equal(result.text.includes('private phrase 910'),false);assert.equal(redactInputText(result.text).text,result.text);}
 const safe='Şifre sıfırlama hizmeti, password reset tasarımı ve Password Manager Co; 100.000 TL ve +35%; SKU 05321234567; https://shop.example.com/product?id=12345';
 assert.equal(redactInputText(safe).text,safe);
});

test('the full natural conversation contains the useful brief but no CRM follow-up or private contact values',()=>{
 const original=dirty(),messages=conversationMessages(original,state(),{cost:{chargedKurus:500}}),all=JSON.stringify(messages);
 hidden(all);assert.doesNotMatch(all,/İlgili kişiye ulaşılamadı|Kendisine ulaşamadık/);assert.ok(all.includes('UK B2B'));assert.ok(all.includes('Amazon tarafında mevcut partner'));
 assert.match(all,/Bizim satış takibimizde/);assert.equal(original.meetingNotes.includes(password),true);
});

test('a zero-cost model-input checkpoint binds the original brief to its safe copy without storing removed values',async()=>{
 const {ledger,rows,total}=memoryLedger(),original=dirty(),before=total();
 const first=await ensureModelInputContext({brief:original,ledger,id}),second=await ensureModelInputContext({brief:original,ledger,id});
 assert.deepEqual(first,second);assert.equal(total(),before);assert.equal(first.originalBriefDigest,canonicalConversationHash(original));
 assert.equal(first.modelBriefDigest,canonicalConversationHash(first.modelBrief));hidden(JSON.stringify(first));
 assert.equal([...rows.values()].filter(row=>row.charge_kurus===0).length,1);
 const changed={...original,goals:'Başka hedef'};await assert.rejects(ensureModelInputContext({brief:changed,ledger,id}),e=>e.code==='input_privacy');
});

test('an uncertain free projection checkpoint recovers on the same account without buying a provider operation',async()=>{
 const {ledger,total}=memoryLedger();let lose=true;
 const wrapped={...ledger,once:(key,input,amount,run,options)=>ledger.once(key,input,amount,async()=>{const value=await run();if(key.startsWith('audit:conversation:model-input:')&&lose){lose=false;throw Error('Lost free projection ack');}return value;},options)};
 await assert.rejects(ensureModelInputContext({brief:dirty(),ledger:wrapped,id}));const before=total();
 const saved=await ensureModelInputContext({brief:dirty(),ledger:wrapped,id});hidden(JSON.stringify(saved));assert.equal(total(),before);
});

test('legacy embedded briefs are projected while all safe opaque thinking and tool identities remain byte-for-byte intact',()=>{
 const thinking={type:'thinking',thinking:'Aynı marka ve hedef üzerinden değerlendirme.',signature:'opaque-signature-unchanged'},opaque={type:'redacted_thinking',data:'opaque-data-unchanged'};
 const messages=[{role:'user',content:'Önceki brief: '+JSON.stringify(dirty())+'\nSistem bütçe bilgisi: {}'},
  {role:'assistant',content:[thinking,opaque,{type:'tool_use',id:'tool_preserved',name:'read_pages',input:{urls:[source.url],purpose:'Ürünleri anla'}}]},
  {role:'user',content:[{type:'tool_result',tool_use_id:'tool_preserved',content:JSON.stringify({sources:[presentConversationSource(source)]})}]}];
 const before=structuredClone(messages),safe=protectConversationMessages(messages);hidden(JSON.stringify(safe));assert.deepEqual(safe[1].content[0],thinking);assert.deepEqual(safe[1].content[1],opaque);
 assert.equal(safe[1].content[2].id,'tool_preserved');assert.equal(safe[2].content[0].tool_use_id,'tool_preserved');assert.deepEqual(messages,before);
});

test('unsafe signed thinking and unsafe body evidence stop before any count or generation rather than rewriting proof',async()=>{
 for(const content of [[{type:'thinking',thinking:'API key: sk-proj-syntheticSecret910xyz',signature:'keep'}],
  [{type:'tool_result',tool_use_id:'source',content:JSON.stringify({sources:[{...presentConversationSource(source),text:'Şifre: '+password}]})}]]){
  const {ledger,total}=memoryLedger();let requests=0;
  const providers=createConversationProviders({ledger,anthropicKey:'synthetic',fetchImpl:()=>{requests++;assert.fail('No unsafe request');}});
  const messages=[{role:'assistant',content}];await assert.rejects(providers.analystQuote(messages),e=>e.code==='input_privacy');
  await assert.rejects(providers.analyst(messages,{quote:{inputUpper:1000,output:1000,reservation:100}}),e=>e.code==='input_privacy');
  assert.equal(requests,0);assert.equal(total(),500);
 }
});

test('a protected unowned native request recounts the actual safe input and reuses its one paid receipt thereafter',async()=>{
 const {ledger,total}=memoryLedger(),calls=[],messages=[{role:'user',content:'Brief: '+JSON.stringify(dirty())}];
 const providers=createConversationProviders({ledger,anthropicKey:'synthetic',researchFx:async()=>({usdTry:50}),fetchImpl:async(url,init)=>{
  const body=JSON.parse(init.body);calls.push({url,body});hidden(JSON.stringify(body));assert.doesNotMatch(JSON.stringify(body),/İlgili kişiye ulaşılamadı/);
  if(url.endsWith('/count_tokens'))return json({input_tokens:3000});
  return json({model:'claude-sonnet-5-5',content:assistantCall('begin_report',researchSummary()).content,stop_reason:'tool_use',usage:{input_tokens:3000,output_tokens:100}});
 }});
 const quote={inputUpper:1000,output:1800,reservation:modelReservation('analyst',1000,1800)},options={quote,receiptKey:'model:synthetic-protected-legacy'};
 const one=await providers.analyst(messages,options),before=total(),two=await providers.analyst(messages,options);
 assert.deepEqual(two,one);assert.equal(total(),before);assert.equal(calls.filter(call=>call.url.endsWith('/count_tokens')).length,1);assert.equal(calls.filter(call=>call.url.endsWith('/messages')).length,1);
 assert.equal(calls.at(-1).body.max_tokens,quote.output);assert.ok(before<=5000);assert.equal(messages[0].content.includes(password),true);
});

test('owned native work is reused before privacy enrichment and an uncertain old receipt is never bought again',async()=>{
 for(const uncertain of [false,true]){
  const {ledger,total}=memoryLedger(),key='model:synthetic-private-owned';let value;
  try{value=await ledger.once(key,{},100,async()=>{if(uncertain)throw Object.assign(Error('Lost acknowledgement'),{code:'provider_timeout'});return {content:assistantCall('begin_report',researchSummary()).content};});}catch{assert.equal(uncertain,true);}
  const before=total(),providers=createConversationProviders({ledger,anthropicKey:'synthetic',fetchImpl:()=>assert.fail('No repeated old native request')});
  const messages=[{role:'user',content:JSON.stringify(dirty())}],options={quote:{inputUpper:1000,output:1000,reservation:100},receiptKey:key};
  if(uncertain)await assert.rejects(providers.analyst(messages,options));else assert.deepEqual(await providers.analyst(messages,options),value);
  assert.equal(total(),before);
 }
});

test('Gemini helper strips private instructions while preserving published body text and its source offsets',async()=>{
 const {ledger}=memoryLedger(),published={...source,text:source.text+' Public contact: public@example.com.'};let sent;
 const providers=createConversationProviders({ledger,geminiKey:'synthetic',researchFx:async()=>({usdTry:50}),fetchImpl:async(_url,init)=>{
  sent=JSON.parse(init.body);return json({modelVersion:conversationModels.helper,candidates:[{content:{parts:[{text:'Korunmuş dar yanıt.'}]}}],usageMetadata:{promptTokenCount:1000,candidatesTokenCount:20}});
 }});
 const result=await providers.consult({question:'Şifre: '+password+'; iletişim '+email+'; ürün ve sipariş yolunu açıkla.',sources:[published]});
 hidden(JSON.stringify(sent));assert.ok(JSON.stringify(sent).includes('public@example.com'));assert.equal(result.sources[0].text,published.text);
});

test('Gemini fallback count and generation receive the safe brief plus every preserved conversation decision',async()=>{
 const {ledger}=memoryLedger(),requests=[],input={brief:dirty(),sources:researchSources,previous:[[{type:'text',text:'UK B2B ve mevcut partner birlikte değerlendirilmeli.'}]],
  conversation:[{role:'user',content:'Brief: '+JSON.stringify(dirty())}],researchSummary:researchSummary(),researchProgress:{questions:[]}};
 const providers=createConversationProviders({ledger,geminiKey:'synthetic',researchFx:async()=>({usdTry:50}),fetchImpl:async(url,init)=>{
  const body=JSON.parse(init.body);requests.push({url,body});hidden(JSON.stringify(body));
  if(url.endsWith(':countTokens'))return json({totalTokens:1000});return json({modelVersion:'gemini-3.8-flash',candidates:[{content:{parts:[{text:JSON.stringify(strongNarrativeReport())}]}}],usageMetadata:{promptTokenCount:1000,candidatesTokenCount:500}});
 }});
 const value=await providers.fallbackReport(input),again=await providers.fallbackReport(input);assert.deepEqual(again,value);assert.equal(requests.length,2);
 const payload=JSON.parse(requests[1].body.contents[0].parts[0].text);assert.ok(payload.brief.meetingNotes.includes('UK B2B'));assert.ok(payload.previous[0][0].text.includes('mevcut partner'));
 assert.equal(input.brief.meetingNotes.includes(password),true);
});

test('engine fallback keeps published source observations exact inside its protected complete conversation',async()=>{
 const original=dirty(),{ledger}=memoryLedger(),published={...source,text:source.text+' Public contact: public@example.com.'};
 await ledger.once(conversationKeys.turn(id,0),{},0,async()=>({sources:[published],toolIssues:[],
  assistant:{role:'assistant',content:assistantCall('read_pages',{urls:[source.url],purpose:'Ürünleri oku'},'old_source').content},
  results:[{type:'tool_result',tool_use_id:'old_source',content:JSON.stringify({sources:[presentConversationSource(published)]})}]}));
 let captured;const providers={analystQuote:async()=>{throw Object.assign(Error('Synthetic unavailable'),{code:'provider_error'});},
  fallbackReport:async input=>{captured=input;return {data:strongNarrativeReport()};}};
 await advanceConversation({brief:original,ledger,id,providers,now});assert.ok(captured);hidden(JSON.stringify(captured.brief));
 const view=captured.conversation.flatMap(message=>Array.isArray(message.content)?message.content:[]).find(block=>block.type==='tool_result');
 assert.equal(JSON.parse(view.content).sources[0].text,published.text);assert.deepEqual(original,dirty());
});

test('private search inputs stop before any reserve/FX/request while public product queries remain available',async()=>{
 const {ledger,total}=memoryLedger();let requests=0,fx=0;
 const providers=createConversationProviders({ledger,tavilyKey:'synthetic',researchFx:async()=>{fx++;return {usdTry:50};},fetchImpl:async()=>{requests++;return json({results:[],usage:{credits:1}});}});
 await assert.rejects(providers.search({query:'Şifre: '+password,maxResults:1}),e=>e.code==='input_privacy');
 await assert.rejects(providers.search({query:email+' marka iletişim',maxResults:1}),e=>e.code==='input_privacy');
 assert.equal(total(),500);assert.equal(requests,0);assert.equal(fx,0);
 await providers.search({query:'Türkiye pet bakım 2026 ürün 12345',maxResults:1});assert.equal(requests,1);
});

test('fresh engine runs retain the original brief binding and full report while every analyst view is model-safe',async()=>{
 const original=dirty(),before=structuredClone(original),{ledger,rows}=memoryLedger(),draft=strongNarrativeReport();
 const providers=scriptedProviders(ledger,[assistantCall('search_web',{query:'Dar pazar sorusu',maxResults:3,purpose:'Dış kaynak keşfi'}),
  assistantCall('read_pages',{urls:researchSources.map(row=>row.url),purpose:'İlgili gövdeleri oku'}),assistantCall('review_research',researchProgressInput()),
  assistantCall('begin_report',researchSummary()),assistantCall('finish_bhs',draft),assistantCall('review_bhs',semanticApproval(draft))]);
 for(let at=0;at<6;at++)await advanceConversation({brief:original,ledger,id,providers,now});
 for(const call of providers.calls)hidden(JSON.stringify(call.messages));
 const saved=await persistConversationResult({brief:original,ledger,id,now});assert.equal(saved.conversationContext.briefDigest,canonicalConversationHash(original));
 assert.deepEqual(saved.researchContext.brief,original);assert.deepEqual(original,before);assert.equal(saved.conversationReport.reportMarkdown,draft.reportMarkdown);
 assert.equal(conversationAuditResult(original,saved).data.quality.contentComplete,true);
 const inputRow=[...rows].find(([key])=>key.startsWith('audit:conversation:model-input:'));assert.ok(inputRow);hidden(JSON.stringify(inputRow[1]));
});

test('a privacy-blocked historical signed context cannot start fallback research and still allows the established partial handoff',async()=>{
 const {ledger,total}=memoryLedger();await ledger.once(conversationKeys.turn(id,0),{},0,async()=>({sources:[source],results:[],toolIssues:[],
  assistant:{role:'assistant',content:[{type:'thinking',thinking:'API key: sk-proj-syntheticPrivate910abc',signature:'opaque-keep'}]}}));
 let operations=0;const providers={analystQuote:()=>{operations++;assert.fail('No count');},analyst:()=>{operations++;assert.fail('No native call');},
  fallbackReport:()=>{operations++;assert.fail('No fallback');},extract:()=>{operations++;assert.fail('No fallback extraction');}};
 const closed=await advanceConversation({brief,ledger,id,providers,now});assert.equal(closed.closed,true);assert.equal(closed.reason,'input_privacy');assert.equal(operations,0);assert.equal(total(),500);
 const saved=await persistConversationResult({brief,ledger,id,now});assert.equal(conversationAuditResult(brief,saved).status,'ready');
});

test('writing-only recovery sanitizes its copy and retains original records without buying new research',async()=>{
 const original=dirty(),{ledger}=memoryLedger();await ledger.once(conversationKeys.turn(id,0),{},0,async()=>({sources:researchSources,results:[],toolIssues:[]}));let captured;
 const restored=await repairConversationReport({brief:original,job:{researchRunId:'synthetic-private-recovery'},ledger,id,now,meter:async({run})=>run(),getProviders:()=>({
  analystQuote:async messages=>{captured=messages;hidden(JSON.stringify(messages));return {inputUpper:1000,output:8000,reservation:100};},
  analyst:async()=>assistantCall('finish_bhs',strongNarrativeReport())})});
 assert.ok(captured);assert.equal(restored.conversationReport.reportMarkdown,strongNarrativeReport().reportMarkdown);assert.equal(restored.researchContext.brief.meetingNotes.includes(password),true);assert.equal(restored.repair.newResearchCalls,0);
});

test('an embedded recovery payload preserves published source text and quotations while stripping private brief contacts',()=>{
 const published={...source,text:source.text+' Public contact: public@example.com.'},view=presentConversationSource(published);
 const input=[{role:'user',content:JSON.stringify({brief:dirty(),sources:[view],previous:[]})+'\nKorunmuş metinle devam et.'}];
 const safe=protectConversationMessages(input),text=safe[0].content;hidden(text);assert.ok(text.includes('public@example.com'));
 const end=text.lastIndexOf('}')+1,payload=JSON.parse(text.slice(0,end));assert.equal(payload.sources[0].text,published.text);assert.deepEqual(payload.sources[0].passages,view.passages);
});

test('a credential-bearing brief URL stops before providers instead of leaking or silently changing the website',async()=>{
 const original={...brief,website:brief.website+'?token=privateInput910'},before=structuredClone(original),{ledger,total}=memoryLedger();let calls=0;
 const providers={analystQuote:()=>{calls++;assert.fail('No unsafe URL can reach count');},fallbackReport:()=>{calls++;assert.fail('No fallback');}};
 const closed=await advanceConversation({brief:original,ledger,id,providers,now});assert.equal(closed.reason,'input_privacy');assert.equal(calls,0);assert.equal(total(),500);assert.deepEqual(original,before);
});
