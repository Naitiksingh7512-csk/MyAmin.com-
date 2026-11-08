drop policy if exists private_uploads_admin_read on storage.objects;
create policy private_uploads_admin_read on storage.objects for select to authenticated
using (bucket_id='private-uploads' and (auth.jwt()->'app_metadata'->>'role')='admin' and (select private.is_active_admin()));
