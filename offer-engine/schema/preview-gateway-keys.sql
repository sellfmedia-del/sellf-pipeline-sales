-- An additional worker identity for the same-project preview. Existing worker
-- credentials and production CRM/Travis tables are unchanged.
alter table public.pipeline_offer_preview_gateway_config
 add column if not exists preview_key_hash text
 check(preview_key_hash is null or preview_key_hash ~ '^[a-f0-9]{64}$');
