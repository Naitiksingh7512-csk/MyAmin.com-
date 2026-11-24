-- MyAmin booking activity notifications
-- Staged only on the GitHub feature branch; production database is not modified by this file.

create or replace function private.notify_myamin_booking_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_title text;
  v_body text;
begin
  if tg_op = 'INSERT' then
    insert into public.notifications
      (user_id, title, body, notification_type, related_table, related_id)
    values
      (new.customer_user_id, 'Booking request received',
       'Your ' || coalesce(new.service, 'service') || ' booking request has been submitted.',
       'booking_created', 'bookings', new.id);

    if new.amin_user_id is not null then
      insert into public.notifications
        (user_id, title, body, notification_type, related_table, related_id)
      values
        (new.amin_user_id, 'New booking request',
         'A customer has booked ' || coalesce(new.service, 'your service') ||
         ' for ' || coalesce(new.preferred_date::text, 'a requested date') || '.',
         'booking_created', 'bookings', new.id);
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     or new.amin_user_id is distinct from old.amin_user_id
     or new.confirmed_date is distinct from old.confirmed_date
     or new.confirmed_time is distinct from old.confirmed_time then

    v_title := case
      when new.amin_user_id is distinct from old.amin_user_id then 'Amin assigned to your booking'
      when new.status is distinct from old.status then 'Booking status updated'
      else 'Booking schedule updated'
    end;

    v_body := 'Your ' || coalesce(new.service, 'booking') ||
      ' is now ' || coalesce(replace(new.status, '_', ' '), 'updated') ||
      case when new.confirmed_date is not null
        then '. Confirmed for ' || new.confirmed_date::text ||
          case when new.confirmed_time is not null then ' at ' || left(new.confirmed_time::text, 5) else '' end
        else '' end || '.';

    insert into public.notifications
      (user_id, title, body, notification_type, related_table, related_id)
    values
      (new.customer_user_id, v_title, v_body, 'booking_updated', 'bookings', new.id);

    if new.amin_user_id is not null then
      insert into public.notifications
        (user_id, title, body, notification_type, related_table, related_id)
      values
        (new.amin_user_id, 'Booking updated',
         'A booking for ' || coalesce(new.service, 'your service') ||
         ' has been updated. Current status: ' || coalesce(replace(new.status, '_', ' '), 'updated') || '.',
         'booking_updated', 'bookings', new.id);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.notify_myamin_booking_activity() from public, anon, authenticated;

drop trigger if exists myamin_booking_activity_notifications on public.bookings;
create trigger myamin_booking_activity_notifications
after insert or update of status, amin_user_id, confirmed_date, confirmed_time
on public.bookings
for each row execute function private.notify_myamin_booking_activity();

create or replace function private.notify_myamin_booking_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_customer uuid;
  v_amin uuid;
  v_recipient uuid;
begin
  select customer_user_id, amin_user_id
    into v_customer, v_amin
    from public.bookings
    where id = new.booking_id;

  if not found then
    return new;
  end if;

  if new.sender_user_id = v_customer then
    v_recipient := v_amin;
  else
    v_recipient := v_customer;
  end if;

  if v_recipient is not null and v_recipient <> new.sender_user_id then
    insert into public.notifications
      (user_id, title, body, notification_type, related_table, related_id)
    values
      (v_recipient, 'New booking message',
       'You received a new message about your booking. Open MyAmin to view it.',
       'booking_message', 'bookings', new.booking_id);
  end if;
  return new;
end;
$$;

revoke all on function private.notify_myamin_booking_message() from public, anon, authenticated;

drop trigger if exists myamin_booking_message_notification on public.booking_messages;
create trigger myamin_booking_message_notification
after insert on public.booking_messages
for each row execute function private.notify_myamin_booking_message();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
