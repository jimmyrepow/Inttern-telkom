import { state } from "../core/store.js";
import { esc, toast } from "../lib/dom.js";

export function renderLocationDisplay() {
  if (!state.currentLocation) return "Belum mengambil lokasi...";
  const accuracy = state.locationAccuracy
    ? " (akurasi &plusmn;" + state.locationAccuracy + " m)"
    : "";
  return (
    '<span class="fw-semibold">' +
    esc(state.currentLocation) +
    "</span>" +
    accuracy +
    '<br /><a href="https://www.google.com/maps?q=' +
    encodeURIComponent(state.currentLocation) +
    '" target="_blank" rel="noopener">Buka di Google Maps</a>'
  );
}

export function updateLocationUi() {
  const display = document.getElementById("location-display");
  if (display) display.innerHTML = renderLocationDisplay();
  const stat = document.getElementById("gps-stat");
  if (stat) stat.textContent = state.currentLocation ? "Aktif" : "Belum";
}

export function requestLocation() {
  if (!navigator.geolocation) {
    toast("Browser tidak mendukung GPS.", "danger");
    return;
  }
  toast("Mengambil lokasi GPS...", "info");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.currentLocation =
        position.coords.latitude.toFixed(6) + ", " + position.coords.longitude.toFixed(6);
      state.locationAccuracy = Math.round(position.coords.accuracy || 0);
      updateLocationUi();
      toast("Lokasi GPS berhasil diambil.", "success");
    },
    (error) => {
      const message =
        error && error.code === 1
          ? "Izin lokasi ditolak. Aktifkan izin lokasi di browser."
          : "Gagal mengambil lokasi GPS.";
      toast(message, "danger");
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}
