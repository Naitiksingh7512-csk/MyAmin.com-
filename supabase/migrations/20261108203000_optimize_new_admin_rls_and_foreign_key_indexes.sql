drop policy if exists amin_payment_requests_admin_all on public.amin_payment_requests;
create policy amin_payment_requests_admin_all on public.amin_payment_requests for all to authenticated
using (((select auth.jwt())->'app_metadata'->>'role')='admin' and (select private.is_active_admin()))
with check (((select auth.jwt())->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));
drop policy if exists amin_payment_requests_owner_read on public.amin_payment_requests;
create policy amin_payment_requests_owner_read on public.amin_payment_requests for select to authenticated
using (amin_user_id=(select auth.uid()));

drop policy if exists team_attendance_admin_all on public.team_attendance;
create policy team_attendance_admin_all on public.team_attendance for all to authenticated
using (((select auth.jwt())->'app_metadata'->>'role')='admin' and (select private.is_active_admin()))
with check (((select auth.jwt())->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));
drop policy if exists team_attendance_member_read on public.team_attendance;
create policy team_attendance_member_read on public.team_attendance for select to authenticated
using (member_user_id=(select auth.uid()) and exists (select 1 from public.admin_team_members m where m.user_id=(select auth.uid()) and m.status='active' and m.role in ('team_member','moderator')));
drop policy if exists team_attendance_member_insert on public.team_attendance;
create policy team_attendance_member_insert on public.team_attendance for insert to authenticated
with check (member_user_id=(select auth.uid()) and exists (select 1 from public.admin_team_members m where m.user_id=(select auth.uid()) and m.status='active' and m.role in ('team_member','moderator')));
drop policy if exists team_attendance_member_update on public.team_attendance;
create policy team_attendance_member_update on public.team_attendance for update to authenticated
using (member_user_id=(select auth.uid()) and exists (select 1 from public.admin_team_members m where m.user_id=(select auth.uid()) and m.status='active' and m.role in ('team_member','moderator')))
with check (member_user_id=(select auth.uid()) and exists (select 1 from public.admin_team_members m where m.user_id=(select auth.uid()) and m.status='active' and m.role in ('team_member','moderator')));

drop policy if exists notifications_admin_read on public.notifications;
create policy notifications_admin_read on public.notifications for select to authenticated
using (((select auth.jwt())->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));
drop policy if exists notifications_admin_delete on public.notifications;
create policy notifications_admin_delete on public.notifications for delete to authenticated
using (((select auth.jwt())->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));

create index if not exists amin_payment_requests_amin_user_created_idx on public.amin_payment_requests(amin_user_id, created_at desc);
create index if not exists amin_payment_requests_created_by_idx on public.amin_payment_requests(created_by);
create index if not exists amin_payment_requests_verified_by_idx on public.amin_payment_requests(verified_by);
create index if not exists team_attendance_member_date_idx on public.team_attendance(member_user_id, work_date desc);
create index if not exists team_member_tasks_assigned_created_idx on public.team_member_tasks(assigned_to, created_at desc);
create index if not exists team_member_tasks_created_by_idx on public.team_member_tasks(created_by);
