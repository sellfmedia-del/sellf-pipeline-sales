import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceConversation,readConversation,persistConversationResult} from '../src/bhs/conversation-engine.mjs';
import {createConversationProviders} from '../src/bhs/conversation-providers.mjs';
import {researchOutcomeIssues,researchOutcomeVersion} from '../src/bhs/conversation-research.mjs';
import {conversationAuditResult} from '../src/bhs/conversation-report.mjs';
import {createResearchSnapshot,readResearchSnapshot} from '../src/bhs/research-snapshot.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {conversationKeys,sourceId} from '../src/bhs/conversation-contract.mjs';
import {sourceReadIdentity,researchCoverage} from '../src/bhs/conversation-progress.mjs';
import {createApifyAdapter} from '../src/bhs/apify-adapter.mjs';
import {actorIds} from '../src/bhs/apify-inputs.mjs';
import {brief,source,marketSource,peerSource,researchSources,researchSummary,completeResearchProgress,fixtureSourceResults,
 memoryLedger,assistantCall,scriptedProviders,researchedReport} from './fixtures/bhs-conversation.mjs';

const id='6'.repeat(64),now=()=>Date.parse('2026-11-21T12:00:00Z'),json=value=>new Response(JSON.stringify(value));
const extra={...marketSource,id:sourceId('https://outside.example.com/story'),url:'https://outside.example.com/story',
 text:'Bu dış sayfa indirilmiş olabilir; analist henüz hangi soruya neden ilgili olduğunu değerlendirmedi.'};
const social='https://www.instagram.com/ornekpet/',post='https://www.instagram.com/p/ABC123/';
async function seed(ledger,{sources=researchSources,summary=researchSummary(),progress=completeResearchProgress()}={}){
 await ledger.once(conversationKeys.turn(id,0),{},0,async()=>({sources,researchSummary:summary,researchOutcomeVersion,
  researchProgress:progress,results:fixtureSourceResults(),toolIssues:[]}));
}

test('downloaded outside pages cannot certify market or peer outcomes until the analyst adjudicates the actual evidence',()=>{
 const summary=researchSummary(),sources=[...researchSources,extra],progress=completeResearchProgress();
 summary.market.channels.sourceIds=[extra.id];summary.competitors[0].sourceIds=[extra.id];
 const issues=researchOutcomeIssues(summary,sources,brief,{progress});
 assert.ok(issues.includes('market_channels_source_unreviewed'));assert.ok(issues.includes('competitor_source_unreviewed'));
 const proved=structuredClone(progress);proved.proofs.push({sourceId:extra.id,url:extra.url,questionId:'market',quote:extra.text,
  reason:'Sentetik analist ilgili dış soruya bu pasajı bağlıyor.',...sourceReadIdentity(extra)});
 assert.deepEqual(researchOutcomeIssues(summary,sources,brief,{progress:proved}),[]);
 summary.market.customerBehavior.sourceIds=[];assert.deepEqual(researchOutcomeIssues(summary,sources,brief,{progress:proved}),[]);
});

test('a missing peer comparison retains valid market results and directs only the unfinished work in the full conversation',async()=>{
 const {ledger}=memoryLedger();await seed(ledger);
 const partial=researchSummary();partial.competitors=[];
 const providers=scriptedProviders(ledger,[assistantCall('begin_report',partial),assistantCall('begin_report',researchSummary())]);
 const rejected=await advanceConversation({brief,ledger,id,providers,now});assert.equal(rejected.finishRequested,false);
 const restored=await readConversation(ledger,id);assert.deepEqual(restored.researchSummary,partial);
 const feedback=JSON.parse(rejected.results[0].content);assert.ok(feedback.outcomes.issues.includes('named_competitors_missing'));
 assert.deepEqual(feedback.outcomes.retained.market,['channels','customerBehavior','competitionDynamics']);
 const completed=await advanceConversation({brief,ledger,id,providers,now});assert.equal(completed.finishRequested,true);
 const full=JSON.stringify(providers.calls.at(-1).messages);assert.ok(full.includes(partial.market.channels.analysis));
 assert.ok(full.includes(brief.goals));assert.ok(full.includes(peerSource.text));
});

test('normal report admission cannot substitute an unreviewed outside page for the chosen source proof',async()=>{
 const {ledger}=memoryLedger();await seed(ledger,{sources:[...researchSources,extra]});
 const summary=researchSummary();summary.market.channels.sourceIds=[extra.id];
 const providers=scriptedProviders(ledger,[assistantCall('begin_report',summary)]);
 const turn=await advanceConversation({brief,ledger,id,providers,now});assert.equal(turn.finishRequested,false);
 assert.equal(turn.toolIssues[0].code,'research_needed');assert.match(turn.results[0].content,/market_channels_source_unreviewed/);
 assert.deepEqual(turn.researchSummary,summary);assert.equal(providers.calls[0].options.final,false);
});

test('new outcome proof survives report reuse while the historical outcome contract is not retroactively reclassified',async()=>{
 const {ledger}=memoryLedger();await seed(ledger);
 const providers=scriptedProviders(ledger,[assistantCall('begin_report',researchSummary()),assistantCall('finish_bhs',researchedReport())]);
 for(let at=0;at<3;at++)await advanceConversation({brief,ledger,id,providers,now});
 const saved=await persistConversationResult({brief,ledger,id,now}),audit=conversationAuditResult(brief,saved);
 assert.equal(audit.data.quality.contentComplete,true);
 const reused=directAuditResult(brief,readResearchSnapshot(createResearchSnapshot(audit.data,brief)));
 assert.equal(reused.data.quality.contentComplete,true);assert.equal(reused.data.fullReport,researchedReport().reportMarkdown);
 const changed=structuredClone(saved);changed.conversationSources.push(extra);changed.researchSummary.market.channels.sourceIds=[extra.id];
 assert.equal(conversationAuditResult(brief,changed).data.quality.contentComplete,false);
 changed.researchOutcomeVersion='market-competition-outcomes-v1';
 assert.equal(conversationAuditResult(brief,changed).data.quality.contentComplete,true);
});

test('malformed market source arrays produce research issues without crashing the continuing conversation',()=>{
 const summary=researchSummary();summary.market.channels.sourceIds='not-an-array';summary.competitors[0].sourceIds=null;
 const issues=researchOutcomeIssues(summary,researchSources,brief,{progress:completeResearchProgress()});
 assert.ok(issues.includes('research_handoff_format'));assert.ok(issues.includes('competitor_comparison_missing'));
});

test('persisting an already completed historical conversation retains its original outcome version',async()=>{
 const {ledger}=memoryLedger();await ledger.once(conversationKeys.turn(id,0),{},0,async()=>({closed:true,conversationReport:researchedReport(),
  sources:researchSources,researchSummary:researchSummary(),researchOutcomeVersion:'market-competition-outcomes-v1',
  researchProgress:completeResearchProgress(),results:fixtureSourceResults(),toolIssues:[]}));
 const saved=await persistConversationResult({brief,ledger,id,now});assert.equal(saved.researchOutcomeVersion,'market-competition-outcomes-v1');
 assert.equal(saved.conversationReport.reportMarkdown,researchedReport().reportMarkdown);
});

// The real provider/adapter chain with an in-memory ledger and synthetic HTTP
// responses. No network, actor, model or token-count endpoint is used.
function nativeSample(actor,rows,{charged=500,cap=.02,timeout=false}={}){
 const {ledger,total}=memoryLedger({charged}),calls=[];
 const fetchImpl=async(url,options={})=>{
  calls.push({url,body:options.body&&JSON.parse(options.body)});
  if(url.includes('/acts/')&&!url.includes('/runs?'))return json({data:{pricingInfos:[{startedAt:'2026-01-01',pricingModel:'PAY_PER_EVENT'}]}});
  if(url.includes('/runs?')){if(timeout)throw Error('Lost synthetic acknowledgement');return json({data:{id:'Run12345678901234',options:{maxTotalChargeUsd:Number(new URL(url).searchParams.get('maxTotalChargeUsd'))}}});}
  if(url.includes('/actor-runs/'))return json({data:{status:'SUCCEEDED',defaultDatasetId:'Data1234567890123',usageTotalUsd:.001}});
  if(url.includes('/datasets/'))return json(rows);
  assert.fail('Unexpected synthetic request: '+url);
 };
 const providers=createConversationProviders({ledger,now,fetchImpl,apifyToken:'synthetic',anthropicKey:null,geminiKey:null,tavilyKey:null,
  specialistFactory:options=>createApifyAdapter({...options,getTaskPolicies:async()=>[{actId:actorIds[actor],options:{maxTotalChargeUsd:cap}}],delay:async()=>{},validateUrl:async()=>{}})});
 return {ledger,total,calls,providers};
}
const context=url=>({brief,sources:[{...source,links:[url]}]});
const task=(url,mode,sampleSize=1)=>({url,mode,sampleSize,purpose:'Seçili somut kamu sorusuna dar örneklem al.'});

test('multiple comments on one post remain visible and archived under one source without losing the first record',async()=>{
 const native=nativeSample('apify/instagram-comment-scraper',[
  {postUrl:post,text:'Kullanım miktarını anlamakta zorlandım, açıklama bekliyorum.',timestamp:'2026-11-20T10:00:00Z',ownerUsername:'must-not-be-evidence'},
  {postUrl:post,text:'Uygulama videosu faydalı oldu; teslimat sorusunu ayrıca ilettim.',timestamp:'2026-11-21T10:00:00Z'}]);
 await seed(native.ledger,{sources:[{...source,links:[post]}]});
 const scripted=scriptedProviders(native.ledger,[assistantCall('specialist_read',task(post,'reviews',2))]);
 const providers={...scripted,specialist:native.providers.specialist};
 const turn=await advanceConversation({brief,ledger:native.ledger,id,providers,now}),shown=JSON.parse(turn.results[0].content);
 assert.equal(shown.sources.length,1);assert.equal(shown.sample.returnedRecords,2);
 const restored=await readConversation(native.ledger,id),captured=restored.sources.find(row=>row.url===post);
 assert.match(captured.text,/Kullanım miktarını/);assert.match(captured.text,/Uygulama videosu/);
 assert.equal(captured.sample.sourceRecords,2);assert.equal(shown.sources[0].sample.requestedRecords,2);
 assert.doesNotMatch(captured.text,/must-not-be-evidence/);assert.match(shown.sources[0].text,/Kullanım miktarını/);assert.match(shown.sources[0].text,/Uygulama videosu/);
 const before=native.total();await native.providers.specialist(task(post,'reviews',2),context(post),{remainingReserve:1200});
 assert.equal(native.calls.filter(row=>row.url.includes('/runs?')).length,1);assert.equal(native.total(),before);
 assert.equal(researchCoverage(restored.researchProgress,restored.sources).count,1); // seeded own proof only; not two extra sources
});

test('empty or shorter samples state their requested and returned records without certifying absence or complete periods',async()=>{
 const native=nativeSample('apify/instagram-comment-scraper',[]);
 const sample=await native.providers.specialist(task(post,'reviews',3),context(post));
 assert.equal(sample.sample.requestedRecords,3);assert.equal(sample.sample.returnedRecords,0);assert.deepEqual(sample.results,[]);
 assert.match(sample.scope,/örneklem/);
});

test('selected LinkedIn and TikTok posts use their existing bounded actor inputs without follower, comment or AI expansion',async()=>{
 const cases=[
  {actor:'harvestapi/linkedin-post-search',url:'https://www.linkedin.com/company/ornekpet/',rows:[{url:'https://www.linkedin.com/posts/ornekpet-123',author:{linkedinUrl:'https://www.linkedin.com/company/ornekpet/'},commentary:'Örnek Pet yeni ürünün kullanımını anlatıyor.',engagement:{likes:12,comments:3},postedAt:{date:'2026-11-20T12:00:00Z'}}]},
  {actor:'clockworks/tiktok-scraper',url:'https://www.tiktok.com/@ornekpet',rows:[{webVideoUrl:'https://www.tiktok.com/@ornekpet/video/123',authorMeta:{name:'ornekpet',fans:120},text:'Örnek Pet uygulama adımları',createTimeISO:'2026-11-20T12:00:00Z',playCount:100}]}
 ];
 for(const item of cases){
  const native=nativeSample(item.actor,item.rows),result=await native.providers.specialist(task(item.url,'posts',2),context(item.url),{remainingReserve:1500});
  const start=native.calls.find(row=>row.url.includes('/runs?'));assert.ok(start);assert.equal(result.results.length,1);
  assert.equal(result.sample.requestedRecords,2);assert.equal(result.sample.returnedRecords,1);
  if(item.actor.startsWith('harvestapi/')){assert.equal(start.body.maxPosts,2);assert.equal(start.body.scrapeComments,false);assert.match(result.results[0].text,/likesCount: 12/);assert.match(result.results[0].text,/kullanımını anlatıyor/);}
  else{assert.equal(start.body.resultsPerPage,2);assert.equal(start.body.commentsPerPost,0);assert.equal(start.body.aiVideoDescription,false);assert.equal(start.body.maxFollowersPerProfile,0);}
  assert.ok(native.total()<=3500);
 }
});

test('a selected single product preserves exact price currency and marketplace identity without collecting other products or reviews',async()=>{
 const cases=[
  {actor:'fatihtahta/trendyol-scraper',url:'https://www.trendyol.com/ornekpet/sprey-p-12345',rows:[{type:'product',url:'https://www.trendyol.com/ornekpet/sprey-p-12345',brand:{name:brief.brandName},title:'Örnek Pet bakım spreyi',pricing:{current_price:120,currency:'TRY'},metrics:{rating:{average_rating:4.5,comment_count:8}}}]},
  {actor:'junglee/free-amazon-product-scraper',url:'https://www.amazon.com.tr/dp/B012345678',rows:[{asin:'B012345678',brand:brief.brandName,title:'Örnek Pet bakım spreyi',price:{value:150,currency:'TRY'},stars:4.1,reviewsCount:12,loadedCountryCode:'TR'}]}
 ];
 for(const item of cases){
  const native=nativeSample(item.actor,item.rows),result=await native.providers.specialist(task(item.url,'product'),context(item.url));
  assert.equal(result.results.length,1);assert.match(result.results[0].text,/currency: TRY/);assert.match(result.results[0].text,/120|150/);
  const start=native.calls.find(row=>row.url.includes('/runs?'));assert.equal(new URL(start.url).searchParams.get('maxItems'),'1');
  if(item.actor.startsWith('fatihtahta/')){assert.equal(start.body.getReviews,false);assert.equal(start.body.limit,1);}
  else{assert.equal(start.body.maxItemsPerStartUrl,1);assert.equal(start.body.maxProductVariantsAsSeparateResults,0);}
 }
});

test('technical sampling stays on the selected own page and retains its static-only limitation',async()=>{
 const actor='logiover/website-seo-audit-crawler',native=nativeSample(actor,[{url:source.url,title:'Örnek Pet',h1Count:1,statusCode:200,isIndexable:true,crawledAt:'2026-11-21T12:00:00Z'}]);
 const result=await native.providers.specialist(task(source.url,'technical'),context(source.url));
 const start=native.calls.find(row=>row.url.includes('/runs?'));assert.equal(start.body.maxPagesToCrawl,1);assert.equal(start.body.crawlScope,'same-hostname');assert.equal(start.body.useProxy,false);
 assert.match(result.results[0].text,/not traffic, speed or runtime/);
});

test('a selected LinkedIn company profile must match both the observed company URL and brand website',async()=>{
 const url='https://www.linkedin.com/company/ornekpet/',row={linkedinUrl:url,website:brief.website,name:brief.brandName,description:'Örnek Pet bakım ürünleri üretir.',employeeCount:12,followerCount:40};
 const native=nativeSample('harvestapi/linkedin-company-search',[row]);
 const output=await native.providers.specialist(task(url,'profile'),context(url));assert.equal(output.results.length,1);
 assert.match(output.results[0].text,/employees: 12/);const start=native.calls.find(call=>call.url.includes('/runs?'));
 assert.equal(start.body.maxItems,1);assert.equal(start.body.takePages,1);
 const wrong=nativeSample('harvestapi/linkedin-company-search',[{...row,website:'https://other.example.com/'}]);
 assert.deepEqual((await wrong.providers.specialist(task(url,'profile'),context(url))).results,[]);
});

test('only the requested valid Instagram date window reaches the actor; out-of-window pinned posts are not evidence',async()=>{
 const actor='apify/instagram-scraper',native=nativeSample(actor,[
  {url:post,ownerUsername:'ornekpet',caption:'Eski sabit gönderi',timestamp:'2025-01-01T12:00:00Z'},
  {url:'https://www.instagram.com/p/NEW123/',ownerUsername:'ornekpet',caption:'Yeni ürünün uygulama örneği',timestamp:'2026-11-20T12:00:00Z',videoPlayCount:20}]);
 const result=await native.providers.specialist({...task(social,'posts',2),since:'2026-11-01'},context(social));
 const start=native.calls.find(row=>row.url.includes('/runs?'));assert.equal(start.body.onlyPostsNewerThan,'2026-11-01');assert.equal(start.body.resultsLimit,2);
 assert.equal(result.results.length,1);assert.equal(result.sample.since,'2026-11-01');assert.match(result.results[0].text,/videoPlayCount: 20/);assert.doesNotMatch(JSON.stringify(result.results),/Eski sabit/);
 const before=native.calls.length;
 for(const request of [{...task(social,'posts'),since:'2026-02-31'},{...task('https://www.tiktok.com/@ornekpet','posts'),since:'2026-11-01'},task(social,'profile',2),task(source.url,'product')])
  await assert.rejects(native.providers.specialist(request,context(request.url)),e=>e.code==='actor_scope_unsupported');
 assert.equal(native.calls.length,before);
});

test('unofficial social pages and wrong-product records cannot be admitted as brand evidence',async()=>{
 const native=nativeSample('apify/instagram-scraper',[{url:post,ownerUsername:'ornekpet',caption:'Bu gönderi bir arama sonucunda bulundu; resmi hesap bağlantısı yok.',timestamp:'2026-11-20'}]);
 const output=await native.providers.specialist(task(social,'posts'),{brief,sources:[source,{...source,url:social,links:[]}]});
 assert.deepEqual(output.results,[]);
 const amazon=nativeSample('junglee/free-amazon-product-scraper',[{asin:'B098765432',brand:brief.brandName,title:'Başka ürün',price:{value:10,currency:'TRY'}}]);
 assert.deepEqual((await amazon.providers.specialist(task('https://www.amazon.com.tr/dp/B012345678','product'),context('https://www.amazon.com.tr/dp/B012345678'))).results,[]);
});

test('new sampling modes preserve a lower actor cap, the final reserve and the one shared 50 TRY account',async()=>{
 const url='https://www.trendyol.com/ornekpet/sprey-p-12345',native=nativeSample('fatihtahta/trendyol-scraper',[],{cap:.001});
 await native.providers.specialist(task(url,'product'),context(url),{remainingReserve:1200});
 const start=native.calls.find(row=>row.url.includes('/runs?'));assert.equal(new URL(start.url).searchParams.get('maxTotalChargeUsd'),'0.001');assert.ok(native.total()<=3800);
 const blocked=nativeSample('fatihtahta/trendyol-scraper',[],{charged:4900});
 await assert.rejects(blocked.providers.specialist(task(url,'product'),context(url),{remainingReserve:100}),e=>e.code==='actor_limit_unverified');
 assert.equal(blocked.calls.filter(row=>row.url.includes('/runs?')).length,0);assert.equal(blocked.total(),4900);
});

test('an uncertain new product run cannot be started again and its original commitment stays charged',async()=>{
 const url='https://www.trendyol.com/ornekpet/sprey-p-12345',native=nativeSample('fatihtahta/trendyol-scraper',[],{timeout:true});
 await assert.rejects(native.providers.specialist(task(url,'product'),context(url)));const charged=native.total();
 await assert.rejects(native.providers.specialist(task(url,'product'),context(url)));assert.equal(native.total(),charged);
 assert.equal(native.calls.filter(row=>row.url.includes('/runs?')).length,1);
});

test('product sampling cannot bypass the initial observed-URL and Tavily read attempt',async()=>{
 const {ledger}=memoryLedger();await seed(ledger);
 const providers=scriptedProviders(ledger,[assistantCall('specialist_read',task(source.url,'product'))]);let calls=0;
 providers.specialist=async()=>{calls++;assert.fail('A product without initial page read cannot buy a scraper run');};
 const turn=await advanceConversation({brief,ledger,id,providers,now});assert.equal(turn.toolIssues[0].code,'source_not_tried');assert.equal(calls,0);
});
