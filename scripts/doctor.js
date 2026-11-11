const { connectClient } = require("./db");

const REQUIRED_FUNCTIONS = [
  "app_login",
  "app_logout",
  "app_session",
  "app_bootstrap",
  "app_check_in",
  "app_check_out",
  "app_save_settings",
  "app_delete_attendance",
  "app_export_data",
  "admin_create_user",
  "admin_update_user",
  "admin_reset_password",
  "admin_delete_user",
  "admin_delete_user_attendance",
  "admin_account_info",
  "require_user",
  "require_admin",
  "log_action"
];

async function rpc(name, token, params) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const body = Object.assign({}, params || {});
  if (token) body.p_token = token;

  const response = await fetch(url.replace(/\/$/, "") + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      (data && (data.message || data.error_description || data.error)) ||
        text ||
        String(response.status)
    );
  }

  return data;
}

async function checkLogin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const username = process.env.CHECK_LOGIN_USERNAME;
  const password = process.env.CHECK_LOGIN_PASSWORD;

  if (!url || !key || !username || !password) return true;

  let lastMessage = "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const login = await rpc("app_login", "", {
        p_username: username,
        p_password: password
      });

      if (!login || !login.token) throw new Error("Token tidak diterima.");

      const boot = await rpc("app_bootstrap", login.token);
      console.log(
        "Login test: OK (" + login.user.username + " / " + login.user.role + ")"
      );
      console.log(
        "Bootstrap : OK (users=" +
          boot.users.length +
          ", attendance=" +
          boot.attendance.length +
          ")"
      );

      await rpc("app_logout", login.token).catch(() => {});
      return true;
    } catch (error) {
      lastMessage = error.message;
    }

    if (attempt < 3) {
      console.log("Login test: percobaan " + attempt + " gagal, mengulang...");
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }

  console.log("Login test: GAGAL (" + lastMessage + ")");
  return false;
}

async function main() {
  let client;
  let ok = true;

  try {
    client = await connectClient();

    const version = await client.query("select version() as version");
    console.log("Database :", String(version.rows[0].version).split(",")[0]);

    const tables = await client.query(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name"
    );
    console.log(
      "Tabel    :",
      tables.rows.map((row) => row.table_name).join(", ") || "(kosong)"
    );

    const users = await client.query("select count(*)::int as total from public.users");
    const sessions = await client.query("select count(*)::int as total from public.sessions");
    const attendance = await client.query(
      "select count(*)::int as total from public.attendance"
    );
    const settings = await client.query(
      "select count(*)::int as total from public.settings"
    );
    console.log(
      "Data     : users=" +
        users.rows[0].total +
        " sessions=" +
        sessions.rows[0].total +
        " attendance=" +
        attendance.rows[0].total +
        " settings=" +
        settings.rows[0].total
    );

    const columns = await client.query(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = any($1::text[])",
      [["password", "password_updated_at", "last_login_at"]]
    );
    const names = new Set(columns.rows.map((row) => row.column_name));
    const missingColumns = ["password", "password_updated_at", "last_login_at"].filter(
      (name) => !names.has(name)
    );
    if (missingColumns.length) {
      console.log("Kolom    : HILANG: " + missingColumns.join(", "));
      ok = false;
    }

    const bucket = await client.query(
      "select id, public from storage.buckets where id = 'attendance-photos'"
    );
    if (bucket.rows[0]) {
      console.log("Bucket   : attendance-photos (public=" + bucket.rows[0].public + ")");
    } else {
      console.log("Bucket   : attendance-photos TIDAK ADA");
      ok = false;
    }

    const found = await client.query(
      "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any($1::text[])",
      [REQUIRED_FUNCTIONS]
    );
    const foundNames = new Set(found.rows.map((row) => row.proname));
    const missing = REQUIRED_FUNCTIONS.filter((name) => !foundNames.has(name));
    console.log("RPC      :", missing.length ? "HILANG: " + missing.join(", ") : "lengkap");
    if (missing.length) ok = false;

    const userList = await client.query(
      "select username, role, active, last_login_at from public.users order by role, username"
    );
    for (const user of userList.rows) {
      console.log(
        "User     :",
        user.username,
        user.role,
        user.active ? "aktif" : "nonaktif",
        user.last_login_at ? user.last_login_at.toISOString() : "belum login"
      );
    }

    const migrations = await client.query(
      "select filename, applied_at from public.schema_migrations order by filename"
    );
    for (const row of migrations.rows) {
      console.log("Migrasi  :", row.filename, row.applied_at.toISOString());
    }
  } catch (error) {
    console.error("DOCTOR GAGAL:", error.message);
    ok = false;
  } finally {
    if (client) await client.end().catch(() => {});
  }

  const loginOk = await checkLogin();
  if (!loginOk) ok = false;

  console.log(ok ? "STATUS   : OK" : "STATUS   : PERIKSA LAGI");
  process.exitCode = ok ? 0 : 1;
}

main();
