# BHS conversation analyst — preview release, 20 November 2026

## Outcome and scope

New BHS runs use one Claude analyst conversation for the full brief, research decisions, tool observations and final narrative. Tavily Search discovers pages; Extract reads them. Gemini can compare supplied sources and provides a separately funded final-answer fallback if Claude is unavailable. Narrow scraper reads are optional and require an observed URL, a suitable actor and verified event-based cost controls.

The complete Markdown report is authoritative and appears before the service editor. The compatibility findings retain full analysis, action and measurement text. Existing explicit service selection, price calculation, saved offers and legacy BHS results keep their contracts. New research does not enter legacy task quotas, completion gates or statement clipping.

No database migration, RLS/auth change, Edge Function deployment or production configuration change is included. The existing installed queue, leases and budget ledger are reused. Legacy phase names are transport acknowledgements only; the analyst runs during `brand_plan` with a durable turn checkpoint for each invocation.

## Activation and rollback

- Branch: `feat/bhs-conversation-analyst`; base production commit: `ab746517a2dc4149fcd0bb1a17dff3eccce62ae4`.
- `OFFER_BHS_CONVERSATION_ENABLED=true` explicitly enables new sessions. Vercel Preview enables them by default unless the flag is `false`. Production stays disabled by default.
- The engine choice is pinned in the same job ledger. Existing legacy jobs are not switched mid-run.
- Preview contains `/offers/conversation-review.html`, a synthetic local-state display with no paid calls or database persistence. Production builds explicitly remove its HTML, JS and fixture data.
- No merge or production activation is authorized in this release. After approval, a separate release must explicitly activate the new engine and verify the production health response. Merging this branch alone does not activate it in production.
- Before any later production release, retain the currently serving deployment ID and commit. Stop new conversation starts by disabling the flag; retained jobs keep their pinned engine. To roll code back, redeploy the previous verified Git commit through Vercel. No schema rollback is required. Paid receipts must never be deleted or relabelled as free.

## Cost and durability

Normal BHS uses one 5,000 kuruş account, including models, source tools, actors and metered worker infrastructure. There is no automatic extra research account. The final-answer reserve is estimated from the actual conversation token count and full output allowance before more research is authorized.

Claude reservations include uncached prompt creation, output upper bounds, a 60 TRY/USD FX ceiling, tax and allowance. Actual verified provider usage settles within the reservation. Tavily reservations use the highest supported credit tariff; Extract's delayed credit reporting cannot erase fractional usage. Scraper reservations preserve the final-report reserve. Unknown/timeout paid requests retain their reservation and are not replayed.

Requests are frozen before provider dispatch; paid receipts are immutable. Free turn and result checkpoints can recover an abandoned write using a separate zero-cost record, without refunding or repeating the original paid work. Source archives retain full text; the analyst can retrieve later passages without buying the page again.

## Validation completed

- Full repository regression: root 54 passed; engine 873 passed, 25 conditional tests skipped, zero failures. Subsequent focused run after final resilience changes: 28 conversation/provider/integration tests passed.
- Browser checks: 6 new and legacy UI tests passed, including desktop, tablet and mobile, partial report preservation and script-injection text handling.
- Production build and Preview build passed. Production output verified to exclude all three synthetic BHS review assets.
- Syntax checks and `git diff --check` passed. This JavaScript repository has no separate typecheck/lint script.
- Integration fixtures exercise authenticated enqueue, reconnect, queue finalization, signed audit/pricing proof and unchanged explicit-service proposal assembly. Provider responses and source bodies are synthetic; these tests do not purchase provider calls.

## Remaining acceptance and honest limits

No paid AI evaluation has been run for this release. Actual model/tool API compatibility, current account availability, real report depth, latency and billed cost still require one explicitly approved capped end-to-end run, followed by human assessment. Mechanical schema, theme and quote checks validate format/provenance; they do not prove every business inference or recommendation is correct. A report that fails validation remains visibly partial, keeps the available draft and permits the existing pricing handoff.

External outages, unavailable public pages and model errors cannot be made impossible. The implementation bounds spending, preserves usable context and prevents an unavailable analysis from being labelled complete. It must not be described as a proven quality fix until real-brand acceptance passes.
