# BHS budget and research-progress corrections 1–2 — 21 November 2026

This is the first pair of the ten corrections diagnosed from the user's Kuatra run. Only implementation and Preview are authorized. Do not merge, deploy production, resume/restart Kuatra, or run paid model/search/scraper acceptance. The production baseline is `c5f30c74dbba661692acad14685a20e1f936bcec`.

## 1. Preserve research capacity without sacrificing the full narrative

The old admission check could stop after a homepage because it always reserved a 6,000-token later review on top of the entire 20,000-token report. A synthetic replay uses the retained run's 21,515-token input upper bound and 1,062-kuruş commitment; the old code rejects another useful read. Both failures were reproduced on the baseline code, without providers.

New requests still count the entire same conversation, preserve all messages, source observations and opaque thinking, and quote uncached cache-creation rates. The narrative ceiling remains 20,000 tokens; existing writing-only recovery keeps its existing allowance. Research decisions use up to 1,800 tokens and targeted reviews up to 6,000. Within the remaining original 5,000-kuruş account, those short turns can use smaller ceilings (at least 1,000 tokens) before the engine switches to final writing. The exact chosen ceiling becomes the native request's `max_tokens` and is frozen in its durable receipt. Claude also receives that turn's allowance in the same budget context.

Research admission explicitly funds a 62-kuruş bounded next search/extract and the two later 300-kuruş worker envelopes (writing and review). All real calls recheck the shared ledger before dispatch. Unknown/uncertain commitments are never refunded or excluded, and cache hits are not assumed. Growing source observations are recounted on subsequent turns; the reserve is not a guarantee of arbitrary future context size or successful paid business-quality acceptance.

If a full draft can be funded but the minimum later review cannot, writing may preserve that entire draft; its pending/unavailable review stays partial. A review cut off at `max_tokens` cannot approve even a syntactically valid decision. Existing bounded attempts, deadlines, pricing handoff and whole-report preservation remain active. Reduced decision/review capacity can still interrupt a real model; only user-run paid acceptance can establish adequacy. No report text is shortened by this correction.

Completed frozen requests retain their original quote, messages, output limit and native provider key. Reconnecting cannot buy the same response again. Legacy quotes retain their existing 400-kuruş guard; new quotes carry their explicit following-work reserve.

## 2. Candidate errors do not discard valid research questions

The previous `review_research` update rejected the entire objective/questions/sources transaction when an unread homepage was labeled `selected`. Now candidate entries are validated separately. A known, relevant but unreviewed selection is retained as `pending`, with a visible correction notice. Malformed/unknown candidates are reported individually; they cannot replace prior valid candidates or erase valid questions and read-source adjudications.

Evidence rules remain strict and atomic. An unseen quote, invalid answer, unsupported source proof or fabricated unavailable status still fails. A source is not counted as read by repairing its candidate status. Important open questions and pending candidates continue to block ordinary research completion. A later actual body read and relevance proof can explicitly promote that candidate to selected. The pending state, questions and notices survive ordinary durable reloads in the same conversation.

## Validation and scope

The regression suite uses synthetic requests, synthetic sources and local ledgers. It covers the baseline Kuatra-shaped early close, additional retained context, exact quote/request matching, uncertain receipt non-replay, full narrative preservation, truncated-review rejection, pending candidate repair, malformed/unknown candidates, strict evidence checks and checkpoint reload. Existing full regression and responsive synthetic UI checks are also required before the branch is considered ready.

No customer records, database/schema/auth/RLS, environment, dependencies, prices, services, other applications or customer-facing UI change. Source-link extraction, deeper channel/market/competitor work, broader semantic-quality behavior, CRM interpretation and sensitive-note filtering remain corrections 3–10, not completed by this pair.

Rollback: leave this branch unmerged, or revert its code commit after a separately approved release. Keep source archives, existing offers, jobs, account IDs and paid/uncertain receipts intact. No data rollback is required.
