const path = require("path");
const { Client } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function encodeConnectionPart(value) {
  const encode = (input) =>
    encodeURIComponent(input).replace(/[!'()*]/g, (char) =>
      "%" + char.charCodeAt(0).toString(16).toUpperCase()
    );

  try {
    const decoded = decodeURIComponent(value);
    const normalized = encode(decoded);
    if (normalized.toLowerCase() === value.toLowerCase()) {
      return normalized;
    }
  } catch (error) {
    return encode(value);
  }

  return encode(value);
}

function normalizeConnectionString(value) {
  const connectionString = String(value || "").trim();
  const schemeMatch = connectionString.match(/^(postgres(?:ql)?):\/\//i);
  if (!schemeMatch) {
    throw new Error("DATABASE_URL harus memakai skema postgres:// atau postgresql://.");
  }

  const authorityStart = schemeMatch[0].length;
  const separatorIndex = connectionString.lastIndexOf("@");
  if (separatorIndex < authorityStart) {
    return connectionString;
  }

  const credentials = connectionString.slice(authorityStart, separatorIndex);
  const hostAndPath = connectionString.slice(separatorIndex + 1);
  const passwordSeparator = credentials.indexOf(":");
  if (passwordSeparator < 1 || !hostAndPath) {
    throw new Error(
      "DATABASE_URL tidak valid. Gunakan connection string PostgreSQL lengkap dari Supabase Dashboard."
    );
  }

  const username = credentials.slice(0, passwordSeparator);
  const password = credentials.slice(passwordSeparator + 1);

  return (
    connectionString.slice(0, authorityStart) +
    encodeConnectionPart(username) +
    ":" +
    encodeConnectionPart(password) +
    "@" +
    hostAndPath
  );
}

function connectionConfig() {
  if (process.env.PGHOST) {
    if (!process.env.PGPASSWORD) {
      throw new Error("PGPASSWORD belum diisi di .env.");
    }
    return {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20000
    };
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("PGHOST atau DATABASE_URL belum diisi di .env.");
  }

  let connectionString;
  let parsedUrl;
  try {
    connectionString = normalizeConnectionString(process.env.DATABASE_URL);
    parsedUrl = new URL(connectionString);
  } catch (error) {
    const atIndex = connectionString.lastIndexOf("@");
    const hostPart =
      atIndex >= 0
        ? connectionString.slice(atIndex + 1).split(/[/?#]/, 1)[0]
        : "";
    const directSupabaseHost = /^db\..+\.supabase\.co(?::\d+)?$/i.test(hostPart);
    throw new Error(
      directSupabaseHost
        ? "DATABASE_URL tidak valid dan masih memakai host database langsung Supabase. Gunakan connection string Session Pooler dari Supabase Dashboard; pastikan karakter khusus pada password sudah di-URL-encode."
        : "DATABASE_URL tidak valid. Gunakan connection string PostgreSQL lengkap dari Supabase Dashboard dan URL-encode karakter khusus pada username/password."
    );
  }

  if (!/^postgres(?:ql)?$/i.test(parsedUrl.protocol.slice(0, -1))) {
    throw new Error("DATABASE_URL harus memakai skema postgres:// atau postgresql://.");
  }

  return {
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000
  };
}

function createClient() {
  return new Client(connectionConfig());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectClient(attempts) {
  const total = attempts || 6;
  let lastError;

  for (let attempt = 1; attempt <= total; attempt += 1) {
    const client = createClient();
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
      if (error.code === "ENOTFOUND" || error.code === "ENETUNREACH") {
        break;
      }
      if (attempt < total) {
        const wait = attempt * 1500;
        console.log(
          "Koneksi database gagal (" +
            (error.code || error.message) +
            "). Percobaan ulang " +
            attempt +
            "/" +
            total +
            " dalam " +
            wait +
            " ms..."
        );
        await sleep(wait);
      }
    }
  }

  throw lastError;
}

module.exports = { createClient, connectClient, connectionConfig };
