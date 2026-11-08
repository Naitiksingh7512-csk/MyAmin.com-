-- Customers can read their own Amin reviews and submit one review per completed booking.
drop policy if exists amin_reviews_customer_read_own on public.amin_reviews;
create policy amin_reviews_customer_read_own
  on public.amin_reviews for select to authenticated
  using (customer_user_id = (select auth.uid()));

create unique index if not exists amin_reviews_one_per_booking_idx
  on public.amin_reviews (booking_id);

-- Payment submissions must belong to the authenticated customer and a completed booking
-- assigned to the payee; only submitted records can be created by customers.
drop policy if exists payment_records_payer_create on public.payment_records;
create policy payment_records_payer_create
  on public.payment_records for insert to authenticated
  with check (
    payer_user_id = (select auth.uid())
    and status = 'submitted'
    and exists (
      select 1 from public.bookings b
      where b.id = payment_records.booking_id
        and b.customer_user_id = (select auth.uid())
        and b.amin_user_id = payment_records.payee_user_id
        and b.status = 'completed'
    )
  );
