# BHS supervised research — isolated implementation review

Branch: `feat/bhs-supervised-research`, based on `fix/bhs-quality-only` at `51ffeb2`.
Production/main are not changed. This branch deliberately retains v6 by default.
The v7 opt-in is restricted to Preview (`OFFER_BHS_RESEARCH_VERSION=v7`).

## Implemented in this branch

- Claude Sonnet 5.5 plans, reviews Gemini candidates against the original sources,
  chooses at most two correction searches and two conditional Actor requests,
  and writes the final strategic analysis. No open-ended agent loop.
- Gemini 3.1 Flash-Lite extracts candidates in two bounded batches. It does not
  choose scores, prices, services or final strategic conclusions.
- Eight individually checkpointed stages: plan, evidence, workers, review,
  correction, synthesis, existing scope, complete. Model receipts are cached
  independently, including when a later call fails.
- The existing atomic 50 TRY ledger includes both new providers and retains all
  ambiguous reservations. Inputs are counted before generation; actual verified
  usage is settled. At least 6 TRY is kept for subsequent offer operations.
  Current price validity ends November 15, 2026; no paid work after expiry.
- Existing six dimensions, 24 areas, paragraph provenance and qualified commercial
  hypotheses are preserved. Worker citations are rebound by URL and exact text
  after correction; an old numerical proof ID cannot accidentally cite a new page.
- Saved Task caps remain individual. Unknown limits, unsupported pricing or extra
  platform fees block Actor execution; `.40` is never an assumed account default.
  Bounded input compilation exists for Instagram profiles and five-page SEO only.
- A Preview-only read-only `/api/bhs-readiness` checks selected model catalogues
  and saved Apify Task policy availability. It never generates or starts Actors.

## Not ready to activate

This is an implementation preview, **not a completed BHS quality acceptance**.

1. The new `schema/bhs-supervised-preview-jobs.sql` is prepared and locally tested,
   **not applied**. It creates one private Preview queue, two private functions
   and one index. It does not modify existing tables, policies, functions or data.
   Its only dependency is the existing Preview budget/checkpoint tables.
2. `background-runner.mjs` executes one leased stage and reuses committed work
   after a lost acknowledgement. Its gateway, enqueue/status/pause wiring and
   authenticated scheduler still need implementation and deployment after queue
   approval. There is currently **no live autonomous background continuation**.
3. Actor execution and dataset provenance adapters are not connected. Remaining
   recommended Actor input adapters still require completion and bounded live QA.
   Account-specific Task caps must be readable first; favourites and console
   input forms do not establish a verified runtime policy.
4. Pipeline Preview currently has model/Tavily/Apify variables but general Preview
   storage credentials are missing. Existing storage variables are limited to an
   older branch. No Production credentials were copied into Preview.
5. Public-brand live acceptance must measure source quality, 3–5 verified peers
   when available, six dimensions/24 areas, partial-result continuity, browser
   independence, actual usage and all-in cost before user Preview approval.
   Typical 20–30 TRY is a target, not a measured result of this new implementation.

## Queue approval scope and rollback

Application: Sellf Pipeline. Account: Pipeline ve Bağımsız.
Organization: `pvpknoqioxgyerinoecv` (Sellf Toolları ve Aunce).
Supabase project: `gxngmqewskhrbxqmnpps`, verified against repo configuration
and live read-only project/schema metadata.

Approval requested only for the new **Preview** queue SQL linked above and its
private BHS worker integration. No production migration, merge, deployment,
pricing, logo, offer layout or sales workflow change is included.

Before applying, capture the existing schema and verify no object with these new
names exists. There are no pre-existing rows to backfill. The SQL contains the
rollback statements: stop the worker, export any new queue rows, remove the two
functions and queue table. Existing paid receipts and offers remain untouched.

## First-party references reviewed 2026-11-09

- [Claude Sonnet 5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/overview)
- [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Apify run options](https://docs.apify.com/api/v2/actors-runs-post)
- [Apify Task options](https://docs.apify.com/api/v2/actor-task-get)
- [Apify pricing records](https://docs.apify.com/api/v2/actor-get)

The MCP/JS documentation describes a narrower charge cap than newer REST pages.
This implementation fails closed for unverified pricing rather than assuming
the console limit or the broader REST semantics apply to every Actor.
