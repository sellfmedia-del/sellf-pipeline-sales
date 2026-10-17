# Offer preparation boundary

This directory contains the isolated Pipeline card extension and the brief UI prototype. The eventual audit engine, offer engine, APIs and customer portal remain separate responsibilities. This stage has no persistence, audit/model calls or customer publishing.

- `card-section.*`: card summary and entry button. All styles are scoped to the new section.
- `brief-model.js`: immutable source snapshots, input validation and URL normalization.
- `brief-form.*`: isolated dialog, editable brief, source context and review state. Form input never mutates the CRM lead or calls the bulk `save()` function.
- `preview.*`: synthetic read-only CRM fixture; only the brief form is interactive. Its sandbox blocks network access and storage. Logo files remain local blob previews. No production Supabase client is initialized.

## Accepted pricing and value rules for the later engine

The three customer alternatives each show the total monthly invoice amount. The first-two-month Growth staffing distinction is internal costing context, not a separate customer invoice period.

When an actual offer is created or its price is revised, synchronize the associated lead's estimated value with the recommended main alternative's total monthly amount. The brief alone must never change estimated value. Implement synchronization as a targeted authorized write to that lead, not through the current bulk CRM save function. Persist offer version and value synchronization reliably; do not overwrite unrelated fields or cards.

Use only the chosen KOBİ, Kurumsal or Key Account pricing columns. Growth + operations, operations bundle and individual recommended operations are alternatives for the same segment. Special-project pricing requires scope-specific reasoning. Preserve the original cost-sheet rules and take a pricing snapshot with each offer version.

## Release boundary

All changes stay on a feature branch and Vercel Preview until user approval. Do not change Travis files, migrations, existing CRM/auth code, environment variables or production data. Database migrations require separate SQL review and approval. Live deployment needs separate explicit approval.
