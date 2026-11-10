# BHS v8 peer evidence admission

## Observed failure

The Eyüp Sabri Tuncer job reused its preserved brand/sector packet during
competition research. Fourteen long sources already filled the collector's
180,000-character source allowance. Successful competitor reads were silently
discarded. The following paid model review therefore had no original competitor
pages and correctly refused to confirm three direct peers.

The existing run remains paused at 45.28 TRY against its original 50 TRY account.
This release does not restart that job, reset charges, refund uncertain receipts,
raise its limit, or claim that its report is complete.

## Change

- Only sequential v8 collection gets 360,000 source characters and an explicit
  transport marker. Existing collectors keep their 180,000-character allowance.
  The packet validator accepts the marked wider transport up to 420,000
  characters, still under a 1 MB UTF-8 transport limit. The 24-source and original
  excerpt size checks remain in place. Existing source text is preserved.
- Source capacity rejection is recorded as `source_packet_capacity` rather than
  silently dropping a page. Replacing a captured page subtracts its old size.
- After direct competitor collection, missing candidate domains receive at most
  one bounded Tavily advanced extraction request, with up to five exact candidate
  URLs. Normal durable provider receipts and the existing 50 TRY account apply.
  Already captured peers do not cause another extraction purchase.
- Initial and correction competitor drafts require captured original content
  for at least three candidate domains before buying Gemini output. This is a
  source admission check; Claude still decides whether each candidate actually
  overlaps in product, audience and geography. No direct-peer claim is fabricated.

No proposal pricing, logo logic, interface layout, database schema, credentials,
Actor policy, tariff, budget cap, stage acceptance criteria, or finding-count
limits change. Actor runs remain limited to their existing policy, at most
0.20 USD each; tool purchases share the same overall account.

## Verification

Regression coverage includes a full 14-source seed that previously saturated
the packet, preservation of every existing source, capture of all three peer
domains, one bounded extraction for missing pages, no repeat when complete,
and no model purchase when competitor evidence is still missing. The complete
six-stage synthetic flow uses actual local PostgreSQL receipts and simulated
provider responses; it is not a new paid brand audit.

The prior production commit is `2d9470a898dc3f63d25278fbf3882bc1d24cf186`.
Rollback is a revert of this isolated change followed by the normal Vercel
deployment. No database rollback or customer data restoration is required.

## Remaining acceptance

Build and automated tests verify code paths and budget guards, not the quality
or final cost of a completed real-world audit. The paused old run has not
completed the remaining SWOT, BHS coverage and synthesis stages. No new paid
run is launched by this release. A real completed report within 50 TRY remains
an explicit live acceptance condition; it must not be reported as already proven.
