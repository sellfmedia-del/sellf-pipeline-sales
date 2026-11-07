// Source: 01-Maliyet-ve-Teklif-Fiyat-Hesaplamas-.xlsx, Hizmet Bedelleri.
// Monetary values are TL/month; money is calculated in integer kuruş downstream.
const sourceNames={"retainers":{"2":"Account Director / Manager (Markaya özel POC)","3":"Growth Ekibi Tam Kapsam (İlk İki Ay)","4":"Growth Ekibi Proje Yönetimi (Planlama Sonrası)","5":"Growth Ekibi Essential (Tek Danışman)","6":"Meta Reklam Yönetimi Operasyon","7":"Google Ads Reklam Yönetimi Operasyon","8":"B2B Dijital Pazarlama Operasyon","9":"Programmatic Reklam operasyon","10":"On site SEO operasyon","11":"Off Site SEO operasyon","12":"Teknik SEO operasyon","13":"E-Ticaret Pazaryeri Operasyon","14":"E-Ticaret Danışmanlık & Planlama Operasyon","15":"Sosyal Medya Yönetimi Operasyon","16":"Statik & Motion Tasarım Operasyon","17":"Webmaster Operasyon","18":"Marka Pazarlama Operasyon","19":"Influencer Pazarlama Operasyon","20":"Yapay Zeka Entegrasyon & Pazarlama Operasyon","21":"Fullfilment & Lojistik Planlama Operasyon","22":"Moderasyon Hizmeti Operasyon ","23":"Medya Planlama & Bütçe Planlama Operasyon","24":"Tiktok Reklam Yönetim Operasyon","25":"Amazon PPC Operasyon","26":"Barter & UGC Influencer Operasyon","27":"E-Ticaret Altyapılar Webmaster Operasyon","28":"Custom Yazılım & App Webmaster","29":"Mail Pazarlama"},"projects":{"2":"Account Director / Manager","3":"Web Sitesi (Custom)","4":"Brandbook Tasarımı","5":"Shopify ve E-Ticaret websitesi","6":"Workdpress vb. websitesi","7":"Statik","8":"Motion","9":"App & Web App"}};
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
 ['custom_webmaster','Özel Yazılım ve App Webmaster',28,[0,0,0],'custom'],
 ['email_marketing','Mail Pazarlama',29,[15000,20000,22500]]
];
export const costVersion='sellf-costs-2026-11-07-v3';
export const segments=Object.freeze(['kobi','corporate','key_account']);
export const catalog=Object.freeze(rows.map(([id,name,row,values,kind='fixed'])=>Object.freeze({id,name,row,kind,sourceName:sourceNames.retainers[row],costs:Object.freeze(Object.fromEntries(segments.map((segment,i)=>[segment,values[i]])))})));
export const operations=Object.freeze(catalog.filter(row=>['fixed','commission','custom'].includes(row.kind)));
export const byId=Object.freeze(Object.fromEntries(catalog.map(row=>[row.id,row])));
export const cost=(id,segment)=>{
 if(!segments.includes(segment)||!byId[id])throw Error('Maliyet kalemi veya segment geçersiz.');
 return byId[id].costs[segment]*100;
};
// Source: Proje Kalem ve Bedelleri, rows 2–9. These are one-off costs,
// never monthly webmaster/design retainers. Zero means a scoped cost is required.
export const projects=Object.freeze([
 ['project_account','Account Director / Manager',2,[10000,15000,20000]],
 ['project_custom_website','Web Sitesi (Custom)',3,[0,0,0]],
 ['project_brandbook','Brandbook Tasarımı',4,[20000,27500,32400]],
 ['project_ecommerce','Shopify ve E-Ticaret Websitesi',5,[15000,20000,30000]],
 ['project_wordpress','WordPress vb. Websitesi',6,[15000,20000,30000]],
 ['project_static','Statik Tasarım',7,[1500,3000,4500]],
 ['project_motion','Motion Tasarım',8,[4500,6000,9000]],
 ['project_app','App & WebApp',9,[0,0,0]]
].map(([id,name,row,values])=>Object.freeze({id,name,row,kind:'project',sourceName:sourceNames.projects[row],costs:Object.freeze(Object.fromEntries(segments.map((segment,i)=>[segment,values[i]])))})));
export const projectById=Object.freeze(Object.fromEntries(projects.map(s=>[s.id,s])));
