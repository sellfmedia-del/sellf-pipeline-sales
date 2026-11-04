# Same-card research recovery — prepared, not deployed

Target: Sellf Pipeline only, Supabase project `gxngmqewskhrbxqmnpps`, organisation `pvpknoqioxgyerinoecv`. Production remains `3df62b6` until approval. No production database, environment, auth or RLS changes were performed during diagnosis.

## Verified incident

The 21:36 Istanbul screenshots show a saved, zero-cost incomplete handoff, not a newly generated report. Production's 18:35:48 UTC audit log returns `action=start`, `continuity=unavailable`, total 4,621 kurus and attempt zero. The current owner's source discovery/evidence completed, but synthesis stopped at the budget limit. The saved empty handoff was created at 18:12 UTC and is returned on reopening.

There are two owner-scoped budgets for the same Organised Mums lead. The second contains completed research with its original evidence and model output. The current RPC reads only the authenticated owner's budget, so the shared sales team cannot reuse the other completed research. No saved offer exists to bridge through the existing offer-reuse flow.

Current 46.21 TRY envelope: 12.16 completed usage records, 26.69 uncertain reservations, 2.36 abandoned/in-flight reservations and 5.00 infrastructure allowance. These are usage/reservation accounting amounts, not an invoice. Nothing is refunded, deleted, moved or reset by this change.

## Prepared change

- `schema/shared-research-read.sql` replaces only the existing budget RPC definition. The new `get` fallback reads a completed, zero-cost `research:saved` snapshot from this exact authorised card when the owner has none. Matching completed original model data can be supplied as a read projection for current source checks. Paid steps, incomplete steps, reservations, all writes and other cards remain owner-scoped. Service-role and registered-team checks remain unchanged. No tables, policies, grants or existing rows change.
- The application checks brand/domain, age, original brief and evidence. It re-applies current URL, literal quote, numeric and inference checks to the saved response. Previously rejected claims are not automatically restored.
- A saved empty handoff can now recover those completed findings on reopening or explicit continuation. It uses current-brief scope, exposes research date/context uncertainty, and signs the normal pricing/proposal flow. No new search, extraction or model call is made. If compatible evidence is unavailable, the original incomplete handoff remains.
- Existing records and their 50 TRY cap remain unchanged. A synthetic desktop/mobile preview shows recovery at 46.21 TRY; it cannot call real APIs, save or publish.

## Evidence and tests

Read-only replay of the stored Organised Mums response through the prepared application restores 6 verified sources, 2 retained findings and 16 methodology areas with evidence; changed context remains explicitly review-required. This is recovery of existing partial research, not a claim of a new complete BHS.

Local PostgreSQL tests reproduce owner-only lookup, install the proposed definition without changing any data rows, verify shared same-card reads, reject wrong-brief model data, other cards, paid/incomplete steps and invalid actors, preserve owner priority and all charges, and verify rollback. Handler tests restore an old empty handoff at unchanged 4,621 kurus, preserve all cached rows and still pass signed pricing. Browser tests cover desktop/mobile recovery and continuation to a review-required proposal without extra research requests. Full test/build results are recorded in the PR.

## Approval and rollback

Live application of the SQL is a database function migration and needs the user's separate explicit approval under their AGENTS.md. No production migration or deployment is authorised by this document itself.

Rollback SQL is `schema/shared-research-read-rollback.sql`, copied from the verified live definition before the change. Revert the application commit and restore that definition; keep every offer, budget, paid receipt, reservation and research snapshot intact. Check the live function definition still matches the prepared baseline immediately before applying either direction.
