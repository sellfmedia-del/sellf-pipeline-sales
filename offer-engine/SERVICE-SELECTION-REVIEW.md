# Explicit service selection and separate project fees

Branch: `feat/explicit-service-project-selection`. Base: `38477b7` (monthly release).

## Behaviour

After the verified BHS step, the operator checks the exact retainer services and
one-off projects. Standard pricing stays the default and keeps both existing
alternatives. Monthly pricing remains optional and uses the same checkbox picker
for each month. Brief text, BHS suggestions and budget hints cannot add, remove,
substitute or defer selections in either new UI path. Changing selections keeps
the BHS/proof and invalidates the old price, document and save controls.

A checked project always means a separately charged one-off project. There is no
automatic Growth absorption rule. An unchecked project is not priced or promised.
The standard proposal lists the selected project prices below both retainers;
they apply to either alternative. Monthly proposals show separate retainer and
one-off columns, with explicit labels on mobile. Only retainer services are copied
to another month; a project must be explicitly selected again to be charged there.

The normal source of prices remains the server catalogue snapshot. The connected
spreadsheet `10TQmuNVY8ArWrk9iH8iGzqvOcQHnrRXzx3AMPy1-Z8c` was read only:
- `Hizmet Bedelleri`, rows 2–29: original 81 segment values unchanged plus Mail
  Pazarlama row 29 (15,000 / 20,000 / 22,500 TRY).
- `Proje Kalem ve Bedelleri`, rows 3–9: seven project types, distinct from monthly
  webmaster and design services. All 105 segment values match the two tabs.
- Internal Account/Growth rows remain automatic rules, not extra checkboxes.

The existing retainer rules are preserved: single operation Account 5,000 TRY,
otherwise segment Account; Growth uses max(initial team, consultant + operations)
plus segment Account; ideal = 2x cost; minimum = 1.5x; influencer fee is 10% of its
list without marking up that fee. Each distinct project includes the project-tab
segment Account once. Static/motion quantities multiply the unit production cost,
not the project Account. Custom/zero catalogue entries require a real positive,
two-decimal cost. Project prices never increase either monthly retainer.

Project-only operation retainers can be zero. Card monthly references remain
monthly amounts (first month's retainer in monthly mode); project fees stay
separate. Existing variant saves retain the original card value.

## Boundaries

No database migration, RLS/auth change, environment change, BHS/logo change,
package update or production data mutation. Existing offers remain readable. The
legacy inference inputs remain supported for compatibility with already loaded
clients; the new UI sends explicit IDs and bypasses the scope provider entirely.
Public customer documents contain project selling prices and descriptions only;
all underlying costs stay in the internal pricing snapshot. TRY and USD project
prices use the same frozen TCMB record as retainers. USD project totals sum the
individually rounded line amounts, avoiding one-cent display discrepancies.

The synthetic review page `/offers/monthly-review.html` uses the actual pure
pricing calculators. BHS/logo/translation/persistence on that page are simulated
and page-local. Production builds remove the review adapter and cost modules.
Actual API proof binding and the existing deployed SQL/RPC contracts are tested
separately with synthetic data; no production rows are used for testing.

## Verification

- 105 spreadsheet segment costs compared: no mismatch.
- Root tests: 54 passed.
- Engine tests with concurrency 2: 328 passed; 20 opt-in checks skipped.
- Browser-enabled regression command: 12 passed, including desktop/mobile BHS,
  recovery, exact selection, monthly project copying, negotiation and variants.
- Final two selection browser tests rerun after the selection edit control/mobile
  price labels; both passed on desktop and mobile.
- Offerletter tests: 5 passed; production build passed.
- TypeScript contracts, focused ESLint rules and diff whitespace checks passed.
- Production build keeps root index.html byte-identical and excludes preview
  fixtures/cost modules.
- Isolated PostgreSQL saves, retries, teammate reads, publish/open and project-only
  zero retainers preserve original offers, leads, notes, history and budgets.

An initial unrestricted parallel engine run had one test-file process terminate
without an assertion report. That same shared-research test passed alone and the
complete suite passed with concurrency 2. An early browser failure identified a
missing monthly table display variable, which was fixed before passing checks.

## Release and rollback

Preview review and explicit production approval are required before merging.
All three Vercel projects must build the same commit for release. No production
release has been performed for this branch.

Before new project offers exist, revert this branch to the base. After such offers
exist, retain the project-capable readers in Pipeline and Offerletter when
rolling back creation; an old reader would omit one-off fees from new documents.
Keep saved documents, pricing snapshots and existing SQL unchanged.
