import {readFile,writeFile,cp,rm} from 'node:fs/promises';
import {conversationAuditResult} from '../bhs/conversation-report.mjs';
import {offeringOutcomeVersion} from '../bhs/conversation-offerings.mjs';
import {researchClosureVersion} from '../bhs/conversation-progress.mjs';
import {brief,researchSources,offeringResearchSummary,completeResearchProgress} from '../../test/fixtures/bhs-conversation.mjs';
import {applySemanticDecision} from '../bhs/conversation-semantic.mjs';
import {hash} from '../budget/ledger.mjs';
import {strongNarrativeReport,weakClaim,correctedClaim} from '../../test/fixtures/bhs-strong-narrative.mjs';
import {objectiveValidationVersion} from '../bhs/conversation-objective.mjs';
import {conversationContextVersion,canonicalConversationHash} from '../bhs/conversation-context.mjs';
import {inspectConversationAcceptance} from '../bhs/conversation-acceptance.mjs';

export async function buildConversationReview(output,{production=false}={}){
 const names=['conversation-review.html','conversation-review.js','conversation-review-data.json'];
 if(production){for(const name of names)await rm(output+'/offers/'+name,{force:true});return;}
 const base=await readFile(new URL('./variants-review.html',import.meta.url),'utf8');
 const start=base.indexOf('<main>'),end=base.indexOf('</main>')+7;
 const main='<main><span class="review-pill">Sentetik arayüz örneği · Ücretli çağrı yok</span><h1>Yeni BHS: bütün rapor ve kaynaklar.</h1><p class="review-note">Bu sayfa yeni motorun mevcut teklif ekranına aktarımını gösterir. Metin test örneğidir; gerçek Claude/Gemini analizi veya canlı kalite doğrulaması değildir. Gerçek kart, veritabanı veya ödeme işlemi yapılmaz.</p><button class="btn btn-primary" id="review-conversation">Yeni BHS görünümünü aç</button><button class="btn" id="review-conversation-partial">Kesintide korunan analiz örneği</button></main>';
 await writeFile(output+'/offers/conversation-review.html',(base.slice(0,start)+main+base.slice(end))
  .replace('Teklif geliştirmeleri · Önizleme','Yeni BHS · Önizleme').replace('<script src="/offers/variants-review.js"></script>','<script src="/offers/conversation-review.js"></script>'));
 await cp(new URL('./conversation-review.js',import.meta.url),output+'/offers/conversation-review.js');
 const original=strongNarrativeReport({flawed:true});original.reportMarkdown+='\n## Kanal karşılaştırması\n| Kanal | Mevcut gözlem | Ölçülecek ilişki |\n|---|---|---|\n| Web sitesi | Ürün keşfi | Ürün ziyareti → yönlendirme |\n| Shopier / WhatsApp | Harici sipariş yönlendirmesi | Yönlendirme → sipariş |';
 original.reportMarkdown+='\n## Seçili ürün, alıcı ve gerçek alternatif\nTemsili kıtık açıcı sprey için alıcı ihtiyacı, kullanımın anlaşılması ve siparişe ulaşmaktır. Marka ürün tanıtımından harici Shopier/WhatsApp yoluna geçiş sunarken, okunan rakip ürün sayfasında uygulama videosu ve doğrudan sipariş bulunur. Bu fark, yeni bir kanalın zorunlu olduğunu göstermez; mevcut kanalda ürün kullanım açıklaması ve sipariş geçişi birlikte pilotlanabilir. Menüde görülen bütün ürünlerin veya başka pazardaki her markanın aynı alternatif grubuna ait olduğu varsayılmaz. İç marj ve gerçekleşen satış müşteriden alınacak bilgidir. ['+researchSources[0].id+'] ['+researchSources[2].id+']';
 const assessed=applySemanticDecision(original,{draftDigest:hash(original),verdict:'patch',rationale:'Sentetik örnekte yalnız kanıtsız performans iddiası düzeltilir; SWOT, aksiyon/ölçüm, alternatifler ve zaman planı aynen korunur.',
  issues:[{id:'performance',reason:'Ölçüm etiketinin görülmemesi reklam verimsizliğini kanıtlamaz.',resolution:'İddiayı doğrulama ihtiyacı olarak sınırla.',sourceIds:[],question:'',access:'analysis'}],
  patches:[{issueId:'performance',path:'reportMarkdown',operation:'replace_text',before:weakClaim,after:correctedClaim}]},{sources:researchSources});
 const fixture=assessed.report;
 const saved={conversationReport:fixture,conversationSources:researchSources,researchOutcomeVersion:offeringOutcomeVersion,researchSummary:offeringResearchSummary(),objectiveValidationVersion,
  conversationContext:{version:conversationContextVersion,conversationId:'synthetic-preview',briefDigest:canonicalConversationHash(brief),budgetId:'synthetic-preview-account',capKurus:5000},
  researchClosure:{version:researchClosureVersion,progress:completeResearchProgress(),issues:[]},semanticReview:{...assessed.review,synthetic:true},researchedAt:'2026-11-20T10:00:00.000Z'};
 const limited=structuredClone(saved);limited.researchClosure.progress.questions.push({id:'remaining',question:'İlgili ürünün alternatif sipariş yolu nedir?',access:'public',important:true,status:'open',answer:'',sourceIds:[],attemptedUrls:[],rationale:''});
 limited.researchClosure.issues=['important_public_questions_open'];
 limited.semanticReview={...limited.semanticReview,status:'pending'};
 const audit=conversationAuditResult(brief,saved),partial=conversationAuditResult(brief,limited,{reason:'research_incomplete'});
 const acceptance=inspectConversationAcceptance({brief,stored:saved,cost:{id:'synthetic-preview-account',capKurus:5000,chargedKurus:500}});
 await writeFile(output+'/offers/conversation-review-data.json',JSON.stringify({brief,audit,partial,acceptance:{...acceptance,synthetic:true}}));
}
