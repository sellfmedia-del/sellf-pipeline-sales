-- Pipeline gxngmqewskhrbxqmnpps, for isolated verification and separate rollout.
-- Reuse the installed queue RPC and lease contract. No data migration or budget rewrite.
begin;
alter function public.pipeline_bhs_job_op(text,text,uuid,text,uuid,uuid,jsonb)
 rename to pipeline_bhs_job_op_before_compact;

create function public.pipeline_bhs_job_op(p_mode text,p_op text,p_owner uuid default null,p_lead text default null,p_id uuid default null,p_token uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 j public.pipeline_bhs_jobs;
 claimed jsonb;
 receipt jsonb;
 checkpoint text;
begin
 if current_user<>'service_role' or p_mode not in ('preview','production') then raise exception 'private BHS worker required';end if;
 if p_op='claim' then
  claimed:=public.pipeline_bhs_job_op_before_compact(p_mode,p_op,p_owner,p_lead,p_id,p_token,p_data);
  return case when claimed is null then null else claimed||'{"compact_queue":true}'::jsonb end;
 end if;
 if p_op='advance' and p_data->>'nextPhase'='report_draft' then
  select * into j from public.pipeline_bhs_jobs where id=p_id and mode=p_mode for update;
  if j.phase='sector_sources' then
   if j.state<>'running' or p_token is null or j.lease_token is distinct from p_token or j.lease_until<=now() then raise exception 'BHS lease mismatch';end if;
   checkpoint:='audit:sector_sources:sector_sources-v8-r3:'||j.brief_hash;
   if p_data->>'checkpointKey' is distinct from checkpoint then raise exception 'BHS checkpoint mismatch';end if;
   if p_mode='preview' then
    select to_jsonb(s) into receipt from public.pipeline_offer_preview_budget_steps s where s.budget_id=j.budget_id and s.step_key=checkpoint;
   else
    select to_jsonb(s) into receipt from public.pipeline_offer_budget_steps s where s.budget_id=j.budget_id and s.step_key=checkpoint;
   end if;
   if receipt->>'state' is distinct from 'complete' or receipt->>'charge_kurus' is distinct from '0'
    or receipt#>>'{value,phase}' is distinct from 'sector_sources' or receipt#>>'{value,decision}' is distinct from 'accepted'
    or receipt#>'{value,collectionFirst}' is distinct from 'true'::jsonb
    or receipt#>'{value,managedPlan,compactQueue}' is distinct from 'true'::jsonb
    or receipt#>'{value,managedPlan,adaptiveResearch}' is distinct from 'true'::jsonb
    or receipt#>'{value,managedPlan,reportOnlyAfterResearch}' is distinct from 'true'::jsonb
    or jsonb_typeof(receipt#>'{value,managedPlan,needs}') is distinct from 'array'
    or receipt#>'{value,managedPlan,needs}'='[]'::jsonb then
    raise exception 'BHS compact research plan not committed';
   end if;
   update public.pipeline_bhs_jobs set phase='report_draft',state=case when cancel_requested then 'cancelled' else 'queued' end,
    lease_token=null,lease_until=null,updated_at=now() where id=j.id returning * into j;
   return to_jsonb(j);
  end if;
 end if;
 return public.pipeline_bhs_job_op_before_compact(p_mode,p_op,p_owner,p_lead,p_id,p_token,p_data);
end $$;
revoke all on function public.pipeline_bhs_job_op(text,text,uuid,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pipeline_bhs_job_op(text,text,uuid,text,uuid,uuid,jsonb) to service_role;
commit;

-- Rollback after jobs using compact plans have finished if reverting the app too.
-- begin;
-- drop function public.pipeline_bhs_job_op(text,text,uuid,text,uuid,uuid,jsonb);
-- alter function public.pipeline_bhs_job_op_before_compact(text,text,uuid,text,uuid,uuid,jsonb) rename to pipeline_bhs_job_op;
-- commit;
