revoke all on public.schema_migrations from anon, authenticated;

revoke execute on function public.app_timezone() from public, anon, authenticated;
revoke execute on function public.haversine_m(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

drop policy if exists attendance_photos_update on storage.objects;

delete from auth.users;
