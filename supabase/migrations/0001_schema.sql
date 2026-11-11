create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  name text not null,
  role text not null default 'intern' check (role in ('admin', 'intern')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  date date not null default current_date,
  check_in time,
  check_out time,
  status text not null default 'on-time' check (status in ('on-time', 'late')),
  photo_url text not null default '',
  photo_out_url text not null default '',
  location text not null default '',
  note text not null default '',
  source text not null default 'web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.settings (
  key text primary key,
  value text not null default '',
  description text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.logs (
  id bigint generated always as identity primary key,
  timestamp timestamptz not null default now(),
  actor text not null default 'system',
  action text not null,
  detail text not null default ''
);

insert into public.settings (key, value, description) values
  ('app_name', 'TELKOM AKSES INTERNSHIP', 'Nama aplikasi'),
  ('late_limit', '08:15', 'Batas jam absen masuk'),
  ('office_name', 'Telkom Akses', 'Nama kantor'),
  ('office_lat', '', 'Latitude kantor'),
  ('office_lng', '', 'Longitude kantor'),
  ('max_radius_m', '', 'Radius absensi dalam meter'),
  ('timezone', 'Asia/Jakarta', 'Zona waktu aplikasi'),
  ('email_domain', 'telkom.local', 'Domain email internal untuk login username')
on conflict (key) do nothing;

create or replace function public.app_email_domain()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(value), ''), 'telkom.local')
  from public.settings
  where key = 'email_domain';
$$;

create or replace function public.app_timezone()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(value), ''), 'Asia/Jakarta')
  from public.settings
  where key = 'timezone';
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

create or replace function public.log_action(p_action text, p_detail text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
begin
  select username into v_actor from public.profiles where id = auth.uid();
  insert into public.logs (actor, action, detail)
  values (coalesce(v_actor, 'system'), p_action, coalesce(p_detail, ''));
end;
$$;

create or replace function public.haversine_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists attendance_touch on public.attendance;
create trigger attendance_touch before update on public.attendance
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1)));
  insert into public.profiles (id, username, name, role, active)
  values (
    new.id,
    v_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), v_username),
    case when lower(coalesce(new.raw_user_meta_data ->> 'role', 'intern')) = 'admin' then 'admin' else 'intern' end,
    coalesce((new.raw_user_meta_data ->> 'active')::boolean, true)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.create_user_internal(
  p_username text,
  p_name text,
  p_password text,
  p_role text default 'intern',
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_username text := lower(trim(p_username));
  v_name text := trim(p_name);
  v_role text := case when lower(coalesce(p_role, 'intern')) = 'admin' then 'admin' else 'intern' end;
  v_email text;
  v_id uuid := gen_random_uuid();
begin
  if v_username !~ '^[a-z0-9._-]{3,40}$' then
    raise exception 'Username 3-40 karakter, hanya huruf kecil, angka, titik, garis bawah, atau strip.';
  end if;
  if coalesce(v_name, '') = '' then
    raise exception 'Nama wajib diisi.';
  end if;
  if coalesce(p_password, '') = '' or length(p_password) < 6 then
    raise exception 'Password minimal 6 karakter.';
  end if;
  if exists (select 1 from public.profiles where username = v_username) then
    raise exception 'Username sudah terdaftar.';
  end if;

  v_email := v_username || '@' || public.app_email_domain();

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('username', v_username, 'name', v_name, 'role', v_role, 'active', p_active),
    '', '', '', ''
  );

  insert into auth.identities (user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (v_id, jsonb_build_object('sub', v_id::text, 'email', v_email), 'email', v_email, now(), now(), now())
  on conflict do nothing;

  insert into public.profiles (id, username, name, role, active)
  values (v_id, v_username, v_name, v_role, coalesce(p_active, true))
  on conflict (id) do update
    set username = excluded.username,
        name = excluded.name,
        role = excluded.role,
        active = excluded.active,
        updated_at = now();

  return v_id;
end;
$$;

create or replace function public.create_first_admin(
  p_username text,
  p_password text,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles) then
    raise exception 'Admin pertama hanya dapat dibuat jika tabel profil masih kosong.';
  end if;
  return public.create_user_internal(p_username, p_name, p_password, 'admin', true);
end;
$$;

create or replace function public.app_bootstrap()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_admin boolean;
  v_tz text;
  v_today date;
  v_users jsonb;
  v_attendance jsonb;
  v_settings jsonb;
  v_stats jsonb;
begin
  if v_uid is null then
    raise exception 'Sesi tidak ditemukan. Silakan login ulang.';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is null then
    raise exception 'Akun tidak ditemukan.';
  end if;
  if not v_profile.active then
    raise exception 'Akun tidak aktif.';
  end if;

  v_admin := v_profile.role = 'admin';
  v_tz := public.app_timezone();
  v_today := (now() at time zone v_tz)::date;

  if v_admin then
    select coalesce(jsonb_agg(to_jsonb(u) order by (u.role = 'admin') desc, u.name), '[]'::jsonb)
    into v_users
    from public.profiles u;

    select coalesce(jsonb_agg(to_jsonb(a) order by a.date desc, a.check_in desc nulls last), '[]'::jsonb)
    into v_attendance
    from public.attendance a;
  else
    v_users := jsonb_build_array(to_jsonb(v_profile));

    select coalesce(jsonb_agg(to_jsonb(a) order by a.date desc, a.check_in desc nulls last), '[]'::jsonb)
    into v_attendance
    from public.attendance a
    where a.user_id = v_uid;
  end if;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_settings from public.settings;

  v_stats := jsonb_build_object(
    'totalInterns', (select count(*) from public.profiles where role = 'intern' and active),
    'totalAttendanceToday', (select count(*) from public.attendance where date = v_today),
    'onTime', (select count(*) from public.attendance where date = v_today and status = 'on-time'),
    'late', (select count(*) from public.attendance where date = v_today and status = 'late'),
    'absent', greatest(
      (select count(*) from public.profiles where role = 'intern' and active) -
      (select count(*) from public.attendance where date = v_today),
      0
    ),
    'today', v_today
  );

  return jsonb_build_object(
    'ok', true,
    'user', to_jsonb(v_profile),
    'users', v_users,
    'attendance', v_attendance,
    'settings', v_settings,
    'stats', v_stats,
    'serverTime', to_char(now() at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI:SS')
  );
end;
$$;

create or replace function public.app_check_in(
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
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_tz text;
  v_today date;
  v_time time;
  v_late_text text;
  v_late_limit time;
  v_status text;
  v_existing public.attendance%rowtype;
  v_row public.attendance%rowtype;
  v_lat_text text;
  v_lng_text text;
  v_radius_text text;
  v_office_lat double precision;
  v_office_lng double precision;
  v_radius double precision;
  v_lat double precision;
  v_lng double precision;
  v_distance double precision;
  v_location text := coalesce(nullif(trim(p_location), ''), 'Belum ada lokasi');
  v_note text := left(coalesce(p_note, ''), 500);
begin
  if v_uid is null then
    raise exception 'Sesi tidak ditemukan. Silakan login ulang.';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is null then
    raise exception 'Akun tidak ditemukan.';
  end if;
  if not v_profile.active then
    raise exception 'Akun tidak aktif.';
  end if;

  v_tz := public.app_timezone();
  v_today := (now() at time zone v_tz)::date;
  v_time := (now() at time zone v_tz)::time(0);

  select value into v_lat_text from public.settings where key = 'office_lat';
  select value into v_lng_text from public.settings where key = 'office_lng';
  select value into v_radius_text from public.settings where key = 'max_radius_m';

  if coalesce(v_lat_text, '') <> '' or coalesce(v_lng_text, '') <> '' or coalesce(v_radius_text, '') <> '' then
    v_office_lat := nullif(trim(v_lat_text), '')::double precision;
    v_office_lng := nullif(trim(v_lng_text), '')::double precision;
    v_radius := nullif(trim(v_radius_text), '')::double precision;

    if v_office_lat is null or v_office_lng is null or v_radius is null or v_radius <= 0 then
      raise exception 'Pengaturan lokasi kantor belum lengkap. Hubungi admin sebelum melakukan absensi.';
    end if;

    if p_location !~ '^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$' then
      raise exception 'Lokasi GPS belum valid. Aktifkan GPS lalu tekan "Ambil GPS" sebelum absen.';
    end if;

    v_lat := split_part(trim(p_location), ',', 1)::double precision;
    v_lng := split_part(trim(p_location), ',', 2)::double precision;
    v_distance := round(public.haversine_m(v_lat, v_lng, v_office_lat, v_office_lng));

    if v_distance > v_radius then
      raise exception 'Absen ditolak: posisi Anda % m dari kantor, melebihi radius % m.', v_distance::int, round(v_radius)::int;
    end if;
  end if;

  select value into v_late_text from public.settings where key = 'late_limit';
  v_late_limit := coalesce(nullif(trim(v_late_text), ''), '08:15')::time;
  v_status := case when v_time > v_late_limit then 'late' else 'on-time' end;

  select * into v_existing from public.attendance where user_id = v_uid and date = v_today;

  if v_existing.id is not null and v_existing.check_in is not null then
    raise exception 'Anda sudah absen masuk hari ini.';
  end if;

  if v_existing.id is not null then
    update public.attendance
    set check_in = v_time,
        status = v_status,
        location = case when v_location = 'Belum ada lokasi' then coalesce(nullif(v_existing.location, ''), v_location) else v_location end,
        note = case when v_note = '' then v_existing.note else v_note end,
        photo_url = case when coalesce(p_photo_url, '') = '' then v_existing.photo_url else p_photo_url end,
        source = 'web',
        updated_at = now()
    where id = v_existing.id
    returning * into v_row;
  else
    insert into public.attendance (user_id, name, date, check_in, status, photo_url, location, note, source)
    values (v_uid, v_profile.name, v_today, v_time, v_status, coalesce(p_photo_url, ''), v_location, v_note, 'web')
    returning * into v_row;
  end if;

  perform public.log_action('check-in', v_today::text || ' ' || to_char(v_time, 'HH24:MI'));

  return jsonb_build_object('ok', true, 'message', 'Absen masuk berhasil.', 'attendance', to_jsonb(v_row));
end;
$$;

create or replace function public.app_check_out(
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
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_tz text;
  v_today date;
  v_time time;
  v_existing public.attendance%rowtype;
  v_row public.attendance%rowtype;
  v_location text := coalesce(nullif(trim(p_location), ''), 'Belum ada lokasi');
  v_note text := left(coalesce(p_note, ''), 500);
begin
  if v_uid is null then
    raise exception 'Sesi tidak ditemukan. Silakan login ulang.';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is null then
    raise exception 'Akun tidak ditemukan.';
  end if;
  if not v_profile.active then
    raise exception 'Akun tidak aktif.';
  end if;

  v_tz := public.app_timezone();
  v_today := (now() at time zone v_tz)::date;
  v_time := (now() at time zone v_tz)::time(0);

  select * into v_existing from public.attendance where user_id = v_uid and date = v_today;

  if v_existing.id is null or v_existing.check_in is null then
    raise exception 'Anda belum absen masuk hari ini.';
  end if;
  if v_existing.check_out is not null then
    raise exception 'Anda sudah absen pulang hari ini.';
  end if;

  update public.attendance
  set check_out = v_time,
      location = case when v_location = 'Belum ada lokasi' then coalesce(nullif(v_existing.location, ''), v_location) else v_location end,
      note = case when v_note = '' then v_existing.note else v_note end,
      photo_out_url = case when coalesce(p_photo_url, '') = '' then v_existing.photo_out_url else p_photo_url end,
      source = 'web',
      updated_at = now()
  where id = v_existing.id
  returning * into v_row;

  perform public.log_action('check-out', v_today::text || ' ' || to_char(v_time, 'HH24:MI'));

  return jsonb_build_object('ok', true, 'message', 'Absen pulang berhasil.', 'attendance', to_jsonb(v_row));
end;
$$;

create or replace function public.app_save_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_value text;
  v_app_name text;
  v_late_limit text;
  v_timezone text;
  v_office_name text;
  v_office_lat text;
  v_office_lng text;
  v_radius_text text;
  v_radius double precision;
  v_count int := 0;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Aksi ini hanya untuk admin.';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Tidak ada pengaturan yang diperbarui.';
  end if;

  select value into v_office_lat from public.settings where key = 'office_lat';
  select value into v_office_lng from public.settings where key = 'office_lng';
  select value into v_radius_text from public.settings where key = 'max_radius_m';

  if p_settings ? 'office_lat' then v_office_lat := trim(p_settings ->> 'office_lat'); end if;
  if p_settings ? 'office_lng' then v_office_lng := trim(p_settings ->> 'office_lng'); end if;
  if p_settings ? 'max_radius_m' then v_radius_text := trim(p_settings ->> 'max_radius_m'); end if;

  if p_settings ? 'app_name' then
    v_app_name := trim(p_settings ->> 'app_name');
    if v_app_name = '' or length(v_app_name) > 80 then
      raise exception 'Nama aplikasi wajib diisi dan maksimal 80 karakter.';
    end if;
  end if;

  if p_settings ? 'late_limit' then
    v_late_limit := trim(p_settings ->> 'late_limit');
    if v_late_limit !~ '^([01]\d|2[0-3]):[0-5]\d$' then
      raise exception 'Batas absen masuk harus berformat HH:MM.';
    end if;
  end if;

  if p_settings ? 'timezone' then
    v_timezone := trim(p_settings ->> 'timezone');
    if v_timezone !~ '^[A-Za-z_]+(/[A-Za-z_+-]+)+$' then
      raise exception 'Zona waktu harus berformat Area/Kota, contoh Asia/Jakarta.';
    end if;
    begin
      perform (now() at time zone v_timezone);
    exception when others then
      raise exception 'Zona waktu tidak dikenal: %', v_timezone;
    end;
  end if;

  if (coalesce(v_office_lat, '') = '') <> (coalesce(v_office_lng, '') = '') then
    raise exception 'Latitude dan longitude kantor harus diisi berpasangan.';
  end if;

  v_radius := nullif(trim(v_radius_text), '')::double precision;

  if coalesce(v_office_lat, '') <> '' then
    if nullif(trim(v_office_lat), '')::double precision is null or nullif(trim(v_office_lng), '')::double precision is null then
      raise exception 'Koordinat kantor tidak valid.';
    end if;
    if v_radius is null or v_radius <= 0 then
      raise exception 'Isi radius kantor lebih dari 0 jika koordinat kantor diatur.';
    end if;
  elsif v_radius is not null and v_radius > 0 then
    raise exception 'Isi koordinat kantor jika radius absensi lebih dari 0.';
  end if;

  foreach v_key in array array['app_name', 'late_limit', 'office_name', 'office_lat', 'office_lng', 'max_radius_m', 'timezone']
  loop
    if p_settings ? v_key then
      v_value := coalesce(trim(p_settings ->> v_key), '');
      insert into public.settings (key, value, updated_at)
      values (v_key, v_value, now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
      v_count := v_count + 1;
    end if;
  end loop;

  if v_count = 0 then
    raise exception 'Tidak ada pengaturan yang diperbarui.';
  end if;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_result from public.settings;
  perform public.log_action('update-settings', p_settings::text);

  return jsonb_build_object('ok', true, 'message', 'Pengaturan berhasil diperbarui.', 'settings', v_result);
end;
$$;

create or replace function public.admin_create_user(
  p_username text,
  p_name text,
  p_password text,
  p_role text default 'intern',
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_user public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Aksi ini hanya untuk admin.';
  end if;

  v_id := public.create_user_internal(p_username, p_name, p_password, p_role, coalesce(p_active, true));
  select * into v_user from public.profiles where id = v_id;

  perform public.log_action('create-user', v_user.username);

  return jsonb_build_object('ok', true, 'message', 'Akun berhasil ditambahkan.', 'user', to_jsonb(v_user));
end;
$$;

create or replace function public.admin_update_user(
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
set search_path = public, auth, extensions
as $$
declare
  v_username text := lower(trim(p_username));
  v_name text := trim(p_name);
  v_role text := case when lower(coalesce(p_role, 'intern')) = 'admin' then 'admin' else 'intern' end;
  v_active boolean := coalesce(p_active, true);
  v_existing public.profiles%rowtype;
  v_user public.profiles%rowtype;
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'Aksi ini hanya untuk admin.';
  end if;
  if p_id is null then
    raise exception 'ID akun wajib diisi.';
  end if;

  select * into v_existing from public.profiles where id = p_id;
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
  if exists (select 1 from public.profiles where username = v_username and id <> p_id) then
    raise exception 'Username sudah terdaftar.';
  end if;
  if p_id = auth.uid() and (v_role <> 'admin' or not v_active) then
    raise exception 'Tidak bisa menonaktifkan atau menurunkan role akun sendiri.';
  end if;

  update public.profiles
  set username = v_username,
      name = v_name,
      role = v_role,
      active = v_active,
      updated_at = now()
  where id = p_id
  returning * into v_user;

  v_email := v_username || '@' || public.app_email_domain();

  update auth.users
  set email = v_email,
      encrypted_password = case
        when coalesce(p_password, '') <> '' then extensions.crypt(p_password, extensions.gen_salt('bf'))
        else encrypted_password
      end,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now(),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'username', v_username,
        'name', v_name,
        'role', v_role,
        'active', v_active
      )
  where id = p_id;

  update auth.identities
  set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(v_email)),
      provider_id = v_email,
      updated_at = now()
  where user_id = p_id and provider = 'email';

  perform public.log_action('update-user', v_username);

  return jsonb_build_object('ok', true, 'message', 'Akun berhasil diperbarui.', 'user', to_jsonb(v_user));
end;
$$;

create or replace function public.admin_delete_user(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user public.profiles%rowtype;
  v_urls jsonb;
begin
  if not public.is_admin() then
    raise exception 'Aksi ini hanya untuk admin.';
  end if;
  if p_id is null then
    raise exception 'ID akun wajib diisi.';
  end if;
  if p_id = auth.uid() then
    raise exception 'Tidak bisa menghapus akun sendiri.';
  end if;

  select * into v_user from public.profiles where id = p_id;
  if v_user.id is null then
    raise exception 'Akun tidak ditemukan.';
  end if;

  select coalesce(jsonb_agg(url), '[]'::jsonb) into v_urls
  from (
    select photo_url as url from public.attendance where user_id = p_id and photo_url <> ''
    union all
    select photo_out_url as url from public.attendance where user_id = p_id and photo_out_url <> ''
  ) s;

  delete from public.attendance where user_id = p_id;
  delete from auth.users where id = p_id;

  perform public.log_action('delete-user', v_user.username);

  return jsonb_build_object('ok', true, 'message', 'Akun dan data absensinya berhasil dihapus.', 'photo_urls', v_urls);
end;
$$;

create or replace function public.admin_delete_user_attendance(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles%rowtype;
  v_urls jsonb;
  v_count int;
begin
  if not public.is_admin() then
    raise exception 'Aksi ini hanya untuk admin.';
  end if;
  if p_user_id is null then
    raise exception 'ID peserta wajib diisi.';
  end if;

  select * into v_user from public.profiles where id = p_user_id;
  if v_user.id is null then
    raise exception 'Akun peserta tidak ditemukan.';
  end if;

  select count(*) into v_count from public.attendance where user_id = p_user_id;
  if v_count = 0 then
    raise exception 'Peserta ini belum memiliki data absensi.';
  end if;

  select coalesce(jsonb_agg(url), '[]'::jsonb) into v_urls
  from (
    select photo_url as url from public.attendance where user_id = p_user_id and photo_url <> ''
    union all
    select photo_out_url as url from public.attendance where user_id = p_user_id and photo_out_url <> ''
  ) s;

  delete from public.attendance where user_id = p_user_id;

  perform public.log_action('delete-user-attendance', v_user.username || ' | ' || v_count || ' catatan');

  return jsonb_build_object(
    'ok', true,
    'message', v_count || ' data absensi ' || v_user.name || ' berhasil dihapus. Akun tetap tersimpan.',
    'deletedCount', v_count,
    'photo_urls', v_urls
  );
end;
$$;

create or replace function public.app_delete_attendance(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.attendance%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Aksi ini hanya untuk admin.';
  end if;
  if p_id is null then
    raise exception 'ID absensi wajib diisi.';
  end if;

  select * into v_row from public.attendance where id = p_id;
  if v_row.id is null then
    raise exception 'Data absensi tidak ditemukan atau sudah dihapus.';
  end if;

  delete from public.attendance where id = p_id;

  perform public.log_action('delete-attendance', v_row.name || ' | ' || v_row.date);

  return jsonb_build_object(
    'ok', true,
    'message', 'Data absensi berhasil dihapus.',
    'photo_urls', jsonb_build_array(v_row.photo_url, v_row.photo_out_url)
  );
end;
$$;

create or replace function public.app_export_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Aksi ini hanya untuk admin.';
  end if;

  return jsonb_build_object(
    'users', (select coalesce(jsonb_agg(to_jsonb(u) order by u.name), '[]'::jsonb) from public.profiles u),
    'attendance', (select coalesce(jsonb_agg(to_jsonb(a) order by a.date desc, a.check_in desc nulls last), '[]'::jsonb) from public.attendance a),
    'settings', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.settings),
    'logs', (select coalesce(jsonb_agg(to_jsonb(l) order by l.timestamp desc), '[]'::jsonb) from public.logs l),
    'exportedAt', to_char(now() at time zone public.app_timezone(), 'YYYY-MM-DD"T"HH24:MI:SS')
  );
end;
$$;

alter table public.profiles enable row level security;
alter table public.attendance enable row level security;
alter table public.settings enable row level security;
alter table public.logs enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings
for select to authenticated
using (true);

drop policy if exists logs_select on public.logs;
create policy logs_select on public.logs
for select to authenticated
using (public.is_admin());

revoke all on public.profiles from anon, authenticated;
revoke all on public.attendance from anon, authenticated;
revoke all on public.settings from anon, authenticated;
revoke all on public.logs from anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.attendance to authenticated;
grant select on public.settings to authenticated;
grant select on public.logs to authenticated;

revoke execute on function public.create_user_internal(text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.create_first_admin(text, text, text) from public, anon, authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.app_email_domain() to authenticated;
grant execute on function public.app_timezone() to authenticated;
grant execute on function public.app_bootstrap() to authenticated;
grant execute on function public.app_check_in(text, text, text) to authenticated;
grant execute on function public.app_check_out(text, text, text) to authenticated;
grant execute on function public.app_save_settings(jsonb) to authenticated;
grant execute on function public.app_delete_attendance(uuid) to authenticated;
grant execute on function public.app_export_data() to authenticated;
grant execute on function public.admin_create_user(text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_update_user(uuid, text, text, text, boolean, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.admin_delete_user_attendance(uuid) to authenticated;

insert into storage.buckets (id, name, public)
values ('attendance-photos', 'attendance-photos', true)
on conflict (id) do update set public = true;

drop policy if exists attendance_photos_read on storage.objects;
create policy attendance_photos_read on storage.objects
for select using (bucket_id = 'attendance-photos');

drop policy if exists attendance_photos_insert on storage.objects;
create policy attendance_photos_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'attendance-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists attendance_photos_update on storage.objects;
create policy attendance_photos_update on storage.objects
for update to authenticated
using (
  bucket_id = 'attendance-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'attendance-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists attendance_photos_delete on storage.objects;
create policy attendance_photos_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'attendance-photos'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);
