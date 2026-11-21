import {BudgetError} from '../budget/ledger.mjs';
import {publicResearchUrl} from './conversation-contract.mjs';

export const samplingGuidance='DAR ÖRNEKLEM: Önce karar için gerekli ürünü, teknik sayfayı, sosyal profili veya itibar sorusunu seç; bütün kanalları otomatik tarama. specialist_read: page başarısız Tavily sayfası; product gözlemlenen markanın tek Trendyol/Amazon ürünü; technical markanın seçili tek sayfasının statik SEO verisi; profile Instagram/LinkedIn; posts Instagram/LinkedIn/TikTok; reviews Trendyol/Şikayetvar veya resmi Instagram gönderisi yorumları. Önce mevcut gövdeyi ve ücretsiz arşivi kullan. sampleSize 1–5 iste; tekil page/product/profile/technical için 1 kullan. Yalnız Instagram posts isteğinde isteğe bağlı since:YYYY-MM-DD desteklenir. sample kaydı kapsamı ve dönen kayıt sayısını gösterir: bu tam dönem/faaliyet/satış veya itibar ölçümü değildir. Az/boş örneklem yokluk kanıtı, yayın sıklığı veya takipçi artışı değildir; tek gözlemden trend çıkarma. Önemli kamu sorusu yanıtlanmadıysa açık tut ve uygun başka kaynak değerlendir.';
const single=new Set(['page','product','profile','technical']);
export function specialistSelection(request,brief){
 const url=publicResearchUrl(request.url),mode=request.mode,limit=request.sampleSize,host=url&&new URL(url).hostname.replace(/^www\./u,'');
 if(!url||!Number.isSafeInteger(limit)||limit<1||limit>5||!['page','product','technical','reviews','posts','profile'].includes(mode)||
  typeof request.purpose!=='string'||!request.purpose.trim())throw new BudgetError('invalid_query','Dar scraper görevi gerekli.');
 if(single.has(mode)&&limit!==1)throw new BudgetError('actor_scope_unsupported','Tekil kaynak için sampleSize:1 kullan.');
 const instagram=host==='instagram.com',linkedin=host==='linkedin.com',tiktok=host==='tiktok.com',trendyol=host==='trendyol.com';
 if(request.since!==undefined&&(!instagram||mode!=='posts'||typeof request.since!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(request.since)||
  !Number.isFinite(Date.parse(request.since))||new Date(request.since).toISOString().slice(0,10)!==request.since))
  throw new BudgetError('actor_scope_unsupported','Bu aktör bu dönem sınırını desteklemiyor.');
 let candidates=[];
 if(mode==='page')candidates=['apify/rag-web-browser'];
 else if(mode==='product')candidates=trendyol?['fatihtahta/trendyol-scraper']:/^amazon\.(?:com|co\.uk|de|fr|it|es|com\.tr)$/u.test(host)?['junglee/free-amazon-product-scraper']:[];
 else if(mode==='technical'&&new URL(brief.website).hostname.replace(/^www\./u,'')===host)candidates=['logiover/website-seo-audit-crawler'];
 else if(mode==='reviews')candidates=trendyol?['shahidirfan/trendyol-reviews-scraper']:host==='sikayetvar.com'?['tamgadev/sikayetvar-scraper']:instagram?['apify/instagram-comment-scraper']:[];
 else if(instagram)candidates=[mode==='profile'?'apify/instagram-profile-scraper':'apify/instagram-scraper'];
 else if(linkedin)candidates=[mode==='profile'?'harvestapi/linkedin-company-search':'harvestapi/linkedin-post-search'];
 else if(tiktok&&mode==='posts')candidates=['clockworks/tiktok-scraper'];
 if(!candidates.length)throw new BudgetError('actor_scope_unsupported','Bu hedef için istenen dar örneklem desteklenmiyor.');
 return {url,mode,limit,candidates};
}

// Multiple comments can have the same canonical page URL. Keep their whole
// bounded sample under that source identity instead of overwriting each other.
export function sampledSources(pages,request,actor,retrievedAt){
 if(!Array.isArray(pages)||pages.length>request.sampleSize)throw new BudgetError('actor_output_limit','Örneklem istenen kayıt sınırını aşıyor.');
 const groups=new Map();
 for(const page of pages){
  const url=publicResearchUrl(page.url);
  if(!url||typeof page.text!=='string'||!page.text.trim())continue;
  const rows=groups.get(url)||[];rows.push(page.text);groups.set(url,rows);
 }
 const total=[...groups.values()].reduce((n,rows)=>n+rows.length,0);
 return [...groups].map(([url,rows])=>({url,title:actor+' · '+url,text:rows.join('\n\n'),method:'extracted',
  sample:{actor,mode:request.mode,requestedRecords:request.sampleSize,returnedRecords:total,sourceRecords:rows.length,
   ...(request.since?{since:request.since}:{}),...(retrievedAt?{retrievedAt}:{}),
   scope:'Sınırlı kamu örneklemi; tam dönem, genel performans, bütün yorumlar veya satış ölçümü değildir.'}}));
}
