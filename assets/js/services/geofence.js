import { state } from "../core/store.js";

const EARTH_RADIUS_M = 6371000;

function finiteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(meters) {
  if (meters === null || meters === undefined || !Number.isFinite(Number(meters))) return "-";
  const value = Number(meters);
  if (value < 1000) return Math.round(value) + " m";
  return (value / 1000).toFixed(2).replace(".", ",") + " km";
}

export function getGeofence() {
  const settings = state.settings || {};
  const radius = finiteNumber(settings.max_radius_m);
  const officeLat = finiteNumber(settings.office_lat);
  const officeLng = finiteNumber(settings.office_lng);
  const maxAccuracySetting = finiteNumber(settings.max_accuracy_m);
  const maxAccuracy = maxAccuracySetting && maxAccuracySetting > 0 ? maxAccuracySetting : 100;
  const radiusEnabled = radius !== null && radius > 0;
  const configured = radiusEnabled && officeLat !== null && officeLng !== null;
  const ready = state.locationStatus === "ready" && Boolean(state.currentLocation);
  const hasLocation =
    Number.isFinite(Number(state.currentLat)) && Number.isFinite(Number(state.currentLng));
  const accuracy = finiteNumber(state.locationAccuracy);
  const distance =
    configured && hasLocation
      ? haversineMeters(officeLat, officeLng, Number(state.currentLat), Number(state.currentLng))
      : null;
  const inside = distance !== null && radius !== null && distance <= radius;
  const accuracyOk =
    !configured || (accuracy !== null && accuracy > 0 && accuracy <= maxAccuracy);

  let allowed = ready;
  if (radiusEnabled) {
    allowed = ready && configured && hasLocation && inside && accuracyOk;
  }

  return {
    radiusEnabled,
    configured,
    radius,
    maxAccuracy,
    officeLat,
    officeLng,
    ready,
    hasLocation,
    accuracy,
    distance,
    inside,
    accuracyOk,
    allowed
  };
}

export function geofenceReason(geofence) {
  const geo = geofence || getGeofence();
  if (!geo.radiusEnabled) return "";
  if (!geo.configured) {
    return "Radius absensi aktif, tetapi koordinat kantor belum lengkap. Hubungi admin.";
  }
  if (!geo.ready) return "Menunggu lokasi GPS terdeteksi.";
  if (!geo.hasLocation) return "Koordinat GPS belum tersedia. Perbarui lokasi.";
  if (!geo.accuracyOk) {
    return (
      "Akurasi GPS ±" +
      Math.round(geo.accuracy || 0) +
      " m melebihi batas " +
      Math.round(geo.maxAccuracy) +
      " m. Aktifkan lokasi presisi atau pindah ke area terbuka."
    );
  }
  if (!geo.inside) {
    return (
      "Anda berada " +
      formatDistance(geo.distance) +
      " dari kantor, di luar radius " +
      formatDistance(geo.radius) +
      ". Tombol absensi terkunci."
    );
  }
  return "";
}
