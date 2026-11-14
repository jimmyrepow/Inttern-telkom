-- ---------------------------------------------------------------------------
-- Perbaikan: Admin tidak boleh ikut absensi dan tidak tampil di rekap peserta
-- ---------------------------------------------------------------------------
-- Masalah yang diperbaiki:
-- 1. Admin bisa check-in/check-out (seharusnya tidak, karena admin bukan peserta)
-- 2. Rekap absensi admin menampilkan data absensi admin sendiri
-- 3. Statistik kehadiran menghitung absensi admin
-- 4. Leaderboard sudah benar (tidak include admin)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. app_check_in: Tolak jika user adalah admin
-- ---------------------------------------------------------------------------
create or replace function public.app_check_in(
  p_token text,
  p_location text default '',
  p_note text default '',
  p_photo_url text default '',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_tz text;
  v_today date;
  v_now time;
  v_limit time;
  v_status text;
  v_row public.attendance%rowtype;
  v_distance double precision;
  v_location text;
begin
  v_user := public.require_user(p_token);

  -- TOLAK JIKA ADMIN: Admin bukan peserta, tidak boleh absensi
  if v_user.role = 'admin' then
    raise exception 'Akun admin tidak dapat melakukan absensi. Admin bukan peserta magang.';
  end if;

  v_tz := public.app_timezone();
  v_today := (now() at time zone v_tz)::date;
  v_now := (now() at time zone v_tz)::time;

  if extract(isodow from v_today) in (6, 7) then
    raise exception 'Absensi hanya tersedia Senin-Jumat. Akhir pekan tidak ada absensi.';
  end if;

  select * into v_row from public.attendance where user_id = v_user.id and date = v_today;
  if v_row.id is not null and v_row.check_in is not null then
    raise exception 'Anda sudah absen masuk hari ini.';
  end if;

  v_distance := public.attendance_geofence_distance(p_latitude, p_longitude, p_accuracy);
  v_location := case
    when p_latitude is not null and p_longitude is not null
      then round(p_latitude::numeric, 6)::text || ', ' || round(p_longitude::numeric, 6)::text
    else coalesce(p_location, '')
  end;

  select coalesce(nullif(value, '')::time, '08:15'::time) into v_limit
  from public.settings where key = 'late_limit';

  v_status := case when v_now > coalesce(v_limit, '08:15'::time) then 'late' else 'on-time' end;

  if v_row.id is null then
    insert into public.attendance (
      user_id, name, date, check_in, status, photo_url, location, note, source,
      location_lat, location_lng, location_accuracy_m, location_distance_m
    )
    values (
      v_user.id, v_user.name, v_today, v_now, v_status, coalesce(p_photo_url, ''),
      v_location, coalesce(p_note, ''), 'web',
      p_latitude, p_longitude, p_accuracy, v_distance
    );
  else
    update public.attendance
    set check_in = v_now,
        status = v_status,
        photo_url = coalesce(nullif(p_photo_url, ''), photo_url),
        location = coalesce(nullif(v_location, ''), location),
        location_lat = coalesce(p_latitude, location_lat),
        location_lng = coalesce(p_longitude, location_lng),
        location_accuracy_m = coalesce(p_accuracy, location_accuracy_m),
        location_distance_m = coalesce(v_distance, location_distance_m),
        note = coalesce(p_note, note),
        updated_at = now()
    where id = v_row.id;
  end if;

  perform public.log_action(v_user.username, 'check-in', v_today::text);

  return jsonb_build_object(
    'ok', true,
    'message', 'Absen masuk berhasil.',
    'date', v_today,
    'time', to_char(v_now, 'HH24:MI'),
    'distance_m', v_distance
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. app_check_out: Tolak jika user adalah admin
-- ---------------------------------------------------------------------------
create or replace function public.app_check_out(
  p_token text,
  p_location text default '',
  p_note text default '',
  p_photo_url text default '',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_tz text;
  v_today date;
  v_now time;
  v_checkout_limit time;
  v_row public.attendance%rowtype;
  v_distance double precision;
  v_location text;
begin
  v_user := public.require_user(p_token);

  -- TOLAK JIKA ADMIN: Admin bukan peserta, tidak boleh absensi
  if v_user.role = 'admin' then
    raise exception 'Akun admin tidak dapat melakukan absensi. Admin bukan peserta magang.';
  end if;

  v_tz := public.app_timezone();
  v_today := (now() at time zone v_tz)::date;
  v_now := (now() at time zone v_tz)::time;

  if extract(isodow from v_today) in (6, 7) then
    raise exception 'Absensi hanya tersedia Senin-Jumat. Akhir pekan tidak ada absensi.';
  end if;

  select coalesce(nullif(trim(value), '')::time, '17:00'::time)
  into v_checkout_limit
  from public.settings
  where key = 'checkout_limit';
  v_checkout_limit := coalesce(v_checkout_limit, '17:00'::time);

  if v_now < v_checkout_limit then
    raise exception 'Absen pulang baru dapat dilakukan mulai pukul % (%).',
      to_char(v_checkout_limit, 'HH24:MI'), v_tz;
  end if;

  select * into v_row
  from public.attendance
  where user_id = v_user.id and date = v_today
  for update;

  if v_row.id is null or v_row.check_in is null then
    raise exception 'Anda belum absen masuk hari ini.';
  end if;
  if v_row.check_out is not null then
    raise exception 'Anda sudah absen pulang hari ini.';
  end if;

  v_distance := public.attendance_geofence_distance(p_latitude, p_longitude, p_accuracy);
  v_location := case
    when p_latitude is not null and p_longitude is not null
      then round(p_latitude::numeric, 6)::text || ', ' || round(p_longitude::numeric, 6)::text
    else coalesce(p_location, '')
  end;

  update public.attendance
  set check_out = v_now,
      photo_out_url = coalesce(nullif(p_photo_url, ''), photo_out_url),
      location = coalesce(nullif(v_location, ''), location),
      location_lat = coalesce(p_latitude, location_lat),
      location_lng = coalesce(p_longitude, location_lng),
      location_accuracy_m = coalesce(p_accuracy, location_accuracy_m),
      location_distance_m = coalesce(v_distance, location_distance_m),
      note = coalesce(p_note, note),
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  perform public.log_action(v_user.username, 'check-out', v_today::text || ' ' || to_char(v_now, 'HH24:MI'));

  return jsonb_build_object(
    'ok', true,
    'message', 'Absen pulang berhasil.',
    'date', v_today,
    'time', to_char(v_now, 'HH24:MI'),
    'distance_m', v_distance,
    'attendance', to_jsonb(v_row)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. app_bootstrap: Perbaiki statistik dan rekap untuk admin
-- ---------------------------------------------------------------------------
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
  v_is_workday boolean;
  v_users jsonb;
  v_attendance jsonb;
  v_settings jsonb;
  v_stats jsonb;
  v_announcements jsonb;
  v_leaves jsonb;
  v_corrections jsonb;
begin
  v_user := public.require_user(p_token);
  v_admin := v_user.role = 'admin';
  v_tz := public.app_timezone();
  v_today := (now() at time zone v_tz)::date;
  v_is_workday := extract(isodow from v_today) not in (6, 7);

  if v_admin then
    -- Admin melihat SEMUA user (termasuk admin lain) untuk manajemen
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id,
      'username', u.username,
      'name', u.name,
      'role', u.role,
      'active', u.active,
      'avatar_emoji', u.avatar_emoji,
      'avatar_color', u.avatar_color,
      'division', u.division,
      'mentor', u.mentor,
      'internship_start', u.internship_start,
      'internship_end', u.internship_end,
      'last_login_at', u.last_login_at,
      'password_updated_at', u.password_updated_at,
      'created_at', u.created_at,
      'updated_at', u.updated_at
    ) order by (u.role = 'admin') desc, u.name), '[]'::jsonb)
    into v_users
    from public.users u;

    -- ADMIN TIDAK MASUK dalam rekap absensi peserta
    -- Hanya tampilkan absensi peserta (intern), bukan admin
    select coalesce(jsonb_agg(to_jsonb(a) order by a.date desc, a.check_in desc nulls last), '[]'::jsonb)
    into v_attendance
    from public.attendance a
    join public.users u on u.id = a.user_id
    where u.role = 'intern';

    select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb)
    into v_leaves
    from (
      select * from public.leave_requests order by created_at desc limit 500
    ) l;

    select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
    into v_corrections
    from (
      select * from public.attendance_corrections order by created_at desc limit 500
    ) c;
  else
    v_users := jsonb_build_array(jsonb_build_object(
      'id', v_user.id,
      'username', v_user.username,
      'name', v_user.name,
      'role', v_user.role,
      'active', v_user.active,
      'avatar_emoji', v_user.avatar_emoji,
      'avatar_color', v_user.avatar_color,
      'division', v_user.division,
      'mentor', v_user.mentor,
      'internship_start', v_user.internship_start,
      'internship_end', v_user.internship_end,
      'last_login_at', v_user.last_login_at,
      'password_updated_at', v_user.password_updated_at,
      'created_at', v_user.created_at,
      'updated_at', v_user.updated_at
    ));

    select coalesce(jsonb_agg(to_jsonb(a) order by a.date desc, a.check_in desc nulls last), '[]'::jsonb)
    into v_attendance
    from public.attendance a
    where a.user_id = v_user.id;

    select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb)
    into v_leaves
    from (
      select * from public.leave_requests
      where user_id = v_user.id
      order by created_at desc
      limit 200
    ) l;

    select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
    into v_corrections
    from (
      select * from public.attendance_corrections
      where user_id = v_user.id
      order by created_at desc
      limit 200
    ) c;
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
  into v_announcements
  from (
    select * from public.announcements
    where active
    order by created_at desc
    limit 20
  ) a;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  into v_settings
  from public.settings;

  if v_is_workday then
    v_stats := jsonb_build_object(
      'totalInterns', (select count(*) from public.users where role = 'intern' and active),
      -- Hanya hitung absensi intern, bukan admin
      'totalAttendanceToday', (
        select count(*) from public.attendance a
        join public.users u on u.id = a.user_id
        where u.role = 'intern'
          and a.date = v_today
          and a.check_in is not null
      ),
      'onTime', (
        select count(*) from public.attendance a
        join public.users u on u.id = a.user_id
        where u.role = 'intern'
          and a.date = v_today
          and a.check_in is not null
          and a.status = 'on-time'
      ),
      'late', (
        select count(*) from public.attendance a
        join public.users u on u.id = a.user_id
        where u.role = 'intern'
          and a.date = v_today
          and a.check_in is not null
          and a.status = 'late'
      ),
      'onLeave', (
        select count(distinct l.user_id)
        from public.leave_requests l
        join public.users u on u.id = l.user_id
        where u.role = 'intern' and u.active
          and l.status = 'approved'
          and v_today between l.start_date and l.end_date
      ),
      'absent', greatest(
        (select count(*) from public.users where role = 'intern' and active) -
        (
          select count(*) from public.attendance a
          join public.users u on u.id = a.user_id
          where u.role = 'intern'
            and a.date = v_today
            and a.check_in is not null
        ) -
        (
          select count(distinct l.user_id)
          from public.leave_requests l
          join public.users u on u.id = l.user_id
          where u.role = 'intern' and u.active
            and l.status = 'approved'
            and v_today between l.start_date and l.end_date
            and not exists (
              select 1 from public.attendance a
              join public.users u2 on u2.id = a.user_id
              where u2.role = 'intern'
                and a.user_id = l.user_id
                and a.date = v_today
                and a.check_in is not null
            )
        ),
        0
      ),
      'pendingLeaves', (select count(*) from public.leave_requests where status = 'pending'),
      'pendingCorrections', (select count(*) from public.attendance_corrections where status = 'pending'),
      'today', v_today,
      'isWorkday', true
    );
  else
    v_stats := jsonb_build_object(
      'totalInterns', (select count(*) from public.users where role = 'intern' and active),
      'totalAttendanceToday', 0,
      'onTime', 0,
      'late', 0,
      'onLeave', 0,
      'absent', 0,
      'pendingLeaves', (select count(*) from public.leave_requests where status = 'pending'),
      'pendingCorrections', (select count(*) from public.attendance_corrections where status = 'pending'),
      'today', v_today,
      'isWorkday', false
    );
  end if;

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
      'division', v_user.division,
      'mentor', v_user.mentor,
      'internship_start', v_user.internship_start,
      'internship_end', v_user.internship_end,
      'last_login_at', v_user.last_login_at,
      'password_updated_at', v_user.password_updated_at,
      'created_at', v_user.created_at,
      'updated_at', v_user.updated_at
    ),
    'users', v_users,
    'attendance', v_attendance,
    'leaves', v_leaves,
    'corrections', v_corrections,
    'announcements', v_announcements,
    'settings', v_settings,
    'stats', v_stats,
    'serverTime', to_char(now() at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI:SS')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- revoking and granting execute permissions
-- ---------------------------------------------------------------------------
revoke execute on function public.app_check_in(text, text, text, text, double precision, double precision, double precision) from public;
revoke execute on function public.app_check_out(text, text, text, text, double precision, double precision, double precision) from public;
revoke execute on function public.app_bootstrap(text) from public;

grant execute on function public.app_check_in(text, text, text, text, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.app_check_out(text, text, text, text, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.app_bootstrap(text) to anon, authenticated;

notify pgrst, 'reload schema';
