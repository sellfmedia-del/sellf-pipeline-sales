-- Preview-only. No production CRM table, existing record, key or budget changes.
create unique index if not exists pipeline_offer_preview_public_slug_unique
on public.pipeline_offer_preview_versions ((customer_document #>> '{publication,slug}'))
where state='published' and customer_document #>> '{publication,slug}' is not null;
