drop policy if exists admin_customer_addresses_read on public.user_addresses;
create policy admin_customer_addresses_read on public.user_addresses
for select to authenticated using (private.has_team_permission('customers'));
create index if not exists user_addresses_user_default_idx
on public.user_addresses (user_id, is_default desc, created_at desc);
