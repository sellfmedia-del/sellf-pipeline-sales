-- Additive production offer storage. Existing CRM/Auth/Travis policies are unchanged.
-- Only save_pipeline_offer_production updates one explicitly owned lead.value.
begin;
create table public.pipeline_offer_gateway_config(
 id boolean primary key default true check(id),
 key_hash text not null check(key_hash ~ '^[a-f0-9]{64}$')
);
create table public.pipeline_offer_versions(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),space_id text not null,lead_id text not null,
 version integer not null check(version>0),request_id text not null,
 customer_document jsonb not null check(customer_document->>'schemaVersion'='proposal-v1'),
 pricing_snapshot jsonb not null,monthly_amount numeric(15,2) not null check(monthly_amount>=0),
 state text not null default 'draft' check(state in ('draft','published')),
 public_token_hash text unique,password_hash text,operator_link_envelope text,
 created_at timestamptz not null default now(),
 unique(owner_id,request_id),unique(lead_id,version)
);
create index pipeline_offer_production_owner_lead_idx on public.pipeline_offer_versions(owner_id,lead_id,version desc);
create unique index pipeline_offer_production_public_slug_unique
 on public.pipeline_offer_versions((customer_document #>> '{publication,slug}'))
 where state='published' and customer_document #>> '{publication,slug}' is not null;
alter table public.pipeline_offer_gateway_config enable row level security;
alter table public.pipeline_offer_versions enable row level security;
revoke all on public.pipeline_offer_gateway_config,public.pipeline_offer_versions from public,anon,authenticated;
grant all on public.pipeline_offer_gateway_config,public.pipeline_offer_versions to service_role;
create function public.save_pipeline_offer_production(p_owner uuid,p_lead_id text,p_space_id text,p_request_id text,p_document jsonb,p_pricing jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.pipeline_offer_versions;n integer;amount numeric;
begin
 if current_user<>'service_role' then raise exception 'private offer worker required';end if;
 if p_owner is null or p_request_id is null or length(p_request_id) not between 16 and 80 then raise exception 'Invalid request';end if;
 perform l.id from public.leads l join public.spaces s on s.id=l.space_id
  where l.id=p_lead_id and l.space_id=p_space_id and s.user_id=p_owner for update of l;
 if not found then raise exception 'Lead not owned';end if;
 select * into v from public.pipeline_offer_versions where owner_id=p_owner and request_id=p_request_id;
 if found then
  if v.lead_id<>p_lead_id or v.space_id<>p_space_id or v.customer_document<>p_document or v.pricing_snapshot<>p_pricing then raise exception 'Request changed';end if;
  return jsonb_build_object('id',v.id,'version',v.version,'monthlyAmount',v.monthly_amount,'state',v.state,'reused',true);
 end if;
 if p_document->>'schemaVersion' is distinct from 'proposal-v1'
  or jsonb_typeof(p_document->'alternatives') is distinct from 'array'
  or coalesce(jsonb_array_length(p_document->'alternatives'),0)<>2
  or p_document#>>'{alternatives,0,id}' is distinct from 'growth_operations'
  or p_document#>>'{alternatives,1,id}' is distinct from 'operations_bundle'
  or p_document#>>'{logo,reviewed}' is distinct from 'true' then raise exception 'Invalid offer';end if;
 select (a->>'monthlyAmount')::numeric into amount from jsonb_array_elements(p_document->'alternatives') a where a->>'id'=p_document->>'recommendedAlternativeId';
 if amount is null or amount<0 then raise exception 'Invalid amount';end if;
 if exists(select 1 from jsonb_array_elements(p_document->'alternatives') a
   where not exists(select 1 from jsonb_array_elements(p_pricing->'alternatives') b
    where a->>'id'=b->>'id' and (a->>'monthlyAmount')::numeric=(b->>'monthlyAmount')::numeric)) then raise exception 'Price changed';end if;
 select coalesce(max(version),0)+1 into n from public.pipeline_offer_versions where lead_id=p_lead_id;
 insert into public.pipeline_offer_versions(owner_id,space_id,lead_id,version,request_id,customer_document,pricing_snapshot,monthly_amount)
 values(p_owner,p_space_id,p_lead_id,n,p_request_id,p_document,p_pricing,amount) returning * into v;
 update public.leads set value=amount::text where id=p_lead_id and space_id=p_space_id;
 return jsonb_build_object('id',v.id,'version',v.version,'monthlyAmount',amount,'state',v.state,'reused',false);
end $$;
revoke all on function public.save_pipeline_offer_production(uuid,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_pipeline_offer_production(uuid,text,text,text,jsonb,jsonb) to service_role;
-- Production accounting in new tables; no existing budget or CRM/Travis row is altered.
create table if not exists public.pipeline_offer_budgets (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null,
 lead_id text not null, cap_kurus integer not null default 5000 check(cap_kurus=5000),
 charged_kurus integer not null default 500 check(charged_kurus between 500 and 5000),
 created_at timestamptz not null default now(), unique(owner_id,lead_id)
);
create table if not exists public.pipeline_offer_budget_steps (
 budget_id uuid not null references public.pipeline_offer_budgets(id),
 step_key text not null check(length(step_key) between 1 and 160),
 input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
 charge_kurus integer not null check(charge_kurus between 0 and 4500),
 claim_token uuid not null, state text not null default 'reserved' check(state in ('reserved','complete','uncertain')),
 value jsonb, created_at timestamptz not null default now(),
 primary key(budget_id,step_key)
);
alter table public.pipeline_offer_budgets enable row level security;
alter table public.pipeline_offer_budget_steps enable row level security;
revoke all on public.pipeline_offer_budgets, public.pipeline_offer_budget_steps from public,anon,authenticated;
grant all on public.pipeline_offer_budgets, public.pipeline_offer_budget_steps to service_role;

create or replace function public.pipeline_offer_production_budget_op(
 p_owner uuid,p_lead text,p_op text,p_step text default null,p_hash text default null,
 p_amount integer default 0,p_token uuid default null,p_value jsonb default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.pipeline_offer_budgets; s public.pipeline_offer_budget_steps;
begin
 if current_user <> 'service_role' then raise exception 'private budget worker required'; end if;
 if not exists(select 1 from public.leads owned_lead join public.spaces owned_space on owned_space.id=owned_lead.space_id where owned_space.user_id=p_owner and owned_lead.id=p_lead) then
  raise exception 'owned lead required';
 end if;
 if p_op='begin' then
  insert into public.pipeline_offer_budgets(owner_id,lead_id) values(p_owner,p_lead) on conflict(owner_id,lead_id) do nothing;
 end if;
 select * into b from public.pipeline_offer_budgets where owner_id=p_owner and lead_id=p_lead for update;
 if not found then raise exception 'budget not found'; end if;
 if p_op='status' or p_op='begin' then return jsonb_build_object('id',b.id,'chargedKurus',b.charged_kurus,'capKurus',b.cap_kurus); end if;
 select * into s from public.pipeline_offer_budget_steps where budget_id=b.id and step_key=p_step;
 if p_op='get' then return case when s.step_key is null then null else to_jsonb(s) end; end if;
 if p_op='reserve' then
  if s.step_key is not null then
   if s.input_hash<>p_hash then raise exception 'step input changed'; end if;
   -- A free coordinator may resume after a validation failure. Its nested
   -- paid reservations remain immutable, charged and individually cached.
   if s.charge_kurus=0 and p_amount=0 and s.state='uncertain' and p_token is not null then
    update public.pipeline_offer_budget_steps set state='reserved',claim_token=p_token,value=null where budget_id=b.id and step_key=p_step returning * into s;
    return jsonb_build_object('claimed',true,'step',to_jsonb(s),'chargedKurus',b.charged_kurus);
   end if;
   return jsonb_build_object('claimed',false,'step',to_jsonb(s),'chargedKurus',b.charged_kurus);
  end if;
  if p_hash !~ '^[a-f0-9]{64}$' or p_token is null or p_amount<0 or p_amount>4500 then raise exception 'invalid reservation'; end if;
  if b.charged_kurus+p_amount>5000 then return jsonb_build_object('claimed',false,'blocked',true,'chargedKurus',b.charged_kurus); end if;
  insert into public.pipeline_offer_budget_steps(budget_id,step_key,input_hash,charge_kurus,claim_token)
   values(b.id,p_step,p_hash,p_amount,p_token) returning * into s;
  update public.pipeline_offer_budgets set charged_kurus=charged_kurus+p_amount where id=b.id;
  return jsonb_build_object('claimed',true,'step',to_jsonb(s),'chargedKurus',b.charged_kurus+p_amount);
 end if;
 if p_op in ('complete','uncertain') then
  if s.step_key is null or s.claim_token<>p_token or s.input_hash<>p_hash then raise exception 'reservation ownership mismatch'; end if;
  if s.state='complete' then return to_jsonb(s); end if;
  if p_value is not null and pg_column_size(p_value)>1500000 then raise exception 'step result too large'; end if;
  if p_op='complete' and p_value ? 'accountedKurus' then
   if p_amount<0 or p_amount>s.charge_kurus or p_amount<>(p_value->>'accountedKurus')::integer then raise exception 'invalid settled usage';end if;
   update public.pipeline_offer_budgets set charged_kurus=charged_kurus-(s.charge_kurus-p_amount) where id=b.id;
   update public.pipeline_offer_budget_steps set charge_kurus=p_amount where budget_id=b.id and step_key=p_step;
  end if;
  -- Never refund a failed/ambiguous call, even after restart or timeout.
  -- The conservative pre-call ceiling stays charged for the life of this lead.
  update public.pipeline_offer_budget_steps set state=p_op,value=p_value where budget_id=b.id and step_key=p_step returning * into s;
  return to_jsonb(s);
 end if;
 raise exception 'invalid budget operation';
end $$;
revoke all on function public.pipeline_offer_production_budget_op(uuid,text,text,text,text,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pipeline_offer_production_budget_op(uuid,text,text,text,text,integer,uuid,jsonb) to service_role;

commit;
