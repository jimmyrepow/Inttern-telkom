create table if not exists public.farm_seeds (
  code text primary key,
  name text not null,
  emoji text not null default '🌱',
  duration_minutes int not null check (duration_minutes > 0),
  unlock_level int not null default 1 check (unlock_level >= 1),
  points int not null default 0 check (points >= 0),
  xp int not null default 0 check (xp >= 0),
  color text not null default '#10b981',
  description text not null default '',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.farm_seeds (code, name, emoji, duration_minutes, unlock_level, points, xp, color, description, sort_order)
values
  ('kacang', 'Kacang Cepat', '🌱', 30, 1, 1, 5, '#84cc16', 'Bibit pemula yang cepat panen untuk pemanasan.', 10),
  ('selada', 'Selada', '🥬', 120, 2, 3, 12, '#22c55e', 'Seimbang antara waktu tunggu dan hasil.', 20),
  ('cabai', 'Cabai', '🌶️', 240, 3, 5, 20, '#ef4444', 'Cocok ditanam saat istirahat siang.', 30),
  ('tomat', 'Tomat', '🍅', 480, 5, 8, 30, '#f97316', 'Pas untuk satu hari kerja penuh.', 40),
  ('jagung', 'Jagung', '🌽', 720, 7, 10, 40, '#f59e0b', 'Tanam siang, panen besok pagi.', 50),
  ('labu', 'Labu', '🎃', 1440, 10, 15, 60, '#f97316', 'Panen sehari kemudian dengan hasil besar.', 60),
  ('matahari', 'Bunga Matahari', '🌻', 4320, 14, 25, 100, '#eab308', 'Proyek jangka panjang untuk kebun veteran.', 70)
on conflict (code) do update set
  name = excluded.name,
  emoji = excluded.emoji,
  duration_minutes = excluded.duration_minutes,
  unlock_level = excluded.unlock_level,
  points = excluded.points,
  xp = excluded.xp,
  color = excluded.color,
  description = excluded.description,
  sort_order = excluded.sort_order,
  active = true;

create table if not exists public.farm_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  xp int not null default 0 check (xp >= 0),
  level int not null default 1 check (level >= 1),
  water int not null default 0 check (water >= 0),
  fertilizer int not null default 0 check (fertilizer >= 0),
  total_harvests int not null default 0 check (total_harvests >= 0),
  total_points int not null default 0 check (total_points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.farm_plots (
  user_id uuid not null references public.users (id) on delete cascade,
  plot_index int not null check (plot_index between 1 and 5),
  seed_code text references public.farm_seeds (code),
  planted_at timestamptz,
  ready_at timestamptz,
  harvest_deadline timestamptz,
  water_used boolean not null default false,
  fertilizer_used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, plot_index)
);

create table if not exists public.farm_harvests (
  id bigserial primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  plot_index int not null,
  seed_code text not null references public.farm_seeds (code),
  planted_at timestamptz,
  harvested_at timestamptz not null default now(),
  points int not null default 0,
  xp int not null default 0,
  quality text not null default 'normal' check (quality in ('normal', 'withered', 'dead')),
  harvest_date date not null default ((now() at time zone public.app_timezone())::date),
  created_at timestamptz not null default now()
);

create index if not exists farm_harvests_user_date_idx
  on public.farm_harvests (user_id, harvest_date);

create table if not exists public.farm_grants (
  user_id uuid not null references public.users (id) on delete cascade,
  grant_date date not null,
  kind text not null check (kind in ('water', 'fertilizer')),
  created_at timestamptz not null default now(),
  primary key (user_id, grant_date, kind)
);

create or replace function public.farm_level_for_xp(p_xp int)
returns int
language sql
immutable
as $$
  select coalesce(max(level), 1)
  from (values
    (1, 0),
    (2, 50),
    (3, 120),
    (4, 220),
    (5, 350),
    (6, 520),
    (7, 730),
    (8, 980),
    (9, 1270),
    (10, 1600),
    (11, 1980),
    (12, 2410),
    (13, 2890),
    (14, 3420),
    (15, 4000),
    (16, 4640),
    (17, 5340),
    (18, 6100),
    (19, 6920),
    (20, 7800)
  ) as thresholds (level, xp_required)
  where greatest(coalesce(p_xp, 0), 0) >= xp_required;
$$;

create or replace function public.farm_level_xp(p_level int)
returns int
language sql
immutable
as $$
  select xp_required
  from (values
    (1, 0),
    (2, 50),
    (3, 120),
    (4, 220),
    (5, 350),
    (6, 520),
    (7, 730),
    (8, 980),
    (9, 1270),
    (10, 1600),
    (11, 1980),
    (12, 2410),
    (13, 2890),
    (14, 3420),
    (15, 4000),
    (16, 4640),
    (17, 5340),
    (18, 6100),
    (19, 6920),
    (20, 7800)
  ) as thresholds (level, xp_required)
  where level = greatest(1, least(coalesce(p_level, 1), 20))
  limit 1;
$$;

create or replace function public.farm_next_level_xp(p_level int)
returns int
language sql
immutable
as $$
  select case
    when greatest(coalesce(p_level, 1), 1) >= 20 then null
    else public.farm_level_xp(greatest(coalesce(p_level, 1), 1) + 1)
  end;
$$;

create or replace function public.farm_plot_count(p_level int)
returns int
language sql
immutable
as $$
  select case
    when lv >= 10 then 5
    when lv >= 6 then 4
    when lv >= 3 then 3
    else 2
  end
  from (
    select greatest(coalesce(p_level, 1), 1) as lv
  ) value;
$$;

create or replace function public.farm_ensure_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.farm_profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.farm_plots (user_id, plot_index)
  select p_user_id, plot_index
  from generate_series(1, 5) as plot_index
  on conflict (user_id, plot_index) do nothing;
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
  v_plots jsonb;
  v_seeds jsonb;
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
    'plots', v_plots
  );
end;
$$;

create or replace function public.app_farm_state(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
begin
  v_user := public.require_user(p_token);
  return public.farm_state_json(v_user.id);
end;
$$;

create or replace function public.app_farm_plant(p_token text, p_plot_index int, p_seed_code text)
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
  v_level int;
  v_plot_count int;
  v_now timestamptz := now();
begin
  v_user := public.require_user(p_token);
  perform public.farm_ensure_user(v_user.id);

  select * into v_profile
  from public.farm_profiles
  where user_id = v_user.id
  for update;

  v_level := public.farm_level_for_xp(v_profile.xp);
  v_plot_count := public.farm_plot_count(v_level);

  if p_plot_index is null or p_plot_index < 1 or p_plot_index > v_plot_count then
    raise exception 'Plot belum terbuka. Naikkan level kebun untuk membuka plot ini.';
  end if;

  select * into v_seed
  from public.farm_seeds
  where code = lower(trim(coalesce(p_seed_code, '')))
    and active;

  if v_seed.code is null then
    raise exception 'Bibit tidak ditemukan.';
  end if;

  if v_level < v_seed.unlock_level then
    raise exception 'Bibit ini terbuka pada level %.', v_seed.unlock_level;
  end if;

  select * into v_plot
  from public.farm_plots
  where user_id = v_user.id
    and plot_index = p_plot_index
  for update;

  if v_plot.user_id is null then
    raise exception 'Plot tidak ditemukan.';
  end if;

  if v_plot.seed_code is not null then
    raise exception 'Plot ini masih ditanami.';
  end if;

  update public.farm_plots
  set seed_code = v_seed.code,
      planted_at = v_now,
      ready_at = v_now + make_interval(mins => v_seed.duration_minutes),
      harvest_deadline = v_now + make_interval(mins => v_seed.duration_minutes * 2),
      water_used = false,
      fertilizer_used = false,
      updated_at = v_now
  where user_id = v_user.id
    and plot_index = p_plot_index;

  return jsonb_build_object(
    'ok', true,
    'message', 'Bibit ' || v_seed.name || ' ditanam.',
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
    'leveledUp', v_new_level > v_profile.level,
    'level', v_new_level,
    'state', public.farm_state_json(v_user.id)
  );
end;
$$;

create or replace function public.app_farm_boost(p_token text, p_plot_index int, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_profile public.farm_profiles%rowtype;
  v_plot public.farm_plots%rowtype;
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_now timestamptz := now();
  v_ready_at timestamptz;
  v_duration interval;
  v_message text;
begin
  v_user := public.require_user(p_token);
  perform public.farm_ensure_user(v_user.id);

  if v_kind not in ('water', 'fertilizer') then
    raise exception 'Jenis perawatan tidak valid.';
  end if;

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

  v_duration := v_plot.ready_at - v_plot.planted_at;

  if v_now >= v_plot.harvest_deadline + v_duration then
    raise exception 'Tanaman sudah kering. Bersihkan plot terlebih dahulu.';
  end if;

  if v_kind = 'water' then
    if v_profile.water <= 0 then
      raise exception 'Air habis. Absen masuk untuk mendapat air.';
    end if;
    if v_plot.water_used then
      raise exception 'Air sudah diberikan ke tanaman ini.';
    end if;
    if v_now >= v_plot.ready_at then
      raise exception 'Tanaman sudah siap panen. Air tidak diperlukan.';
    end if;

    v_ready_at := greatest(v_now, v_plot.ready_at - interval '15 minutes');

    update public.farm_profiles
    set water = water - 1,
        updated_at = v_now
    where user_id = v_user.id;

    update public.farm_plots
    set water_used = true,
        ready_at = v_ready_at,
        harvest_deadline = v_ready_at + v_duration,
        updated_at = v_now
    where user_id = v_user.id
      and plot_index = p_plot_index;

    v_message := 'Air diberikan. Waktu panen dipercepat 15 menit.';
  else
    if v_profile.fertilizer <= 0 then
      raise exception 'Pupuk habis. Absen pulang untuk mendapat pupuk.';
    end if;
    if v_plot.fertilizer_used then
      raise exception 'Pupuk sudah diberikan ke tanaman ini.';
    end if;

    update public.farm_profiles
    set fertilizer = fertilizer - 1,
        updated_at = v_now
    where user_id = v_user.id;

    update public.farm_plots
    set fertilizer_used = true,
        updated_at = v_now
    where user_id = v_user.id
      and plot_index = p_plot_index;

    v_message := 'Pupuk diberikan. Hasil panen +20%.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', v_message,
    'state', public.farm_state_json(v_user.id)
  );
end;
$$;

create or replace function public.farm_grant_from_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grant boolean;
begin
  perform public.farm_ensure_user(new.user_id);

  v_grant := false;
  if tg_op = 'INSERT' then
    v_grant := new.check_in is not null;
  elsif tg_op = 'UPDATE' then
    v_grant := new.check_in is not null and old.check_in is null;
  end if;

  if v_grant then
    v_grant := false;
    insert into public.farm_grants (user_id, grant_date, kind)
    values (new.user_id, new.date, 'water')
    on conflict (user_id, grant_date, kind) do nothing
    returning true into v_grant;
    if v_grant then
      update public.farm_profiles
      set water = water + 1,
          updated_at = now()
      where user_id = new.user_id;
    end if;
  end if;

  v_grant := false;
  if tg_op = 'INSERT' then
    v_grant := new.check_out is not null;
  elsif tg_op = 'UPDATE' then
    v_grant := new.check_out is not null and old.check_out is null;
  end if;

  if v_grant then
    v_grant := false;
    insert into public.farm_grants (user_id, grant_date, kind)
    values (new.user_id, new.date, 'fertilizer')
    on conflict (user_id, grant_date, kind) do nothing
    returning true into v_grant;
    if v_grant then
      update public.farm_profiles
      set fertilizer = fertilizer + 1,
          updated_at = now()
      where user_id = new.user_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists farm_grant_attendance on public.attendance;
create trigger farm_grant_attendance
after insert or update of check_in, check_out on public.attendance
for each row execute function public.farm_grant_from_attendance();

insert into public.farm_profiles (user_id)
select u.id
from public.users u
where u.role = 'intern'
on conflict (user_id) do nothing;

insert into public.farm_plots (user_id, plot_index)
select u.id, plot_index
from public.users u
cross join generate_series(1, 5) as plot_index
where u.role = 'intern'
on conflict (user_id, plot_index) do nothing;

insert into public.farm_grants (user_id, grant_date, kind)
select a.user_id, a.date, 'water'
from public.attendance a
where a.check_in is not null
on conflict (user_id, grant_date, kind) do nothing;

insert into public.farm_grants (user_id, grant_date, kind)
select a.user_id, a.date, 'fertilizer'
from public.attendance a
where a.check_out is not null
on conflict (user_id, grant_date, kind) do nothing;

update public.farm_profiles p
set water = least(g.water, 30),
    fertilizer = least(g.fertilizer, 30),
    updated_at = now()
from (
  select user_id,
         count(*) filter (where kind = 'water')::int as water,
         count(*) filter (where kind = 'fertilizer')::int as fertilizer
  from public.farm_grants
  group by user_id
) g
where p.user_id = g.user_id
  and p.water = 0
  and p.fertilizer = 0;

revoke execute on function public.farm_level_for_xp(int) from public, anon, authenticated;
revoke execute on function public.farm_level_xp(int) from public, anon, authenticated;
revoke execute on function public.farm_next_level_xp(int) from public, anon, authenticated;
revoke execute on function public.farm_plot_count(int) from public, anon, authenticated;
revoke execute on function public.farm_ensure_user(uuid) from public, anon, authenticated;
revoke execute on function public.farm_state_json(uuid) from public, anon, authenticated;
revoke execute on function public.farm_grant_from_attendance() from public, anon, authenticated;

grant execute on function public.app_farm_state(text) to anon, authenticated;
grant execute on function public.app_farm_plant(text, int, text) to anon, authenticated;
grant execute on function public.app_farm_harvest(text, int) to anon, authenticated;
grant execute on function public.app_farm_boost(text, int, text) to anon, authenticated;

notify pgrst, 'reload schema';
