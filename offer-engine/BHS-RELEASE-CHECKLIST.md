# BHS v8 release review — 10 November 2026

This is a review/approval package, not a deployment instruction. Production is
unchanged. Keep the required content threshold and the aggregate 5,000-kurus
account; do not hide failures or reset earlier paid/uncertain calls.

## Targets verified read-only

- GitHub: sellfmedia-del/sellf-pipeline-sales; working branch feat/bhs-supervised-research.
- Vercel team: yigit-konuks-projects; Pipeline project prj_B6Q6FIgq9NjbBlb6ga03cn6PD3jJ.
- Supabase connection: Pipeline ve Bağımsız. Organization: pvpknoqioxgyerinoecv
  (Sellf Toolları ve Aunce). Project: gxngmqewskhrbxqmnpps.
- Existing gateways: pipeline-offer-store v4; pipeline-offer-preview-store v8.
- Existing budget tables/functions and Vault are present. The BHS queue,
  pg_cron and pg_net are absent. No production schema/data was changed.

## Required explicit approval before production infrastructure changes

1. Enable only these prerequisite extensions, using the reviewed platform docs:

   ```sql
   create extension if not exists pg_net with schema extensions;
   create extension if not exists pg_cron;
   ```

2. Apply the additive private queue in `schema/bhs-sequential-jobs.sql`. It does
   not edit existing CRM/offer/budget rows. Anonymous/authenticated access is
   revoked; only authenticated gateways can invoke its service-only functions.
3. Deploy the reviewed BHS gateway additions in the two existing gateways,
   including `_shared/bhs-jobs.mjs`. Capture the deployed source and current
   function configuration beforehand so both can be restored exactly.
4. Provision a new BHS-only worker secret through a secure server-side path in
   Vercel/Supabase/Vault. No provider or service-role key belongs in the queue,
   browser, scheduler SQL, review files or logs.
5. Provision the exact user-approved per-Actor limits in
   OFFER_BHS_ACTOR_LIMITS_JSON (server-only array of actor/maxTotalChargeUsd).
   Missing entries remain disabled. A lower saved Task cap always takes priority.
   Do not guess limits or replace them by a common .40 USD value.
6. Apply `schema/bhs-sequential-scheduler.sql` only after the approved worker
   origin, secret and deployment are verified. It uses a dedicated 10-second
   scheduler and sends no HTTP request while there is no queued/expired work.
7. Activate the reviewed BHS v8/background flags only after content/cost
   acceptance and explicit production approval; then check a real authenticated
   card, refresh/reconnect, save/reopen and offer continuation. No customer data
   should be used for exploratory testing.

Preview database changes, when needed, also require specific approval. Current
protected acceptance uses isolated local PostgreSQL in the Preview build and
public-brand/synthetic briefs; it never writes Supabase/CRM/customer records.
A READY build is not a completed content/cost acceptance result.

## Verification and rollback

- Require ordered brand -> sector -> peers -> SWOT -> 24-area coverage -> final
  review, source-backed findings, all four SWOT directions, six BHS dimensions
  and at least three verified direct peers. Unknown internal figures remain
  unknown rather than becoming business weaknesses or invented measurements.
- Inspect individual caps, provider receipts, retained uncertain commitments,
  total cost and an actual bounded scraper run once its approved cap is known.
- Test reload, lost acknowledgement, concurrent start, cancellation, owner and
  environment isolation. Those queue scenarios pass locally with PostgreSQL SQL.
- Rollback first unschedules only `sellf-bhs-sequential-worker` and disables the
  new BHS activation flags. Restore the reviewed previous Vercel deployment and
  exact previous gateway source/configuration. Preserve the new queue and all
  paid receipts; do not drop data or disable shared extensions as rollback.
