import {BudgetError} from '../budget/ledger.mjs';
import {researchUrl,researchHost} from './research-url.mjs';

// Schemas re-read from the connected Store on 2026-11-10. All inputs are built
// here; model text, cookies, proxy credentials and unbounded options are rejected.
export const actorIds=Object.freeze({
 'harvestapi/linkedin-company-search':'taHaRcqil3scbchuI','harvestapi/linkedin-post-search':'buIWk2uOUzTmcLsuB',
 'curious_coder/linkedin-jobs-scraper':'hKByXkMQaC5Qt9UMN','apify/instagram-profile-scraper':'dSCLg0C3YEZ83HzYX',
 'apify/instagram-scraper':'shu8hvrXbJbY3Eb9W','compass/crawler-google-places':'nwua9Gu5YrADL7ZDj',
 'jmlp/meta-ad-library-scraper':'cslF6vIR8573iFopX','logiover/website-seo-audit-crawler':'hGO9TU7F0OD97VxNC',
 'apify/website-content-crawler':'aYG0l9s7dbB7j3gbS','clockworks/tiktok-scraper':'GdWCkxBtKWOsKjdch',
 'fatihtahta/trendyol-scraper':'AoPP8ru9uKws5t80G','junglee/free-amazon-product-scraper':'XVDTQc4a7MDTqSTMJ','damilo/google-shopping-apify':'F1ITW3XNjGuy7ZzcM'
});
export function observedActorTargets(context){
 const urls=new Set([researchUrl(context.brief.website)]),official=new Set(urls);
 for(const source of context.packet.sources||[]){
  urls.add(researchUrl(source.finalUrl||source.url));
  for(const link of source.technicalSignals?.navigation||[]){const url=researchUrl(link.url);if(url){urls.add(url);if(researchHost(source.finalUrl)===researchHost(context.brief.website))official.add(url);}}
 }
 for(const s of context.searches||[])for(const r of s.results||[])urls.add(researchUrl(r.url));
 return {urls,official};
}
export function actorInput(request,context,known=observedActorTargets(context)){
 const {actor}=request,url=researchUrl(request.url);
 if(!actorIds[actor]||!url||!known.urls.has(url))throw new BudgetError('actor_source_unverified','Aktör için gözlemlenmiş kaynak URLsi gerekli.');
 const u=new URL(url),host=researchHost(url),parts=u.pathname.split('/').filter(Boolean);
 const locale=()=>{const g=context.geo;if(!g||request.countryCode!==g.countryCode||request.language!==g.language||!['TR','GB','US','DE','FR','IT','ES','NL'].includes(g.countryCode))throw new BudgetError('actor_locale_unverified','Aktör için doğrulanmış hedef ülke ve dil gerekli.');return g;};
 const bad=()=>{throw new BudgetError('actor_source_unverified','Aktör hedefi bu kaynağa uygun değil.');};
 if(actor==='apify/instagram-profile-scraper'||actor==='apify/instagram-scraper'){
  if(host!=='instagram.com'||parts.length!==1||!/^[\w.]+$/.test(parts[0])||['p','reel','explore','accounts','stories'].includes(parts[0]))return bad();
  return {input:actor.endsWith('profile-scraper')?{usernames:[parts[0]],includeAboutSection:false}:{directUrls:[url],resultsType:'posts',resultsLimit:6,addParentData:false},maxItems:actor.endsWith('profile-scraper')?1:6,url,official:known.official.has(url)};
 }
 if(actor.startsWith('harvestapi/linkedin-')){
  if(host!=='linkedin.com'||parts[0]!=='company'||parts.length!==2)return bad();
  return {input:actor.endsWith('company-search')?{scraperMode:'full',searchQuery:'"'+context.brief.brandName.replace(/"/g,'')+'"',maxItems:1,startPage:1,takePages:1}:{authorUrls:[url],maxPosts:5,postedLimit:'year',sortBy:'date',profileScraperMode:'short',startPage:1,scrapePages:1,scrapeReactions:false,maxReactions:0,scrapeComments:false,maxComments:0},maxItems:actor.endsWith('company-search')?1:5,url,official:known.official.has(url)};
 }
 if(actor==='curious_coder/linkedin-jobs-scraper'){
  if(host!=='linkedin.com'||!u.pathname.startsWith('/jobs/search')||!u.searchParams.has('f_C'))return bad();
  return {input:{urls:[url],autoConvertToAiSearch:false,scrapeCompany:false,limitPerSource:3,splitByLocation:false},maxItems:3,url};
 }
 if(actor==='logiover/website-seo-audit-crawler'||actor==='apify/website-content-crawler'){
  if(host!==researchHost(context.brief.website))return bad();
  return {input:actor.startsWith('logiover/')?{startUrls:[{url}],crawlScope:'same-hostname',maxPagesToCrawl:5,maxConcurrency:2,useProxy:false}:{startUrls:[{url}],crawlerType:'cheerio',maxCrawlPages:3,maxResults:3,maxCrawlDepth:1,maxConcurrency:2,maxRequestRetries:0,maxSessionRotations:0,requestTimeoutSecs:20,proxyConfiguration:{useApifyProxy:false},blockMedia:true,saveMarkdown:true,saveHtml:false,saveFiles:false,saveScreenshots:false,summarize:false,useSitemaps:false},maxItems:actor.startsWith('logiover/')?5:3,url,official:true};
 }
 if(actor==='compass/crawler-google-places'){
  if(!/^(?:maps\.)?google\.[a-z.]+$/.test(host)||!u.pathname.startsWith('/maps'))return bad();
  return {input:{startUrls:[{url}],maxCrawledPlacesPerSearch:1,maxReviews:5,reviewsOrigin:'google',scrapeReviewsPersonalData:false,maxImages:0,scrapeImageAuthors:false,maxQuestions:0,scrapeContacts:false,scrapePlaceDetailPage:false,scrapeSocialMediaProfiles:{facebooks:false,instagrams:false,youtubes:false,tiktoks:false,twitters:false},maximumLeadsEnrichmentRecords:0,enableCompetitorAnalysis:false,scrapeDirectories:false,includeWebResults:false,scrapeOrderOnline:false,scrapeTableReservationProvider:false},maxItems:1,url,official:known.official.has(url)};
 }
 if(actor==='clockworks/tiktok-scraper'){
  if(host!=='tiktok.com'||parts.length!==1||!/^@[\w.]+$/.test(parts[0]))return bad();
  return {input:{profiles:[parts[0].slice(1)],resultsPerPage:5,profileScrapeSections:['videos'],maxFollowersPerProfile:0,maxFollowingPerProfile:0,scrapeAdditionalAuthorMeta:false,shouldDownloadVideos:false,shouldDownloadCovers:false,shouldDownloadSlideshowImages:false,shouldDownloadAvatars:false,shouldDownloadMusicCovers:false,downloadSubtitlesOptions:'NEVER_DOWNLOAD_SUBTITLES',aiVideoDescription:false,aiVideoSummary:false,commentsPerPost:0,topLevelCommentsPerPost:0,maxRepliesPerComment:0},maxItems:5,url,official:known.official.has(url)};
 }
 if(actor==='fatihtahta/trendyol-scraper'){
  if(host!=='trendyol.com'||!/-p-\d+/.test(u.pathname))return bad();
  return {input:{startUrls:[url],limit:2,enrich_data:false,getReviews:false,maxReviews:0,getQna:false,maxQna:0},maxItems:2,url};
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
  return {input:{adLibraryUrl:target,pageID:'',keyword:'',maxAds:6,maxPages:1,maxConcurrency:1,country:g.countryCode,activeStatus:'active',raw:false,continueFromLastRun:false},maxItems:6,url,official:known.official.has(url)};
 }
 if(actor==='damilo/google-shopping-apify'){
  const g=locale();if(host!==researchHost(context.brief.website))return bad();
  return {input:{query:context.brief.brandName,country:g.countryCode.toLowerCase(),language:g.language,num:'10',max_pages:1,date_range:'anytime'},maxItems:10,url,scope:'Search results, not brand market share.'};
 }
 return bad();
}
