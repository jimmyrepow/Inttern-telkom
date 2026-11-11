import { state } from "../core/store.js";
import { esc, toast } from "../lib/dom.js";
import { getGeofence, geofenceReason, formatDistance } from "./geofence.js";

const LOCATION_FRESH_MS = 5 * 60 * 1000;
let activeRequest = null;

function emitLocationChanged() {
  document.dispatchEvent(new CustomEvent("location:changed"));
}

export function isLocationReady() {
  return state.locationStatus === "ready" && Boolean(state.currentLocation);
}

export function isLocationFresh() {
  return (
    isLocationReady() &&
    Boolean(state.locationAt) &&
    Date.now() - state.locationAt < LOCATION_FRESH_MS
  );
}

function geofenceDetail() {
  const geo = getGeofence();
  if (!state.currentLocation) return "";
  if (!geo.radiusEnabled) {
    return '<div class="small text-secondary mt-1">Radius absensi belum diatur admin.</div>';
  }
  const reason = geofenceReason(geo);
  if (reason) {
    return '<div class="small text-danger fw-semibold mt-1">' + esc(reason) + "</div>";
  }
  return (
    '<div class="small text-success fw-semibold mt-1">Di dalam radius kantor (' +
    formatDistance(geo.distance) +
    ' dari ' +
    formatDistance(geo.radius) +
    ')</div>'
  );
}

function setLocationStatus(status, error) {
  state.locationStatus = status;
  state.locationError = error || "";
  updateLocationUi();
  emitLocationChanged();
}

export function renderLocationDisplay() {
  if (!state.currentLocation && state.locationStatus === "loading") {
    return '<span class="text-secondary"><span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Mendeteksi lokasi otomatis...</span>';
  }
  if (!state.currentLocation && state.locationStatus === "error") {
    return '<span class="text-danger">' + esc(state.locationError || "Lokasi GPS belum tersedia.") + "</span>";
  }
  if (!state.currentLocation) {
    return "Menunggu lokasi GPS...";
  }

  const accuracy = state.locationAccuracy
    ? " (akurasi &plusmn;" + state.locationAccuracy + " m)"
    : "";
  const updating =
    state.locationStatus === "loading"
      ? '<div class="small text-secondary mt-1"><span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Memperbarui lokasi...</div>'
      : "";
  const warning =
    state.locationStatus === "error"
      ? '<div class="small text-danger mt-1">' + esc(state.locationError || "Gagal memperbarui lokasi.") + "</div>"
      : "";

  return (
    '<span class="fw-semibold">' +
    esc(state.currentLocation) +
    "</span>" +
    accuracy +
    '<br /><a href="https://www.google.com/maps?q=' +
    encodeURIComponent(state.currentLocation) +
    '" target="_blank" rel="noopener">Buka di Google Maps</a>' +
    updating +
    warning +
    geofenceDetail()
  );
}

export function updateLocationUi() {
  const display = document.getElementById("location-display");
  if (display) display.innerHTML = renderLocationDisplay();

  const stat = document.getElementById("gps-stat");
  if (stat) {
    const geo = getGeofence();
    stat.textContent =
      state.locationStatus === "loading"
        ? "Mendeteksi"
        : state.locationStatus === "error"
          ? "Gagal"
          : isLocationReady()
            ? geo.radiusEnabled && !geo.inside
              ? "Di luar"
              : geo.radiusEnabled && !geo.accuracyOk
                ? "Akurasi"
                : "Aktif"
            : "Belum";
    stat.classList.toggle("text-danger", state.locationStatus === "error");
  }

  const button = document.getElementById("location-btn");
  if (!button) return;
  if (state.locationStatus === "loading") {
    button.disabled = true;
    button.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Mendeteksi...';
    button.setAttribute("aria-busy", "true");
    return;
  }
  button.disabled = false;
  button.setAttribute("aria-busy", "false");
  button.textContent =
    state.locationStatus === "error"
      ? "Coba Lagi"
      : state.currentLocation
        ? "Perbarui GPS"
        : "Ambil GPS";
}

export function requestLocation(options) {
  const opts = options || {};
  if (!navigator.geolocation) {
    setLocationStatus("error", "Browser tidak mendukung GPS.");
    toast("Browser tidak mendukung GPS.", "danger");
    return Promise.resolve(null);
  }
  if (activeRequest) return activeRequest;

  setLocationStatus("loading", "");
  if (!opts.silent) toast("Mengambil lokasi GPS...", "info");

  activeRequest = new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        state.currentLocation =
          position.coords.latitude.toFixed(6) + ", " + position.coords.longitude.toFixed(6);
        state.currentLat = position.coords.latitude;
        state.currentLng = position.coords.longitude;
        state.locationAccuracy = Math.round(position.coords.accuracy || 0);
        state.locationAt = Date.now();
        setLocationStatus("ready", "");
        const warning = geofenceReason(getGeofence());
        if (warning) {
          toast(warning, "warning");
        } else if (!opts.silent) {
          toast("Lokasi GPS berhasil diperbarui.", "success");
        }
        resolve(state.currentLocation);
      },
      (error) => {
        const message =
          error && error.code === 1
            ? "Izin lokasi ditolak. Aktifkan izin lokasi di browser."
            : error && error.code === 3
              ? "Waktu deteksi lokasi habis. Coba lagi di area terbuka."
              : "Gagal mengambil lokasi GPS.";
        setLocationStatus("error", message);
        toast(message, opts.silent ? "warning" : "danger");
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: opts.maximumAge == null ? 0 : opts.maximumAge
      }
    );
  }).finally(() => {
    activeRequest = null;
  });

  return activeRequest;
}

export function ensureLocation(options) {
  if (activeRequest) return activeRequest;
  if (state.locationStatus === "error") return Promise.resolve(null);
  if (isLocationFresh()) return Promise.resolve(state.currentLocation);
  return requestLocation(Object.assign({ silent: true, auto: true }, options || {}));
}
