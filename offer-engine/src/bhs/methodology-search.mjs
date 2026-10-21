import {methodologyAreas} from './methodology-areas.mjs';

// One explicit research query per original methodology area. Interleave the
// six dimensions so a bounded page reader cannot spend its first slots on only
// financial/product pages. Query templates are data retrieval, not AI verdicts.
const terms={
 financial:[['annual revenue funding investment financial results','ciro büyüme yatırım finansal sonuçlar'],['product prices marketplace sales reviews','ürün fiyat pazaryeri satış yorum'],['hiring jobs layoffs expansion','iş ilanı işe alım küçülme büyüme'],['revenue product distribution channels concentration','gelir ürün dağıtım kanalı yoğunlaşma']],
 operations:[['LinkedIn team employees departments jobs','LinkedIn ekip çalışan departman iş ilanı'],['ecommerce platform CRM automation technology','e ticaret altyapı CRM otomasyon teknoloji'],['delivery returns customer service complaints','kargo iade müşteri hizmetleri şikayet'],['manufacturing capacity logistics expansion partners','üretim kapasite lojistik genişleme iş ortakları']],
 funnel:[['advertising organic content social channels','reklam organik içerik sosyal kanallar'],['landing page newsletter free guide quotation','açılış sayfası bülten ücretsiz rehber teklif'],['blog SEO content measurement analytics','blog SEO içerik analitik ölçüm'],['products checkout booking request quote','ürün ödeme randevu teklif formu'],['subscription loyalty email community customer content','abonelik sadakat e posta topluluk müşteri içerikleri']],
 digital:[['website PageSpeed mobile loading Core Web Vitals','web sitesi PageSpeed mobil hız Core Web Vitals'],['website analytics tracking pixel platform','web sitesi analitik ölçüm piksel altyapı'],['Similarweb Semrush traffic authority backlinks','Similarweb Semrush trafik otorite backlink'],['official Instagram Facebook TikTok followers engagement','resmi Instagram Facebook TikTok takipçi etkileşim'],['Meta Ad Library active advertising creative','Meta reklam kütüphanesi aktif reklam kreatif']],
 perception:[['customer ratings reviews Trustpilot Google','müşteri puan yorum Trustpilot Google'],['customer complaints brand response returns','müşteri şikayet marka yanıt iade'],['brand search trends customer mentions community','marka arama trend müşteri bahsetme topluluk']],
 competition:[['website traffic social engagement comparison','web trafik sosyal etkileşim karşılaştırma'],['product prices positioning differences comparison','ürün fiyat konumlandırma fark karşılaştırma'],['competitor strongest channels advertising strategy','rakip güçlü kanallar reklam stratejisi']]
};
export function methodologySearchQueries(brief,plan){
 const brand='"'+brief.brandName.replace(/["\\]/g,'')+'"',domain=new URL(brief.website).hostname;
 const tr=/\.tr$/.test(domain)||(plan.researchQueries||[]).filter(q=>/[çğıöşü]|\b(?:müşteri|marka|rakip)\b/i.test(q.query)).length>=3;
 const peers=plan.entities.filter(e=>e.role==='competitor').map(e=>e.name.replace(/["\\]/g,''));
 const rows=methodologyAreas.map(a=>{const index=Number(a.key.split('_').at(-1))-1,base=a.dimension==='digital'?domain:brand,peer=a.dimension==='competition'&&peers.length?' '+peers.map(p=>'"'+p+'"').join(' '):'';return {...a,query:(base+peer+' '+terms[a.dimension][index][tr?1:0]).slice(0,500)};});
 return rows.sort((a,b)=>Number(a.key.split('_').at(-1))-Number(b.key.split('_').at(-1))||methodologyAreas.findIndex(x=>x.key===a.key)-methodologyAreas.findIndex(x=>x.key===b.key));
}
