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
  if nullif(trim(coalesce(p_check_in, '')), '') is not null
    and trim(p_check_in) !~ '^([01]\d|2[0-3]):[0-5]\d$' then
    raise exception 'Jam masuk harus berformat HH:MM atau dikosongkan.';
  end if;
  if nullif(trim(coalesce(p_check_out, '')), '') is not null
    and trim(p_check_out) !~ '^([01]\d|2[0-3]):[0-5]\d$' then
    raise exception 'Jam pulang harus berformat HH:MM.';
  end if;

  v_check_in := nullif(trim(coalesce(p_check_in, '')), '')::time;
  v_check_out := nullif(trim(coalesce(p_check_out, '')), '')::time;

  if v_check_in is null and v_check_out is not null then
    raise exception 'Jam pulang harus dikosongkan jika jam masuk dikosongkan.';
  end if;
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

revoke execute on function public.admin_update_attendance(text, uuid, text, text, text) from public;
grant execute on function public.admin_update_attendance(text, uuid, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
