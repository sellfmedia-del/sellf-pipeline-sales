// Source: 01-Maliyet-ve-Teklif-Fiyat-Hesaplamas-.xlsx, Hizmet Bedelleri.
// Monetary values are TL/month; money is calculated in integer kuruş downstream.
const rows=[
 ['account','Account Director / Manager',2,[10000,15000,20000],'account'],
 ['growth_initial','Growth Ekibi Tam Kapsam',3,[40000,60000,80000],'growth'],
 ['growth_after','Growth Ekibi Planlama Sonrası',4,[20000,45000,60000],'growth'],
 ['growth_consultant','Growth Ekibi Minimum — Tek Danışman',5,[15000,30000,40000],'growth'],
 ['meta','Meta Reklam Yönetimi',6,[6000,9000,12000]],
 ['google_ads','Google Ads Reklam Yönetimi',7,[6000,9000,12000]],
 ['b2b','B2B Dijital Pazarlama',8,[10000,15000,15000]],
 ['programmatic','Programmatic Reklam',9,[0,15000,20000]],
 ['onsite_seo','On Site SEO',10,[6000,9000,12000]],
 ['offsite_seo','Off Site SEO',11,[8000,10000,12000]],
 ['technical_seo','Teknik SEO',12,[8000,12000,15000]],
 ['marketplace','E-Ticaret Pazaryeri',13,[9000,12000,15000]],
 ['ecommerce_planning','E-Ticaret Danışmanlık ve Planlama',14,[6000,9000,12000]],
 ['social','Sosyal Medya Yönetimi',15,[10000,15000,20000]],
 ['design','Statik ve Motion Tasarım',16,[10000,20000,30000]],
 ['webmaster','Webmaster — HTML, WordPress, Wix',17,[6000,9000,12000]],
 ['brand_marketing','Marka Pazarlama',18,[10000,15000,20000]],
 ['influencer','Influencer Pazarlama',19,[0,0,0],'commission'],
 ['ai','Yapay Zeka Entegrasyon ve Pazarlama',20,[0,0,0],'custom'],
 ['fulfillment','Fulfillment ve Lojistik Planlama',21,[0,20000,25000]],
 ['moderation','Moderasyon',22,[5000,10000,15000]],
 ['media_planning','Medya ve Bütçe Planlama',23,[6000,9000,12000]],
 ['tiktok','TikTok Reklam Yönetimi',24,[6000,9000,12000]],
 ['amazon_ppc','Amazon PPC',25,[0,10000,15000]],
 ['ugc','Barter ve UGC Influencer',26,[10000,12500,15000]],
 ['ecommerce_webmaster','E-Ticaret Altyapısı Webmaster',27,[15000,20000,25000]],
 ['custom_webmaster','Özel Yazılım ve App Webmaster',28,[0,0,0],'custom']
];
export const costVersion='sellf-costs-2026-10-19-v1';
export const segments=Object.freeze(['kobi','corporate','key_account']);
export const catalog=Object.freeze(rows.map(([id,name,row,values,kind='fixed'])=>Object.freeze({id,name,row,kind,costs:Object.freeze(Object.fromEntries(segments.map((segment,i)=>[segment,values[i]])))})));
export const operations=Object.freeze(catalog.filter(row=>['fixed','commission','custom'].includes(row.kind)));
export const byId=Object.freeze(Object.fromEntries(catalog.map(row=>[row.id,row])));
export const cost=(id,segment)=>{
 if(!segments.includes(segment)||!byId[id])throw Error('Maliyet kalemi veya segment geçersiz.');
 return byId[id].costs[segment]*100;
};
