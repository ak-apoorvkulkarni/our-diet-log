-- Run this in Supabase → SQL Editor (once per project).
-- Stores one encrypted blob per household; row id is derived from the shared password on the client.

create table if not exists public.household_vaults (
  id text primary key,
  salt_b64 text not null,
  payload text not null,
  pbkdf2_iterations int,
  updated_at timestamptz not null default now()
);

alter table public.household_vaults enable row level security;

-- Data is already AES-GCM encrypted; id is a secret 64-char hex from your shared password.
-- For stricter setups, replace these with Edge Functions + service role.
create policy "household_vaults_select" on public.household_vaults for select using (true);
create policy "household_vaults_insert" on public.household_vaults for insert with check (true);
create policy "household_vaults_update" on public.household_vaults for update using (true);

-- Realtime: so browsers can subscribe to INSERT/UPDATE on this table (see CLOUD_SYNC.md).
alter publication supabase_realtime add table public.household_vaults;
