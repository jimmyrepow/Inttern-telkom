-- Kotak saran: peserta dapat mengirim masukan dan admin dapat menindaklanjuti.
-- Akses data hanya lewat RPC agar token sesi aplikasi tetap menjadi sumber autentikasi.

create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  name text not null default '',
  username text not null default '',
  category text not null default 'umum',
  message text not null,
  status text not null default 'baru',
  admin_reply text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.suggestions drop constraint if exists suggestions_name_len;
alter table public.suggestions add constraint suggestions_name_len
  check (char_length(name) <= 100);

alter table public.suggestions drop constraint if exists suggestions_username_len;
alter table public.suggestions add constraint suggestions_username_len
  check (char_length(username) <= 40);

alter table public.suggestions drop constraint if exists suggestions_category_check;
alter table public.suggestions add constraint suggestions_category_check
  check (category in ('umum', 'absensi', 'tampilan', 'fitur', 'bug', 'lainnya'));

alter table public.suggestions drop constraint if exists suggestions_message_len;
alter table public.suggestions add constraint suggestions_message_len
  check (char_length(message) between 5 and 1500);

alter table public.suggestions drop constraint if exists suggestions_status_check;
alter table public.suggestions add constraint suggestions_status_check
  check (status in ('baru', 'dibaca', 'diproses', 'selesai'));

alter table public.suggestions drop constraint if exists suggestions_reply_len;
alter table public.suggestions add constraint suggestions_reply_len
  check (char_length(admin_reply) <= 2000);

create index if not exists suggestions_status_created_idx
  on public.suggestions (status, created_at desc);

create index if not exists suggestions_user_created_idx
  on public.suggestions (user_id, created_at desc);

drop trigger if exists suggestions_touch on public.suggestions;
create trigger suggestions_touch before update on public.suggestions
for each row execute function public.touch_updated_at();

alter table public.suggestions enable row level security;

drop policy if exists suggestions_select_own_or_admin on public.suggestions;
revoke all on public.suggestions from anon, authenticated;

create or replace function public.app_submit_suggestion(
  p_token text,
  p_category text default 'umum',
  p_message text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_category text := lower(trim(coalesce(p_category, 'umum')));
  v_message text := trim(coalesce(p_message, ''));
  v_row public.suggestions%rowtype;
begin
  v_user := public.require_user(p_token);

  if v_category not in ('umum', 'absensi', 'tampilan', 'fitur', 'bug', 'lainnya') then
    raise exception 'Kategori saran tidak valid.';
  end if;
  if char_length(v_message) < 5 then
    raise exception 'Saran minimal 5 karakter.';
  end if;
  if char_length(v_message) > 1500 then
    raise exception 'Saran maksimal 1500 karakter.';
  end if;

  insert into public.suggestions (user_id, name, username, category, message)
  values (v_user.id, v_user.name, v_user.username, v_category, v_message)
  returning * into v_row;

  perform public.log_action(
    v_user.username,
    'submit-suggestion',
    v_row.id::text || ' | ' || v_category
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Saran berhasil dikirim. Terima kasih sudah membantu kami.',
    'suggestion', to_jsonb(v_row)
  );
end;
$$;

create or replace function public.app_my_suggestions(
  p_token text,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_items jsonb;
begin
  v_user := public.require_user(p_token);

  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb)
  into v_items
  from (
    select id, category, message, status, admin_reply, created_at, updated_at, resolved_at
    from public.suggestions
    where user_id = v_user.id
    order by created_at desc
    limit v_limit
  ) s;

  return jsonb_build_object(
    'ok', true,
    'suggestions', v_items
  );
end;
$$;

create or replace function public.admin_list_suggestions(
  p_token text,
  p_status text default '',
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
  v_status text := lower(trim(coalesce(p_status, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_items jsonb;
  v_summary jsonb;
  v_total integer;
begin
  v_admin := public.require_admin(p_token);

  if v_status <> '' and v_status not in ('baru', 'dibaca', 'diproses', 'selesai') then
    raise exception 'Status saran tidak valid.';
  end if;

  select count(*)
  into v_total
  from public.suggestions s
  where v_status = '' or s.status = v_status;

  select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb)
  into v_items
  from (
    select
      to_jsonb(s) || jsonb_build_object(
        'avatar_emoji', coalesce(u.avatar_emoji, ''),
        'avatar_color', coalesce(u.avatar_color, '#ec4899')
      ) as item,
      s.created_at
    from public.suggestions s
    left join public.users u on u.id = s.user_id
    where v_status = '' or s.status = v_status
    order by s.created_at desc
    limit v_limit
    offset v_offset
  ) t;

  select jsonb_build_object(
    'baru', count(*) filter (where status = 'baru'),
    'dibaca', count(*) filter (where status = 'dibaca'),
    'diproses', count(*) filter (where status = 'diproses'),
    'selesai', count(*) filter (where status = 'selesai'),
    'total', count(*)
  )
  into v_summary
  from public.suggestions;

  return jsonb_build_object(
    'ok', true,
    'suggestions', v_items,
    'total', v_total,
    'summary', v_summary
  );
end;
$$;

create or replace function public.admin_update_suggestion(
  p_token text,
  p_id uuid,
  p_status text default 'dibaca',
  p_reply text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_status text := lower(trim(coalesce(p_status, 'dibaca')));
  v_reply text := trim(coalesce(p_reply, ''));
  v_row public.suggestions%rowtype;
begin
  v_admin := public.require_admin(p_token);

  if v_status not in ('baru', 'dibaca', 'diproses', 'selesai') then
    raise exception 'Status saran tidak valid.';
  end if;
  if char_length(v_reply) > 2000 then
    raise exception 'Balasan admin maksimal 2000 karakter.';
  end if;

  update public.suggestions
  set status = v_status,
      admin_reply = v_reply,
      resolved_at = case when v_status = 'selesai' then coalesce(resolved_at, now()) else null end
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Saran tidak ditemukan.';
  end if;

  perform public.log_action(
    v_admin.username,
    'update-suggestion',
    v_row.id::text || ' | ' || v_status
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Saran berhasil diperbarui.',
    'suggestion', to_jsonb(v_row)
  );
end;
$$;

create or replace function public.admin_delete_suggestion(
  p_token text,
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.users%rowtype;
  v_row public.suggestions%rowtype;
begin
  v_admin := public.require_admin(p_token);

  delete from public.suggestions
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Saran tidak ditemukan.';
  end if;

  perform public.log_action(
    v_admin.username,
    'delete-suggestion',
    v_row.id::text || ' | ' || v_row.username
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Saran berhasil dihapus.'
  );
end;
$$;

revoke execute on function public.app_submit_suggestion(text, text, text) from public;
revoke execute on function public.app_my_suggestions(text, integer) from public;
revoke execute on function public.admin_list_suggestions(text, text, integer, integer) from public;
revoke execute on function public.admin_update_suggestion(text, uuid, text, text) from public;
revoke execute on function public.admin_delete_suggestion(text, uuid) from public;

grant execute on function public.app_submit_suggestion(text, text, text) to anon, authenticated;
grant execute on function public.app_my_suggestions(text, integer) to anon, authenticated;
grant execute on function public.admin_list_suggestions(text, text, integer, integer) to anon, authenticated;
grant execute on function public.admin_update_suggestion(text, uuid, text, text) to anon, authenticated;
grant execute on function public.admin_delete_suggestion(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
