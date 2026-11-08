-- Store Amin-approved GPS coordinates only when the Amin explicitly shares location.
alter table public.amin_profiles
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision,
  add column if not exists location_shared_at timestamptz;

drop policy if exists amin_owner_location_update on public.amin_profiles;
create policy amin_owner_location_update
  on public.amin_profiles
  for update to authenticated
  using (user_id = (select auth.uid()) and approval_status = 'approved')
  with check (user_id = (select auth.uid()) and approval_status = 'approved');

create index if not exists amin_profiles_approved_location_idx
  on public.amin_profiles (approval_status, location_shared_at desc)
  where location_lat is not null and location_lng is not null;
