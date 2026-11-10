drop policy if exists team_applications_read on public.amin_profiles;
create policy team_applications_read on public.amin_profiles
for select to authenticated using (private.has_team_permission('applications'));
drop policy if exists team_directory_read on public.amin_profiles;
create policy team_directory_read on public.amin_profiles
for select to authenticated using (approval_status = 'approved' and private.has_team_permission('directory'));
drop policy if exists team_applications_update on public.amin_profiles;
create policy team_applications_update on public.amin_profiles
for update to authenticated using (private.has_team_permission('applications')) with check (private.has_team_permission('applications'));

drop policy if exists team_bookings_read on public.bookings;
create policy team_bookings_read on public.bookings
for select to authenticated using (private.has_team_permission('bookings') or (status = 'completed' and private.has_team_permission('commission')));
drop policy if exists team_bookings_update on public.bookings;
create policy team_bookings_update on public.bookings
for update to authenticated using (private.has_team_permission('bookings')) with check (private.has_team_permission('bookings'));
