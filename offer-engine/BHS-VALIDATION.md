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

The real research start and completion succeeded. The original history-linked structured extraction failed asynchronously. A second extraction using only the final report and citation list also failed asynchronously. No failed extraction is treated as a valid BHS result; downstream pricing/proposal use remains blocked. The cause is not inferred from a generic failed status. Safe background-error diagnostics distinguish the interaction status and machine error code without printing upstream messages or credentials.

The source-verification stage was not reached by these live extractions. No claim is made that the 45 citations passed independent quote checks. Google grounding redirect URLs also need explicit alias-resolution validation before an original publisher URL can be accepted as equivalent; unmatched URLs remain unverified.

Changes made from the real test:

- A server check rejects a model-written overall/normalized BHS claim while any dimension lacks a score.
- Research instructions explicitly separate legal entities and financial periods, prohibit complaint generalization, and reserve all overall totals and health bands for server calculation.
- Structured extraction receives only the final answer and citation list, with a bounded output budget; it does not inherit the agent's complete tool history.
- PDF worker cleanup uses the supported loading-task lifecycle. An unsupported cleanup call could race a valid result and cause a false unreadable-PDF result in the full suite.

The revised research instructions have not passed a fresh real research benchmark. Fixture tests cannot establish semantic quality. Current automated verification: 54 existing/root tests previously passed; all 42 worker tests pass, including desktop/mobile UI, actual transparent-logo processing, BHS lifecycle, missing evidence, normalized-score rejection, background error redaction and text-PDF extraction. No tests are skipped in that worker run.

## Remaining acceptance gate

Before pricing/proposal integration, structured extraction must complete against the real report and the above semantic defects must be corrected and verified with primary sources. Do not promote this branch or label the BHS engine ready based on authentication, search volume, report length or fixture tests alone. Pricing and final proposal engines remain unconfigured; the user will review one integrated proposal after the engine work is complete.
