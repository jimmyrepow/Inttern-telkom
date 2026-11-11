insert into public.settings (key, value, description)
values ('checkout_limit', '17:00', 'Jam mulai absen pulang')
on conflict (key) do nothing;

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
  v_checkout_limit time;
  v_row public.attendance%rowtype;
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

  update public.attendance
  set check_out = v_now,
      photo_out_url = coalesce(nullif(p_photo_url, ''), photo_out_url),
      location = coalesce(nullif(p_location, ''), location),
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

create or replace function public.admin_update_attendance(
  p_token text,
  p_id uuid,
  p_check_in text,
  p_check_out text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_row public.attendance%rowtype;
  v_before public.attendance%rowtype;
  v_check_in time;
  v_check_out time;
begin
  v_admin := public.require_admin(p_token);

  if p_id is null then
    raise exception 'ID absensi wajib diisi.';
  end if;
  if p_status is null or p_status not in ('on-time', 'late') then
    raise exception 'Status absensi harus Tepat waktu atau Telat.';
  end if;
  if coalesce(p_check_in, '') !~ '^([01]\d|2[0-3]):[0-5]\d$' then
    raise exception 'Jam masuk wajib berformat HH:MM.';
  end if;
  if coalesce(p_check_out, '') <> ''
    and p_check_out !~ '^([01]\d|2[0-3]):[0-5]\d$' then
    raise exception 'Jam pulang harus berformat HH:MM.';
  end if;

  v_check_in := p_check_in::time;
  v_check_out := nullif(p_check_out, '')::time;

  if v_check_out is not null and v_check_out < v_check_in then
    raise exception 'Jam pulang tidak boleh lebih awal dari jam masuk.';
  end if;

  select * into v_row
  from public.attendance
  where id = p_id
  for update;

  if v_row.id is null then
    raise exception 'Data absensi tidak ditemukan atau sudah dihapus.';
  end if;
  v_before := v_row;

  update public.attendance
  set check_in = v_check_in,
      check_out = v_check_out,
      status = p_status,
      updated_at = now()
  where id = p_id
  returning * into v_row;

  perform public.log_action(
    v_admin.username,
    'update-attendance',
    v_row.name || ' | ' || v_row.date::text ||
      ' | sebelumnya: masuk ' || coalesce(to_char(v_before.check_in, 'HH24:MI'), '-') ||
      ' pulang ' || coalesce(to_char(v_before.check_out, 'HH24:MI'), '-') ||
      ' status ' || v_before.status ||
      ' | sekarang: masuk ' || coalesce(to_char(v_row.check_in, 'HH24:MI'), '-') ||
      ' pulang ' || coalesce(to_char(v_row.check_out, 'HH24:MI'), '-') ||
      ' status ' || v_row.status
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Data absensi berhasil diperbarui.',
    'attendance', to_jsonb(v_row)
  );
end;
$$;

revoke execute on function public.app_check_out(text, text, text, text) from public;
grant execute on function public.app_check_out(text, text, text, text) to anon, authenticated;

revoke execute on function public.app_save_settings(text, jsonb) from public;
grant execute on function public.app_save_settings(text, jsonb) to anon, authenticated;

revoke execute on function public.admin_update_attendance(text, uuid, text, text, text) from public;
grant execute on function public.admin_update_attendance(text, uuid, text, text, text) to anon, authenticated;
