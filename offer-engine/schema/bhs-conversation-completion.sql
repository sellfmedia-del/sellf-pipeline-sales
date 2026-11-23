-- Review separately before applying to the Pipeline queue database.
-- Install after the existing queue function and its wrappers. The gateway,
-- scheduler, tables, roles and budget operations retain their contracts.
begin;
alter function public.pipeline_bhs_job_op(text,text,uuid,text,uuid,uuid,jsonb)
 rename to pipeline_bhs_job_op_before_conversation_completion;

create function public.pipeline_bhs_job_op(p_mode text,p_op text,p_owner uuid default null,p_lead text default null,p_id uuid default null,p_token uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 j public.pipeline_bhs_jobs;
 claimed jsonb;
 policy jsonb;
 result jsonb;
 checkpoint text;
begin
 if current_user<>'service_role' or p_mode not in ('preview','production') then raise exception 'private BHS worker required';end if;
 if p_op='claim' then
  claimed:=public.pipeline_bhs_job_op_before_conversation_completion(p_mode,p_op,p_owner,p_lead,p_id,p_token,p_data);
  return case when claimed is null then null else claimed||'{"conversation_completion":true}'::jsonb end;
 end if;
 if p_op='advance' and p_data->>'nextPhase'='complete' and p_data->>'checkpointKey' like 'audit:conversation:result:%' then
  select * into j from public.pipeline_bhs_jobs where id=p_id and mode=p_mode for update;
  if not found or j.state<>'running' or p_token is null or j.lease_token is distinct from p_token or j.lease_until<=now() then
   raise exception 'BHS lease mismatch';
  end if;
  checkpoint:='audit:conversation:result:'||j.brief_hash;
  if p_data->>'checkpointKey' is distinct from checkpoint or
     not public.pipeline_bhs_checkpoint_committed(p_mode,j.budget_id,j.phase,j.brief_hash) then
   raise exception 'BHS checkpoint mismatch';
  end if;

  -- Use the current queue's budget binding for both preview and production,
  -- including additional research runs. All reads use this lease and job.
  policy:=public.pipeline_bhs_job_op_before_conversation_completion(p_mode,'budget',null,null,j.id,p_token,
   jsonb_build_object('op','get','step','audit:conversation:policy:'||j.brief_hash));
  if policy->>'state' is distinct from 'complete' or policy->>'charge_kurus' is distinct from '0' or
     policy#>>'{value,engine}' is distinct from 'sellf-bhs-conversation-2026-11-20' then
   raise exception 'BHS conversation policy not committed';
  end if;
  result:=public.pipeline_bhs_job_op_before_conversation_completion(p_mode,'budget',null,null,j.id,p_token,
   jsonb_build_object('op','get','step',checkpoint));
  if result->>'state' is distinct from 'complete' then
   result:=public.pipeline_bhs_job_op_before_conversation_completion(p_mode,'budget',null,null,j.id,p_token,
    jsonb_build_object('op','get','step',checkpoint||':recovered'));
  end if;
  if result->>'state' is distinct from 'complete' or result->>'charge_kurus' is distinct from '0' or
     jsonb_typeof(result#>'{value,researchContext,brief}') is distinct from 'object' or
     jsonb_typeof(result#>'{value,researchedAt}') is distinct from 'string' or
     jsonb_typeof(result#>'{value,conversationSources}') is distinct from 'array' then
   raise exception 'BHS conversation result not committed';
  end if;

  update public.pipeline_bhs_jobs set phase='complete',state=case when cancel_requested then 'cancelled' else 'complete' end,
   lease_token=null,lease_until=null,updated_at=now() where id=j.id returning * into j;
  return to_jsonb(j);
 end if;
 return public.pipeline_bhs_job_op_before_conversation_completion(p_mode,p_op,p_owner,p_lead,p_id,p_token,p_data);
end $$;
revoke all on function public.pipeline_bhs_job_op(text,text,uuid,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pipeline_bhs_job_op(text,text,uuid,text,uuid,uuid,jsonb) to service_role;
commit;

-- Rollback: roll back the app or allow current worker leases to finish first.
-- Existing complete jobs and ledger records stay available.
-- begin;
-- drop function public.pipeline_bhs_job_op(text,text,uuid,text,uuid,uuid,jsonb);
-- alter function public.pipeline_bhs_job_op_before_conversation_completion(text,text,uuid,text,uuid,uuid,jsonb) rename to pipeline_bhs_job_op;
-- commit;
