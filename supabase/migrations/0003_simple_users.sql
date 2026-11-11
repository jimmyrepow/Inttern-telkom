create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username ~ '^[a-z0-9._-]{3,40}$'),
  name text not null check (char_length(name) between 2 and 100),
  password text not null,
  role text not null default 'intern' check (role in ('admin', 'intern')),
  active boolean not null default true,
  last_login_at timestamptz,
  password_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  token text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sessions_user_idx on public.sessions (user_id);
create index if not exists sessions_expires_idx on public.sessions (expires_at);

do $$
begin
  if to_regclass('public.profiles') is not null then
    insert into public.users (id, username, name, password, role, active, password_updated_at, created_at, updated_at)
    select
      p.id,
      p.username,
      p.name,
      coalesce(u.encrypted_password, extensions.crypt('changeme', extensions.gen_salt('bf'))),
      case when p.role = 'admin' then 'admin' else 'intern' end,
      p.active,
      coalesce(p.password_updated_at, p.created_at, now()),
      p.created_at,
      p.updated_at
    from public.profiles p
    left join auth.users u on u.id = p.id
    on conflict (username) do nothing;
  end if;
end;
$$;

delete from public.attendance a
where not exists (select 1 from public.users u where u.id = a.user_id);

drop policy if exists profiles_select on public.profiles;
drop policy if exists attendance_select on public.attendance;
drop policy if exists settings_select on public.settings;
drop policy if exists logs_select on public.logs;
drop policy if exists attendance_photos_read on storage.objects;
drop policy if exists attendance_photos_insert on storage.objects;
drop policy if exists attendance_photos_update on storage.objects;
drop policy if exists attendance_photos_delete on storage.objects;

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.attendance'::regclass
      and contype = 'f'
      and confrelid = 'public.profiles'::regclass
  loop
    execute format('alter table public.attendance drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.attendance drop constraint if exists attendance_user_id_fkey;
alter table public.attendance
  add constraint attendance_user_id_fkey
  foreign key (user_id) references public.users (id) on delete cascade;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_password_changed on auth.users;

drop function if exists public.app_email_domain();
drop function if exists public.is_admin();
drop function if exists public.log_action(text, text);
drop function if exists public.handle_new_user();
drop function if exists public.create_user_internal(text, text, text, text, boolean);
drop function if exists public.create_first_admin(text, text, text);
drop function if exists public.app_bootstrap();
drop function if exists public.app_check_in(text, text, text);
drop function if exists public.app_check_out(text, text, text);
drop function if exists public.app_save_settings(jsonb);
drop function if exists public.app_delete_attendance(uuid);
drop function if exists public.admin_create_user(text, text, text, text, boolean);
drop function if exists public.admin_update_user(uuid, text, text, text, boolean, text);
drop function if exists public.admin_delete_user(uuid);
drop function if exists public.admin_delete_user_attendance(uuid);
drop function if exists public.app_export_data();
drop function if exists public.admin_reset_password(uuid, text);
drop function if exists public.admin_account_info();
drop function if exists public.sync_password_updated_at();

drop table if exists public.profiles cascade;

delete from public.settings where key = 'email_domain';

insert into public.settings (key, value, description) values
  ('app_name', 'TELKOM AKSES INTERNSHIP', 'Nama aplikasi'),
  ('late_limit', '08:15', 'Batas jam absen masuk'),
  ('office_name', 'Telkom Akses', 'Nama kantor'),
  ('office_lat', '', 'Latitude kantor'),
  ('office_lng', '', 'Longitude kantor'),
  ('max_radius_m', '', 'Radius absensi dalam meter'),
  ('timezone', 'Asia/Jakarta', 'Zona waktu aplikasi')
on conflict (key) do nothing;

drop trigger if exists users_touch on public.users;
create trigger users_touch before update on public.users
for each row execute function public.touch_updated_at();

create or replace function public.log_action(p_actor text, p_action text, p_detail text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.logs (actor, action, detail)
  values (coalesce(nullif(p_actor, ''), 'system'), p_action, coalesce(p_detail, ''));
end;
$$;

create or replace function public.require_user(p_token text)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
begin
  if coalesce(p_token, '') = '' then
    raise exception 'Sesi tidak valid. Silakan login ulang.';
  end if;

  select u.* into v_user
  from public.sessions s
  join public.users u on u.id = s.user_id
  where s.token = p_token
    and s.expires_at > now()
    and u.active;

  if v_user.id is null then
    raise exception 'Sesi tidak valid. Silakan login ulang.';
  end if;

  return v_user;
end;
$$;

create or replace function public.require_admin(p_token text)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
begin
  v_user := public.require_user(p_token);
  if v_user.role <> 'admin' then
    raise exception 'Aksi ini hanya untuk admin.';
  end if;
  return v_user;
end;
$$;

create or replace function public.app_login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.users%rowtype;
  v_token text;
begin
  select * into v_user
  from public.users
  where username = lower(trim(p_username));

  if v_user.id is null or not v_user.active then
    raise exception 'Username atau password salah.';
  end if;

  if v_user.password <> extensions.crypt(coalesce(p_password, ''), v_user.password) then
    raise exception 'Username atau password salah.';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.sessions (token, user_id, expires_at)
  values (v_token, v_user.id, now() + interval '12 hours');

  update public.users set last_login_at = now() where id = v_user.id;
  delete from public.sessions where expires_at <= now();

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'user', jsonb_build_object(
      'id', v_user.id,
      'username', v_user.username,
      'name', v_user.name,
      'role', v_user.role,
      'active', v_user.active,
      'last_login_at', now(),
      'password_updated_at', v_user.password_updated_at,
      'created_at', v_user.created_at
    )
  );
end;
$$;

create or replace function public.app_logout(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.sessions where token = p_token;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.app_session(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
begin
  v_user := public.require_user(p_token);
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

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_settings from public.settings;

  v_stats := jsonb_build_object(
    'totalInterns', (select count(*) from public.users where role = 'intern' and active),
    'totalAttendanceToday', (select count(*) from public.attendance where date = v_today),
    'onTime', (select count(*) from public.attendance where date = v_today and status = 'on-time'),
    'late', (select count(*) from public.attendance where date = v_today and status = 'late'),
    'absent', greatest(
      (select count(*) from public.users where role = 'intern' and active) -
      (select count(*) from public.attendance where date = v_today),
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

create or replace function public.app_check_in(
  p_token text,
  p_location text default '',
  p_note text default '',
  p_photo_url text default ''
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
begin
  v_user := public.require_user(p_token);
  v_tz := public.app_timezone();
  v_today := (now() at time zone v_tz)::date;
  v_now := (now() at time zone v_tz)::time;

  select * into v_row from public.attendance where user_id = v_user.id and date = v_today;
  if v_row.id is not null and v_row.check_in is not null then
    raise exception 'Anda sudah absen masuk hari ini.';
  end if;

  select coalesce(nullif(value, '')::time, '08:15'::time) into v_limit
  from public.settings where key = 'late_limit';

  v_status := case when v_now > coalesce(v_limit, '08:15'::time) then 'late' else 'on-time' end;

  if v_row.id is null then
    insert into public.attendance (user_id, name, date, check_in, status, photo_url, location, note, source)
    values (v_user.id, v_user.name, v_today, v_now, v_status, coalesce(p_photo_url, ''), coalesce(p_location, ''), coalesce(p_note, ''), 'web');
  else
    update public.attendance
    set check_in = v_now,
        status = v_status,
        photo_url = coalesce(nullif(p_photo_url, ''), photo_url),
        location = coalesce(nullif(p_location, ''), location),
        note = coalesce(p_note, note),
        updated_at = now()
    where id = v_row.id;
  end if;

  perform public.log_action(v_user.username, 'check-in', v_today::text);

  return jsonb_build_object(
    'ok', true,
    'message', 'Absen masuk berhasil.',
    'date', v_today,
    'time', to_char(v_now, 'HH24:MI')
  );
end;
$$;

create or replace function public.app_check_out(
  p_token text,
  p_location text default '',
  p_note text default '',
  p_photo_url text default ''
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
  v_row public.attendance%rowtype;
begin
  v_user := public.require_user(p_token);
  v_tz := public.app_timezone();
  v_today := (now() at time zone v_tz)::date;
  v_now := (now() at time zone v_tz)::time;

  select * into v_row from public.attendance where user_id = v_user.id and date = v_today;
  if v_row.id is null or v_row.check_in is null then
    raise exception 'Anda belum absen masuk hari ini.';
  end if;
  if v_row.check_out is not null then
    raise exception 'Anda sudah absen pulang hari ini.';
  end if;

  update public.attendance
  set check_out = v_now,
      photo_out_url = coalesce(nullif(p_photo_url, ''), photo_out_url),
      location = coalesce(nullif(p_location, ''), location),
      note = coalesce(p_note, note),
      updated_at = now()
  where id = v_row.id;

  perform public.log_action(v_user.username, 'check-out', v_today::text);

  return jsonb_build_object(
    'ok', true,
    'message', 'Absen pulang berhasil.',
    'date', v_today,
    'time', to_char(v_now, 'HH24:MI')
  );
end;
$$;

create or replace function public.app_save_settings(p_token text, p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_key text;
  v_value text;
  v_allowed text[] := array['app_name', 'late_limit', 'office_name', 'office_lat', 'office_lng', 'max_radius_m', 'timezone'];
  v_result jsonb;
begin
  v_admin := public.require_admin(p_token);

  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Pengaturan tidak valid.';
  end if;

  for v_key, v_value in select key, value from jsonb_each_text(p_settings)
  loop
    if v_key = any(v_allowed) then
      insert into public.settings (key, value, updated_at)
      values (v_key, coalesce(v_value, ''), now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
    end if;
  end loop;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_result from public.settings;
  perform public.log_action(v_admin.username, 'update-settings', p_settings::text);

  return jsonb_build_object('ok', true, 'message', 'Pengaturan berhasil diperbarui.', 'settings', v_result);
end;
$$;

create or replace function public.app_delete_attendance(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_row public.attendance%rowtype;
begin
  v_admin := public.require_admin(p_token);

  select * into v_row from public.attendance where id = p_id;
  if v_row.id is null then
    raise exception 'Data absensi tidak ditemukan.';
  end if;

  delete from public.attendance where id = p_id;
  perform public.log_action(v_admin.username, 'delete-attendance', v_row.name || ' | ' || v_row.date);

  return jsonb_build_object(
    'ok', true,
    'message', 'Data absensi berhasil dihapus.',
    'photo_urls', jsonb_build_array(v_row.photo_url, v_row.photo_out_url)
  );
end;
$$;

create or replace function public.admin_create_user(
  p_token text,
  p_username text,
  p_name text,
  p_password text,
  p_role text default 'intern',
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin public.users%rowtype;
  v_username text := lower(trim(p_username));
  v_name text := trim(p_name);
  v_role text := case when lower(coalesce(p_role, 'intern')) = 'admin' then 'admin' else 'intern' end;
  v_user public.users%rowtype;
begin
  v_admin := public.require_admin(p_token);

  if v_username !~ '^[a-z0-9._-]{3,40}$' then
    raise exception 'Username 3-40 karakter, hanya huruf kecil, angka, titik, garis bawah, atau strip.';
  end if;
  if coalesce(v_name, '') = '' then
    raise exception 'Nama wajib diisi.';
  end if;
  if coalesce(p_password, '') = '' or length(p_password) < 6 then
    raise exception 'Password minimal 6 karakter.';
  end if;
  if exists (select 1 from public.users where username = v_username) then
    raise exception 'Username sudah terdaftar.';
  end if;

  insert into public.users (username, name, password, role, active)
  values (v_username, v_name, extensions.crypt(p_password, extensions.gen_salt('bf')), v_role, coalesce(p_active, true))
  returning * into v_user;

  perform public.log_action(v_admin.username, 'create-user', v_username);

  return jsonb_build_object(
    'ok', true,
    'message', 'Akun berhasil ditambahkan.',
    'user', jsonb_build_object(
      'id', v_user.id,
      'username', v_user.username,
      'name', v_user.name,
      'role', v_user.role,
      'active', v_user.active,
      'password_updated_at', v_user.password_updated_at,
      'created_at', v_user.created_at
    )
  );
end;
$$;

create or replace function public.admin_update_user(
  p_token text,
  p_id uuid,
  p_username text,
  p_name text,
  p_role text,
  p_active boolean,
  p_password text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin public.users%rowtype;
  v_username text := lower(trim(p_username));
  v_name text := trim(p_name);
  v_role text := case when lower(coalesce(p_role, 'intern')) = 'admin' then 'admin' else 'intern' end;
  v_active boolean := coalesce(p_active, true);
  v_existing public.users%rowtype;
  v_user public.users%rowtype;
begin
  v_admin := public.require_admin(p_token);

  if p_id is null then
    raise exception 'ID akun wajib diisi.';
  end if;

  select * into v_existing from public.users where id = p_id;
  if v_existing.id is null then
    raise exception 'Akun tidak ditemukan.';
  end if;

  if v_username !~ '^[a-z0-9._-]{3,40}$' then
    raise exception 'Username 3-40 karakter, hanya huruf kecil, angka, titik, garis bawah, atau strip.';
  end if;
  if coalesce(v_name, '') = '' then
    raise exception 'Nama wajib diisi.';
  end if;
  if coalesce(p_password, '') <> '' and length(p_password) < 6 then
    raise exception 'Password minimal 6 karakter.';
  end if;
  if exists (select 1 from public.users where username = v_username and id <> p_id) then
    raise exception 'Username sudah terdaftar.';
  end if;
  if p_id = v_admin.id and (v_role <> 'admin' or not v_active) then
    raise exception 'Tidak bisa menonaktifkan atau menurunkan role akun sendiri.';
  end if;

  update public.users
  set username = v_username,
      name = v_name,
      role = v_role,
      active = v_active,
      password = case
        when coalesce(p_password, '') <> '' then extensions.crypt(p_password, extensions.gen_salt('bf'))
        else password
      end,
      password_updated_at = case
        when coalesce(p_password, '') <> '' then now()
        else password_updated_at
      end,
      updated_at = now()
  where id = p_id
  returning * into v_user;

  perform public.log_action(v_admin.username, 'update-user', v_username);

  return jsonb_build_object(
    'ok', true,
    'message', 'Akun berhasil diperbarui.',
    'user', jsonb_build_object(
      'id', v_user.id,
      'username', v_user.username,
      'name', v_user.name,
      'role', v_user.role,
      'active', v_user.active,
      'password_updated_at', v_user.password_updated_at,
      'created_at', v_user.created_at
    )
  );
end;
$$;

create or replace function public.admin_reset_password(p_token text, p_id uuid, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin public.users%rowtype;
  v_user public.users%rowtype;
begin
  v_admin := public.require_admin(p_token);

  if p_id is null then
    raise exception 'ID akun wajib diisi.';
  end if;
  if coalesce(p_password, '') = '' or length(p_password) < 6 then
    raise exception 'Password minimal 6 karakter.';
  end if;

  select * into v_user from public.users where id = p_id;
  if v_user.id is null then
    raise exception 'Akun tidak ditemukan.';
  end if;

  update public.users
  set password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      password_updated_at = now(),
      updated_at = now()
  where id = p_id;

  perform public.log_action(v_admin.username, 'reset-password', v_user.username);

  return jsonb_build_object(
    'ok', true,
    'message', 'Password ' || v_user.username || ' berhasil direset.',
    'password_updated_at', now()
  );
end;
$$;

create or replace function public.admin_delete_user(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_user public.users%rowtype;
  v_urls jsonb;
begin
  v_admin := public.require_admin(p_token);

  if p_id is null then
    raise exception 'ID akun wajib diisi.';
  end if;
  if p_id = v_admin.id then
    raise exception 'Tidak bisa menghapus akun sendiri.';
  end if;

  select * into v_user from public.users where id = p_id;
  if v_user.id is null then
    raise exception 'Akun tidak ditemukan.';
  end if;

  select coalesce(jsonb_agg(url), '[]'::jsonb) into v_urls
  from (
    select photo_url as url from public.attendance where user_id = p_id and photo_url <> ''
    union all
    select photo_out_url as url from public.attendance where user_id = p_id and photo_out_url <> ''
  ) s;

  delete from public.users where id = p_id;
  perform public.log_action(v_admin.username, 'delete-user', v_user.username);

  return jsonb_build_object(
    'ok', true,
    'message', 'Akun berhasil dihapus.',
    'photo_urls', v_urls
  );
end;
$$;

create or replace function public.admin_delete_user_attendance(p_token text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_user public.users%rowtype;
  v_urls jsonb;
  v_count integer;
begin
  v_admin := public.require_admin(p_token);

  select * into v_user from public.users where id = p_user_id;
  if v_user.id is null then
    raise exception 'Akun tidak ditemukan.';
  end if;

  select coalesce(jsonb_agg(url), '[]'::jsonb) into v_urls
  from (
    select photo_url as url from public.attendance where user_id = p_user_id and photo_url <> ''
    union all
    select photo_out_url as url from public.attendance where user_id = p_user_id and photo_out_url <> ''
  ) s;

  select count(*) into v_count from public.attendance where user_id = p_user_id;
  delete from public.attendance where user_id = p_user_id;
  perform public.log_action(v_admin.username, 'delete-user-attendance', v_user.username || ' | ' || v_count::text);

  return jsonb_build_object(
    'ok', true,
    'message', 'Seluruh data absensi peserta berhasil dihapus.',
    'photo_urls', v_urls
  );
end;
$$;

create or replace function public.admin_account_info(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_accounts jsonb;
begin
  v_admin := public.require_admin(p_token);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'name', u.name,
    'role', u.role,
    'active', u.active,
    'last_login_at', u.last_login_at,
    'password_updated_at', u.password_updated_at,
    'created_at', u.created_at
  ) order by (u.role = 'admin') desc, u.name), '[]'::jsonb)
  into v_accounts
  from public.users u;

  return jsonb_build_object('ok', true, 'accounts', v_accounts);
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
        'last_login_at', u.last_login_at,
        'password_updated_at', u.password_updated_at,
        'created_at', u.created_at
      ) order by u.name), '[]'::jsonb)
      from public.users u
    ),
    'attendance', (select coalesce(jsonb_agg(to_jsonb(a) order by a.date desc, a.check_in desc nulls last), '[]'::jsonb) from public.attendance a),
    'settings', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.settings),
    'logs', (select coalesce(jsonb_agg(to_jsonb(l) order by l.timestamp desc), '[]'::jsonb) from public.logs l),
    'exportedAt', to_char(now() at time zone public.app_timezone(), 'YYYY-MM-DD"T"HH24:MI:SS')
  );
end;
$$;

alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.settings enable row level security;
alter table public.logs enable row level security;

revoke all on public.users from anon, authenticated;
revoke all on public.sessions from anon, authenticated;
revoke all on public.attendance from anon, authenticated;
revoke all on public.settings from anon, authenticated;
revoke all on public.logs from anon, authenticated;

revoke execute on function public.require_user(text) from public, anon, authenticated;
revoke execute on function public.require_admin(text) from public, anon, authenticated;
revoke execute on function public.log_action(text, text, text) from public, anon, authenticated;

grant execute on function public.app_login(text, text) to anon, authenticated;
grant execute on function public.app_logout(text) to anon, authenticated;
grant execute on function public.app_session(text) to anon, authenticated;
grant execute on function public.app_bootstrap(text) to anon, authenticated;
grant execute on function public.app_check_in(text, text, text, text) to anon, authenticated;
grant execute on function public.app_check_out(text, text, text, text) to anon, authenticated;
grant execute on function public.app_save_settings(text, jsonb) to anon, authenticated;
grant execute on function public.app_delete_attendance(text, uuid) to anon, authenticated;
grant execute on function public.admin_create_user(text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.admin_update_user(text, uuid, text, text, text, boolean, text) to anon, authenticated;
grant execute on function public.admin_reset_password(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_delete_user(text, uuid) to anon, authenticated;
grant execute on function public.admin_delete_user_attendance(text, uuid) to anon, authenticated;
grant execute on function public.admin_account_info(text) to anon, authenticated;
grant execute on function public.app_export_data(text) to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('attendance-photos', 'attendance-photos', true)
on conflict (id) do update set public = true;

drop policy if exists attendance_photos_read on storage.objects;
create policy attendance_photos_read on storage.objects
for select to anon, authenticated
using (bucket_id = 'attendance-photos');

drop policy if exists attendance_photos_insert on storage.objects;
create policy attendance_photos_insert on storage.objects
for insert to anon, authenticated
with check (bucket_id = 'attendance-photos');

drop policy if exists attendance_photos_update on storage.objects;
create policy attendance_photos_update on storage.objects
for update to anon, authenticated
using (bucket_id = 'attendance-photos')
with check (bucket_id = 'attendance-photos');

drop policy if exists attendance_photos_delete on storage.objects;
create policy attendance_photos_delete on storage.objects
for delete to anon, authenticated
using (bucket_id = 'attendance-photos');
