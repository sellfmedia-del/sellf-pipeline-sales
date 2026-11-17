begin;

create table public.pipeline_offer_draft_budgets (
 owner_id uuid not null,
 lead_id text not null,
 draft_scope text not null check (draft_scope ~ '^[a-f0-9]{64}$'),
 charged_kurus integer not null default 0 check (charged_kurus between 0 and 1000),
 primary key (owner_id,lead_id,draft_scope)
);

create table public.pipeline_offer_draft_steps (
 owner_id uuid not null,
 lead_id text not null,
 draft_scope text not null,
 step_key text not null check (step_key ~ '^model:proposal_translation:[a-f0-9]{64}$'),
 input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
 claim_token uuid not null,
 charge_kurus integer not null check (charge_kurus between 0 and 1000),
 state text not null default 'reserved' check (state in ('reserved','complete','uncertain')),
 value jsonb,
 primary key (owner_id,lead_id,draft_scope,step_key),
 foreign key (owner_id,lead_id,draft_scope) references public.pipeline_offer_draft_budgets
);

alter table public.pipeline_offer_draft_budgets enable row level security;
alter table public.pipeline_offer_draft_steps enable row level security;
revoke all on public.pipeline_offer_draft_budgets,public.pipeline_offer_draft_steps from public,anon,authenticated;
grant all on public.pipeline_offer_draft_budgets,public.pipeline_offer_draft_steps to service_role;

create function public.pipeline_offer_draft_budget_op(
 p_owner uuid,p_lead text,p_scope text,p_op text,p_step text default null,p_hash text default null,
 p_amount integer default 0,p_token uuid default null,p_value jsonb default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.pipeline_offer_draft_budgets; s public.pipeline_offer_draft_steps;
begin
 if current_user<>'service_role' then raise exception 'private draft worker required'; end if;
 if not exists(select 1 from public.leads l join public.spaces a on a.id=l.space_id where l.id=p_lead and a.user_id=p_owner) then
  raise exception 'owned lead required';
 end if;
 if p_scope is null or p_scope !~ '^[a-f0-9]{64}$' then raise exception 'invalid draft scope'; end if;
 if p_op='begin' then
  insert into public.pipeline_offer_draft_budgets(owner_id,lead_id,draft_scope) values(p_owner,p_lead,p_scope) on conflict do nothing;
 end if;
 select * into b from public.pipeline_offer_draft_budgets
  where owner_id=p_owner and lead_id=p_lead and draft_scope=p_scope for update;
 if not found then raise exception 'draft budget not found'; end if;
 if p_op in ('begin','status') then return jsonb_build_object('chargedKurus',b.charged_kurus,'capKurus',1000); end if;
 if p_step is null or p_step !~ '^model:proposal_translation:[a-f0-9]{64}$' then raise exception 'invalid draft step'; end if;
 select * into s from public.pipeline_offer_draft_steps
  where owner_id=p_owner and lead_id=p_lead and draft_scope=p_scope and step_key=p_step;
 if p_op='get' then return case when s.step_key is null then null else to_jsonb(s) end; end if;
 if p_op='reserve' then
  if s.step_key is not null then
   if s.input_hash is distinct from p_hash then raise exception 'step input changed'; end if;
   return jsonb_build_object('claimed',false,'step',to_jsonb(s));
  end if;
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_token is null or p_amount is null or p_amount<0 or p_amount>4500 then
   raise exception 'invalid reservation';
  end if;
  if b.charged_kurus+p_amount>1000 then return jsonb_build_object('claimed',false,'blocked',true); end if;
  insert into public.pipeline_offer_draft_steps(owner_id,lead_id,draft_scope,step_key,input_hash,charge_kurus,claim_token)
   values(p_owner,p_lead,p_scope,p_step,p_hash,p_amount,p_token) returning * into s;
  update public.pipeline_offer_draft_budgets set charged_kurus=charged_kurus+p_amount
   where owner_id=p_owner and lead_id=p_lead and draft_scope=p_scope;
  return jsonb_build_object('claimed',true,'step',to_jsonb(s));
 end if;
 if p_op in ('complete','uncertain') then
  if s.step_key is null or s.claim_token is distinct from p_token or s.input_hash is distinct from p_hash then
   raise exception 'reservation ownership mismatch';
  end if;
  if s.state='complete' then return to_jsonb(s); end if;
  if pg_column_size(p_value)>1500000 then raise exception 'step result too large'; end if;
  if p_op='complete' then
   if p_value is null or p_amount is null or p_amount<0 or p_amount>s.charge_kurus
      or p_amount is distinct from (p_value->>'accountedKurus')::integer then raise exception 'invalid settled usage'; end if;
   update public.pipeline_offer_draft_budgets set charged_kurus=charged_kurus-(s.charge_kurus-p_amount)
    where owner_id=p_owner and lead_id=p_lead and draft_scope=p_scope;
  end if;
  update public.pipeline_offer_draft_steps set state=p_op,value=p_value,
   charge_kurus=case when p_op='complete' then p_amount else charge_kurus end
   where owner_id=p_owner and lead_id=p_lead and draft_scope=p_scope and step_key=p_step returning * into s;
  return to_jsonb(s);
 end if;
 raise exception 'invalid draft budget operation';
end $$;

revoke all on function public.pipeline_offer_draft_budget_op(uuid,text,text,text,text,text,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pipeline_offer_draft_budget_op(uuid,text,text,text,text,text,integer,uuid,jsonb) to service_role;

commit;
