-- Applied only to the isolated preview tables.
alter table public.pipeline_offer_preview_versions add column operator_link_envelope text;
create policy "Service-only gateway configuration" on public.pipeline_offer_preview_gateway_config for select to service_role using(true);
