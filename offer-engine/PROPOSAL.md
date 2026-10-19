# Proposal composition and release boundary

The customer renderer implements the approved two-option white/blue design: real Sellf artwork × original transparent customer logo; “Marka özel teklifi”; visual six-dimension BHS, real priority counts, expandable source report; exactly two total monthly fees; included service details without item prices; selectable scope, beginning plan and contract form. No new root CRM layout or Travis code changes.

## Engine ownership

- Logo: existing deterministic screenshot background removal and unchanged artwork. A server HMAC binds the processed PNG and its quality evidence. Light/white logos receive a dark logo-only area. Operator visual approval happens on the composed proposal.
- BHS: existing Gemini Deep Research, source capture, grounding and semantic validation. No new research is started when composing an offer.
- Pricing: bounded Gemini scope selection, deterministic segment costs and integer-kuruş calculation. Exactly Growth + Operations and Operations bundle; no hidden third option. Signed result binds the exact audit, brief, session and host.
- Proposal: the existing verified Gemini Interactions adapter writes bounded Turkish headline/subtitle and chooses only existing finding IDs. No tools/web research, raw CRM object, images, costs or price-setting authority. Server-owned projection retains the exact logo, both monthly amounts, actual findings/null scores, exclusions and selected services. Invalid output fails visibly; it never becomes a ready fabricated document. A signed completion binds the original card/space, plan, logo and upstream snapshots.

Growth/Operations/Manual are beginning-plan modes, separate from fee alternatives. Growth's first alternative includes the full BHS in the first two weeks, strategy/calendar 4–6 weeks after BHS approval, then selected operations. The Operations alternative contains no Growth audit/strategy steps. Explicit Operations mode uses operations steps. Manual steps and timing pass through unchanged to both options. Actual selected services supply the focus; BHS priorities appear in their own verified map. Operator review is required before saving/publication.

## Storage and customer portal: implemented, not enabled

`../supabase/migrations/20261019211351_isolated_offer_versions.sql` is a **review copy**, not applied to the connected database. It adds only private offer-version and contract-request tables, owner RLS/indexes and an authenticated SECURITY INVOKER save RPC. The RPC verifies space ownership/lead membership, locks that lead, deduplicates request IDs, creates a version and updates only that lead's `value` in the same transaction. Failure rolls both writes back. Existing columns/notes/timeline/Travis tables/policies are untouched. No migration or customer-data write has been run.

`/api/offer` verifies Pipeline JWT via Supabase, exact proposal/pricing receipts, original lead/space and both explicit reviews before the RPC. The frontend updates its in-memory card value only after a successful response; it never calls CRM `save()`. A synthetic preview refuses all storage writes. An enabled same-origin integration is required for the real Pipeline release; the isolated worker preview is not yet wired as the production Pipeline backend.

Release prerequisites, scoped only to the offer worker:

1. Review/test/apply the additive SQL to the intended Pipeline database.
2. Set `OFFER_SUPABASE_URL`, `OFFER_SUPABASE_ANON_KEY` (public key) and `OFFER_PERSISTENCE_ENABLED=true` for the approved environment. Admin version saves use the current user's JWT, never service-role auth.
3. Server-only `OFFER_PORTAL_SECRET` (at least 32 random characters) and `OFFER_SUPABASE_SERVICE_ROLE_KEY` are required for the password-protected customer portal and durable notification queue. It is never embedded into the client. No existing secret has been read or repurposed. Tables have no anonymous grants.
4. Set server-only `OFFER_RESEND_API_KEY` and `OFFER_MAIL_FROM` with a verified sender. No email was sent during tests. Publication fails closed if storage, portal or mail is unconfigured.
5. Complete the authorized same-origin production route and live release separately. Vercel Authentication stays enabled on previews. Current APIs remain preview-only; a public customer URL is not yet live.

Publishing creates a random 256-bit capability token plus a random 96-bit password. Stored values are a token SHA-256 and a token-bound, server-HMAC password hash. Customer credentials stay in memory; the fragment is cleared immediately, with no third-party assets/referrer leakage. Customer passwords use the dedicated `OFFER_PORTAL_SECRET`, independent of Gemini credentials. Rotating that portal secret requires reissuing customer links/passwords.

Contract requests are priced from the persisted published version, never customer inputs. Both fixed server-owned recipients are `yigit@sellfmedia.com` and `businessdevelopment@sellfmedia.com`. The immutable queue records brand, version, chosen option, true monthly total and requester. A conditional pending→sending claim and stable Resend idempotency key prevent repeated sends. Provider acceptance is recorded; it is not proof of inbox delivery. Unknown network outcomes stay uncertain for operator reconciliation instead of being automatically sent again. The customer UI does not claim success on an uncertain result. An outbox dashboard/reconciliation operation is a remaining live-operations task.

## Validation limits

Unit tests cover immutable projection, manual plans, missing data, mismatched brief/logo/price/context/session, exact signed save, required operator reviews, fixed recipients, price tampering and duplicate/failed notification paths. Browser tests run real screenshot processing, signed pricing/proposal handlers, deterministic fees and customer renderer on desktop/mobile with mocked BHS/Gemini output. They check real logo pixels load, two alternatives, no item prices, Operations plan, review gates, no overflow and unchanged synthetic CRM rows.

These tests do not establish that the pending SQL has executed on PostgreSQL, that a real offer was saved/published in Pipeline, or that mail reached the two inboxes. Do not describe the full live process as finished until those release checks pass.
