import { state } from "../../core/store.js";
import { rpc, handleError } from "../../core/api.js";
import { esc } from "../../lib/dom.js";
import { formatDateTime } from "../../lib/format.js";
import { renderPagination } from "../../lib/pagination.js";
import { exportPdfReport } from "../../services/pdf.js";
const PAGE_SIZE = 15;

const KNOWN_ACTIONS = [
  "check-in",
  "check-out",
  "login",
  "logout",
  "create-user",
  "update-user",
  "delete-user",
  "reset-password",
  "update-settings",
  "edit-attendance",
  "delete-attendance",
  "submit-leave",
  "review-leave",
  "submit-correction",
  "approve-correction",
  "reject-correction",
  "create-announcement",
  "update-announcement",
  "delete-announcement",
  "update-intern-profile",
  "reply-suggestion",
  "delete-suggestion",
  "export-data"
];

const ACTION_LABELS = {
  "check-in": "Absen masuk",
  "check-out": "Absen pulang",
  login: "Masuk ke aplikasi",
  logout: "Keluar dari aplikasi",
  "create-user": "Tambah pengguna",
  "update-user": "Ubah data pengguna",
  "delete-user": "Hapus pengguna",
  "delete-user-attendance": "Hapus riwayat absensi pengguna",
  "reset-password": "Reset kata sandi",
  "update-settings": "Ubah pengaturan",
  "edit-attendance": "Edit absensi",
  "delete-attendance": "Hapus absensi",
  "submit-leave": "Ajukan izin",
  "review-leave": "Tinjau pengajuan izin",
  "submit-correction": "Ajukan koreksi absensi",
  "approve-correction": "Setujui koreksi absensi",
  "reject-correction": "Tolak koreksi absensi",
  "create-announcement": "Buat pengumuman",
  "update-announcement": "Ubah pengumuman",
  "delete-announcement": "Hapus pengumuman",
  "update-intern-profile": "Ubah profil peserta magang",
  "update-avatar": "Ubah avatar",
  "update-profile": "Ubah profil",
  "change-password": "Ubah kata sandi",
  "submit-suggestion": "Kirim saran",
  "update-suggestion": "Tanggapi saran",
  "delete-suggestion": "Hapus saran",
  "export-data": "Ekspor data"
};

const SETTING_LABELS = {
  app_name: "Nama aplikasi",
  timezone: "Zona waktu",
  late_limit: "Batas masuk agar tidak terlambat",
  checkout_limit: "Jam mulai absen pulang",
  office_name: "Nama kantor",
  office_lat: "Latitude kantor",
  office_lng: "Longitude kantor",
  max_radius_m: "Radius absensi",
  max_accuracy_m: "Akurasi GPS maksimal"
};

function normalizeAction(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

function actionLabel(value) {
  const action = normalizeAction(value);
  return ACTION_LABELS[action] || (action ? action.replace(/-/g, " ") : "-");
}

function formatDetail(row) {
  const detail = String(row.detail || "").trim();
  if (!detail) return "-";

  const action = normalizeAction(row.action);
  if (action === "update-avatar") {
    return detail === "inisial"
      ? "Avatar profil dikembalikan ke inisial."
      : "Avatar profil diperbarui menjadi " + detail + ".";
  }

  if (action !== "update-settings") return detail;

  let settings;
  try {
    settings = JSON.parse(detail);
  } catch (error) {
    return detail;
  }
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return detail;

  const fields = Object.entries(settings).map(([key, value]) => {
    const label = SETTING_LABELS[key] || key.replace(/_/g, " ");
    const formattedValue = value === null || value === "" ? "tidak diisi" : String(value);
    const unit =
      key === "max_radius_m" || key === "max_accuracy_m" ? " meter" : "";
    return label + ": " + formattedValue + unit;
  });
  if (!fields.length) return "Pengaturan diperbarui tanpa perubahan nilai.";
  return "Pengaturan diperbarui: " + fields.join("; ") + ".";
}

function actionTone(action) {
  const value = normalizeAction(action);
  if (/delete|reject|logout/.test(value)) return "is-danger";
  if (/create|approve|check-in/.test(value)) return "is-success";
  if (/update|edit|reset|review/.test(value)) return "is-warning";
  return "is-info";
}

function actionOptions() {
  const set = new Set(KNOWN_ACTIONS);
  (state.logs || []).forEach((row) => {
    if (row.action) set.add(row.action);
  });
  if (state.ui.logAction) set.add(state.ui.logAction);
  return Array.from(set)
    .sort()
    .map(
      (value) =>
        '<option value="' +
        esc(value) +
        '"' +
        (value === state.ui.logAction ? " selected" : "") +
        ">" +
        esc(actionLabel(value)) +
        "</option>"
    )
    .join("");
}

function renderRows(rows) {
  if (!rows.length) {
    return '<tr><td colspan="4" class="text-center text-secondary py-4">Tidak ada log yang cocok dengan filter.</td></tr>';
  }
  return rows
    .map(
      (row) => `
      <tr>
        <td data-label="Waktu" class="text-nowrap small">${esc(formatDateTime(row.timestamp))}</td>
        <td data-label="Aktor"><span class="fw-semibold">${esc(row.actor || "system")}</span></td>
        <td data-label="Aksi"><span class="log-action ${actionTone(row.action)}">${esc(actionLabel(row.action))}</span></td>
        <td data-label="Detail"><div class="small text-break-anywhere">${esc(formatDetail(row))}</div></td>
      </tr>
    `
    )
    .join("");
}

export function renderLogs() {
  const logs = state.logs || [];
  const total = Number(state.logsTotal) || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(state.ui.logPage) || 1), pages);

  return `
    <div class="card rounded-4 border-0 shadow-sm">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div>
            <h2 class="h5 fw-bold mb-1">Log audit</h2>
            <div class="small text-secondary">${total ? total + " aktivitas tercatat" : "Riwayat aktivitas sistem"}</div>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-outline-secondary rounded-pill px-3" id="logs-refresh" type="button"><i class="bi bi-arrow-clockwise me-2"></i>Muat ulang</button>
            <button class="btn btn-primary rounded-pill px-3" id="logs-pdf" type="button"><i class="bi bi-file-earmark-pdf me-2"></i>Cetak PDF</button>
          </div>
        </div>

        ${
          state.logsError
            ? `<div class="alert alert-danger small d-flex justify-content-between align-items-center flex-wrap gap-2" role="alert"><span>${esc(state.logsError)}</span><button class="btn btn-sm btn-outline-danger rounded-pill" id="logs-retry" type="button">Coba lagi</button></div>`
            : ""
        }
        ${
          state.logsLoading
            ? '<div class="alert alert-light border small" role="status"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Memuat log...</div>'
            : ""
        }

        <div class="row g-2 mb-3">
          <div class="col-12 col-md-5">
            <input id="logs-search" class="form-control rounded-3" type="search" placeholder="Cari aktor, aksi, atau detail..." value="${esc(state.ui.logSearch)}" />
          </div>
          <div class="col-7 col-md-4">
            <select id="logs-action" class="form-select rounded-3" aria-label="Filter aksi">
              <option value="">Semua aksi</option>
              ${actionOptions()}
            </select>
          </div>
          <div class="col-5 col-md-3">
            <button class="btn btn-outline-secondary rounded-3 w-100" id="logs-reset" type="button">Reset filter</button>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table table-sm align-middle table-stack mb-0">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Aktor</th>
                <th>Aksi</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody id="logs-table-body">${renderRows(logs)}</tbody>
          </table>
        </div>
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3">
          <div class="small text-secondary">${total ? "Halaman " + page + " dari " + pages : "Belum ada data"}</div>
          <div id="logs-pagination">${renderPagination(page, pages, "Navigasi log audit")}</div>
        </div>
      </div>
    </div>
  `;
}

function filterKey() {
  return [
    String(state.ui.logAction || ""),
    String(state.ui.logSearch || ""),
    String(Number(state.ui.logPage) || 1)
  ].join("|");
}

export async function loadLogs(context, options) {
  const opts = options || {};
  if (state.logsLoading) return;
  if (!opts.force && state.logsLoadedKey === filterKey()) return;
  state.logsLoading = true;
  state.logsError = "";
  const page = Math.max(1, Number(state.ui.logPage) || 1);
  try {
    const result = await rpc("admin_list_logs", {
      p_action: state.ui.logAction || "",
      p_search: state.ui.logSearch || "",
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE
    });
    state.logs = Array.isArray(result && result.logs) ? result.logs : [];
    state.logsTotal = Number(result && result.total) || 0;
    state.logsLoadedKey = filterKey();
  } catch (error) {
    state.logsError = (error && error.message) || "Gagal memuat log audit.";
    state.logsLoadedKey = filterKey();
    handleError(error);
  } finally {
    state.logsLoading = false;
    if (context && typeof context.rerender === "function") context.rerender();
  }
}

export function attachLogsEvents(context) {
  loadLogs(context);

  const search = document.getElementById("logs-search");
  let searchTimer = null;
  if (search) {
    search.addEventListener("input", () => {
      state.ui.logSearch = search.value;
      state.ui.logPage = 1;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadLogs(context, { force: true }), 350);
    });
  }

  const action = document.getElementById("logs-action");
  if (action) {
    action.addEventListener("change", () => {
      state.ui.logAction = action.value;
      state.ui.logPage = 1;
      loadLogs(context, { force: true });
    });
  }

  const reset = document.getElementById("logs-reset");
  if (reset) {
    reset.addEventListener("click", () => {
      state.ui.logSearch = "";
      state.ui.logAction = "";
      state.ui.logPage = 1;
      loadLogs(context, { force: true });
    });
  }

  const refresh = document.getElementById("logs-refresh");
  if (refresh) refresh.addEventListener("click", () => loadLogs(context, { force: true }));
  const retry = document.getElementById("logs-retry");
  if (retry) retry.addEventListener("click", () => loadLogs(context, { force: true }));

  const pdf = document.getElementById("logs-pdf");
  if (pdf) {
    pdf.addEventListener("click", async () => {
      const restore = pdf.innerHTML;
      const target = window.open("", "_blank");
      pdf.disabled = true;
      pdf.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Menyiapkan...';
      try {
        const result = await rpc("admin_list_logs", {
          p_action: state.ui.logAction || "",
          p_search: state.ui.logSearch || "",
          p_limit: 500,
          p_offset: 0
        });
        const rows = Array.isArray(result && result.logs) ? result.logs : [];
        const filters = [];
        if (state.ui.logAction) filters.push("aksi: " + actionLabel(state.ui.logAction));
        if (state.ui.logSearch) filters.push('pencarian: "' + state.ui.logSearch + '"');
        const printed = exportPdfReport({
          target,
          title: "Laporan Log Audit",
          subtitle: filters.length ? filters.join(" | ") : "Semua aktivitas",
          generatedBy: state.user && state.user.name,
          meta: [
            { label: "Total log sesuai filter", value: String((result && result.total) || 0) },
            { label: "Baris dicetak", value: String(rows.length) },
            { label: "Filter aksi", value: state.ui.logAction ? actionLabel(state.ui.logAction) : "Semua" },
            { label: "Pencarian", value: state.ui.logSearch || "-" }
          ],
          sections: [
            {
              heading: "Aktivitas",
              note:
                rows.length < Number((result && result.total) || 0)
                  ? "Dicetak maksimal 500 log terbaru sesuai filter."
                  : "",
              columns: [
                { label: "Waktu", key: "time" },
                { label: "Aktor", key: "actor" },
                { label: "Aksi", key: "action" },
                { label: "Detail", key: "detail" }
              ],
              rows: rows.map((row) => ({
                time: formatDateTime(row.timestamp),
                actor: row.actor || "system",
                action: actionLabel(row.action),
                detail: formatDetail(row)
              }))
            }
          ]
        });
      } catch (error) {
        handleError(error);
      } finally {
        pdf.disabled = false;
        pdf.innerHTML = restore;
      }
    });
  }

  const pager = document.getElementById("logs-pagination");
  if (pager) {
    pager.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button) return;
      state.ui.logPage = Number(button.dataset.page) || 1;
      loadLogs(context, { force: true });
    });
  }
}
