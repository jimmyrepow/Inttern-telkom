const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { connectClient } = require("./db");

const migrationsDir = path.join(__dirname, "..", "supabase", "migrations");

function checksum(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function migrationFiles() {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.toLowerCase().endsWith(".sql"))
    .sort();
}

async function ensureTable(client) {
  await client.query(`
    create table if not exists public.schema_migrations (
      filename text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function showStatus(client) {
  await ensureTable(client);
  const files = migrationFiles();
  const { rows } = await client.query(
    "select filename, checksum, applied_at from public.schema_migrations"
  );
  const applied = new Map(rows.map((row) => [row.filename, row]));

  for (const name of files) {
    const text = fs.readFileSync(path.join(migrationsDir, name), "utf8");
    const sum = checksum(text);
    const record = applied.get(name);
    let state = "PENDING";
    if (record) state = record.checksum === sum ? "APPLIED" : "CHANGED";
    console.log(state.padEnd(8), name, record ? record.applied_at.toISOString() : "");
  }

  for (const row of rows) {
    if (!files.includes(row.filename)) {
      console.log("MISSING ".padEnd(8), row.filename, row.applied_at.toISOString());
    }
  }
}

async function applyMigrations(client) {
  await ensureTable(client);
  const files = migrationFiles();
  let appliedCount = 0;

  for (const name of files) {
    const text = fs.readFileSync(path.join(migrationsDir, name), "utf8");
    const sum = checksum(text);
    const existing = await client.query(
      "select checksum from public.schema_migrations where filename = $1",
      [name]
    );
    const record = existing.rows[0];

    if (record && record.checksum === sum) {
      console.log("SKIP    ", name);
      continue;
    }

    console.log(record ? "UPDATE  " : "APPLY   ", name);
    await client.query("begin");
    try {
      await client.query(text);
      await client.query(
        `insert into public.schema_migrations (filename, checksum, applied_at)
         values ($1, $2, now())
         on conflict (filename) do update
           set checksum = excluded.checksum, applied_at = now()`,
        [name, sum]
      );
      await client.query("commit");
      appliedCount += 1;
    } catch (error) {
      await client.query("rollback");
      throw new Error(name + " gagal: " + error.message);
    }
  }

  console.log(
    appliedCount
      ? appliedCount + " migrasi diterapkan."
      : "Semua migrasi sudah terbaru."
  );
}

async function main() {
  const args = process.argv.slice(2);
  let client;

  try {
    client = await connectClient();
    if (args.includes("--status")) {
      await showStatus(client);
    } else {
      await applyMigrations(client);
    }
  } catch (error) {
    console.error("MIGRASI GAGAL:", error.message);
    process.exitCode = 1;
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

main();
