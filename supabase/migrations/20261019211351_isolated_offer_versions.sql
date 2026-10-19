-- REVIEW COPY. Not applied to the connected database.
-- Additive only: no DELETE, TRUNCATE, DROP, or modification of existing policies.
-- Applying this enables private versioned offers. The only existing row changed
-- by save_pipeline_offer is the authorized lead's value, inside that transaction.
begin;
create table public.pipeline_offer_versions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 space_id text not null,
 lead_id text not null,
 version integer not null check (version > 0),
 request_id text not null,
 customer_document jsonb not null check(customer_document->>'schemaVersion' = 'proposal-v1'),
 pricing_snapshot jsonb not null,
 monthly_amount numeric(15,2) not null check(monthly_amount >= 0),
 state text not null default 'draft' check(state in ('draft','published')),
 public_token_hash text unique,
 password_hash text,
 created_at timestamptz not null default now(),
 unique(owner_id, request_id), unique(lead_id, version)
);
create index pipeline_offer_owner_lead_idx on public.pipeline_offer_versions(owner_id,lead_id,version desc);
alter table public.pipeline_offer_versions enable row level security;
revoke all on public.pipeline_offer_versions from anon;
grant select, insert, update on public.pipeline_offer_versions to authenticated;
grant all on public.pipeline_offer_versions to service_role;
create policy "Owner reads offer versions" on public.pipeline_offer_versions for select to authenticated using(owner_id=(select auth.uid()));
create policy "Owner creates offer versions" on public.pipeline_offer_versions for insert to authenticated with check(owner_id=(select auth.uid()) and exists(select 1 from public.spaces s join public.leads l on l.space_id=s.id where s.id=pipeline_offer_versions.space_id and l.id=pipeline_offer_versions.lead_id and s.user_id=(select auth.uid())));
create policy "Owner publishes offer versions" on public.pipeline_offer_versions for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create table public.pipeline_offer_requests (
 id uuid primary key,
 offer_id uuid not null references public.pipeline_offer_versions(id),
 alternative_id text not null,
 requester_name text not null check(length(requester_name) between 1 and 160),
 requester_email text not null check(length(requester_email) between 3 and 254),
 monthly_amount numeric(15,2) not null,
 mail_payload jsonb not null,
 delivery_state text not null default 'pending' check(delivery_state in ('pending','sending','accepted','uncertain')),
 provider_id text,
 claimed_at timestamptz,
 created_at timestamptz not null default now()
);
create index pipeline_offer_requests_offer_idx on public.pipeline_offer_requests(offer_id,created_at);
alter table public.pipeline_offer_requests enable row level security;
revoke all on public.pipeline_offer_requests from anon,authenticated;
grant select on public.pipeline_offer_requests to authenticated;
grant all on public.pipeline_offer_requests to service_role;
create policy "Owner reads contract requests" on public.pipeline_offer_requests for select to authenticated using(exists(select 1 from public.pipeline_offer_versions v where v.id=offer_id and v.owner_id=(select auth.uid())));
create or replace function public.save_pipeline_offer(p_lead_id text,p_space_id text,p_request_id text,p_document jsonb,p_pricing jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v public.pipeline_offer_versions; n integer; amount numeric; owner uuid := auth.uid();
begin
 if owner is null or length(p_request_id) not between 16 and 80 then raise exception 'Unauthorized'; end if;
 if not exists(select 1 from public.spaces s join public.leads l on l.space_id=s.id where s.id=p_space_id and l.id=p_lead_id and s.user_id=owner) then raise exception 'Lead not owned'; end if;
 -- Serialize revisions per lead; no bulk write and no update to notes/timeline.
 perform 1 from public.leads where id=p_lead_id and space_id=p_space_id for update;
 select * into v from public.pipeline_offer_versions where owner_id=owner and request_id=p_request_id;
 if found then
  if v.lead_id<>p_lead_id or v.customer_document<>p_document or v.pricing_snapshot<>p_pricing then raise exception 'Request changed'; end if;
  return jsonb_build_object('id',v.id,'version',v.version,'monthlyAmount',v.monthly_amount,'state',v.state,'reused',true);
 end if;
 if p_document->>'schemaVersion'<>'proposal-v1' or jsonb_array_length(p_document->'alternatives')<>2 or p_document#>>'{logo,reviewed}'<>'true' then raise exception 'Invalid offer'; end if;
 select (a->>'monthlyAmount')::numeric into amount from jsonb_array_elements(p_document->'alternatives') a where a->>'id'=p_document->>'recommendedAlternativeId';
 if amount is null or amount<0 then raise exception 'Invalid amount'; end if;
 select coalesce(max(version),0)+1 into n from public.pipeline_offer_versions where lead_id=p_lead_id;
 insert into public.pipeline_offer_versions(owner_id,space_id,lead_id,version,request_id,customer_document,pricing_snapshot,monthly_amount)
 values(owner,p_space_id,p_lead_id,n,p_request_id,p_document,p_pricing,amount) returning * into v;
 update public.leads set value=amount::text where id=p_lead_id and space_id=p_space_id;
 return jsonb_build_object('id',v.id,'version',v.version,'monthlyAmount',amount,'state',v.state,'reused',false);
end $$;
revoke all on function public.save_pipeline_offer(text,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.save_pipeline_offer(text,text,text,jsonb,jsonb) to authenticated;
commit;
