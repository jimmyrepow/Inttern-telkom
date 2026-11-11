import { state } from "../../core/store.js";
import { rpc, handleError, projectHost } from "../../core/api.js";
import { APP_NAME, PHOTO_BUCKET } from "../../core/config.js";
import { esc, toast, withBusy, confirmDialog } from "../../lib/dom.js";
import { exportData } from "../../services/export.js";

export function renderAdminSettingsTab() {
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
              <div class="row g-2 mt-3">
                <div class="col-12 col-sm-6">
                  <label class="form-label small fw-semibold" for="settings-max-radius">Radius absensi (meter)</label>
                  <input id="settings-max-radius" class="form-control rounded-3" type="number" min="0" step="1" value="${esc(settings.max_radius_m || "")}" placeholder="200" />
                  <div class="form-text">0 = geofence nonaktif. Isi koordinat kantor agar aktif.</div>
                </div>
                <div class="col-12 col-sm-6">
                  <label class="form-label small fw-semibold" for="settings-max-accuracy">Akurasi GPS maksimal (meter)</label>
                  <input id="settings-max-accuracy" class="form-control rounded-3" type="number" min="1" step="1" value="${esc(settings.max_accuracy_m || "100")}" placeholder="100" />
                  <div class="form-text">Absensi ditolak jika akurasi GPS lebih buruk dari nilai ini.</div>
                </div>
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
            <p class="small text-secondary mb-0">Membuat file <code>.xlsx</code> berisi akun, absensi, pengaturan, dan log. Foto absensi ikut ditanamkan ke dalam worksheet.</p>
          </div>
          <button class="btn btn-primary rounded-pill px-4" id="settings-export-btn" type="button">Export Excel</button>
        </div>
        <div class="small text-secondary mt-2" id="settings-export-status" role="status" aria-live="polite"></div>
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

export function attachAdminSettings(context) {
  const refresh = context.refresh;
  const form = document.getElementById("settings-form");
  if (form) form.addEventListener("submit", (event) => handleSettingsSubmit(event, refresh));
  const exportBtn = document.getElementById("settings-export-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () =>
      exportData(exportBtn, document.getElementById("settings-export-status"))
    );
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
  const maxAccuracy = document.getElementById("settings-max-accuracy").value.trim();

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
  if (maxAccuracy) {
    const accuracy = Number(maxAccuracy);
    if (!isFinite(accuracy) || accuracy < 1) {
      toast("Akurasi GPS maksimal harus angka 1 atau lebih.", "danger");
      return;
    }
  }
  if ((officeLat || officeLng) && (!maxRadius || Number(maxRadius) <= 0)) {
    toast("Isi radius absensi lebih dari 0 jika koordinat kantor diatur.", "danger");
    return;
  }

  const confirmed = await confirmDialog({
    title: "Simpan pengaturan?",
    message:
      "Batas masuk " +
      lateLimit +
      ", jam pulang " +
      checkoutLimit +
      ", dan zona waktu " +
      timezone +
      " akan langsung dipakai oleh seluruh pengguna.",
    confirmLabel: "Simpan pengaturan",
    tone: "primary",
    secondMessage:
      "Periksa kembali koordinat, radius, dan batas akurasi GPS. Absensi di luar radius atau dengan akurasi buruk akan ditolak."
  });
  if (!confirmed) return;

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
        max_accuracy_m: maxAccuracy,
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
