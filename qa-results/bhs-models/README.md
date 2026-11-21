# Gemini comparison — 4 November 2026

**Decision: no production model change. No tested model demonstrated both better availability and equivalent BHS quality.**

The requested BHS recovery release is already live separately: PR #20, production merge `0d4e81a820ead49f428974f62bc258ffb3febef1`. The three production deployments were READY; live Pipeline renderer/client assets matched source, `/api/audit` and `/api/offer` returned configured health responses, and the English Offerletter portal returned HTTP 200. The synthetic recovery fixture was absent from production (404). Production-base local verification passed 333 tests including browser checks, without skips. Runtime error/fatal query returned no new errors. These checks do not assert that Google availability has recovered; a real full BHS acceptance was blocked by provider errors.

## Observed results

| Exact model | Accepted tiny replies | Observed tiny failures | Full BHS quality probe |
| --- | --- | --- | --- |
| gemini-3.6-flash | 1/3 | 2 HTTP 503 UNAVAILABLE | One request: UNAVAILABLE, no report |
| gemini-3.8-flash | 0/3 | 3 HTTP 503 UNAVAILABLE | Not run: no accepted health reply |
| gemini-2.5-pro | 0/3 | 3 HTTP 503 UNAVAILABLE | Not run: no accepted health reply |
| gemini-3.1-pro-preview | 1/3 | 2 HTTP 503 UNAVAILABLE | One request: UNAVAILABLE, no report |
| gemini-4-argon | 0/3 | 2 HTTP 503 UNAVAILABLE, 1 timeout | Not run: no accepted health reply |

Availability samples ran serially and were interleaved across models from 14:58 UTC on 4 November. Every model received the same 18-token health prompt, requesting a tiny JSON reply; Argon countTokens includes additional control overhead. There were no automatic retries. This is a small sample in one time window, not a statistically reliable long-term ranking. The two accepted replies demonstrate working generation/authentication for those requests; they do not establish a complete BHS flow.

After no model met the initial 2/3 availability threshold, the only two models with an accepted reply received one full BHS quality probe each, without relaxing the availability criterion. Both returned the provider's high-demand UNAVAILABLE message. Thus no full report existed for source/semantic quality comparison, and equal quality has **not** been established. The first probe harness overwrote the full-request numeric HTTP status with its local outcome label; it retained the exact provider code/message. The five-model health HTTP statuses remain recorded. The inert script now preserves both fields separately for a future explicitly authorized experiment; it was not rerun to repair that logging field.

## Quality control and fixed evidence

Both full probes used the same public Huel brief, 13 captured sources across Huel, Jimmy Joy, Soylent and yfood, the same approved BHS methodology, all 24 research areas, six dimensions, the complete JSON contract, 16,384-token output limit and MEDIUM reasoning. Cross-country evidence limits were explicit. No company performance assumptions or synthetic customer records were supplied. The failed reader result is retained as a reader limitation, not a diagnosis of the brand.

- Packet hash: `953916589de8153b617a71e1637d6f7eba4fcb8ec4365f1d88af90d9fc8c3042`
- Full synthesis input hash: `3c88ef0e9d6023f2499cf4997fba614b52649d8ca9e1e818f5b72956774462c2`
- Original packet/context replay and carry-forward budget were independently verified locally.
- Controlled synthesis excludes source-planning/search variability and does not constitute a full live customer acceptance test.
- Existing source/quote/number filters and production routing are unchanged. A successful JSON response alone would not qualify a model as equal quality.

## Cost and isolation

The combined two-pass cap was **5,000 kurus**. All previous reservations were carried forward; none was reset or refunded on a failed response. The final conservative committed envelope is **3,526 kurus**: 16 kurus of verified token usage priced with the QA allowance, plus 3,510 kurus of uncertain reservations. **This is not an invoice or a claim that 35.26 TRY was actually billed.** The envelope uses 60 TRY/USD plus 20%, ignores caching discounts and includes output/thinking ceilings. Prices were checked against Google's Standard Developer API pricing on 4 November; this script expires on 5 November pending review.

No Supabase, CRM/customer record, auth, environment, mail, publication or production routing changes occurred. The paid runner was gated to the Pipeline preview project and this branch. The final commit restores `vercel.json` exactly to the production build command, so normal future branch builds do not rerun the paid comparison. All code/receipts stay on the unmerged QA branch. QA allowance/continuation tests: 3/3 pass; syntax and whitespace checks pass.

## Reproducible records

- `availability.json`: first-pass replies and receipts.
- `evidence.json`: public brief, plan, captured packet and bounded context.
- `final-summary.json`: final two-pass results and combined receipts.
- Availability commit: `3e62ea39efa0eb988edc12c7229873f8ab19b2c0`; preview `dpl_9CS4c5EWPRhTSVYPmmRikTN3VnxT` (READY).
- Quality probe commit: `0810eae71bf58a46bae674ff2b9162b5bfa8f0e2`; preview `dpl_F3E9VXnePPU4uvfXLVFvBxFGeb3L` (READY).
- QA PR: https://github.com/sellfmedia-del/sellf-pipeline-sales/pull/21 — keep unmerged.
- Pricing reference: https://ai.google.dev/gemini-api/docs/pricing
- Legacy model lifecycle: https://ai.google.dev/gemini-api/docs/deprecations (2.5 Pro has restricted legacy access and scheduled rerouting; unsuitable as a durable backup independently of today's errors).

Production remains on the user-approved recovery release. Older model selection did not eliminate the observed provider unavailability in this sample. A new routing decision requires successful full reports and semantic review, not just one working tiny response.
