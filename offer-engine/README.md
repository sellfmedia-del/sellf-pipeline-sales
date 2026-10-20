# Isolated offer service

The current preview defaults to bounded Tavily discovery + Gemini Pro analysis,
with a persistent per-card spending ledger. Deep Research Max is not used by the
deployed handler. See [BUDGET.md](BUDGET.md) for setup, cost assumptions, test
evidence and the still-pending real quality comparison. Historical Deep Research
details below describe the retained legacy adapter only.

This package deploys independently with Vercel root directory `offer-engine`. It has its own pinned lockfile and dependencies. It does not modify the Pipeline installation, Travis functions, existing environment variables or database.

The build renders a direct copy of the existing Pipeline app at `/`, with an isolated session/data adapter and the approved offer section. There is no iframe or demo toolbar in this primary entry. Build with `sourceFilesOutsideRootDirectory: true`; only this package's `api` directory is deployed as backend functions in the worker project. No live card records are included in the preview.

## Current primary flow: screenshot upload

The brief now accepts a cropped PNG/JPEG/WebP screenshot (up to 2 MB and 4 megapixels). `/api/logo-upload` calls the separate `logo-engine` through the workflow. It removes a uniform edge-connected backdrop, retains solid colors and enclosed artwork, trims empty space and returns a transparent PNG. Original and processed images appear side by side. Visual approval happens on the eventual proposal draft, not before research. A raw file or URL alone cannot pass brief validation.

Background removal is mandatory: complex backgrounds, changed solid pixels, clipping, unreadably small artwork and invalid images return an error with no opaque fallback. This version uses deterministic pixel processing; complex photos/textures are rejected rather than passed to an unconfigured AI service. It does not promise correct semantic separation of every possible brand mark. White and light artwork uses a dark background only behind the logo in the placement sample; mixed light/dark artwork can use neutral gray. Original pixels remain unchanged, and the PNG stays transparent. The user may change the placement background; the result remains pending visual approval.

Uploads and results are processed in memory only. No image is sent to a model, written to storage or attached to a live customer record in this preview. Full brief notes are not sent for logo processing.

## Four engine boundaries

`src/engines/logo-engine.mjs`, `audit-engine.mjs`, `pricing-engine.mjs` and `proposal-engine.mjs` are separate modules. `contracts.mjs` validates stage outputs; `contracts.d.ts` describes the versioned data structures for future TypeScript consumers. `offer-workflow.mjs` holds immutable per-draft results and reuses an unchanged stage after another stage fails. Audit and pricing must pass their upstream gates. A technically valid transparent logo in review may enter a proposal draft; the coordinator forces that proposal to remain in review until final visual approval. Pricing output must contain two monthly totals and a cost-table version.

Logo processing is implemented. The BHS adapter supports real Gemini Deep Research through background Interactions API jobs, primary-page/PDF collection, grounded structured synthesis, separate semantic review and signed job tickets. See `BHS.md`. The pricing engine now selects scope from brief/BHS context and calculates two monthly alternatives from the versioned original workbook costs; budget is optional and BHS investment estimates cannot set prices. See `PRICING.md`. Gemini customer proposal composition is implemented with bounded copy and deterministic logo, scope and price projection. Unavailable BHS evidence and failed checks stop downstream use. The optional persistent preview uses only synthetic accounts and separate test cards. Version saving and estimated-value updates are atomic within those test tables. Customer links remain Vercel-protected. Production storage and release remain disabled. See `PROPOSAL.md` for the current setup and deployment status.

## Earlier website capture (not used by the current brief)

The worker renders the public website in a new credential-free Chromium context. Header/home-link/logo elements are ranked and cropped at 3x device scale. It captures both the original site region and a transparent render of the actual logo element; artwork fills and colors are retained. Opaque, uniform image backdrops use edge-connected removal, with conservative antialias correction. Complex backgrounds, clipping, low native resolution, changed solid pixels, and mismatches with the source are flagged for review. This is deterministic capture and pixel processing, not generative logo reconstruction or a newly enabled paid AI service. It does not claim semantic visual approval for every possible website.

Raster images without CSS filters or clipping use the actual site's image bytes at native resolution; a Wix original is preferred only when the image identity and aspect ratio match the displayed asset. This also prevents transparent screenshot margins from masking an opaque bitmap backdrop. SVGs and styled artwork retain the rendered-page path. Pixel dimensions are checked after trimming, so whitespace does not count as useful resolution.

Preview responses include originals, transparent PNGs, quality measurements and source-site identity. The brief rejects stale results when its website changes. No website is automatically published, no files or cards are persisted, and a brief alone never changes estimated value. A verified saved offer updates only its associated synthetic test card.

## Access

Endpoints are enabled only when `VERCEL_ENV=preview`. This project must retain Vercel Authentication for every deployment. Production is closed by default; authenticated Pipeline integration must be implemented before production release. The sandboxed preview frame sends an uploaded image through a checked parent-message bridge to the same-origin upload endpoint. It has no direct network access or production database client. BHS uses a separate checked message bridge for an explicit research brief; the server sends that snapshot to Google. No whole CRM records, contact objects or logo data are included.

Every browser HTTP request goes through a bounded server fetcher. Public IPs are checked and DNS results pinned to the request socket. Redirect destinations are checked independently. Private/metadata addresses, credentials, non-HTTP protocols, service workers, WebSockets, POSTs and oversized responses are blocked. No browser bypass of site anti-bot challenges is attempted.

## Validation

`npm test` covers transparency, preservation of enclosed white artwork, clipping/complex-background review gates and SSRF. Set `LOGO_TEST_CHROMIUM` to a local Chromium path to enable the rendered-page integration test. The production package uses the pinned serverless Chromium binary. Do not use fixtures as evidence of real-site success: validate real domains separately before claiming end-to-end readiness.

## Contract request

Native mailto opens a draft to `yigit@sellfmedia.com` and `businessdevelopment@sellfmedia.com`, including the selected monthly amount, offer version and link. Sending is completed by the user in their email application. No Resend account, mail API key or automatic backend delivery is required. Publishing has no mail-provider dependency.

## Direct app preview

Start at `/` and select “Test alanını aç” once. Create or open a test card, save its meeting context, then use “Teklif Oluştur” through logo, BHS, price, composition, review/save, customer link/password and mailto. Test cards persist only in the separate preview table; no production data is read or written. Space/column layout uses owner-scoped local metadata. The original Pipeline source and Travis remain unchanged. No provider mocks are enabled at runtime.
