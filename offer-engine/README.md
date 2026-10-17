# Isolated offer logo worker

This package deploys independently with Vercel root directory `offer-engine`. It has its own pinned lockfile and dependencies. It does not modify the Pipeline installation, Travis functions, existing environment variables or database.

The build copies the feature branch's current card/brief UI into a synthetic preview. Build with `sourceFilesOutsideRootDirectory: true`; only this package's `api` directory is deployed as backend functions in the worker project. No live card records are included in the preview.

## Capture

The worker renders the public website in a new credential-free Chromium context. Header/home-link/logo elements are ranked and cropped at 3x device scale. It captures both the original site region and a transparent render of the actual logo element; artwork fills and colors are retained. Opaque, uniform image backdrops use edge-connected removal, with conservative antialias correction. Complex backgrounds, clipping, low native resolution, changed solid pixels, and mismatches with the source are flagged for review. This is deterministic capture and pixel processing, not generative logo reconstruction or a newly enabled paid AI service. It does not claim semantic visual approval for every possible website.

Preview responses include originals, transparent PNGs, quality measurements and source-site identity. The brief rejects stale results when its website changes. No website is automatically published, no files or cards are persisted, and estimated value remains unchanged until the future pricing engine produces an actual offer.

## Access

The endpoint is enabled only when `VERCEL_ENV=preview`. This project must retain Vercel Authentication for every deployment. Production is closed by default; authenticated Pipeline integration must be implemented before production release. The preview frame sends only the website URL to its own parent, which calls the same-origin worker endpoint. Full brief notes are never sent for logo capture.

Every browser HTTP request goes through a bounded server fetcher. Public IPs are checked and DNS results pinned to the request socket. Redirect destinations are checked independently. Private/metadata addresses, credentials, non-HTTP protocols, service workers, WebSockets, POSTs and oversized responses are blocked. No browser bypass of site anti-bot challenges is attempted.

## Validation

`npm test` covers transparency, preservation of enclosed white artwork, clipping/complex-background review gates and SSRF. Set `LOGO_TEST_CHROMIUM` to a local Chromium path to enable the rendered-page integration test. The production package uses the pinned serverless Chromium binary. Do not use fixtures as evidence of real-site success: validate real domains separately before claiming end-to-end readiness.
