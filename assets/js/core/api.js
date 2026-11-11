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
  if (error) throw new Error(error.message || "Permintaan gagal.");
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
  const message = (error && error.message) || "Terjadi kesalahan.";
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
