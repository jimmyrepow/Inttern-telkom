import { esc } from "./dom.js";

export function statCard(label, value, sub, id) {
  return `
    <div class="stat-col">
      <div class="card rounded-4 border-0 shadow-sm h-100">
        <div class="card-body">
          <div class="small text-secondary">${esc(label)}</div>
          <div class="fs-4 fw-bold"${id ? ' id="' + id + '"' : ""}>${esc(value)}</div>
          ${sub ? '<div class="small text-secondary mt-1">' + esc(sub) + "</div>" : ""}
        </div>
      </div>
    </div>
  `;
}

export function renderPhoto(url) {
  if (!url) return '<span class="text-secondary small">-</span>';
  return (
    '<a href="' +
    esc(url) +
    '" target="_blank" rel="noopener" title="Buka foto"><img class="photo-thumb" src="' +
    esc(url) +
    '" alt="Foto absensi" loading="lazy" /></a>'
  );
}

export function renderLocation(location) {
  if (!location || location === "Belum ada lokasi") {
    return '<span class="text-secondary small">-</span>';
  }
  const match = String(location).match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return esc(location);
  const mapsUrl = "https://www.google.com/maps?q=" + match[1] + "," + match[2];
  return '<a href="' + esc(mapsUrl) + '" target="_blank" rel="noopener">' + esc(location) + "</a>";
}
