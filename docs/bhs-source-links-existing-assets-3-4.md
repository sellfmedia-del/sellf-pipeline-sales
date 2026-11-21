# BHS source links and existing assets corrections 3–4 — 21 November 2026

This pair is stacked on PR #89 (`8bef6a905b9efc95da634791f937a99095193814`). Only isolated implementation and Preview are authorized. Do not merge or deploy production, restart/resume Kuatra, or run paid provider/model/search/scraper acceptance. Production remains `c5f30c74dbba661692acad14685a20e1f936bcec`.

## 3. Preserve observed, meaningful source navigation

The retained homepage body could contain many image URLs and omit actual anchor hrefs. The old archive accepted only absolute Markdown URLs, and its first forty links could consist of images. A synthetic regression reproduces both the lost relative asset link and the `unknown_source` failure on an already discovered asset target against the parent commit.

Source presentation now keeps relative/absolute Markdown anchors and their labels, excludes image/action/session targets, and retains up to 200 links within 32 KB. The first forty are presented as parallel `links` and `linkLabels` arrays; additional windows use the existing free `read_saved_source` tool's optional `linkOffset`. Truncation and unavailable navigation are explicit. Original body text, source IDs, passage offsets, read-status evidence, and complete narrative remain intact.

After a successful Tavily basic extraction has settled, a separate zero-provider-fee navigation receipt captures static HTML anchors from that same public source. The reader makes at most three credential-free GETs, follows only bounded redirects, validates and pins public DNS at each hop, accepts HTML only, and limits transport/body size and wall time. It neither runs scripts nor follows discovered child links. Redirected relative links resolve against the actual final page. A redirect or label alone does not establish channel ownership.

Metadata failure cannot refund, relabel, discard or repurchase the successful paid extraction. Completed and uncertain navigation receipts are not repeated; unavailable navigation leaves the useful paid body intact. Historical Gemini helper/fallback fingerprints are checked using their exact legacy source layout before any new provider operation. Native frozen requests retain their existing durable ownership. The Tavily request, basic tariff, existing shared 5,000-kuruş account and infrastructure ledger are unchanged; extra GET execution time remains infrastructure-metered. Future analyst inputs include navigation within the existing full-context quote/admission checks.

## 4. Inspect existing assets before proposing their creation

The initial same-conversation context now asks the analyst to understand a relevant existing channel, sales network, catalogue or other asset before proposing work. It should record an important public question and pending candidate, read the relevant body, then connect observed state, goal-related gap and proposed change. Improvement, activation, expansion and genuinely new setup are distinct decisions. Existing assets do not exclude a service or erase the customer's growth goal.

Discovered links are explicitly discovery-only. A listing is not proof of current activity, sales, completeness or performance. Failed/unavailable/truncated navigation is not absence. Where inspection cannot be completed, new-setup recommendations must remain conditional and explain the unknown. This is guidance within the single analyst's full natural conversation, not a fixed topic checklist, automatic menu crawl, keyword quality classifier or second summarizing agent.

Existing important-public-question and pending-candidate gates still apply; source quotes must come from actually presented body passages. Synthetic workflow coverage demonstrates retaining the client goal, blocking normal completion while a chosen asset question remains open, reading it, and preserving grounded improvement/expansion in the final report. This scripted coverage does not establish real model adherence or production business-quality acceptance. That remains the user's paid live test after a separately approved release.

## Verification, scope and rollback

Required checks: focused offline regressions, the full existing test suite, Preview and production-mode builds, syntax/whitespace checks, and synthetic responsive UI checks at desktop/tablet/mobile widths. Provider responses, navigation HTML, DNS resolution and all source data in the new tests are synthetic. No paid acceptance or token-count call is authorized.

No database/schema/auth/RLS, customer records, environment variables, dependencies, prices, service selection, logos, unrelated applications or customer UI change. Corrections 5–10 remain pending. JavaScript-generated-only navigation may still be unavailable; the analyst can use existing permitted research paths and must not infer absence.

Rollback: keep the stacked branches unmerged, or revert this pair's code commit after a separately approved release. Preserve original archives, offers, jobs and all paid/uncertain receipts. No data migration or data rollback is required.
