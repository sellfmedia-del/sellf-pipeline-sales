-- Pipeline BHS only. Credential stays in Vault; this RPC returns a boolean.
begin;
create function public.pipeline_bhs_worker_authorized(p_secret text) returns boolean
language plpgsql security definer set search_path='' as $$
declare expected text;
begin
 if p_secret is null or p_secret !~ '^[A-Za-z0-9_-]{43}$' then return false;end if;
 select decrypted_secret into expected from vault.decrypted_secrets where name='bhs_worker_secret';
 return coalesce(expected ~ '^[A-Za-z0-9_-]{43}$' and sha256(convert_to(expected,'UTF8'))=sha256(convert_to(p_secret,'UTF8')),false);
end $$;
revoke all on function public.pipeline_bhs_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.pipeline_bhs_worker_authorized(text) to service_role;
commit;
