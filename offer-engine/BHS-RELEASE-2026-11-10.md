# Güncel kullanıcı kabul kararı

Kullanıcı, gerçek raporun uçtan uca kabul testini canlıda kendisi yapmayı tercih etti. Ön koşul kod, prompt ve bağlantı/kurulum ayrımının dürüstçe belirtilmesidir. Yeni ücretli kabul denemesi istenmiyor. Bu karar tek başına migration/Edge deployment/production merge onayı sayılmaz.

Altı aşamalı kod/prompt akışı tamamdır; aşağıdaki gerçek rapor eksikleri canlı kullanıcı kabulünde değerlendirilecektir. Son kod kontrolünde gap extraction şeması sektör başlıklarından tüm BHS konularına açıldı; operatöre 24 alan verilir ve özgün kaynak kimliği doğrulaması korunur. Konu genişliği ve uydurma kaynağın reddi hedefli kontrolden geçti.

**API bağlantılarının canlı kurulumu henüz tamamlanmadı:** mevcut Production Gemini anahtarı Preview hatasıyla aynı kabul edilmeyecek; canlı üretim erişimi aktivasyon sonrası kontrol edilir. Yeni özel queue, worker secret, scheduler ve gateway entegrasyonu uygulanmadı. Apify'nin orijinal Actor limitleri bulunmadığı için scraperlar doğrulanmış/etkin kabul edilmeyecek. Önceki gerçek QA sonuçları ve ücretleri aşağıda korunmuştur; yeni kullanıcı tercihi bunları başarılı rapora dönüştürmez.

---

# BHS doğrulama ve kurulum incelemesi - 10 Kasım 2026

**DURUM: BEKLEMEDE. Nihai ön BHS raporu tamamlanmadı. Canlıya kurulum onayı için hazır olduğu iddia edilmemektedir.**

| Gerçek Tadım çalıştırması | Sonuç |
| --- | --- |
| Marka kimliği, ürünler, iş modeli ve analiz pazarı | Kaynaklı uzman kabulü var |
| Sektör, gelir mekanizması, müşteri davranışı | Kaynaklı uzman kabulü var |
| Doğrudan rekabet | Üç marka için yeterli ürün/kitle/coğrafya kanıtı henüz tamamlanmadı |
| SWOT, şikâyetler ve darboğazlar | Bu çalıştırmada tamamlanmadı |
| 24 alan ve eksik araştırması | Bu çalıştırmada tamamlanmadı |
| Nihai uzman denetimi ve rapor | Bu çalıştırmada tamamlanmadı |

## Güncel ölçüm ve açık engeller

- Aynı `tadim_final` hesabının tüm çağrı/başarısızlıkları korunarak toplam taahhüdü **36,29 TL**. Bunun 25,17 TL'si doğrulanmış sağlayıcı kullanımı için kur/vergi paylı muhasebe, 1,12 TL'si sonucu ücret açısından belirsiz Google taahhüdü, 10,00 TL'si altyapı/QA payıdır. Actor çalıştırılmadı. Bu bir tamamlanmış rapor fiyatı veya fatura toplamı değildir.
- 50 TL atomik toplam sınırı korunuyor. Bağımsız aşama tahsisleri ve bulgu adedi üst sınırları kaldırıldı. Her ücretli çağrının tam çıktı/girdi üst tutarı önceden karşılanır; sonraki işler için sağlayıcı çağrısında korunan tutar da kabul hesabına dahildir. Son rekabet denetimi bu kabul hesabına sığmadığı için yeni çağrı yapılmadı.
- Preview `GEMINI_API_KEY` üretim isteği `billing_required` (403) döndü. Catalog 200 sonucu üretimin çalıştığını kanıtlamadı. Bu QA'daki operatör çağrıları Haiku 5.5'e devredildi; uzman Sonnet 5.5 kaldı. **Gerçek Gemini operatörüyle altı aşama tamamlandı denemez.**
- Vercel'de Production ve Preview anahtarları ayrı değişkenlerdir. Production anahtarının değeri okunmadı/değiştirilmedi; onun üretim erişimi bu oturumda denenmedi. Preview hatası Production anahtarının da bozuk olduğunu kanıtlamaz.
- Apify hesabı `poetic_jumpstart`: kayıtlı Task 0, açık sunucu politikası 0, hesap/Actor kimliği ve açık kullanıcı tercihi doğrulanabilen son çalışma limiti 0. Ayrı Actor limitleri bulunamadığı için gerçek scraper maliyeti doğrulanmadı; ortak 0,40 USD varsayımı uygulanmadı.
- Rakip kaynak toplamasında ürün kategorisi bağlantıları eksikti: `kuruyemiş/urun/nuts/kategori` etiketleri eklenip v8'de ürün bağlantıları gizlilik/iletişim sayfalarından önce okunacak şekilde düzenlendi. Yalnız gerçekten gözlenen bağlantılar izlenir; mevcut paketlerdeki gözlenen menü bağlantıları da yeniden araştırmaya katılır. Kurumsal alt sayfa verilen aday için aynı domainin ana sayfası keşfe eklenir. Bu düzeltme teknik kontrolden geçti; yeni gerçek kabul çalıştırması henüz yapılmadı.

## Somut Preview anahtar işlemi - ayrıca kullanıcı kararı bekliyor

Önerilen işlem, mevcut Production `GEMINI_API_KEY` kaydının **değerini, anahtar adını, tipini ve Production hedefini koruyarak** yalnız `fix/bhs-release-acceptance` Preview branch'ine de erişim eklemektir. İncelenen API `value` göndermeden `target` ve `gitBranch` güncellenmesine izin veriyor; çoklu hedef/branch birleşiminin sunucuda kabulü henüz denenmedi. Production kaydının erişim kapsamı değişeceğinden, kullanıcının canlı kontrolü talimatı uyarınca bu işlem yapılmadı.

- Önerilen alanlar: `target=[production,preview]`, `gitBranch=fix/bhs-release-acceptance`; `value/key/type` gönderilmez.
- Geri dönüş: önceki `target=[production]`, `gitBranch=null`. Mevcut genel Preview anahtarı korunur.
- Anahtarın değeri açığa çıkarılmaz. Bu bir merge, canlı deployment, Google faturalandırma açma veya ödeme işlemi değildir.
- Önce sınırlı bir gerçek Gemini üretim kontrolü; başarılı olursa düzeltilmiş motorla ayrı isimli, açıkça ek geliştirme harcaması olarak kaydedilen yeni kabul çalıştırması gerekir. Eski 36,29 TL veya eski 30,10 TL geliştirme hesabı sıfırlanmaz/geri alınmış gösterilmez.

## Kanıt ve sürüm

Son tamamlanan tüm kontroller: **54 ana uygulama + 455 motor testi başarılı; 21 isteğe bağlı motor kontrolü atlandı**. Son ürün bağlantısı düzeltmesi: **40 ilgili kontrol başarılı; 1 tarayıcı kontrolü isteğe bağlı atlandı**. Kod sözdizimi ve diff kontrolleri başarılı. Yeni ordinary Preview build'i tam kontrolleri yeniden çalıştıracak; ücretli QA giriş anahtarı boşaltıldı.

Production yeniden salt okunur doğrulandı: `30c0c139cf05f41d275ffd9f9747dfca21345fa5`, READY `dpl_emoskTtF3z4Y7VUFGeGe4zQmJvPU`. Main, domainler, mevcut müşteri verileri, Supabase şeması, RLS ve Edge fonksiyonları değiştirilmedi. Aşağıdaki kurulum/geri dönüş planı inceleme içindir; uygulanmadı.

---

# BHS release review — 10 November 2026

Status: HOLD. The current evidence and blockers are described above; the following sections retain the installation and rollback plan.

## Verified target and production baseline

- Repository: sellfmedia-del/sellf-pipeline-sales.
- Vercel: yigit-konuks-projects / sellf-pipeline-sales, project prj_B6Q6FIgq9NjbBlb6ga03cn6PD3jJ.
- Supabase account: Pipeline ve Bağımsız, organization pvpknoqioxgyerinoecv (Sellf Toolları ve Aunce), project gxngmqewskhrbxqmnpps.
- Production rollback baseline: main commit 30c0c139cf05f41d275ffd9f9747dfca21345fa5; READY deployment dpl_emoskTtF3z4Y7VUFGeGe4zQmJvPU.
- Read-only SQL confirmed PostgreSQL 17.6, Vault installed, pipeline_bhs_jobs and pipeline_bhs_job_op absent; pg_cron and pg_net absent. Available versions were verified read-only: pg_cron 1.6.4, pg_net 0.20.0; installed Vault 0.3.1.
- Existing Edge gateways: pipeline-offer-store version 4 (JWT enabled), pipeline-offer-preview-store version 8 (JWT disabled, existing gateway/session controls).

## Change boundary

Only BHS analysis, its provider routing, private worker integration, evidence/cost validation and BHS QA are in scope. No pricing, logo, service picker, proposal layout, other app, existing customer record, auth or existing RLS change is authorized.

The six logical stages remain brand → industry/market → competition/risk → SWOT → methodology coverage/gap research → final review. Source-backed observations, bounded inferences and unknowns remain distinct. Private revenue/ownership is not invented. Final release requires all stage decisions, at least 12 substantive grounded findings across six dimensions, three verified direct competitors, four SWOT quadrants and all 24 methodology fields.

## Newly verified failures and fixes

1. The paid acceptance runner allowed tadim_release, but build.mjs did not. A single project/environment/commit-bound gate now serves both; ordinary and production builds cannot execute QA.
2. The first actual release run reached brand extraction and received Google HTTP 403 with billing_required. Catalog authentication was insufficient evidence that generation was available.
3. A bounded operator handoff was added. The first Sonnet handoff produced an empty, uncited fact and was correctly rejected; that response and 2.69 TRY remain in the ledger.
4. The billing-rejection extraction fallback uses claude-haiku-5-5; Sonnet 5.5 continues all independent stage reviews and final review. Official Haiku pricing verified on 10 November: input/output per MTok 0.10/0.50 USD up to 100k prompt tokens, 0.50/2.50 USD above. Token counting, exact-model checks, output/thinking accounting, tax/FX allowance and the same 50 TRY aggregate cap apply. No cache discount is assumed.

## Cost accounting

- Retained tadim_release baseline: 19.65 TRY. All prior usage, the rejected 2.69 TRY Sonnet response, the unresolved 1.08 TRY Google commitment and the infrastructure/QA envelope remain included. The 11-fact paid Haiku repair passes all item/proof checks and resumes the new PostgreSQL phase at zero additional charge; 15 total candidates are retained.
- Earlier diagnostics (Duru, original Tadım, Humm, etc.) are additional development spending, not successful reports and not erased or moved into this account.
- The case cannot restart at zero. Every continuation restores its complete checkpoint. Unknown paid outcomes stay charged; failed known content is retained. No finished-report cost claim is made until acceptance completes.
- All paid model/search/Actor commitments and dataset/worker allowances share the same 5,000-kurus ledger. An inaccessible Actor is not counted as a successful zero-cost scrape.

## User decision: quantity and budget ceilings

There is no phase or final-report maximum finding count. Minimum brand/sector understanding, 12 distinct substantive final findings, six dimensions, three peers, four SWOT quadrants and the 24 fixed methodology areas remain. All extra source-backed findings and review corrections are allowed. The inherited v6/v7 contracts remain unchanged. v8 has no smaller phase budget allocations; the only monetary ceiling is the shared 50 TRY run ledger with atomic admission and conservative unknown-outcome accounting. Provider token/byte limits remain necessary cost/transport guards, not finding quotas.

## Analysis market and expert corrections

A review now reads the captured company paragraphs that the extractor omitted, may add independently checked facts, and keeps all raw paid responses unchanged. A declared analysis market is stored separately from sourced sales claims. An exact quote from the customer brief is required for brief_declared context; an invented quote is rejected. It does not certify actual sales, market share or a complete list of export countries. Unknown international footprint cannot add a hidden requirement after a valid analysis market and core brand facts are known.

The original tadim_release development diagnostic is archived with ALL 30.10 TRY, including failed content and uncertain Google commitments. It did not produce a complete report. The separately named tadim_final account measures the corrected normal entry, with its own 50 TRY account and no inherited or refunded diagnostic costs. This is additional acceptance spending, not a reset of the earlier case.

## Scraper boundary

Vercel's configured Apify account poetic_jumpstart previously exposed zero saved Tasks and no explicit per-Actor policies. The user has different individual caps, all <=0.40 USD. Those exact caps have not been recovered; no common 0.40 default may replace them. Console access timed out. Do not execute an Actor before its original lower cap, included fees, target identity and finite input are verified. Runtime enforcement already takes the smaller verified individual cap and remaining analysis budget. Real scraper acceptance remains blocked, not passed.

## Prepared production changes — separate approval required

1. Verify the same target identity again and retain current Edge source/configuration plus a database backup/export plan. Retain all offers, budgets and receipts.
2. Enable pg_cron and pg_net using the documented supported versions. No subscription upgrade is assumed.
3. Apply the additive reviewed queue migration offer-engine/schema/bhs-sequential-jobs.sql. It creates one private RLS-enabled queue table, its indexes and service_role-only invoker functions. Existing policies are unchanged; public/anon/authenticated have no queue privileges.
4. Publish the reviewed additions to BOTH existing Edge gateways, preserving their existing JWT settings and handlers. The shared BHS action adapter binds authenticated users to cards, budgets and immutable brief hashes; worker operations require a separate BHS secret.
5. Provision one cryptographically random BHS_WORKER_SECRET in server-only Vercel/Supabase configuration and matching Vault entries bhs_worker_url/bhs_worker_secret. Never expose, commit or print it. No provider or service_role secret goes to the browser or scheduler.
6. Apply offer-engine/schema/bhs-sequential-scheduler.sql only after the queue/gateways/secret are verified. The reviewed scheduler checks the queue every 10 seconds; idle checks do not invoke a billed worker. Cron/HTTP execution still needs live post-approval verification.
7. Provision the exact existing per-Actor limits in OFFER_BHS_ACTOR_LIMITS_JSON, or verified saved Tasks, without raising any limit.
8. Stage the approved Git source through Vercel. Set OFFER_BHS_RESEARCH_VERSION=v8, OFFER_BHS_BACKGROUND_ENABLED=true and OFFER_BHS_SEQUENTIAL_PRODUCTION_ENABLED=true only after prerequisites and user production approval. Clear the preview paid-QA commit gate after acceptance.
9. Post-release: verify the intended domain, one real BHS through all six stages, reload/reconnect, cancellation, role-bound access, completion/save/handoff and the full cost receipt sum. Check runtime and queue errors. A technical build alone is not acceptance.

## Rollback

First unschedule sellf-bhs-sequential-worker and disable BHS background/sequential activation flags. Stop new paid jobs and retain every queue/receipt/budget record. Restore the previous known gateway source/settings and Vercel deployment 30c0c139. Do not delete paid receipts or reset budgets; do not drop any existing table/policy. Queue-object removal requires a separate reviewed operation after in-flight jobs are accounted for. Restore only the BHS changes; all existing customer offers remain available.

## Validation evidence

The last completed full Haiku run passed 54 root tests and 443 engine tests; 21 optional engine checks skipped. Removal of the count and phase-budget ceilings passed 68 focused provider/checkpoint/sequential/queue tests. A further regression covers the actual zero-network PostgreSQL repair replay. Final full regression/build and real acceptance results are pending and must be appended; this document does not presume them.

Official references: https://platform.claude.com/docs/en/models/haiku-5-5/overview ; https://platform.claude.com/docs/en/about-claude/pricing ; https://supabase.com/docs/guides/cron ; https://supabase.com/docs/guides/database/extensions/pg_net
