const DB_NAME = "telkom-absensi-offline";
const DB_VERSION = 1;
const STORE = "attendance-queue";
let dbPromise = null;

export function queueSupported() {
  return typeof indexedDB !== "undefined";
}

function openDb() {
  if (!queueSupported()) return Promise.reject(new Error("Penyimpanan offline tidak didukung."));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Gagal membuka penyimpanan offline."));
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

function makeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "offline-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

export async function enqueueAttendance(payload) {
  const db = await openDb();
  const record = Object.assign({}, payload, {
    id: makeId(),
    created_at: new Date().toISOString()
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Gagal menyimpan absensi offline."));
  });
  return record;
}

export async function listAttendanceQueue() {
  if (!queueSupported()) return [];
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => {
        const rows = Array.isArray(request.result) ? request.result : [];
        resolve(rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))));
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    return [];
  }
}

export async function removeAttendanceQueue(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function countAttendanceQueue(userId) {
  const rows = await listAttendanceQueue();
  if (!userId) return rows.length;
  return rows.filter((row) => String(row.user_id) === String(userId)).length;
}

export async function flushAttendanceQueue(handler, options) {
  const opts = options || {};
  const rows = await listAttendanceQueue();
  const result = { total: rows.length, synced: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    if (opts.userId && String(row.user_id) !== String(opts.userId)) {
      result.skipped += 1;
      continue;
    }
    try {
      await handler(row);
      await removeAttendanceQueue(row.id);
      result.synced += 1;
    } catch (error) {
      result.failed += 1;
      if (typeof opts.onError === "function") opts.onError(error, row);
      break;
    }
  }
  return result;
}

export function isNetworkError(error) {
  const message = String((error && error.message) || error || "");
  return /failed to fetch|networkerror|load failed|network error|offline|timeout|timed out|tidak dapat terhubung/i.test(
    message
  );
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Gagal membaca foto."));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}
