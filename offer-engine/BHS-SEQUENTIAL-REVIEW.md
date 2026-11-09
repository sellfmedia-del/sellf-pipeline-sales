# Sequential BHS v8 — implementation and acceptance record

Scope: BHS only. Branch `feat/bhs-supervised-research`; production remains unchanged.
The production opt-in remains disabled. No Supabase schema or data has been changed.

## Six required logical stages

1. Brand identity, products, revenue model, target market, public scale/ownership,
   and separately labelled brief goals.
2. Industry economics, sales conditions, revenue drivers, customer behaviour,
   and market risks, without presenting sector context as the brand's results.
3. Comparable direct competitors. Candidate URLs must be discovered; direct peers
   require their own read product sources. Unverified scale equality is not claimed.
4. Gemini SWOT draft; Claude verifies strengths, weaknesses, opportunities and
   threats, complaints, history, and business bottlenecks against original sources.
5. Mapping to six BHS dimensions and 24 areas, with targeted missing-data searches
   and up to two optional, bounded Actors. Search discovery is not itself proof.
6. Claude final source, entity, period, numerical and commercial-claim checks,
   followed by server provenance checks and an independent release threshold.

Every source/worker/review substep has a durable receipt. Claude issues the initial
operator task and subsequent tasks. A limited understanding can request one
targeted correction across the entire audit; it cannot cause an unbounded loop.
If that correction remains insufficient, later paid stages stop. Such research
is not labelled a completed high-quality report.

## Cost contract

- The existing atomic PostgreSQL ledger enforces 5,000 kurus for the whole run.
  Model/search retries, capped Actor starts, dataset reads and infrastructure
  commitments all use that same account.
- Models are token-counted before generation. Verified usage settlement retains
  a 20% tax allowance and 3% conversion allowance. Integer rounding is covered.
  Ambiguous calls retain their full reservations; paid work is never reset.
- Stage ceilings protect later research and final synthesis; at least 600 kurus
  remains after synthesis for existing offer operations. The ordinary target is
  20–30 TRY, subject to actual acceptance measurements.
- Actor limits use the smaller saved Task cap, requested run cap, and available
  account balance. Unknown caps, pricing types or excluded platform charges fail
  closed. A favourite or a console form is not treated as a runtime limit.
- Thirteen recommended Actors have finite schema-specific inputs. Downloads,
  paid AI extras, unnecessary enrichment and broad/unlimited crawling are off.
  Output identity, source, locale, count and byte limits are checked. Structured
  samples are labelled as such and do not become measured performance or share.

## Acceptance evidence

Local tests use the actual PostgreSQL budget SQL through PGlite, not production
data. They cover six-stage order, a manager correction, source hallucination,
process restart, immutable receipts, phase ceilings, aggregate cost, individual
Actor caps, unknown fees, Actor timeouts, mismatched identities and bounded inputs.

A single-commit public Humm Organic acceptance command is prepared for Pipeline
Preview. It uses the real configured providers and a local PostgreSQL ledger;
it never accesses Supabase, CRM or customer data. The build has an additional
infrastructure commitment and a six-minute pre-stage deadline. Each completed
stage emits a cost summary and writes a compressed checkpoint. A later controlled
continuation restores every receipt and spent/uncertain amount; it cannot start
the same case at zero cost. Ordinary builds neither run this command nor retain
its output files. Live quality/cost results will be recorded after execution.

Current live blockers remain explicit: saved account-specific Actor limits must
be readable; the private background gateway/scheduler needs production-approved
deployment. The existing v7 Preview queue proposal has not been applied and is
not used as a claim of live v8 background operation.
