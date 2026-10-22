import {readFile,writeFile} from 'node:fs/promises';
// Reviewer-only synthetic state. Actual gateway and SQL run in shared-team tests.
export async function buildTeamReview(output){
 let html=await readFile(new URL('./variants-review.html',import.meta.url),'utf8');
 html=html.replace('<title>Teklif geliştirmeleri · Önizleme</title>','<title>Satış ekibi teklif erişimi · Önizleme</title>')
 .replace('Bir marka, birden fazla teklif.','Aynı teklifler, eşit ekip yetkisi.')
 .replace('Kaydedilen iki örnek teklif arasında geçiş yapabilir, fiyatlarını değiştirebilir ve aynı brief formuyla yeni teklif oluşturabilirsin. BHS seçimi bu formda yer alır.','İki örnek kullanıcı arasında geçiş yap. İkinci kullanıcı, ilkinin taslağını görebilir, yayınlayabilir ve fiyatlarını güncelleyebilir. Sayfayı yenileyince örnek kayıtlar korunur.')
 .replace('Bu alan yalnızca örnek verilerle kullanım akışını gösterir. Hesaplama ve BHS sonuçları örnektir; gerçek kartlar değişmez, ücretli analiz yapılmaz. Yenileyince denemeler sıfırlanır.','Bu alan örnek kullanıcı ve verilerle kullanım akışını gösterir. Gerçek Pipeline kayıtlarına bağlanmaz. Sunucu ve veritabanı yetkileri ayrıca otomatik testlerle doğrulanır.')
 .replace('<h2>Örnek Marka</h2>','<p id="team-active-user" role="status"></p><button class="btn" id="team-user-1">Örnek Kullanıcı 1 ile aç</button><button class="btn" id="team-user-2">Örnek Kullanıcı 2 ile aç</button><p>Başlangıçtaki iki teklif Kullanıcı 1 tarafından hazırlanmıştır.</p><h2>Örnek Marka</h2>')
 .replace('onclick="location.reload()"','id="team-reset"')
 .replace('/offers/variants-review.js','/offers/team-review.js');
 let js=await readFile(new URL('./variants-review.js',import.meta.url),'utf8');
 js=js.replace("const clone=value=>structuredClone(value),rows=clone(data.rows),history=new Map(),lead=", "const clone=value=>structuredClone(value),storageKey='pipeline-shared-team-review-v1',saved=JSON.parse(localStorage.getItem(storageKey)||'null'),rows=saved?.rows||clone(data.rows),history=new Map(saved?.history||[]),lead=saved?.lead||");
 js=js.replace("const context={lead,spaceId:'space-1'};", `const context={lead,spaceId:'space-1'};
 let activeUser=sessionStorage.getItem('pipeline-team-review-user')||'1';
 const persist=()=>localStorage.setItem(storageKey,JSON.stringify({rows,history:[...history],lead}));
 const userLabel=()=>document.querySelector('#team-active-user').textContent='Aktif: Örnek Kullanıcı '+activeUser;
 for(const user of ['1','2'])document.querySelector('#team-user-'+user).addEventListener('click',()=>{activeUser=user;sessionStorage.setItem('pipeline-team-review-user',user);userLabel();window.PipelineOffers.mount(document.querySelector('#pipeline-offer-section'),context);});
 document.querySelector('#team-reset').addEventListener('click',()=>{localStorage.removeItem(storageKey);location.reload();});userLabel();`);
 js=js.replace("history.get(row.id)||[])]);return", "history.get(row.id)||[])]);persist();return")
 .replace("row.state='published';return", "row.state='published';persist();return")
 .replace("rows.push(row);return", "row.createdBy=activeUser;rows.push(row);persist();return");
 await writeFile(output+'/offers/team-review.html',html);await writeFile(output+'/offers/team-review.js',js);
}
