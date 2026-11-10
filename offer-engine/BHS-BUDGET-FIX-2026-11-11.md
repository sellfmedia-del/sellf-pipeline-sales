# BHS shared-budget correction — 2026-11-11

Approved scope: resolve the early budget block without increasing 5,000 kurus or discarding incurred/uncertain provider charges. Base production: 07378cf5ae59e32b2f641c5478d77bc1038f555c; rollback deployment: dpl_7vTXNFNfoY5oq7yYFpXYj1yoQymf.

## Failure reproduced

The Eyup Sabri Tuncer live run paused in competition_review at 3,837 kurus. Completed step accounting was 2,937 kurus, the general reserve 500, and the interrupted invocation retained 400. An additional default 600-kurus following-stage allocation made an otherwise affordable review fail admission. Modern sector research also bought a third verdict after its reviewed correction remained limited.

## Correction

- Sequential v8 model calls default to the one shared account, without the hidden 600-kurus allocation. Explicit caller reserves and v7 behavior are retained.
- Quotes include the same wrapper/conversion allowance used by the atomic ledger. If needed, only additional thinking headroom is reduced to the largest affordable maximum; the complete caller-visible output allowance is preserved. If that entire visible contract cannot fit, no paid call starts.
- A smaller funded maximum is saved before generation under the desired request's stable identity. Reconnects, settlement and jsonb reordering cannot buy another answer at a different maximum. Ambiguous model calls keep their full commitments.
- Caught worker failures settle measured compute before returning the error. Truly missing/invalid measurements retain the ceiling. Old uncertain receipts are not rewritten or refunded.
- Sector review explicitly distinguishes supported general industry behavior from measured brand behavior. Modern reviewed records retain the review verdict, including a limited verdict; only legacy records without observation/inference classification may require the historical amendment.
- One explicitly authorized, phase-bound recovery can retry a zero-cost coordinator that stopped with budget_limit. It reuses nested paid receipts, retains the earlier unknown compute charge, and meters the new attempt separately in the original account. It does not automatically requeue any live job.

## Release and recovery

Preview approval is required before merging/releasing. No new paid report or production row mutation is part of verification. Current live test data and charges remain untouched.

The prepared recovery script is restricted to the diagnosed job, budget, run and phase. It must be separately approved after release. It retains all 3,837 kurus and leaves the total cap at 5,000. The existing queue age/claim safeguards are checked rather than silently rewritten. If the job has aged out, stop and review a separate recovery instruction; never reset spending or change the brief to hide prior costs.

Rollback the code to the base deployment. If recovery has been authorized, stop it through the existing cancellation mechanism before rollback; preserve all subsequent receipts. Pricing, logos, offers, UX, credentials, schemas, RLS and other applications are outside this change.
