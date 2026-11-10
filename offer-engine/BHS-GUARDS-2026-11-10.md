# BHS schema and scraper guards

Base: current production `f0bc4c483e45a69dff8e2e14fdba1620b3ba28ce`.
The installation in PRs #33/#34 is retained, including Haiku billing fallback,
uncapped findings, source research, Vault/queue integration and test isolation.
No production or database change is part of this follow-up.

Claude JSON/tool grammar omits unsupported numeric minimum/maximum keywords.
The original server schema still validates the entire result, including numeric
bounds and proof checks. Exact prior request hashes are checked before a new
call: completed replies are reused; unresolved earlier calls remain charged.
This applies to Sonnet review and Haiku's forced data-return tool.

Apify's final-item allowance is reserved within the smaller verified individual
Actor cap and the same 50 TRY ledger. Known event prices are summed at their
highest listed tier; unknown prices or additional platform fees prevent a run.
The reported charge is checked against the reserved bound. Missing original
Actor policies remain unavailable, without a common .40 USD default.

References reviewed:
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://docs.apify.com/sdk/js/reference/next/class/ChargingManager
- https://docs.apify.com/api/v2/actor-get

No new paid acceptance run is requested. The user chose real-brand acceptance
in production; earlier 36.29 TRY diagnostic commitments remain archived and do
not establish a completed report cost. No Actor has been executed for this fix.

Read-only production check on 10 November: `/api/audit` returned HTTP 200,
configured=true, background execution, Sonnet/Flash-Lite routing and a 50 TRY
cap. This configuration check does not prove successful model generation or
final report quality. Actual scraper acceptance still needs the exact Actor
limits. The shared tariff reports review due on 15 November; it is unchanged.

Validation results will be recorded in the PR. Rollback is the preceding
deployment/source commit; no migration, secret, gateway, scheduler or receipt
changes need reversing. Production requires separate approval.
