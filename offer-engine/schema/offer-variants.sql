-- Additive workers only. No backfill, card, existing offer or Travis writes.
begin;
create table public.pipeline_offer_price_history (
 id uuid primary key default gen_random_uuid(),
 offer_id uuid not null references public.pipeline_offer_versions(id),
 owner_id uuid not null,request_id uuid not null,
 currency text not null check(currency in ('TRY','USD')),
 before_prices jsonb not null,after_prices jsonb not null,
 below_minimum_confirmed boolean not null,created_at timestamptz not null default now(),
 unique(owner_id,request_id)
);
create index pipeline_offer_price_history_offer_idx on public.pipeline_offer_price_history(offer_id,created_at desc);
alter table public.pipeline_offer_price_history enable row level security;
revoke all on public.pipeline_offer_price_history from public,anon,authenticated;
grant all on public.pipeline_offer_price_history to service_role;

create function public.update_pipeline_offer_prices(p_owner uuid,p_offer uuid,p_request uuid,p_expected jsonb,p_amounts jsonb,p_confirm boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
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
end $$;
revoke all on function public.update_pipeline_offer_prices(uuid,uuid,uuid,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.update_pipeline_offer_prices(uuid,uuid,uuid,jsonb,jsonb,boolean) to service_role;

create function public.save_pipeline_offer_variant(p_owner uuid,p_source_offer uuid,p_lead_id text,p_space_id text,p_request_id text,p_document jsonb,p_pricing jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
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
end $$;
revoke all on function public.save_pipeline_offer_variant(uuid,uuid,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_pipeline_offer_variant(uuid,uuid,text,text,text,jsonb,jsonb) to service_role;

-- Merge publication into the locked current document, so simultaneous price
-- and publication requests cannot overwrite one another's document changes.
create function public.publish_pipeline_offer_link(p_owner uuid,p_offer uuid,p_slug text,p_expected_envelope text,p_token_hash text,p_password_hash text,p_envelope text)
returns jsonb language plpgsql security invoker set search_path='' as $$
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
end $$;
revoke all on function public.publish_pipeline_offer_link(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.publish_pipeline_offer_link(uuid,uuid,text,text,text,text,text) to service_role;
commit;
