-- Self-service account management: every logged-in user (intern or admin)
-- dapat memperbarui nama tampilan dan mengganti password sendiri.

create or replace function public.app_update_profile(p_token text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_name text := trim(coalesce(p_name, ''));
begin
  v_user := public.require_user(p_token);

  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'Nama harus 2-100 karakter.';
  end if;
  if v_name = v_user.name then
    raise exception 'Nama belum berubah.';
  end if;

  update public.users
  set name = v_name,
      updated_at = now()
  where id = v_user.id
  returning * into v_user;

  perform public.log_action(v_user.username, 'update-profile', v_name);

  return jsonb_build_object(
    'ok', true,
    'message', 'Nama berhasil diperbarui.',
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

create or replace function public.app_change_password(
  p_token text,
  p_current_password text,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.users%rowtype;
  v_new text := coalesce(p_new_password, '');
begin
  v_user := public.require_user(p_token);

  if coalesce(p_current_password, '') = '' then
    raise exception 'Password lama wajib diisi.';
  end if;
  if v_user.password <> extensions.crypt(p_current_password, v_user.password) then
    raise exception 'Password lama tidak sesuai.';
  end if;
  if length(v_new) < 6 then
    raise exception 'Password baru minimal 6 karakter.';
  end if;
  if octet_length(v_new) > 72 then
    raise exception 'Password baru maksimal 72 karakter.';
  end if;
  if v_new = p_current_password then
    raise exception 'Password baru harus berbeda dari password lama.';
  end if;

  update public.users
  set password = extensions.crypt(v_new, extensions.gen_salt('bf')),
      password_updated_at = now(),
      updated_at = now()
  where id = v_user.id
  returning * into v_user;

  -- Keluarkan sesi di perangkat lain, tetapi pertahankan sesi yang sedang dipakai.
  delete from public.sessions
  where user_id = v_user.id
    and token <> p_token;

  perform public.log_action(v_user.username, 'change-password', 'Password diperbarui sendiri');

  return jsonb_build_object(
    'ok', true,
    'message', 'Password berhasil diperbarui. Perangkat lain otomatis dikeluarkan.',
    'password_updated_at', v_user.password_updated_at
  );
end;
$$;

revoke execute on function public.app_update_profile(text, text) from public;
revoke execute on function public.app_change_password(text, text, text) from public;

grant execute on function public.app_update_profile(text, text) to anon, authenticated;
grant execute on function public.app_change_password(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
