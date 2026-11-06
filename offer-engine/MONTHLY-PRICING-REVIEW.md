# Optional monthly operations pricing

Branch: `feat/monthly-offer-pricing` · Base: `f3d2d0d`

The offer brief has an unchecked **Ay bazlı fiyatlandır** option. When selected,
the operator assigns catalogue operations to each of 1–36 months. The existing
sheet-derived catalogue, segment costs, account-coordination exception, minimum
markup, ideal markup and influencer commission rules price each month. Explicit
monthly selections are never reduced or supplemented by the model or a budget
hint. A month containing an operation without a catalogue cost requires a real
custom cost; an influencer operation requires its list amount.

The customer's existing template shows the monthly table in the price area and
the same operations in its workflow. BHS, logo processing and the common proposal
sections use their existing code. The default path continues to produce the two
standard alternatives. Pricing the monthly selection makes no model calls. The
existing TR/EN translation and frozen TRY/USD conversion apply to the monthly
document; internal costs are excluded from the customer document.

## Persistence compatibility

No migration, new table, policy, gateway deployment, authentication change,
environment edit, backfill or production record change is required. The current
JSON document gains an explicit `pricingMode` and `monthlyPlan`.

The deployed storage contract requires two canonical alternative IDs and a scalar
`monthly_amount`. Monthly documents keep those compatibility entries at the first
month's operations fee; they contain no Growth service and are not selectable in
the monthly customer view. The actual customer agreement is the complete monthly
plan. The scalar is explicitly labelled as the first-month reference in the card
and save confirmation. Creating an additional offer keeps the existing card value,
as before. Saving the first offer uses the existing targeted card-value update.

The old two-price negotiation dialog is disabled only for monthly documents, and
the server rejects attempts to alter their scalar through that dialog. All normal
offers retain their existing price-editing workflow. Editing a saved monthly plan
is outside this change; create a new offer version using the usual brief.

## Verification

- The full existing root/engine suites pass (54 root tests and 315 engine tests;
  19 opt-in browser/live checks skipped in that run).
- Monthly calculations match the existing operations formula for every catalogue
  operation and segment, including missing costs and influencer commissions.
- Signed API tests cover pricing, all months of frozen FX, English translation,
  source/run provenance, tampering rejection and an independent save.
- An isolated PostgreSQL test uses the current schema to save, retry, publish and
  reopen a monthly variant. Original offers, cards, contacts, notes, history and
  budgets remain identical.
- Six desktop/mobile browser regressions pass: monthly selection, pricing,
  workflow and save/reopen; standard offers and price edits; language/currency;
  saved cards; customer credentials and Offerletter routing.
- Five Offerletter portal/API tests and its production build pass.
- TypeScript declaration checking, targeted ESLint checks and production builds
  pass. Production output excludes the synthetic monthly-review adapters.

Preview review: `/offers/monthly-review.html`. It uses a synthetic brand and the
same monthly calculation module; research, translation and persistence are
simulated. It makes no API calls and does not touch real Pipeline data. Real
server handlers and persistence are exercised separately in the tests above.

## Release and rollback

Production has not been changed. Review the branch preview before merging.
Release requires a separate production approval. Before any monthly documents
are saved, the rollback target is `f3d2d0d` / deployment
`dpl_4mRTtkzq1PSZtAjLVGSRiyEvRM9K`. After a monthly document has been saved,
disable monthly creation with a targeted code revert while retaining the monthly
reader and currency validation. Do not revert the reader to a version which
would display only the first-month compatibility amount. There is no migration
to reverse, and all stored documents must be retained.
