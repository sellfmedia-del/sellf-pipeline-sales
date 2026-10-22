begin;
CREATE OR REPLACE FUNCTION public.publish_pipeline_offer_link(p_owner uuid, p_offer uuid, p_slug text, p_expected_envelope text, p_token_hash text, p_password_hash text, p_envelope text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v public.pipeline_offer_versions;
begin
 if current_user<>'service_role' then raise exception 'private offer worker required';end if;
 select * into v from public.pipeline_offer_versions where id=p_offer and owner_id=p_owner for update;
 if not found or not exists(select 1 from public.leads l join public.spaces s on s.id=l.space_id where l.id=v.lead_id and s.user_id=p_owner) then raise exception 'Offer not owned';end if;
 if v.operator_link_envelope is distinct from p_expected_envelope then return '[]'::jsonb;end if;
 if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*-teklifi(-v[0-9]+-[a-f0-9]+)?$' or p_token_hash !~ '^[a-f0-9]{64}$' or p_password_hash !~ '^[a-f0-9]{64}$' or p_envelope is null then raise exception 'Invalid publication';end if;
 update public.pipeline_offer_versions set state='published',public_token_hash=p_token_hash,password_hash=p_password_hash,operator_link_envelope=p_envelope,
 customer_document=jsonb_set(customer_document,'{publication}',jsonb_build_object('slug',p_slug)) where id=p_offer;
 return jsonb_build_array(jsonb_build_object('id',v.id,'version',v.version));
end $function$
;
CREATE OR REPLACE FUNCTION public.save_pipeline_offer_variant(p_owner uuid, p_source_offer uuid, p_lead_id text, p_space_id text, p_request_id text, p_document jsonb, p_pricing jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v public.pipeline_offer_versions;n integer;amount numeric;
begin
 if current_user<>'service_role' then raise exception 'private offer worker required';end if;
 if p_owner is null or p_request_id is null or length(p_request_id) not between 16 and 80 then raise exception 'Invalid request';end if;
 perform l.id from public.leads l join public.spaces s on s.id=l.space_id
 where l.id=p_lead_id and l.space_id=p_space_id and s.user_id=p_owner for update of l;
 if not found or not exists(select 1 from public.pipeline_offer_versions where id=p_source_offer and owner_id=p_owner and lead_id=p_lead_id and space_id=p_space_id) then raise exception 'Source not owned';end if;
 if p_pricing->>'sourceOfferId' is distinct from p_source_offer::text then raise exception 'Source changed';end if;
 -- An input fingerprint is an idempotency comparison, never authorization.
 p_pricing:=p_pricing||jsonb_build_object('savedDocumentFingerprint',md5(p_document::text));
 select * into v from public.pipeline_offer_versions where owner_id=p_owner and request_id=p_request_id;
 if found then
  if v.lead_id<>p_lead_id or v.space_id<>p_space_id or v.pricing_snapshot<>p_pricing then raise exception 'Request changed';end if;
  -- Publication and negotiated prices can change after a successful save.
  return jsonb_build_object('id',v.id,'version',v.version,'monthlyAmount',v.monthly_amount,'state',v.state,'reused',true);
 end if;
 if p_document->>'schemaVersion' is distinct from 'proposal-v1'
 or jsonb_typeof(p_document->'alternatives') is distinct from 'array' or jsonb_array_length(p_document->'alternatives')<>2
 or p_document#>>'{alternatives,0,id}' is distinct from 'growth_operations'
 or p_document#>>'{alternatives,1,id}' is distinct from 'operations_bundle'
 or p_document#>>'{logo,reviewed}' is distinct from 'true' then raise exception 'Invalid offer';end if;
 select (a->>'monthlyAmount')::numeric into amount from jsonb_array_elements(p_document->'alternatives') a where a->>'id'=p_document->>'recommendedAlternativeId';
 if amount is null or amount<0 then raise exception 'Invalid amount';end if;
 if exists(select 1 from jsonb_array_elements(p_document->'alternatives') a where not exists(select 1 from jsonb_array_elements(p_pricing->'alternatives') b where a->>'id'=b->>'id' and (a->>'monthlyAmount')::numeric=(b->>'monthlyAmount')::numeric)) then raise exception 'Price changed';end if;
 select coalesce(max(version),0)+1 into n from public.pipeline_offer_versions where lead_id=p_lead_id;
 insert into public.pipeline_offer_versions(owner_id,space_id,lead_id,version,request_id,customer_document,pricing_snapshot,monthly_amount)
 values(p_owner,p_space_id,p_lead_id,n,p_request_id,p_document,p_pricing,amount) returning * into v;
 return jsonb_build_object('id',v.id,'version',v.version,'monthlyAmount',amount,'state',v.state,'reused',false);
end $function$
;
CREATE OR REPLACE FUNCTION public.update_pipeline_offer_prices(p_owner uuid, p_offer uuid, p_request uuid, p_expected jsonb, p_amounts jsonb, p_confirm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v public.pipeline_offer_versions; h public.pipeline_offer_price_history;
 d jsonb;before_prices jsonb:='{}';currency text;rate numeric;usd numeric;amount numeric;minimum numeric;key text;i integer;
begin
 if current_user<>'service_role' then raise exception 'private offer worker required';end if;
 if p_owner is null or p_request is null then raise exception 'Invalid request';end if;
 select * into v from public.pipeline_offer_versions where id=p_offer and owner_id=p_owner for update;
 if not found or not exists(select 1 from public.leads l join public.spaces s on s.id=l.space_id where l.id=v.lead_id and s.user_id=p_owner) then raise exception 'Offer not owned';end if;
 select * into h from public.pipeline_offer_price_history where owner_id=p_owner and request_id=p_request;
 if found then
  if h.offer_id<>p_offer or h.after_prices<>p_amounts or h.below_minimum_confirmed<>p_confirm then raise exception 'Request changed';end if;
  return jsonb_build_object('id',v.id,'reused',true);
 end if;
 if v.customer_document<>p_expected then raise exception 'Offer changed';end if;
 if jsonb_typeof(p_amounts) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_amounts))<>2
  or not(p_amounts ?& array['growth_operations','operations_bundle']) then raise exception 'Invalid amounts';end if;
 d:=v.customer_document;currency:=coalesce(d#>>'{quote,currency}','TRY');
 if currency not in ('TRY','USD') then raise exception 'Invalid currency';end if;
 if currency='USD' then
  if d#>>'{quote,status}' is distinct from 'ready' then raise exception 'Invalid FX';end if;
  rate:=(d#>>'{quote,exchangeRate,rate}')::numeric;
  if rate is null or rate<=0 or rate>10000 then raise exception 'Invalid FX';end if;
 end if;
 for i in 0..1 loop
  key:=case i when 0 then 'growth_operations' else 'operations_bundle' end;
  if d#>>array['alternatives',i::text,'id'] is distinct from key or p_amounts->>key !~ '^\d{1,10}(\.\d{1,2})?$' then raise exception 'Invalid amount';end if;
  usd:=(p_amounts->>key)::numeric;
  if usd is null or usd<=0 or usd>10000000000 then raise exception 'Invalid amount';end if;
  select (a->>'minimumAmount')::numeric into minimum from jsonb_array_elements(v.pricing_snapshot->'alternatives') a where a->>'id'=key;
  if minimum is null then raise exception 'Pricing missing';end if;
  if currency='USD' then
   minimum:=ceil(minimum*100/rate)/100;
   before_prices:=before_prices||jsonb_build_object(key,(d#>>array['quote','alternatives',i::text,'monthlyAmount'])::numeric);
   amount:=floor(usd*100*rate)/100;
   if ceil(amount*100/rate)/100<>usd then raise exception 'Unrepresentable USD amount';end if;
   d:=jsonb_set(d,array['quote','alternatives',i::text,'monthlyAmount'],to_jsonb(usd));
  else
   before_prices:=before_prices||jsonb_build_object(key,(d#>>array['alternatives',i::text,'monthlyAmount'])::numeric);amount:=usd;
  end if;
  if usd<minimum and not coalesce(p_confirm,false) then raise exception 'Below minimum confirmation required';end if;
  d:=jsonb_set(d,array['alternatives',i::text,'monthlyAmount'],to_jsonb(amount));
 end loop;
 select (a->>'monthlyAmount')::numeric into amount from jsonb_array_elements(d->'alternatives') a where a->>'id'=d->>'recommendedAlternativeId';
 if d ? 'valueSync' then d:=jsonb_set(d,'{valueSync,amount}',to_jsonb(amount));end if;
 update public.pipeline_offer_versions set customer_document=d,monthly_amount=amount where id=p_offer;
 insert into public.pipeline_offer_price_history(offer_id,owner_id,request_id,currency,before_prices,after_prices,below_minimum_confirmed)
 values(p_offer,p_owner,p_request,currency,before_prices,p_amounts,p_confirm);
 return jsonb_build_object('id',p_offer,'reused',false);
end $function$
;
CREATE OR REPLACE FUNCTION public.save_pipeline_offer_production(p_owner uuid, p_lead_id text, p_space_id text, p_request_id text, p_document jsonb, p_pricing jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.pipeline_offer_additional_budget_op(p_owner uuid, p_lead text, p_research_run uuid, p_op text, p_step text DEFAULT NULL::text, p_hash text DEFAULT NULL::text, p_amount integer DEFAULT 0, p_token uuid DEFAULT NULL::uuid, p_value jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.pipeline_offer_production_budget_op(p_owner uuid, p_lead text, p_op text, p_step text DEFAULT NULL::text, p_hash text DEFAULT NULL::text, p_amount integer DEFAULT 0, p_token uuid DEFAULT NULL::uuid, p_value jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$
;
drop trigger if exists pipeline_preserve_space_creator on public.spaces;
drop function if exists public.pipeline_preserve_space_creator();
drop function if exists public.pipeline_offer_team_user(uuid);
revoke select(id,is_anonymous,raw_app_meta_data,deleted_at) on auth.users from service_role;
commit;

