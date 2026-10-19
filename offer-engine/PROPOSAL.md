# Proposal preparation and isolated pre-release testing

The approved customer template retains real Sellf × original transparent customer logo, “Marka özel teklifi”, visual source-backed six-dimension BHS, exactly two monthly service totals, expandable service details without item prices, and Growth / Operations / Manual beginning plans. Gemini owns bounded copy; deterministic pricing, verified evidence, original pixels and operator review remain authoritative. Existing Pipeline layout, root APIs, Travis files and production branch remain unchanged.

## Engines

Logo upload performs actual deterministic background removal; a server receipt binds original output and technical quality. Light logos get a dark logo-only area, with final operator visual approval on the offer. BHS uses the previously verified Gemini Deep Research/source capture/semantic pipeline; offer composition does not restart research. Pricing selects context-appropriate scope then calculates segment costs in integer kuruş. Gemini proposal composition selects only existing findings and writes bounded brand copy; it cannot change the two totals, redraw the logo or add service scope. Signed upstream receipts bind brief, host, session, card, plan and results.

Growth's plan includes full BHS in the first two weeks, strategy/calendar 4–6 weeks after BHS approval, then selected operations. The Operations alternative has no Growth audit/strategy steps. Manual timings/steps pass through unchanged. Initial BHS priorities and the selected service order supply context and focus. Operator review gates saving and publication.

## Current test setup

`/offers/preview.html?storage=1` opens a persistent, isolated test area. An explicit “Test alanını aç” action creates a synthetic preview-only Auth account plus a separate test card. No human account is impersonated and no signup email is sent. Subsequent requests use an encrypted, host-bound, HttpOnly/Secure/SameSite=Strict session cookie. JWTs/refresh tokens never enter iframe messages, browser storage or output artifacts.

The separate Supabase function `pipeline-offer-preview-store` accepts only a new private worker credential. Its stored verification hash is inaccessible to anonymous/authenticated clients. The function uses platform-provided credentials internally; no existing Supabase service-role key has been read, copied or embedded into Vercel. It exposes a fixed operation list and only accesses these new tables:

- `pipeline_offer_preview_leads`: synthetic cards, with owner RLS.
- `pipeline_offer_preview_versions`: versioned customer documents and pricing snapshots, with owner RLS.
- `pipeline_offer_preview_requests`: durable contract-request queue, with operator read access scoped by ownership.
- `pipeline_offer_preview_gateway_config`: service-only configuration hash, with RLS and no client grants.

Applied migrations are `20261019213806_isolated_offer_preview_storage.sql` and `20261019214503_preview_owner_link_recovery.sql`. The SECURITY INVOKER save RPC checks authenticated ownership, locks only the synthetic card, deduplicates requests, inserts a version and updates that test card's value atomically. A failed transaction preserves both. It never updates public.leads/public.spaces or any Travis table. Existing real tables and policies are untouched. The previously prepared production schema remains an unapplied review copy at `schema/production-offer-storage.sql`.

The preview wrapper preserves the existing CRM interface using only returned synthetic rows and a checked parent bridge. General CRM writes stay blocked. Offer save/publish/list actions pass through the authenticated test service. Operator link/password recovery uses an encrypted owner-only envelope; customer queries cannot retrieve it. Saved offers can be reopened after refresh. Publishing here creates only a Vercel-protected test customer URL, not a production release.

## Environment and mail

Only the dedicated offer worker's Preview environment has been configured with:

- `OFFER_PREVIEW_MODE=true`, `OFFER_PERSISTENCE_ENABLED=true`.
- `OFFER_STORAGE_GATEWAY_URL` and new sensitive `OFFER_STORAGE_GATEWAY_KEY`.
- A new sensitive `OFFER_PORTAL_SECRET`, independent of Gemini.
- The existing `OFFER_GEMINI_API_KEY`, which has not been read or changed.

Contract requests use native `mailto:` and need no provider, API key or sender configuration. Publishing requires storage and portal security only. “Sözleşme talep et” opens a short name/email form; “E-postayı aç” synchronously opens the user's email application with both fixed recipients, the selected saved monthly total, version and customer offer link. The password is never included. The user completes sending in their email application; the UI never reports automatic delivery. A visible mailto link allows reopening the draft.

Recipients are fixed in the frontend helper as `yigit@sellfmedia.com` and `businessdevelopment@sellfmedia.com`. Subject/body are URI encoded. The former server-send action is disabled; no request is queued or sent by the application. Existing historical preview request rows and tables remain untouched.

## Validation boundaries

Local browser/unit tests cover transparent logo handling, signed results, exact amounts, manual plans, no item prices, owner checks, session encryption, invalid keys, price tampering, password portal, both mailto recipients, URL encoding, selected saved totals, no password leakage and disabled backend sending. Test wrapper layout is checked on desktop/mobile, including visible footer actions.

The opt-in `scripts/storage-validation.mjs` exercises real Supabase Auth and the isolated database through the same handlers: first save/value update, duplicate save, revision, transaction rollback, customer password access, provider-independent publication, mailto draft preparation, and cross-owner denial. It uses explicitly synthetic data; it never calls Gemini, sends mail or writes notification requests. Ordinary builds never run this script. Restore any diagnostic branch to `npm run build` afterward.

A separate real Gemini composition was verified on 2026-10-19 using one synthetic generation and replaying the completed response. Growth/Operations/Manual projections preserved both 150,000 / 66,000 TRY totals, logo pixels and null BHS scores. Full Deep Research was not rerun.

## Production release remains separate

This work does not merge main, change production environments, enable a public customer deployment, or connect offer writes to real Pipeline cards. Before production release, review/apply the separate production schema, wire the approved same-origin backend, configure production-specific storage/portal secrets and run authorized real-card/value plus native email-client tests. The current user instruction is pre-release testing only.

## Completed pre-release checks

Real isolated Auth/database validation passed first save + value sync, duplicate handling, revision + value sync, failed-transaction rollback, password-protected persisted access and cross-owner read/write denial. Browser integration covers the preparation UI through real version saving, customer password access and mobile refresh/reopening with encrypted owner-link recovery. The final mailto revision is validated without a mail provider: fixed recipients, correct selected saved total/version/link, no password in draft, and no backend send. Evidence is under `validation/`. The complete worker suite passes 91 tests; the existing Pipeline/Travis suite passes 54 tests. The final real Auth/database and browser validations pass with `mailTransport: "mailto"`; their evidence filenames end in `-mailto.json`. Earlier fake-mail reports remain historical evidence. Tests use synthetic model output, never real emails or new Gemini research.

Before/after fingerprints of the existing Pipeline lead and space rows matched exactly. No production rows or existing policies were changed. Supabase security advisors reported no findings for the new preview tables after explicit service-only configuration policy setup.

The first real insert test exposed successful PostgREST inserts returning an empty HTTP 201 body. Both storage adapters now handle empty successful responses, with a regression test. The deployed preview gateway is version 3.

The existing persistent preview is https://sellf-offer-engine-p077tufbt-yigit-konuks-projects.vercel.app/offers/preview.html?storage=1. It uses real isolated test records, but its deployed worker predates the mailto correction and still contains the old publication gate. Do not describe that preview as containing the final mailto change until redeployed.

Vercel rejected further deployments with HTTP 402 `api-deployments-free-per-day` (more than 100), retry after 24 hours. The mailto revision is complete in source and locally tested; updating the protected preview is blocked by that deployment quota. No billing changes or quota workarounds were attempted. Production release remains outside the current authorization.
