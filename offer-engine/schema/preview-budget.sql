-- Preview-only accounting. No CRM/Travis table is modified.
create table if not exists public.pipeline_offer_preview_budgets (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null,
 lead_id text not null, cap_kurus integer not null default 5000 check(cap_kurus=5000),
 charged_kurus integer not null default 500 check(charged_kurus between 500 and 5000),
 created_at timestamptz not null default now(), unique(owner_id,lead_id)
);
create table if not exists public.pipeline_offer_preview_budget_steps (
 budget_id uuid not null references public.pipeline_offer_preview_budgets(id),
 step_key text not null check(length(step_key) between 1 and 160),
 input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
 charge_kurus integer not null check(charge_kurus between 0 and 4500),
 claim_token uuid not null, state text not null default 'reserved' check(state in ('reserved','complete','uncertain')),
 value jsonb, created_at timestamptz not null default now(),
 primary key(budget_id,step_key)
);
alter table public.pipeline_offer_preview_budgets enable row level security;
alter table public.pipeline_offer_preview_budget_steps enable row level security;
revoke all on public.pipeline_offer_preview_budgets, public.pipeline_offer_preview_budget_steps from public,anon,authenticated;
grant all on public.pipeline_offer_preview_budgets, public.pipeline_offer_preview_budget_steps to service_role;

create or replace function public.pipeline_offer_budget_op(
 p_owner uuid,p_lead text,p_op text,p_step text default null,p_hash text default null,
 p_amount integer default 0,p_token uuid default null,p_value jsonb default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.pipeline_offer_preview_budgets; s public.pipeline_offer_preview_budget_steps;
begin
 if current_user <> 'service_role' then raise exception 'private budget worker required'; end if;
 if not exists(select 1 from public.pipeline_offer_preview_leads where owner_id=p_owner and id=p_lead) then
  raise exception 'preview lead required';
 end if;
 if p_op='begin' then
  insert into public.pipeline_offer_preview_budgets(owner_id,lead_id) values(p_owner,p_lead) on conflict(owner_id,lead_id) do nothing;
 end if;
 select * into b from public.pipeline_offer_preview_budgets where owner_id=p_owner and lead_id=p_lead for update;
 if not found then raise exception 'budget not found'; end if;
 if p_op='status' or p_op='begin' then return jsonb_build_object('id',b.id,'chargedKurus',b.charged_kurus,'capKurus',b.cap_kurus); end if;
 select * into s from public.pipeline_offer_preview_budget_steps where budget_id=b.id and step_key=p_step;
 if p_op='get' then return case when s.step_key is null then null else to_jsonb(s) end; end if;
 if p_op='reserve' then
  if s.step_key is not null then
   if s.input_hash<>p_hash then raise exception 'step input changed'; end if;
   -- A free coordinator may resume after a validation failure. Its nested
   -- paid reservations remain immutable, charged and individually cached.
   if s.charge_kurus=0 and p_amount=0 and s.state='uncertain' and p_token is not null then
    update public.pipeline_offer_preview_budget_steps set state='reserved',claim_token=p_token,value=null where budget_id=b.id and step_key=p_step returning * into s;
    return jsonb_build_object('claimed',true,'step',to_jsonb(s),'chargedKurus',b.charged_kurus);
   end if;
   return jsonb_build_object('claimed',false,'step',to_jsonb(s),'chargedKurus',b.charged_kurus);
  end if;
  if p_hash !~ '^[a-f0-9]{64}$' or p_token is null or p_amount<0 or p_amount>4500 then raise exception 'invalid reservation'; end if;
  if b.charged_kurus+p_amount>5000 then return jsonb_build_object('claimed',false,'blocked',true,'chargedKurus',b.charged_kurus); end if;
  insert into public.pipeline_offer_preview_budget_steps(budget_id,step_key,input_hash,charge_kurus,claim_token)
   values(b.id,p_step,p_hash,p_amount,p_token) returning * into s;
  update public.pipeline_offer_preview_budgets set charged_kurus=charged_kurus+p_amount where id=b.id;
  return jsonb_build_object('claimed',true,'step',to_jsonb(s),'chargedKurus',b.charged_kurus+p_amount);
 end if;
 if p_op in ('complete','uncertain') then
  if s.step_key is null or s.claim_token<>p_token or s.input_hash<>p_hash then raise exception 'reservation ownership mismatch'; end if;
  if s.state='complete' then return to_jsonb(s); end if;
  if p_value is not null and pg_column_size(p_value)>1500000 then raise exception 'step result too large'; end if;
  -- Never refund a failed/ambiguous call, even after restart or timeout.
  -- The conservative pre-call ceiling stays charged for the life of this lead.
  update public.pipeline_offer_preview_budget_steps set state=p_op,value=p_value where budget_id=b.id and step_key=p_step returning * into s;
  return to_jsonb(s);
 end if;
 raise exception 'invalid budget operation';
end $$;
revoke all on function public.pipeline_offer_budget_op(uuid,text,text,text,text,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pipeline_offer_budget_op(uuid,text,text,text,text,integer,uuid,jsonb) to service_role;
