import {readFile,writeFile,cp,rm} from 'node:fs/promises';

export async function buildRecoveryReview(output,{production=false}={}){
 const names=['recovery-review.html','recovery-review.js','recovery-review-continuity.json'];
 if(production){for(const name of names)await rm(output+'/offers/'+name,{force:true});return;}
 const source=await readFile(new URL('./variants-review.html',import.meta.url),'utf8');
 const start=source.indexOf('<main>'),end=source.indexOf('</main>')+7;
 const page=source.slice(0,start)+`<main><span class="review-pill">Sentetik kullanım önizlemesi</span><h1>Kesilen araştırmaya kontrollü dönüş.</h1><p class="review-note">Mevcut teklif formunun hata ve yeniden deneme akışını inceleyebilirsin. Örnek veriler kullanılır; ücretli model çağrısı, kayıt veya gerçek kart değişikliği yapılmaz.</p><button class="btn btn-primary" id="review-model">Model kesintisi örneğini aç</button><button class="btn" id="review-budget">Bütçe rezervi örneğini aç</button><p class="review-note">Form açılınca hata örneği gösterilir. Kalan bütçeyle yeniden deneme yalnızca sen tıkladığında çalışır; örnek BHS sonucuna geçilir.</p></main>`+source.slice(end);
 await writeFile(output+'/offers/recovery-review.html',page.replace('Teklif geliştirmeleri · Önizleme','BHS kurtarma · Önizleme').replace('<script src="/offers/variants-review.js"></script>','<script src="/offers/recovery-review.js"></script>'));
 await cp(new URL('./recovery-review.js',import.meta.url),output+'/offers/recovery-review.js');
 const html=await readFile(output+'/offers/recovery-review.html','utf8');
 await writeFile(output+'/offers/recovery-review.html',html.replace('<p class="review-note">Form açılınca', '<button class="btn" id="review-continuity">AI kesintisinde teklife devam</button><button class="btn" id="review-english">İngilizce çeviri kesintisi</button><p class="review-note">Form açılınca'));
 const {offerFixture}=await import('../../test/fixtures/offer.mjs');
 const {continuationAudit,restoreContinuation}=await import('../bhs/continuity.mjs');
 const {researchCacheKey}=await import('../bhs/reuse.mjs');
 const {briefHash}=await import('../bhs/brief.mjs');
 const {context}=await import('../../test/fixtures/evidence.mjs');
 const {pricingEngine}=await import('../engines/pricing-engine.mjs');
 const {proposalEngine}=await import('../engines/proposal-engine.mjs');
 const {addQuote}=await import('../pricing/currency.mjs');
 const f=await offerFixture(),sample=JSON.parse(await readFile(output+'/offers/variants-review-data.json','utf8'));
 const audit={stage:'audit',...continuationAudit(f.brief,{reason:'model_temporarily_unavailable'})};
 const pricing=addQuote(await pricingEngine.run({brief:f.brief,scope:audit.data.scopePlan},{audit}),{currency:'TRY'});
 const logo={...f.logo,data:sample.logo};
 const proposal=await proposalEngine.run({brief:f.brief,copy:audit.data.proposalCopy},{audit,pricing,logo});
 proposal.data.brand={name:'Örnek Marka',website:'https://brand.example/'};
 const c=context(),now=Date.now(),saved={step_key:'audit:synthesis:'+briefHash(f.brief),created_at:new Date(now).toISOString(),value:{data:c.report,analysisPacket:c.packet,researchContext:{brief:f.brief,briefHash:briefHash(f.brief)}}};
 const restoredAudit={stage:'audit',...await restoreContinuation(f.brief,audit,{get:async key=>key===researchCacheKey(f.brief,now)?{state:'complete',value:saved}:null},now)};
 const restoredPricing=addQuote(await pricingEngine.run({brief:f.brief,scope:restoredAudit.data.scopePlan},{audit:restoredAudit}),{currency:'TRY'});
 const restoredProposal=await proposalEngine.run({brief:f.brief,copy:restoredAudit.data.proposalCopy},{audit:restoredAudit,pricing:restoredPricing,logo});
 restoredProposal.data.brand={name:'Örnek Marka',website:'https://brand.example/'};
 await writeFile(output+'/offers/recovery-review-continuity.json',JSON.stringify({audit,pricing,proposal,restored:{audit:restoredAudit,pricing:restoredPricing,proposal:restoredProposal}}));
 const finalHtml=await readFile(output+'/offers/recovery-review.html','utf8');
 await writeFile(output+'/offers/recovery-review.html',finalHtml.replace('<button class="btn" id="review-continuity">','<button class="btn btn-primary" id="review-restored">Kayıtlı BHS’yi ek ücret olmadan geri getir</button><button class="btn" id="review-continuity">'));
}
