# Offer preparation boundary

This directory contains the isolated Pipeline card extension, preparation flow and approved customer template. Audit, pricing, logo and proposal remain separate engines. The protected preview composes customer offers. Persistent pre-release testing is isolated in dedicated preview tables; production storage/publication stays disabled. Real BHS/model calls are supported only in the separate protected service when its own research credentials are configured. Screenshot background removal is provided only in the separate protected `offer-engine` preview.

- `card-section.*`: card summary, entry button and authorized latest-version read. All styles are scoped to the new section.
- `brief-model.js`: immutable source snapshots, input validation and URL normalization.
- `brief-form.*`: isolated dialog, editable brief, source context and review state. Form input never mutates the CRM lead or calls the bulk `save()` function.
- `logo-control.*`: screenshot upload, mandatory background removal, original/transparent comparison, deferred final visual review and logo-only placement background. Visual approval is reserved for the eventual proposal draft. Users can upload ordinary PNG/JPEG/WebP screenshots without preparing a transparent PNG first. Website blur no longer triggers automatic site capture.
- `preview.*`: original full-screen Pipeline board using an isolated test fixture; the offer brief and research flow are interactive. Its sandbox blocks direct network access and storage. In the worker preview a checked parent-message bridge sends only the uploaded image to the same-origin logo API; a separate bridge sends the selected brief fields to the BHS API. PNGs remain in memory. No production Supabase client is initialized.

## Accepted pricing and value rules

The isolated worker now calculates the two alternatives; see `../offer-engine/PRICING.md`. Numeric budget is optional. Meeting context directs the selected scope; BHS investment suggestions are not fee or budget inputs. Qualitative budget concerns never prevent a price result. The customer template, Gemini composition and isolated persistent test setup are implemented; current preview deployment status and release prerequisites are listed in `../offer-engine/PROPOSAL.md`.

The two customer alternatives each show the total monthly invoice amount. The first-two-month Growth staffing distinction is internal costing context, not a separate customer invoice period.

When an actual offer is created or its price is revised, synchronize the associated lead's estimated value with the recommended main alternative's total monthly amount. The brief alone must never change estimated value. Implement synchronization as a targeted authorized write to that lead, not through the current bulk CRM save function. Persist offer version and value synchronization reliably; do not overwrite unrelated fields or cards.

Use only the chosen KOBİ, Kurumsal or Key Account pricing columns. Growth + operations and operations bundle are alternatives for the same segment. Special-project pricing requires scope-specific reasoning. Preserve the original cost-sheet rules and take a pricing snapshot with each offer version.

## Release boundary

All changes stay on a feature branch and Vercel Preview until user approval. Do not change existing Travis files/migrations, production CRM/auth code, production environment variables or customer data. The authorized test setup uses only new isolated tables, synthetic accounts and Preview-scoped variables. The user authorized isolated test setup; its migrations affect only new preview tables. The production migration and live deployment still need explicit release approval.

## Contract request

The customer form opens a native mailto draft to the two approved Sellf addresses with the selected persisted alternative/total, version and customer link, without its password. The user sends it from their email application. No email provider setup or automatic delivery is required.

## Preview entry

The worker's `/` route opens the original Pipeline app directly, with no iframe, demo toolbar, logo examples or device selector. “Test alanını aç” creates an isolated test session once. Users can add/open test cards, save notes/meetings, then follow “Teklif Oluştur” to the published customer version and native mailto. The separate `pipeline-preview.js` adapter sends card changes only to the isolated test service, never to production tables. It stores layout metadata in an owner-specific local key, without credentials. The original app's markup/styles stay unchanged. `preview.*` remains a legacy diagnostic wrapper, not the primary user-test link.
