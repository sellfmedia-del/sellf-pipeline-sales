# Offer run repair review

Status: isolated branch and preview only. Production source remains fa694ebd82a299b34681df5b52dd300d1e40128d. No production database, migration, RLS, Auth, customer-record or environment changes were made.

## Root causes and changes

- New offer openings inherited a card's historical reservations. One fresh UUID is now shared by logo, BHS, pricing and translation, using the existing independent-run budget RPC. The 50 TRY ceiling applies to that run. Old receipts and ambiguous reservations are retained; duplicate submission and signed resume keep the same run.
- Pro/Argon service failures consumed conservative reservations, leaving insufficient room for translation. Existing-account Gemini 2.5 Pro is now the BHS default; Gemini 2.5 Flash handles support tasks. The approved alternate keeps the same contract and the ledger checks its entire envelope before any paid call.
- A 16k output ceiling truncated the report before its 24-area evaluation. The reviewed Pro envelope can reach 32k within the same hard cap. Concise fields leave room for all areas without removing research context.
- Findings selected unrelated quotes from otherwise relevant pages. Read-source proof IDs now bind canonical URLs and actual excerpts. References to findings resolve to their original sources; fabricated IDs and conflicting numbers still fail.
- Recorded HTTPS, viewport, platform and tag metadata previously lacked citable evidence, so technical fields stayed empty. Those server observations now have distinct HTML-signal proofs with explicit limitations. Downloaded HTML cannot prove actual tracking operation, mobile experience, speed or the absence of a customer mechanism; such claims are qualified as hypotheses.
- Compact screenshots use pixel checks before paid localisation. Valid edge transparency and original ink survive classifier failure, with visible interior-review notice and the original background. No replacement logo is generated.

## Actual acceptance

All commercial briefs were synthetic. Research came from public brand sources. Previously paid discovery and BHS receipts were reused for subsequent support checks; the accepted totals include their actual research cost and the 5 TRY infrastructure allowance. No customer record, offer publication or email was created.

| Actual trial | Outcome | Usage plus reservation ceiling |
| --- | --- | --- |
| Existing Pro/Argon order | Failed: unavailable models and/or sparse projection | 17.55–49.77 TRY |
| 2.5 Pro with the old 16k ceiling | Failed: truncated report, no area coverage | 45.93 TRY |
| Full Pro output without technical proofs | Five findings, nine supported areas; depth gate failed | 27.88 TRY |
| Source-bound Pro BHS and Pro English | Passed; 13 supported areas / all 24 evaluated | 30.40 TRY |
| Repeated Pro English | Failed: HTTP 503 and alternate could not fit remaining ceiling | 44.10 TRY |
| Pro BHS plus Flash support | Passed; English proposal and both alternatives | 28.04 TRY |
| Actual logo-first order, repeated English | Passed despite a real Flash HTTP 503; Argon completed translation. Real logo classifier returned HTTP 200 | 32.14 TRY |

The last trial retained 3.12 TRY for the ambiguous 503 request rather than claiming a refund. It produced a transparent actual brand logo without interior-review fallback, a source-bound BHS (five findings, 13 supported areas, all 24 evaluated), exact deterministic pricing and an English proposal. Status reload added no provider call or charge. These totals are accounting ceilings, not provider invoices or a guarantee of identical costs for every brief.

Repository tests, targeted source/cost/model tests, production and preview builds pass. Optional browser cases are skipped by the ordinary command and were exercised separately; the repair review also passes at 1280px and 390px with both proposal options, no page error and no document overflow. No lint or typecheck script is configured.

## Runtime choices and known limits

- OFFER_BHS_PRIMARY_MODEL defaults to gemini-2.5-pro. Only approved Pro models may research BHS.
- OFFER_SUPPORT_MODEL defaults to gemini-2.5-flash. Published reviewed rates are used for both models, including thinking tokens; a returned-model check prevents silent substitution.
- OFFER_MODEL_TRANSPORT defaults to google. The optional Vertex/Gateway route remains disabled; the connected free Gateway tier refused Pro requests before a provider attempt. No paid-service activation or top-up occurred.
- The existing tariff review gate expires on 15 November 2026. It was not silently extended.
- Both selected 2.5 models are officially scheduled to shut down / auto-route on 1 December 2026. New paid calls are blocked from that date, and completed receipts remain reusable. This is a working interim profile on the existing account; a modern Pro route must be accepted before retirement. See https://ai.google.dev/gemini-api/docs/deprecations.
- Provider uptime and the availability of public data remain external dependencies. Missing figures stay unavailable; no revenue, traffic or ad results are invented to fill the report.

## Release and rollback

Review the actual-result preview and approve production separately before merging. Retain fa694ebd82a299b34681df5b52dd300d1e40128d and its current Vercel deployment. Rollback needs only a Git revert / previous deployment; no schema rollback is needed. Review-only fixture pages are on a separate QA branch and are excluded from the release PR.
