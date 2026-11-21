# BHS market outcomes and targeted sampling corrections 5–6 — 21 November 2026

This pair is stacked on unmerged PR #90 (`fdf293446cbbafe2c79481aaba24fa6bd1e7511c`). Only isolated implementation and Preview are authorized. Do not merge or deploy production, start/restart/resume a real brand, call a token-count endpoint, or run paid model/search/scraper acceptance. Production remains `c5f30c74dbba661692acad14685a20e1f936bcec`.

## 5. Return adjudicated market and named-competitor outcomes

The earlier handoff checked readable outside-source IDs but could accept a downloaded page that the analyst had never adjudicated as relevant evidence. New v2 outcomes require each cited market/competitor source to have an existing valid source proof from `review_research`, bound to the actual body and selected question. Search snippets, menus, unrelated or unreviewed downloads are not sufficient. The analyst still judges relevance and business meaning; this is a provenance check, not a keyword/heading quality classifier.

The same ongoing Claude conversation receives compact outcome feedback identifying unfinished results and unreviewed sources. A typed partial handoff is retained even when a peer comparison is missing, so valid market reasoning is not discarded. Completion stays blocked while the existing important public questions or handoff gaps remain open and affordable research can continue. The analyst chooses the narrow next question, reads relevant outside evidence, then returns actual market implications and named-peer comparisons. There is no automatic general search or fixed research-topic checklist.

Qualified analytical inference remains allowed without a citation on every sentence. Exact market size, private revenue/margin data and a fixed peer quota do not become new completion conditions. The existing four-distinct-source requirement is unchanged. Hard budget/time closure still preserves the useful whole report and marks unresolved work partial; the offer handoff remains available.

`adjudicated-market-competition-outcomes-v2` is retained through report validation, saved research and writing-only recovery. Previously completed v1 conversations keep their original outcome version and interpretation. Paid/frozen receipts and original source archives are not rewritten or repurchased.

## 6. Preserve and expose the selected bounded sample

Multiple comments/reviews sharing one canonical page URL previously overwrote each other in the durable source map. The provider now groups the complete bounded sample under that source URL before archiving. All returned comment bodies remain visible/readable; one review page still counts as one source. Sample metadata records requested/returned counts, per-source counts, actor, scope, retrieval time and a requested supported date boundary. An empty/short sample is explicit and never establishes absence, a full period, publishing frequency, follower growth, sales or general reputation.

The existing `specialist_read` tool now routes only the analyst's selected observed target to existing bounded adapters: a single Trendyol/Amazon product, a single own-page static SEO sample, Instagram/LinkedIn profiles, Instagram/LinkedIn/TikTok posts, existing Trendyol/Şikayetvar reviews or official Instagram-post comments. Page and product fallbacks require the initial Tavily read attempt. Single-source page/product/profile/technical work requires `sampleSize:1`; posts/reviews remain at most five records. No new provider, arbitrary actor, broad automatic crawl, follower collection, comment expansion or AI/video download is introduced.

An optional `since:YYYY-MM-DD` is supported only for Instagram posts. Unsupported/invalid date requests are rejected before any actor dispatch; out-of-window pinned records are excluded. The date is a lower bound on the returned sample, not proof of complete period coverage. Other platform time filters are not inferred or silently substituted.

Current structured product currencies and Amazon object-valued prices are retained alongside actual identifiers/location fields, without inventing currency or country. LinkedIn's current nested engagement/commentary and Instagram video-play fields are preserved. Existing brand, product, official-link and output provenance checks remain active. Actor schemas and output shapes were read through metadata-only Store lookups on 21 November 2026; no actor run occurred. Relevant primary metadata: `harvestapi/linkedin-post-search`, `harvestapi/linkedin-company-search`, `clockworks/tiktok-scraper`, `fatihtahta/trendyol-scraper`, `junglee/free-amazon-product-scraper`, `logiover/website-seo-audit-crawler`, `apify/instagram-scraper`.

## Cost, validation and scope

Every selected actor must still pass the existing live event-only pricing, saved/server cap, affordable shared-ledger and output checks before dispatch. The universal per-actor maximum remains USD 0.20, lower individual limits win, and all work plus worker execution remains in the same original 5,000-kuruş account with full-report/review reserves. New tool availability is not an instruction to spend or run every tool.

New offline regressions exercise the real provider/adapter chain using synthetic HTTP responses, a local ledger and synthetic source data. They cover relevant-source adjudication, retained partial outcomes, snapshot/v1 compatibility, duplicate-URL comments, empty samples, exact bounded platform inputs, price currencies, static technical scope, date filtering, identity rejection, lower caps, reserve refusal, uncertain-run non-replay and initial-read gates. The parent code reproduces the core provenance, discarded-results and overwritten-comment failures. Scripted workflow tests do not establish actual analyst quality; real source access, model adherence, billed time and commercial usefulness remain for the user's later paid live test after separate release approval.

Required final checks: focused regressions, full tests, Preview and production-mode builds, JS syntax/whitespace checks, responsive synthetic report UI, and GET-only Preview smoke checks. No customer records, database/schema/auth/RLS, environment variables, dependencies, prices, service selection, logos, other applications or customer UI change. Corrections 7–10 remain pending.

Rollback: leave this stacked branch unmerged or revert its code commit after a separately approved release. Preserve offers, jobs, source archives, budget IDs and every paid/uncertain receipt. No migration or data rollback is required.
