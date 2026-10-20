# Bounded proposal preview

The deployed `/api/audit` default uses `bounded-handler.mjs`. Legacy factory
exports remain for regression tests; they are not the deployed request handler.
There are no Deep Research / Max Interactions requests in the new HTTP flow.

Discovery uses at most ten Tavily advanced searches (six initial searches and
four focused searches). Public HTML/PDF sources are read by the existing SSRF
protected collector. Flash creates the source plan. Gemini 3.1 Pro generates the
full six-dimension report, scope and concise proposal copy in one bounded call.
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

Set `OFFER_TAVILY_API_KEY` in **sellf-offer-engine → Settings → Environment
Variables**, for **Preview**, then rebuild this Git branch. `TAVILY_API_KEY` is
also accepted. The existing Travis sensitive variable cannot be read back through
the Vercel API; its value/configuration has not been changed. Gemini and the
preview storage/session variables are already configured independently.

## Verification status

Unit tests cover concurrent duplicate requests, persistent cache reuse, ambiguous
failures, exchange-rate failure, unknown/expired tariffs, token upper bounds and
no additional paid pricing/composition. Actual Postgres tests verified concurrent
3,000-kurus claims: one succeeded and the other was blocked; repeated begin did
not reset the ledger; an exact 5,000-kurus balance rejected one additional kurus.
Anonymous and authenticated roles cannot execute the budget RPC; both tables
have RLS. Existing production card/space fingerprints remained unchanged.

The historical Silverline reference and cached evidence are available for a
real comparison. No paid research was started while implementing this change.
Tavily is missing in the offer project, so quality equivalence to the manual
Deep Research + Pro workflow and live end-to-end cost remain **unverified**.
Fixture tests are not evidence of equivalent research quality. Do not approve
production release until a real report has passed that comparison.
