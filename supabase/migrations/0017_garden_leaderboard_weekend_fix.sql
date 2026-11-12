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
      coalesce(p.points, 0) as points,
      coalesce(us.current_streak, 0) as current_streak,
      coalesce(ub.best_streak, 0) as best_streak
    from public.users u
    left join per_user p on p.user_id = u.id
    left join user_streak us on us.user_id = u.id
    left join user_best ub on ub.user_id = u.id
    where u.role = 'intern' and u.active
  ),
  ranked as (
    select
      scored.*,
      row_number() over (
        order by points desc, best_streak desc, present_days desc, on_time_days desc,
          completed_days desc, note_days desc, total_minutes desc, name asc
      )::int as rank
    from scored
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

grant execute on function public.app_leaderboard(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
