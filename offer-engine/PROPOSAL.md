# Proposal preparation and isolated pre-release testing

The approved customer template retains real Sellf × original transparent customer logo, “Marka özel teklifi”, visual source-backed six-dimension BHS, exactly two monthly service totals, expandable service details without item prices, and Growth / Operations / Manual beginning plans. Gemini owns bounded copy; deterministic pricing, verified evidence, original pixels and operator review remain authoritative. Existing Pipeline layout, root APIs, Travis files and production branch remain unchanged.

## Engines

Logo upload performs actual deterministic background removal; a server receipt binds original output and technical quality. Light logos get a dark logo-only area, with final operator visual approval on the offer. BHS uses the previously verified Gemini Deep Research/source capture/semantic pipeline; offer composition does not restart research. Pricing selects context-appropriate scope then calculates segment costs in integer kuruş. Gemini proposal composition selects only existing findings and writes bounded brand copy; it cannot change the two totals, redraw the logo or add service scope. Signed upstream receipts bind brief, host, session, card, plan and results.

Growth's plan includes full BHS in the first two weeks, strategy/calendar 4–6 weeks after BHS approval, then selected operations. The Operations alternative has no Growth audit/strategy steps. Manual timings/steps pass through unchanged. Initial BHS priorities and the selected service order supply context and focus. Operator review gates saving and publication.

## Current test setup

The worker's `/` route directly renders the original Pipeline app from the repository source. It has no iframe, demo toolbar, device selector or example-logo controls. The original board, card details, contacts, notes, meeting history and offer section retain their existing markup/styles. The preview build substitutes only the data/session adapter and a clearly labelled one-time test-session entry; it does not modify production `index.html`, root APIs or Travis files.

The “Test alanını aç” button creates a separate synthetic account plus its own test card. No human account is impersonated and no signup email is sent. An existing test session resumes on the board. Users can add test cards, update notes/meeting history and follow “Teklif Oluştur” through the real logo/BHS/pricing/proposal endpoints, review, atomic saving/value update, customer publication/password access and native mailto. No mocks are enabled by the deployed app; synthetic model providers exist only inside diagnostic scripts/tests.

Sessions remain encrypted, host-bound, HttpOnly/Secure/SameSite=Strict cookies. JWTs and refresh tokens stay server-side. The frontend receives only its synthetic user/card data. Space/column layout is stored in owner-scoped local preview metadata; test cards, notes, contacts, history, offer versions and value updates persist in the isolated database. No production client is initialized, and the direct preview CSP permits connections only to its own service. The raw diagnostic CRM source is inert if opened directly. Legacy `/offers/preview.html` remains a diagnostic wrapper; user testing should start at `/`.

The `pipeline-offer-preview-store` Supabase function accepts only its separate private worker credential and validates synthetic account `app_metadata` before owner operations. Fixed `sync_cards` and `delete_cards` operations validate fields and touch only `pipeline_offer_preview_leads`. Upserts use caller JWT/RLS; deletion pins the owner filter after authenticated synthetic-user verification. Existing real tables/policies are untouched. The function exposes no arbitrary SQL/path access. Test cards can be created/deleted through the original app; offer history is retained. New empty workspaces/layouts are browser-local until they contain a saved test card.

The four isolated tables remain `pipeline_offer_preview_leads`, `pipeline_offer_preview_versions`, `pipeline_offer_preview_requests` and `pipeline_offer_preview_gateway_config`. No schema change was needed for the direct app entry. Existing migrations are unchanged. The SECURITY INVOKER save RPC still locks only the associated test card, deduplicates requests, inserts a version and updates that card's value atomically. Owner link/password recovery remains encrypted. Publishing creates only a Vercel-protected test customer URL. The separate production schema remains unapplied.

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

The complete worker suite passes 93 tests. Existing Pipeline/Travis tests passed 54 checks; their files remain unchanged. Real isolated Auth/database browser validation now starts directly at `/`, creates a new test card, saves its meeting context, transfers it into the brief, composes/reviews/saves an offer, verifies card-value synchronization, publishes and opens the password-protected customer version, prepares the selected alternative's native mailto and reopens the saved record/private link after a mobile reload. Final evidence is `validation/pipeline-preview-browser-validation.json`. Model outputs are synthetic in this diagnostic; it never sends real mail or starts new paid research. Earlier real Gemini composition and evidence checks remain recorded separately.

The direct adapter and gateway operations have explicit synthetic-owner/RLS/field validation coverage. Existing production row fingerprints are checked before and after setup. The preview gateway is now version 4. Both storage adapters handle empty successful HTTP 201 responses.

Deployment status is confirmed separately against the exact commit. An earlier API deployment request hit a daily limit, but a subsequent ordinary Git deployment of the mailto commit completed successfully; do not treat that earlier error as proof that all later deployments are blocked. The final direct-app revision must reach READY and pass URL/browser checks before giving its link to the user. No production deployment, billing change or quota workaround is authorized.
