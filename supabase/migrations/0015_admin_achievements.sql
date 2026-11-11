-- ---------------------------------------------------------------------------
-- Pencapaian admin: statistik aktivitas peninjauan dan pengumuman
-- ---------------------------------------------------------------------------
create or replace function public.app_admin_achievement_stats(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_reviews integer := 0;
  v_approved integer := 0;
  v_announcements integer := 0;
  v_actions integer := 0;
  v_active_days integer := 0;
begin
  v_admin := public.require_admin(p_token);

  select count(*) into v_reviews
  from public.logs
  where actor = v_admin.username
    and action in ('review-leave', 'approve-correction', 'reject-correction');

  select
    (select count(*) from public.leave_requests
      where reviewed_by = v_admin.username and status = 'approved')
    + (select count(*) from public.attendance_corrections
      where reviewed_by = v_admin.username and status = 'approved')
  into v_approved;

  select count(*) into v_announcements
  from public.logs
  where actor = v_admin.username
    and action = 'create-announcement';

  select count(*) into v_actions
  from public.logs
  where actor = v_admin.username;

  select count(distinct (timestamp at time zone public.app_timezone())::date)
  into v_active_days
  from public.logs
  where actor = v_admin.username;

  return jsonb_build_object(
    'ok', true,
    'stats', jsonb_build_object(
      'reviews', v_reviews,
      'approved', v_approved,
      'announcements', v_announcements,
      'actions', v_actions,
      'activeDays', v_active_days
    )
  );
end;
$$;

revoke execute on function public.app_admin_achievement_stats(text) from public;
grant execute on function public.app_admin_achievement_stats(text) to anon, authenticated;

notify pgrst, 'reload schema';
