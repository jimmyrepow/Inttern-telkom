import { state } from "../../core/store.js";
import { rpc, handleError } from "../../core/api.js";
import { esc, toast, withBusy, confirmDialog, attendanceEditDialog } from "../../lib/dom.js";
import { getTodayDate, shortTime, statusBadge } from "../../lib/format.js";
import { statCard, renderPhoto, renderLocation } from "../../lib/render.js";
import { renderAvatar } from "../../lib/avatar.js";
import { paginate, renderPagination } from "../../lib/pagination.js";
import { removePhotos } from "../../services/photo.js";

const PAGE_SIZE = 10;

export function renderAdminDashboard() {
  const stats = state.stats || {
    totalInterns: 0,
    totalAttendanceToday: 0,
    onTime: 0,
    late: 0,
    absent: 0,
    today: getTodayDate()
  };
  return `
    <div class="stats-grid mb-4">
      ${statCard("Total peserta", stats.totalInterns, "Peserta aktif")}
      ${statCard("Hadir hari ini", stats.totalAttendanceToday, stats.today)}
      ${statCard("Tepat waktu", stats.onTime)}
      ${statCard("Telat", stats.late)}
      ${statCard("Belum absen", stats.absent)}
    </div>
    ${renderAdminInsight(stats)}
    ${renderAdminAttendanceTab()}
  `;
}

function renderAdminInsight(stats) {
  const total = Number(stats.totalInterns) || 0;
  const present = Number(stats.totalAttendanceToday) || 0;
  const onTime = Number(stats.onTime) || 0;
  const late = Number(stats.late) || 0;
  const absent = Number(stats.absent) || 0;
  const rate = total ? Math.round((present / total) * 100) : 0;
  const onTimeRate = present ? Math.round((onTime / present) * 100) : 0;
  return `
    <div class="card rounded-4 border-0 shadow-sm mb-4">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div>
            <h2 class="h5 fw-bold mb-1">Insight hari ini</h2>
            <div class="small text-secondary">Ringkasan kehadiran peserta pada ${esc(stats.today || getTodayDate())}.</div>
          </div>
          <span class="badge ${rate >= 80 ? "bg-success" : rate >= 50 ? "bg-warning text-dark" : "bg-danger"} rounded-pill px-3 py-2">${rate}% hadir</span>
        </div>
        <div class="row g-3 align-items-center">
          <div class="col-12 col-lg-5">
            <div class="d-flex justify-content-between align-items-center small mb-1">
              <span class="text-secondary">Tingkat kehadiran</span>
              <strong>${present} / ${total} peserta</strong>
            </div>
            <div class="progress insight-progress" role="progressbar" aria-valuenow="${rate}" aria-valuemin="0" aria-valuemax="100" aria-label="Tingkat kehadiran hari ini">
              <div class="progress-bar ${rate >= 80 ? "bg-success" : rate >= 50 ? "bg-warning" : "bg-danger"}" style="width:${rate}%"></div>
            </div>
            <div class="small text-secondary mt-1">${absent} peserta belum absen hari ini.</div>
          </div>
          <div class="col-12 col-lg-7">
            <div class="insight-chips">
              <span class="insight-chip is-success"><i class="bi bi-check2-circle"></i><strong>${onTime}</strong> tepat waktu (${onTimeRate}%)</span>
              <span class="insight-chip is-warning"><i class="bi bi-clock-history"></i><strong>${late}</strong> telat</span>
              <span class="insight-chip"><i class="bi bi-person-dash"></i><strong>${absent}</strong> belum absen</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function getFilteredAttendance() {
  const term = String(state.ui.search || "").trim().toLowerCase();
  const date = state.ui.date;
  const status = state.ui.status;
  return state.attendance.filter((row) => {
    if (date && String(row.date) !== String(date)) return false;
    if (status && String(row.status) !== status) return false;
    if (term) {
      const haystack = [row.name, row.user_id, row.location, row.note, row.date, row.source]
        .join(" ")
        .toLowerCase();
      if (haystack.indexOf(term) === -1) return false;
    }
    return true;
  });
}

function attendanceSummary(filtered, pager) {
  const total = state.attendance.length;
  const base =
    filtered.length === total ? total + " data" : filtered.length + " dari " + total + " data";
  return pager.pages > 1 ? base + " · halaman " + pager.page + " dari " + pager.pages : base;
}

function renderAttendanceRows(rows) {
  if (!rows.length) {
    return '<tr><td colspan="10" class="text-center text-secondary py-4">Tidak ada data absensi.</td></tr>';
  }
  return rows
    .map((row) => {
      const user = state.users.find((item) => String(item.id) === String(row.user_id));
      return `
      <tr>
        <td class="text-nowrap" data-label="Tanggal">${esc(row.date)}</td>
        <td data-label="Nama">
          <div class="d-flex align-items-center gap-2">
            ${renderAvatar(user || { name: row.name }, "avatar-sm")}
            <div class="min-w-0">
              <div class="fw-semibold">${esc(row.name)}</div>
              <div class="small text-secondary">${esc(String(row.user_id).slice(0, 8))}</div>
            </div>
          </div>
        </td>
        <td data-label="Masuk">${esc(shortTime(row.check_in))}</td>
        <td data-label="Pulang">${esc(shortTime(row.check_out))}</td>
        <td data-label="Status">${statusBadge(row.status, Boolean(row.check_in))}</td>
        <td data-label="Foto masuk">${renderPhoto(row.photo_url)}</td>
        <td data-label="Foto pulang">${renderPhoto(row.photo_out_url)}</td>
        <td class="small" data-label="Lokasi">${renderLocation(row.location)}</td>
        <td class="small" data-label="Catatan">${esc(row.note || "-")}</td>
        <td data-label="Aksi">
          <div class="table-actions">
            <button class="btn btn-sm btn-icon is-primary" type="button" data-action="edit-attendance" data-attendance-id="${esc(row.id)}" title="Edit absensi" aria-label="Edit absensi ${esc(row.name)} tanggal ${esc(row.date)}"><i class="bi bi-pencil-square" aria-hidden="true"></i></button>
            <button class="btn btn-sm btn-icon is-danger" type="button" data-action="delete-attendance" data-attendance-id="${esc(row.id)}" title="Hapus absensi" aria-label="Hapus absensi ${esc(row.name)} tanggal ${esc(row.date)}"><i class="bi bi-trash3" aria-hidden="true"></i></button>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");
}

function refreshAttendanceTable() {
  const filtered = getFilteredAttendance();
  const pager = paginate(filtered, state.ui.attendancePage, PAGE_SIZE);
  state.ui.attendancePage = pager.page;

  const body = document.getElementById("attendance-table-body");
  if (body) body.innerHTML = renderAttendanceRows(pager.items);
  const count = document.getElementById("attendance-count");
  if (count) count.textContent = attendanceSummary(filtered, pager);
  const pagerElement = document.getElementById("attendance-pagination");
  if (pagerElement) {
    pagerElement.innerHTML = renderPagination(pager.page, pager.pages, "Navigasi absensi");
  }
}

function renderAdminAttendanceTab() {
  const filtered = getFilteredAttendance();
  const pager = paginate(filtered, state.ui.attendancePage, PAGE_SIZE);
  state.ui.attendancePage = pager.page;

  return `
    <div class="card rounded-4 border-0 shadow-sm">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <h2 class="h5 fw-bold mb-1">Daftar absensi</h2>
            <div class="small text-secondary" id="attendance-count">${attendanceSummary(filtered, pager)}</div>
          </div>
          <button class="btn btn-outline-secondary btn-sm rounded-pill" id="attendance-reset" type="button">Reset filter</button>
        </div>
        <div class="row g-2 mb-3">
          <div class="col-12 col-md-5">
            <input id="attendance-search" class="form-control rounded-3" type="search" placeholder="Cari nama, lokasi, atau catatan..." value="${esc(state.ui.search)}" />
          </div>
          <div class="col-6 col-md-3">
            <input id="attendance-date" class="form-control rounded-3" type="date" value="${esc(state.ui.date)}" />
          </div>
          <div class="col-6 col-md-4">
            <select id="attendance-status" class="form-select rounded-3">
              <option value="">Semua status</option>
              <option value="on-time"${state.ui.status === "on-time" ? " selected" : ""}>Tepat waktu</option>
              <option value="late"${state.ui.status === "late" ? " selected" : ""}>Telat</option>
            </select>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm align-middle table-stack">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Nama</th>
                <th>Masuk</th>
                <th>Pulang</th>
                <th>Status</th>
                <th>Foto masuk</th>
                <th>Foto pulang</th>
                <th>Lokasi</th>
                <th>Catatan</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody id="attendance-table-body">${renderAttendanceRows(pager.items)}</tbody>
          </table>
        </div>
        <div id="attendance-pagination" class="mt-3">${renderPagination(pager.page, pager.pages, "Navigasi absensi")}</div>
      </div>
    </div>
  `;
}

export function attachAdminDashboard(context) {
  const rerender = context.rerender;
  const refresh = context.refresh;

  const search = document.getElementById("attendance-search");
  if (search) {
    search.addEventListener("input", () => {
      state.ui.search = search.value;
      state.ui.attendancePage = 1;
      refreshAttendanceTable();
    });
  }
  const date = document.getElementById("attendance-date");
  if (date) {
    date.addEventListener("change", () => {
      state.ui.date = date.value;
      state.ui.attendancePage = 1;
      refreshAttendanceTable();
    });
  }
  const status = document.getElementById("attendance-status");
  if (status) {
    status.addEventListener("change", () => {
      state.ui.status = status.value;
      state.ui.attendancePage = 1;
      refreshAttendanceTable();
    });
  }
  const reset = document.getElementById("attendance-reset");
  if (reset) {
    reset.addEventListener("click", () => {
      state.ui.search = "";
      state.ui.date = "";
      state.ui.status = "";
      state.ui.attendancePage = 1;
      rerender();
    });
  }

  const pager = document.getElementById("attendance-pagination");
  if (pager) {
    pager.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button) return;
      state.ui.attendancePage = Number(button.dataset.page) || 1;
      refreshAttendanceTable();
    });
  }

  const body = document.getElementById("attendance-table-body");
  if (body) {
    body.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const attendanceId = button.dataset.attendanceId;
      if (button.dataset.action === "delete-attendance") {
        handleDeleteAttendance(attendanceId, refresh);
      } else if (button.dataset.action === "edit-attendance") {
        handleEditAttendance(attendanceId, button, refresh);
      }
    });
  }
}

async function handleEditAttendance(attendanceId, button, refresh) {
  const record = state.attendance.find((item) => String(item.id) === String(attendanceId));
  if (!record) {
    toast("Data absensi tidak ditemukan. Tutup dialog lalu coba lagi.", "danger");
    return;
  }

  const edited = await attendanceEditDialog(record);
  if (!edited) return;

  const restore = withBusy(button, "Menyimpan...");
  try {
    const result = await rpc("admin_update_attendance", {
      p_id: attendanceId,
      p_check_in: edited.checkIn || null,
      p_check_out: edited.checkOut,
      p_status: edited.status
    });
    toast(result.message || "Data absensi berhasil diperbarui.", "success");
    await refresh({ silent: true, force: true });
  } catch (error) {
    handleError(error);
  } finally {
    restore();
  }
}

async function handleDeleteAttendance(attendanceId, refresh) {
  const record = state.attendance.find((item) => String(item.id) === String(attendanceId));
  if (!record) return;
  const confirmed = await confirmDialog({
    title: "Hapus absensi",
    message: "Hapus absensi " + record.name + " tanggal " + record.date + "?",
    confirmLabel: "Hapus",
    tone: "danger",
    secondMessage:
      "Data absensi dan foto pada hari tersebut akan dihapus permanen. Tindakan ini tidak dapat dibatalkan."
  });
  if (!confirmed) return;

  try {
    const result = await rpc("app_delete_attendance", { p_id: attendanceId });
    await removePhotos(result.photo_urls);
    toast(result.message || "Data absensi berhasil dihapus.", "success");
    await refresh({ silent: true, force: true });
  } catch (error) {
    handleError(error);
  }
}
