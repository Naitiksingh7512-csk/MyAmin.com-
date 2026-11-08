create table if not exists public.team_attendance (
 id uuid primary key default gen_random_uuid(),
 member_user_id uuid not null references auth.users(id) on delete cascade,
 work_date date not null default current_date,
 check_in_at timestamptz not null default now(),
 check_out_at timestamptz,
 note text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint team_attendance_checkout_after_checkin check (check_out_at is null or check_out_at >= check_in_at)
);
alter table public.team_attendance enable row level security;
drop policy if exists team_attendance_admin_all on public.team_attendance;
create policy team_attendance_admin_all on public.team_attendance for all to authenticated
using ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()))
with check ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));
drop policy if exists team_attendance_member_read on public.team_attendance;
create policy team_attendance_member_read on public.team_attendance for select to authenticated
using (member_user_id=auth.uid() and exists (select 1 from public.admin_team_members m where m.user_id=auth.uid() and m.status='active' and m.role in ('team_member','moderator')));
drop policy if exists team_attendance_member_insert on public.team_attendance;
create policy team_attendance_member_insert on public.team_attendance for insert to authenticated
with check (member_user_id=auth.uid() and exists (select 1 from public.admin_team_members m where m.user_id=auth.uid() and m.status='active' and m.role in ('team_member','moderator')));
drop policy if exists team_attendance_member_update on public.team_attendance;
create policy team_attendance_member_update on public.team_attendance for update to authenticated
using (member_user_id=auth.uid() and exists (select 1 from public.admin_team_members m where m.user_id=auth.uid() and m.status='active' and m.role in ('team_member','moderator')))
with check (member_user_id=auth.uid() and exists (select 1 from public.admin_team_members m where m.user_id=auth.uid() and m.status='active' and m.role in ('team_member','moderator')));
