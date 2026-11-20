import {readFile,writeFile,cp,rm} from 'node:fs/promises';
import {conversationAuditResult} from '../bhs/conversation-report.mjs';
import {brief,source,report} from '../../test/fixtures/bhs-conversation.mjs';

export async function buildConversationReview(output,{production=false}={}){
 const names=['conversation-review.html','conversation-review.js','conversation-review-data.json'];
 if(production){for(const name of names)await rm(output+'/offers/'+name,{force:true});return;}
 const base=await readFile(new URL('./variants-review.html',import.meta.url),'utf8');
 const start=base.indexOf('<main>'),end=base.indexOf('</main>')+7;
 const main='<main><span class="review-pill">Sentetik arayüz örneği · Ücretli çağrı yok</span><h1>Yeni BHS: bütün rapor ve kaynaklar.</h1><p class="review-note">Bu sayfa yeni motorun mevcut teklif ekranına aktarımını gösterir. Metin test örneğidir; gerçek Claude/Gemini analizi veya canlı kalite doğrulaması değildir. Gerçek kart, veritabanı veya ödeme işlemi yapılmaz.</p><button class="btn btn-primary" id="review-conversation">Yeni BHS görünümünü aç</button><button class="btn" id="review-conversation-partial">Kesintide korunan analiz örneği</button></main>';
 await writeFile(output+'/offers/conversation-review.html',(base.slice(0,start)+main+base.slice(end))
  .replace('Teklif geliştirmeleri · Önizleme','Yeni BHS · Önizleme').replace('<script src="/offers/variants-review.js"></script>','<script src="/offers/conversation-review.js"></script>'));
 await cp(new URL('./conversation-review.js',import.meta.url),output+'/offers/conversation-review.js');
 const fixture=report();fixture.reportMarkdown+='\n## Kanal karşılaştırması\n| Kanal | Mevcut gözlem | Ölçülecek ilişki |\n|---|---|---|\n| Web sitesi | Ürün keşfi | Ürün ziyareti → yönlendirme |\n| Shopier / WhatsApp | Harici sipariş yönlendirmesi | Yönlendirme → sipariş |';
 const saved={conversationReport:fixture,conversationSources:[source],researchedAt:'2026-11-20T10:00:00.000Z'};
 const audit=conversationAuditResult(brief,saved),partial=conversationAuditResult(brief,saved,{reason:'provider_timeout'});
 await writeFile(output+'/offers/conversation-review-data.json',JSON.stringify({brief,audit,partial}));
}
