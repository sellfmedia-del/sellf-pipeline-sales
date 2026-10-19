# Real provider validation — 2026-10-19

Status: **not accepted for proposal use**. Successful authentication is not a quality benchmark pass.

## Test and isolation

One actual Deep Research Max job used a public synthetic Silverline TR brief: Turkey dealership growth, consumer demand, service and digital assets. These are test goals, not verified customer statements. No CRM records, contact data, logos, internal costs or customer notes were read or sent. The test branch and worker deployments remained protected previews. Main, the Pipeline production deployment, Travis files/environment and database records were not changed.

The completed research took approximately 28 minutes and returned 34,325 characters with 45 provider citation URLs. The provider reported 169 Google Search tool calls. These are activity counters, not verified-source or factual-accuracy counts. The original report is retained in the protected test artifact; intermediate reasoning is excluded from newer artifacts. The research was started once. Subsequent probes reuse its ID.

## Manual acceptance findings

The first report fails the agreed method:

- It leaves the digital dimension unknown but presents 54.5/85 and approximately 64% as an overall health result. Missing dimensions must never be removed from the denominator or converted into a partial total.
- It treats the listed manufacturing entity's financial signals as if they directly described the entire Turkish brand/sales operation. The official KAP brand-use disclosure distinguishes Silverline Endüstri ve Ticaret A.Ş. from Silverline Ev Gereçleri Satış ve Pazarlama A.Ş. The relationship and statement scope must be established before interpreting financial signals.
- The financial narrative does not reliably distinguish a cumulative interim result from a standalone quarter or establish comparable periods.
- It generalizes selected complaints into chronic service performance and comparative superiority without a comparable sample, denominator or matched period.
- One event reference combines a 2023 URL/date with a 2026 event description. The content/event date must be verified independently.
- The required eight-metric benchmark is incomplete, and a verified identity quote from the supplied brand domain has not been established.

Useful hypotheses and a long source list do not override these failures. The older reference report's numbers were not used as ground truth.

Primary scope/period checks:

- https://www.kap.org.tr/tr/Bildirim/1582069
- https://www.kap.org.tr/tr/sirket-finansal-bilgileri/1436-silverline-endustri-ve-ticaret-a-s

## Technical outcomes

The real research start and completion succeeded. The original history-linked structured extraction failed asynchronously. A second extraction using only the final report and citation list also failed asynchronously. No failed extraction is treated as a valid BHS result; downstream pricing/proposal use remains blocked. Safe diagnostics identified an invalid-argument failure. Minimal text, minimal JSON and minimal JSON with the same generation settings all completed successfully, while the full provider schema was rejected independently of the brand report. This isolates a schema compatibility/complexity issue, rather than an authentication failure. Provider string/array bounds are now descriptive hints, while the complete strict contract remains enforced server-side. A synchronous diagnostic exceeded the 60-second connection deadline; final extraction remains a resumable background job. Safe background-error diagnostics distinguish the interaction status and machine error code without printing upstream messages or credentials.

The final background extraction completed successfully in approximately four minutes and produced 55,354 characters of structured output. The real source-verification stage ran against 24 selected citations: two source quotes matched, thirteen were not found in the fetched visible text, seven sources were unavailable, and two extracted quotes were absent from the original research report. The initial artifact mislabeled the latter two as uncited URLs; comparison with the actual provider annotations confirmed that both URLs were cited. Diagnostic labels were corrected without relaxing either gate. These failures can include inaccessible/JS-only pages or extraction mismatches; they are not automatically proof that a claim was invented. The result is review and its weighted total is null. No claim is made that all 45 citations were independently verified. Verified grounding redirects use their independently fetched final publisher domain for brand identity. An original publisher URL cannot be accepted as equivalent to a provider redirect without a proven alias relationship; unmatched URLs remain unverified.

Changes made from the real test:

- A server check rejects a model-written overall/normalized BHS claim while any dimension lacks a score.
- Research instructions explicitly separate legal entities and financial periods, prohibit complaint generalization, and reserve all overall totals and health bands for server calculation.
- Structured extraction receives only the final answer and citation list, with a bounded output budget; it does not inherit the agent's complete tool history.
- PDF worker cleanup uses the supported loading-task lifecycle. An unsupported cleanup call could race a valid result and cause a false unreadable-PDF result in the full suite.

The revised research instructions have not passed a fresh real research benchmark. Fixture tests cannot establish semantic quality. Current automated verification: 54 existing/root tests previously passed; all 46 worker tests pass, including desktop/mobile UI, actual transparent-logo processing, BHS lifecycle, missing evidence, normalized-score rejection, background error redaction and text-PDF extraction. No tests are skipped in that worker run. Explicit minimal-provider diagnostics use only public fixtures. Any returned request-validation message is credential-redacted and kept only in a protected test artifact; it is not written to logs. These diagnostic/extraction requests do not repeat the Deep Research search job.

## Evidence-first implementation and live retest

The semantic reviewer is now implemented and connected to the preview UI/API. The lifecycle is research → source plan → fetched evidence → grounded synthesis → separate semantic review. Actual provider-stored user input was recovered successfully with `include_input=true`; the evidence packet does not depend on serverless process memory or a CRM write.

The first grounded run reused the original Deep Research job and the completed source-plan job. The source plan made three Google Search calls. Twelve source pages were read, then a 21-finding report and a separate coverage-complete semantic review completed. All six scores correctly remained null. Entity/period separation and the eight-row benchmark were materially better than the original report.

That run still failed acceptance. A quotation crossed the boundary between two genuinely adjacent captured excerpts, and the brand website rendered an empty country-selection page. Mechanical checks kept the result in review. Manual reading also found interpretations that the initial semantic reviewer missed: export share was described as a balanced revenue structure, and this reader's inability to render the brand site became a presumed customer access/digital-conversion problem. A model review pass is therefore not treated as proof of accuracy.

Corrections from that run:

- Excerpts overlap by the maximum permitted quote length. The verifier may also reconstruct a literal quote across captured excerpts only when their source offsets prove exact adjacency; it cannot bridge omitted regions.
- The collector reuses actual provider-cited primary links from the original discovery report. This resolved the correct KAP company pages and actual financial/activity PDFs; no company ID, financial number or brand-specific source correction was hard-coded.
- Rendered KAP error/navigation shells are excluded as evidence. Public metadata, when available, is explicitly labelled and limited to publisher identity.
- The writer and reviewer distinguish access limitations of this automated reader from actual customer, dealer, crawler or SEO problems. Review covers impact, goal connection, dimension rationale, summaries, questions and service hypotheses as well as finding statements.
- Brand identity can be established by a matched quotation from the brand site or by a primary official registry document explicitly declaring that exact website. Email domains, lookalikes, unrelated news and other country domains do not qualify. The actual KAP activity PDF declares `www.silverline.com`; this is identity evidence, not evidence that the website works.
- Missing core identity or fewer than three read competitor sites stop the paid report writer before synthesis starts.

A final live retest uses the same original research/source-plan jobs, newly fetched primary evidence and the corrected writer/reviewer. Record its final acceptance result below. Main/production, Travis code/environment and all CRM records remain unchanged. Pricing and final proposal generation are still unconfigured; the user will review one integrated proposal after those stages are complete.
