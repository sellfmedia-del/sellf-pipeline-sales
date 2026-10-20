# Direct BHS and proposal preview

The default `/api/audit` handler uses `direct-research.mjs`. Its four stages are
source planning, source collection, Gemini Pro BHS generation, and proposal scope.
There is no semantic/content reviewer, editorial pass, approval gate, or second
recovery research loop in the deployed flow. Legacy adapters remain for regression
coverage but are not invoked by the default endpoint.

Eight Tavily advanced searches start together. A short Flash call selects the
source plan using the actual brief's market, product and business model. Two
targeted searches run together, then the existing SSRF-protected HTML/PDF reader
collects public sources in one pass with a 55-second deadline. Failed pages are
recorded as reader limitations, not customer performance defects. Search snippets
are explicitly distinguished from fully read pages in the Pro input.

Gemini 3.1 Pro receives the complete approved `src/bhs/methodology.txt` verbatim.
It produces all nine BHS sections as JSON, including six dimensions and their
original weights, preliminary scoring, onboarding questions, opportunities/risks,
meeting questions, competitors, benchmark and sources. The adapter performs only
JSON transport checks, URL safety and weighted arithmetic. It does not review,
rewrite or reject the model's interpretations. Missing measured metrics remain
null; preliminary scores are labelled as estimates per the approved methodology.

The full report JSON is retained in `audit.data.report` as internal input.
`audit-selection.mjs` selects at most six existing findings (two per priority),
160-character finding excerpts and 220-character dimension takeaways. It favors
critical findings, selected-service links and brief relevance, deduplicates text,
and changes no BHS scores. Full reports, benchmarks, onboarding questions and
unselected source content are not included in the customer proposal. Scope and concise proposal copy use the BHS plus the card
brief. Fees remain deterministic. Logo processing and final assembly make no paid
model calls. Customer presentation keeps the approved layout.

## Budget and existing records

Every paid operation reserves its maximum cost in the durable account/card ledger
before starting. All workers share a 5,000-kurus ceiling; starting again never
resets it. Completed stages are reused, including reports created before this
simplification. Existing cards, proposals, budgets and paid receipts are retained.
No production tables or Travis code are changed.

The quote includes a 500-kurus infrastructure allowance, reviewed model/search
rates, a conservative 60 TRY/USD conversion and 20% monetary margin. Unknown or
expired tariffs, stale/unreadable FX and insufficient balance block before paid
work. Verified model usage releases unused reservations. Ambiguous failed calls
remain accounted for. Documented non-billed Google HTTP 400 receipts stay cached
as rejected requests and are not automatically replayed.

This is an application spending ceiling. Tax, bank conversion and allocated
hosting charges require invoice reconciliation; a literal all-inclusive provider
invoice guarantee is not established by this ledger.

## Preview deployment

Git-based Preview deployments reuse Pipeline's existing Preview Tavily/Gemini
variables without extracting or changing their values. Gateway/session variables
are scoped to `feat/offer-budget-validation`. Each deployment overrides its root
to `offer-engine`; production configuration and the Git connection are preserved.

## Verification

Tests cover parallel searches, the exact methodology in the Pro prompt, direct
full-JSON handoff, reuse of an existing paid report without new model work, unsafe
URL rejection, signed final completion, budget concurrency and no-reset behavior.
Browser coverage includes the intermediate-completion regression. Latency and
cost must be reported from a real completed run, not from unit-test timings.
