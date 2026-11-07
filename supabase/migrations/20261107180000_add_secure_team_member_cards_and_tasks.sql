alter table public.admin_team_members
  add column if not exists full_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists department text,
  add column if not exists permissions jsonb not null default '{}'::jsonb,
  add column if not exists card_token_hash text,
  add column if not exists must_change_password boolean not null default true,
  add column if not exists last_login_at timestamptz;

create unique index if not exists admin_team_members_card_token_hash_uidx
  on public.admin_team_members(card_token_hash) where card_token_hash is not null;
create index if not exists admin_team_members_status_role_idx
  on public.admin_team_members(status, role);

create table if not exists public.team_member_tasks (
  id uuid primary key default gen_random_uuid(),
  assigned_to uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  module text not null default 'general',
  status text not null default 'pending'
    check (status in ('pending','in_progress','completed','cancelled')),
  due_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.team_member_tasks enable row level security;
drop policy if exists team_tasks_admin_all on public.team_member_tasks;
create policy team_tasks_admin_all on public.team_member_tasks for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role')='admin')
  with check ((auth.jwt()->'app_metadata'->>'role')='admin');
drop policy if exists team_tasks_member_read on public.team_member_tasks;
create policy team_tasks_member_read on public.team_member_tasks for select to authenticated using (assigned_to=auth.uid());
drop policy if exists team_tasks_member_update on public.team_member_tasks;
create policy team_tasks_member_update on public.team_member_tasks for update to authenticated
  using (assigned_to=auth.uid()) with check (assigned_to=auth.uid());
drop policy if exists team_member_read_self on public.admin_team_members;
create policy team_member_read_self on public.admin_team_members for select to authenticated using (user_id=auth.uid());
create or replace function public.touch_team_task_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end;
$$;
drop trigger if exists team_tasks_touch_updated_at on public.team_member_tasks;
create trigger team_tasks_touch_updated_at before update on public.team_member_tasks
for each row execute function public.touch_team_task_updated_at();
grant select on public.admin_team_members to authenticated;
grant select, update on public.team_member_tasks to authenticated;
