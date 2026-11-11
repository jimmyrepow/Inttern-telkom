-- Personalisasi avatar: emoji ikon + warna latar.
-- Avatar disimpan di tabel users agar konsisten di semua perangkat.

alter table public.users
  add column if not exists avatar_emoji text not null default '',
  add column if not exists avatar_color text not null default '#ec4899';

alter table public.users drop constraint if exists users_avatar_emoji_len;
alter table public.users add constraint users_avatar_emoji_len
  check (char_length(avatar_emoji) <= 8);

alter table public.users drop constraint if exists users_avatar_color_format;
alter table public.users add constraint users_avatar_color_format
  check (avatar_color ~ '^#[0-9A-Fa-f]{6}$');

create or replace function public.app_update_avatar(p_token text, p_emoji text, p_color text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_emoji text := coalesce(p_emoji, '');
  v_color text := lower(coalesce(p_color, ''));
begin
  v_user := public.require_user(p_token);

  if char_length(v_emoji) > 8 then
    raise exception 'Ikon avatar maksimal 8 karakter.';
  end if;
  if v_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'Warna avatar tidak valid.';
  end if;

  update public.users
  set avatar_emoji = v_emoji,
      avatar_color = v_color,
      updated_at = now()
  where id = v_user.id
  returning * into v_user;

  perform public.log_action(
    v_user.username,
    'update-avatar',
    coalesce(nullif(v_emoji, ''), 'inisial')
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Ikon profil berhasil diperbarui.',
    'user', jsonb_build_object(
      'id', v_user.id,
      'username', v_user.username,
      'name', v_user.name,
      'role', v_user.role,
      'active', v_user.active,
      'avatar_emoji', v_user.avatar_emoji,
      'avatar_color', v_user.avatar_color,
      'last_login_at', v_user.last_login_at,
      'password_updated_at', v_user.password_updated_at,
      'created_at', v_user.created_at,
      'updated_at', v_user.updated_at
    )
  );
end;
$$;

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
      'avatar_emoji', u.avatar_emoji,
      'avatar_color', u.avatar_color,
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
      'avatar_emoji', v_user.avatar_emoji,
      'avatar_color', v_user.avatar_color,
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
      'avatar_emoji', v_user.avatar_emoji,
      'avatar_color', v_user.avatar_color,
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

create or replace function public.app_export_data(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
begin
  v_admin := public.require_admin(p_token);

  return jsonb_build_object(
    'users', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id,
        'username', u.username,
        'name', u.name,
        'role', u.role,
        'active', u.active,
        'avatar_emoji', u.avatar_emoji,
        'avatar_color', u.avatar_color,
        'last_login_at', u.last_login_at,
        'password_updated_at', u.password_updated_at,
        'created_at', u.created_at
      ) order by u.name), '[]'::jsonb)
      from public.users u
    ),
    'attendance', (
      select coalesce(jsonb_agg(to_jsonb(a) order by a.date desc, a.check_in desc nulls last), '[]'::jsonb)
      from public.attendance a
    ),
    'settings', (
      select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
      from public.settings
    ),
    'logs', (
      select coalesce(jsonb_agg(to_jsonb(l) order by l.timestamp desc), '[]'::jsonb)
      from public.logs l
    ),
    'exportedAt', to_char(now() at time zone public.app_timezone(), 'YYYY-MM-DD"T"HH24:MI:SS')
  );
end;
$$;

revoke execute on function public.app_update_avatar(text, text, text) from public;

grant execute on function public.app_update_avatar(text, text, text) to anon, authenticated;
grant execute on function public.app_bootstrap(text) to anon, authenticated;
grant execute on function public.app_export_data(text) to anon, authenticated;

notify pgrst, 'reload schema';
