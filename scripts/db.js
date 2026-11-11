const path = require("path");
const { Client } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

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

  return {
    connectionString: process.env.DATABASE_URL,
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
