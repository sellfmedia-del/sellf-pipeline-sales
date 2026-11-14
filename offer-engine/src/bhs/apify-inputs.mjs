import {BudgetError} from '../budget/ledger.mjs';
import {researchUrl,researchHost} from './research-url.mjs';
import {isIP} from 'node:net';

// Schemas re-read from the connected Store on 2026-11-10. All inputs are built
// here; model text, cookies, proxy credentials and unbounded options are rejected.
export const actorIds=Object.freeze({
 'apify/google-search-scraper':'nFJndFXA5zjCTuudP','apify/instagram-comment-scraper':'SbK00X0JYCPblD2wp',
 'themineworks/google-search-scraper':'Rfu9Bmd2sLIpomMCk','desearch/web-search':'WMg2EXLzJGPVQ5Vfq',
 'apify/rag-web-browser':'3ox4R101TgZz67sLr',
 'tamgadev/sikayetvar-scraper':'RfNLBQU0JUXqBiPmF','shahidirfan/trendyol-reviews-scraper':'OGPwnfIwxF1lIOYRn',
 'compass/google-maps-reviews-scraper':'Xb8osYTtOjlsgI6k9',
 'harvestapi/linkedin-company-search':'taHaRcqil3scbchuI','harvestapi/linkedin-post-search':'buIWk2uOUzTmcLsuB',
 'curious_coder/linkedin-jobs-scraper':'hKByXkMQaC5Qt9UMN','apify/instagram-profile-scraper':'dSCLg0C3YEZ83HzYX',
 'apify/instagram-scraper':'shu8hvrXbJbY3Eb9W','compass/crawler-google-places':'nwua9Gu5YrADL7ZDj',
 'jmlp/meta-ad-library-scraper':'cslF6vIR8573iFopX','logiover/website-seo-audit-crawler':'hGO9TU7F0OD97VxNC',
 'apify/website-content-crawler':'aYG0l9s7dbB7j3gbS','clockworks/tiktok-scraper':'GdWCkxBtKWOsKjdch',
 'fatihtahta/trendyol-scraper':'AoPP8ru9uKws5t80G','junglee/free-amazon-product-scraper':'XVDTQc4a7MDTqSTMJ','damilo/google-shopping-apify':'F1ITW3XNjGuy7ZzcM'
});
export const searchActors=['themineworks/google-search-scraper','apify/google-search-scraper','desearch/web-search'];
export function observedActorTargets(context){
 const urls=new Set([researchUrl(context.brief.website)]),official=new Set(urls);
 for(const source of context.packet.sources||[]){
  urls.add(researchUrl(source.finalUrl||source.url));
  for(const link of source.technicalSignals?.navigation||[]){const url=researchUrl(link.url);if(url){urls.add(url);if(researchHost(source.finalUrl)===researchHost(context.brief.website))official.add(url);}}
 }
 for(const s of context.searches||[])for(const r of s.results||[])urls.add(researchUrl(r.url));
 for(const scrape of context.scrapes||[])if(scrape.actor==='apify/instagram-scraper'&&scrape.status==='complete'){
  for(const page of scrape.pages||[]){urls.add(researchUrl(page.url));official.add(researchUrl(page.url));}
 }
 return {urls,official};
}
export function actorInput(request,context,known=observedActorTargets(context)){
 const {actor}=request,url=researchUrl(request.url);
 const limit=maximum=>request.maxResults===undefined?maximum:Math.max(1,Math.min(maximum,request.maxResults));
 if(!actorIds[actor]||!url||!known.urls.has(url))throw new BudgetError('actor_source_unverified','Aktör için gözlemlenmiş kaynak URLsi gerekli.');
 const u=new URL(url),host=researchHost(url),parts=u.pathname.split('/').filter(Boolean);
 const locale=()=>{const g=context.geo;if(!g||request.countryCode!==g.countryCode||request.language!==g.language||!['TR','GB','US','DE','FR','IT','ES','NL'].includes(g.countryCode))throw new BudgetError('actor_locale_unverified','Aktör için doğrulanmış hedef ülke ve dil gerekli.');return g;};
 const bad=()=>{throw new BudgetError('actor_source_unverified','Aktör hedefi bu kaynağa uygun değil.');};
 if(request.maxResults!==undefined&&(!Number.isInteger(request.maxResults)||request.maxResults<1))return bad();
 if(actor==='apify/rag-web-browser'){
  if(isIP(host.replace(/^\[|\]$/g,''))||!/[.](?:[a-z]{2,}|xn--[a-z0-9-]+)$/i.test(host)||/\.(?:local|internal|test|invalid|localhost)$/i.test(host))return bad();
  return {input:{query:url,maxResults:1,outputFormats:['markdown'],scrapingTool:'browser-playwright',requestTimeoutSecs:22,maxRequestRetries:0,dynamicContentWaitSecs:4,desiredConcurrency:1},maxItems:1,url};
 }
 if(actor==='tamgadev/sikayetvar-scraper'){
  if(host!=='sikayetvar.com'||!parts[0]||!/^[\w-]+$/.test(parts[0]))return bad();
  return {input:{brands:[parts[0]],maxComplaints:limit(5),maxPagesPerBrand:1,scrapeDetails:true},maxItems:limit(5),url};
 }
 if(actor==='shahidirfan/trendyol-reviews-scraper'){
  const productId=u.pathname.match(/-p-(\d+)(?:\/|$)/)?.[1];
  if(host!=='trendyol.com'||!productId)return bad();
  return {input:{startUrls:[url],productId,results_wanted:limit(5),max_pages:1,sortBy:'Rate'},maxItems:limit(5),url};
 }
 if(searchActors.includes(actor)){
  const queries=request.queries;
  if(url!==researchUrl(context.brief.website)||!Array.isArray(queries)||!queries.length||queries.length>8||
   queries.some(q=>typeof q!=='string'||!q.trim()||q.length>480||/[\r\n]/.test(q)||/^\s*(?:https?:|\/\/)/i.test(q)))return bad();
  const geo=context.geo,terms=queries.map(q=>q.trim().split(/\s+/).slice(0,32).join(' '));
  const country=geo&&/^(?:TR|GB|US|DE|FR|IT|ES|NL)$/.test(geo.countryCode)?{countryCode:geo.countryCode.toLowerCase()}:{};
  if(actor==='themineworks/google-search-scraper')return {input:{queries:terms,...country,maxPagesPerQuery:1,resultsPerPage:limit(8),outputFormat:'pages',resolveUrls:true},maxItems:queries.length+1,url};
  if(actor==='desearch/web-search'){
   if(terms.length!==1)return bad();
   return {input:{query:terms[0],num:limit(8),start:0},maxItems:limit(8),url};
  }
  return {input:{queries:terms.join('\n'),maxPagesPerQuery:1,...country,
   aiOverview:false,aiModeSearch:false,geminiSearch:false,perplexitySearch:false,chatGptSearch:false,copilotSearch:false,
   maximumLeadsEnrichmentRecords:0,verifyLeadsEnrichmentEmails:false,websiteContentScraper:false,focusOnPaidAds:false,saveHtml:false,saveHtmlToKeyValueStore:false},maxItems:queries.length,url};
 }
 if(actor==='apify/instagram-comment-scraper'){
  const scoped=known.official.has(url);
  if(!scoped||host!=='instagram.com'||!/^\/(?:[\w.]+\/)?(?:p|reel)\/[\w-]+\/?$/.test(u.pathname))return bad();
  return {input:{directUrls:[url],resultsLimit:request.maxResults===undefined?6:limit(12),includeNestedComments:false},maxItems:request.maxResults===undefined?6:limit(12),url,official:true};
 }
 if(actor==='compass/google-maps-reviews-scraper'){
  if(!known.official.has(url)||!(/^(?:maps\.)?google\.[a-z.]+$/.test(host)&&u.pathname.startsWith('/maps/place/')||host==='maps.app.goo.gl'))return bad();
  return {input:{startUrls:[{url}],maxReviews:limit(5),reviewsOrigin:'google',personalData:false},maxItems:limit(5),url,official:true};
 }
 if(actor==='apify/instagram-profile-scraper'||actor==='apify/instagram-scraper'){
  if(host!=='instagram.com'||parts.length!==1||!/^[\w.]+$/.test(parts[0])||['p','reel','explore','accounts','stories'].includes(parts[0]))return bad();
  return {input:actor.endsWith('profile-scraper')?{usernames:[parts[0]],includeAboutSection:false}:{directUrls:[url],resultsType:'posts',resultsLimit:request.maxResults===undefined?6:limit(12),addParentData:false},maxItems:actor.endsWith('profile-scraper')?1:request.maxResults===undefined?6:limit(12),url,official:known.official.has(url)};
 }
 if(actor.startsWith('harvestapi/linkedin-')){
  if(host!=='linkedin.com'||parts[0]!=='company'||parts.length!==2)return bad();
  return {input:actor.endsWith('company-search')?{scraperMode:'full',searchQuery:'"'+context.brief.brandName.replace(/"/g,'')+'"',maxItems:1,startPage:1,takePages:1}:{authorUrls:[url],maxPosts:limit(5),postedLimit:'year',sortBy:'date',profileScraperMode:'short',startPage:1,scrapePages:1,scrapeReactions:request.mode==='engagement',maxReactions:request.mode==='engagement'?limit(5):0,scrapeComments:request.mode==='reviews',maxComments:request.mode==='reviews'?limit(5):0},maxItems:actor.endsWith('company-search')?1:limit(5),url,official:known.official.has(url)};
 }
 if(actor==='curious_coder/linkedin-jobs-scraper'){
  if(host!=='linkedin.com'||!u.pathname.startsWith('/jobs/search')||!u.searchParams.has('f_C'))return bad();
  return {input:{urls:[url],autoConvertToAiSearch:false,scrapeCompany:false,limitPerSource:limit(3),splitByLocation:false},maxItems:limit(3),url};
 }
 if(actor==='logiover/website-seo-audit-crawler'||actor==='apify/website-content-crawler'){
  if(host!==researchHost(context.brief.website))return bad();
  return {input:actor.startsWith('logiover/')?{startUrls:[{url}],crawlScope:'same-hostname',maxPagesToCrawl:limit(5),maxConcurrency:2,useProxy:false}:{startUrls:[{url}],crawlerType:'cheerio',maxCrawlPages:limit(3),maxResults:limit(3),maxCrawlDepth:1,maxConcurrency:2,maxRequestRetries:0,maxSessionRotations:0,requestTimeoutSecs:20,proxyConfiguration:{useApifyProxy:false},blockMedia:true,saveMarkdown:true,saveHtml:false,saveFiles:false,saveScreenshots:false,summarize:false,useSitemaps:false},maxItems:limit(actor.startsWith('logiover/')?5:3),url,official:true};
 }
 if(actor==='compass/crawler-google-places'){
  if(!/^(?:maps\.)?google\.[a-z.]+$/.test(host)||!u.pathname.startsWith('/maps'))return bad();
  return {input:{startUrls:[{url}],maxCrawledPlacesPerSearch:1,maxReviews:request.mode&&request.mode!=='reviews'?0:limit(5),reviewsOrigin:'google',scrapeReviewsPersonalData:false,maxImages:0,scrapeImageAuthors:false,maxQuestions:0,scrapeContacts:false,scrapePlaceDetailPage:false,scrapeSocialMediaProfiles:{facebooks:false,instagrams:false,youtubes:false,tiktoks:false,twitters:false},maximumLeadsEnrichmentRecords:0,enableCompetitorAnalysis:false,scrapeDirectories:false,includeWebResults:false,scrapeOrderOnline:false,scrapeTableReservationProvider:false},maxItems:1,url,official:known.official.has(url)};
 }
 if(actor==='clockworks/tiktok-scraper'){
  if(host!=='tiktok.com'||parts.length!==1||!/^@[\w.]+$/.test(parts[0]))return bad();
  return {input:{profiles:[parts[0].slice(1)],resultsPerPage:limit(5),profileScrapeSections:['videos'],maxFollowersPerProfile:0,maxFollowingPerProfile:0,scrapeAdditionalAuthorMeta:false,shouldDownloadVideos:false,shouldDownloadCovers:false,shouldDownloadSlideshowImages:false,shouldDownloadAvatars:false,shouldDownloadMusicCovers:false,downloadSubtitlesOptions:'NEVER_DOWNLOAD_SUBTITLES',aiVideoDescription:false,aiVideoSummary:false,commentsPerPost:0,topLevelCommentsPerPost:0,maxRepliesPerComment:0},maxItems:limit(5),url,official:known.official.has(url)};
 }
 if(actor==='fatihtahta/trendyol-scraper'){
  if(host!=='trendyol.com'||!/-p-\d+/.test(u.pathname))return bad();
  if(request.customerReviews===true||request.mode==='reviews')return {input:{startUrls:[url],limit:1,enrich_data:false,getReviews:true,maxReviews:limit(5),getQna:false,maxQna:0},maxItems:1+limit(5),url};
  return {input:{startUrls:[url],limit:limit(2),enrich_data:false,getReviews:false,maxReviews:0,getQna:false,maxQna:0},maxItems:limit(2),url};
 }
 if(actor==='junglee/free-amazon-product-scraper'){
  if(!/^(?:[a-z]+\.)?amazon\.(?:com|co\.uk|de|fr|it|es|com\.tr)$/.test(host)||!/(?:\/dp\/|\/gp\/product\/)[A-Z0-9]{10}/i.test(u.pathname))return bad();
  return {input:{categoryUrls:[{url}],maxItemsPerStartUrl:1,maxSearchPagesPerStartUrl:1,maxProductVariantsAsSeparateResults:0,useCaptchaSolver:false,scrapeProductVariantPrices:false,scrapeProductDetails:true},maxItems:1,url};
 }
 if(actor==='jmlp/meta-ad-library-scraper'){
  const g=locale();if(host!=='facebook.com')return bad();
  let target=url;
  if(u.pathname.startsWith('/ads/library')){const id=u.searchParams.get('view_all_page_id');if(!/^\d+$/.test(id||''))return bad();target='https://www.facebook.com/ads/library/?view_all_page_id='+id+'&country='+g.countryCode+'&active_status=active';}
  else if(parts.length!==1)return bad();
  return {input:{adLibraryUrl:target,pageID:'',keyword:'',maxAds:limit(6),maxPages:1,maxConcurrency:1,country:g.countryCode,activeStatus:'active',raw:false,continueFromLastRun:false},maxItems:limit(6),url,official:known.official.has(url)};
 }
 if(actor==='damilo/google-shopping-apify'){
  const g=locale();if(host!==researchHost(context.brief.website))return bad();
  return {input:{query:request.query||context.brief.brandName,country:g.countryCode.toLowerCase(),language:g.language,num:String(limit(10)),max_pages:1,date_range:'anytime'},maxItems:limit(10),url,scope:'Search results, not brand market share.'};
 }
 return bad();
}
