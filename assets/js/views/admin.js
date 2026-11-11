import { state } from "../core/store.js";
import { rpc, handleError, projectHost } from "../core/api.js";
import { APP_NAME, PHOTO_BUCKET } from "../core/config.js";
import {
  esc,
  toast,
  withBusy,
  confirmDialog,
  passwordDialog,
  attendanceEditDialog
} from "../lib/dom.js";
import {
  getTodayDate,
  formatDateTime,
  shortTime,
  statusBadge,
  isActiveUser
} from "../lib/format.js";
import { statCard, renderPhoto, renderLocation } from "../lib/render.js";
import { exportData } from "../services/export.js";
import { removePhotos } from "../services/photo.js";
import { renderGuide } from "./guide.js";

export function renderAdmin() {
  if (state.ui.tab === "guide") return renderGuide("admin");
  if (state.ui.tab === "users") return renderAdminUsersTab();
  if (state.ui.tab === "settings") return renderAdminSettingsTab();

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
    ${renderAdminAttendanceTab()}
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

function renderAttendanceRows(rows) {
  if (!rows.length) {
    return '<tr><td colspan="10" class="text-center text-secondary py-4">Tidak ada data absensi.</td></tr>';
  }
  return rows
    .map(
      (row) => `
      <tr>
        <td class="text-nowrap" data-label="Tanggal">${esc(row.date)}</td>
        <td data-label="Nama">
          <div class="fw-semibold">${esc(row.name)}</div>
          <div class="small text-secondary">${esc(String(row.user_id).slice(0, 8))}</div>
        </td>
        <td data-label="Masuk">${esc(shortTime(row.check_in))}</td>
        <td data-label="Pulang">${esc(shortTime(row.check_out))}</td>
        <td data-label="Status">${statusBadge(row.status)}</td>
        <td data-label="Foto masuk">${renderPhoto(row.photo_url)}</td>
        <td data-label="Foto pulang">${renderPhoto(row.photo_out_url)}</td>
        <td class="small" data-label="Lokasi">${renderLocation(row.location)}</td>
        <td class="small" data-label="Catatan">${esc(row.note || "-")}</td>
        <td data-label="Aksi">
          <div class="table-actions">
            <button class="btn btn-outline-primary btn-sm" type="button" data-action="edit-attendance" data-attendance-id="${esc(row.id)}">Edit</button>
            <button class="btn btn-outline-danger btn-sm" type="button" data-action="delete-attendance" data-attendance-id="${esc(row.id)}">Hapus</button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");
}

function refreshAttendanceTable() {
  const rows = getFilteredAttendance();
  const body = document.getElementById("attendance-table-body");
  if (body) body.innerHTML = renderAttendanceRows(rows);
  const count = document.getElementById("attendance-count");
  if (count) count.textContent = rows.length + " dari " + state.attendance.length + " data";
}

function renderAdminAttendanceTab() {
  const filtered = getFilteredAttendance();
  return `
    <div class="card rounded-4 border-0 shadow-sm">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <h2 class="h5 fw-bold mb-1">Daftar absensi</h2>
            <div class="small text-secondary" id="attendance-count">${filtered.length} dari ${state.attendance.length} data</div>
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
            <tbody id="attendance-table-body">${renderAttendanceRows(filtered)}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderUserTable() {
  if (!state.users.length) {
    return '<tr><td colspan="6" class="text-center text-secondary py-4">Belum ada akun.</td></tr>';
  }
  return state.users
    .map((user) => {
      const role = String(user.role || "intern").toLowerCase();
      const canDeleteAccount = String(user.id) !== String((state.user || {}).id || "");
      const accountLines = [];
      accountLines.push(
        '<div class="small text-secondary">Login: ' + esc(formatDateTime(user.last_login_at)) + "</div>"
      );
      accountLines.push(
        '<div class="small text-secondary">Password: ' + esc(formatDateTime(user.password_updated_at)) + "</div>"
      );
      return `
        <tr>
          <td class="fw-semibold" data-label="Nama">${esc(user.name)}</td>
          <td data-label="Username">${esc(user.username)}</td>
          <td data-label="Role"><span class="badge ${role === "admin" ? "bg-dark" : "bg-light text-dark"} rounded-pill">${esc(role)}</span></td>
          <td data-label="Status">${isActiveUser(user) ? '<span class="badge bg-success rounded-pill">Aktif</span>' : '<span class="badge bg-secondary rounded-pill">Nonaktif</span>'}</td>
          <td class="small" data-label="Akun">${accountLines.join("")}</td>
          <td data-label="Aksi">
            <div class="table-actions">
              <button class="btn btn-sm btn-outline-primary rounded-pill" type="button" data-action="edit-user" data-user-id="${esc(user.id)}">Edit</button>
              <button class="btn btn-sm btn-outline-secondary rounded-pill" type="button" data-action="reset-password" data-user-id="${esc(user.id)}">Reset password</button>
              <button class="btn btn-sm btn-outline-warning rounded-pill" type="button" data-action="delete-user-attendance" data-user-id="${esc(user.id)}">Hapus absensi</button>
              ${canDeleteAccount ? '<button class="btn btn-sm btn-outline-danger rounded-pill" type="button" data-action="delete-user" data-user-id="' + esc(user.id) + '">Hapus akun</button>' : ""}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderAdminUsersTab() {
  const editing = state.ui.userFormId
    ? state.users.find((user) => String(user.id) === String(state.ui.userFormId))
    : null;
  const editingActive = editing ? isActiveUser(editing) : true;
  const editingRole = editing ? String(editing.role).toLowerCase() : "intern";
  return `
    <div class="row g-3">
      <div class="col-12 col-lg-5">
        <div class="card rounded-4 border-0 shadow-sm">
          <div class="card-body">
            <h2 class="h5 fw-bold mb-3">${editing ? "Edit peserta" : "Tambah peserta"}</h2>
            <form id="user-form" novalidate>
              <input type="hidden" id="user-id" value="${editing ? esc(editing.id) : ""}" />
              <div class="mb-3">
                <label class="form-label small fw-semibold" for="user-name">Nama lengkap</label>
                <input id="user-name" class="form-control rounded-3" type="text" maxlength="80" value="${editing ? esc(editing.name) : ""}" required />
              </div>
              <div class="mb-3">
                <label class="form-label small fw-semibold" for="user-username">Username</label>
                <input id="user-username" class="form-control rounded-3" type="text" maxlength="40" autocomplete="off" autocapitalize="none" spellcheck="false" value="${editing ? esc(editing.username) : ""}" required />
                <div class="form-text">3&ndash;40 karakter: huruf kecil, angka, titik, garis bawah, atau strip. Untuk peserta magang gunakan nama depan, contoh <code>nayla</code>.</div>
              </div>
              <div class="mb-3">
                <label class="form-label small fw-semibold" for="user-password">Password ${editing ? "(kosongkan jika tidak diubah)" : ""}</label>
                <input id="user-password" class="form-control rounded-3" type="password" autocomplete="new-password" ${editing ? "" : "required"} />
                <div class="form-text">Minimal 6 karakter. Pola akun peserta: nama depan + <code>123</code>, contoh <code>nayla123</code>.</div>
                ${editing ? '<div class="form-text">Terakhir diubah: ' + esc(formatDateTime(editing.password_updated_at)) + "</div>" : ""}
              </div>
              <div class="row g-2">
                <div class="col-6">
                  <label class="form-label small fw-semibold" for="user-role">Role</label>
                  <select id="user-role" class="form-select rounded-3">
                    <option value="intern"${editingRole === "intern" ? " selected" : ""}>Intern</option>
                    <option value="admin"${editingRole === "admin" ? " selected" : ""}>Admin</option>
                  </select>
                </div>
                <div class="col-6 d-flex align-items-end">
                  <div class="form-check mb-2">
                    <input id="user-active" class="form-check-input" type="checkbox" ${editingActive ? "checked" : ""} />
                    <label class="form-check-label small fw-semibold" for="user-active">Aktif</label>
                  </div>
                </div>
              </div>
              <div class="d-flex gap-2 mt-3">
                <button class="btn btn-primary flex-fill rounded-3" id="user-submit" type="submit">${editing ? "Simpan perubahan" : "Tambah peserta"}</button>
                ${editing ? '<button class="btn btn-outline-secondary rounded-3" id="user-cancel" type="button">Batal</button>' : ""}
              </div>
            </form>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-7">
        <div class="card rounded-4 border-0 shadow-sm">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h2 class="h5 fw-bold mb-0">Daftar akun</h2>
              <span class="badge bg-light text-dark">${state.users.length} data</span>
            </div>
            <div class="table-responsive">
              <table class="table table-sm align-middle table-stack">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Akun</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>${renderUserTable()}</tbody>
              </table>
            </div>
            <div class="alert alert-light border small mt-3 mb-0">
              <div class="fw-semibold mb-1">Tentang penyimpanan password</div>
              Password disimpan sebagai hash bcrypt di kolom <code>users.password</code>. Hash tidak dapat dibaca kembali. Gunakan tombol <span class="fw-semibold">Reset password</span> untuk mengganti password peserta tanpa perlu melihat password lama.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAdminSettingsTab() {
  const settings = state.settings || {};
  return `
    <div class="row g-3">
      <div class="col-12 col-lg-6">
        <div class="card rounded-4 border-0 shadow-sm h-100">
          <div class="card-body">
            <h2 class="h5 fw-bold mb-3">Koneksi backend</h2>
            <table class="table table-sm align-middle mb-0">
              <tbody>
                <tr><th class="text-secondary fw-normal">Mode</th><td>Supabase</td></tr>
                <tr><th class="text-secondary fw-normal">Status</th><td>${state.syncError ? "Bermasalah" : "Terhubung"}</td></tr>
                <tr><th class="text-secondary fw-normal">Project</th><td class="text-break-anywhere">${esc(projectHost())}</td></tr>
                <tr><th class="text-secondary fw-normal">Storage foto</th><td><code>${esc(PHOTO_BUCKET)}</code></td></tr>
                <tr><th class="text-secondary fw-normal">Jumlah akun</th><td>${state.users.length}</td></tr>
                <tr><th class="text-secondary fw-normal">Jumlah absensi</th><td>${state.attendance.length}</td></tr>
                <tr><th class="text-secondary fw-normal">Waktu server</th><td>${esc(state.lastSyncAt || "-")}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-6">
        <div class="card rounded-4 border-0 shadow-sm h-100">
          <div class="card-body">
            <h2 class="h5 fw-bold mb-3">Pengaturan absensi</h2>
            <form id="settings-form" novalidate>
              <div class="mb-3">
                <label class="form-label small fw-semibold" for="settings-app-name">Nama aplikasi</label>
                <input id="settings-app-name" class="form-control rounded-3" type="text" maxlength="80" value="${esc(settings.app_name || APP_NAME)}" required />
              </div>
              <div class="row g-2">
                <div class="col-12 col-sm-6">
                  <label class="form-label small fw-semibold" for="settings-late-limit">Batas absen masuk</label>
                  <input id="settings-late-limit" class="form-control rounded-3" type="time" value="${esc(settings.late_limit || "08:15")}" required />
                  <div class="form-text">Absen setelah jam ini ditandai telat.</div>
                </div>
                <div class="col-12 col-sm-6">
                  <label class="form-label small fw-semibold" for="settings-checkout-limit">Jam mulai absen pulang</label>
                  <input id="settings-checkout-limit" class="form-control rounded-3" type="time" value="${esc(settings.checkout_limit || "17:00")}" required />
                  <div class="form-text">Tombol pulang baru aktif pada atau setelah jam ini.</div>
                </div>
                <div class="col-12 col-sm-6">
                  <label class="form-label small fw-semibold" for="settings-timezone">Zona waktu</label>
                  <input id="settings-timezone" class="form-control rounded-3" type="text" value="${esc(settings.timezone || "Asia/Jakarta")}" placeholder="Asia/Jakarta" required />
                  <div class="form-text">Contoh: Asia/Jakarta, Asia/Makassar.</div>
                </div>
              </div>
              <div class="mb-3 mt-3">
                <label class="form-label small fw-semibold" for="settings-office-name">Nama kantor</label>
                <input id="settings-office-name" class="form-control rounded-3" type="text" maxlength="80" value="${esc(settings.office_name || "")}" placeholder="Telkom Akses" />
              </div>
              <div class="row g-2">
                <div class="col-12 col-sm-6">
                  <label class="form-label small fw-semibold" for="settings-office-lat">Latitude kantor</label>
                  <input id="settings-office-lat" class="form-control rounded-3" type="text" inputmode="decimal" value="${esc(settings.office_lat || "")}" placeholder="-6.200000" />
                </div>
                <div class="col-12 col-sm-6">
                  <label class="form-label small fw-semibold" for="settings-office-lng">Longitude kantor</label>
                  <input id="settings-office-lng" class="form-control rounded-3" type="text" inputmode="decimal" value="${esc(settings.office_lng || "")}" placeholder="106.816666" />
                </div>
              </div>
              <div class="mb-1 mt-3">
                <label class="form-label small fw-semibold" for="settings-max-radius">Radius absensi (meter)</label>
                <input id="settings-max-radius" class="form-control rounded-3" type="number" min="0" step="1" value="${esc(settings.max_radius_m || "")}" placeholder="200" />
              </div>
              <button class="btn btn-primary rounded-3 w-100 mt-3" id="settings-submit" type="submit">Simpan pengaturan</button>
            </form>
          </div>
        </div>
      </div>
    </div>
    <div class="card rounded-4 border-0 shadow-sm mt-3">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
          <div>
            <h2 class="h5 fw-bold mb-1">Export Excel</h2>
            <p class="small text-secondary mb-0">Membuat file <code>.xlsx</code> berisi akun, absensi, pengaturan, dan log.</p>
          </div>
          <button class="btn btn-primary rounded-pill px-4" id="settings-export-btn" type="button">Export Excel</button>
        </div>
      </div>
    </div>
    <div class="card rounded-4 border-0 shadow-sm mt-3">
      <div class="card-body">
        <h2 class="h5 fw-bold mb-2">Catatan penyimpanan</h2>
        <ul class="small text-secondary mb-0 ps-3">
          <li class="mb-1">Akun login dikelola langsung di tabel <code>users</code> dengan username dan password.</li>
          <li class="mb-1">Data akun, absensi, pengaturan, dan log disimpan di PostgreSQL Supabase.</li>
          <li class="mb-1">Foto absen masuk/pulang disimpan di bucket <code>${esc(PHOTO_BUCKET)}</code>.</li>
          <li>Password di-hash bcrypt di kolom <code>users.password</code>. Tabel juga menyimpan <code>password_updated_at</code> dan <code>last_login_at</code>.</li>
        </ul>
      </div>
    </div>
  `;
}

export function attachAdminEvents(context) {
  const rerender = context.rerender;
  const refresh = context.refresh;

  if (state.ui.tab === "attendance") {
    const search = document.getElementById("attendance-search");
    if (search) {
      search.addEventListener("input", () => {
        state.ui.search = search.value;
        refreshAttendanceTable();
      });
    }
    const date = document.getElementById("attendance-date");
    if (date) {
      date.addEventListener("change", () => {
        state.ui.date = date.value;
        refreshAttendanceTable();
      });
    }
    const status = document.getElementById("attendance-status");
    if (status) {
      status.addEventListener("change", () => {
        state.ui.status = status.value;
        refreshAttendanceTable();
      });
    }
    const reset = document.getElementById("attendance-reset");
    if (reset) {
      reset.addEventListener("click", () => {
        state.ui.search = "";
        state.ui.date = "";
        state.ui.status = "";
        rerender();
      });
    }
    document.querySelectorAll('[data-action="delete-attendance"]').forEach((button) => {
      button.addEventListener("click", () => handleDeleteAttendance(button.dataset.attendanceId, refresh));
    });
    document.querySelectorAll('[data-action="edit-attendance"]').forEach((button) => {
      button.addEventListener("click", () =>
        handleEditAttendance(button.dataset.attendanceId, button, refresh)
      );
    });
  }

  if (state.ui.tab === "users") {
    const form = document.getElementById("user-form");
    if (form) form.addEventListener("submit", (event) => handleUserFormSubmit(event, refresh));
    const cancel = document.getElementById("user-cancel");
    if (cancel) {
      cancel.addEventListener("click", () => {
        state.ui.userFormId = "";
        rerender();
      });
    }
    document.querySelectorAll('[data-action="edit-user"]').forEach((button) => {
      button.addEventListener("click", () => {
        state.ui.userFormId = button.dataset.userId;
        rerender();
      });
    });
    document.querySelectorAll('[data-action="reset-password"]').forEach((button) => {
      button.addEventListener("click", () => handleResetPassword(button.dataset.userId, refresh));
    });
    document.querySelectorAll('[data-action="delete-user"]').forEach((button) => {
      button.addEventListener("click", () => handleDeleteUser(button.dataset.userId, refresh));
    });
    document.querySelectorAll('[data-action="delete-user-attendance"]').forEach((button) => {
      button.addEventListener("click", () =>
        handleDeleteUserAttendance(button.dataset.userId, refresh)
      );
    });
  }

  if (state.ui.tab === "settings") {
    const form = document.getElementById("settings-form");
    if (form) form.addEventListener("submit", (event) => handleSettingsSubmit(event, refresh));
    const exportBtn = document.getElementById("settings-export-btn");
    if (exportBtn) exportBtn.addEventListener("click", () => exportData(exportBtn));
  }
}

async function handleSettingsSubmit(event, refresh) {
  event.preventDefault();
  const appName = document.getElementById("settings-app-name").value.trim();
  const lateLimit = document.getElementById("settings-late-limit").value.trim();
  const checkoutLimit = document.getElementById("settings-checkout-limit").value.trim();
  const timezone = document.getElementById("settings-timezone").value.trim();
  const officeName = document.getElementById("settings-office-name").value.trim();
  const officeLat = document.getElementById("settings-office-lat").value.trim();
  const officeLng = document.getElementById("settings-office-lng").value.trim();
  const maxRadius = document.getElementById("settings-max-radius").value.trim();

  if (!appName) {
    toast("Nama aplikasi wajib diisi.", "danger");
    return;
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(lateLimit)) {
    toast("Batas absen masuk harus berformat HH:MM.", "danger");
    return;
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(checkoutLimit)) {
    toast("Jam mulai absen pulang harus berformat HH:MM.", "danger");
    return;
  }
  if (!/^[A-Za-z_]+(\/[A-Za-z_+-]+)+$/.test(timezone)) {
    toast("Zona waktu harus berformat Area/Kota, contoh Asia/Jakarta.", "danger");
    return;
  }
  if (Boolean(officeLat) !== Boolean(officeLng)) {
    toast("Latitude dan longitude kantor harus diisi berpasangan.", "danger");
    return;
  }
  if (officeLat || officeLng) {
    const lat = Number(officeLat);
    const lng = Number(officeLng);
    if (!isFinite(lat) || lat < -90 || lat > 90) {
      toast("Latitude harus angka antara -90 dan 90.", "danger");
      return;
    }
    if (!isFinite(lng) || lng < -180 || lng > 180) {
      toast("Longitude harus angka antara -180 dan 180.", "danger");
      return;
    }
  }
  if (maxRadius) {
    const radius = Number(maxRadius);
    if (!isFinite(radius) || radius < 0) {
      toast("Radius absensi harus angka 0 atau lebih.", "danger");
      return;
    }
    if (radius > 0 && !officeLat) {
      toast("Isi latitude dan longitude kantor jika radius absensi lebih dari 0.", "danger");
      return;
    }
  }
  if ((officeLat || officeLng) && (!maxRadius || Number(maxRadius) <= 0)) {
    toast("Isi radius absensi lebih dari 0 jika koordinat kantor diatur.", "danger");
    return;
  }

  const button = document.getElementById("settings-submit");
  const restore = withBusy(button, "Menyimpan...");
  try {
    const result = await rpc("app_save_settings", {
      p_settings: {
        app_name: appName,
        late_limit: lateLimit,
        checkout_limit: checkoutLimit,
        office_name: officeName,
        office_lat: officeLat,
        office_lng: officeLng,
        max_radius_m: maxRadius,
        timezone
      }
    });
    const savedSettings = result.settings || {};
    state.settings = savedSettings;
    await refresh({ silent: true, force: true });
    if (savedSettings.checkout_limit !== checkoutLimit) {
      toast(
        "Pengaturan jam pulang tidak tersimpan. Jalankan npm run migrate untuk memperbarui database.",
        "danger"
      );
      return;
    }
    toast(result.message || "Pengaturan berhasil disimpan.", "success");
  } catch (error) {
    handleError(error);
  } finally {
    restore();
  }
}

async function handleUserFormSubmit(event, refresh) {
  event.preventDefault();
  const id = document.getElementById("user-id").value.trim();
  const name = document.getElementById("user-name").value.trim();
  const username = document.getElementById("user-username").value.trim().toLowerCase();
  const password = document.getElementById("user-password").value;
  const role = document.getElementById("user-role").value;
  const active = document.getElementById("user-active").checked;

  if (!name) {
    toast("Nama wajib diisi.", "danger");
    return;
  }
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    toast("Username 3-40 karakter: huruf kecil, angka, titik, garis bawah, atau strip.", "danger");
    return;
  }
  if (!id && password.length < 6) {
    toast("Password minimal 6 karakter untuk akun baru.", "danger");
    return;
  }
  if (id && password && password.length < 6) {
    toast("Password minimal 6 karakter.", "danger");
    return;
  }

  const button = document.getElementById("user-submit");
  const restore = withBusy(button, "Menyimpan...");
  try {
    if (id) {
      await rpc("admin_update_user", {
        p_id: id,
        p_username: username,
        p_name: name,
        p_role: role,
        p_active: active,
        p_password: password || ""
      });
    } else {
      await rpc("admin_create_user", {
        p_username: username,
        p_name: name,
        p_password: password,
        p_role: role,
        p_active: active
      });
    }
    state.ui.userFormId = "";
    toast(id ? "Akun berhasil diperbarui." : "Akun berhasil ditambahkan.", "success");
    await refresh({ silent: true, force: true });
  } catch (error) {
    handleError(error);
  } finally {
    restore();
  }
}

async function handleResetPassword(userId, refresh) {
  const user = state.users.find((item) => String(item.id) === String(userId));
  if (!user) return;

  const password = await passwordDialog({
    title: "Reset password",
    description:
      "Password baru untuk " +
      user.name +
      " (" +
      user.username +
      "). Minimal 6 karakter. Pola yang disarankan: " +
      user.username +
      "123.",
    initialValue: user.username + "123"
  });
  if (!password) return;

  try {
    const result = await rpc("admin_reset_password", { p_id: userId, p_password: password });
    toast((result && result.message) || "Password berhasil direset.", "success");
    await refresh({ silent: true, force: true });
  } catch (error) {
    handleError(error);
  }
}

async function handleDeleteUser(userId, refresh) {
  const user = state.users.find((item) => String(item.id) === String(userId));
  if (!user) return;
  const confirmed = await confirmDialog({
    title: "Hapus akun",
    message: "Hapus akun " + user.name + " (" + user.username + ") beserta seluruh data absensinya?",
    confirmLabel: "Hapus akun",
    tone: "danger"
  });
  if (!confirmed) return;

  try {
    const result = await rpc("admin_delete_user", { p_id: userId });
    await removePhotos(result.photo_urls);
    toast(result.message || "Akun berhasil dihapus.", "success");
    await refresh({ silent: true, force: true });
  } catch (error) {
    handleError(error);
  }
}

async function handleDeleteUserAttendance(userId, refresh) {
  const user = state.users.find((item) => String(item.id) === String(userId));
  if (!user) return;
  const count = state.attendance.filter((row) => String(row.user_id) === String(userId)).length;
  if (!count) {
    toast(user.name + " belum memiliki data absensi.", "info");
    return;
  }
  const confirmed = await confirmDialog({
    title: "Hapus data absensi",
    message:
      "Hapus seluruh " + count + " data absensi milik " + user.name + "? Akun peserta tetap ada.",
    confirmLabel: "Hapus absensi",
    tone: "warning"
  });
  if (!confirmed) return;

  try {
    const result = await rpc("admin_delete_user_attendance", { p_user_id: userId });
    await removePhotos(result.photo_urls);
    toast(result.message || "Seluruh data absensi peserta berhasil dihapus.", "success");
    await refresh({ silent: true, force: true });
  } catch (error) {
    handleError(error);
  }
}

async function handleEditAttendance(attendanceId, button, refresh) {
  const record = state.attendance.find((item) => String(item.id) === String(attendanceId));
  if (!record) {
    toast("Data absensi tidak ditemukan. Muat ulang data lalu coba lagi.", "danger");
    return;
  }

  const edited = await attendanceEditDialog(record);
  if (!edited) return;

  const restore = withBusy(button, "Menyimpan...");
  try {
    const result = await rpc("admin_update_attendance", {
      p_id: attendanceId,
      p_check_in: edited.checkIn,
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
    tone: "danger"
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
