create table if not exists public.amin_payment_requests (
 id uuid primary key default gen_random_uuid(),
 amin_user_id uuid not null references auth.users(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 amount numeric(12,2) not null check (amount > 0),
 note text not null default '',
 payment_link text,
 status text not null default 'requested' check (status = any (array['requested','submitted','verified','rejected','cancelled'])),
 transaction_reference text,
 proof_path text,
 verified_by uuid references auth.users(id),
 verified_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.amin_payment_requests enable row level security;
drop policy if exists amin_payment_requests_admin_all on public.amin_payment_requests;
create policy amin_payment_requests_admin_all on public.amin_payment_requests for all to authenticated
using ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()))
with check ((auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));
drop policy if exists amin_payment_requests_owner_read on public.amin_payment_requests;
create policy amin_payment_requests_owner_read on public.amin_payment_requests for select to authenticated
using (amin_user_id=auth.uid());
