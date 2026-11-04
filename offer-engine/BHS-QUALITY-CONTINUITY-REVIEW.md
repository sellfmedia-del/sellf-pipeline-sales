# BHS quality, cost and continuity

When research fails, sales can now explicitly prepare a review-required offer from the brief and any completed, source-checked synthesis. This handoff performs no additional paid research. It preserves all historical usage/reservations and clearly identifies incomplete research in the internal review and customer proposal. It does not fabricate a completed BHS or publish a proposal automatically.

## Changes

- Quantity matching handles Turkish/English grouping, decimal notation, written counts and magnitudes. Different values, signs, ranges, units of magnitude and numeric substrings remain rejected. Indefinite articles and the English preposition “on” are not interpreted as Turkish measured quantities. Future announced quantities cannot be promoted to completed growth by numeric normalisation.
- Rejecting one finding no longer wipes all valid qualitative strengths in its dimension. Unsupported scores stay null, the dimension becomes partial, and its rationale is derived from retained findings. URL/literal-quote checks and incomplete-data warnings remain.
- Removed the artificial 25 TRY hold from source planning. The logo safeguard remains. The 20–30 TRY normal target is soft; full research may exceed it within the existing atomic 50 TRY ceiling, with a recorded quality exception. Short claims in one coordinator's ledger are serialised while provider work remains parallel. Existing completed work remains reusable even above the target. The database's atomic 50 TRY hard ceiling is unchanged; this change does not install a new global database lock or rewrite old receipts. Explicit recovery still warns that it may exceed the normal target within that ceiling.
- BHS model choices, methodology, source-topic coverage, thinking level and output-token envelope remain. The first full synthesis can use up to the original 240 seconds within the existing 250-second combined primary/fallback deadline. One alternate remains the maximum; content validation errors have a distinct code instead of being labelled a provider outage.
- Failed free coordinators are not blindly re-entered after reload/prompt changes. Their recovery round is recorded. Only an explicit recovery can authorize the next batch; failed paid reservations remain immutable. An abandoned free coordinator older than the platform's execution window can hand off without replaying paid work.
- The zero-cost `continue` action requires the same host, authenticated ledger, signed research ticket, session, exact brief and server-recorded stopped stage. It cannot bypass an active stage, changed brief or signature. The resulting audit bytes are signed into the existing pricing/proposal proofs. A prior explicit continuation is reusable after reopening, without repeated research.
- A failed English translation offers an explicit Turkish-draft action. It changes the user's language choice visibly and reuses the exact audit and pricing; it never labels Turkish prose as English. Successful English generation remains unchanged.
- Saved logos without an optional placement field use the verified candidate's/default background instead of crashing before proposal assembly.
- Preview offers four synthetic scenarios: model outage, normal cost target, zero-cost continuation and English translation outage. They use actual deterministic pricing/proposal engines and cannot save/publish or call real APIs. Production builds remove these review fixtures and all stale provider-acceptance artifacts.

## Evidence and acceptance

Recorded Organised Mums evidence was read from the verified Pipeline project only, without writes or new provider calls. The same raw eight-finding response was replayed against production and the corrected filter:

| Output | Production baseline | Corrected |
| --- | ---: | ---: |
| Retained findings | 2 | 2 |
| Verified source entries | 6 | 6 |
| Available methodology areas | 14 | 16 |
| Retained qualitative strengths | 0 | 4 |
| Nonempty benchmark cells | 4 | 5 |

The conflicting shipping claim remains excluded. A planned year-end product quantity is not restored as already completed growth. Restoring every raw finding would reintroduce unsupported claims. Private brief/meeting data and the raw production packet are not committed to the repository.

Automated checks cover localised quantities, unsupported/fabricated sources, number/sign/range errors, future/completed confusion, partial dimensions, automatic/explicit hard cost limits, concurrent claims, immutable uncertain reservations, reloads, active/stale/exhausted stages, signed handoff through real pricing/proposal handlers, signature/session/brief tampering, both languages, desktop/mobile and double clicks. No database/schema, auth/RLS, provider keys or environment settings are changed.

Local verification passed 346 tests without skips: 54 Pipeline, 287 engine and 5 Offerletter tests, with the packaged Chromium enabled for browser scenarios. Production/preview builds, JavaScript syntax, whitespace and production exclusion of injected stale QA artifacts are checked before release. Vercel and real-provider acceptance results are recorded in the PR. The real-provider runner is separately gated to `qa/bhs-quality-continuity-real`, the Pipeline preview project, an explicit `--run`, and a reviewed date. It uses one public brand, an in-memory 50 TRY hard cap including uncertain reservations, and never touches customer records. A passing handoff is not proof of successful full BHS research or semantic report quality.

## Review and rollback

Branch: `fix/bhs-quality-continuity`, based on production `0d4e81a`. Production build configuration remains unchanged. Preview approval and a separate production approval remain required before merging/deploying. Revert the feature commit(s) and redeploy the prior working version if needed; keep existing customer documents, budget receipts and zero-cost continuation records intact.
