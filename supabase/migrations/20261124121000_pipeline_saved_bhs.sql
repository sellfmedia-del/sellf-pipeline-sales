create table public.pipeline_saved_bhs (
 id text primary key check (id ~ '^[a-f0-9]{64}$'),
 owner_id uuid references auth.users(id) on delete set null,
 lead_id text not null,
 space_id text not null,
 brief jsonb not null check (jsonb_typeof(brief) = 'object'),
 brand_name text generated always as (brief->>'brandName') stored,
 audit jsonb not null check (jsonb_typeof(audit) = 'object'),
 created_at timestamptz not null default now()
);

create index pipeline_saved_bhs_card_date_idx
 on public.pipeline_saved_bhs (lead_id, space_id, created_at desc, id desc);

alter table public.pipeline_saved_bhs enable row level security;
revoke all on public.pipeline_saved_bhs from public, anon, authenticated;
grant select, insert on public.pipeline_saved_bhs to service_role;
