-- Fields used by the Admin commission tracker.
alter table public.bookings
  add column if not exists service_amount numeric(12,2) not null default 0,
  add column if not exists commission_paid boolean not null default false,
  add column if not exists completed_at timestamptz;
