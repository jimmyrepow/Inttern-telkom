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

  with intern_stats as (
    select
      u.id as user_id,
      u.name,
      u.username,
      u.avatar_emoji,
      u.avatar_color,
      coalesce(a.present_days, 0) as present_days,
      coalesce(a.on_time_days, 0) as on_time_days,
      coalesce(a.present_days, 0) - coalesce(a.on_time_days, 0) as late_days,
      coalesce(a.completed_days, 0) as completed_days
    from public.users u
    left join (
      select
        att.user_id,
        count(distinct att.date)::int as present_days,
        count(distinct att.date) filter (where att.status = 'on-time')::int as on_time_days,
        count(distinct att.date) filter (where att.check_out is not null)::int as completed_days
      from public.attendance att
      where att.check_in is not null
        and (v_start is null or (att.date >= v_start and att.date < v_end))
      group by att.user_id
    ) a on a.user_id = u.id
    where u.role = 'intern' and u.active
  ),
  scored as (
    select
      *,
      (present_days * 10 + on_time_days * 5 + completed_days * 2)::int as points
    from intern_stats
  ),
  ranked as (
    select
      *,
      row_number() over (
        order by points desc, on_time_days desc, present_days desc, name asc
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
