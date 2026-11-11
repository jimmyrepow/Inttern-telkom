import { state } from "../core/store.js";
import { esc } from "../lib/dom.js";
import { getTodayDate, formatMonth, shortTime } from "../lib/format.js";
import { statCard } from "../lib/render.js";
import { renderBarChart, renderRatioBar } from "../lib/charts.js";
import { exportPdfReport } from "../services/pdf.js";

function roleKey() {
  return String((state.user && state.user.role) || "intern").toLowerCase() === "admin"
    ? "admin"
    : "intern";
}

function scopedAttendance() {
  const rows = Array.isArray(state.attendance) ? state.attendance : [];
  if (roleKey() === "admin") return rows;
  const userId = String(state.user && state.user.id);
  return rows.filter((row) => String(row.user_id) === userId);
}

function monthOf(date) {
  return String(date || "").slice(0, 7);
}

function shiftMonth(key, delta) {
  const match = String(key || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return key;
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + delta, 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return year + "-" + month;
}

function daysInMonth(key) {
  const match = String(key || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return 30;
  return new Date(Number(match[1]), Number(match[2]), 0).getDate();
}

function shortMonth(key) {
  const label = formatMonth(key);
  return label === "-" ? key : label.split(" ")[0].slice(0, 3);
}

function monthStats(key) {
  const rows = scopedAttendance().filter(
    (row) => monthOf(row.date) === key && row.check_in
  );
  const late = rows.filter((row) => String(row.status) === "late").length;
  const onTime = rows.length - late;
  const days = new Set(rows.map((row) => String(row.date))).size;
  const people = new Set(rows.map((row) => String(row.user_id))).size;
  return { rows, late, onTime, days, people, total: rows.length };
}

function leaveDaysInMonth(key) {
  const start = key + "-01";
  const end = key + "-" + String(daysInMonth(key)).padStart(2, "0");
  const leaves = Array.isArray(state.leaves) ? state.leaves : [];
  return leaves.reduce((sum, leave) => {
    if (String(leave.status) !== "approved") return sum;
    const from = String(leave.start_date || "") > start ? String(leave.start_date) : start;
    const to = String(leave.end_date || "") < end ? String(leave.end_date) : end;
    if (!from || !to || from > to) return sum;
    const diff = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
    return sum + Math.max(0, diff);
  }, 0);
}

function dailyChart(key) {
  const rows = scopedAttendance().filter(
    (row) => monthOf(row.date) === key && row.check_in
  );
  const byDay = {};
  rows.forEach((row) => {
    const day = Number(String(row.date).slice(8, 10));
    if (!byDay[day]) byDay[day] = { total: 0, late: 0 };
    byDay[day].total += 1;
    if (String(row.status) === "late") byDay[day].late += 1;
  });
  const total = daysInMonth(key);
  const items = [];
  for (let day = 1; day <= total; day += 1) {
    const entry = byDay[day] || { total: 0, late: 0 };
    items.push({
      label: String(day),
      value: entry.total,
      tone: entry.total && entry.late ? "warning" : entry.total ? "success" : ""
    });
  }
  return renderBarChart(items, {
    ariaLabel: "Kehadiran harian " + formatMonth(key)
  });
}

function trendChart(key) {
  const items = [];
  for (let offset = -5; offset <= 0; offset += 1) {
    const month = shiftMonth(key, offset);
    items.push({
      label: shortMonth(month),
      value: monthStats(month).total,
      unit: "absensi",
      tone: offset === 0 ? "primary" : ""
    });
  }
  return renderBarChart(items, { ariaLabel: "Tren kehadiran enam bulan terakhir" });
}

function userRows(key) {
  const rows = scopedAttendance().filter(
    (row) => monthOf(row.date) === key && row.check_in
  );
  const users = Array.isArray(state.users) ? state.users : [];
  const map = new Map();
  rows.forEach((row) => {
    const id = String(row.user_id);
    if (!map.has(id)) map.set(id, { attended: 0, onTime: 0, late: 0 });
    const entry = map.get(id);
    entry.attended += 1;
    if (String(row.status) === "late") entry.late += 1;
    else entry.onTime += 1;
  });
  const list = [];
  const seen = new Set();
  users.forEach((user) => {
    const id = String(user.id);
    seen.add(id);
    const entry = map.get(id);
    if (!entry && roleKey() === "admin") {
      list.push({
        name: user.name,
        username: user.username,
        division: user.division || "",
        attended: 0,
        onTime: 0,
        late: 0
      });
      return;
    }
    if (!entry) return;
    list.push({
      name: user.name,
      username: user.username,
      division: user.division || "",
      attended: entry.attended,
      onTime: entry.onTime,
      late: entry.late
    });
  });
  map.forEach((entry, id) => {
    if (seen.has(id)) return;
    list.push({
      name: "Peserta",
      username: id.slice(0, 8),
      division: "",
      attended: entry.attended,
      onTime: entry.onTime,
      late: entry.late
    });
  });
  return list.sort((a, b) => b.attended - a.attended || a.name.localeCompare(b.name));
}

function renderUserTable(key) {
  const rows = userRows(key);
  if (!rows.length) {
    return '<div class="text-center text-secondary py-4 small">Belum ada data kehadiran pada bulan ini.</div>';
  }
  return `
    <div class="table-responsive">
      <table class="table table-sm align-middle table-stack mb-0">
        <thead>
          <tr>
            <th>Peserta</th>
            <th>Hadir</th>
            <th>Tepat waktu</th>
            <th>Telat</th>
            <th>Tingkat tepat waktu</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .slice(0, 20)
            .map((row) => {
              const rate = row.attended ? Math.round((row.onTime / row.attended) * 100) : 0;
              return `
                <tr>
                  <td data-label="Peserta">
                    <div class="fw-semibold">${esc(row.name || "-")}</div>
                    <div class="small text-secondary">${row.division ? esc(row.division) + " &middot; " : ""}@${esc(row.username || "-")}</div>
                  </td>
                  <td data-label="Hadir">${row.attended}</td>
                  <td data-label="Tepat waktu">${row.onTime}</td>
                  <td data-label="Telat">${row.late}</td>
                  <td data-label="Tingkat tepat waktu">
                    <div class="d-flex align-items-center gap-2">
                      <div class="progress insight-progress flex-grow-1" role="progressbar" aria-valuenow="${rate}" aria-valuemin="0" aria-valuemax="100" aria-label="Tingkat tepat waktu ${esc(row.name || "")}">
                        <div class="progress-bar ${rate >= 80 ? "bg-success" : rate >= 50 ? "bg-warning" : "bg-danger"}" style="width:${rate}%"></div>
                      </div>
                      <span class="small fw-semibold">${rate}%</span>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function renderAnalytics() {
  const current = getTodayDate().slice(0, 7);
  const key = /^\d{4}-\d{2}$/.test(state.ui.analyticsMonth || "")
    ? state.ui.analyticsMonth
    : current;
  const stats = monthStats(key);
  const previous = monthStats(shiftMonth(key, -1));
  const leaveDays = leaveDaysInMonth(key);
  const punctuality = stats.total ? Math.round((stats.onTime / stats.total) * 100) : 0;
  const delta = stats.total - previous.total;
  const deltaLabel =
    delta === 0
      ? "Sama dengan bulan lalu"
      : (delta > 0 ? "+" : "") + delta + " dibanding bulan lalu";
  const rate = stats.people ? Math.round((stats.total / (stats.people * Math.max(1, stats.days))) * 100) : 0;

  return `
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
      <div>
        <h2 class="h5 fw-bold mb-0">Analitik tren</h2>
        <div class="small text-secondary">Ringkasan ${esc(formatMonth(key))}.</div>
      </div>
      <div class="d-flex gap-2 align-items-center flex-wrap">
        <input id="analytics-month" class="form-control form-control-sm rounded-3" type="month" value="${esc(key)}" max="${esc(current)}" aria-label="Pilih bulan analitik" style="max-width: 170px" />
        <button class="btn btn-sm btn-outline-secondary rounded-pill" id="analytics-current" type="button">Bulan ini</button>
        <button class="btn btn-sm btn-primary rounded-pill" id="analytics-pdf" type="button"><i class="bi bi-file-earmark-pdf me-2"></i>Cetak PDF</button>
      </div>
    </div>

    <div class="stats-grid mb-4">
      ${statCard("Total absensi", stats.total, deltaLabel)}
      ${statCard("Hari aktif", stats.days, stats.people + " peserta hadir")}
      ${statCard("Tingkat tepat waktu", punctuality + "%", stats.onTime + " dari " + stats.total)}
      ${statCard("Hari izin disetujui", leaveDays, "Izin, sakit, cuti")}
    </div>

    <div class="row g-3 mb-3">
      <div class="col-12 col-xl-7">
        <div class="card rounded-4 border-0 shadow-sm h-100">
          <div class="card-body p-3 p-md-4">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
              <div>
                <h3 class="h6 fw-bold mb-0">Kehadiran harian</h3>
                <div class="small text-secondary">Jumlah absensi masuk per tanggal.</div>
              </div>
              <span class="badge badge-soft rounded-pill">${esc(formatMonth(key))}</span>
            </div>
            ${dailyChart(key)}
          </div>
        </div>
      </div>
      <div class="col-12 col-xl-5">
        <div class="card rounded-4 border-0 shadow-sm h-100">
          <div class="card-body p-3 p-md-4">
            <h3 class="h6 fw-bold mb-1">Proporsi ketepatan waktu</h3>
            <div class="small text-secondary mb-3">${stats.total ? stats.total + " absensi tercatat" : "Belum ada data"}.</div>
            ${renderRatioBar(
              [
                { label: "Tepat waktu", value: stats.onTime, tone: "success" },
                { label: "Telat", value: stats.late, tone: "warning" }
              ],
              { ariaLabel: "Proporsi tepat waktu dan telat" }
            )}
            <hr class="my-3" />
            <h3 class="h6 fw-bold mb-1">Tren 6 bulan</h3>
            <div class="small text-secondary mb-3">Total absensi masuk per bulan.</div>
            ${trendChart(key)}
          </div>
        </div>
      </div>
    </div>

    <div class="card rounded-4 border-0 shadow-sm">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <h3 class="h6 fw-bold mb-0">Rekap per peserta</h3>
            <div class="small text-secondary">Diurutkan berdasarkan jumlah kehadiran.</div>
          </div>
          <span class="insight-chip is-success"><i class="bi bi-activity"></i> Rata-rata kehadiran ${rate}%</span>
        </div>
        ${renderUserTable(key)}
      </div>
    </div>
  `;
}

function leavesForMonth(key) {
  const start = key + "-01";
  const end = key + "-" + String(daysInMonth(key)).padStart(2, "0");
  const leaves = Array.isArray(state.leaves) ? state.leaves : [];
  return leaves.filter((leave) => {
    if (String(leave.status) !== "approved") return false;
    return String(leave.start_date || "") <= end && String(leave.end_date || "") >= start;
  });
}

function correctionsForMonth(key) {
  const corrections = Array.isArray(state.corrections) ? state.corrections : [];
  return corrections.filter((row) => monthOf(row.date) === key);
}

function exportAnalyticsReport(key) {
  const stats = monthStats(key);
  const punctuality = stats.total ? Math.round((stats.onTime / stats.total) * 100) : 0;
  const leaveRows = leavesForMonth(key).map((row) => ({
    name: row.name,
    type: row.type,
    range: row.start_date === row.end_date ? row.start_date : row.start_date + " s/d " + row.end_date,
    status: row.status,
    note: row.admin_note || ""
  }));
  const correctionRows = correctionsForMonth(key).map((row) => ({
    name: row.name,
    date: row.date,
    checkIn: shortTime(row.requested_check_in),
    checkOut: shortTime(row.requested_check_out),
    status: row.status
  }));

  exportPdfReport({
    title: "Laporan Analitik Kehadiran",
    subtitle: formatMonth(key),
    generatedBy: state.user && state.user.name,
    meta: [
      { label: "Periode", value: formatMonth(key) },
      { label: "Total absensi", value: String(stats.total) },
      { label: "Hari aktif", value: String(stats.days) },
      { label: "Tingkat tepat waktu", value: punctuality + "%" },
      { label: "Hari izin disetujui", value: String(leaveDaysInMonth(key)) },
      { label: "Peserta hadir", value: String(stats.people) }
    ],
    sections: [
      {
        heading: "Rekap per peserta",
        columns: [
          { label: "Peserta", key: "name" },
          { label: "Divisi", key: "division" },
          { label: "Hadir", key: "attended" },
          { label: "Tepat waktu", key: "onTime" },
          { label: "Telat", key: "late" }
        ],
        rows: userRows(key).slice(0, 100)
      },
      {
        heading: "Izin, sakit, dan cuti disetujui",
        columns: [
          { label: "Pemohon", key: "name" },
          { label: "Jenis", key: "type" },
          { label: "Tanggal", key: "range" },
          { label: "Status", key: "status" },
          { label: "Catatan admin", key: "note" }
        ],
        rows: leaveRows
      },
      {
        heading: "Koreksi absensi",
        columns: [
          { label: "Peserta", key: "name" },
          { label: "Tanggal", key: "date" },
          { label: "Jam masuk", key: "checkIn" },
          { label: "Jam pulang", key: "checkOut" },
          { label: "Status", key: "status" }
        ],
        rows: correctionRows
      }
    ]
  });
}

export function attachAnalyticsEvents(context) {
  const monthInput = document.getElementById("analytics-month");
  if (monthInput) {
    monthInput.addEventListener("change", () => {
      state.ui.analyticsMonth = monthInput.value;
      if (typeof context.rerender === "function") context.rerender();
    });
  }
  const currentButton = document.getElementById("analytics-current");
  if (currentButton) {
    currentButton.addEventListener("click", () => {
      state.ui.analyticsMonth = getTodayDate().slice(0, 7);
      if (typeof context.rerender === "function") context.rerender();
    });
  }
  const pdfButton = document.getElementById("analytics-pdf");
  if (pdfButton) {
    pdfButton.addEventListener("click", () => {
      const current = getTodayDate().slice(0, 7);
      const key = /^\d{4}-\d{2}$/.test(state.ui.analyticsMonth || "")
        ? state.ui.analyticsMonth
        : current;
      exportAnalyticsReport(key);
    });
  }
}
