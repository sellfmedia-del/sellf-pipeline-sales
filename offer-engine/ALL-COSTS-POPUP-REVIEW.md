# All sheet cost rows and compact popup pickers

Branch: `fix/all-sheet-costs-popup-picker`.
Base production commit: `99fa0fbf6a08e34d555a2916a6382e9c256c52ce`.

## User rule (7 November 2026)

Only explicitly selected cost rows may enter a new quote, in BOTH formats.
Account, every Growth team row, and project coordination are opt-in. Selecting
Account AND Growth adds both costs once. There is no default Account charge,
Growth initial/consultant maximum, or implicit project Account charge in either
explicit-selection calculator. Spreadsheet notes requiring automatic Account
are superseded by this explicit user instruction.

Standard offers keep their two alternative IDs and presentation. The operator
chooses each alternative's costs independently, with an explicit copy button to
reuse the first selection. Shared one-off projects remain separate from both
monthly retainers. Monthly offers use the same picker per month and copy only
retainer selections (including chosen staff), never one-off projects.

Blank alternatives cannot become free offers: they remain in the existing
storage structure but are disabled in customer selection and contract requests.
At least one selected cost/project is required before calculating. For this new
single-available-alternative case the legacy two-price negotiation dialog is
read-only; costs can be edited/recalculated in the creator. Old two-alternative
offers and negotiated prices keep their existing behaviour.

## Complete sheet coverage

Source: spreadsheet `10TQmuNVY8ArWrk9iH8iGzqvOcQHnrRXzx3AMPy1-Z8c`.
Both tabs were read only on 7 November 2026. The independent test fixture
`test/fixtures/cost-sheet-2026-11-07.json` records all 36 named cost rows and their
108 segment values:
- Hizmet Bedelleri, rows 2–29: all 28 monthly rows, including Account and all
  three Growth profiles.
- Proje Kalem ve Bedelleri, rows 2–9: all 8 project rows, including project Account.

The generated picker catalogue is projected from the complete server catalogue,
not the operations-only filter. Source names are retained for search. No Sheet
values were changed. Public selection data includes names/IDs and required-input
flags, not fixed internal costs. Zero/custom rows require an explicit positive,
two-decimal cost; influencer commission remains exactly 10% of the list amount.
The existing ideal 2x/minimum 1.5x cost markups and frozen TCMB conversion rules
are unchanged. Only selected cost components are summed in integer kuruş.

Already-open clients sending a flat explicit list are supported: both standard
alternatives use that exact list, with no automatic additions. Stored legacy
quotes, their cost snapshots and the legacy internal calculator remain intact;
no stored quote is recalculated by this change.

## UI

Three compact standard slots: two independent retainer selections and shared
projects. Two slots per month in monthly mode. All options live in bounded,
searchable multi-select popups; the page shows only selected rows. Turkish
normalization and multi-word search support entries such as Account Manager.
Optional scope details are collapsed; custom/influencer inputs open when needed.
Native popovers support outside click, Done, Escape, keyboard checkboxes and
viewport resizing. A fallback is provided. Popup resources are cleaned up when
an editor/month/dialog is removed. Selecting/removing costs invalidates prices,
proposal/save controls, but preserves the BHS and research proof.

## Safety, checks and rollback

No BHS/logo, database schema, SQL/RLS/auth, environment or dependency changes.
Existing card values, offers, history, users and budgets are preserved; persistence
checks use an isolated copy of the existing SQL, never production rows.

Validation covers all source rows/segment values, staff-only and combined staff
selections, independent alternatives, one-off coordination, cent arithmetic,
FX and customer-field sanitization, HMAC scope binding, save/retry/publish/reopen,
and desktop/mobile popup/search/copy/remove/resize/recalculation flows.

Preview uses the actual pure pricing functions with simulated BHS/logo/translation,
page-local saves and an example USD rate. Preview fixtures and cost modules are
removed from production builds. Separate preview and production approval gates
remain in force; this branch has not been released to production.

Rollback before new documents: return to the base commit. After new documents
exist, retain the new readers so unavailable alternatives are not rendered as
free services; disable/revert creation separately without changing stored data.

Verification results before preview: 54 root tests, 331 engine tests passed
(21 opt-in tests skipped), 5 Offerletter tests/build passed. The browser-enabled
regression command passed 13 tests, including desktop/mobile BHS/recovery/variants
and the three new popup flows. The search flow was additionally rerun for
multi-word Account Manager filtering. Contract typecheck, focused lint and diff
checks passed. Production build retained index.html byte-for-byte, projected all
28 + 8 exact source names without costs, and removed preview fixtures/modules.


Release check: unfinished legacy explicit quotes can still carry the pre-change
pricing rule. Proposal assembly preserves the Growth service already included in
that signed old price snapshot. New manual-cost snapshots use the selected-only
rule and never gain an unselected Growth service. Regression test added before
release; stored documents and all monetary amounts remain unchanged.
