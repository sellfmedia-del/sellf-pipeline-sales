-- REVIEW ONLY: not applied. Sellf Pipeline / Preview only.
-- Project gxngmqewskhrbxqmnpps, organization pvpknoqioxgyerinoecv.
-- Creates one NEW queue; existing CRM, budgets, RLS and functions are untouched.
begin;
create table public.pipeline_bhs_preview_jobs (
 id uuid primary key default gen_random_uuid(),
 budget_id uuid not null references public.pipeline_offer_preview_budgets(id),
 input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
 spec jsonb not null check(pg_column_size(spec)<100000),
 phase text not null default 'source_plan' check(phase in ('source_plan','evidence','workers','review','correction','synthesis','scope','complete')),
 state text not null default 'queued' check(state in ('queued','running','paused','complete','cancelled')),
 lease_token uuid, lease_until timestamptz, diagnostic jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(budget_id,input_hash)
);
-- Private worker queue. Client roles receive no table privileges or policies.
create policy pipeline_bhs_preview_jobs_worker on public.pipeline_bhs_preview_jobs
 for all to service_role using (true) with check (true);
alter table public.pipeline_bhs_preview_jobs enable row level security;
revoke all on public.pipeline_bhs_preview_jobs from public,anon,authenticated;
grant select,insert,update on public.pipeline_bhs_preview_jobs to service_role;
create index pipeline_bhs_preview_jobs_queue on public.pipeline_bhs_preview_jobs(created_at) where state='queued';

create function public.pipeline_bhs_preview_job_claim(p_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.pipeline_bhs_preview_jobs;
begin
 if current_user<>'service_role' or p_token is null then raise exception 'private BHS worker required'; end if;
 -- A killed worker is surfaced for review. Never blindly replay a paid call.
 update public.pipeline_bhs_preview_jobs set state='paused',diagnostic='{"code":"lease_expired"}',updated_at=now()
 where state='running' and lease_until<now();
 select * into j from public.pipeline_bhs_preview_jobs where state='queued' order by created_at for update skip locked limit 1;
 if not found then return null;end if;
 update public.pipeline_bhs_preview_jobs set state='running',lease_token=p_token,lease_until=now()+interval '6 minutes',updated_at=now() where id=j.id returning * into j;
 return to_jsonb(j);
end $$;

create function public.pipeline_bhs_preview_job_advance(p_id uuid,p_token uuid,p_next text,p_checkpoint text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.pipeline_bhs_preview_jobs; expected text;
begin
 if current_user<>'service_role' then raise exception 'private BHS worker required';end if;
 select * into j from public.pipeline_bhs_preview_jobs where id=p_id for update;
 if not found or j.state<>'running' or j.lease_token is distinct from p_token or j.lease_until<=now() then raise exception 'BHS lease mismatch';end if;
 expected:=case j.phase when 'source_plan' then 'evidence' when 'evidence' then 'workers' when 'workers' then 'review' when 'review' then 'correction' when 'correction' then 'synthesis' when 'synthesis' then 'scope' when 'scope' then 'complete' end;
 if p_next is distinct from expected or p_checkpoint is distinct from 'audit:'||j.phase||':'||j.phase||'-v7:'||j.input_hash then raise exception 'BHS checkpoint mismatch';end if;
 if not exists(select 1 from public.pipeline_offer_preview_budget_steps where budget_id=j.budget_id and step_key=p_checkpoint and state='complete') then raise exception 'BHS checkpoint not committed';end if;
 update public.pipeline_bhs_preview_jobs set phase=p_next,state=case when p_next='complete' then 'complete' else 'queued' end,lease_token=null,lease_until=null,updated_at=now() where id=p_id returning * into j;
 return to_jsonb(j);
end $$;
revoke all on function public.pipeline_bhs_preview_job_claim(uuid) from public,anon,authenticated;
revoke all on function public.pipeline_bhs_preview_job_advance(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.pipeline_bhs_preview_job_claim(uuid),public.pipeline_bhs_preview_job_advance(uuid,uuid,text,text) to service_role;
commit;
-- Rollback after stopping the BHS worker and exporting new queue rows:
-- drop function public.pipeline_bhs_preview_job_advance(uuid,uuid,text,text);
-- drop function public.pipeline_bhs_preview_job_claim(uuid);
-- drop table public.pipeline_bhs_preview_jobs;
-- Existing paid receipts and all offers remain intact.
