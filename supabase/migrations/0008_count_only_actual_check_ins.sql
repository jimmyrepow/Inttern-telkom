create or replace function public.app_bootstrap(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_admin boolean;
  v_tz text;
  v_today date;
  v_users jsonb;
  v_attendance jsonb;
  v_settings jsonb;
  v_stats jsonb;
begin
  v_user := public.require_user(p_token);
  v_admin := v_user.role = 'admin';
  v_tz := public.app_timezone();
  v_today := (now() at time zone v_tz)::date;

  if v_admin then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id,
      'username', u.username,
      'name', u.name,
      'role', u.role,
      'active', u.active,
      'last_login_at', u.last_login_at,
      'password_updated_at', u.password_updated_at,
      'created_at', u.created_at,
      'updated_at', u.updated_at
    ) order by (u.role = 'admin') desc, u.name), '[]'::jsonb)
    into v_users
    from public.users u;

    select coalesce(jsonb_agg(to_jsonb(a) order by a.date desc, a.check_in desc nulls last), '[]'::jsonb)
    into v_attendance
    from public.attendance a;
  else
    v_users := jsonb_build_array(jsonb_build_object(
      'id', v_user.id,
      'username', v_user.username,
      'name', v_user.name,
      'role', v_user.role,
      'active', v_user.active,
      'last_login_at', v_user.last_login_at,
      'password_updated_at', v_user.password_updated_at,
      'created_at', v_user.created_at,
      'updated_at', v_user.updated_at
    ));

    select coalesce(jsonb_agg(to_jsonb(a) order by a.date desc, a.check_in desc nulls last), '[]'::jsonb)
    into v_attendance
    from public.attendance a
    where a.user_id = v_user.id;
  end if;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  into v_settings
  from public.settings;

  v_stats := jsonb_build_object(
    'totalInterns', (select count(*) from public.users where role = 'intern' and active),
    'totalAttendanceToday', (
      select count(*) from public.attendance
      where date = v_today and check_in is not null
    ),
    'onTime', (
      select count(*) from public.attendance
      where date = v_today and check_in is not null and status = 'on-time'
    ),
    'late', (
      select count(*) from public.attendance
      where date = v_today and check_in is not null and status = 'late'
    ),
    'absent', greatest(
      (select count(*) from public.users where role = 'intern' and active) -
      (select count(*) from public.attendance where date = v_today and check_in is not null),
      0
    ),
    'today', v_today
  );

  return jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object(
      'id', v_user.id,
      'username', v_user.username,
      'name', v_user.name,
      'role', v_user.role,
      'active', v_user.active,
      'last_login_at', v_user.last_login_at,
      'password_updated_at', v_user.password_updated_at,
      'created_at', v_user.created_at,
      'updated_at', v_user.updated_at
    ),
    'users', v_users,
    'attendance', v_attendance,
    'settings', v_settings,
    'stats', v_stats,
    'serverTime', to_char(now() at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI:SS')
  );
end;
$$;

grant execute on function public.app_bootstrap(text) to anon, authenticated;

notify pgrst, 'reload schema';
