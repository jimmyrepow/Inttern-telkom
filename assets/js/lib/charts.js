import { esc } from "./dom.js";

export function renderBarChart(items, options) {
  const opts = options || {};
  const rows = Array.isArray(items) ? items : [];
  const max = Math.max(1, ...rows.map((item) => Number(item.value) || 0));
  const ariaLabel = opts.ariaLabel || "Grafik batang";
  return `
    <div class="bar-chart" role="img" aria-label="${esc(ariaLabel)}">
      <div class="bar-chart-bars">
        ${rows
          .map((item) => {
            const value = Number(item.value) || 0;
            const height = value ? Math.max(6, Math.round((value / max) * 100)) : 0;
            const tone = item.tone ? " is-" + item.tone : "";
            return `
              <div class="bar-chart-col" title="${esc(item.label)}: ${value}${item.unit ? " " + esc(item.unit) : ""}">
                <div class="bar-chart-track">
                  <div class="bar-chart-bar${tone}" style="height:${height}%"></div>
                </div>
                <span class="bar-chart-value">${value || ""}</span>
                <span class="bar-chart-label">${esc(item.label)}</span>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

export function renderRatioBar(segments, options) {
  const opts = options || {};
  const rows = Array.isArray(segments) ? segments : [];
  const total = rows.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  return `
    <div class="ratio-bar" role="img" aria-label="${esc(opts.ariaLabel || "Proporsi data")}">
      ${rows
        .map((item) => {
          const value = Number(item.value) || 0;
          const width = total ? (value / total) * 100 : 0;
          return `<span class="ratio-segment is-${esc(item.tone || "neutral")}" style="width:${width}%" title="${esc(item.label)}: ${value}"></span>`;
        })
        .join("")}
    </div>
    <div class="ratio-legend">
      ${rows
        .map(
          (item) =>
            `<span class="ratio-legend-item"><span class="ratio-dot is-${esc(item.tone || "neutral")}"></span>${esc(item.label)} <strong>${Number(item.value) || 0}</strong></span>`
        )
        .join("")}
    </div>
  `;
}
