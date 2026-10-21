# Independent offers and negotiated prices

This branch is a preview. Production main, gateway and database have not been
modified by preparing it. The review URL uses synthetic, page-local records and
performs no paid model calls.

## Behavior

- Existing first-offer flow, cost catalogue, CRM and Travis sources are unchanged.
- Additional offers open the same full brief. Only a BHS reuse/new radio group is
  added; no title, market or project fields. Goals, needs and services start empty.
- Reuse retrieves the selected owner's complete stored synthesis (not the short
  customer projection). Its date and original market remain explicit. Only the
  new scope/copy uses Flash, under its own capped ledger; research is never rerun.
- Explicit new BHS uses the same approved methodology/models/output limits in a
  separate 50 TRY budget. It cannot consume/reset the original audit's budget.
- Each additional save gets an independent version and existing collision-safe
  publication link. Neither the source offer nor lead.value is updated.
- Price edits work on draft and published offers, keep frozen USD FX, require
  below-floor acknowledgement, preserve content/link/password, and record history.
- Matching retries are idempotent. Stale concurrent edits are rejected; publication
  merges into the locked current document instead of overwriting changed prices.

## Reviewed release order (after UI approval)

1. Re-read production tables, gateway and main. Baseline main at preparation:
   `c21cc101cadf750e3663db637edcf1f56d392e68`. Gateway version 2; compare downloaded
   handler with that commit before replacing it. Do not overwrite intervening work.
2. Apply `offer-variants.sql` and `offer-variants-budget.sql` as additive migrations
   in Pipeline project `gxngmqewskhrbxqmnpps` (Pipeline ve Bağımsız account only).
   These add private workers/history; no backfill, offer/card or Auth/Travis update.
3. Verify role grants/RLS and run advisors; deploy the backward-compatible
   `pipeline-offer-store` gateway with JWT verification retained.
4. Build/test the approved exact commit with production configuration, then
   release Pipeline only. No DNS, Offerletter site or Travis change is required.
5. Read-only health checks and owner UI verification. Do not start a paid audit,
   repair existing offers, or create customer records without the user's test action.

## Validation

`npm test` runs existing and new Node regression tests. Set `LOGO_TEST_CHROMIUM`
to a working local Chromium binary for all desktop/mobile browser flows. Build
preview assets before browser tests (`VERCEL_ENV=preview npm run build`).

SQL verification uses an ephemeral local PostgreSQL/WASM database, never a live
project. Install `@electric-sql/pglite@0.3.14` in a scratch QA directory and supply
its absolute ESM URL as `SQL_TEST_PGLITE_URL` when running
`node offer-engine/scripts/verify-offer-variants-sql.mjs` from the repository root.

Production builds explicitly delete all `variants-review*` assets, including when
reusing an existing local build directory. Preview path:
`/offers/variants-review.html`.
