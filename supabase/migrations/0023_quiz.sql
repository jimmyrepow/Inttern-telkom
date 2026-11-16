-- ---------------------------------------------------------------------------
-- Kuis Telkom Akses
-- Sesi 10 soal acak dari bank 100 soal, tanpa pengulangan selama stok belum habis,
-- poin diberikan di server, maksimal 3 sesi per hari.
-- ---------------------------------------------------------------------------

create table if not exists public.quiz_questions (
  id serial primary key,
  category text not null,
  question text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option char(1) not null check (correct_option in ('A', 'B', 'C', 'D')),
  explanation text not null default '',
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists quiz_questions_active_idx on public.quiz_questions (active, sort_order);

create table if not exists public.quiz_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  total_points int not null default 0 check (total_points >= 0),
  total_sessions int not null default 0 check (total_sessions >= 0),
  total_correct int not null default 0 check (total_correct >= 0),
  total_answered int not null default 0 check (total_answered >= 0),
  best_score int not null default 0 check (best_score >= 0),
  best_points int not null default 0 check (best_points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  question_ids int[] not null,
  status text not null default 'active' check (status in ('active', 'completed', 'expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  correct_count int not null default 0 check (correct_count >= 0),
  answered_count int not null default 0 check (answered_count >= 0),
  points_awarded int not null default 0 check (points_awarded >= 0),
  session_date date not null default ((now() at time zone public.app_timezone())::date),
  created_at timestamptz not null default now()
);

create index if not exists quiz_sessions_user_idx on public.quiz_sessions (user_id, status, started_at desc);
create index if not exists quiz_sessions_day_idx on public.quiz_sessions (user_id, session_date);
create unique index if not exists quiz_sessions_one_active_idx
  on public.quiz_sessions (user_id)
  where status = 'active';

create table if not exists public.quiz_answers (
  session_id uuid not null references public.quiz_sessions (id) on delete cascade,
  question_id int not null references public.quiz_questions (id) on delete cascade,
  selected_option char(1) not null check (selected_option in ('A', 'B', 'C', 'D')),
  is_correct boolean not null default false,
  answered_at timestamptz not null default now(),
  primary key (session_id, question_id)
);

create table if not exists public.quiz_seen (
  user_id uuid not null references public.users (id) on delete cascade,
  question_id int not null references public.quiz_questions (id) on delete cascade,
  times_seen int not null default 1 check (times_seen >= 1),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

-- ---------------------------------------------------------------------------
-- Helper: pastikan profil kuis ada
-- ---------------------------------------------------------------------------
create or replace function public.quiz_ensure_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.quiz_profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helper: ringkasan profil kuis
-- ---------------------------------------------------------------------------
create or replace function public.quiz_profile_json(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.quiz_profiles%rowtype;
  v_today date := (now() at time zone public.app_timezone())::date;
  v_today_sessions int := 0;
  v_bank int := 0;
  v_seen int := 0;
begin
  perform public.quiz_ensure_user(p_user_id);

  select * into v_profile
  from public.quiz_profiles
  where user_id = p_user_id;

  select count(*)::int into v_today_sessions
  from public.quiz_sessions
  where user_id = p_user_id
    and session_date = v_today
    and status in ('completed', 'expired');

  select count(*)::int into v_bank
  from public.quiz_questions
  where active;

  select count(*)::int into v_seen
  from public.quiz_seen
  where user_id = p_user_id;

  return jsonb_build_object(
    'total_points', v_profile.total_points,
    'total_sessions', v_profile.total_sessions,
    'total_correct', v_profile.total_correct,
    'total_answered', v_profile.total_answered,
    'best_score', v_profile.best_score,
    'best_points', v_profile.best_points,
    'accuracy', case
      when v_profile.total_answered > 0
        then round((v_profile.total_correct::numeric / v_profile.total_answered) * 100)::int
      else 0
    end,
    'today_sessions', v_today_sessions,
    'daily_limit', 3,
    'remaining_sessions', greatest(0, 3 - v_today_sessions),
    'question_bank', v_bank,
    'seen_questions', v_seen,
    'unseen_questions', greatest(0, v_bank - v_seen),
    'points_per_correct', 10,
    'perfect_bonus', 20,
    'question_count', 10,
    'duration_minutes', 15
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Helper: representasi sesi tanpa membocorkan jawaban yang belum dijawab
-- ---------------------------------------------------------------------------
create or replace function public.quiz_session_json(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.quiz_sessions%rowtype;
  v_questions jsonb;
begin
  select * into v_session
  from public.quiz_sessions
  where id = p_session_id;

  if v_session.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'category', q.category,
    'question', q.question,
    'options', jsonb_build_array(q.option_a, q.option_b, q.option_c, q.option_d),
    'answered', (a.question_id is not null),
    'selected_option', a.selected_option,
    'is_correct', a.is_correct,
    'correct_option', case when a.question_id is not null then q.correct_option else null end,
    'explanation', case when a.question_id is not null then q.explanation else null end
  ) order by t.ord), '[]'::jsonb)
  into v_questions
  from unnest(v_session.question_ids) with ordinality as t(question_id, ord)
  join public.quiz_questions q on q.id = t.question_id
  left join public.quiz_answers a
    on a.session_id = v_session.id
   and a.question_id = q.id;

  return jsonb_build_object(
    'id', v_session.id,
    'status', v_session.status,
    'startedAt', v_session.started_at,
    'expiresAt', v_session.expires_at,
    'completedAt', v_session.completed_at,
    'totalQuestions', coalesce(array_length(v_session.question_ids, 1), 0),
    'answeredCount', v_session.answered_count,
    'correctCount', v_session.correct_count,
    'pointsAwarded', v_session.points_awarded,
    'questions', v_questions
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Helper: selesaikan sesi dan berikan poin sekali saja
-- ---------------------------------------------------------------------------
create or replace function public.quiz_finalize(p_session_id uuid, p_award boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.quiz_sessions%rowtype;
  v_answered int := 0;
  v_correct int := 0;
  v_points int := 0;
  v_status text := 'completed';
begin
  select * into v_session
  from public.quiz_sessions
  where id = p_session_id
  for update;

  if v_session.id is null then
    return null;
  end if;

  if v_session.status <> 'active' then
    return public.quiz_session_json(p_session_id);
  end if;

  select
    count(*)::int,
    (count(*) filter (where is_correct))::int
  into v_answered, v_correct
  from public.quiz_answers
  where session_id = p_session_id;

  if p_award and v_answered > 0 then
    v_points := v_correct * 10;
    if v_correct >= coalesce(array_length(v_session.question_ids, 1), 10) then
      v_points := v_points + 20;
    end if;
  end if;

  if now() >= v_session.expires_at and v_answered < coalesce(array_length(v_session.question_ids, 1), 10) then
    v_status := 'expired';
  else
    v_status := 'completed';
  end if;

  update public.quiz_sessions
  set status = v_status,
      completed_at = now(),
      answered_count = v_answered,
      correct_count = v_correct,
      points_awarded = v_points
  where id = p_session_id;

  if v_answered > 0 then
    update public.quiz_profiles
    set total_points = total_points + v_points,
        total_sessions = total_sessions + 1,
        total_correct = total_correct + v_correct,
        total_answered = total_answered + v_answered,
        best_score = greatest(best_score, v_correct),
        best_points = greatest(best_points, v_points),
        updated_at = now()
    where user_id = v_session.user_id;
  else
    update public.quiz_profiles
    set total_sessions = total_sessions + 1,
        updated_at = now()
    where user_id = v_session.user_id;
  end if;

  return public.quiz_session_json(p_session_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- State kuis untuk peserta
-- ---------------------------------------------------------------------------
create or replace function public.app_quiz_state(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_active public.quiz_sessions%rowtype;
  v_recent jsonb;
  v_leaders jsonb;
begin
  v_user := public.require_user(p_token);

  if v_user.role = 'admin' then
    raise exception 'Kuis hanya tersedia untuk peserta magang.';
  end if;

  perform public.quiz_ensure_user(v_user.id);

  select * into v_active
  from public.quiz_sessions
  where user_id = v_user.id
    and status = 'active'
  order by started_at desc
  limit 1;

  if v_active.id is not null and now() >= v_active.expires_at then
    perform public.quiz_finalize(v_active.id, true);
    v_active := null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'status', s.status,
    'correctCount', s.correct_count,
    'answeredCount', s.answered_count,
    'pointsAwarded', s.points_awarded,
    'completedAt', s.completed_at
  ) order by s.started_at desc), '[]'::jsonb)
  into v_recent
  from (
    select *
    from public.quiz_sessions
    where user_id = v_user.id
      and status in ('completed', 'expired')
    order by started_at desc
    limit 5
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', x.name,
    'username', x.username,
    'avatarEmoji', x.avatar_emoji,
    'avatarColor', x.avatar_color,
    'totalPoints', x.total_points,
    'bestScore', x.best_score,
    'sessions', x.total_sessions
  ) order by x.total_points desc, x.best_score desc, x.total_sessions asc, x.name asc), '[]'::jsonb)
  into v_leaders
  from (
    select u.name, u.username, u.avatar_emoji, u.avatar_color,
           p.total_points, p.best_score, p.total_sessions
    from public.quiz_profiles p
    join public.users u on u.id = p.user_id
    where u.role = 'intern' and u.active and p.total_points > 0
    order by p.total_points desc, p.best_score desc, p.total_sessions asc, u.name asc
    limit 10
  ) x;

  return jsonb_build_object(
    'ok', true,
    'serverNow', now(),
    'profile', public.quiz_profile_json(v_user.id),
    'activeSession', case when v_active.id is not null then public.quiz_session_json(v_active.id) else null end,
    'recent', v_recent,
    'leaders', v_leaders
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Mulai sesi kuis (10 soal acak, prioritaskan yang belum pernah keluar)
-- ---------------------------------------------------------------------------
create or replace function public.app_quiz_start(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_active public.quiz_sessions%rowtype;
  v_today date;
  v_today_sessions int := 0;
  v_bank int := 0;
  v_ids int[];
  v_session_id uuid;
begin
  v_user := public.require_user(p_token);

  if v_user.role = 'admin' then
    raise exception 'Kuis hanya tersedia untuk peserta magang.';
  end if;

  perform public.quiz_ensure_user(v_user.id);
  v_today := (now() at time zone public.app_timezone())::date;

  select * into v_active
  from public.quiz_sessions
  where user_id = v_user.id
    and status = 'active'
  order by started_at desc
  limit 1;

  if v_active.id is not null then
    if now() >= v_active.expires_at then
      perform public.quiz_finalize(v_active.id, true);
    else
      return jsonb_build_object(
        'ok', true,
        'serverNow', now(),
        'resumed', true,
        'session', public.quiz_session_json(v_active.id),
        'profile', public.quiz_profile_json(v_user.id)
      );
    end if;
  end if;

  select count(*)::int into v_today_sessions
  from public.quiz_sessions
  where user_id = v_user.id
    and session_date = v_today
    and status in ('completed', 'expired');

  if v_today_sessions >= 3 then
    raise exception 'Kuota kuis hari ini sudah habis (3 sesi). Coba lagi besok.';
  end if;

  select count(*)::int into v_bank
  from public.quiz_questions
  where active;

  if v_bank < 10 then
    raise exception 'Bank soal kuis belum cukup. Hubungi admin.';
  end if;

  select array_agg(picked.id order by picked.r)
  into v_ids
  from (
    select q.id, random() as r
    from public.quiz_questions q
    left join public.quiz_seen s
      on s.user_id = v_user.id
     and s.question_id = q.id
    where q.active
    order by s.last_seen_at asc nulls first, random()
    limit 10
  ) picked;

  begin
    insert into public.quiz_sessions (user_id, question_ids, expires_at, session_date)
    values (v_user.id, v_ids, now() + interval '15 minutes', v_today)
    returning id into v_session_id;
  exception when unique_violation then
    select * into v_active
    from public.quiz_sessions
    where user_id = v_user.id
      and status = 'active'
    order by started_at desc
    limit 1;

    if v_active.id is not null then
      return jsonb_build_object(
        'ok', true,
        'serverNow', now(),
        'resumed', true,
        'session', public.quiz_session_json(v_active.id),
        'profile', public.quiz_profile_json(v_user.id)
      );
    end if;

    raise;
  end;

  insert into public.quiz_seen (user_id, question_id, times_seen, last_seen_at)
  select v_user.id, qid, 1, now()
  from unnest(v_ids) as qid
  on conflict (user_id, question_id) do update
    set times_seen = quiz_seen.times_seen + 1,
        last_seen_at = now();

  return jsonb_build_object(
    'ok', true,
    'serverNow', now(),
    'resumed', false,
    'session', public.quiz_session_json(v_session_id),
    'profile', public.quiz_profile_json(v_user.id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Jawab satu soal
-- ---------------------------------------------------------------------------
create or replace function public.app_quiz_answer(
  p_token text,
  p_session_id uuid,
  p_question_id int,
  p_option text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_session public.quiz_sessions%rowtype;
  v_question public.quiz_questions%rowtype;
  v_existing public.quiz_answers%rowtype;
  v_option text := upper(trim(coalesce(p_option, '')));
  v_is_correct boolean := false;
  v_answered int := 0;
  v_correct int := 0;
  v_finished boolean := false;
begin
  v_user := public.require_user(p_token);

  if v_user.role = 'admin' then
    raise exception 'Kuis hanya tersedia untuk peserta magang.';
  end if;

  select * into v_session
  from public.quiz_sessions
  where id = p_session_id
    and user_id = v_user.id
  for update;

  if v_session.id is null then
    raise exception 'Sesi kuis tidak ditemukan.';
  end if;

  if v_session.status <> 'active' then
    return jsonb_build_object(
      'ok', true,
      'finished', true,
      'session', public.quiz_session_json(v_session.id),
      'profile', public.quiz_profile_json(v_user.id)
    );
  end if;

  if v_option !~ '^[ABCD]$' then
    raise exception 'Pilihan jawaban tidak valid.';
  end if;

  if not (p_question_id = any(v_session.question_ids)) then
    raise exception 'Soal tidak termasuk dalam sesi ini.';
  end if;

  select * into v_question
  from public.quiz_questions
  where id = p_question_id;

  if v_question.id is null then
    raise exception 'Soal tidak ditemukan.';
  end if;

  select * into v_existing
  from public.quiz_answers
  where session_id = v_session.id
    and question_id = p_question_id;

  if v_existing.session_id is not null then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'is_correct', v_existing.is_correct,
      'correct_option', v_question.correct_option,
      'explanation', v_question.explanation,
      'finished', false,
      'session', public.quiz_session_json(v_session.id),
      'profile', public.quiz_profile_json(v_user.id)
    );
  end if;

  if now() >= v_session.expires_at then
    perform public.quiz_finalize(v_session.id, true);
    return jsonb_build_object(
      'ok', true,
      'expired', true,
      'finished', true,
      'session', public.quiz_session_json(v_session.id),
      'profile', public.quiz_profile_json(v_user.id)
    );
  end if;

  v_is_correct := (v_option = v_question.correct_option);

  insert into public.quiz_answers (session_id, question_id, selected_option, is_correct)
  values (v_session.id, p_question_id, v_option, v_is_correct);

  select
    count(*)::int,
    (count(*) filter (where is_correct))::int
  into v_answered, v_correct
  from public.quiz_answers
  where session_id = v_session.id;

  update public.quiz_sessions
  set answered_count = v_answered,
      correct_count = v_correct
  where id = v_session.id;

  if v_answered >= coalesce(array_length(v_session.question_ids, 1), 10) then
    perform public.quiz_finalize(v_session.id, true);
    v_finished := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'is_correct', v_is_correct,
    'correct_option', v_question.correct_option,
    'explanation', v_question.explanation,
    'finished', v_finished,
    'session', public.quiz_session_json(v_session.id),
    'profile', public.quiz_profile_json(v_user.id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Akhiri sesi lebih awal
-- ---------------------------------------------------------------------------
create or replace function public.app_quiz_finish(p_token text, p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_session public.quiz_sessions%rowtype;
begin
  v_user := public.require_user(p_token);

  if v_user.role = 'admin' then
    raise exception 'Kuis hanya tersedia untuk peserta magang.';
  end if;

  select * into v_session
  from public.quiz_sessions
  where id = p_session_id
    and user_id = v_user.id;

  if v_session.id is null then
    raise exception 'Sesi kuis tidak ditemukan.';
  end if;

  perform public.quiz_finalize(v_session.id, true);

  return jsonb_build_object(
    'ok', true,
    'session', public.quiz_session_json(v_session.id),
    'profile', public.quiz_profile_json(v_user.id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed bank 100 soal
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.quiz_questions) then
    insert into public.quiz_questions
      (category, question, option_a, option_b, option_c, option_d, correct_option, explanation, sort_order)
    values
      ('Dasar Telekomunikasi', 'Apa kepanjangan dari FTTH?', 'Fiber Transmission to Home', 'Fiber To The Home', 'Fiber Technology Home', 'Fiber Transfer to Host', 'B', 'FTTH berarti Fiber To The Home, jaringan fiber optic sampai ke rumah pelanggan.', 1),
      ('Dasar Telekomunikasi', 'Apa fungsi utama kabel fiber optic?', 'Mengalirkan arus listrik', 'Mengirimkan data menggunakan cahaya', 'Menghasilkan sinyal listrik', 'Menyimpan data jaringan', 'B', 'Fiber optic mengirim data dalam bentuk pulsa cahaya.', 2),
      ('Dasar Telekomunikasi', 'Bagian inti kabel fiber optic yang menjadi jalur utama cahaya disebut?', 'Cladding', 'Coating', 'Core', 'Jacket', 'C', 'Core adalah inti serat yang menjadi jalur utama cahaya.', 3),
      ('Dasar Telekomunikasi', 'Apa fungsi cladding pada fiber optic?', 'Melindungi kabel dari air', 'Memantulkan cahaya agar tetap berada di dalam core', 'Menghubungkan kabel ke OLT', 'Mengubah cahaya menjadi listrik', 'B', 'Cladding memantulkan cahaya agar tetap terpandu di dalam core.', 4),
      ('Dasar Telekomunikasi', 'Jenis fiber optic yang umum digunakan untuk jaringan telekomunikasi jarak jauh adalah?', 'Multimode', 'Singlemode', 'Coaxial', 'Twisted Pair', 'B', 'Singlemode memiliki inti kecil dan cocok untuk jarak jauh.', 5),
      ('Dasar Telekomunikasi', 'Satuan yang digunakan untuk mengukur redaman fiber optic adalah?', 'Volt', 'Ampere', 'dB', 'Watt', 'C', 'Redaman atau attenuation diukur dalam desibel (dB).', 6),
      ('Dasar Telekomunikasi', 'Apa arti istilah attenuation dalam jaringan fiber optic?', 'Penguatan sinyal', 'Pelemahan daya sinyal', 'Penambahan bandwidth', 'Perubahan frekuensi', 'B', 'Attenuation adalah pelemahan daya sinyal optik sepanjang jalur.', 7),
      ('Dasar Telekomunikasi', 'Perangkat yang digunakan untuk menyambungkan dua ujung serat optik secara permanen disebut?', 'Optical Power Meter', 'Fusion Splicer', 'OLT', 'Router', 'B', 'Fusion splicer menyambung serat optik dengan peleburan.', 8),
      ('Dasar Telekomunikasi', 'Apa fungsi Optical Power Meter?', 'Mengukur daya optik', 'Menyambungkan kabel fiber', 'Memotong kabel', 'Membagi jaringan internet', 'A', 'OPM digunakan untuk mengukur tingkat daya optik.', 9),
      ('Dasar Telekomunikasi', 'Alat yang digunakan untuk mengetahui lokasi gangguan atau putusnya kabel fiber optic adalah?', 'Multimeter', 'OTDR', 'Tang crimping', 'LAN Tester', 'B', 'OTDR dapat memperkirakan lokasi dan jarak gangguan.', 10),
      ('FTTH dan Arsitektur', 'Apa tujuan utama penerapan FTTH?', 'Menyalurkan jaringan fiber optic hingga rumah pelanggan', 'Menghubungkan jaringan listrik', 'Menggantikan seluruh perangkat komputer', 'Menghubungkan jaringan radio', 'A', 'FTTH menghantarkan layanan fiber sampai ke rumah pelanggan.', 11),
      ('FTTH dan Arsitektur', 'Apa kepanjangan dari ODP?', 'Optical Distribution Point', 'Optical Data Provider', 'Output Distribution Panel', 'Optical Digital Port', 'A', 'ODP adalah Optical Distribution Point.', 12),
      ('FTTH dan Arsitektur', 'Apa fungsi ODP dalam jaringan FTTH?', 'Menghasilkan daya listrik', 'Mendistribusikan koneksi fiber ke pelanggan', 'Menyimpan data pelanggan', 'Mengubah sinyal Wi-Fi', 'B', 'ODP menjadi titik distribusi fiber menuju pelanggan.', 13),
      ('FTTH dan Arsitektur', 'Perangkat di sisi pelanggan yang mengubah sinyal optik menjadi sinyal yang dapat digunakan perangkat jaringan adalah?', 'ODC', 'OLT', 'ONT', 'ODF', 'C', 'ONT mengubah sinyal optik menjadi sinyal untuk perangkat pelanggan.', 14),
      ('FTTH dan Arsitektur', 'Apa kepanjangan dari ODC?', 'Optical Distribution Cabinet', 'Optical Digital Connection', 'Output Distribution Cable', 'Optical Data Center', 'A', 'ODC adalah Optical Distribution Cabinet.', 15),
      ('FTTH dan Arsitektur', 'Apa fungsi utama ODC?', 'Mengatur tagihan pelanggan', 'Menjadi titik distribusi dan terminasi kabel fiber optic', 'Mengubah tegangan listrik', 'Mengukur kecepatan Wi-Fi', 'B', 'ODC menjadi titik distribusi dan terminasi kabel fiber.', 16),
      ('FTTH dan Arsitektur', 'Perangkat utama di sisi sentral untuk mengelola jaringan GPON adalah?', 'ONT', 'ODP', 'OLT', 'Modem pelanggan', 'C', 'OLT menjadi perangkat pusat pengelola jaringan GPON.', 17),
      ('FTTH dan Arsitektur', 'Apa kepanjangan dari ONT?', 'Optical Network Terminal', 'Optical Network Transmission', 'Output Network Terminal', 'Optical Node Technology', 'A', 'ONT adalah Optical Network Terminal.', 18),
      ('FTTH dan Arsitektur', 'Urutan umum jalur jaringan FTTH dari sentral menuju pelanggan adalah?', 'ODP - OLT - ODC - ONT', 'OLT - ODC - ODP - ONT', 'ONT - ODP - ODC - OLT', 'ODC - ONT - OLT - ODP', 'B', 'Urutan distribusi umum adalah OLT, ODC, ODP, lalu ONT.', 19),
      ('FTTH dan Arsitektur', 'Apa fungsi splitter pada jaringan FTTH?', 'Menguatkan arus listrik', 'Membagi satu sinyal optik menjadi beberapa jalur', 'Mengubah fiber menjadi kabel tembaga', 'Memutus koneksi pelanggan', 'B', 'Splitter membagi sinyal optik ke beberapa jalur.', 20),
      ('OSP', 'Apa kepanjangan dari OSP?', 'Optical Service Provider', 'Outside Plant', 'Optical System Protocol', 'Outside Signal Processing', 'B', 'OSP adalah Outside Plant.', 21),
      ('OSP', 'OSP merupakan bagian jaringan yang umumnya mencakup?', 'Infrastruktur jaringan di luar gedung atau sentral', 'Aplikasi komputer', 'Sistem pembayaran pelanggan', 'Perangkat lunak administrasi', 'A', 'OSP mencakup infrastruktur jaringan di luar gedung.', 22),
      ('OSP', 'Apa fungsi kabel backbone?', 'Menghubungkan jaringan utama dengan kapasitas besar', 'Menghubungkan komputer ke printer', 'Menggantikan perangkat ONT', 'Menyediakan sumber listrik', 'A', 'Backbone menghubungkan jaringan utama berkapasitas besar.', 23),
      ('OSP', 'Apa yang dimaksud dengan kabel access?', 'Kabel khusus untuk listrik', 'Kabel yang menghubungkan jaringan distribusi menuju area atau pelanggan', 'Kabel untuk CCTV saja', 'Kabel penghubung server internal', 'B', 'Kabel access menghubungkan distribusi ke area pelanggan.', 24),
      ('OSP', 'Apa fungsi closure pada jaringan fiber optic?', 'Melindungi sambungan kabel fiber optic', 'Mengukur redaman', 'Menghasilkan sinyal internet', 'Membagi bandwidth', 'A', 'Closure melindungi titik sambungan fiber dari gangguan lingkungan.', 25),
      ('OSP', 'Apa yang dimaksud dengan titik putus kabel?', 'Lokasi kabel mengalami kerusakan atau terputus', 'Lokasi pelanggan melakukan pembayaran', 'Lokasi pemasangan router', 'Lokasi penguatan sinyal', 'A', 'Titik putus adalah lokasi kabel rusak atau terputus.', 26),
      ('OSP', 'Apa fungsi manhole pada infrastruktur jaringan bawah tanah?', 'Tempat akses untuk pemeriksaan dan pemeliharaan utilitas bawah tanah', 'Tempat penyimpanan ONT pelanggan', 'Tempat pengukuran daya listrik rumah', 'Tempat pemasangan antena', 'A', 'Manhole menjadi akses pemeriksaan dan pemeliharaan.', 27),
      ('OSP', 'Apa yang dimaksud dengan jalur kabel aerial?', 'Jalur kabel yang ditanam di tanah', 'Jalur kabel yang dipasang di udara menggunakan tiang atau penyangga', 'Jalur kabel di dalam air', 'Jalur kabel di dalam gedung saja', 'B', 'Kabel aerial dipasang di udara dengan tiang atau penyangga.', 28),
      ('OSP', 'Mengapa kabel fiber optic harus memiliki pelindung yang sesuai?', 'Agar sinyal berubah menjadi listrik', 'Agar kabel terlindungi dari kerusakan fisik dan lingkungan', 'Agar bandwidth berkurang', 'Agar kabel menjadi penghantar listrik', 'B', 'Pelindung menjaga kabel dari kerusakan fisik dan lingkungan.', 29),
      ('OSP', 'Apa tujuan patroli jaringan OSP?', 'Mencari pelanggan baru saja', 'Memeriksa kondisi infrastruktur dan menemukan potensi gangguan', 'Mengganti seluruh perangkat jaringan', 'Memeriksa tagihan pelanggan', 'B', 'Patroli menemukan potensi gangguan sebelum berdampak.', 30),
      ('ISP dan Perangkat', 'Apa kepanjangan dari ISP dalam konteks pembagian pekerjaan jaringan Telkom Akses?', 'Inside Plant', 'Internet Signal Provider', 'Internal Service Protocol', 'Integrated System Provider', 'A', 'Dalam konteks ini ISP merujuk pada Inside Plant.', 31),
      ('ISP dan Perangkat', 'Apa kepanjangan dari GPON?', 'Gigabit Passive Optical Network', 'General Passive Optical Node', 'Global Provider Optical Network', 'Gigabit Processing Optical Node', 'A', 'GPON adalah Gigabit Passive Optical Network.', 32),
      ('ISP dan Perangkat', 'Apa fungsi utama GPON?', 'Menyalurkan layanan komunikasi melalui jaringan fiber optic pasif', 'Mengatur pembayaran pelanggan', 'Menghasilkan daya listrik', 'Mengubah kabel fiber menjadi kabel listrik', 'A', 'GPON menyalurkan layanan melalui jaringan optik pasif.', 33),
      ('ISP dan Perangkat', 'Apa kepanjangan dari DWDM?', 'Digital Wave Distribution Management', 'Dense Wavelength Division Multiplexing', 'Data Wireless Division Management', 'Digital Wavelength Data Module', 'B', 'DWDM adalah Dense Wavelength Division Multiplexing.', 34),
      ('ISP dan Perangkat', 'Apa fungsi teknologi DWDM?', 'Mengirimkan banyak kanal optik dengan panjang gelombang berbeda melalui satu serat optik', 'Mengubah sinyal optik menjadi sinyal Wi-Fi', 'Mengurangi jumlah pelanggan', 'Menggantikan fungsi kabel backbone', 'A', 'DWDM memultipleks banyak panjang gelombang dalam satu serat.', 35),
      ('ISP dan Perangkat', 'Apa kepanjangan dari OTN?', 'Optical Transport Network', 'Optical Transmission Node', 'Output Technology Network', 'Optical Terminal Number', 'A', 'OTN adalah Optical Transport Network.', 36),
      ('ISP dan Perangkat', 'Apa fungsi utama OTN?', 'Mengelola transportasi data dalam jaringan optik', 'Mengukur suhu perangkat', 'Menyambungkan kabel rumah pelanggan', 'Membagi koneksi Wi-Fi', 'A', 'OTN mengelola transportasi data pada jaringan optik.', 37),
      ('ISP dan Perangkat', 'Apa fungsi Metro Ethernet dalam jaringan telekomunikasi?', 'Menyediakan konektivitas Ethernet antar lokasi dalam wilayah metropolitan', 'Mengukur redaman kabel', 'Mengubah sinyal cahaya menjadi listrik', 'Menyimpan data pelanggan', 'A', 'Metro Ethernet menghubungkan lokasi dalam area metropolitan.', 38),
      ('ISP dan Perangkat', 'Apa fungsi OLT dalam sistem GPON?', 'Menjadi perangkat pusat untuk mengelola dan menghubungkan jaringan optik pelanggan', 'Menjadi perangkat pengukur redaman', 'Menjadi pelindung sambungan kabel', 'Menjadi perangkat pembagi listrik', 'A', 'OLT menjadi pusat pengelolaan jaringan optik pelanggan.', 39),
      ('ISP dan Perangkat', 'Apa yang dimaksud dengan mini OLT?', 'Perangkat OLT berukuran atau berkapasitas lebih kecil untuk kebutuhan akses tertentu', 'Alat pemotong kabel', 'Alat pengukur daya listrik', 'Perangkat untuk memperkuat sinyal Wi-Fi saja', 'A', 'Mini OLT adalah OLT berkapasitas lebih kecil untuk kebutuhan tertentu.', 40),
      ('Komponen Jaringan', 'Apa fungsi patch cord fiber optic?', 'Menghubungkan perangkat atau port optik menggunakan kabel fiber dengan konektor', 'Mengukur tegangan listrik', 'Menyambungkan kabel tembaga', 'Menghasilkan sinyal internet', 'A', 'Patch cord menghubungkan perangkat atau port optik.', 41),
      ('Komponen Jaringan', 'Apa fungsi pigtail fiber optic?', 'Kabel fiber dengan konektor pada salah satu ujungnya untuk terminasi atau penyambungan', 'Kabel listrik rumah', 'Perangkat pembagi jaringan', 'Perangkat penguat sinyal', 'A', 'Pigtail memiliki konektor di satu ujung untuk terminasi.', 42),
      ('Komponen Jaringan', 'Apa fungsi ODF?', 'Mengelola dan menata terminasi serta koneksi kabel fiber optic', 'Mengatur suhu ruangan', 'Menyimpan baterai', 'Mengukur kecepatan internet pelanggan', 'A', 'ODF mengelola terminasi dan koneksi fiber secara rapi.', 43),
      ('Komponen Jaringan', 'Apa fungsi konektor SC pada jaringan fiber optic?', 'Menghubungkan kabel fiber optic ke port perangkat atau adaptor', 'Menghubungkan kabel listrik', 'Mengubah sinyal digital menjadi analog', 'Membagi tegangan listrik', 'A', 'Konektor SC menghubungkan fiber ke port atau adaptor.', 44),
      ('Komponen Jaringan', 'Apa fungsi adaptor fiber optic?', 'Menghubungkan dua konektor fiber optic agar sejajar secara optik', 'Mengubah arus AC menjadi DC', 'Mengukur panjang kabel', 'Memperkuat sinyal listrik', 'A', 'Adaptor menyejajarkan dua konektor agar tersambung optik.', 45),
      ('Komponen Jaringan', 'Apa yang dimaksud dengan bending pada kabel fiber optic?', 'Pembengkokan kabel yang dapat menyebabkan peningkatan redaman', 'Penyambungan dua kabel', 'Pemotongan kabel', 'Pengukuran daya optik', 'A', 'Bending atau tekukan berlebih dapat menambah redaman.', 46),
      ('Komponen Jaringan', 'Mengapa radius tekukan kabel fiber optic harus diperhatikan?', 'Agar kabel tidak mengalami kerusakan dan redaman berlebih', 'Agar kabel menjadi lebih panjang', 'Agar konektor berubah warna', 'Agar sinyal listrik meningkat', 'A', 'Radius tekukan yang aman mencegah kerusakan dan redaman.', 47),
      ('Komponen Jaringan', 'Apa fungsi ONT di rumah pelanggan?', 'Menghubungkan layanan jaringan fiber optic dengan perangkat pelanggan', 'Menyediakan listrik untuk OLT', 'Mengukur panjang kabel backbone', 'Menghubungkan dua STO', 'A', 'ONT menghubungkan layanan fiber ke perangkat pelanggan.', 48),
      ('Komponen Jaringan', 'Lampu indikator LOS pada ONT umumnya menunjukkan?', 'Kondisi kehilangan sinyal optik', 'Koneksi internet normal', 'Perangkat sedang mengisi baterai', 'Wi-Fi sedang aktif', 'A', 'LOS berarti Loss of Signal atau kehilangan sinyal optik.', 49),
      ('Komponen Jaringan', 'Jika indikator PON pada ONT menyala normal, hal tersebut umumnya menunjukkan?', 'Perangkat terhubung dan terdaftar pada jaringan GPON', 'Kabel listrik terputus', 'Perangkat mengalami kerusakan total', 'Pelanggan belum memiliki nomor internet', 'A', 'Indikator PON normal menandakan ONT terdaftar di jaringan GPON.', 50),
      ('Maintenance', 'Apa yang dimaksud dengan Preventive Maintenance?', 'Pemeliharaan untuk mencegah terjadinya gangguan', 'Perbaikan setelah pelanggan berhenti berlangganan', 'Penggantian seluruh perangkat', 'Pemasangan jaringan baru', 'A', 'Preventive maintenance mencegah gangguan sebelum terjadi.', 51),
      ('Maintenance', 'Apa yang dimaksud dengan Corrective Maintenance?', 'Pemeliharaan untuk memperbaiki kerusakan atau gangguan yang telah terjadi', 'Pemeriksaan administrasi pelanggan', 'Pembangunan jaringan baru', 'Pengukuran rutin tanpa tindak lanjut', 'A', 'Corrective maintenance memperbaiki gangguan yang sudah terjadi.', 52),
      ('Maintenance', 'Apa tujuan utama Quality Improvement?', 'Meningkatkan kualitas dan keandalan jaringan', 'Mengurangi jumlah teknisi', 'Menghapus data gangguan', 'Mengurangi kapasitas jaringan', 'A', 'Quality improvement meningkatkan kualitas dan keandalan.', 53),
      ('Maintenance', 'Apa tujuan Expand Capacity dalam pengelolaan jaringan?', 'Meningkatkan kapasitas jaringan untuk memenuhi kebutuhan layanan', 'Mengurangi jumlah perangkat', 'Memutus jalur pelanggan', 'Menghilangkan jaringan backbone', 'A', 'Expand capacity menambah kapasitas sesuai kebutuhan layanan.', 54),
      ('Maintenance', 'Apa yang dimaksud dengan gangguan berulang?', 'Gangguan yang terjadi kembali pada lokasi atau jaringan yang sama', 'Gangguan yang hanya terjadi satu kali', 'Gangguan yang tidak membutuhkan penanganan', 'Gangguan yang sudah dinyatakan selesai', 'A', 'Gangguan berulang muncul lagi pada lokasi atau jaringan yang sama.', 55),
      ('Maintenance', 'Mengapa data gangguan berulang perlu dianalisis?', 'Untuk menemukan akar masalah dan mencegah gangguan yang sama terjadi kembali', 'Untuk menghapus nomor tiket', 'Untuk mengurangi laporan teknisi', 'Untuk mengganti seluruh jaringan', 'A', 'Analisis gangguan berulang membantu menemukan akar masalah.', 56),
      ('Maintenance', 'Apa yang dimaksud dengan root cause analysis?', 'Analisis untuk menemukan penyebab utama suatu masalah', 'Proses pemasangan kabel', 'Proses penghapusan tiket', 'Proses pengukuran bandwidth', 'A', 'Root cause analysis mencari penyebab utama masalah.', 57),
      ('Maintenance', 'Apa tujuan pengukuran berkala pada jaringan fiber optic?', 'Memantau kondisi dan kualitas jaringan', 'Mengubah nomor pelanggan', 'Mengurangi jumlah ODP', 'Menghapus gangguan secara otomatis', 'A', 'Pengukuran berkala memantau kondisi dan kualitas jaringan.', 58),
      ('Maintenance', 'Mengapa patroli kabel perlu dilakukan secara rutin?', 'Untuk menemukan potensi kerusakan sebelum menimbulkan gangguan', 'Untuk mengubah jalur internet pelanggan', 'Untuk mengganti seluruh kabel', 'Untuk mengurangi jumlah pelanggan', 'A', 'Patroli rutin menemukan potensi kerusakan lebih awal.', 59),
      ('Maintenance', 'Apa tindakan yang tepat ketika ditemukan kabel fiber optic mengalami kerusakan?', 'Membiarkannya sampai pelanggan melapor', 'Melakukan identifikasi, dokumentasi, dan tindak lanjut perbaikan sesuai prosedur', 'Memotong kabel tanpa pemeriksaan', 'Menghapus data lokasi gangguan', 'B', 'Kerusakan harus diidentifikasi, didokumentasikan, dan ditindaklanjuti.', 60),
      ('Assurance dan Fulfillment', 'Apa yang dimaksud dengan Assurance dalam layanan telekomunikasi?', 'Kegiatan menjaga dan memulihkan kualitas layanan pelanggan', 'Kegiatan pemasaran produk', 'Kegiatan penagihan pelanggan', 'Kegiatan pengadaan kendaraan', 'A', 'Assurance menjaga dan memulihkan kualitas layanan.', 61),
      ('Assurance dan Fulfillment', 'Apa yang dimaksud dengan Fulfillment?', 'Proses pemenuhan permintaan layanan pelanggan', 'Proses perbaikan kabel putus saja', 'Proses pemutusan jaringan', 'Proses penghapusan data pelanggan', 'A', 'Fulfillment memenuhi permintaan layanan pelanggan.', 62),
      ('Assurance dan Fulfillment', 'Contoh pekerjaan Fulfillment adalah?', 'Instalasi baru pelanggan', 'Perbaikan kabel backbone putus', 'Patroli jaringan rutin', 'Pemeriksaan closure rusak', 'A', 'Instalasi baru pelanggan termasuk pekerjaan fulfillment.', 63),
      ('Assurance dan Fulfillment', 'Contoh pekerjaan Assurance adalah?', 'Aktivasi pelanggan baru', 'Penanganan gangguan internet pelanggan', 'Pemasangan ODP baru untuk ekspansi', 'Penjualan perangkat pelanggan', 'B', 'Penanganan gangguan termasuk assurance.', 64),
      ('Assurance dan Fulfillment', 'Apa fungsi tiket gangguan?', 'Mencatat, mengidentifikasi, dan memantau proses penanganan gangguan', 'Mengatur gaji teknisi', 'Menyimpan konfigurasi Wi-Fi', 'Mengukur daya optik', 'A', 'Tiket gangguan mencatat dan memantau penanganan.', 65),
      ('Assurance dan Fulfillment', 'Mengapa nomor tiket harus dicatat dengan benar?', 'Agar proses penanganan dan pelacakan gangguan dapat dilakukan dengan tepat', 'Agar pelanggan mendapat nomor baru', 'Agar jaringan lebih cepat', 'Agar perangkat tidak mengalami gangguan', 'A', 'Nomor tiket yang benar memudahkan pelacakan penanganan.', 66),
      ('Assurance dan Fulfillment', 'Apa yang dimaksud dengan SLA?', 'Service Level Agreement', 'System Location Access', 'Signal Level Application', 'Service Line Administration', 'A', 'SLA adalah Service Level Agreement.', 67),
      ('Assurance dan Fulfillment', 'Dalam penanganan gangguan, SLA digunakan untuk?', 'Menentukan standar atau target tingkat layanan dan waktu penanganan', 'Menentukan warna kabel', 'Mengukur panjang kabel', 'Menentukan jumlah tiang', 'A', 'SLA menetapkan standar layanan dan target waktu penanganan.', 68),
      ('Assurance dan Fulfillment', 'Apa yang sebaiknya dilakukan teknisi setelah gangguan selesai diperbaiki?', 'Memastikan layanan kembali normal dan memperbarui status pekerjaan', 'Langsung meninggalkan lokasi tanpa pengujian', 'Menghapus nomor tiket', 'Mematikan perangkat pelanggan', 'A', 'Teknisi wajib memastikan layanan normal dan memperbarui status.', 69),
      ('Assurance dan Fulfillment', 'Mengapa dokumentasi pekerjaan lapangan penting?', 'Sebagai bukti pekerjaan dan referensi pemeliharaan berikutnya', 'Agar pekerjaan menjadi lebih lama', 'Untuk mengurangi komunikasi tim', 'Untuk menggantikan pengukuran jaringan', 'A', 'Dokumentasi menjadi bukti dan referensi pemeliharaan.', 70),
      ('Pengukuran dan Troubleshooting', 'Apa satuan daya optik yang umum digunakan pada Optical Power Meter?', 'dBm', 'Volt', 'Ampere', 'Meter', 'A', 'Daya optik umumnya dinyatakan dalam dBm.', 71),
      ('Pengukuran dan Troubleshooting', 'Apa perbedaan dB dan dBm?', 'dB menyatakan perbandingan daya, sedangkan dBm menyatakan daya relatif terhadap 1 mW', 'Keduanya merupakan satuan panjang', 'dB mengukur tegangan, sedangkan dBm mengukur arus', 'Keduanya merupakan satuan suhu', 'A', 'dB adalah perbandingan daya, dBm adalah daya terhadap 1 mW.', 72),
      ('Pengukuran dan Troubleshooting', 'Jika daya optik yang diterima semakin kecil, nilai dBm akan?', 'Semakin besar dan positif', 'Semakin kecil atau lebih negatif', 'Selalu tetap', 'Menjadi satuan meter', 'B', 'Daya optik kecil ditunjukkan dengan nilai dBm yang lebih negatif.', 73),
      ('Pengukuran dan Troubleshooting', 'Apa fungsi OTDR dalam pemeriksaan kabel fiber optic?', 'Menganalisis karakteristik kabel dan memperkirakan lokasi serta jarak kejadian gangguan', 'Mengukur tegangan listrik', 'Mengukur kecepatan Wi-Fi', 'Mengatur konfigurasi router', 'A', 'OTDR menganalisis kabel dan memperkirakan lokasi gangguan.', 74),
      ('Pengukuran dan Troubleshooting', 'Apa penyebab umum tingginya redaman pada jaringan fiber optic?', 'Sambungan buruk, konektor kotor, tekukan berlebih, atau kabel rusak', 'Tegangan listrik terlalu stabil', 'Jumlah pelanggan sedikit', 'Router dalam keadaan menyala', 'A', 'Redaman tinggi dapat berasal dari sambungan, konektor, tekukan, atau kabel rusak.', 75),
      ('Pengukuran dan Troubleshooting', 'Jika konektor fiber optic kotor, tindakan yang tepat adalah?', 'Membersihkannya menggunakan alat dan prosedur pembersihan yang sesuai', 'Menyentuh ujung konektor dengan tangan', 'Mencucinya menggunakan air', 'Memotong konektor secara langsung', 'A', 'Konektor dibersihkan dengan alat dan prosedur yang benar.', 76),
      ('Pengukuran dan Troubleshooting', 'Apa yang dimaksud dengan loss pada sambungan fiber optic?', 'Kehilangan atau penurunan daya optik', 'Penambahan panjang kabel', 'Penambahan kapasitas OLT', 'Penguatan sinyal listrik', 'A', 'Loss adalah kehilangan daya optik pada sambungan.', 77),
      ('Pengukuran dan Troubleshooting', 'Jika hasil pengukuran redaman melebihi batas desain jaringan, langkah pertama yang tepat adalah?', 'Melakukan pemeriksaan dan identifikasi titik penyebab redaman', 'Mengganti semua ONT pelanggan', 'Menghapus hasil pengukuran', 'Membiarkan jaringan beroperasi tanpa pemeriksaan', 'A', 'Langkah pertama adalah mengidentifikasi titik penyebab redaman.', 78),
      ('Pengukuran dan Troubleshooting', 'Apa yang dimaksud dengan link budget?', 'Perhitungan total daya optik dan seluruh redaman dalam jalur transmisi', 'Perhitungan biaya operasional kendaraan', 'Perhitungan jumlah teknisi', 'Perhitungan jumlah pelanggan', 'A', 'Link budget menghitung daya optik dan total redaman jalur.', 79),
      ('Pengukuran dan Troubleshooting', 'Mengapa hasil pengukuran sebelum dan sesudah perbaikan perlu dibandingkan?', 'Untuk memastikan kualitas jaringan mengalami perbaikan', 'Untuk menghapus data sebelumnya', 'Untuk menentukan jumlah pelanggan baru', 'Untuk mengganti perangkat secara otomatis', 'A', 'Perbandingan hasil memastikan kualitas jaringan membaik.', 80),
      ('K3', 'Apa kepanjangan dari K3?', 'Keselamatan dan Kesehatan Kerja', 'Keamanan dan Kualitas Kabel', 'Keselamatan Kerja Komunikasi', 'Kualitas dan Keamanan Komputer', 'A', 'K3 adalah Keselamatan dan Kesehatan Kerja.', 81),
      ('K3', 'Apa tujuan utama penerapan K3?', 'Mencegah kecelakaan kerja dan melindungi kesehatan pekerja', 'Mempercepat pekerjaan tanpa prosedur', 'Mengurangi jumlah peralatan', 'Menghilangkan kebutuhan pengawasan', 'A', 'K3 mencegah kecelakaan dan melindungi kesehatan pekerja.', 82),
      ('K3', 'Peralatan yang digunakan untuk melindungi kepala teknisi adalah?', 'Safety Helmet', 'Safety Shoes', 'Safety Vest', 'Safety Gloves', 'A', 'Safety helmet melindungi kepala dari benturan.', 83),
      ('K3', 'Apa fungsi safety harness saat bekerja di ketinggian?', 'Melindungi pekerja dari risiko jatuh', 'Mengukur tinggi tiang', 'Mengangkat kabel fiber', 'Membersihkan konektor', 'A', 'Safety harness melindungi pekerja dari risiko jatuh.', 84),
      ('K3', 'Sebelum bekerja di atas tiang, teknisi wajib?', 'Memastikan kondisi keselamatan, menggunakan APD, dan mengikuti prosedur kerja', 'Langsung naik tanpa pemeriksaan', 'Melepas alat pelindung diri', 'Bekerja seorang diri tanpa komunikasi', 'A', 'Pekerjaan di ketinggian wajib memenuhi prosedur keselamatan.', 85),
      ('K3', 'Mengapa teknisi tidak boleh melihat langsung ujung konektor fiber optic yang sedang aktif?', 'Karena cahaya laser dapat membahayakan mata', 'Karena kabel dapat menghasilkan suara', 'Karena konektor dapat menghasilkan listrik tinggi', 'Karena konektor dapat berubah warna', 'A', 'Cahaya laser pada fiber aktif berbahaya bagi mata.', 86),
      ('K3', 'Apa yang harus dilakukan ketika kondisi cuaca tidak aman untuk pekerjaan di tiang?', 'Tetap bekerja agar pekerjaan cepat selesai', 'Menghentikan atau menunda pekerjaan sesuai prosedur keselamatan', 'Mengabaikan kondisi cuaca', 'Mengurangi penggunaan APD', 'B', 'Pekerjaan harus dihentikan atau ditunda jika cuaca tidak aman.', 87),
      ('K3', 'Apa fungsi safety shoes?', 'Melindungi kaki dari risiko cedera saat bekerja', 'Melindungi kepala', 'Melindungi mata', 'Mengukur tegangan listrik', 'A', 'Safety shoes melindungi kaki dari risiko cedera.', 88),
      ('K3', 'Apa yang dimaksud dengan APD?', 'Alat Pelindung Diri', 'Alat Pengukur Data', 'Akses Pengelolaan Digital', 'Alat Penghubung Distribusi', 'A', 'APD adalah Alat Pelindung Diri.', 89),
      ('K3', 'Mengapa teknisi harus melakukan pemeriksaan peralatan sebelum bekerja?', 'Memastikan alat dalam kondisi layak dan aman digunakan', 'Agar pekerjaan menjadi lebih rumit', 'Untuk mengurangi jumlah peralatan', 'Agar tidak perlu membuat laporan', 'A', 'Pemeriksaan memastikan alat layak dan aman digunakan.', 90),
      ('Studi Kasus', 'Pelanggan mengalami gangguan internet dan indikator LOS pada ONT menyala merah. Kemungkinan masalah yang perlu diperiksa adalah?', 'Kehilangan sinyal optik', 'Wi-Fi terlalu cepat', 'Komputer pelanggan rusak', 'Password Wi-Fi salah', 'A', 'LOS merah menandakan kehilangan sinyal optik.', 91),
      ('Studi Kasus', 'Dalam patroli ditemukan kabel udara kendur dan berpotensi tertarik kendaraan. Tindakan yang tepat adalah?', 'Mengabaikan kondisi tersebut', 'Mendokumentasikan, melaporkan, dan melakukan tindak lanjut pengamanan sesuai prosedur', 'Memutus kabel', 'Menunggu sampai kabel putus', 'B', 'Temuan patroli harus didokumentasikan dan ditindaklanjuti.', 92),
      ('Studi Kasus', 'Sebuah lokasi mengalami gangguan berulang meskipun sudah beberapa kali diperbaiki. Apa tindakan terbaik?', 'Melakukan analisis akar masalah secara menyeluruh', 'Menutup semua tiket tanpa pemeriksaan', 'Mengganti semua ONT pelanggan', 'Mengabaikan laporan sebelumnya', 'A', 'Gangguan berulang memerlukan analisis akar masalah menyeluruh.', 93),
      ('Studi Kasus', 'Hasil pengukuran menunjukkan redaman pada salah satu jalur ODP tidak normal. Langkah yang tepat adalah?', 'Memeriksa jalur distribusi, konektor, sambungan, dan splitter', 'Mengganti seluruh perangkat sentral', 'Memutus semua pelanggan', 'Menghapus data pengukuran', 'A', 'Periksa komponen jalur distribusi yang berpotensi menambah redaman.', 94),
      ('Studi Kasus', 'Jika tim lapangan terkendala hujan deras saat melakukan perbaikan jaringan, tindakan yang tepat adalah?', 'Memaksakan pekerjaan di segala kondisi', 'Mengutamakan keselamatan, menghentikan pekerjaan jika tidak aman, dan melaporkan kendala', 'Mengabaikan arahan pengawas', 'Melanjutkan pekerjaan tanpa APD', 'B', 'Keselamatan diutamakan saat cuaca tidak aman.', 95),
      ('Studi Kasus', 'Dalam laporan harian, status N/A umumnya digunakan untuk menunjukkan?', 'Data tidak tersedia atau tidak berlaku pada kondisi tersebut', 'Pekerjaan sudah selesai', 'Pekerjaan sedang berlangsung', 'Gangguan telah diperbaiki', 'A', 'N/A berarti data tidak tersedia atau tidak berlaku.', 96),
      ('Studi Kasus', 'Jika ditemukan perbedaan antara kondisi aktual lapangan dan data jaringan, teknisi sebaiknya?', 'Memperbarui dan melaporkan hasil verifikasi sesuai prosedur', 'Mengabaikan perbedaan tersebut', 'Menghapus seluruh data jaringan', 'Menggunakan data lama tanpa pemeriksaan', 'A', 'Perbedaan data harus diverifikasi dan diperbarui sesuai prosedur.', 97),
      ('Studi Kasus', 'Dalam pengelolaan pekerjaan tim, mengapa update progres perlu dilakukan secara berkala?', 'Agar perkembangan pekerjaan, kendala, dan tindak lanjut dapat dipantau', 'Agar jumlah tiket bertambah', 'Agar pekerjaan tidak perlu diperiksa', 'Agar teknisi tidak perlu berkoordinasi', 'A', 'Update progres memudahkan pemantauan pekerjaan dan kendala.', 98),
      ('Studi Kasus', 'Jika ditemukan potensi gangguan pada jalur backbone yang dapat berdampak pada banyak pelanggan, tindakan yang paling tepat adalah?', 'Segera melakukan eskalasi dan koordinasi penanganan sesuai prosedur', 'Menunggu sampai semua pelanggan melapor', 'Mengabaikan gangguan karena belum terjadi putus total', 'Menutup laporan patroli', 'A', 'Potensi gangguan backbone harus segera dieskalasi.', 99),
      ('Studi Kasus', 'Apa tujuan utama koordinasi antara tim OSP, ISP, Assurance, dan Fulfillment?', 'Memisahkan seluruh informasi pekerjaan', 'Memastikan penanganan, pemeliharaan, dan pemenuhan layanan berjalan terintegrasi', 'Mengurangi komunikasi antartim', 'Menghindari dokumentasi pekerjaan', 'B', 'Koordinasi memastikan layanan berjalan terintegrasi.', 100);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Keamanan
-- ---------------------------------------------------------------------------
alter table public.quiz_questions enable row level security;
alter table public.quiz_profiles enable row level security;
alter table public.quiz_sessions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.quiz_seen enable row level security;

revoke all on public.quiz_questions from anon, authenticated;
revoke all on public.quiz_profiles from anon, authenticated;
revoke all on public.quiz_sessions from anon, authenticated;
revoke all on public.quiz_answers from anon, authenticated;
revoke all on public.quiz_seen from anon, authenticated;

revoke execute on function public.quiz_ensure_user(uuid) from public, anon, authenticated;
revoke execute on function public.quiz_profile_json(uuid) from public, anon, authenticated;
revoke execute on function public.quiz_session_json(uuid) from public, anon, authenticated;
revoke execute on function public.quiz_finalize(uuid, boolean) from public, anon, authenticated;

grant execute on function public.app_quiz_state(text) to anon, authenticated;
grant execute on function public.app_quiz_start(text) to anon, authenticated;
grant execute on function public.app_quiz_answer(text, uuid, int, text) to anon, authenticated;
grant execute on function public.app_quiz_finish(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
