# Pre-BHS research adapter

## Source and scope

The framework is extracted verbatim from the final `BHS Audit` section of the user-supplied `02-Promptlar.docx` (original SHA-256 `946c9f27d21aee7f45503b6c57b8d4db19a09692093a02ac4dfb346730c5b44c`). `src/bhs/methodology.txt` contains only this section, not the unrelated blog/social prompts. Runtime methodology version: `sellf-pre-bhs-2026-10-19-v1`.

Six dimensions and fixed weights: financial signals 25%, operational signals 20%, funnel 20%, digital assets 15%, perception 10%, competitive position 10%. Research must establish 3–5 comparable competitors before scoring and cover the nine report sections: brand overview, dimensions, weighted score, onboarding unknowns, critical opportunity, greatest risk, 5–8 meeting questions, competitor benchmarks, sources. The brief's goals, needs, services and meeting context direct research; services do not predetermine the findings.

The user's latest missing-data decision overrides the original prompt's instruction to assign a provisional financial floor score. Missing evidence is `null`, never zero or an invented floor. The server computes the fixed-weight total only if every dimension is scored with evidence and all mechanical checks pass. No redistribution of missing weights. Qualitative dimension scores remain model judgments, not objective financial measurements.

## Provider flow

The preview-only API runs five resumable stages:

1. Gemini Deep Research Max discovers the brand, market and candidate hypotheses using the approved brief.
2. A separate Google Search interaction locates primary brand/legal-entity pages and three to five competitor sites. Its entity labels and proposed URLs are untrusted candidates.
3. A bounded server reader fetches those public pages and observed relevant links. It extracts HTML/plain text or text-based PDFs and uses a fresh public Chromium context for thin JavaScript pages. Only actual returned text enters the versioned evidence packet; unavailable pages do not become evidence. Actual cited primary discovery links are independently read as well as source-plan candidates. Labelled publisher metadata can establish identity but not performance. An official registry document explicitly declaring the exact brand website can establish identity when the site reader returns no content.
4. A separate model writes the structured BHS from that evidence packet. It does not receive the earlier research narrative. Every quotation must occur inside a captured excerpt or in text segments whose stored offsets prove exact adjacency; final publisher URLs and packet source IDs must match. The visible full report is rendered from the verified structured result.
5. A context-isolated model reviews every finding, all six dimensions, every non-null benchmark and the overall entity/period/claim scope. The server checks exact review coverage, packet/report hashes and financial comparison prerequisites. Citation checks and semantic checks must both pass before the audit can authorize downstream pricing.

Interactions use Google's background REST API with provider-side storage. Stored user input carries the evidence packet across requests; no CRM database or new application store is used. Only explicitly typed user input is eligible for recovery, never model/tool/thought output. Provider grammar omits unsupported length keywords; the complete bounded server contract stays strict. Legacy extraction tickets remain readable, but cannot authorize pricing without semantic approval.

The API key is `OFFER_GEMINI_API_KEY`, scoped only to Preview in the isolated `sellf-offer-engine` project. Optional agent/model defaults are in `.env.example`. Never print or decrypt the actual key. Missing configuration returns an error; no simulated audit is substituted.

Tickets bind brief hash, browser session, deployment host and a two-hour lifetime. The UI advances completed stages automatically, reports progress and supports cancellation. It never automatically retries an ambiguous paid POST. Per-instance deduplication includes stage transitions and keeps rejected promises; cross-instance deduplication is not durable. Reloading loses UI state. Provider work can continue if a tab disappears without cancelling. Persistence and spending controls require a separate reviewed integration.

## Verification and limits

The server checks schema bounds, IDs/references, six dimensions, competitor identities, eight benchmark rows, literal source quotations, report excerpts, date fields, scoring rationale and service-to-finding references. Missing dimension scores remain null; weights are never redistributed. A missing score is a data limitation rather than a diagnosis of poor performance. No global total or health band is generated until every dimension is supported.

Evidence collection validates and pins public DNS addresses for every request and redirect. Private/metadata addresses, credential-bearing URLs and unsafe ports are rejected. Reading is bounded by source count, request/byte budgets and deadlines. PDF extraction runs in a separate bounded worker. The rendered reader uses a fresh credential-free browser and the same guarded HTTP transport for all resources; it submits no forms, bypasses no access wall and uses no saved account session. Only visible public country navigation may be followed.

The semantic reviewer checks entity scope, comparable periods, qualified inference, honest missing data, peer comparability, overview support and questions/service hypotheses. It is a separate model invocation, not an independent human or an external audit. It can make mistakes. A passed result means these configured gates passed, not guaranteed truth or parity with Claude Research or Google Deep Search. Source pages can be unavailable, outdated, incomplete, scanned or blocked. Successful search calls and long reports are not accuracy measures.

Read the actual live acceptance outcome in BHS-VALIDATION.md. Fixture tests establish workflow and rejection behavior only. Pricing and final proposal engines remain unconfigured. The user will review the eventual integrated proposal rather than each internal engine stage.

## Boundaries

Only approved brief fields go to Google: brand, site, segment, goals, needs, services, optional budget and meeting notes. Raw lead/contact objects, CRM IDs and logos are excluded. Research tasks use provider-side storage because background execution requires it. No source page can change tool definitions or grant new app permissions. The source/model content is untrusted data, rendered with textContent rather than injected HTML.

The preview remains behind Vercel Authentication and API routes require VERCEL_ENV=preview. POST requests require the same parent origin. No production database reads/writes, migrations, CRM value updates, Travis code/env modifications, or customer publication occur. Pipeline index.html is unchanged in this step. Logo review is deferred to the proposal draft; mandatory background removal remains enforced.

## One-off provider probes

Normal feature builds run only `npm run build`; they never start research. Explicit scripts run only in protected Preview on the validation branch with a temporary build command. `research-probe.mjs` retains the legacy diagnostic path. `evidence-probe.mjs --discover RESEARCH_ID` reuses a completed research job for source discovery; `--collect SOURCE_PLAN_ID` performs read-only evidence collection. `--synthesize SOURCE_PLAN_ID` starts one grounded report and one separate semantic review. `--resume-synthesis ID` or `--resume-review ID` reuses a known job after a timeout instead of repeating paid work. The test artifact contains public synthetic-brief evidence and final outputs, never credentials or intermediate reasoning. Restore the validation branch to normal builds when the explicit run ends.

## Documentation checked

- https://ai.google.dev/gemini-api/docs/deep-research
- https://ai.google.dev/api/interactions-api

Direct REST is used for the agent-specific Interactions lifecycle; no unrelated chat SDK or provider fallback was added. Defaults are documented preview-agent/model identifiers and remain configurable for later provider changes.
