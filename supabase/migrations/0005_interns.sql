insert into public.users (username, name, password, role, active)
values
  ('nayla', 'Nayla Rehanna', extensions.crypt('nayla123', extensions.gen_salt('bf')), 'intern', true),
  ('cut', 'Cut Mauliza Putri', extensions.crypt('cut123', extensions.gen_salt('bf')), 'intern', true),
  ('nadya', 'Nadya Gustiyani', extensions.crypt('nadya123', extensions.gen_salt('bf')), 'intern', true),
  ('nur', 'Nur Aini Hasanah', extensions.crypt('nur123', extensions.gen_salt('bf')), 'intern', true),
  ('gina', 'Gina Azarifa Ane', extensions.crypt('gina123', extensions.gen_salt('bf')), 'intern', true),
  ('lucy', 'Lucy Renata', extensions.crypt('lucy123', extensions.gen_salt('bf')), 'intern', true)
on conflict (username) do update
set
  name = excluded.name,
  password = excluded.password,
  role = excluded.role,
  active = excluded.active,
  password_updated_at = now(),
  updated_at = now();

insert into public.logs (actor, action, detail)
values ('system', 'seed-interns', 'Menambahkan akun peserta magang: nayla, cut, nadya, nur, gina, lucy');
