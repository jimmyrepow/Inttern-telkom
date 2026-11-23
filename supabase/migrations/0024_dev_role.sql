-- Dev role: super-admin yang tidak bisa diganggu admin.
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('admin', 'intern', 'dev'));

update public.users
set role = 'dev', updated_at = now()
where role <> 'dev'
  and (
    lower(trim(name)) = 'jimmy randa'
    or (lower(trim(username)) = 'jimmy' and lower(trim(name)) like '%jimmy%')
  );

create or replace function public.require_admin(p_token text)
returns public.users language plpgsql security definer set search_path = public as $$
declare v_user public.users%rowtype;
begin
  v_user := public.require_user(p_token);
  if v_user.role not in ('admin', 'dev') then
    raise exception 'Aksi ini hanya untuk admin.';
  end if;
  return v_user;
end;
$$;

create or replace function public.assert_not_protected_target(p_actor public.users, p_target public.users)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_target.role = 'dev' and p_actor.role <> 'dev' then
    raise exception 'Akun developer dilindungi dan tidak dapat diubah oleh admin.';
  end if;
end;
$$;

revoke execute on function public.require_admin(text) from public;
revoke execute on function public.assert_not_protected_target(public.users, public.users) from public;

create or replace function public.admin_create_user(
  p_token text, p_username text, p_name text, p_password text, p_role text default 'intern', p_active boolean default true
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin public.users%rowtype; v_user public.users%rowtype;
  v_username text := lower(trim(coalesce(p_username, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_role text := lower(trim(coalesce(p_role, 'intern')));
  v_password text := coalesce(p_password, '');
begin
  v_admin := public.require_admin(p_token);
  if v_username = '' or v_name = '' or v_password = '' then raise exception 'Username, nama, dan password wajib diisi.'; end if;
  if v_username !~ '^[a-z0-9._-]{3,40}$' then raise exception 'Username harus 3-40 karakter: huruf kecil, angka, titik, garis bawah, atau strip.'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then raise exception 'Nama harus 2-100 karakter.'; end if;
  if char_length(v_password) < 6 then raise exception 'Password minimal 6 karakter.'; end if;
  if v_role not in ('admin', 'intern', 'dev') then v_role := 'intern'; end if;
  if v_role = 'dev' and v_admin.role <> 'dev' then raise exception 'Hanya developer yang dapat membuat akun developer.'; end if;
  if exists (select 1 from public.users where username = v_username) then raise exception 'Username sudah digunakan.'; end if;
  insert into public.users (username, name, password, role, active, password_updated_at)
  values (v_username, v_name, extensions.crypt(v_password, extensions.gen_salt('bf')), v_role, coalesce(p_active, true), now())
  returning * into v_user;
  perform public.log_action(v_admin.username, 'create-user', v_user.username || ' (' || v_user.role || ')');
  return jsonb_build_object('ok', true, 'message', 'Akun berhasil dibuat.', 'user', jsonb_build_object(
    'id', v_user.id, 'username', v_user.username, 'name', v_user.name, 'role', v_user.role, 'active', v_user.active,
    'avatar_emoji', v_user.avatar_emoji, 'avatar_color', v_user.avatar_color, 'division', v_user.division, 'mentor', v_user.mentor,
    'internship_start', v_user.internship_start, 'internship_end', v_user.internship_end,
    'last_login_at', v_user.last_login_at, 'password_updated_at', v_user.password_updated_at, 'created_at', v_user.created_at, 'updated_at', v_user.updated_at));
end;
$$;

create or replace function public.admin_update_user(
  p_token text, p_id uuid, p_username text, p_name text, p_role text, p_active boolean, p_password text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin public.users%rowtype; v_target public.users%rowtype; v_user public.users%rowtype;
  v_username text := lower(trim(coalesce(p_username, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_role text := lower(trim(coalesce(p_role, 'intern')));
  v_active boolean := coalesce(p_active, true);
  v_password text := nullif(coalesce(p_password, ''), '');
begin
  v_admin := public.require_admin(p_token);
  select * into v_target from public.users where id = p_id;
  if v_target.id is null then raise exception 'Akun tidak ditemukan.'; end if;
  perform public.assert_not_protected_target(v_admin, v_target);
  if v_username = '' or v_name = '' then raise exception 'Username dan nama wajib diisi.'; end if;
  if v_username !~ '^[a-z0-9._-]{3,40}$' then raise exception 'Username harus 3-40 karakter: huruf kecil, angka, titik, garis bawah, atau strip.'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then raise exception 'Nama harus 2-100 karakter.'; end if;
  if v_role not in ('admin', 'intern', 'dev') then v_role := 'intern'; end if;
  if v_role = 'dev' and v_admin.role <> 'dev' then raise exception 'Hanya developer yang dapat menetapkan role developer.'; end if;
  if p_id = v_admin.id and (v_role not in ('admin', 'dev') or not v_active) then raise exception 'Admin tidak dapat menonaktifkan atau menurunkan role akunnya sendiri.'; end if;
  if exists (select 1 from public.users where username = v_username and id <> p_id) then raise exception 'Username sudah digunakan.'; end if;
  if v_password is not null and char_length(v_password) < 6 then raise exception 'Password minimal 6 karakter.'; end if;
  update public.users
  set username = v_username, name = v_name, role = v_role, active = v_active,
      password = case when v_password is null then password else extensions.crypt(v_password, extensions.gen_salt('bf')) end,
      password_updated_at = case when v_password is null then password_updated_at else now() end,
      updated_at = now()
  where id = p_id returning * into v_user;
  perform public.log_action(v_admin.username, 'update-user', v_user.username || ' (' || v_user.role || ')');
  return jsonb_build_object('ok', true, 'message', 'Akun berhasil diperbarui.', 'user', jsonb_build_object(
    'id', v_user.id, 'username', v_user.username, 'name', v_user.name, 'role', v_user.role, 'active', v_user.active,
    'avatar_emoji', v_user.avatar_emoji, 'avatar_color', v_user.avatar_color, 'division', v_user.division, 'mentor', v_user.mentor,
    'internship_start', v_user.internship_start, 'internship_end', v_user.internship_end,
    'last_login_at', v_user.last_login_at, 'password_updated_at', v_user.password_updated_at, 'created_at', v_user.created_at, 'updated_at', v_user.updated_at));
end;
$$;

create or replace function public.admin_reset_password(p_token text, p_id uuid, p_password text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_admin public.users%rowtype; v_target public.users%rowtype; v_password text := coalesce(p_password, '');
begin
  v_admin := public.require_admin(p_token);
  if v_password = '' then raise exception 'Password baru wajib diisi.'; end if;
  if char_length(v_password) < 6 then raise exception 'Password minimal 6 karakter.'; end if;
  select * into v_target from public.users where id = p_id;
  if v_target.id is null then raise exception 'Akun tidak ditemukan.'; end if;
  perform public.assert_not_protected_target(v_admin, v_target);
  update public.users set password = extensions.crypt(v_password, extensions.gen_salt('bf')), password_updated_at = now(), updated_at = now() where id = p_id;
  perform public.log_action(v_admin.username, 'reset-password', v_target.username);
  return jsonb_build_object('ok', true, 'message', 'Password berhasil direset.');
end;
$$;

create or replace function public.admin_delete_user(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_admin public.users%rowtype; v_target public.users%rowtype; v_photo_urls text[];
begin
  v_admin := public.require_admin(p_token);
  if p_id = v_admin.id then raise exception 'Admin tidak dapat menghapus akunnya sendiri.'; end if;
  select * into v_target from public.users where id = p_id;
  if v_target.id is null then raise exception 'Akun tidak ditemukan.'; end if;
  perform public.assert_not_protected_target(v_admin, v_target);
  select coalesce(array_agg(url), '{}'::text[]) into v_photo_urls from (
    select photo_url as url from public.attendance where user_id = p_id and nullif(photo_url, '') is not null
    union all select photo_out_url as url from public.attendance where user_id = p_id and nullif(photo_out_url, '') is not null
  ) photos;
  delete from public.users where id = p_id;
  perform public.log_action(v_admin.username, 'delete-user', v_target.username);
  return jsonb_build_object('ok', true, 'message', 'Akun dan data absensinya berhasil dihapus.', 'photo_urls', to_jsonb(v_photo_urls));
end;
$$;

create or replace function public.admin_delete_user_attendance(p_token text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_admin public.users%rowtype; v_target public.users%rowtype; v_photo_urls text[];
begin
  v_admin := public.require_admin(p_token);
  select * into v_target from public.users where id = p_user_id;
  if v_target.id is null then raise exception 'Akun tidak ditemukan.'; end if;
  perform public.assert_not_protected_target(v_admin, v_target);
  select coalesce(array_agg(url), '{}'::text[]) into v_photo_urls from (
    select photo_url as url from public.attendance where user_id = p_user_id and nullif(photo_url, '') is not null
    union all select photo_out_url as url from public.attendance where user_id = p_user_id and nullif(photo_out_url, '') is not null
  ) photos;
  delete from public.attendance where user_id = p_user_id;
  perform public.log_action(v_admin.username, 'delete-user-attendance', v_target.username);
  return jsonb_build_object('ok', true, 'message', 'Semua data absensi peserta berhasil dihapus.', 'photo_urls', to_jsonb(v_photo_urls));
end;
$$;

create or replace function public.admin_update_intern_profile(
  p_token text, p_id uuid, p_division text default '', p_mentor text default '', p_internship_start date default null, p_internship_end date default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_admin public.users%rowtype; v_target public.users%rowtype; v_user public.users%rowtype;
  v_division text := left(trim(coalesce(p_division, '')), 80); v_mentor text := left(trim(coalesce(p_mentor, '')), 100);
begin
  v_admin := public.require_admin(p_token);
  select * into v_target from public.users where id = p_id;
  if v_target.id is null then raise exception 'Akun tidak ditemukan.'; end if;
  perform public.assert_not_protected_target(v_admin, v_target);
  if p_internship_start is not null and p_internship_end is not null and p_internship_end < p_internship_start then
    raise exception 'Tanggal selesai magang tidak boleh sebelum tanggal mulai.';
  end if;
  update public.users set division = v_division, mentor = v_mentor, internship_start = p_internship_start, internship_end = p_internship_end, updated_at = now()
  where id = p_id returning * into v_user;
  perform public.log_action(v_admin.username, 'update-intern-profile', v_user.username);
  return jsonb_build_object('ok', true, 'message', 'Profil magang berhasil diperbarui.', 'user', to_jsonb(v_user));
end;
$$;

-- admin_update_attendance: protect dev-owned attendance
create or replace function public.admin_update_attendance(
  p_token text, p_id uuid, p_check_in text, p_check_out text, p_status text, p_photo_url text default null, p_photo_out_url text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin public.users%rowtype; v_row public.attendance%rowtype; v_before public.attendance%rowtype; v_target public.users%rowtype;
  v_check_in time; v_check_out time; v_photo_url text; v_photo_out_url text;
begin
  v_admin := public.require_admin(p_token);
  if p_id is null then raise exception 'ID absensi wajib diisi.'; end if;
  if p_status is null or p_status not in ('on-time', 'late') then raise exception 'Status absensi harus Tepat waktu atau Telat.'; end if;
  if nullif(trim(coalesce(p_check_in, '')), '') is not null and trim(p_check_in) !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Jam masuk harus berformat HH:MM atau dikosongkan.'; end if;
  if nullif(trim(coalesce(p_check_out, '')), '') is not null and trim(p_check_out) !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Jam pulang harus berformat HH:MM.'; end if;
  v_check_in := nullif(trim(coalesce(p_check_in, '')), '')::time;
  v_check_out := nullif(trim(coalesce(p_check_out, '')), '')::time;
  if v_check_in is null and v_check_out is not null then raise exception 'Jam pulang harus dikosongkan jika jam masuk dikosongkan.'; end if;
  if v_check_out is not null and v_check_in is not null and v_check_out < v_check_in then raise exception 'Jam pulang tidak boleh lebih awal dari jam masuk.'; end if;
  select * into v_row from public.attendance where id = p_id for update;
  if v_row.id is null then raise exception 'Data absensi tidak ditemukan atau sudah dihapus.'; end if;
  select * into v_target from public.users where id = v_row.user_id;
  if v_target.id is not null then perform public.assert_not_protected_target(v_admin, v_target); end if;
  v_before := v_row;
  v_photo_url := case when p_photo_url is null then v_row.photo_url else trim(coalesce(p_photo_url, '')) end;
  v_photo_out_url := case when p_photo_out_url is null then v_row.photo_out_url else trim(coalesce(p_photo_out_url, '')) end;
  update public.attendance set check_in = v_check_in, check_out = v_check_out, status = p_status, photo_url = v_photo_url, photo_out_url = v_photo_out_url, updated_at = now()
  where id = p_id returning * into v_row;
  perform public.log_action(v_admin.username, 'update-attendance', v_row.name || ' | ' || v_row.date::text || ' | status ' || v_before.status || '->' || v_row.status);
  return jsonb_build_object('ok', true, 'message', 'Data absensi berhasil diperbarui.', 'attendance', to_jsonb(v_row));
end;
$$;

-- Block admin/dev attendance
create or replace function public.app_check_in(
  p_token text, p_location text default '', p_note text default '', p_photo_url text default '',
  p_latitude double precision default null, p_longitude double precision default null, p_accuracy double precision default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user public.users%rowtype; v_tz text; v_today date; v_now time; v_limit time; v_status text; v_row public.attendance%rowtype;
  v_distance double precision; v_location text;
begin
  v_user := public.require_user(p_token);
  if v_user.role in ('admin', 'dev') then raise exception 'Akun admin/developer tidak dapat melakukan absensi.'; end if;
  v_tz := public.app_timezone(); v_today := (now() at time zone v_tz)::date; v_now := (now() at time zone v_tz)::time;
  if extract(isodow from v_today) in (6, 7) then raise exception 'Absensi hanya tersedia Senin-Jumat. Akhir pekan tidak ada absensi.'; end if;
  if exists (
    select 1 from public.leave_requests lr
    where lr.user_id = v_user.id and lr.status = 'approved' and v_today between lr.start_date and lr.end_date
  ) then
    raise exception 'Anda memiliki izin/sakit/cuti yang disetujui pada hari ini. Absen tidak diperlukan.';
  end if;
  select * into v_row from public.attendance where user_id = v_user.id and date = v_today;
  if v_row.id is not null and v_row.check_in is not null then raise exception 'Anda sudah absen masuk hari ini.'; end if;
  v_distance := public.attendance_geofence_distance(p_latitude, p_longitude, p_accuracy);
  v_location := case when p_latitude is not null and p_longitude is not null then round(p_latitude::numeric, 6)::text || ', ' || round(p_longitude::numeric, 6)::text else coalesce(p_location, '') end;
  select coalesce(nullif(value, '')::time, '08:15'::time) into v_limit from public.settings where key = 'late_limit';
  v_status := case when v_now > coalesce(v_limit, '08:15'::time) then 'late' else 'on-time' end;
  if v_row.id is null then
    insert into public.attendance (user_id, name, date, check_in, status, photo_url, location, note, source, location_lat, location_lng, location_accuracy_m, location_distance_m)
    values (v_user.id, v_user.name, v_today, v_now, v_status, coalesce(p_photo_url, ''), v_location, coalesce(p_note, ''), 'web', p_latitude, p_longitude, p_accuracy, v_distance);
  else
    update public.attendance set check_in = v_now, status = v_status, photo_url = coalesce(nullif(p_photo_url, ''), photo_url), location = coalesce(nullif(v_location, ''), location),
      location_lat = coalesce(p_latitude, location_lat), location_lng = coalesce(p_longitude, location_lng), location_accuracy_m = coalesce(p_accuracy, location_accuracy_m),
      location_distance_m = coalesce(v_distance, location_distance_m), note = coalesce(p_note, note), updated_at = now()
    where id = v_row.id;
  end if;
  perform public.log_action(v_user.username, 'check-in', v_today::text);
  return jsonb_build_object('ok', true, 'message', 'Absen masuk berhasil.', 'date', v_today, 'time', to_char(v_now, 'HH24:MI'), 'distance_m', v_distance);
end;
$$;

create or replace function public.app_check_out(
  p_token text, p_location text default '', p_note text default '', p_photo_url text default '',
  p_latitude double precision default null, p_longitude double precision default null, p_accuracy double precision default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user public.users%rowtype; v_tz text; v_today date; v_now time; v_checkout_limit time; v_row public.attendance%rowtype;
  v_distance double precision; v_location text;
begin
  v_user := public.require_user(p_token);
  if v_user.role in ('admin', 'dev') then raise exception 'Akun admin/developer tidak dapat melakukan absensi.'; end if;
  v_tz := public.app_timezone(); v_today := (now() at time zone v_tz)::date; v_now := (now() at time zone v_tz)::time;
  if extract(isodow from v_today) in (6, 7) then raise exception 'Absensi hanya tersedia Senin-Jumat. Akhir pekan tidak ada absensi.'; end if;
  if exists (
    select 1 from public.leave_requests lr
    where lr.user_id = v_user.id and lr.status = 'approved' and v_today between lr.start_date and lr.end_date
  ) then
    raise exception 'Anda memiliki izin/sakit/cuti yang disetujui pada hari ini. Absen tidak diperlukan.';
  end if;
  select coalesce(nullif(trim(value), '')::time, '17:00'::time) into v_checkout_limit from public.settings where key = 'checkout_limit';
  v_checkout_limit := coalesce(v_checkout_limit, '17:00'::time);
  if v_now < v_checkout_limit then raise exception 'Absen pulang baru dapat dilakukan mulai pukul % (%).', to_char(v_checkout_limit, 'HH24:MI'), v_tz; end if;
  select * into v_row from public.attendance where user_id = v_user.id and date = v_today for update;
  if v_row.id is null or v_row.check_in is null then raise exception 'Anda belum absen masuk hari ini.'; end if;
  if v_row.check_out is not null then raise exception 'Anda sudah absen pulang hari ini.'; end if;
  v_distance := public.attendance_geofence_distance(p_latitude, p_longitude, p_accuracy);
  v_location := case when p_latitude is not null and p_longitude is not null then round(p_latitude::numeric, 6)::text || ', ' || round(p_longitude::numeric, 6)::text else coalesce(p_location, '') end;
  update public.attendance set check_out = v_now, photo_out_url = coalesce(nullif(p_photo_url, ''), photo_out_url), location = coalesce(nullif(v_location, ''), location),
    location_lat = coalesce(p_latitude, location_lat), location_lng = coalesce(p_longitude, location_lng), location_accuracy_m = coalesce(p_accuracy, location_accuracy_m),
    location_distance_m = coalesce(v_distance, location_distance_m), note = coalesce(p_note, note), updated_at = now()
  where id = v_row.id returning * into v_row;
  perform public.log_action(v_user.username, 'check-out', v_today::text || ' ' || to_char(v_now, 'HH24:MI'));
  return jsonb_build_object('ok', true, 'message', 'Absen pulang berhasil.', 'date', v_today, 'time', to_char(v_now, 'HH24:MI'), 'distance_m', v_distance, 'attendance', to_jsonb(v_row));
end;
$$;

-- Bootstrap: dev treated as admin-level
create or replace function public.app_bootstrap(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user public.users%rowtype; v_admin boolean; v_tz text; v_today date; v_is_workday boolean;
  v_users jsonb; v_attendance jsonb; v_settings jsonb; v_stats jsonb; v_announcements jsonb; v_leaves jsonb; v_corrections jsonb;
begin
  v_user := public.require_user(p_token);
  v_admin := v_user.role in ('admin', 'dev');
  v_tz := public.app_timezone(); v_today := (now() at time zone v_tz)::date;
  v_is_workday := extract(isodow from v_today) not in (6, 7);
  if v_admin then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id, 'username', u.username, 'name', u.name, 'role', u.role, 'active', u.active,
      'avatar_emoji', u.avatar_emoji, 'avatar_color', u.avatar_color, 'division', u.division, 'mentor', u.mentor,
      'internship_start', u.internship_start, 'internship_end', u.internship_end,
      'last_login_at', u.last_login_at, 'password_updated_at', u.password_updated_at, 'created_at', u.created_at, 'updated_at', u.updated_at
    ) order by case u.role when 'dev' then 0 when 'admin' then 1 else 2 end, u.name), '[]'::jsonb) into v_users from public.users u;
    select coalesce(jsonb_agg(to_jsonb(a) order by a.date desc, a.check_in desc nulls last), '[]'::jsonb) into v_attendance
    from public.attendance a join public.users u on u.id = a.user_id where u.role = 'intern';
    select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb) into v_leaves from (select * from public.leave_requests order by created_at desc limit 500) l;
    select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb) into v_corrections from (select * from public.attendance_corrections order by created_at desc limit 500) c;
  else
    v_users := jsonb_build_array(jsonb_build_object('id', v_user.id, 'username', v_user.username, 'name', v_user.name, 'role', v_user.role, 'active', v_user.active, 'avatar_emoji', v_user.avatar_emoji, 'avatar_color', v_user.avatar_color, 'division', v_user.division, 'mentor', v_user.mentor, 'internship_start', v_user.internship_start, 'internship_end', v_user.internship_end, 'last_login_at', v_user.last_login_at, 'password_updated_at', v_user.password_updated_at, 'created_at', v_user.created_at, 'updated_at', v_user.updated_at));
    select coalesce(jsonb_agg(to_jsonb(a) order by a.date desc, a.check_in desc nulls last), '[]'::jsonb) into v_attendance from public.attendance a where a.user_id = v_user.id;
    select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb) into v_leaves from (select * from public.leave_requests where user_id = v_user.id order by created_at desc limit 200) l;
    select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb) into v_corrections from (select * from public.attendance_corrections where user_id = v_user.id order by created_at desc limit 200) c;
  end if;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb) into v_announcements from (select * from public.announcements where active order by created_at desc limit 20) a;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_settings from public.settings;
  if v_is_workday then
    v_stats := jsonb_build_object(
      'totalInterns', (select count(*) from public.users where role = 'intern' and active),
      'totalAttendanceToday', (select count(*) from public.attendance a join public.users u on u.id = a.user_id where u.role = 'intern' and a.date = v_today and a.check_in is not null),
      'onTime', (select count(*) from public.attendance a join public.users u on u.id = a.user_id where u.role = 'intern' and a.date = v_today and a.check_in is not null and a.status = 'on-time'),
      'late', (select count(*) from public.attendance a join public.users u on u.id = a.user_id where u.role = 'intern' and a.date = v_today and a.check_in is not null and a.status = 'late'),
      'onLeave', (select count(distinct l.user_id) from public.leave_requests l join public.users u on u.id = l.user_id where u.role = 'intern' and u.active and l.status = 'approved' and v_today between l.start_date and l.end_date),
      'absent', greatest((select count(*) from public.users where role = 'intern' and active) - (select count(*) from public.attendance a join public.users u on u.id = a.user_id where u.role = 'intern' and a.date = v_today and a.check_in is not null) - (select count(distinct l.user_id) from public.leave_requests l join public.users u on u.id = l.user_id where u.role = 'intern' and u.active and l.status = 'approved' and v_today between l.start_date and l.end_date and not exists (select 1 from public.attendance a join public.users u2 on u2.id = a.user_id where u2.role = 'intern' and a.user_id = l.user_id and a.date = v_today and a.check_in is not null)), 0),
      'pendingLeaves', (select count(*) from public.leave_requests where status = 'pending'),
      'pendingCorrections', (select count(*) from public.attendance_corrections where status = 'pending'),
      'today', v_today, 'isWorkday', true
    );
  else
    v_stats := jsonb_build_object('totalInterns', (select count(*) from public.users where role = 'intern' and active), 'totalAttendanceToday', 0, 'onTime', 0, 'late', 0, 'onLeave', 0, 'absent', 0, 'pendingLeaves', (select count(*) from public.leave_requests where status = 'pending'), 'pendingCorrections', (select count(*) from public.attendance_corrections where status = 'pending'), 'today', v_today, 'isWorkday', false);
  end if;
  return jsonb_build_object('ok', true, 'user', jsonb_build_object('id', v_user.id, 'username', v_user.username, 'name', v_user.name, 'role', v_user.role, 'active', v_user.active, 'avatar_emoji', v_user.avatar_emoji, 'avatar_color', v_user.avatar_color, 'division', v_user.division, 'mentor', v_user.mentor, 'internship_start', v_user.internship_start, 'internship_end', v_user.internship_end, 'last_login_at', v_user.last_login_at, 'password_updated_at', v_user.password_updated_at, 'created_at', v_user.created_at, 'updated_at', v_user.updated_at), 'users', v_users, 'attendance', v_attendance, 'leaves', v_leaves, 'corrections', v_corrections, 'announcements', v_announcements, 'settings', v_settings, 'stats', v_stats, 'serverTime', to_char(now() at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI:SS'));
end;
$$;

revoke execute on function public.admin_update_attendance(text, uuid, text, text, text, text, text) from public;
revoke execute on function public.app_check_in(text, text, text, text, double precision, double precision, double precision) from public;
revoke execute on function public.app_check_out(text, text, text, text, double precision, double precision, double precision) from public;
revoke execute on function public.app_bootstrap(text) from public;
grant execute on function public.admin_update_attendance(text, uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.app_check_in(text, text, text, text, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.app_check_out(text, text, text, text, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.app_bootstrap(text) to anon, authenticated;

notify pgrst, 'reload schema';
