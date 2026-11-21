import test from 'node:test';
import assert from 'node:assert/strict';
import {createConversationProviders,modelReservation} from '../src/bhs/conversation-providers.mjs';
import {brief,source,report,memoryLedger,assistantCall} from './fixtures/bhs-conversation.mjs';

const currency=async()=>({usdTry:50,publishedAt:'2026-11-19'}),reply=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const config=(ledger,fetchImpl)=>({ledger,fetchImpl,researchFx:currency,anthropicKey:'synthetic-claude',tavilyKey:'synthetic-tavily',geminiKey:'synthetic-gemini',apifyToken:null,
 navigationReader:async()=>({status:'unavailable',links:[]})});
test('native Claude tool use carries one conversation, caches its prefix and charges actual cache usage inside its uncached reservation',async()=>{
 const {ledger,rows,total}=memoryLedger();const requests=[];
 const providers=createConversationProviders(config(ledger,async(url,init)=>{
  const body=JSON.parse(init.body);requests.push({url,body});
  if(url.endsWith('/count_tokens'))return reply({input_tokens:1000});
  assert.equal(body.cache_control.type,'ephemeral');assert.ok(body.tools.some(t=>t.name==='read_pages'));
  assert.equal(body.tools.find(t=>t.name==='finish_bhs').strict,true);
  return reply({...assistantCall('begin_report',{reason:'Kaynaklar yeterli.'}),model:'claude-sonnet-5-5',stop_reason:'tool_use',
   usage:{input_tokens:100,output_tokens:200,cache_creation_input_tokens:200,cache_read_input_tokens:700}});
 }));
 const messages=[{role:'user',content:JSON.stringify(brief)}],quote=await providers.analystQuote(messages);
 assert.equal(quote.finalReservation,modelReservation('analyst',quote.inputUpper,20000));
 const one=await providers.analyst(messages,{quote}),two=await providers.analyst(messages,{quote});
 assert.equal(requests.filter(r=>r.url.endsWith('/messages')).length,1);assert.deepEqual(one,two);
 assert.equal(total(),500+one.accountedKurus);assert.ok(one.accountedKurus<quote.reservation);
 assert.equal([...rows.values()].filter(r=>r.charge_kurus>0).length,1);
});
test('Sonnet 5.5 final reports use auto choice and a strict report tool, never unsupported forced tools',async()=>{
 const {ledger}=memoryLedger();let body;
 const providers=createConversationProviders(config(ledger,async(url,init)=>{
  const payload=JSON.parse(init.body);assert.equal(payload.tool_choice.type,'auto');
  if(url.endsWith('/count_tokens'))return reply({input_tokens:1200});body=payload;
  return reply({model:'claude-sonnet-5-5',content:assistantCall('finish_bhs',report()).content,stop_reason:'tool_use',usage:{input_tokens:1200,output_tokens:2000}});
 }));
 const messages=[{role:'user',content:'Kaynakları analiz et.'}];await providers.analyst(messages,{final:true});
 assert.equal(body.max_tokens,20000);assert.ok(body.tools.some(tool=>tool.name==='read_pages'));assert.equal(body.tools.find(tool=>tool.name==='finish_bhs').strict,true);assert.equal(body.tool_choice.type,'auto');assert.equal(body.tool_choice.disable_parallel_tool_use,true);
});
test('Gemini fallback counts the complete generate request in its supported envelope before purchasing output',async()=>{
 const {ledger}=memoryLedger();let counted;
 const providers=createConversationProviders(config(ledger,async(url,init)=>{
  if(url.endsWith(':countTokens')){counted=JSON.parse(init.body);assert.equal(counted.systemInstruction,undefined);assert.equal(counted.generateContentRequest.model,'models/gemini-3.8-flash');return reply({totalTokens:1000});}
  return reply({modelVersion:'gemini-3.8-flash',candidates:[{content:{parts:[{text:JSON.stringify(report())}]}}],usageMetadata:{promptTokenCount:1000,candidatesTokenCount:2000}});
 }));
 const result=await providers.fallbackReport({brief,sources:[source],previous:[]});assert.ok(counted.generateContentRequest.systemInstruction);assert.equal(result.data.summary,report().summary);
 assert.deepEqual(result.observedSources,JSON.parse(counted.generateContentRequest.contents[0].parts[0].text).sources);
});
test('Gemini assistance returns the exact body passages it received and reuses the same paid receipt',async()=>{
 const {ledger}=memoryLedger();let calls=0,body;
 const providers=createConversationProviders(config(ledger,async(_url,init)=>{
  calls++;body=JSON.parse(init.body);return reply({modelVersion:'gemini-3.1-flash-lite',candidates:[{content:{parts:[{text:'Yanıt verilen sipariş açıklamasına dayanır.'}]}}],usageMetadata:{promptTokenCount:1000,candidatesTokenCount:50}});
 }));
 const request={question:'Ürün ve sipariş yolunu açıkla',sources:[source]};
 const first=await providers.consult(request),cached=await providers.consult(request);
 assert.deepEqual(first.sources,JSON.parse(body.contents[0].parts[0].text).sources);assert.deepEqual(cached,first);assert.equal(calls,1);
});
test('an uncertain paid Claude request retains its reservation and is never dispatched twice',async()=>{
 const {ledger,total}=memoryLedger();let paid=0;
 const providers=createConversationProviders(config(ledger,async(url)=>{
  if(url.endsWith('/count_tokens'))return reply({input_tokens:1000});paid++;throw Error('connection lost');
 }));
 const messages=[{role:'user',content:'Analyze'}];await assert.rejects(providers.analyst(messages),e=>e.code==='provider_timeout');
 const charged=total();assert.ok(charged>500);await assert.rejects(providers.analyst(messages));assert.equal(paid,1);assert.equal(total(),charged);
});
test('a definite Claude pre-dispatch rejection settles zero and remains non-repeatable',async()=>{
 const {ledger,total}=memoryLedger();let paid=0;
 const providers=createConversationProviders(config(ledger,async(url)=>{
  if(url.endsWith('/count_tokens'))return reply({input_tokens:1000});paid++;return new Response(JSON.stringify({error:{type:'authentication_error'}}),{status:401});
 }));
 const messages=[{role:'user',content:'Analyze'}];await assert.rejects(providers.analyst(messages));assert.equal(total(),500);
 await assert.rejects(providers.analyst(messages));assert.equal(paid,1);
});
test('Tavily search and extraction are separate, both successes and failed URLs survive, and delayed credit reporting does not erase extraction cost',async()=>{
 const {ledger,total}=memoryLedger();const urls=[];
 const providers=createConversationProviders(config(ledger,async(url)=>{urls.push(url);return url.endsWith('/search')?
  reply({results:[{url:source.url,title:source.title,content:source.text}],usage:{credits:1}}):
  reply({results:[{url:source.url,raw_content:source.text}],failed_results:[{url:'https://unreadable.example.com/',error:'blocked'}],usage:{credits:0}});
 }));
 const found=await providers.search({query:'Dar ürün araştırması',maxResults:1,purpose:'Ürün sınıfını anla'});
 const read=await providers.extract({urls:[source.url],purpose:'Ürünü oku'});
 assert.equal(found.results[0].method,'search-snippet');assert.equal(read.results[0].method,'extracted');assert.equal(read.failures.length,1);
 assert.ok(read.accountedKurus>0);assert.equal(total(),500+found.accountedKurus+read.accountedKurus);
 await providers.extract({urls:[source.url],purpose:'Aynı kaynak'});assert.equal(urls.length,2);
});
test('research is blocked before dispatch if it would consume the final report reserve or aggregate cap',async()=>{
 const {ledger,total}=memoryLedger({charged:4900});let calls=0;
 const providers=createConversationProviders(config(ledger,async()=>{calls++;return reply({});}));
 await assert.rejects(providers.search({query:'Dar sorgu',maxResults:1},{remainingReserve:100}),e=>e.code==='budget_limit');
 assert.equal(calls,0);assert.equal(total(),4900);
});
test('unknown or excessive billed usage remains reserved and cannot silently overrun the total account',async()=>{
 const {ledger,total}=memoryLedger();let paid=0;
 const providers=createConversationProviders(config(ledger,async(url)=>{
  if(url.endsWith('/count_tokens'))return reply({input_tokens:100});paid++;
  return reply({model:'claude-sonnet-5-5',content:[],usage:{input_tokens:999999,output_tokens:10}});
 }));
 const messages=[{role:'user',content:'Test'}];await assert.rejects(providers.analyst(messages),e=>e.code==='provider_accounting');
 assert.ok(total()>500&&total()<=5000);await assert.rejects(providers.analyst(messages));assert.equal(paid,1);
});
test('specialist readers require a verified suitable actor, preserve the final reserve and use a single bounded observed URL',async()=>{
 const {ledger}=memoryLedger();let request,context,cap;
 const providers=createConversationProviders({...config(ledger,()=>{throw Error('real network prohibited');}),apifyToken:'synthetic-apify',
  specialistFactory:options=>{cap=options;return {availableActors:async()=>['apify/rag-web-browser'],enrich:async(r,c)=>{request=r;context=c;return {status:'complete',pages:[{url:r.url,text:source.text}]};}};}});
 const result=await providers.specialist({url:source.url,purpose:'Tavily engellendi; ürün sayfasını oku',mode:'page',sampleSize:1},{brief,sources:[source]},{remainingReserve:1200});
 assert.equal((await cap.ledger.status()).capKurus,3800);assert.equal(request.maxResults,1);assert.equal(request.exactScope,true);
 assert.equal(context.packet.sources[0].url,source.url);assert.equal(result.results[0].method,'extracted');
});
test('a closed worker time window cannot start a paid request',async()=>{
 const {ledger,total}=memoryLedger();let calls=0;
 const providers=createConversationProviders({...config(ledger,()=>{calls++;throw Error('no dispatch');}),now:()=>100000,executionDeadline:100001});
 await assert.rejects(providers.search({query:'Dar sorgu',maxResults:1}),e=>e.code==='model_deadline');assert.equal(calls,0);assert.equal(total(),500);
});
test('the documented worst-case reservation includes cache creation and total-output upper bounds',()=>{
 assert.ok(modelReservation('analyst',1000,10000)>modelReservation('analyst',1000,1800));
 assert.ok(modelReservation('analyst',1000,10000)>=Math.ceil((1000*2.5+10000*10)/1e6*60*1.2*1.03*100));
});
