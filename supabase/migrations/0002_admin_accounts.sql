alter table public.profiles add column if not exists password_updated_at timestamptz;

update public.profiles p
set password_updated_at = coalesce(u.updated_at, p.created_at, now())
from auth.users u
where u.id = p.id
  and p.password_updated_at is null;

alter table public.profiles alter column password_updated_at set default now();
alter table public.profiles alter column password_updated_at set not null;

create or replace function public.sync_password_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set password_updated_at = now()
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_password_changed on auth.users;
create trigger on_auth_password_changed
after update of encrypted_password on auth.users
for each row execute function public.sync_password_updated_at();

create or replace function public.admin_reset_password(p_id uuid, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Aksi ini hanya untuk admin.';
  end if;
  if p_id is null then
    raise exception 'ID akun wajib diisi.';
  end if;
  if coalesce(p_password, '') = '' or length(p_password) < 6 then
    raise exception 'Password minimal 6 karakter.';
  end if;

  select * into v_user from public.profiles where id = p_id;
  if v_user.id is null then
    raise exception 'Akun tidak ditemukan.';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = p_id;

  perform public.log_action('reset-password', v_user.username);

  return jsonb_build_object(
    'ok', true,
    'message', 'Password ' || v_user.username || ' berhasil direset.',
    'password_updated_at', now()
  );
end;
$$;

create or replace function public.admin_account_info()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_accounts jsonb;
begin
  if not public.is_admin() then
    raise exception 'Aksi ini hanya untuk admin.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'name', p.name,
    'role', p.role,
    'active', p.active,
    'email', u.email,
    'last_sign_in_at', u.last_sign_in_at,
    'password_updated_at', p.password_updated_at,
    'created_at', p.created_at
  ) order by (p.role = 'admin') desc, p.name), '[]'::jsonb)
  into v_accounts
  from public.profiles p
  left join auth.users u on u.id = p.id;

  return jsonb_build_object('ok', true, 'accounts', v_accounts);
end;
$$;

revoke execute on function public.sync_password_updated_at() from public, anon, authenticated;
revoke execute on function public.admin_reset_password(uuid, text) from public, anon;
revoke execute on function public.admin_account_info() from public, anon;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;
grant execute on function public.admin_account_info() to authenticated;
