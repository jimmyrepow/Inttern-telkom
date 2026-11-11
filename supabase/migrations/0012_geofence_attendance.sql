alter table public.attendance
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision,
  add column if not exists location_accuracy_m double precision,
  add column if not exists location_distance_m double precision;

insert into public.settings (key, value, description)
values ('max_accuracy_m', '100', 'Batas maksimal akurasi GPS untuk absensi (meter)')
on conflict (key) do nothing;

create or replace function public.attendance_geofence_distance(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision
)
returns double precision
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office_lat_text text;
  v_office_lng_text text;
  v_radius_text text;
  v_max_accuracy_text text;
  v_office_lat double precision;
  v_office_lng double precision;
  v_radius double precision;
  v_max_accuracy double precision;
  v_distance double precision;
begin
  select
    coalesce(max(value) filter (where key = 'office_lat'), ''),
    coalesce(max(value) filter (where key = 'office_lng'), ''),
    coalesce(max(value) filter (where key = 'max_radius_m'), ''),
    coalesce(max(value) filter (where key = 'max_accuracy_m'), '')
  into v_office_lat_text, v_office_lng_text, v_radius_text, v_max_accuracy_text
  from public.settings
  where key in ('office_lat', 'office_lng', 'max_radius_m', 'max_accuracy_m');

  v_office_lat_text := replace(trim(coalesce(v_office_lat_text, '')), ',', '.');
  v_office_lng_text := replace(trim(coalesce(v_office_lng_text, '')), ',', '.');
  v_radius_text := replace(trim(coalesce(v_radius_text, '')), ',', '.');
  v_max_accuracy_text := replace(trim(coalesce(v_max_accuracy_text, '')), ',', '.');

  if v_radius_text = '' then
    return null;
  end if;
  if v_radius_text !~ '^-?[0-9]+([.][0-9]+)?$' then
    raise exception 'Radius absensi tidak valid. Periksa pengaturan kantor.';
  end if;

  v_radius := v_radius_text::double precision;
  if v_radius <= 0 then
    return null;
  end if;

  if v_office_lat_text = '' or v_office_lng_text = '' then
    raise exception 'Radius absensi aktif, tetapi koordinat kantor belum diatur. Hubungi admin.';
  end if;
  if v_office_lat_text !~ '^-?[0-9]+([.][0-9]+)?$'
    or v_office_lng_text !~ '^-?[0-9]+([.][0-9]+)?$' then
    raise exception 'Koordinat kantor tidak valid. Periksa pengaturan kantor.';
  end if;

  v_office_lat := v_office_lat_text::double precision;
  v_office_lng := v_office_lng_text::double precision;
  if v_office_lat < -90 or v_office_lat > 90 or v_office_lng < -180 or v_office_lng > 180 then
    raise exception 'Koordinat kantor tidak valid. Periksa pengaturan kantor.';
  end if;

  if p_lat is null or p_lng is null then
    raise exception 'Koordinat GPS wajib dikirim. Aktifkan lokasi presisi lalu ambil GPS ulang.';
  end if;
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Koordinat GPS tidak valid. Ambil GPS ulang.';
  end if;
  if p_accuracy is null or p_accuracy <= 0 then
    raise exception 'Akurasi GPS tidak valid. Aktifkan lokasi presisi lalu ambil GPS ulang.';
  end if;

  v_max_accuracy := case
    when v_max_accuracy_text ~ '^[0-9]+([.][0-9]+)?$'
      then v_max_accuracy_text::double precision
    else 100
  end;
  if v_max_accuracy <= 0 then
    v_max_accuracy := 100;
  end if;

  if p_accuracy > v_max_accuracy then
    raise exception 'Akurasi GPS terlalu rendah (sekitar % m). Batas maksimal % m. Aktifkan lokasi presisi atau pindah ke area terbuka.',
      round(p_accuracy::numeric)::int,
      round(v_max_accuracy::numeric)::int;
  end if;

  v_distance := public.haversine_m(p_lat, p_lng, v_office_lat, v_office_lng);
  if v_distance > v_radius then
    raise exception 'Absen ditolak: posisi Anda sekitar % m dari kantor, melebihi radius % m. Mendekat ke area kantor lalu perbarui GPS.',
      round(v_distance::numeric)::int,
      round(v_radius::numeric)::int;
  end if;

  return coalesce(round(v_distance::numeric, 1)::double precision, 0);
end;
$$;

drop function if exists public.app_check_in(text, text, text, text);
drop function if exists public.app_check_out(text, text, text, text);

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
  v_allowed text[] := array[
    'app_name',
    'late_limit',
    'checkout_limit',
    'office_name',
    'office_lat',
    'office_lng',
    'max_radius_m',
    'max_accuracy_m',
    'timezone'
  ];
  v_result jsonb;
begin
  v_admin := public.require_admin(p_token);

  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Pengaturan tidak valid.';
  end if;

  if p_settings ? 'late_limit'
    and coalesce(p_settings ->> 'late_limit', '') !~ '^([01]\d|2[0-3]):[0-5]\d$' then
    raise exception 'Batas absen masuk harus berformat HH:MM.';
  end if;

  if p_settings ? 'checkout_limit'
    and coalesce(p_settings ->> 'checkout_limit', '') !~ '^([01]\d|2[0-3]):[0-5]\d$' then
    raise exception 'Jam mulai absen pulang harus berformat HH:MM.';
  end if;

  if p_settings ? 'max_radius_m'
    and coalesce(p_settings ->> 'max_radius_m', '') <> ''
    and coalesce(p_settings ->> 'max_radius_m', '') !~ '^[0-9]+([.][0-9]+)?$' then
    raise exception 'Radius absensi harus berupa angka 0 atau lebih.';
  end if;

  if p_settings ? 'max_accuracy_m'
    and coalesce(p_settings ->> 'max_accuracy_m', '') <> ''
    and coalesce(p_settings ->> 'max_accuracy_m', '') !~ '^[1-9][0-9]*$' then
    raise exception 'Akurasi GPS maksimal harus bilangan bulat 1 atau lebih.';
  end if;

  for v_key, v_value in
    select key, value from jsonb_each_text(p_settings)
  loop
    if v_key = any(v_allowed) then
      insert into public.settings (key, value, updated_at)
      values (v_key, coalesce(v_value, ''), now())
      on conflict (key) do update
      set value = excluded.value, updated_at = now();
    end if;
  end loop;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  into v_result
  from public.settings;

  perform public.log_action(v_admin.username, 'update-settings', p_settings::text);

  return jsonb_build_object(
    'ok', true,
    'message', 'Pengaturan berhasil diperbarui.',
    'settings', v_result
  );
end;
$$;

revoke execute on function public.attendance_geofence_distance(double precision, double precision, double precision)
  from public, anon, authenticated;

revoke execute on function public.app_check_in(text, text, text, text, double precision, double precision, double precision) from public;
revoke execute on function public.app_check_out(text, text, text, text, double precision, double precision, double precision) from public;
revoke execute on function public.app_save_settings(text, jsonb) from public;

grant execute on function public.app_check_in(text, text, text, text, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.app_check_out(text, text, text, text, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.app_save_settings(text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
