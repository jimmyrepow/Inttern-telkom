const CONFIG = window.TELKOM_CONFIG || {};

export const APP_NAME = CONFIG.appName || "TELKOM AKSES INTERNSHIP";
export const APP_CREDITS = "Design inspired by Dhea · Dev Jimmy";
export const DEV_WHATSAPP_NUMBER = "6281276484493";
export const DEV_WHATSAPP_DISPLAY = "+62 812-7648-4493";
export const DEV_WHATSAPP_URL =
  "https://wa.me/" +
  DEV_WHATSAPP_NUMBER +
  "?text=" +
  encodeURIComponent("Halo Dev, saya menemukan bug/error di aplikasi TELKOM AKSES INTERNSHIP: ");
export const AUTO_REFRESH_MS = CONFIG.autoRefreshMs || 30000;
export const PHOTO_MAX_SIZE = CONFIG.photoMaxSize || 900;
export const PHOTO_QUALITY = CONFIG.photoQuality || 0.72;
export const PHOTO_BUCKET = CONFIG.photoBucket || "attendance-photos";
export const SUPABASE_URL = CONFIG.supabaseUrl || "";
export const SUPABASE_KEY = CONFIG.supabaseAnonKey || "";
