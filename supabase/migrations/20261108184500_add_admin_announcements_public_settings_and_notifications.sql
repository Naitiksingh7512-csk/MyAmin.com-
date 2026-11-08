-- Shared Admin announcements/advertisements, public website settings, and Admin notices.
alter table public.admin_announcements
  add column if not exists content_type text not null default 'announcement',
  add column if not exists image_url text,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='admin_announcements_content_type_check') then
    alter table public.admin_announcements add constraint admin_announcements_content_type_check
      check (content_type = any (array['announcement','video','link','advertisement']));
  end if;
end $$;

alter table public.notifications add column if not exists attachment_path text;

drop policy if exists website_settings_public_read on public.admin_settings;
create policy website_settings_public_read on public.admin_settings
  for select to anon, authenticated
  using (setting_key = 'website_settings');

drop policy if exists notifications_admin_read on public.notifications;
create policy notifications_admin_read on public.notifications
  for select to authenticated
  using ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));

drop policy if exists notifications_admin_delete on public.notifications;
create policy notifications_admin_delete on public.notifications
  for delete to authenticated
  using ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));
