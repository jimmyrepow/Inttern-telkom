-- ---------------------------------------------------------------------------
-- Absensi hanya hari kerja (Senin-Jumat)
-- - Absen masuk/pulang ditolak pada Sabtu/Minggu.
-- - Statistik "hari ini" dan "belum absen" tidak menghitung akhir pekan.
-- - Data absensi akhir pekan lama tetap disimpan, tetapi tidak dihitung pada
--   leaderboard/streak.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Absen masuk: tolak akhir pekan
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
-- Absen pulang: tolak akhir pekan
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
-- Bootstrap: statistik sadar hari kerja
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

    select coalesce(jsonb_agg(to_jsonb(a) order by a.date desc, a.check_in desc nulls last), '[]'::jsonb)
    into v_attendance
    from public.attendance a;

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
        (select count(*) from public.attendance where date = v_today and check_in is not null) -
        (
          select count(distinct l.user_id)
          from public.leave_requests l
          join public.users u on u.id = l.user_id
          where u.role = 'intern' and u.active
            and l.status = 'approved'
            and v_today between l.start_date and l.end_date
            and not exists (
              select 1 from public.attendance a
              where a.user_id = l.user_id and a.date = v_today and a.check_in is not null
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
-- Leaderboard: abaikan absensi akhir pekan
-- ---------------------------------------------------------------------------
create or replace function public.app_leaderboard(p_token text, p_month text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_tz text;
  v_month text := nullif(trim(coalesce(p_month, '')), '');
  v_start date;
  v_end date;
  v_rows jsonb;
begin
  v_user := public.require_user(p_token);
  v_tz := public.app_timezone();

  if v_month is not null and v_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Bulan leaderboard tidak valid.';
  end if;

  if v_month is not null then
    v_start := (v_month || '-01')::date;
    v_end := (v_start + interval '1 month')::date;
  end if;

  with attendance_rows as (
    select
      a.user_id,
      a.date,
      a.check_in,
      a.check_out,
      a.status,
      a.note,
      case
        when a.check_out is not null and a.check_in is not null and a.check_out >= a.check_in
          then extract(epoch from (a.check_out - a.check_in)) / 60.0
        else 0
      end as minutes_worked,
      case when a.check_out is not null then 1 else 0 end as has_checkout,
      case when a.status = 'on-time' then 1 else 0 end as is_on_time,
      case when coalesce(trim(a.note), '') <> '' then 1 else 0 end as has_note,
      row_number() over (partition by a.date order by a.check_in asc) as day_order
    from public.attendance a
    where a.check_in is not null
      and extract(isodow from a.date) not in (6, 7)
      and (v_start is null or (a.date >= v_start and a.date < v_end))
  ),
  ordered as (
    select
      attendance_rows.*,
      lag(attendance_rows.date) over (
        partition by attendance_rows.user_id order by attendance_rows.date
      ) as prev_date
    from attendance_rows
  ),
  streak_marks as (
    select
      ordered.*,
      case
        when ordered.prev_date is null then 1
        when (
          select count(*)
          from generate_series(ordered.prev_date + 1, ordered.date - 1, interval '1 day') gap_day
          where extract(isodow from gap_day) not in (6, 7)
        ) = 0 then 0
        else 1
      end as starts_new_streak
    from ordered
  ),
  streak_ids as (
    select
      streak_marks.*,
      sum(streak_marks.starts_new_streak) over (
        partition by streak_marks.user_id order by streak_marks.date
      ) as streak_group
    from streak_marks
  ),
  streak_positions as (
    select
      streak_ids.*,
      row_number() over (
        partition by streak_ids.user_id, streak_ids.streak_group order by streak_ids.date
      ) as streak_pos,
      count(*) over (
        partition by streak_ids.user_id, streak_ids.streak_group
      )::int as streak_len
    from streak_ids
  ),
  user_streak as (
    select distinct on (user_id)
      user_id,
      streak_len as current_streak
    from streak_positions
    order by user_id, date desc
  ),
  user_best as (
    select user_id, max(streak_len)::int as best_streak
    from streak_positions
    group by user_id
  ),
  day_points as (
    select
      streak_positions.user_id,
      streak_positions.date,
      streak_positions.is_on_time,
      streak_positions.has_checkout,
      streak_positions.has_note,
      streak_positions.minutes_worked,
      streak_positions.day_order,
      streak_positions.streak_pos,
      (
        10
        + case when streak_positions.is_on_time = 1 then 5 else 0 end
        + case when streak_positions.has_checkout = 1 then 2 else 0 end
        + case when streak_positions.has_note = 1 then 1 else 0 end
        + least(greatest(floor(streak_positions.minutes_worked / 60.0)::int, 0), 5)
        + least(streak_positions.streak_pos, 5)
        + case when streak_positions.day_order <= 3 then 4 - streak_positions.day_order else 0 end
      )::int as points
    from streak_positions
  ),
  per_user as (
    select
      user_id,
      count(*)::int as present_days,
      sum(is_on_time)::int as on_time_days,
      sum(case when is_on_time = 0 then 1 else 0 end)::int as late_days,
      sum(has_checkout)::int as completed_days,
      sum(has_note)::int as note_days,
      sum(case when day_order <= 3 then 1 else 0 end)::int as early_bird_days,
      coalesce(sum(minutes_worked), 0)::int as total_minutes,
      coalesce(sum(points), 0)::int as points
    from day_points
    group by user_id
  ),
  farm_period as (
    select
      h.user_id,
      coalesce(sum(h.points), 0)::int as farm_points,
      count(*)::int as farm_harvests
    from public.farm_harvests h
    where v_start is null or (h.harvest_date >= v_start and h.harvest_date < v_end)
    group by h.user_id
  ),
  farm_steal_period as (
    select
      fs.thief_id as user_id,
      coalesce(sum(fs.points), 0)::int as farm_steal_points,
      count(*)::int as farm_steals
    from public.farm_steals fs
    where v_start is null or (fs.steal_date >= v_start and fs.steal_date < v_end)
    group by fs.thief_id
  ),
  farm_profile as (
    select
      fp.user_id,
      fp.xp,
      fp.water,
      fp.fertilizer,
      fp.total_harvests,
      fp.total_points,
      public.farm_level_for_xp(fp.xp) as level
    from public.farm_profiles fp
  ),
  scored as (
    select
      u.id as user_id,
      u.name,
      u.username,
      u.avatar_emoji,
      u.avatar_color,
      coalesce(p.present_days, 0) as present_days,
      coalesce(p.on_time_days, 0) as on_time_days,
      coalesce(p.late_days, 0) as late_days,
      coalesce(p.completed_days, 0) as completed_days,
      coalesce(p.note_days, 0) as note_days,
      coalesce(p.early_bird_days, 0) as early_bird_days,
      coalesce(p.total_minutes, 0) as total_minutes,
      coalesce(p.points, 0) as attendance_points,
      coalesce(us.current_streak, 0) as current_streak,
      coalesce(ub.best_streak, 0) as best_streak,
      coalesce(fp.farm_points, 0) + coalesce(fsp.farm_steal_points, 0) as farm_points,
      coalesce(fp.farm_harvests, 0) as farm_harvests,
      coalesce(fsp.farm_steal_points, 0) as farm_steal_points,
      coalesce(fsp.farm_steals, 0) as farm_steals,
      coalesce(fpr.xp, 0) as farm_xp,
      coalesce(fpr.level, 1) as farm_level,
      coalesce(fpr.total_harvests, 0) as farm_total_harvests,
      coalesce(fpr.total_points, 0) as farm_total_points,
      coalesce(fpr.water, 0) as farm_water,
      coalesce(fpr.fertilizer, 0) as farm_fertilizer,
      public.farm_level_xp(coalesce(fpr.level, 1)) as farm_level_xp,
      coalesce(public.farm_next_level_xp(coalesce(fpr.level, 1)), coalesce(fpr.xp, 0)) as farm_next_xp,
      coalesce(fpr.level, 1) >= 20 as farm_max_level
    from public.users u
    left join per_user p on p.user_id = u.id
    left join user_streak us on us.user_id = u.id
    left join user_best ub on ub.user_id = u.id
    left join farm_period fp on fp.user_id = u.id
    left join farm_steal_period fsp on fsp.user_id = u.id
    left join farm_profile fpr on fpr.user_id = u.id
    where u.role = 'intern' and u.active
  ),
  combined as (
    select
      scored.*,
      least(coalesce(farm_points, 0), coalesce(attendance_points, 0)) as farm_bonus,
      coalesce(attendance_points, 0)
        + least(coalesce(farm_points, 0), coalesce(attendance_points, 0)) as total_points
    from scored
  ),
  ranked as (
    select
      combined.*,
      total_points as points,
      row_number() over (
        order by total_points desc, attendance_points desc, farm_bonus desc, farm_points desc,
          best_streak desc, present_days desc, on_time_days desc, completed_days desc,
          note_days desc, total_minutes desc, name asc
      )::int as rank
    from combined
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.rank), '[]'::jsonb)
  into v_rows
  from ranked r;

  return jsonb_build_object(
    'ok', true,
    'month', coalesce(v_month, ''),
    'generatedAt', to_char(now() at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'totalInterns', (select count(*) from public.users where role = 'intern' and active),
    'rows', v_rows
  );
end;
$$;

revoke execute on function public.app_check_in(text, text, text, text, double precision, double precision, double precision) from public;
revoke execute on function public.app_check_out(text, text, text, text, double precision, double precision, double precision) from public;
revoke execute on function public.app_bootstrap(text) from public;
revoke execute on function public.app_leaderboard(text, text) from public;

grant execute on function public.app_check_in(text, text, text, text, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.app_check_out(text, text, text, text, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.app_bootstrap(text) to anon, authenticated;
grant execute on function public.app_leaderboard(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
