import {readFile,writeFile,cp,rm} from 'node:fs/promises';

export async function buildRecoveryReview(output,{production=false}={}){
 const names=['recovery-review.html','recovery-review.js'];
 if(production){for(const name of names)await rm(output+'/offers/'+name,{force:true});return;}
 const source=await readFile(new URL('./variants-review.html',import.meta.url),'utf8');
 const start=source.indexOf('<main>'),end=source.indexOf('</main>')+7;
 const page=source.slice(0,start)+`<main><span class="review-pill">Sentetik kullanım önizlemesi</span><h1>Kesilen araştırmaya kontrollü dönüş.</h1><p class="review-note">Mevcut teklif formunun hata ve yeniden deneme akışını inceleyebilirsin. Örnek veriler kullanılır; ücretli model çağrısı, kayıt veya gerçek kart değişikliği yapılmaz.</p><button class="btn btn-primary" id="review-model">Model kesintisi örneğini aç</button><button class="btn" id="review-budget">Bütçe rezervi örneğini aç</button><p class="review-note">Form açılınca hata örneği gösterilir. Kalan bütçeyle yeniden deneme yalnızca sen tıkladığında çalışır; örnek BHS sonucuna geçilir.</p></main>`+source.slice(end);
 await writeFile(output+'/offers/recovery-review.html',page.replace('Teklif geliştirmeleri · Önizleme','BHS kurtarma · Önizleme').replace('<script src="/offers/variants-review.js"></script>','<script src="/offers/recovery-review.js"></script>'));
 await cp(new URL('./recovery-review.js',import.meta.url),output+'/offers/recovery-review.js');
}
