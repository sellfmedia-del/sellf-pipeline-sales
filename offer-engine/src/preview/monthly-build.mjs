import {readFile,writeFile,cp,rm} from 'node:fs/promises';

export async function buildMonthlyReview(output,{production=false}={}){
 const files=['monthly-review.html','monthly-review.js','monthly-pricing.mjs','monthly-cost-catalog.mjs','monthly-currency.mjs'];
 if(production){for(const name of files)await rm(output+'/offers/'+name,{force:true});return;}
 const source=await readFile(new URL('./variants-review.html',import.meta.url),'utf8');
 const page=source.replace('Teklif geliştirmeleri · Önizleme','Ay bazlı teklif · Önizleme').replace('Bir marka, birden fazla teklif.','Operasyonları ay ay planla.').replace('Kaydedilen iki örnek teklif arasında geçiş yapabilir, fiyatlarını değiştirebilir ve aynı brief formuyla yeni teklif oluşturabilirsin. BHS seçimi bu formda yer alır.','Teklif Oluştur düğmesinden mevcut formu aç. “Ay bazlı fiyatlandır” seçeneği varsayılan olarak kapalıdır. Açtığında her ayın operasyonlarını seç; fiyat alanı ve iş akışı bu plana göre hazırlanır.').replace('Bu alan yalnızca örnek verilerle kullanım akışını gösterir. Hesaplama ve BHS sonuçları örnektir; gerçek kartlar değişmez, ücretli analiz yapılmaz. Yenileyince denemeler sıfırlanır.','Örnek marka ile izole kullanım önizlemesi. Aylık hesaplama gerçek maliyet kurallarını kullanır; BHS, logo ve çeviri servisleri çağrılmaz. Kayıt ve yayın denemeleri yalnızca bu sayfanın belleğinde tutulur; gerçek Pipeline verileri değişmez. Yenileyince denemeler sıfırlanır.').replace('</body>','<script type="module" src="/offers/monthly-review.js"></script></body>');
 await writeFile(output+'/offers/monthly-review.html',page);
 await cp(new URL('./monthly-review.js',import.meta.url),output+'/offers/monthly-review.js');
 const pricing=await readFile(new URL('../pricing/monthly.mjs',import.meta.url),'utf8');
 await writeFile(output+'/offers/monthly-pricing.mjs',pricing.replace("'./catalog.mjs'","'./monthly-cost-catalog.mjs'"));
 await cp(new URL('../pricing/catalog.mjs',import.meta.url),output+'/offers/monthly-cost-catalog.mjs');
 await cp(new URL('../pricing/currency.mjs',import.meta.url),output+'/offers/monthly-currency.mjs');
}
