const CONFIG = window.TELKOM_CONFIG || {};

export const APP_NAME = CONFIG.appName || "TELKOM AKSES INTERNSHIP";
export const AUTO_REFRESH_MS = CONFIG.autoRefreshMs || 30000;
export const PHOTO_MAX_SIZE = CONFIG.photoMaxSize || 900;
export const PHOTO_QUALITY = CONFIG.photoQuality || 0.72;
export const PHOTO_BUCKET = CONFIG.photoBucket || "attendance-photos";
export const SUPABASE_URL = CONFIG.supabaseUrl || "";
export const SUPABASE_KEY = CONFIG.supabaseAnonKey || "";
