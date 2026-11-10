-- REVIEW ONLY. Not applied. Pipeline gxngmqewskhrbxqmnpps / pvpknoqioxgyerinoecv.
-- Additive BHS-only queue. Existing budget functions/policies are not changed.
begin;
create table public.pipeline_bhs_jobs (
 id uuid primary key default gen_random_uuid(),
 mode text not null check(mode in ('preview','production')),
 owner_id uuid not null,lead_id text not null,budget_id uuid not null,budget_lead text not null,
 brief_hash text not null check(brief_hash ~ '^[a-f0-9]{64}$'),
 brief_text text not null check(octet_length(brief_text)<100000),
 spec jsonb not null check(pg_column_size(spec)<100000),
 phase text not null default 'brand_plan',
 state text not null default 'queued' check(state in ('queued','running','paused','complete','cancelled')),
 lease_token uuid,lease_until timestamptz,diagnostic jsonb,cancel_requested boolean not null default false,
 claims integer not null default 0 check(claims between 0 and 40),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(mode,budget_id,brief_hash),
 check(brief_hash=encode(sha256(convert_to(brief_text,'UTF8')),'hex'))
);
create unique index pipeline_bhs_jobs_active on public.pipeline_bhs_jobs(mode,owner_id,lead_id,brief_hash) where state in ('queued','running','paused');
create index pipeline_bhs_jobs_claim on public.pipeline_bhs_jobs(mode,created_at) where state='queued';
alter table public.pipeline_bhs_jobs enable row level security;
revoke all on public.pipeline_bhs_jobs from public,anon,authenticated;
grant select,insert,update on public.pipeline_bhs_jobs to service_role;

-- Only a fully committed current-phase receipt permits automatic acknowledgement recovery.
create function public.pipeline_bhs_checkpoint_committed(p_mode text,p_budget uuid,p_phase text,p_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare receipt_state text;checkpoint_key text:='audit:'||p_phase||':'||p_phase||'-v8'||case when p_phase in ('brand','sector','sector_correction_draft') then '-r3' when p_phase='sector_validation' then '-r4' when p_phase in ('brand_plan','brand_correction_draft','sector_sources','sector_review','sector_correction_sources','sector_correction_draft','competition_plan','competition_draft') then '-r2' else '' end||':'||p_hash;
begin
 if current_user<>'service_role' or p_mode not in ('preview','production') then raise exception 'private BHS worker required';end if;
 if p_mode='preview' then select state into receipt_state from public.pipeline_offer_preview_budget_steps where budget_id=p_budget and step_key=checkpoint_key;
 else select state into receipt_state from public.pipeline_offer_budget_steps where budget_id=p_budget and step_key=checkpoint_key;end if;
 return coalesce(receipt_state='complete',false);
end $$;
revoke all on function public.pipeline_bhs_checkpoint_committed(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.pipeline_bhs_checkpoint_committed(text,uuid,text,text) to service_role;

create function public.pipeline_bhs_job_op(p_mode text,p_op text,p_owner uuid default null,p_lead text default null,p_id uuid default null,p_token uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.pipeline_bhs_jobs;b jsonb;receipt jsonb;budget_lead text;expected text;phases text[]:=array['brand_plan','brand_sources','brand_draft','brand_review','brand_correction_sources','brand_correction_draft','brand','sector_sources','sector_draft','sector_review','sector_correction_sources','sector_correction_draft','sector','sector_validation','competition_plan','competition_sources','competition_draft','competition_review','competition_correction_sources','competition_correction_draft','competition','swot_sources','swot_draft','swot_review','swot_correction_sources','swot_correction_draft','swot','coverage_plan','coverage_sources','coverage_actors','coverage_discovery','coverage','report_draft','synthesis','scope','complete'];
begin
 if current_user<>'service_role' or p_mode not in ('preview','production') then raise exception 'private BHS worker required';end if;
 if p_op='find' then
  select * into j from public.pipeline_bhs_jobs where mode=p_mode and owner_id=p_owner and lead_id=p_lead and brief_hash=p_data->>'briefHash' and state in ('queued','running','paused') order by created_at limit 1;
  return case when found then to_jsonb(j) else null end;
 end if;
 if p_op='enqueue' then
  if p_owner is null or p_lead is null or p_data#>>'{spec,researchVersion}' is distinct from 'v8' or p_data#>>'{spec,researchModel}' is distinct from 'claude-sonnet-5-5' then raise exception 'invalid BHS job';end if;
  budget_lead:=p_lead||case when p_mode='production' and p_data#>>'{spec,researchRunId}' is not null then ':audit:'||(p_data#>>'{spec,researchRunId}')::uuid::text else '' end;
  if p_mode='production' then select to_jsonb(x) into b from public.pipeline_offer_budgets x where x.owner_id=p_owner and x.lead_id=budget_lead for update;
  else select to_jsonb(x) into b from public.pipeline_offer_preview_budgets x where x.owner_id=p_owner and x.lead_id=budget_lead for update;end if;
  if b is null or b->>'id' is distinct from p_data->>'budgetId' or b->>'cap_kurus' is distinct from '5000' then raise exception 'BHS budget binding mismatch';end if;
  insert into public.pipeline_bhs_jobs(mode,owner_id,lead_id,budget_id,budget_lead,brief_hash,brief_text,spec)
   values(p_mode,p_owner,p_lead,(b->>'id')::uuid,budget_lead,p_data->>'briefHash',p_data->>'briefText',p_data->'spec') on conflict do nothing;
  select * into j from public.pipeline_bhs_jobs where mode=p_mode and owner_id=p_owner and lead_id=p_lead and brief_hash=p_data->>'briefHash' and (budget_id=(b->>'id')::uuid or state in ('queued','running','paused')) order by created_at limit 1;
  if not found then raise exception 'BHS enqueue conflict';end if;return to_jsonb(j);
 end if;
 if p_op='claim' then
  if p_token is null then raise exception 'BHS lease required';end if;
  -- Recover the ack only when the phase is already committed; uncertain paid work stays paused.
  update public.pipeline_bhs_jobs set state=case when cancel_requested then 'cancelled' when public.pipeline_bhs_checkpoint_committed(mode,budget_id,phase,brief_hash) then 'queued' else 'paused' end,diagnostic='{"code":"lease_expired"}',lease_token=null,lease_until=null,updated_at=now() where mode=p_mode and state='running' and lease_until<=now();
  update public.pipeline_bhs_jobs set state='paused',diagnostic='{"code":"job_execution_limit"}',updated_at=now() where mode=p_mode and state='queued' and (claims>=40 or created_at<now()-interval '2 hours');
  select * into j from public.pipeline_bhs_jobs where mode=p_mode and state='queued' order by created_at for update skip locked limit 1;
  if not found then return null;end if;
  update public.pipeline_bhs_jobs set state='running',lease_token=p_token,lease_until=now()+interval '6 minutes',claims=claims+1,updated_at=now() where id=j.id returning * into j;return to_jsonb(j);
 end if;
 select * into j from public.pipeline_bhs_jobs where id=p_id and mode=p_mode for update;
 if not found then raise exception 'BHS job not found';end if;
 if p_op in ('read','cancel') then
  if j.owner_id is distinct from p_owner or j.lead_id is distinct from p_lead then raise exception 'BHS owner mismatch';end if;
  if p_op='cancel' then
   if j.state='running' then update public.pipeline_bhs_jobs set cancel_requested=true,updated_at=now() where id=j.id returning * into j;
   elsif j.state<>'complete' then update public.pipeline_bhs_jobs set state='cancelled',lease_token=null,lease_until=null,updated_at=now() where id=j.id returning * into j;end if;
  end if;return to_jsonb(j);
 end if;
 if j.state<>'running' or j.lease_token is distinct from p_token or j.lease_until<=now() then raise exception 'BHS lease mismatch';end if;
 if p_op='pause' then
  update public.pipeline_bhs_jobs set state=case when cancel_requested then 'cancelled' when public.pipeline_bhs_checkpoint_committed(mode,budget_id,phase,brief_hash) then 'queued' else 'paused' end,diagnostic=jsonb_build_object('code',left(coalesce(p_data->>'code','worker_unavailable'),80)),lease_token=null,lease_until=null,updated_at=now() where id=j.id returning * into j;return to_jsonb(j);
 end if;
 if p_op='budget' then
  if p_data->>'op' not in ('status','get','reserve','complete','uncertain') then raise exception 'invalid BHS budget operation';end if;
  if j.cancel_requested and p_data->>'op'='reserve' then raise exception 'BHS cancellation requested';end if;
  if p_mode='preview' then return public.pipeline_offer_budget_op(j.owner_id,j.lead_id,p_data->>'op',p_data->>'step',p_data->>'hash',coalesce((p_data->>'amount')::integer,0),(p_data->>'token')::uuid,p_data->'value');
  elsif j.spec->>'researchRunId' is not null then return public.pipeline_offer_additional_budget_op(j.owner_id,j.lead_id,(j.spec->>'researchRunId')::uuid,p_data->>'op',p_data->>'step',p_data->>'hash',coalesce((p_data->>'amount')::integer,0),(p_data->>'token')::uuid,p_data->'value');
  else return public.pipeline_offer_production_budget_op(j.owner_id,j.lead_id,p_data->>'op',p_data->>'step',p_data->>'hash',coalesce((p_data->>'amount')::integer,0),(p_data->>'token')::uuid,p_data->'value');end if;
 end if;
 if p_op='advance' then
  expected:=phases[array_position(phases,j.phase)+1];
  if expected is null or p_data->>'nextPhase' is distinct from expected or p_data->>'checkpointKey' is distinct from ('audit:'||j.phase||':'||j.phase||'-v8'||case when j.phase in ('brand','sector','sector_correction_draft') then '-r3' when j.phase='sector_validation' then '-r4' when j.phase in ('brand_plan','brand_correction_draft','sector_sources','sector_review','sector_correction_sources','sector_correction_draft','competition_plan','competition_draft') then '-r2' else '' end||':'||j.brief_hash) then raise exception 'BHS checkpoint mismatch';end if;
  if p_mode='preview' then select to_jsonb(s) into receipt from public.pipeline_offer_preview_budget_steps s where s.budget_id=j.budget_id and s.step_key=p_data->>'checkpointKey';
  else select to_jsonb(s) into receipt from public.pipeline_offer_budget_steps s where s.budget_id=j.budget_id and s.step_key=p_data->>'checkpointKey';end if;
  if receipt->>'state' is distinct from 'complete' then raise exception 'BHS checkpoint not committed';end if;
  update public.pipeline_bhs_jobs set phase=expected,state=case when cancel_requested then 'cancelled' when expected='complete' then 'complete' else 'queued' end,lease_token=null,lease_until=null,updated_at=now() where id=j.id returning * into j;return to_jsonb(j);
 end if;
 raise exception 'invalid BHS queue operation';
end $$;
revoke all on function public.pipeline_bhs_job_op(text,text,uuid,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pipeline_bhs_job_op(text,text,uuid,text,uuid,uuid,jsonb) to service_role;
commit;
-- Rollback: disable BHS worker/scheduler first; export new job rows.
-- drop function public.pipeline_bhs_job_op(text,text,uuid,text,uuid,uuid,jsonb);
-- drop table public.pipeline_bhs_jobs;
-- drop function public.pipeline_bhs_checkpoint_committed(text,uuid,text,text);
-- Existing BHS results, paid receipts, offers and all CRM data remain intact.
