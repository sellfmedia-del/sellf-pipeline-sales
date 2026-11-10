-- REVIEW ONLY. Not applied. Pipeline project gxngmqewskhrbxqmnpps.
-- Requires separately approved queue migration, pg_cron/pg_net and Vault.
-- Before activation, provision TWO BHS-only Vault entries without printing them:
-- bhs_worker_url = approved production origin + /api/bhs-worker
-- bhs_worker_secret = same BHS_WORKER_SECRET as Vercel and both gateways.
-- Never put a Supabase service key or provider key in this scheduler.
begin;
create function public.pipeline_bhs_tick() returns bigint
language plpgsql security definer set search_path='' as $$
declare endpoint text;credential text;request_id bigint;
begin
 -- No HTTP request or function billing while the queue is idle.
 -- Expired leases must also wake the worker so they can be marked paused.
 if not exists(select 1 from public.pipeline_bhs_jobs where mode='production' and (state='queued' or state='running' and lease_until<=now())) then return null;end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='bhs_worker_url';
 select decrypted_secret into credential from vault.decrypted_secrets where name='bhs_worker_secret';
 if endpoint !~ '^https://[a-zA-Z0-9.-]+/api/bhs-worker$' or credential !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'BHS scheduler not configured';end if;
 select net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),body:='{}'::jsonb,timeout_milliseconds:=300000) into request_id;
 return request_id;
end $$;
revoke all on function public.pipeline_bhs_tick() from public,anon,authenticated,service_role;
-- Dedicated scheduler only. Review extension versions before applying.
select cron.schedule('sellf-bhs-sequential-worker','10 seconds','select public.pipeline_bhs_tick();');
commit;
-- Rollback first: select cron.unschedule('sellf-bhs-sequential-worker');
-- Then disable OFFER_BHS_BACKGROUND_ENABLED; existing job/checkpoint rows remain.
-- drop function public.pipeline_bhs_tick();
