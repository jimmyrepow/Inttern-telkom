import { state } from "./store.js";
import { toast } from "../lib/dom.js";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

export const configured =
  typeof window.supabase !== "undefined" &&
  /^https?:\/\//.test(SUPABASE_URL) &&
  SUPABASE_URL.indexOf("YOUR-PROJECT") === -1 &&
  SUPABASE_KEY.length > 20 &&
  SUPABASE_KEY.indexOf("YOUR-ANON") === -1;

export const sb = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

let sessionExpiredHandler = null;

export function setSessionExpiredHandler(handler) {
  sessionExpiredHandler = typeof handler === "function" ? handler : null;
}

export async function rpc(name, params) {
  if (!sb) throw new Error("Supabase belum dikonfigurasi.");
  const payload = Object.assign({}, params || {});
  if (state.token && name !== "app_login") payload.p_token = state.token;
  const { data, error } = await sb.rpc(name, payload);
  if (error) {
    throw Object.assign(new Error(error.message || "Permintaan gagal."), {
      code: error.code || ""
    });
  }
  return data;
}

export function isSessionExpired(message) {
  return /sesi|login ulang|jwt|token|not authenticated/i.test(String(message || ""));
}

export function authErrorMessage(error) {
  const message = String((error && error.message) || "");
  if (/invalid login credentials|username atau password salah/i.test(message)) {
    return "Username atau password salah.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Tidak dapat terhubung ke server. Periksa koneksi internet.";
  }
  return message || "Login gagal.";
}

export function handleError(error) {
  const code = String((error && error.code) || "");
  const message = (error && error.message) || "Terjadi kesalahan.";
  if (
    /could not find the function .*admin_update_attendance|function .*admin_update_attendance.* does not exist/i.test(
      message
    )
  ) {
    toast(
      "Fitur edit absensi belum tersedia di database. Jalankan npm run migrate pada database Supabase yang digunakan aplikasi, lalu muat ulang halaman.",
      "danger"
    );
    return;
  }
  if (code === "42501" && /admin_update_attendance/i.test(message)) {
    toast(
      "Database menolak izin edit absensi. Pastikan migrasi terbaru sudah diterapkan dan Anda login sebagai admin.",
      "danger"
    );
    return;
  }
  if (isSessionExpired(message)) {
    if (sessionExpiredHandler) sessionExpiredHandler("Sesi berakhir. Silakan login ulang.");
    return;
  }
  toast(message, "danger");
}

export function projectHost() {
  try {
    return new URL(SUPABASE_URL).host;
  } catch (error) {
    return SUPABASE_URL || "-";
  }
}
