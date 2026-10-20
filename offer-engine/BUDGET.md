# Bounded proposal preview

The deployed `/api/audit` default uses `bounded-handler.mjs`. Legacy factory
exports remain for regression tests; they are not the deployed request handler.
There are no Deep Research / Max Interactions requests in the new HTTP flow.

Discovery uses at most ten Tavily advanced searches (six initial searches and
four focused searches). Public HTML/PDF sources are read by the existing SSRF
protected collector. Flash creates the source plan. Gemini 4 Argon generates the
full six-dimension report. A separate bounded Flash call creates scope and concise
proposal copy from the report and brief. Source URLs/titles are restored from
verified evidence IDs; unmeasured benchmark cells remain explicitly null.
Flash independently reviews source support, entity/period comparability,
benchmarks and scoring. Failed evidence or semantic checks stop downstream use.
Logo processing, fee mathematics and final composition make no paid model calls.

## Persistent budget

`schema/preview-budget.sql` installs separate preview-only budget tables and a
service-role-only RPC. The gateway verifies the synthetic account and card owner.
Postgres locks the budget row before reserving each step. All workers and retries
share the same 5,000-kurus ceiling for that account/card. Beginning again does not
reset it. Completed results are reused. Ambiguous failed requests stay charged
and cannot automatically replay. No browser-supplied budget, amount or model is
accepted by the deployed audit handler.

500 kurus is reserved as an infrastructure allowance. Before generation, the
exact request is counted and an additional input margin is reserved along with
the entire configured output limit (including thinking). Unknown models,
expired tariffs, unreadable/stale FX, FX over 60 TRY/USD or insufficient funds
stop before starting paid generation/search. The tariff includes a 20% monetary
margin and assumes no free provider credits. The reviewed tariff expires on
2026-11-15 and must be reverified before being extended.

This is a conservative application spending ceiling, not a provider-enforced
TRY invoice limit. Provider price changes, tax/bank conversion and allocated
hosting charges require invoice reconciliation. The infrastructure allowance is
not independently metered per proposal. A literal all-inclusive invoice guarantee
and always-successful generation have not been demonstrated. If a quality gate
or spending ceiling stops the run, no weak substitute is silently published.

## Required preview setup

The validation branch deploys `offer-engine` through a per-deployment override in
the existing Pipeline project. It reuses that project's Preview `TAVILY_API_KEY`
and `GEMINI_API_KEY` without reading, copying or changing either secret. New
gateway/session variables are scoped to the validation branch. The project's
production configuration and Git connection remain unchanged.

## Verification status

Unit tests cover concurrent duplicate requests, persistent cache reuse, ambiguous
failures, exchange-rate failure, unknown/expired tariffs, token upper bounds and
no additional paid pricing/composition. Actual Postgres tests verified concurrent
3,000-kurus claims: one succeeded and the other was blocked; repeated begin did
not reset the ledger; an exact 5,000-kurus balance rejected one additional kurus.
Anonymous and authenticated roles cannot execute the budget RPC; both tables
have RLS. Existing production card/space fingerprints remained unchanged.

The live Silverline test has collected 22 sources. Its first paid synthesis
failed the coverage gate and was never accepted, priced or published. Failed
paid attempts remain on the same card's ledger. Documented Google HTTP 400
rejections are not billed and are recorded as zero-cost rejected receipts;
identical rejected requests cannot automatically replay. A small Argon request
confirmed model/key availability. As of the last completed request, the same
test card has accounted for 3,501 kurus including its infrastructure allowance.
The revised full-report schema is under live validation. Quality equivalence to
the manual Deep Research + Pro workflow and live end-to-end cost remain **unverified**.
Fixture tests are not evidence of equivalent research quality. Do not approve
production release until a real report has passed that comparison.
