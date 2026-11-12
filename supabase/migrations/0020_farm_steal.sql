create table if not exists public.farm_steals (
  id bigserial primary key,
  thief_id uuid not null references public.users (id) on delete cascade,
  owner_id uuid not null references public.users (id) on delete cascade,
  plot_index int not null check (plot_index between 1 and 5),
  seed_code text not null references public.farm_seeds (code),
  planted_at timestamptz not null,
  points int not null check (points > 0),
  steal_date date not null default ((now() at time zone public.app_timezone())::date),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint farm_steals_not_self check (thief_id <> owner_id)
);

create unique index if not exists farm_steals_plot_once_idx
  on public.farm_steals (owner_id, plot_index, planted_at);

create unique index if not exists farm_steals_thief_owner_day_idx
  on public.farm_steals (thief_id, owner_id, steal_date);

create index if not exists farm_steals_owner_recent_idx
  on public.farm_steals (owner_id, created_at desc);

create index if not exists farm_steals_thief_date_idx
  on public.farm_steals (thief_id, steal_date);

create or replace function public.farm_steal_points(p_points int)
returns int
language sql
immutable
as $$
  select case
    when coalesce(p_points, 0) <= 0 then 0
    else least(5, greatest(1, ceil(p_points * 0.25)::int))
  end;
$$;

create or replace function public.farm_state_json(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.farm_profiles%rowtype;
  v_level int;
  v_level_xp int;
  v_next_xp int;
  v_plot_count int;
  v_now timestamptz := now();
  v_today date;
  v_steal_used int;
  v_stolen_total int;
  v_plots jsonb;
  v_seeds jsonb;
  v_recent_steals jsonb;
begin
  perform public.farm_ensure_user(p_user_id);

  select * into v_profile
  from public.farm_profiles
  where user_id = p_user_id;

  v_level := public.farm_level_for_xp(v_profile.xp);
  if v_level <> v_profile.level then
    update public.farm_profiles
    set level = v_level,
        updated_at = now()
    where user_id = p_user_id;
    v_profile.level := v_level;
  end if;

  v_level_xp := coalesce(public.farm_level_xp(v_level), 0);
  v_next_xp := coalesce(public.farm_next_level_xp(v_level), v_profile.xp);
  v_plot_count := public.farm_plot_count(v_level);
  v_today := (v_now at time zone public.app_timezone())::date;

  select count(*)::int
  into v_steal_used
  from public.farm_steals
  where thief_id = p_user_id
    and steal_date = v_today;

  select coalesce(sum(points), 0)::int
  into v_stolen_total
  from public.farm_steals
  where owner_id = p_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'plot_index', p.plot_index,
    'seed_code', p.seed_code,
    'seed_name', s.name,
    'seed_emoji', s.emoji,
    'seed_color', s.color,
    'duration_minutes', s.duration_minutes,
    'points', s.points,
    'xp', s.xp,
    'planted_at', p.planted_at,
    'ready_at', p.ready_at,
    'harvest_deadline', p.harvest_deadline,
    'water_used', p.water_used,
    'fertilizer_used', p.fertilizer_used,
    'stolen_points', coalesce((
      select sum(fs.points)::int
      from public.farm_steals fs
      where fs.owner_id = p.user_id
        and fs.plot_index = p.plot_index
        and fs.planted_at = p.planted_at
        and fs.settled_at is null
    ), 0),
    'stolen_count', coalesce((
      select count(*)::int
      from public.farm_steals fs
      where fs.owner_id = p.user_id
        and fs.plot_index = p.plot_index
        and fs.planted_at = p.planted_at
        and fs.settled_at is null
    ), 0),
    'status', case
      when p.seed_code is null then 'empty'
      when v_now < p.ready_at then 'growing'
      when v_now < p.harvest_deadline then 'ready'
      when v_now < p.harvest_deadline + (p.ready_at - p.planted_at) then 'withered'
      else 'dead'
    end,
    'seconds_left', case
      when p.seed_code is null then 0
      else greatest(0, floor(extract(epoch from (p.ready_at - v_now)))::int)
    end,
    'locked', p.plot_index > v_plot_count
  ) order by p.plot_index), '[]'::jsonb)
  into v_plots
  from public.farm_plots p
  left join public.farm_seeds s on s.code = p.seed_code
  where p.user_id = p_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code', s.code,
    'name', s.name,
    'emoji', s.emoji,
    'duration_minutes', s.duration_minutes,
    'unlock_level', s.unlock_level,
    'points', s.points,
    'xp', s.xp,
    'color', s.color,
    'description', s.description,
    'unlocked', s.unlock_level <= v_level
  ) order by s.sort_order, s.unlock_level, s.name), '[]'::jsonb)
  into v_seeds
  from public.farm_seeds s
  where s.active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'plot_index', x.plot_index,
    'seed_name', x.seed_name,
    'seed_emoji', x.seed_emoji,
    'points', x.points,
    'thief_name', x.thief_name,
    'thief_username', x.thief_username,
    'created_at', x.created_at,
    'settled_at', x.settled_at
  ) order by x.created_at desc), '[]'::jsonb)
  into v_recent_steals
  from (
    select fs.id,
           fs.plot_index,
           s.name as seed_name,
           s.emoji as seed_emoji,
           fs.points,
           u.name as thief_name,
           u.username as thief_username,
           fs.created_at,
           fs.settled_at
    from public.farm_steals fs
    join public.users u on u.id = fs.thief_id
    join public.farm_seeds s on s.code = fs.seed_code
    where fs.owner_id = p_user_id
    order by fs.created_at desc
    limit 8
  ) x;

  return jsonb_build_object(
    'ok', true,
    'serverNow', v_now,
    'profile', jsonb_build_object(
      'xp', v_profile.xp,
      'level', v_level,
      'level_xp', v_level_xp,
      'next_xp', v_next_xp,
      'progress', case
        when v_next_xp > v_level_xp then
          round(((v_profile.xp - v_level_xp)::numeric / (v_next_xp - v_level_xp)) * 100)
        else 100
      end,
      'max_level', v_level >= 20,
      'water', v_profile.water,
      'fertilizer', v_profile.fertilizer,
      'total_harvests', v_profile.total_harvests,
      'total_points', v_profile.total_points,
      'stolen_points', v_stolen_total,
      'steal_unlock_level', 3,
      'steal_daily_limit', 3,
      'steal_used_today', v_steal_used,
      'steal_remaining', greatest(0, 3 - v_steal_used),
      'steal_unlocked', v_level >= 3,
      'plot_count', v_plot_count,
      'max_plots', 5,
      'next_plot_level', case
        when v_level < 3 then 3
        when v_level < 6 then 6
        when v_level < 10 then 10
        else null
      end
    ),
    'seeds', v_seeds,
    'plots', v_plots,
    'recentSteals', v_recent_steals
  );
end;
$$;

create or replace function public.app_farm_targets(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_profile public.farm_profiles%rowtype;
  v_level int;
  v_today date;
  v_used int;
  v_targets jsonb;
  v_limit int := 3;
  v_unlock int := 3;
begin
  v_user := public.require_user(p_token);
  perform public.farm_ensure_user(v_user.id);

  select * into v_profile
  from public.farm_profiles
  where user_id = v_user.id;

  v_level := public.farm_level_for_xp(v_profile.xp);
  v_today := (now() at time zone public.app_timezone())::date;

  select count(*)::int
  into v_used
  from public.farm_steals
  where thief_id = v_user.id
    and steal_date = v_today;

  if v_level < v_unlock then
    return jsonb_build_object(
      'ok', true,
      'unlocked', false,
      'level', v_level,
      'unlockLevel', v_unlock,
      'dailyLimit', v_limit,
      'usedToday', v_used,
      'remaining', greatest(0, v_limit - v_used),
      'targets', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'ownerId', x.owner_id,
    'ownerName', x.owner_name,
    'ownerUsername', x.owner_username,
    'avatarEmoji', x.avatar_emoji,
    'avatarColor', x.avatar_color,
    'plotIndex', x.plot_index,
    'seedCode', x.seed_code,
    'seedName', x.seed_name,
    'seedEmoji', x.seed_emoji,
    'seedColor', x.seed_color,
    'basePoints', x.base_points,
    'stealPoints', x.steal_points,
    'readyAt', x.ready_at,
    'harvestDeadline', x.harvest_deadline
  ) order by x.ready_at asc), '[]'::jsonb)
  into v_targets
  from (
    select u.id as owner_id,
           u.name as owner_name,
           u.username as owner_username,
           u.avatar_emoji,
           u.avatar_color,
           p.plot_index,
           s.code as seed_code,
           s.name as seed_name,
           s.emoji as seed_emoji,
           s.color as seed_color,
           s.points as base_points,
           public.farm_steal_points(s.points) as steal_points,
           p.ready_at,
           p.harvest_deadline
    from public.farm_plots p
    join public.users u on u.id = p.user_id
    join public.farm_seeds s on s.code = p.seed_code
    where p.user_id <> v_user.id
      and u.role = 'intern'
      and u.active
      and p.seed_code is not null
      and now() >= p.ready_at
      and now() < p.harvest_deadline
      and not exists (
        select 1
        from public.farm_steals fs
        where fs.owner_id = p.user_id
          and fs.plot_index = p.plot_index
          and fs.planted_at = p.planted_at
      )
      and not exists (
        select 1
        from public.farm_steals fs2
        where fs2.thief_id = v_user.id
          and fs2.owner_id = p.user_id
          and fs2.steal_date = v_today
      )
    order by p.ready_at asc
  ) x;

  return jsonb_build_object(
    'ok', true,
    'unlocked', true,
    'level', v_level,
    'unlockLevel', v_unlock,
    'dailyLimit', v_limit,
    'usedToday', v_used,
    'remaining', greatest(0, v_limit - v_used),
    'targets', coalesce(v_targets, '[]'::jsonb)
  );
end;
$$;

create or replace function public.app_farm_steal(p_token text, p_owner_id uuid, p_plot_index int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_profile public.farm_profiles%rowtype;
  v_owner public.users%rowtype;
  v_plot public.farm_plots%rowtype;
  v_seed public.farm_seeds%rowtype;
  v_level int;
  v_today date;
  v_used int;
  v_points int;
  v_limit int := 3;
  v_unlock int := 3;
begin
  v_user := public.require_user(p_token);
  perform public.farm_ensure_user(v_user.id);

  if p_owner_id is null or p_plot_index is null then
    raise exception 'Data panen tidak valid.';
  end if;

  if p_owner_id = v_user.id then
    raise exception 'Tidak bisa mencuri panen sendiri.';
  end if;

  select * into v_profile
  from public.farm_profiles
  where user_id = v_user.id
  for update;

  v_level := public.farm_level_for_xp(v_profile.xp);
  v_today := (now() at time zone public.app_timezone())::date;

  if v_level < v_unlock then
    raise exception 'Curi panen terbuka pada level %.', v_unlock;
  end if;

  select count(*)::int
  into v_used
  from public.farm_steals
  where thief_id = v_user.id
    and steal_date = v_today;

  if v_used >= v_limit then
    raise exception 'Batas curi panen hari ini sudah habis (%).', v_limit;
  end if;

  select * into v_owner
  from public.users
  where id = p_owner_id
    and role = 'intern'
    and active;

  if v_owner.id is null then
    raise exception 'Pemilik kebun tidak ditemukan.';
  end if;

  select * into v_plot
  from public.farm_plots
  where user_id = p_owner_id
    and plot_index = p_plot_index
  for update;

  if v_plot.user_id is null or v_plot.seed_code is null then
    raise exception 'Plot target sedang kosong.';
  end if;

  if now() < v_plot.ready_at then
    raise exception 'Panen target belum siap.';
  end if;

  if now() >= v_plot.harvest_deadline then
    raise exception 'Panen target sudah tidak bisa dicuri.';
  end if;

  if exists (
    select 1
    from public.farm_steals fs
    where fs.owner_id = p_owner_id
      and fs.plot_index = p_plot_index
      and fs.planted_at = v_plot.planted_at
  ) then
    raise exception 'Panen plot ini sudah pernah dicuri.';
  end if;

  if exists (
    select 1
    from public.farm_steals fs
    where fs.thief_id = v_user.id
      and fs.owner_id = p_owner_id
      and fs.steal_date = v_today
  ) then
    raise exception 'Anda sudah mencuri dari peserta ini hari ini.';
  end if;

  select * into v_seed
  from public.farm_seeds
  where code = v_plot.seed_code;

  v_points := public.farm_steal_points(v_seed.points);

  if v_points <= 0 then
    raise exception 'Tidak ada poin yang bisa dicuri dari tanaman ini.';
  end if;

  begin
    insert into public.farm_steals (
      thief_id, owner_id, plot_index, seed_code, planted_at, points, steal_date
    )
    values (
      v_user.id, p_owner_id, p_plot_index, v_seed.code, v_plot.planted_at, v_points, v_today
    );
  exception when unique_violation then
    raise exception 'Panen ini baru saja dicuri orang lain. Coba target lain.';
  end;

  return jsonb_build_object(
    'ok', true,
    'message', 'Berhasil mencuri ' || v_points || ' poin ' || v_seed.name || ' dari ' || v_owner.name || '.',
    'points', v_points,
    'seedName', v_seed.name,
    'ownerName', v_owner.name,
    'state', public.farm_state_json(v_user.id)
  );
end;
$$;

create or replace function public.app_farm_harvest(p_token text, p_plot_index int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_profile public.farm_profiles%rowtype;
  v_seed public.farm_seeds%rowtype;
  v_plot public.farm_plots%rowtype;
  v_now timestamptz := now();
  v_duration interval;
  v_points int := 0;
  v_xp int := 0;
  v_stolen int := 0;
  v_quality text := 'normal';
  v_message text := 'Panen berhasil.';
  v_new_xp int;
  v_new_level int;
begin
  v_user := public.require_user(p_token);
  perform public.farm_ensure_user(v_user.id);

  select * into v_profile
  from public.farm_profiles
  where user_id = v_user.id
  for update;

  select * into v_plot
  from public.farm_plots
  where user_id = v_user.id
    and plot_index = p_plot_index
  for update;

  if v_plot.user_id is null or v_plot.seed_code is null then
    raise exception 'Plot ini kosong.';
  end if;

  select * into v_seed
  from public.farm_seeds
  where code = v_plot.seed_code;

  if v_seed.code is null then
    raise exception 'Bibit tidak ditemukan.';
  end if;

  if v_now < v_plot.ready_at then
    raise exception 'Tanaman belum siap panen.';
  end if;

  v_duration := v_plot.ready_at - v_plot.planted_at;

  if v_now < v_plot.harvest_deadline then
    v_points := v_seed.points;
    v_xp := v_seed.xp;
    v_quality := 'normal';
    v_message := 'Panen berhasil.';
  elsif v_now < v_plot.harvest_deadline + v_duration then
    v_points := floor(v_seed.points * 0.5)::int;
    v_xp := floor(v_seed.xp * 0.5)::int;
    v_quality := 'withered';
    v_message := 'Tanaman layu. Hasil panen 50%.';
  else
    v_points := 0;
    v_xp := 0;
    v_quality := 'dead';
    v_message := 'Tanaman sudah kering. Plot dibersihkan tanpa hasil.';
  end if;

  if v_plot.fertilizer_used and v_points > 0 then
    v_points := ceil(v_points * 1.2)::int;
  end if;

  select coalesce(sum(fs.points), 0)::int
  into v_stolen
  from public.farm_steals fs
  where fs.owner_id = v_user.id
    and fs.plot_index = p_plot_index
    and fs.planted_at = v_plot.planted_at
    and fs.settled_at is null;

  if v_stolen > 0 and v_points > 0 then
    v_points := greatest(0, v_points - v_stolen);
    if v_points = 0 then
      v_message := v_message || ' Seluruh hasil panen telah dicuri.';
    else
      v_message := v_message || ' Sebanyak ' || v_stolen || ' poin panen dicuri.';
    end if;
  end if;

  insert into public.farm_harvests (
    user_id, plot_index, seed_code, planted_at, harvested_at, points, xp, quality, harvest_date
  )
  values (
    v_user.id,
    p_plot_index,
    v_seed.code,
    v_plot.planted_at,
    v_now,
    v_points,
    v_xp,
    v_quality,
    (v_now at time zone public.app_timezone())::date
  );

  update public.farm_steals
  set settled_at = v_now
  where owner_id = v_user.id
    and plot_index = p_plot_index
    and planted_at = v_plot.planted_at
    and settled_at is null;

  v_new_xp := v_profile.xp + v_xp;
  v_new_level := public.farm_level_for_xp(v_new_xp);

  update public.farm_profiles
  set xp = v_new_xp,
      level = v_new_level,
      total_harvests = total_harvests + 1,
      total_points = total_points + v_points,
      updated_at = v_now
  where user_id = v_user.id;

  update public.farm_plots
  set seed_code = null,
      planted_at = null,
      ready_at = null,
      harvest_deadline = null,
      water_used = false,
      fertilizer_used = false,
      updated_at = v_now
  where user_id = v_user.id
    and plot_index = p_plot_index;

  return jsonb_build_object(
    'ok', true,
    'message', v_message,
    'quality', v_quality,
    'points', v_points,
    'xp', v_xp,
    'stolen', v_stolen,
    'leveledUp', v_new_level > v_profile.level,
    'level', v_new_level,
    'state', public.farm_state_json(v_user.id)
  );
end;
$$;

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

revoke execute on function public.farm_steal_points(int) from public, anon, authenticated;

grant execute on function public.app_farm_targets(text) to anon, authenticated;
grant execute on function public.app_farm_steal(text, uuid, int) to anon, authenticated;

notify pgrst, 'reload schema';
