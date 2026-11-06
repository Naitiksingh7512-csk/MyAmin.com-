-- My Amin production backend foundation
-- Apply only after creating the Supabase project. Review policies and bootstrap the owner account securely.
create extension if not exists pgcrypto;

create type public.app_role as enum ('customer','amin','team','admin');
create type public.booking_status as enum ('pending','accepted','confirmed','in_progress','completed','cancelled','rejected');
create type public.ad_status as enum ('draft','pending_review','active','paused','expired','rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  preferred_language text not null default 'hi' check (preferred_language in ('hi','en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key(user_id, role)
);

create table public.amin_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  display_name text not null,
  profile_code text unique,
  phone text,
  whatsapp text,
  business_id text,
  description text,
  photo_path text,
  poster_path text,
  village text,
  district text,
  state text not null default 'Bihar',
  latitude double precision,
  longitude double precision,
  location_sharing boolean not null default false,
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','suspended')),
  completed_jobs integer not null default 0 check (completed_jobs >= 0),
  average_rating numeric(3,2) not null default 0 check (average_rating between 0 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id),
  amin_id uuid not null references public.amin_profiles(id),
  service_type text not null,
  customer_phone text,
  village text,
  district text,
  requested_date date,
  preferred_time text,
  details text,
  confirmed_at timestamptz,
  status public.booking_status not null default 'pending',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.amin_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid not null references auth.users(id),
  amin_id uuid not null references public.amin_profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  review_text text,
  created_at timestamptz not null default now()
);

create table public.amin_follows (
  customer_id uuid not null references auth.users(id) on delete cascade,
  amin_id uuid not null references public.amin_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(customer_id, amin_id)
);

create table public.advertisements (
  id uuid primary key default gen_random_uuid(),
  advertiser_name text not null,
  contact_phone text,
  title text not null,
  description text,
  image_path text,
  target_url text,
  placement text not null default 'home' check (placement in ('home','search','learning','tools','footer')),
  target_districts text[] not null default '{}',
  starts_at timestamptz,
  ends_at timestamptz,
  status public.ad_status not null default 'draft',
  created_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.amin_promotions (
  id uuid primary key default gen_random_uuid(),
  amin_id uuid not null references public.amin_profiles(id) on delete cascade,
  title text not null,
  promotion_note text,
  image_path text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending_verification','paid_verified','refunded')),
  status public.ad_status not null default 'pending_review',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.ad_events (
  id bigint generated always as identity primary key,
  advertisement_id uuid references public.advertisements(id) on delete cascade,
  promotion_id uuid references public.amin_promotions(id) on delete cascade,
  event_type text not null check (event_type in ('impression','click')),
  occurred_at timestamptz not null default now(),
  check ((advertisement_id is not null)::int + (promotion_id is not null)::int = 1)
);

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id),
  amin_id uuid not null references public.amin_profiles(id),
  booking_id uuid references public.bookings(id),
  created_at timestamptz not null default now(),
  unique(customer_id, amin_id, booking_id)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  message_text text not null check (char_length(message_text) between 1 and 4000),
  attachment_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id),
  permissions jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','blocked','removed')),
  created_at timestamptz not null default now()
);

create table public.amin_notices (
  id uuid primary key default gen_random_uuid(),
  amin_id uuid not null references public.amin_profiles(id) on delete cascade,
  title text not null,
  description text not null,
  image_path text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.commission_records (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id),
  amin_id uuid not null references public.amin_profiles(id),
  completed_job_number integer not null check (completed_job_number > 0),
  commission_rate numeric(5,2) not null default 5 check (commission_rate between 0 and 100),
  commission_amount numeric(12,2) not null default 0 check (commission_amount >= 0),
  status text not null default 'recorded' check (status in ('recorded','due','paid','waived')),
  created_at timestamptz not null default now()
);

create table public.activity_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index bookings_amin_status_idx on public.bookings(amin_id,status,created_at desc);
create index bookings_customer_idx on public.bookings(customer_id,created_at desc);
create index amin_profiles_district_idx on public.amin_profiles(district,approval_status);
create index amin_reviews_amin_idx on public.amin_reviews(amin_id,created_at desc);
create index ads_live_idx on public.advertisements(status,starts_at,ends_at);
create index promotions_live_idx on public.amin_promotions(status,starts_at,ends_at);
create index chat_messages_conversation_idx on public.chat_messages(conversation_id,created_at);

-- Role checks are SECURITY DEFINER to avoid recursive RLS lookups.
create or replace function public.has_role(wanted public.app_role)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists(select 1 from public.user_roles where user_id = auth.uid() and role = wanted)
$$;

create or replace function public.is_admin_or_team()
returns boolean language sql stable security definer
set search_path = public
as $$
  select public.has_role('admin') or (public.has_role('team') and exists(
    select 1 from public.team_members tm where tm.user_id=auth.uid() and tm.status='active'
  ))
$$;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.amin_profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.amin_reviews enable row level security;
alter table public.amin_follows enable row level security;
alter table public.advertisements enable row level security;
alter table public.amin_promotions enable row level security;
alter table public.ad_events enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.team_members enable row level security;
alter table public.amin_notices enable row level security;
alter table public.commission_records enable row level security;
alter table public.activity_logs enable row level security;

-- Profiles: owner reads/updates own record; staff can manage when authorized.
create policy "profile owner read" on public.profiles for select using (id=auth.uid() or public.is_admin_or_team());
create policy "profile owner update" on public.profiles for update using (id=auth.uid()) with check (id=auth.uid());
create policy "profile self insert" on public.profiles for insert with check (id=auth.uid());

create policy "roles self read" on public.user_roles for select using (user_id=auth.uid() or public.has_role('admin'));
-- Role writes are deliberately not exposed to normal clients. Bootstrap/admin changes via trusted SQL or Edge Function.

create policy "approved amin public read" on public.amin_profiles for select using (approval_status='approved' or user_id=auth.uid() or public.is_admin_or_team());
create policy "amin owner insert" on public.amin_profiles for insert with check (user_id=auth.uid());
create policy "amin owner update" on public.amin_profiles for update using (user_id=auth.uid() or public.is_admin_or_team()) with check (user_id=auth.uid() or public.is_admin_or_team());
create policy "amin owner delete admin only" on public.amin_profiles for delete using (public.has_role('admin'));

create policy "booking participants read" on public.bookings for select using (customer_id=auth.uid() or exists(select 1 from public.amin_profiles a where a.id=amin_id and a.user_id=auth.uid()) or public.is_admin_or_team());
create policy "customer creates booking" on public.bookings for insert with check (customer_id=auth.uid());
create policy "participants update booking" on public.bookings for update using (customer_id=auth.uid() or exists(select 1 from public.amin_profiles a where a.id=amin_id and a.user_id=auth.uid()) or public.is_admin_or_team()) with check (customer_id=auth.uid() or exists(select 1 from public.amin_profiles a where a.id=amin_id and a.user_id=auth.uid()) or public.is_admin_or_team());

create policy "reviews public read" on public.amin_reviews for select using (true);
create policy "customer review completed booking" on public.amin_reviews for insert with check (
 customer_id=auth.uid() and exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=auth.uid() and b.amin_id=amin_reviews.amin_id and b.status='completed')
);
create policy "review owner update" on public.amin_reviews for update using (customer_id=auth.uid()) with check (customer_id=auth.uid());

create policy "follows visible to owner" on public.amin_follows for select using (customer_id=auth.uid() or public.is_admin_or_team());
create policy "follow self" on public.amin_follows for insert with check (customer_id=auth.uid());
create policy "unfollow self" on public.amin_follows for delete using (customer_id=auth.uid());

create policy "active ads public read" on public.advertisements for select using (status='active' and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>=now()) or public.is_admin_or_team());
create policy "ads staff manage" on public.advertisements for all using (public.is_admin_or_team()) with check (public.is_admin_or_team());

create policy "active promotions public read" on public.amin_promotions for select using (status='active' and starts_at<=now() and ends_at>=now() or public.is_admin_or_team());
create policy "promotions staff manage" on public.amin_promotions for all using (public.is_admin_or_team()) with check (public.is_admin_or_team());

create policy "ad events staff read" on public.ad_events for select using (public.is_admin_or_team());
-- Event inserts should be routed through a rate-limited Edge Function to prevent fake analytics.

create policy "conversation participants read" on public.chat_conversations for select using (
 customer_id=auth.uid() or exists(select 1 from public.amin_profiles a where a.id=amin_id and a.user_id=auth.uid()) or public.is_admin_or_team()
);
create policy "customer creates conversation" on public.chat_conversations for insert with check (customer_id=auth.uid());
create policy "messages participants read" on public.chat_messages for select using (exists(
 select 1 from public.chat_conversations c left join public.amin_profiles a on a.id=c.amin_id
 where c.id=conversation_id and (c.customer_id=auth.uid() or a.user_id=auth.uid() or public.is_admin_or_team())
));
create policy "messages participants send" on public.chat_messages for insert with check (sender_id=auth.uid() and exists(
 select 1 from public.chat_conversations c left join public.amin_profiles a on a.id=c.amin_id
 where c.id=conversation_id and (c.customer_id=auth.uid() or a.user_id=auth.uid())
));

create policy "team members admin manage" on public.team_members for all using (public.has_role('admin') or user_id=auth.uid()) with check (public.has_role('admin') or user_id=auth.uid());
create policy "notices amin read" on public.amin_notices for select using (exists(select 1 from public.amin_profiles a where a.id=amin_id and a.user_id=auth.uid()) or public.is_admin_or_team());
create policy "notices staff manage" on public.amin_notices for all using (public.is_admin_or_team()) with check (public.is_admin_or_team());

create policy "commission staff manage" on public.commission_records for all using (public.is_admin_or_team()) with check (public.is_admin_or_team());
create policy "activity staff read" on public.activity_logs for select using (public.is_admin_or_team());
create policy "activity self insert" on public.activity_logs for insert with check (actor_id=auth.uid());

-- Review aggregates are recalculated by a trusted trigger.
create or replace function public.refresh_amin_rating()
returns trigger language plpgsql security definer set search_path=public
as $$
declare target uuid;
begin
 target := coalesce(new.amin_id, old.amin_id);
 update public.amin_profiles a
 set average_rating = coalesce((select round(avg(r.rating)::numeric,2) from public.amin_reviews r where r.amin_id=target),0),
     review_count = (select count(*) from public.amin_reviews r where r.amin_id=target),
     updated_at=now()
 where a.id=target;
 return coalesce(new,old);
end $$;
create trigger amin_rating_after_review
after insert or update or delete on public.amin_reviews
for each row execute function public.refresh_amin_rating();

-- Ranking should be computed from completed jobs + verified ratings, not paid promotion.
create or replace view public.amin_public_ranking as
select a.id,a.display_name,a.profile_code,a.district,a.average_rating,a.review_count,
       a.completed_jobs,
       dense_rank() over(order by a.completed_jobs desc,a.average_rating desc,a.review_count desc,a.created_at asc) as organic_rank,
       exists(select 1 from public.amin_promotions p where p.amin_id=a.id and p.status='active' and p.payment_status='paid_verified' and now() between p.starts_at and p.ends_at) as is_sponsored
from public.amin_profiles a
where a.approval_status='approved';

-- IMPORTANT: Do not create an admin role from a public sign-up form.
-- After the owner account has been created and verified, an authorized project owner
-- must run a one-time SQL statement replacing OWNER_AUTH_USER_UUID:
-- insert into public.user_roles(user_id,role) values ('OWNER_AUTH_USER_UUID','admin');
-- Team role grants and privileged moderation should be performed by a trusted Edge Function.
