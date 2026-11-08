-- Require an active admin-team membership for every privileged Admin policy.
-- The JWT role alone is not sufficient because a stale role claim may remain after blocking.
drop policy if exists announcements_admin_manage on public.admin_announcements;
create policy announcements_admin_manage on public.admin_announcements for all to authenticated
using ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()))
with check ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));

drop policy if exists audit_admin_read on public.admin_audit_logs;
create policy audit_admin_read on public.admin_audit_logs for select to authenticated
using ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));

drop policy if exists admin_settings_admin_only on public.admin_settings;
create policy admin_settings_admin_only on public.admin_settings for all to authenticated
using ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()))
with check ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));

drop policy if exists amin_reviews_admin_manage on public.amin_reviews;
create policy amin_reviews_admin_manage on public.amin_reviews for all to authenticated
using ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()))
with check ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));

drop policy if exists notifications_admin_insert on public.notifications;
create policy notifications_admin_insert on public.notifications for insert to authenticated
with check ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));

drop policy if exists payment_records_admin_update on public.payment_records;
create policy payment_records_admin_update on public.payment_records for update to authenticated
using ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()))
with check ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));

drop policy if exists payment_records_participant_read on public.payment_records;
create policy payment_records_participant_read on public.payment_records for select to authenticated
using (payer_user_id=(select auth.uid()) or payee_user_id=(select auth.uid())
or ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin())));

drop policy if exists service_categories_admin_manage on public.service_categories;
create policy service_categories_admin_manage on public.service_categories for all to authenticated
using ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()))
with check ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));

drop policy if exists support_ticket_messages_participant_read on public.support_ticket_messages;
create policy support_ticket_messages_participant_read on public.support_ticket_messages for select to authenticated
using (exists (select 1 from public.support_tickets t where t.id=ticket_id and
  (t.user_id=(select auth.uid()) or t.assigned_to=(select auth.uid()) or
   ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin())))));

drop policy if exists support_ticket_messages_participant_send on public.support_ticket_messages;
create policy support_ticket_messages_participant_send on public.support_ticket_messages for insert to authenticated
with check (sender_user_id=(select auth.uid()) and exists (
  select 1 from public.support_tickets t where t.id=ticket_id and
  (t.user_id=(select auth.uid()) or t.assigned_to=(select auth.uid()) or
   ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()))
)));

drop policy if exists support_tickets_admin_update on public.support_tickets;
create policy support_tickets_admin_update on public.support_tickets for update to authenticated
using ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()))
with check ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));

drop policy if exists support_tickets_owner_read on public.support_tickets;
create policy support_tickets_owner_read on public.support_tickets for select to authenticated
using (user_id=(select auth.uid()) or assigned_to=(select auth.uid()) or
  ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin())));

drop policy if exists team_tasks_admin_all on public.team_member_tasks;
create policy team_tasks_admin_all on public.team_member_tasks for all to authenticated
using ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()))
with check ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));
