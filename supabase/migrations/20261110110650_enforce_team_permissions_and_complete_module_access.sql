create or replace function private.has_team_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public, private, auth
as $$
  select exists (
    select 1 from public.admin_team_members m
    where m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('team_member','moderator')
      and coalesce(m.permissions ->> permission_key, 'false') = 'true'
  )
  or (
    coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
    and (select private.is_active_admin())
  );
$$;
revoke all on function private.has_team_permission(text) from public;
grant execute on function private.has_team_permission(text) to authenticated;

drop policy if exists team_applications_read on public.amin_profiles;
create policy team_applications_read on public.amin_profiles for select to authenticated using (private.has_team_permission('applications') or private.has_team_permission('directory'));
drop policy if exists team_applications_update on public.amin_profiles;
create policy team_applications_update on public.amin_profiles for update to authenticated using (private.has_team_permission('applications')) with check (private.has_team_permission('applications'));

drop policy if exists team_bookings_read on public.bookings;
create policy team_bookings_read on public.bookings for select to authenticated using (private.has_team_permission('bookings') or private.has_team_permission('commission'));
drop policy if exists team_bookings_update on public.bookings;
create policy team_bookings_update on public.bookings for update to authenticated using (private.has_team_permission('bookings') or private.has_team_permission('commission')) with check (private.has_team_permission('bookings') or private.has_team_permission('commission'));

drop policy if exists team_customers_read on public.user_profiles;
create policy team_customers_read on public.user_profiles for select to authenticated using (private.has_team_permission('customers'));
drop policy if exists team_customer_addresses_read on public.user_addresses;
create policy team_customer_addresses_read on public.user_addresses for select to authenticated using (private.has_team_permission('customers'));

drop policy if exists team_reports_read on public.support_tickets;
create policy team_reports_read on public.support_tickets for select to authenticated using (private.has_team_permission('reports'));
drop policy if exists team_reports_update on public.support_tickets;
create policy team_reports_update on public.support_tickets for update to authenticated using (private.has_team_permission('reports')) with check (private.has_team_permission('reports'));
drop policy if exists team_ticket_messages_read on public.support_ticket_messages;
create policy team_ticket_messages_read on public.support_ticket_messages for select to authenticated using (private.has_team_permission('reports'));
drop policy if exists team_ticket_messages_send on public.support_ticket_messages;
create policy team_ticket_messages_send on public.support_ticket_messages for insert to authenticated with check (sender_user_id = (select auth.uid()) and private.has_team_permission('reports'));

drop policy if exists team_service_categories_manage on public.service_categories;
create policy team_service_categories_manage on public.service_categories for all to authenticated using (private.has_team_permission('content')) with check (private.has_team_permission('content'));
drop policy if exists team_announcements_read on public.admin_announcements;
create policy team_announcements_read on public.admin_announcements for select to authenticated using (private.has_team_permission('content'));
drop policy if exists team_announcements_manage on public.admin_announcements;
create policy team_announcements_manage on public.admin_announcements for all to authenticated using (private.has_team_permission('content')) with check (private.has_team_permission('content'));
drop policy if exists team_admin_settings_read on public.admin_settings;
create policy team_admin_settings_read on public.admin_settings for select to authenticated using (private.has_team_permission('websiteControls'));

drop policy if exists team_payments_read on public.payment_records;
create policy team_payments_read on public.payment_records for select to authenticated using (private.has_team_permission('payments'));
drop policy if exists team_payments_update on public.payment_records;
create policy team_payments_update on public.payment_records for update to authenticated using (private.has_team_permission('payments')) with check (private.has_team_permission('payments'));
drop policy if exists team_payment_requests_read on public.amin_payment_requests;
create policy team_payment_requests_read on public.amin_payment_requests for select to authenticated using (private.has_team_permission('paymentRequests'));
drop policy if exists team_payment_requests_update on public.amin_payment_requests;
create policy team_payment_requests_update on public.amin_payment_requests for update to authenticated using (private.has_team_permission('paymentRequests')) with check (private.has_team_permission('paymentRequests'));

drop policy if exists team_activity_read on public.admin_audit_logs;
create policy team_activity_read on public.admin_audit_logs for select to authenticated using (private.has_team_permission('activity'));

create index if not exists ai_messages_conversation_created_idx on public.ai_messages (conversation_id, created_at desc);
drop index if exists public.amin_reviews_one_per_booking_idx;
