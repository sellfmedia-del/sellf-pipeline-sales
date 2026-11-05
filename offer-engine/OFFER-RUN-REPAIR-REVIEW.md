# Offer run repair review

Status: isolated branch and preview only. Production source is unchanged at fa694ebd82a299b34681df5b52dd300d1e40128d. No production database, migration, RLS, Auth, customer-record or environment changes were made.

## Changes

- Each newly opened offer has one UUID shared by logo cleanup, BHS, pricing and proposal translation. Existing additional-run RPCs provide its independent 50 TRY ceiling. Old card budgets, paid receipts and uncertain reservations are retained.
- The signed audit ticket pins the run and approved model. Resume and double submission cannot change either. Fresh research bypasses the partial brand cache; explicit saved-offer reuse remains separate.
- Compact screenshots use existing pixel checks before paid localisation. If backdrop classification is unavailable, valid edge transparency and all uncertain interior ink are retained, with visible review and the original background color.
- Read-source citation IDs bind observations to actual source excerpts. Trusted IDs recover canonical URLs and quotes, including visible Markdown labels. Legacy source checks and numeric contradiction checks remain active.
- A useful server-filtered synthesis can be returned without buying an entire replacement report. Sparse or unusable output keeps the existing bounded alternate path.
- An optional Vertex route through AI Gateway preserves the exact model, context, output ceiling, usage settlement and 50 TRY ledger cap. It checks access balance and current endpoint prices first, restricts the provider, and rejects unexpected model/provider responses. Confirmed zero-provider-attempt refusals settle to zero. Ambiguous requests keep their reservation.

## Verification

Repository tests, targeted source/cost/transport tests and production/preview builds pass. The 18 browser cases were exercised separately on desktop/mobile; the ordinary test command skips them unless LOGO_TEST_CHROMIUM is set. The repository has no configured lint or typecheck script.

Actual public-brand provider tests with synthetic commercial briefs did **not** pass end-to-end acceptance:

| Trial | Outcome | Committed usage/reservation ceiling |
| --- | --- | --- |
| Existing Pro-first order | Report projected to 2 supported findings and 5 available areas; depth gate failed | 49.77 TRY |
| Source-proof contract, Pro-first | Synthesis timed out; alternate could not fit the remaining ceiling | 42.58 TRY |
| Argon-first order | Planning models unavailable; no report | 17.55 TRY |

These ceilings include uncertain reservations and a 5 TRY infrastructure allowance. They are not provider invoices. No trial was presented as a successful full BHS or English proposal.

AI Gateway credentials/balance can be read with the existing project OIDC token, but Pro requests return HTTP 403 no_providers_available: the account is on the free tier. No model provider was attempted. A native Vertex probe with the existing Google API key returns HTTP 401 and requires different account authentication.

## Runtime choices and remaining gate

- OFFER_MODEL_TRANSPORT defaults to google. Optional value vertex is prepared but disabled.
- OFFER_BHS_PRIMARY_MODEL defaults to gemini-3.1-pro-preview. Only that model and gemini-4-argon are allowed; the choice is signed into the job. Argon-first is not enabled by default because its live test failed.
- Vertex acceptance requires paid AI Gateway model access. Activating a new paid service requires the user's explicit approval. Do not enable the route or merge to main until a real BHS, supported report content and English offer pass the 50 TRY test.
- The existing tariff expiration on 15 November 2026 remains a required price-review gate. Rates and expiration were not silently extended.

## Rollback

No schema rollback is needed. Before any production release, retain fa694ebd82a299b34681df5b52dd300d1e40128d and its current deployment. The new transport stays disabled until separately validated and approved.
