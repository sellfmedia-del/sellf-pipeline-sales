-- Review and isolated verification only. Pipeline project gxngmqewskhrbxqmnpps.
-- Deploy separately from the application. An unmodified RPC keeps single-phase
-- advances. No credentials, schema backfill or changes to existing budget rows.
begin;
alter function public.pipeline_bhs_job_op(text,text,uuid,text,uuid,uuid,jsonb)
 rename to pipeline_bhs_job_op_single;

create function public.pipeline_bhs_job_op(p_mode text,p_op text,p_owner uuid default null,p_lead text default null,p_id uuid default null,p_token uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 j public.pipeline_bhs_jobs;
 receipt jsonb;
 phase_name text;
 checkpoint text;
 inventory constant text[]:=array['competition_correction_draft','competition','swot_sources','swot_draft','swot_review','swot_correction_sources','swot_correction_draft','swot'];
begin
 if current_user<>'service_role' or p_mode not in ('preview','production') then raise exception 'private BHS worker required';end if;
 if p_op='claim' then
  return public.pipeline_bhs_job_op_single(p_mode,p_op,p_owner,p_lead,p_id,p_token,p_data)||'{"inventory_batch":true}'::jsonb;
 end if;
 if p_op='advance' and p_data->>'nextPhase'='coverage_plan' then
  select * into j from public.pipeline_bhs_jobs where id=p_id and mode=p_mode for update;
  if j.phase=any(inventory) and j.phase<>'swot' then
   if j.state<>'running' or p_token is null or j.lease_token is distinct from p_token or j.lease_until<=now() then raise exception 'BHS lease mismatch';end if;
   if p_data->>'checkpointKey' is distinct from ('audit:'||j.phase||':'||j.phase||'-v8:'||j.brief_hash) then raise exception 'BHS checkpoint mismatch';end if;
   foreach phase_name in array inventory[array_position(inventory,j.phase):] loop
    checkpoint:='audit:'||phase_name||':'||phase_name||'-v8:'||j.brief_hash;
    if p_mode='preview' then
     select to_jsonb(s) into receipt from public.pipeline_offer_preview_budget_steps s where s.budget_id=j.budget_id and s.step_key=checkpoint;
    else
     select to_jsonb(s) into receipt from public.pipeline_offer_budget_steps s where s.budget_id=j.budget_id and s.step_key=checkpoint;
    end if;
    if receipt->>'state' is distinct from 'complete' or receipt->>'charge_kurus' is distinct from '0'
     or receipt#>>'{value,phase}' is distinct from phase_name
     or receipt#>'{value,collectionFirst}' is distinct from 'true'::jsonb
     or receipt#>>'{value,decision}' is distinct from 'accepted'
     or receipt#>'{value,toolIssues}' is distinct from '["budget_limit"]'::jsonb then
     raise exception 'BHS skipped inventory checkpoint not committed';
    end if;
   end loop;
   update public.pipeline_bhs_jobs set phase='coverage_plan',state=case when cancel_requested then 'cancelled' else 'queued' end,
    lease_token=null,lease_until=null,updated_at=now() where id=j.id returning * into j;
   return to_jsonb(j);
  end if;
 end if;
 return public.pipeline_bhs_job_op_single(p_mode,p_op,p_owner,p_lead,p_id,p_token,p_data);
end $$;
revoke all on function public.pipeline_bhs_job_op(text,text,uuid,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pipeline_bhs_job_op(text,text,uuid,text,uuid,uuid,jsonb) to service_role;
commit;

-- Rollback in one transaction.
-- drop function public.pipeline_bhs_job_op(text,text,uuid,text,uuid,uuid,jsonb);
-- alter function public.pipeline_bhs_job_op_single(text,text,uuid,text,uuid,uuid,jsonb) rename to pipeline_bhs_job_op;
