revoke select on public.admin_team_members from authenticated;
grant select (user_id, role, status, full_name, email, phone, department, permissions, must_change_password, last_login_at)
  on public.admin_team_members to authenticated;
revoke update on public.team_member_tasks from authenticated;
grant update (status) on public.team_member_tasks to authenticated;