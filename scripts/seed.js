const { connectClient } = require("./db");

function env(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

async function ensureUser(client, username, name, password, role) {
  const normalized = String(username || "").trim().toLowerCase();
  if (!normalized) return;

  const existing = await client.query(
    "select id from public.users where username = $1",
    [normalized]
  );

  if (existing.rowCount) {
    if (env("SEED_RESET_PASSWORDS", "false") === "true") {
      await client.query(
        "update public.users set name = $2, role = $3, active = true, password = extensions.crypt($4, extensions.gen_salt('bf')), password_updated_at = now() where username = $1",
        [normalized, name, role, password]
      );
      console.log("UPDATE  ", normalized, "(" + role + ", password direset)");
    } else {
      await client.query(
        "update public.users set name = $2, role = $3, active = true where username = $1",
        [normalized, name, role]
      );
      console.log("UPDATE  ", normalized, "(" + role + ")");
    }
    return;
  }

  await client.query(
    "insert into public.users (username, name, password, role, active) values ($1, $2, extensions.crypt($3, extensions.gen_salt('bf')), $4, true)",
    [normalized, name, password, role]
  );
  console.log("CREATE  ", normalized, "(" + role + ")");
}

async function main() {
  let client;

  try {
    client = await connectClient();

    await ensureUser(
      client,
      env("SEED_ADMIN_USERNAME", "dhea"),
      env("SEED_ADMIN_NAME", "Dhea"),
      env("SEED_ADMIN_PASSWORD", "dhea123"),
      "admin"
    );

    await ensureUser(
      client,
      env("SEED_INTERN_USERNAME", "jimmy"),
      env("SEED_INTERN_NAME", "Jimmy"),
      env("SEED_INTERN_PASSWORD", "jimmy123"),
      "intern"
    );

    const interns = [
      ["nayla", "Nayla Rehanna", "nayla123"],
      ["cut", "Cut Mauliza Putri", "cut123"],
      ["nadya", "Nadya Gustiyani", "nadya123"],
      ["nur", "Nur Aini Hasanah", "nur123"],
      ["gina", "Gina Azarifa Ane", "gina123"],
      ["lucy", "Lucy Renata", "lucy123"]
    ];

    for (const [username, name, password] of interns) {
      await ensureUser(client, username, name, password, "intern");
    }

    console.log("Seed selesai.");
  } catch (error) {
    console.error("SEED GAGAL:", error.message);
    process.exitCode = 1;
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

main();
