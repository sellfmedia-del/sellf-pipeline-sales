-- TR research checkpoints and human review live exclusively in Travis tables.
-- The manual Pipeline tables are untouched.
create table if not exists public.travis_run_sources (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.travis_runs(id) on delete cascade,
  url text not null,
  title text not null default '',
  content text not null default '',
  published_date date,
  source_type text not null,
  observed_at timestamptz not null default now(),
  unique (run_id, url)
);
create index if not exists travis_run_sources_run_idx on public.travis_run_sources(run_id);
alter table public.travis_run_sources enable row level security;
grant select, insert, update on public.travis_run_sources to authenticated;
create policy "travis members read run sources" on public.travis_run_sources for select to authenticated
using (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));
create policy "travis members insert run sources" on public.travis_run_sources for insert to authenticated
with check (exists (select 1 from public.travis_runs r where r.id = run_id and r.user_id = (select auth.uid())));
create policy "travis members update run sources" on public.travis_run_sources for update to authenticated
using (exists (select 1 from public.travis_runs r where r.id = run_id and r.user_id = (select auth.uid())))
with check (exists (select 1 from public.travis_runs r where r.id = run_id and r.user_id = (select auth.uid())));

alter table public.travis_leads add column if not exists review_status text not null default 'approved'
  check (review_status in ('pending','approved','rejected'));
alter table public.travis_leads add column if not exists review_reason text;
alter table public.travis_leads add column if not exists contact_status text not null default 'complete'
  check (contact_status in ('complete','incomplete'));
alter table public.travis_leads add column if not exists source_run_id uuid references public.travis_runs(id);
create index if not exists travis_leads_review_idx on public.travis_leads(review_status);
