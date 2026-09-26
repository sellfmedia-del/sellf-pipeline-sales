-- Travis has an independent board. This script creates new objects only.
-- Existing public.spaces, public.columns and public.leads are not altered.
create table if not exists public.travis_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','editor')),
  created_at timestamptz not null default now()
);

create table if not exists public.travis_spaces (
  id text primary key,
  name text not null,
  color text,
  created_at bigint
);

create table if not exists public.travis_columns (
  id text primary key,
  space_id text not null references public.travis_spaces(id) on delete cascade,
  title text not null,
  dot text,
  sort_order smallint not null
);

create table if not exists public.travis_leads (
  id text primary key,
  space_id text not null references public.travis_spaces(id),
  col_id text not null references public.travis_columns(id),
  name text not null,
  company text not null,
  value text,
  notes text not null default '',
  doc_url text,
  last_contact bigint,
  contacts jsonb not null default '[]'::jsonb,
  timeline jsonb not null default '[]'::jsonb,
  domain text,
  country text,
  created_at timestamptz not null default now()
);
create unique index if not exists travis_leads_space_domain_uq on public.travis_leads (space_id, lower(domain)) where domain is not null;

create table if not exists public.travis_research (
  lead_id text primary key references public.travis_leads(id) on delete cascade,
  signal_summary text not null,
  hypothesis text not null,
  fit_reason text not null,
  timing_reason text not null,
  confidence text not null check (confidence in ('medium','high')),
  verification text not null default 'source_checked',
  manual_lead_id text,
  updated_at timestamptz not null default now()
);

create table if not exists public.travis_evidence (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null references public.travis_leads(id) on delete cascade,
  url text not null,
  title text,
  fact text not null,
  observed_at timestamptz not null default now(),
  unique (lead_id, url)
);

create table if not exists public.travis_interactions (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null references public.travis_leads(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  type text not null check (type in ('E-posta','Arama','Toplantı','Takip','Teklif','Sözleşme','Sonuç')),
  note text not null check (length(trim(note)) > 0),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.travis_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  status text not null check (status in ('running','completed','failed')),
  strategy jsonb not null default '{}'::jsonb,
  usage jsonb not null default '{}'::jsonb,
  error_text text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists travis_one_running_per_user on public.travis_runs(user_id) where status = 'running';

create table if not exists public.travis_lessons (
  id uuid primary key default gen_random_uuid(),
  lesson_key text not null unique,
  subject text not null,
  conclusion text not null,
  supporting_lead_ids text[] not null default '{}',
  sample_size integer not null check (sample_size >= 3),
  confidence text not null check (confidence in ('tentative','supported')),
  updated_at timestamptz not null default now()
);

insert into public.travis_members(user_id, role)
select distinct user_id, 'owner' from public.spaces where user_id is not null
on conflict (user_id) do nothing;
insert into public.travis_spaces(id,name,color,created_at)
values ('travis-main','Travis · Intentler','#378ADD',(extract(epoch from now())*1000)::bigint)
on conflict (id) do nothing;
insert into public.travis_columns(id,space_id,title,dot,sort_order) values
  ('travis-new','travis-main','Yeni Intent','#378ADD',0),
  ('travis-contact','travis-main','İlk Temas','#639922',1),
  ('travis-meeting','travis-main','Toplantı Yapıldı','#BA7517',2),
  ('travis-proposal','travis-main','Teklif Aşamasında','#D4537E',3),
  ('travis-won','travis-main','Kazanıldı','#1D9E75',4),
  ('travis-lost','travis-main','Olumsuz','#E24B4A',5)
on conflict (id) do nothing;

alter table public.travis_members enable row level security;
alter table public.travis_spaces enable row level security;
alter table public.travis_columns enable row level security;
alter table public.travis_leads enable row level security;
alter table public.travis_research enable row level security;
alter table public.travis_evidence enable row level security;
alter table public.travis_interactions enable row level security;
alter table public.travis_runs enable row level security;
alter table public.travis_lessons enable row level security;

grant select on public.travis_members to authenticated;
grant select on public.travis_spaces, public.travis_columns to authenticated;
grant select, insert, update on public.travis_lessons to authenticated;
grant select, insert, update on public.travis_leads, public.travis_research, public.travis_evidence, public.travis_runs to authenticated;
grant select, insert on public.travis_interactions to authenticated;

create policy "travis own membership" on public.travis_members for select to authenticated
using (user_id = (select auth.uid()));
create policy "travis members read spaces" on public.travis_spaces for select to authenticated
using (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));
create policy "travis members read columns" on public.travis_columns for select to authenticated
using (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));
create policy "travis members read lessons" on public.travis_lessons for select to authenticated
using (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));
create policy "travis members insert lessons" on public.travis_lessons for insert to authenticated
with check (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));
create policy "travis members update lessons" on public.travis_lessons for update to authenticated
using (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));

create policy "travis members read leads" on public.travis_leads for select to authenticated
using (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));
create policy "travis members insert leads" on public.travis_leads for insert to authenticated
with check (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));
create policy "travis members update leads" on public.travis_leads for update to authenticated
using (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));

create policy "travis members read research" on public.travis_research for select to authenticated
using (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));
create policy "travis members insert research" on public.travis_research for insert to authenticated
with check (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));
create policy "travis members update research" on public.travis_research for update to authenticated
using (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));

create policy "travis members read evidence" on public.travis_evidence for select to authenticated
using (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));
create policy "travis members insert evidence" on public.travis_evidence for insert to authenticated
with check (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));
create policy "travis members update evidence" on public.travis_evidence for update to authenticated
using (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));

create policy "travis members read interactions" on public.travis_interactions for select to authenticated
using (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));
create policy "travis members insert own interactions" on public.travis_interactions for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));

create policy "travis members read runs" on public.travis_runs for select to authenticated
using (exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));
create policy "travis members insert runs" on public.travis_runs for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.travis_members m where m.user_id = (select auth.uid())));
create policy "travis members update own runs" on public.travis_runs for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
