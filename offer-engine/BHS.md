# Pre-BHS research adapter

## Source and scope

The framework is extracted verbatim from the final `BHS Audit` section of the user-supplied `02-Promptlar.docx` (original SHA-256 `946c9f27d21aee7f45503b6c57b8d4db19a09692093a02ac4dfb346730c5b44c`). `src/bhs/methodology.txt` contains only this section, not the unrelated blog/social prompts. Runtime methodology version: `sellf-pre-bhs-2026-10-19-v1`.

Six dimensions and fixed weights: financial signals 25%, operational signals 20%, funnel 20%, digital assets 15%, perception 10%, competitive position 10%. Research must establish 3–5 comparable competitors before scoring and cover the nine report sections: brand overview, dimensions, weighted score, onboarding unknowns, critical opportunity, greatest risk, 5–8 meeting questions, competitor benchmarks, sources. The brief's goals, needs, services and meeting context direct research; services do not predetermine the findings.

The user's latest missing-data decision overrides the original prompt's instruction to assign a provisional financial floor score. Missing evidence is `null`, never zero or an invented floor. The server computes the fixed-weight total only if every dimension is scored with evidence and all mechanical checks pass. No redistribution of missing weights. Qualitative dimension scores remain model judgments, not objective financial measurements.

## Provider flow

`POST /api/audit` starts actual Gemini Deep Research Max through Google's background Interactions API. No generic generate-content call or scripted web summary substitutes for Deep Research. The browser polls the signed job. When research completes, a second background model interaction converts the report into a bounded JSON Schema. Deep Research itself does not support guaranteed structured output, so it is never given a fictitious JSON-mode option. The extraction interaction receives only the final report text and citation URLs without inheriting the full agent history, has a bounded output budget and has no search tools. The original research text and provider citation URLs are retained.

The isolated API key is `OFFER_GEMINI_API_KEY`. Set it as a Secret scoped to Preview in the `sellf-offer-engine` project. Optional model/agent variables and defaults are in `.env.example`. Billing and access to the named agents/models must be enabled in that Google API project. Missing credentials return 503; no report is invented. Credentials were added to the isolated Preview environment on 2026-10-19. A real Deep Research Max start was accepted by Google that day. One real research job completed in approximately 28 minutes, with 45 citation URLs. Manual comparison rejected the report for normalized partial scoring and entity/period/generalization errors. Both extraction attempts failed asynchronously. See BHS-VALIDATION.md; the engine is not accepted for proposal use.

The browser displays progress, supports cancellation, and never automatically reissues a potentially paid start after an ambiguous timeout. Job tickets bind the brief hash, browser session, deployment host and a two-hour lifetime; updates to the brief cannot reuse stale research. There is no durable application database or scheduler. Dedupe of starts is best effort within one serverless instance only. Reloading loses in-memory UI state; deployment restarts can lose dedupe state. Cross-instance quota enforcement and durable resume need the later reviewed persistence integration. Provider background work may continue until cancellation or the provider's own timeout if the tab disappears without cancelling.

## Verification and limits

Server-side validation checks the entire schema, IDs/references, six-dimension coverage, minimum competitor count, benchmark matrix coverage, source citations, exact report excerpts, published-date format/future dates, score rationale fields and service-to-finding references. Referenced sources must be among the original provider's citation annotations. Independent public HTTP reads try to match the short source quote in HTML/plain text or text-based PDFs. PDF parsing runs in a worker with a 15-second deadline, an 8 MB input limit, a 200-page limit and memory limits; embedded evaluation and font rendering are disabled. DNS is validated and pinned, including redirect destinations. Private/metadata IPs and other unsafe destinations are rejected. Fetching is bounded to 24 sources, four concurrent readers, request/byte/deadline limits and three redirect hops.

These are mechanical checks, not proof of factual truth or semantic entailment. `quality.semanticBenchmark` remains `pending`. A valid quoted sentence could still be misinterpreted, outdated or about the wrong entity; actual report comparison is still required. HTML parsing is conservative text extraction, not a full visual/source accessibility check. Scanned/image-only or unreadable PDFs, JS-only pages, anti-bot walls and unavailable pages currently remain unverified and put the report in `review`; they are never silently accepted. Historical dates are retained, but semantic recency, entity/market/period comparability and financial interpretation still require evaluation. The structured report is blocked from pricing whenever these mechanical checks report issues.

No cross-provider quality parity, production readiness, real-source success, hard spending cap or universal source coverage is claimed from fixture tests. The real Silverline validation failed acceptance; the stronger prompt has not yet passed a fresh live benchmark. The existing reference BHS report is a comparison artifact, not factual ground truth. The user will review the eventual complete proposal, not intermediate engine screens.

## Boundaries

Only approved brief fields go to Google: brand, site, segment, goals, needs, services, optional budget and meeting notes. Raw lead/contact objects, CRM IDs and logos are excluded. Research tasks use provider-side storage because background execution requires it. No source page can change tool definitions or grant new app permissions. The source/model content is untrusted data, rendered with textContent rather than injected HTML.

The preview remains behind Vercel Authentication and API routes require VERCEL_ENV=preview. POST requests require the same parent origin. No production database reads/writes, migrations, CRM value updates, Travis code/env modifications, or customer publication occur. Pipeline index.html is unchanged in this step. Logo review is deferred to the proposal draft; mandatory background removal remains enforced.

## One-off provider probe

`scripts/research-probe.mjs --start` is an explicit preview-only CI probe using a public synthetic Silverline brief. The normal build never invokes it. A separate validation branch changes the build command for that single protected test deployment; production and the feature branch build command remain unchanged. It starts one provider research job, polls it, extracts the structured BHS and runs the same source checks. `--resume RESEARCH_ID [STRUCTURE_ID]` reuses an existing job (and optionally its existing structured result) to retest verification without repeating paid research. Provider credentials and upstream error text are never logged. A protected deployment artifact contains the test report and safe diagnostics. The test does not read CRM records or use live customer notes.

## Documentation checked

- https://ai.google.dev/gemini-api/docs/deep-research
- https://ai.google.dev/api/interactions-api

Direct REST is used for the agent-specific Interactions lifecycle; no unrelated chat SDK or provider fallback was added. Defaults are documented preview-agent/model identifiers and remain configurable for later provider changes.
