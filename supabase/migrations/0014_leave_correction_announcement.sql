-- 0014: izin/sakit/cuti, koreksi absensi, pengumuman, profil magang,
-- analitik pendukung, dan log audit terfilter.
-- Semua akses data lewat RPC agar token sesi aplikasi tetap menjadi autentikasi.

-- ---------------------------------------------------------------------------
-- Profil magang pada tabel users
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists division text not null default '',
  add column if not exists mentor text not null default '',
  add column if not exists internship_start date,
  add column if not exists internship_end date;

alter table public.users drop constraint if exists users_division_len;
alter table public.users add constraint users_division_len
  check (char_length(division) <= 80);

alter table public.users drop constraint if exists users_mentor_len;
alter table public.users add constraint users_mentor_len
  check (char_length(mentor) <= 100);

alter table public.users drop constraint if exists users_internship_range;
alter table public.users add constraint users_internship_range
  check (
    internship_start is null
    or internship_end is null
    or internship_end >= internship_start
  );

-- ---------------------------------------------------------------------------
-- Pengajuan izin / sakit / cuti
-- ---------------------------------------------------------------------------
create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null default '',
  username text not null default '',
  type text not null default 'izin',
  start_date date not null,
  end_date date not null,
  reason text not null default '',
  status text not null default 'pending',
  admin_note text not null default '',
  reviewed_by text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leave_requests drop constraint if exists leave_requests_type_check;
alter table public.leave_requests add constraint leave_requests_type_check
  check (type in ('izin', 'sakit', 'cuti'));

alter table public.leave_requests drop constraint if exists leave_requests_status_check;
alter table public.leave_requests add constraint leave_requests_status_check
  check (status in ('pending', 'approved', 'rejected'));

alter table public.leave_requests drop constraint if exists leave_requests_range_check;
alter table public.leave_requests add constraint leave_requests_range_check
  check (end_date >= start_date);

alter table public.leave_requests drop constraint if exists leave_requests_reason_len;
alter table public.leave_requests add constraint leave_requests_reason_len
  check (char_length(reason) between 5 and 500);

alter table public.leave_requests drop constraint if exists leave_requests_admin_note_len;
alter table public.leave_requests add constraint leave_requests_admin_note_len
  check (char_length(admin_note) <= 500);

create index if not exists leave_requests_user_idx
  on public.leave_requests (user_id, created_at desc);
create index if not exists leave_requests_status_idx
  on public.leave_requests (status, created_at desc);
create index if not exists leave_requests_range_idx
  on public.leave_requests (start_date, end_date);

drop trigger if exists leave_requests_touch on public.leave_requests;
create trigger leave_requests_touch before update on public.leave_requests
for each row execute function public.touch_updated_at();

alter table public.leave_requests enable row level security;
revoke all on public.leave_requests from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Koreksi absensi (mis. lupa absen pulang)
-- ---------------------------------------------------------------------------
create table if not exists public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  attendance_id uuid not null references public.attendance (id) on delete cascade,
  name text not null default '',
  username text not null default '',
  date date not null,
  requested_check_in time,
  requested_check_out time,
  reason text not null default '',
  status text not null default 'pending',
  admin_note text not null default '',
  reviewed_by text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.attendance_corrections drop constraint if exists attendance_corrections_status_check;
alter table public.attendance_corrections add constraint attendance_corrections_status_check
  check (status in ('pending', 'approved', 'rejected'));

alter table public.attendance_corrections drop constraint if exists attendance_corrections_reason_len;
alter table public.attendance_corrections add constraint attendance_corrections_reason_len
  check (char_length(reason) between 5 and 500);

alter table public.attendance_corrections drop constraint if exists attendance_corrections_admin_note_len;
alter table public.attendance_corrections add constraint attendance_corrections_admin_note_len
  check (char_length(admin_note) <= 500);

create index if not exists attendance_corrections_user_idx
  on public.attendance_corrections (user_id, created_at desc);
create index if not exists attendance_corrections_status_idx
  on public.attendance_corrections (status, created_at desc);
create index if not exists attendance_corrections_attendance_idx
  on public.attendance_corrections (attendance_id);

drop trigger if exists attendance_corrections_touch on public.attendance_corrections;
create trigger attendance_corrections_touch before update on public.attendance_corrections
for each row execute function public.touch_updated_at();

alter table public.attendance_corrections enable row level security;
revoke all on public.attendance_corrections from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pengumuman / agenda
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  category text not null default 'info',
  event_date date,
  active boolean not null default true,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.announcements drop constraint if exists announcements_title_len;
alter table public.announcements add constraint announcements_title_len
  check (char_length(title) between 3 and 120);

alter table public.announcements drop constraint if exists announcements_body_len;
alter table public.announcements add constraint announcements_body_len
  check (char_length(body) between 3 and 2000);

alter table public.announcements drop constraint if exists announcements_category_check;
alter table public.announcements add constraint announcements_category_check
  check (category in ('info', 'penting', 'agenda'));

create index if not exists announcements_active_idx
  on public.announcements (active, created_at desc);

drop trigger if exists announcements_touch on public.announcements;
create trigger announcements_touch before update on public.announcements
for each row execute function public.touch_updated_at();

alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: pengajuan izin
-- ---------------------------------------------------------------------------
create or replace function public.app_submit_leave(
  p_token text,
  p_type text,
  p_start_date date,
  p_end_date date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_type text := lower(trim(coalesce(p_type, '')));
  v_start date := coalesce(p_start_date, (now() at time zone public.app_timezone())::date);
  v_end date := coalesce(p_end_date, coalesce(p_start_date, (now() at time zone public.app_timezone())::date));
  v_reason text := trim(coalesce(p_reason, ''));
  v_row public.leave_requests%rowtype;
begin
  v_user := public.require_user(p_token);

  if v_type not in ('izin', 'sakit', 'cuti') then
    raise exception 'Jenis pengajuan harus izin, sakit, atau cuti.';
  end if;
  if v_end < v_start then
    raise exception 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.';
  end if;
  if v_start < (now() at time zone public.app_timezone())::date - 60 then
    raise exception 'Pengajuan hanya dapat dibuat untuk tanggal dalam 60 hari terakhir atau setelahnya.';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Alasan harus 5-500 karakter.';
  end if;
  if exists (
    select 1 from public.leave_requests
    where user_id = v_user.id
      and status in ('pending', 'approved')
      and daterange(start_date, end_date, '[]') && daterange(v_start, v_end, '[]')
  ) then
    raise exception 'Sudah ada pengajuan aktif pada rentang tanggal tersebut.';
  end if;

  insert into public.leave_requests (user_id, name, username, type, start_date, end_date, reason)
  values (v_user.id, v_user.name, v_user.username, v_type, v_start, v_end, v_reason)
  returning * into v_row;

  perform public.log_action(
    v_user.username,
    'submit-leave',
    v_type || ' | ' || v_start::text || ' s/d ' || v_end::text
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Pengajuan ' || v_type || ' berhasil dikirim dan menunggu persetujuan admin.',
    'leave', to_jsonb(v_row)
  );
end;
$$;

create or replace function public.app_my_leaves(p_token text, p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 300));
  v_rows jsonb;
begin
  v_user := public.require_user(p_token);

  select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select * from public.leave_requests
    where user_id = v_user.id
    order by created_at desc
    limit v_limit
  ) l;

  return jsonb_build_object('ok', true, 'leaves', v_rows);
end;
$$;

create or replace function public.admin_list_leaves(
  p_token text,
  p_status text default '',
  p_limit integer default 200,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_rows jsonb;
  v_summary jsonb;
begin
  v_admin := public.require_admin(p_token);

  if v_status <> '' and v_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Status pengajuan tidak valid.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select * from public.leave_requests
    where v_status = '' or status = v_status
    order by created_at desc
    limit v_limit offset v_offset
  ) l;

  select jsonb_build_object(
    'pending', count(*) filter (where status = 'pending'),
    'approved', count(*) filter (where status = 'approved'),
    'rejected', count(*) filter (where status = 'rejected'),
    'total', count(*)
  )
  into v_summary
  from public.leave_requests;

  return jsonb_build_object('ok', true, 'leaves', v_rows, 'summary', v_summary);
end;
$$;

create or replace function public.admin_review_leave(
  p_token text,
  p_id uuid,
  p_status text,
  p_admin_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_note text := left(trim(coalesce(p_admin_note, '')), 500);
  v_row public.leave_requests%rowtype;
begin
  v_admin := public.require_admin(p_token);

  if p_id is null then
    raise exception 'ID pengajuan wajib diisi.';
  end if;
  if v_status not in ('approved', 'rejected') then
    raise exception 'Status review harus approved atau rejected.';
  end if;

  select * into v_row from public.leave_requests where id = p_id for update;
  if v_row.id is null then
    raise exception 'Pengajuan tidak ditemukan.';
  end if;

  update public.leave_requests
  set status = v_status,
      admin_note = v_note,
      reviewed_by = v_admin.username,
      reviewed_at = now(),
      updated_at = now()
  where id = p_id
  returning * into v_row;

  perform public.log_action(
    v_admin.username,
    'review-leave',
    v_row.username || ' | ' || v_row.type || ' | ' || v_row.start_date::text ||
      ' s/d ' || v_row.end_date::text || ' | ' || v_status
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Pengajuan ' || v_row.username || ' berhasil ' ||
      case when v_status = 'approved' then 'disetujui.' else 'ditolak.' end,
    'leave', to_jsonb(v_row)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: koreksi absensi
-- ---------------------------------------------------------------------------
create or replace function public.app_submit_correction(
  p_token text,
  p_attendance_id uuid,
  p_requested_check_in text default '',
  p_requested_check_out text default '',
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_row public.attendance%rowtype;
  v_check_in time := nullif(trim(coalesce(p_requested_check_in, '')), '')::time;
  v_check_out time := nullif(trim(coalesce(p_requested_check_out, '')), '')::time;
  v_reason text := trim(coalesce(p_reason, ''));
  v_correction public.attendance_corrections%rowtype;
begin
  v_user := public.require_user(p_token);

  if p_attendance_id is null then
    raise exception 'Pilih data absensi yang ingin dikoreksi.';
  end if;
  if v_check_in is null and v_check_out is null then
    raise exception 'Isi minimal salah satu jam masuk atau jam pulang yang benar.';
  end if;
  if v_check_in is not null and v_check_in < '00:00'::time then
    raise exception 'Jam masuk tidak valid.';
  end if;
  if v_check_out is not null and v_check_in is not null and v_check_out < v_check_in then
    raise exception 'Jam pulang tidak boleh lebih awal dari jam masuk.';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Alasan koreksi harus 5-500 karakter.';
  end if;

  select * into v_row
  from public.attendance
  where id = p_attendance_id and user_id = v_user.id;

  if v_row.id is null then
    raise exception 'Data absensi tidak ditemukan atau bukan milik Anda.';
  end if;
  if v_row.check_in is not null and v_check_out is not null then
    raise exception 'Absensi ini sudah lengkap. Koreksi hanya untuk data yang belum lengkap.';
  end if;
  if exists (
    select 1 from public.attendance_corrections
    where attendance_id = p_attendance_id and status = 'pending'
  ) then
    raise exception 'Sudah ada pengajuan koreksi yang menunggu persetujuan untuk absensi ini.';
  end if;

  insert into public.attendance_corrections (
    user_id, attendance_id, name, username, date,
    requested_check_in, requested_check_out, reason
  )
  values (
    v_user.id, v_row.id, v_user.name, v_user.username, v_row.date,
    v_check_in, v_check_out, v_reason
  )
  returning * into v_correction;

  perform public.log_action(
    v_user.username,
    'submit-correction',
    v_row.date::text || ' | masuk ' || coalesce(to_char(v_check_in, 'HH24:MI'), '-') ||
      ' pulang ' || coalesce(to_char(v_check_out, 'HH24:MI'), '-')
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Pengajuan koreksi absensi berhasil dikirim dan menunggu persetujuan admin.',
    'correction', to_jsonb(v_correction)
  );
end;
$$;

create or replace function public.app_my_corrections(p_token text, p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 300));
  v_rows jsonb;
begin
  v_user := public.require_user(p_token);

  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select * from public.attendance_corrections
    where user_id = v_user.id
    order by created_at desc
    limit v_limit
  ) c;

  return jsonb_build_object('ok', true, 'corrections', v_rows);
end;
$$;

create or replace function public.admin_list_corrections(
  p_token text,
  p_status text default '',
  p_limit integer default 200,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_rows jsonb;
  v_summary jsonb;
begin
  v_admin := public.require_admin(p_token);

  if v_status <> '' and v_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Status koreksi tidak valid.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select * from public.attendance_corrections
    where v_status = '' or status = v_status
    order by created_at desc
    limit v_limit offset v_offset
  ) c;

  select jsonb_build_object(
    'pending', count(*) filter (where status = 'pending'),
    'approved', count(*) filter (where status = 'approved'),
    'rejected', count(*) filter (where status = 'rejected'),
    'total', count(*)
  )
  into v_summary
  from public.attendance_corrections;

  return jsonb_build_object('ok', true, 'corrections', v_rows, 'summary', v_summary);
end;
$$;

create or replace function public.admin_review_correction(
  p_token text,
  p_id uuid,
  p_status text,
  p_admin_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_note text := left(trim(coalesce(p_admin_note, '')), 500);
  v_correction public.attendance_corrections%rowtype;
  v_row public.attendance%rowtype;
  v_check_in time;
  v_check_out time;
  v_limit time;
  v_new_status text;
begin
  v_admin := public.require_admin(p_token);

  if p_id is null then
    raise exception 'ID koreksi wajib diisi.';
  end if;
  if v_status not in ('approved', 'rejected') then
    raise exception 'Status review harus approved atau rejected.';
  end if;

  select * into v_correction
  from public.attendance_corrections
  where id = p_id
  for update;

  if v_correction.id is null then
    raise exception 'Pengajuan koreksi tidak ditemukan.';
  end if;

  if v_status = 'approved' then
    select * into v_row from public.attendance where id = v_correction.attendance_id for update;
    if v_row.id is null then
      raise exception 'Data absensi yang dikoreksi sudah tidak ada.';
    end if;

    v_check_in := coalesce(v_correction.requested_check_in, v_row.check_in);
    v_check_out := coalesce(v_correction.requested_check_out, v_row.check_out);

    if v_check_in is null then
      raise exception 'Jam masuk hasil koreksi tidak boleh kosong.';
    end if;
    if v_check_out is not null and v_check_out < v_check_in then
      raise exception 'Jam pulang hasil koreksi tidak boleh lebih awal dari jam masuk.';
    end if;

    select coalesce(nullif(trim(value), '')::time, '08:15'::time)
    into v_limit
    from public.settings
    where key = 'late_limit';
    v_limit := coalesce(v_limit, '08:15'::time);

    v_new_status := case when v_check_in > v_limit then 'late' else 'on-time' end;

    update public.attendance
    set check_in = v_check_in,
        check_out = v_check_out,
        status = v_new_status,
        updated_at = now()
    where id = v_row.id
    returning * into v_row;

    perform public.log_action(
      v_admin.username,
      'approve-correction',
      v_correction.username || ' | ' || v_correction.date::text ||
        ' | masuk ' || coalesce(to_char(v_check_in, 'HH24:MI'), '-') ||
        ' pulang ' || coalesce(to_char(v_check_out, 'HH24:MI'), '-')
    );
  end if;

  update public.attendance_corrections
  set status = v_status,
      admin_note = v_note,
      reviewed_by = v_admin.username,
      reviewed_at = now(),
      updated_at = now()
  where id = p_id
  returning * into v_correction;

  if v_status = 'rejected' then
    perform public.log_action(
      v_admin.username,
      'reject-correction',
      v_correction.username || ' | ' || v_correction.date::text
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'Koreksi absensi ' || v_correction.username || ' berhasil ' ||
      case when v_status = 'approved' then 'disetujui dan diterapkan.' else 'ditolak.' end,
    'correction', to_jsonb(v_correction),
    'attendance', case when v_row.id is null then null else to_jsonb(v_row) end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: pengumuman
-- ---------------------------------------------------------------------------
create or replace function public.app_list_announcements(p_token text, p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_rows jsonb;
begin
  v_user := public.require_user(p_token);

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select * from public.announcements
    where active
    order by created_at desc
    limit v_limit
  ) a;

  return jsonb_build_object('ok', true, 'announcements', v_rows);
end;
$$;

create or replace function public.admin_list_announcements(p_token text, p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
  v_rows jsonb;
begin
  v_admin := public.require_admin(p_token);

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select * from public.announcements
    order by created_at desc
    limit v_limit
  ) a;

  return jsonb_build_object('ok', true, 'announcements', v_rows);
end;
$$;

create or replace function public.admin_save_announcement(
  p_token text,
  p_id uuid default null,
  p_title text default '',
  p_body text default '',
  p_category text default 'info',
  p_event_date date default null,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
  v_category text := lower(trim(coalesce(p_category, 'info')));
  v_row public.announcements%rowtype;
begin
  v_admin := public.require_admin(p_token);

  if char_length(v_title) < 3 or char_length(v_title) > 120 then
    raise exception 'Judul pengumuman harus 3-120 karakter.';
  end if;
  if char_length(v_body) < 3 or char_length(v_body) > 2000 then
    raise exception 'Isi pengumuman harus 3-2000 karakter.';
  end if;
  if v_category not in ('info', 'penting', 'agenda') then
    raise exception 'Kategori pengumuman tidak valid.';
  end if;
  if v_category = 'agenda' and p_event_date is null then
    raise exception 'Pengumuman agenda wajib memiliki tanggal kegiatan.';
  end if;

  if p_id is null then
    insert into public.announcements (title, body, category, event_date, active, created_by)
    values (v_title, v_body, v_category, p_event_date, coalesce(p_active, true), v_admin.username)
    returning * into v_row;
  else
    update public.announcements
    set title = v_title,
        body = v_body,
        category = v_category,
        event_date = p_event_date,
        active = coalesce(p_active, true),
        updated_at = now()
    where id = p_id
    returning * into v_row;

    if v_row.id is null then
      raise exception 'Pengumuman tidak ditemukan.';
    end if;
  end if;

  perform public.log_action(
    v_admin.username,
    case when p_id is null then 'create-announcement' else 'update-announcement' end,
    v_title
  );

  return jsonb_build_object(
    'ok', true,
    'message', case when p_id is null then 'Pengumuman berhasil dibuat.' else 'Pengumuman berhasil diperbarui.' end,
    'announcement', to_jsonb(v_row)
  );
end;
$$;

create or replace function public.admin_delete_announcement(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_row public.announcements%rowtype;
begin
  v_admin := public.require_admin(p_token);

  select * into v_row from public.announcements where id = p_id;
  if v_row.id is null then
    raise exception 'Pengumuman tidak ditemukan.';
  end if;

  delete from public.announcements where id = p_id;
  perform public.log_action(v_admin.username, 'delete-announcement', v_row.title);

  return jsonb_build_object('ok', true, 'message', 'Pengumuman berhasil dihapus.');
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: profil magang (admin)
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_intern_profile(
  p_token text,
  p_id uuid,
  p_division text default '',
  p_mentor text default '',
  p_internship_start date default null,
  p_internship_end date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_division text := trim(coalesce(p_division, ''));
  v_mentor text := trim(coalesce(p_mentor, ''));
  v_user public.users%rowtype;
begin
  v_admin := public.require_admin(p_token);

  if p_id is null then
    raise exception 'ID akun wajib diisi.';
  end if;
  if char_length(v_division) > 80 then
    raise exception 'Divisi maksimal 80 karakter.';
  end if;
  if char_length(v_mentor) > 100 then
    raise exception 'Mentor maksimal 100 karakter.';
  end if;
  if p_internship_start is not null and p_internship_end is not null
    and p_internship_end < p_internship_start then
    raise exception 'Tanggal selesai magang tidak boleh lebih awal dari tanggal mulai.';
  end if;

  select * into v_user from public.users where id = p_id;
  if v_user.id is null then
    raise exception 'Akun tidak ditemukan.';
  end if;

  update public.users
  set division = v_division,
      mentor = v_mentor,
      internship_start = p_internship_start,
      internship_end = p_internship_end,
      updated_at = now()
  where id = p_id
  returning * into v_user;

  perform public.log_action(
    v_admin.username,
    'update-intern-profile',
    v_user.username || ' | ' || coalesce(nullif(v_division, ''), '-') ||
      ' | mentor ' || coalesce(nullif(v_mentor, ''), '-')
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Profil magang berhasil diperbarui.',
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
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: log audit terfilter (admin)
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_logs(
  p_token text,
  p_action text default '',
  p_search text default '',
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_search text := lower(trim(coalesce(p_search, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_rows jsonb;
  v_total integer;
begin
  v_admin := public.require_admin(p_token);

  select count(*) into v_total
  from public.logs l
  where (v_action = '' or lower(l.action) = v_action)
    and (
      v_search = ''
      or lower(l.actor) like '%' || v_search || '%'
      or lower(l.action) like '%' || v_search || '%'
      or lower(l.detail) like '%' || v_search || '%'
    );

  select coalesce(jsonb_agg(to_jsonb(l) order by l.timestamp desc), '[]'::jsonb)
  into v_rows
  from (
    select * from public.logs
    where (v_action = '' or lower(action) = v_action)
      and (
        v_search = ''
        or lower(actor) like '%' || v_search || '%'
        or lower(action) like '%' || v_search || '%'
        or lower(detail) like '%' || v_search || '%'
      )
    order by timestamp desc
    limit v_limit offset v_offset
  ) l;

  return jsonb_build_object('ok', true, 'logs', v_rows, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- Bootstrap: sertakan profil magang, izin, koreksi, dan pengumuman
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
-- Export: sertakan izin, koreksi, dan pengumuman
-- ---------------------------------------------------------------------------
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
        'avatar_emoji', u.avatar_emoji,
        'avatar_color', u.avatar_color,
        'division', u.division,
        'mentor', u.mentor,
        'internship_start', u.internship_start,
        'internship_end', u.internship_end,
        'last_login_at', u.last_login_at,
        'password_updated_at', u.password_updated_at,
        'created_at', u.created_at
      ) order by u.name), '[]'::jsonb)
      from public.users u
    ),
    'attendance', (
      select coalesce(jsonb_agg(to_jsonb(a) order by a.date desc, a.check_in desc nulls last), '[]'::jsonb)
      from public.attendance a
    ),
    'leaves', (
      select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb)
      from public.leave_requests l
    ),
    'corrections', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
      from public.attendance_corrections c
    ),
    'announcements', (
      select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
      from public.announcements a
    ),
    'settings', (
      select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
      from public.settings
    ),
    'logs', (
      select coalesce(jsonb_agg(to_jsonb(l) order by l.timestamp desc), '[]'::jsonb)
      from public.logs l
    ),
    'exportedAt', to_char(now() at time zone public.app_timezone(), 'YYYY-MM-DD"T"HH24:MI:SS')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Hak eksekusi
-- ---------------------------------------------------------------------------
revoke execute on function public.app_submit_leave(text, text, date, date, text) from public;
revoke execute on function public.app_my_leaves(text, integer) from public;
revoke execute on function public.admin_list_leaves(text, text, integer, integer) from public;
revoke execute on function public.admin_review_leave(text, uuid, text, text) from public;
revoke execute on function public.app_submit_correction(text, uuid, text, text, text) from public;
revoke execute on function public.app_my_corrections(text, integer) from public;
revoke execute on function public.admin_list_corrections(text, text, integer, integer) from public;
revoke execute on function public.admin_review_correction(text, uuid, text, text) from public;
revoke execute on function public.app_list_announcements(text, integer) from public;
revoke execute on function public.admin_list_announcements(text, integer) from public;
revoke execute on function public.admin_save_announcement(text, uuid, text, text, text, date, boolean) from public;
revoke execute on function public.admin_delete_announcement(text, uuid) from public;
revoke execute on function public.admin_update_intern_profile(text, uuid, text, text, date, date) from public;
revoke execute on function public.admin_list_logs(text, text, text, integer, integer) from public;
revoke execute on function public.app_bootstrap(text) from public;
revoke execute on function public.app_export_data(text) from public;

grant execute on function public.app_submit_leave(text, text, date, date, text) to anon, authenticated;
grant execute on function public.app_my_leaves(text, integer) to anon, authenticated;
grant execute on function public.admin_list_leaves(text, text, integer, integer) to anon, authenticated;
grant execute on function public.admin_review_leave(text, uuid, text, text) to anon, authenticated;
grant execute on function public.app_submit_correction(text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.app_my_corrections(text, integer) to anon, authenticated;
grant execute on function public.admin_list_corrections(text, text, integer, integer) to anon, authenticated;
grant execute on function public.admin_review_correction(text, uuid, text, text) to anon, authenticated;
grant execute on function public.app_list_announcements(text, integer) to anon, authenticated;
grant execute on function public.admin_list_announcements(text, integer) to anon, authenticated;
grant execute on function public.admin_save_announcement(text, uuid, text, text, text, date, boolean) to anon, authenticated;
grant execute on function public.admin_delete_announcement(text, uuid) to anon, authenticated;
grant execute on function public.admin_update_intern_profile(text, uuid, text, text, date, date) to anon, authenticated;
grant execute on function public.admin_list_logs(text, text, text, integer, integer) to anon, authenticated;
grant execute on function public.app_bootstrap(text) to anon, authenticated;
grant execute on function public.app_export_data(text) to anon, authenticated;

notify pgrst, 'reload schema';
