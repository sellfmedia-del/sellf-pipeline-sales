-- New per-additional-offer budget worker. Existing budget rows and function remain unchanged.
begin;
create or replace function public.pipeline_offer_additional_budget_op(
 p_owner uuid,p_lead text,p_research_run uuid,p_op text,p_step text default null,p_hash text default null,
 p_amount integer default 0,p_token uuid default null,p_value jsonb default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_budget_lead text:=p_lead||':audit:'||p_research_run::text; b public.pipeline_offer_budgets; s public.pipeline_offer_budget_steps;
begin
 if current_user <> 'service_role' then raise exception 'private budget worker required'; end if;
 if not exists(select 1 from public.leads owned_lead join public.spaces owned_space on owned_space.id=owned_lead.space_id where owned_space.user_id=p_owner and owned_lead.id=p_lead) then
  raise exception 'owned lead required';
 end if;
 if p_research_run is null then raise exception 'research run required';end if;
 if p_op='begin' then
  insert into public.pipeline_offer_budgets(owner_id,lead_id) values(p_owner,v_budget_lead) on conflict(owner_id,lead_id) do nothing;
 end if;
 select * into b from public.pipeline_offer_budgets where owner_id=p_owner and lead_id=v_budget_lead for update;
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
revoke all on function public.pipeline_offer_additional_budget_op(uuid,text,uuid,text,text,text,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pipeline_offer_additional_budget_op(uuid,text,uuid,text,text,text,integer,uuid,jsonb) to service_role;

commit;
