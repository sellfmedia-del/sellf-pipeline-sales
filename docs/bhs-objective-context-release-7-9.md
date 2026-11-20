# BHS corrections 7–9 — 20 November 2026

This release completes the implementation stacked on PRs #85–87. The user explicitly authorized final checks and production release of all remaining corrections. Paid tests remain user-only: development, Preview and production smoke checks must not start a model, search, scraper, research job or recovery.

## 7. Objective verification

New turns carry `source-identity-and-report-structure-v1`. Source IDs must match their public URL. Used duplicate identities, modified archive text, unread narrative citations, malformed source tokens, mismatched citation URLs, metadata/navigation-only quotations, empty section leaves and incomplete compatibility measurements/competitor records fail mechanical validation. A parent section can contain useful child sections; natural heading names and prose-only reports are allowed. No heading keyword, fixed SWOT/action count or narrative substring decides analytical quality. Claude still evaluates the meaning, certainty and commercial reasoning. Uncited observed highlights fail; qualified inference and brief declarations do not require fabricated sources.

Saved offers contain verified passages with a digest of their own text and the original archive identity. A modified capture cannot become verified through snapshot reuse. Legacy reports without the new marker keep their previous interpretation; useful incomplete drafts remain available for the pricing handoff.

## 8. Context and one budget

A free durable context receipt binds the complete brief, conversation ID and original 5,000 kuruş budget ID before any provider dispatch. A mismatched brief/account is refused without a paid call. Free checkpoint recovery keeps the original uncertain receipt, not a new budget. Research, writing, bounded semantic patches and metered worker infrastructure retain the existing ledger/settlement rules and protected writing/review reserve.

Gemini fallback now receives the entire original conversation, including tool observations, research answers, candidates and open questions. Its input is frozen before dispatch. A legacy completed or uncertain fallback receipt still owns that work and prevents repurchase after the context addition. Source archives and opaque Claude thinking remain in the original record. No database, RLS/auth, schema, dependency or pricing change is needed.

JSONB reorders object keys. Context/report fingerprints are now order-independent, and paid native writing/review requests use a frozen request ID rather than a hash of reloaded message objects. Native JSONB regression tests verify complete quality after reload and no second token count or generation after losing a free turn acknowledgement. Historical requests with no verifiable frozen paid ID pause rather than risking repurchase; old semantic digest encoding remains readable.

## 9. Acceptance and release

`node offer-engine/scripts/bhs-offline-acceptance.mjs /absolute/path/to/export.json` accepts `{brief, stored, cost, reference?}` from retained results. It performs objective/source/research/semantic-state/account checks without providers, queue mutation or network access. It reports the reference digest and report sizes for review; length is not a quality score. Even a technical pass remains `technical_pass_human_pending` and lists the user's Doku comparison criteria. The Preview demonstrates this with explicitly synthetic data; it never represents real-brand acceptance.

Historical Doku source receipts are available locally but are not a complete accepted report. No new paid Doku run is authorized for the assistant. Actual model adherence, report depth, latency and billed cost must be accepted by the user through their own live test. Production release is explicitly authorized in the latest instruction; this does not turn the outstanding human business-quality check into a passing test.

Release validation and final Preview/production commit/deployment IDs are recorded in the PR. Production baseline before release: `fced9bebf7990eccd4f49b87cae1ea6ed3ec3ccc`, `dpl_A3mFvrFNr1eba7YMLhCZGRPp8yTu`. The production conversation flag is already enabled and the previous paid QA flag is disabled. No environment edit is required. The synthetic Preview assets are removed from production output.

Rollback: redeploy the previous Git commit through Vercel if needed, retaining all source archives, job records and paid receipts. No data/schema rollback is needed. Do not delete/relabel paid reservations or start an automatic paid acceptance/retry during release.
