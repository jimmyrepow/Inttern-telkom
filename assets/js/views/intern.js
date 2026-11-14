import { state } from "../core/store.js";
import { rpc, handleError, sb } from "../core/api.js";
import { PHOTO_BUCKET } from "../core/config.js";
import { esc, toast, withBusy, confirmDialog } from "../lib/dom.js";
import { getTodayDate, shortTime, statusBadge, formatMonth, isWorkdayDate } from "../lib/format.js";
import { statCard, renderPhoto } from "../lib/render.js";
import {
  renderSelfiePreview,
  startCamera,
  stopCamera,
  capturePhoto,
  handlePhotoUpload,
  updateSelfieUi,
  uploadPhoto
} from "../services/photo.js";
import {
  renderLocationDisplay,
  requestLocation,
  ensureLocation,
  isLocationReady
} from "../services/location.js";
import { renderGuide } from "./guide.js";
import { applyFarmState } from "./farm.js";
import { getGeofence, geofenceReason, formatDistance } from "../services/geofence.js";
import {
  enqueueAttendance,
  isNetworkError,
  queueSupported,
  blobToDataUrl
} from "../services/offline-queue.js";

function checkoutTimeReached(limit, timezone) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(limit)) return false;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date());
    const hour = parts.find((part) => part.type === "hour").value;
    const minute = parts.find((part) => part.type === "minute").value;
    return hour + ":" + minute >= limit;
  } catch (error) {
    return false;
  }
}

let attendanceSyncBound = false;

function photoReady() {
  return Boolean(state.selfieData && state.selfieBlob);
}

function geofenceAllowsAttendance() {
  return getGeofence().allowed;
}

function geofenceBlockedLabel() {
  const geo = getGeofence();
  if (!geo.radiusEnabled) return "";
  if (!geo.configured) return "Radius Belum Diatur";
  if (!geo.accuracyOk) return "Akurasi GPS Rendah";
  if (!geo.inside) return "Di Luar Radius";
  return "";
}

function attendanceSnapshot() {
  const today = getTodayDate();
  const settings = state.settings || {};
  const existing =
    state.attendance.find(
      (row) =>
        String(row.user_id) === String(state.user && state.user.id) &&
        String(row.date) === today
    ) || null;
  const checkoutSettingReady = /^([01]\d|2[0-3]):[0-5]\d$/.test(
    settings.checkout_limit || ""
  );
  const checkoutLimit = checkoutSettingReady ? settings.checkout_limit : "17:00";
  const timezone = settings.timezone || "Asia/Jakarta";

  return {
    today,
    isWorkday: isWorkdayDate(today),
    existing,
    hasIn: Boolean(existing && existing.check_in),
    hasOut: Boolean(existing && existing.check_out),
    lateLimit: settings.late_limit || "08:15",
    checkoutSettingReady,
    checkoutLimit,
    timezone,
    checkoutReady:
      checkoutSettingReady && checkoutTimeReached(checkoutLimit, timezone)
  };
}

function attendanceHint(snapshot) {
  if (!snapshot.isWorkday) {
    return {
      text: "Hari ini akhir pekan. Absensi hanya tersedia Senin-Jumat.",
      tone: "muted"
    };
  }
  if (snapshot.hasOut) {
    return { text: "Absensi hari ini sudah lengkap. Terima kasih.", tone: "success" };
  }
  if (!isLocationReady() && !photoReady()) {
    const locationText =
      state.locationStatus === "error"
        ? "Lokasi GPS gagal dideteksi."
        : state.locationStatus === "loading"
          ? "Lokasi GPS sedang dideteksi otomatis."
          : "Lokasi GPS belum aktif.";
    return {
      text: locationText + " Ambil foto juga agar tombol absen aktif.",
      tone: state.locationStatus === "error" ? "danger" : "muted"
    };
  }
  if (!isLocationReady()) {
    if (state.locationStatus === "error") {
      return {
        text: "Lokasi GPS gagal dideteksi. Tekan Coba Lagi pada panel lokasi.",
        tone: "danger"
      };
    }
    if (state.locationStatus === "loading") {
      return { text: "Sedang mendeteksi lokasi GPS otomatis...", tone: "muted" };
    }
    return { text: "Menunggu lokasi GPS terdeteksi otomatis...", tone: "muted" };
  }
  const geofenceMessage = geofenceReason(getGeofence());
  if (geofenceMessage) {
    return { text: geofenceMessage, tone: "danger" };
  }
  if (!photoReady()) {
    return {
      text: "Lokasi siap. Ambil foto terlebih dahulu untuk mengaktifkan tombol absen.",
      tone: "warning"
    };
  }
  if (!snapshot.hasIn) {
    return {
      text: "Lokasi dan foto siap. Tombol absen masuk sudah aktif.",
      tone: "success"
    };
  }
  if (!snapshot.checkoutSettingReady) {
    return {
      text: "Lokasi dan foto siap. Pengaturan jam pulang belum tersedia; hubungi admin.",
      tone: "warning"
    };
  }
  if (!snapshot.checkoutReady) {
    return {
      text:
        "Lokasi dan foto siap. Absen pulang aktif pukul " +
        snapshot.checkoutLimit +
        " (" +
        snapshot.timezone +
        ").",
      tone: "muted"
    };
  }
  return {
    text: "Lokasi dan foto siap. Tombol absen pulang sudah aktif.",
    tone: "success"
  };
}

function checkInLabel(snapshot) {
  if (!snapshot.isWorkday) return "Akhir Pekan";
  if (snapshot.hasIn) return "Sudah Absen Masuk";
  if (state.attendanceSubmitting) return "Menyimpan...";
  if (!isLocationReady()) {
    return state.locationStatus === "loading" ? "Mendeteksi GPS..." : "Menunggu GPS";
  }
  const blockedLabel = geofenceBlockedLabel();
  if (blockedLabel) return blockedLabel;
  if (!photoReady()) return "Ambil Foto Dulu";
  return "Absen Masuk";
}

function checkOutLabel(snapshot) {
  if (!snapshot.isWorkday) return "Akhir Pekan";
  if (snapshot.hasOut) return "Sudah Absen Pulang";
  if (state.attendanceSubmitting) return "Menyimpan...";
  if (!snapshot.hasIn) return "Absen Pulang";
  if (!snapshot.checkoutSettingReady) return "Absen Pulang belum dikonfigurasi";
  if (!snapshot.checkoutReady) {
    return "Absen Pulang (aktif pukul " + snapshot.checkoutLimit + ")";
  }
  if (!isLocationReady()) {
    return state.locationStatus === "loading" ? "Mendeteksi GPS..." : "Menunggu GPS";
  }
  const blockedLabel = geofenceBlockedLabel();
  if (blockedLabel) return blockedLabel;
  if (!photoReady()) return "Ambil Foto Dulu";
  return "Absen Pulang";
}

function renderAttendanceHint(snapshot) {
  const hint = attendanceHint(snapshot);
  return (
    '<div id="attendance-ready-hint" class="attendance-ready-hint is-' +
    hint.tone +
    '" aria-live="polite">' +
    esc(hint.text) +
    "</div>"
  );
}

function updateAttendanceAvailability() {
  const snapshot = attendanceSnapshot();
  const checkInButton = document.getElementById("check-in-btn");
  const checkOutButton = document.getElementById("check-out-btn");
  if (!checkInButton && !checkOutButton) return;

  if (checkInButton) {
    checkInButton.disabled =
      !snapshot.isWorkday ||
      snapshot.hasIn ||
      !geofenceAllowsAttendance() ||
      !photoReady() ||
      state.attendanceSubmitting;
    checkInButton.textContent = checkInLabel(snapshot);
  }
  if (checkOutButton) {
    checkOutButton.disabled =
      !snapshot.isWorkday ||
      snapshot.hasOut ||
      !snapshot.hasIn ||
      !snapshot.checkoutReady ||
      !geofenceAllowsAttendance() ||
      !photoReady() ||
      state.attendanceSubmitting;
    checkOutButton.textContent = checkOutLabel(snapshot);
  }

  const hint = document.getElementById("attendance-ready-hint");
  if (hint) {
    const next = attendanceHint(snapshot);
    hint.className = "attendance-ready-hint is-" + next.tone;
    hint.textContent = next.text;
  }
}

function bindAttendanceSync() {
  if (attendanceSyncBound) return;
  document.addEventListener("selfie:changed", updateAttendanceAvailability);
  document.addEventListener("location:changed", updateAttendanceAvailability);
  attendanceSyncBound = true;
}

export function renderIntern() {
  if (state.ui.tab === "guide") return renderGuide("intern");

  const history = state.attendance
    .filter((row) => String(row.user_id) === String(state.user.id))
    .sort((a, b) =>
      (String(b.date) + " " + String(b.check_in || "")).localeCompare(
        String(a.date) + " " + String(a.check_in || "")
      )
    );

  if (state.ui.tab === "riwayat") return renderHistoryView(history);
  return renderAbsenView(history);
}

function farmReminderData() {
  const userId = state.user && state.user.id;
  if (!state.farmProfile || state.farmLoadedFor !== userId) return null;
  const profile = state.farmProfile;
  const plots = (Array.isArray(state.farmPlots) ? state.farmPlots : []).filter((plot) => !plot.locked);
  return {
    level: Number(profile.level) || 1,
    water: Number(profile.water) || 0,
    fertilizer: Number(profile.fertilizer) || 0,
    empty: plots.filter((plot) => !plot.seed_code).length,
    ready: plots.filter((plot) => plot.status === "ready").length,
    withered: plots.filter((plot) => plot.status === "withered" || plot.status === "dead").length,
    stealRemaining: Number(profile.steal_remaining) || 0,
    stealsUnlocked: Boolean(profile.steal_unlocked) || Number(profile.level) >= 3
  };
}

function renderFarmReminder() {
  const info = farmReminderData();
  const note = !info
    ? "Buka menu Kebun untuk melihat status plot, stok air/pupuk, dan tanaman yang siap panen."
    : info.ready > 0
      ? "Ada panen siap. Panen sekarang agar tidak layu."
      : info.withered > 0
        ? "Ada tanaman layu atau kering. Bersihkan lalu tanam ulang."
        : info.empty > 0
          ? "Masih ada plot kosong. Tanam bibit baru agar kebun tetap produktif."
          : "Rawat tanaman yang sedang tumbuh agar panen tepat waktu.";

  return `
    <div class="card rounded-4 border-0 shadow-sm farm-reminder-card">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex align-items-start gap-3">
          <div class="farm-reminder-icon"><i class="bi bi-flower1" aria-hidden="true"></i></div>
          <div class="flex-grow-1 min-w-0">
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
              <div>
                <h2 class="h6 fw-bold mb-1">Jangan lupa rawat kebun</h2>
                <div class="small text-secondary">Absen masuk menambah air, absen pulang menambah pupuk. Sisihkan waktu untuk menanam dan merawat tanaman hari ini.</div>
              </div>
              <button class="btn btn-sm btn-success rounded-pill" type="button" data-nav="farm"><i class="bi bi-flower1 me-1"></i>Buka Kebun</button>
            </div>
            <div class="farm-reminder-tasks">
              <span><i class="bi bi-seedling" aria-hidden="true"></i>Tanam bibit di plot kosong</span>
              <span><i class="bi bi-droplet" aria-hidden="true"></i>Siram tanaman dengan air</span>
              <span><i class="bi bi-basket" aria-hidden="true"></i>Beri pupuk: hasil +20%</span>
              <span><i class="bi bi-basket-fill" aria-hidden="true"></i>Panen tanaman yang siap</span>
              <span><i class="bi bi-incognito" aria-hidden="true"></i>Curi panen mulai Lv. 3</span>
            </div>
            ${info ? `
              <div class="farm-reminder-chips">
                <span><i class="bi bi-droplet-fill" aria-hidden="true"></i><strong>${info.water}</strong> air</span>
                <span><i class="bi bi-basket-fill" aria-hidden="true"></i><strong>${info.fertilizer}</strong> pupuk</span>
                <span><i class="bi bi-grid-3x3-gap" aria-hidden="true"></i><strong>${info.empty}</strong> plot kosong</span>
                <span><i class="bi bi-basket" aria-hidden="true"></i><strong>${info.ready}</strong> siap panen</span>
                ${info.stealsUnlocked ? `<span><i class="bi bi-incognito" aria-hidden="true"></i><strong>${info.stealRemaining}</strong> curi tersisa</span>` : ""}
              </div>
            ` : ""}
            <div class="small text-secondary mt-2">${esc(note)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function ensureFarmReminder() {
  const userId = state.user && state.user.id;
  if (!userId) return;
  if (state.farmLoadedFor === userId || state.farmReminderTriedFor === userId) return;
  state.farmReminderTriedFor = userId;
  rpc("app_farm_state")
    .then((result) => {
      applyFarmState(result);
      const box = document.getElementById("farm-reminder");
      if (box) box.innerHTML = renderFarmReminder();
    })
    .catch((error) => {
      if (isSessionExpired(error && error.message)) handleError(error);
    });
}

function renderAbsenView(history) {
  const snapshot = attendanceSnapshot();
  const today = snapshot.today;
  const isWorkday = snapshot.isWorkday;
  const todayRow = snapshot.existing;
  const hasIn = snapshot.hasIn;
  const hasOut = snapshot.hasOut;
  const lateLimit = snapshot.lateLimit;
  const timezone = snapshot.timezone;
  const recent = history.slice(0, 6);
  const locationLabel =
    state.locationStatus === "loading"
      ? "Mendeteksi"
      : state.locationStatus === "error"
        ? "Gagal"
        : isLocationReady()
          ? !getGeofence().radiusEnabled
            ? "Aktif"
            : !getGeofence().configured
              ? "Belum diatur"
              : !getGeofence().inside
                ? "Di luar"
                : !getGeofence().accuracyOk
                  ? "Akurasi"
                  : "Aktif"
          : "Belum";
  const locationButtonLabel =
    state.locationStatus === "loading"
      ? "Mendeteksi..."
      : state.locationStatus === "error"
        ? "Coba Lagi"
        : state.currentLocation
          ? "Perbarui GPS"
          : "Ambil GPS";

  return `
    <div class="stats-grid mb-4">
      ${statCard("Status hari ini", !isWorkday ? "Libur" : hasIn ? (hasOut ? "Selesai" : "Sudah masuk") : "Belum absen", today)}
      ${statCard("Keterlambatan", !isWorkday ? "Libur" : todayRow ? (todayRow.status === "late" ? "Telat" : "Tepat waktu") : "-")}
      ${statCard("GPS", locationLabel, "", "gps-stat")}
      ${statCard("Selfie", photoReady() ? "Siap" : "Kosong", "", "selfie-stat")}
    </div>
    <div class="row g-3">
      <div class="col-12 col-xl-7" id="absen-card">
        <div class="card rounded-4 border-0 shadow-sm h-100">
          <div class="card-body p-3 p-md-4">
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
              <div>
                <h2 class="h5 fw-bold mb-1">Absen hari ini</h2>
                <div class="small text-secondary">Batas absen masuk <span class="fw-semibold text-dark">${esc(lateLimit)}</span> &middot; Zona waktu <span class="fw-semibold text-dark">${esc(timezone)}</span></div>
              </div>
              <span class="badge badge-soft rounded-pill px-3 py-2">${esc(today)}</span>
            </div>
            ${hasIn && hasOut ? '<div class="alert alert-success small">Absensi hari ini sudah lengkap. Terima kasih.</div>' : ""}
            ${!isWorkday ? '<div class="alert alert-warning small">Hari ini akhir pekan. Absensi hanya tersedia Senin-Jumat.</div>' : ""}
            <div class="location-box mb-3">
              <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
                <strong class="small">Lokasi GPS</strong>
                <button class="btn btn-sm btn-outline-primary rounded-pill" id="location-btn" type="button" ${state.locationStatus === "loading" ? "disabled" : ""}>${esc(locationButtonLabel)}</button>
              </div>
              <div id="location-display" class="small text-secondary">${renderLocationDisplay()}</div>
            </div>
            <div class="selfie-preview" id="selfie-preview-box">${renderSelfiePreview()}</div>
            <video id="selfie-video" autoplay playsinline muted class="d-none w-100 rounded-4 mt-2"></video>
            <div class="d-flex flex-wrap gap-2 mt-2">
              <label class="btn btn-primary rounded-pill mb-0" for="photo-input">Kamera Perangkat</label>
              <button class="btn btn-outline-primary rounded-pill" id="camera-btn" type="button">Kamera Browser</button>
              <button class="btn btn-outline-dark rounded-pill d-none" id="capture-btn" type="button">Ambil Foto</button>
              <label class="btn btn-outline-dark rounded-pill mb-0" for="photo-input">Upload Foto</label>
              <input id="photo-input" type="file" accept="image/*" capture="user" class="d-none" />
              <button class="btn btn-outline-danger rounded-pill ${state.selfieData ? "" : "d-none"}" id="clear-photo-btn" type="button">Hapus Foto</button>
            </div>
            <div class="small text-secondary mt-2">Jika izin kamera tidak muncul, gunakan <span class="fw-semibold">Kamera Perangkat</span> atau izinkan kamera lewat ikon gembok di address bar.</div>
            <div class="mt-3">
              <label class="form-label small fw-semibold" for="attendance-note">Catatan (opsional)</label>
              <textarea id="attendance-note" class="form-control rounded-3" rows="2" maxlength="500" placeholder="Contoh: WFO / izin / keterangan tambahan">${esc(state.note)}</textarea>
            </div>
            <div class="d-flex flex-wrap gap-2 mt-3">
              <button class="btn btn-primary flex-fill rounded-3" id="check-in-btn" type="button" aria-describedby="attendance-ready-hint" ${!isWorkday || hasIn || !geofenceAllowsAttendance() || !photoReady() || state.attendanceSubmitting ? "disabled" : ""}>${esc(checkInLabel(snapshot))}</button>
              <button class="btn btn-danger flex-fill rounded-3" id="check-out-btn" type="button" aria-describedby="attendance-ready-hint" ${!isWorkday || hasOut || !hasIn || !snapshot.checkoutReady || !geofenceAllowsAttendance() || !photoReady() || state.attendanceSubmitting ? "disabled" : ""}>${esc(checkOutLabel(snapshot))}</button>
            </div>
            ${renderAttendanceHint(snapshot)}
            ${todayRow ? '<div class="small text-secondary mt-3">Absen hari ini: masuk ' + esc(shortTime(todayRow.check_in)) + " &middot; pulang " + esc(shortTime(todayRow.check_out)) + " &middot; " + statusBadge(todayRow.status, hasIn) + "</div>" : ""}
          </div>
        </div>
      </div>
      <div class="col-12 col-xl-5" id="riwayat-card">
        <div class="d-flex flex-column gap-3 h-100">
          <div id="farm-reminder">${renderFarmReminder()}</div>
          <div class="card rounded-4 border-0 shadow-sm flex-grow-1">
            <div class="card-body p-3 p-md-4">
              <div class="d-flex justify-content-between align-items-center gap-2 mb-3">
                <div>
                  <h2 class="h5 fw-bold mb-0">Riwayat terbaru</h2>
                  <div class="small text-secondary">${history.length} total absensi</div>
                </div>
                <button class="btn btn-sm btn-outline-primary rounded-pill" type="button" data-nav="riwayat">Lihat semua</button>
              </div>
              <div class="table-responsive">
                <table class="table table-sm align-middle table-stack mb-0">
                  <thead>
                    <tr>
                      <th>Tgl</th>
                      <th>Masuk</th>
                      <th>Pulang</th>
                      <th>Status</th>
                      <th>Foto</th>
                    </tr>
                  </thead>
                  <tbody>${renderInternHistory(recent)}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderHistoryView(history) {
  const attended = history.filter((row) => Boolean(row.check_in));
  const total = attended.length;
  const late = attended.filter((row) => row.status === "late").length;
  const onTime = attended.filter((row) => row.status !== "late").length;
  const last = attended[0];

  const currentMonth = getTodayDate().slice(0, 7);
  const selectedMonth = state.ui.historyMonth || "";
  const insightMonth = selectedMonth || currentMonth;
  const insightRows = attended.filter((row) => String(row.date).slice(0, 7) === insightMonth);
  const insightTotal = insightRows.length;
  const insightLate = insightRows.filter((row) => row.status === "late").length;
  const insightOnTime = insightTotal - insightLate;
  const punctuality = insightTotal ? Math.round((insightOnTime / insightTotal) * 100) : 0;
  const tableRows = selectedMonth
    ? history.filter((row) => String(row.date).slice(0, 7) === selectedMonth)
    : history.slice(0, 60);

  return `
    <div class="stats-grid mb-4">
      ${statCard("Total absensi", total, "Seluruh riwayat")}
      ${statCard("Tepat waktu", onTime)}
      ${statCard("Telat", late)}
      ${statCard("Absensi terakhir", last ? last.date : "-", last ? shortTime(last.check_in) : "Belum ada")}
    </div>

    <div class="card rounded-4 border-0 shadow-sm mb-4">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div>
            <h2 class="h5 fw-bold mb-1">Insight kehadiran</h2>
            <div class="small text-secondary">Ringkasan ${esc(formatMonth(insightMonth))}${selectedMonth ? "" : " (bulan ini)"}.</div>
          </div>
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <input id="history-month" class="form-control form-control-sm rounded-3" type="month" value="${esc(selectedMonth)}" max="${esc(currentMonth)}" aria-label="Filter bulan riwayat" style="max-width: 170px" />
            <button class="btn btn-sm btn-outline-primary rounded-pill" id="history-month-current" type="button">Bulan ini</button>
            <button class="btn btn-sm btn-outline-secondary rounded-pill" id="history-month-reset" type="button" ${selectedMonth ? "" : "disabled"}>Semua</button>
          </div>
        </div>
        <div class="row g-3 align-items-center">
          <div class="col-12 col-lg-5">
            <div class="d-flex justify-content-between align-items-center small mb-1">
              <span class="text-secondary">Tingkat tepat waktu</span>
              <strong>${punctuality}%</strong>
            </div>
            <div class="progress insight-progress" role="progressbar" aria-valuenow="${punctuality}" aria-valuemin="0" aria-valuemax="100" aria-label="Tingkat tepat waktu">
              <div class="progress-bar ${punctuality >= 80 ? "bg-success" : punctuality >= 50 ? "bg-warning" : "bg-danger"}" style="width:${punctuality}%"></div>
            </div>
            <div class="small text-secondary mt-1">${insightTotal ? insightOnTime + " dari " + insightTotal + " hari hadir tepat waktu" : "Belum ada data pada bulan ini"}</div>
          </div>
          <div class="col-12 col-lg-7">
            <div class="insight-chips">
              <span class="insight-chip"><i class="bi bi-calendar-check"></i><strong>${insightTotal}</strong> hari hadir</span>
              <span class="insight-chip is-success"><i class="bi bi-check2-circle"></i><strong>${insightOnTime}</strong> tepat waktu</span>
              <span class="insight-chip is-warning"><i class="bi bi-clock-history"></i><strong>${insightLate}</strong> telat</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card rounded-4 border-0 shadow-sm">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <h2 class="h5 fw-bold mb-1">Riwayat absensi</h2>
            <div class="small text-secondary">${tableRows.length} data${selectedMonth ? " pada " + esc(formatMonth(selectedMonth)) : ", terbaru di atas"}</div>
          </div>
          <button class="btn btn-primary btn-sm rounded-pill" type="button" data-nav="absen">Absen sekarang</button>
        </div>
        <div class="table-responsive">
          <table class="table table-sm align-middle table-stack">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Masuk</th>
                <th>Pulang</th>
                <th>Status</th>
                <th>Foto masuk</th>
                <th>Foto pulang</th>
              </tr>
            </thead>
            <tbody>${renderInternFullHistory(tableRows)}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderInternHistory(rows) {
  if (!rows.length) {
    return '<tr><td colspan="5" class="text-center text-secondary py-4">Belum ada riwayat absensi.</td></tr>';
  }
  return rows
    .map((row) => {
      const photos =
        renderPhoto(row.photo_url, "Foto masuk", row.date) +
        " " +
        renderPhoto(row.photo_out_url, "Foto pulang", row.date);
      return `
        <tr>
          <td class="text-nowrap" data-label="Tanggal">${esc(row.date)}</td>
          <td data-label="Masuk">${esc(shortTime(row.check_in))}</td>
          <td data-label="Pulang">${esc(shortTime(row.check_out))}</td>
          <td data-label="Status">${statusBadge(row.status, Boolean(row.check_in))}</td>
          <td class="text-nowrap" data-label="Foto">${photos}</td>
        </tr>
      `;
    })
    .join("");
}

function renderInternFullHistory(rows) {
  if (!rows.length) {
    return '<tr><td colspan="6" class="text-center text-secondary py-4">Belum ada riwayat absensi.</td></tr>';
  }
  return rows
    .map(
      (row) => `
      <tr>
        <td class="text-nowrap" data-label="Tanggal">${esc(row.date)}</td>
        <td data-label="Masuk">${esc(shortTime(row.check_in))}</td>
        <td data-label="Pulang">${esc(shortTime(row.check_out))}</td>
        <td data-label="Status">${statusBadge(row.status, Boolean(row.check_in))}</td>
        <td data-label="Foto masuk">${renderPhoto(row.photo_url, "Foto masuk", row.date)}</td>
        <td data-label="Foto pulang">${renderPhoto(row.photo_out_url, "Foto pulang", row.date)}</td>
      </tr>
    `
    )
    .join("");
}

export function attachInternEvents(context) {
  const refresh = context.refresh;
  const rerender = context.rerender;
  if (state.checkoutTimer) clearInterval(state.checkoutTimer);
  state.checkoutTimer = null;

  if (state.ui.tab === "absen") ensureFarmReminder();

  const checkInButton = document.getElementById("check-in-btn");
  const checkOutButton = document.getElementById("check-out-btn");
  if (checkInButton || checkOutButton) {
    bindAttendanceSync();
    updateAttendanceAvailability();
    const snapshot = attendanceSnapshot();
    if (!(snapshot.hasIn && snapshot.hasOut)) ensureLocation();
    state.checkoutTimer = setInterval(updateAttendanceAvailability, 1000);
  }

  const monthInput = document.getElementById("history-month");
  if (monthInput) {
    monthInput.addEventListener("change", () => {
      state.ui.historyMonth = monthInput.value;
      if (typeof rerender === "function") rerender();
    });
  }
  const monthCurrent = document.getElementById("history-month-current");
  if (monthCurrent) {
    monthCurrent.addEventListener("click", () => {
      state.ui.historyMonth = getTodayDate().slice(0, 7);
      if (typeof rerender === "function") rerender();
    });
  }
  const monthReset = document.getElementById("history-month-reset");
  if (monthReset) {
    monthReset.addEventListener("click", () => {
      state.ui.historyMonth = "";
      if (typeof rerender === "function") rerender();
    });
  }

  const locationBtn = document.getElementById("location-btn");
  if (locationBtn) locationBtn.addEventListener("click", () => requestLocation());

  const cameraBtn = document.getElementById("camera-btn");
  if (cameraBtn) {
    cameraBtn.addEventListener("click", () => {
      if (state.cameraStream) stopCamera();
      else startCamera();
    });
  }

  const captureBtn = document.getElementById("capture-btn");
  if (captureBtn) captureBtn.addEventListener("click", capturePhoto);

  const photoInput = document.getElementById("photo-input");
  if (photoInput) photoInput.addEventListener("change", handlePhotoUpload);

  const clearBtn = document.getElementById("clear-photo-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      state.selfieData = "";
      state.selfieBlob = null;
      stopCamera();
      updateSelfieUi();
      toast("Foto dihapus.", "info");
    });
  }

  const note = document.getElementById("attendance-note");
  if (note) {
    note.addEventListener("input", () => {
      state.note = note.value;
    });
  }

  if (checkInButton)
    checkInButton.addEventListener("click", () =>
      handleAttendanceSubmit("check-in", checkInButton, refresh)
    );

  if (checkOutButton)
    checkOutButton.addEventListener("click", () =>
      handleAttendanceSubmit("check-out", checkOutButton, refresh)
    );
}

async function handleAttendanceSubmit(type, button, refresh) {
  const user = state.user;
  if (!user || state.attendanceSubmitting) return;

  // Admin tidak boleh absensi - mereka bukan peserta
  if (user.role && user.role.toLowerCase() === "admin") {
    toast("Akun admin tidak dapat melakukan absensi. Admin bukan peserta magang.", "danger");
    return;
  }

  const snapshot = attendanceSnapshot();

  if (!snapshot.isWorkday) {
    toast("Hari ini akhir pekan. Absensi hanya tersedia Senin-Jumat.", "warning");
    return;
  }
  if (type === "check-in" && snapshot.hasIn) {
    toast("Anda sudah absen masuk hari ini.", "danger");
    return;
  }
  if (type === "check-out") {
    if (!snapshot.hasIn) {
      toast("Anda belum absen masuk hari ini.", "danger");
      return;
    }
    if (snapshot.hasOut) {
      toast("Anda sudah absen pulang hari ini.", "danger");
      return;
    }
  }

  if (!photoReady()) {
    toast("Ambil foto terlebih dahulu. Foto wajib tersedia sebelum absen.", "warning");
    updateAttendanceAvailability();
    return;
  }
  if (!isLocationReady()) {
    toast("Lokasi GPS belum terdeteksi. Tunggu deteksi otomatis atau tekan Coba Lagi.", "warning");
    updateAttendanceAvailability();
    if (state.locationStatus === "error" || state.locationStatus === "idle") requestLocation();
    return;
  }
  const geofence = getGeofence();
  const geofenceMessage = geofenceReason(geofence);
  if (geofenceMessage) {
    toast(geofenceMessage, "danger");
    updateAttendanceAvailability();
    return;
  }

  const geofenceSummary = geofence.radiusEnabled
    ? " Jarak " +
      formatDistance(geofence.distance) +
      " dari kantor (radius " +
      formatDistance(geofence.radius) +
      "), akurasi GPS sekitar " +
      Math.round(geofence.accuracy || 0) +
      " m."
    : "";
  const confirmed = await confirmDialog({
    title: type === "check-in" ? "Konfirmasi absen masuk" : "Konfirmasi absen pulang",
    message:
      (type === "check-in" ? "Simpan absen masuk" : "Simpan absen pulang") +
      " untuk " +
      user.name +
      "?",
    confirmLabel: "Lanjutkan",
    tone: "primary",
    secondMessage:
      "Lokasi " +
      state.currentLocation +
      " dan foto sudah siap." +
      geofenceSummary +
      " Waktu absensi mengikuti server dan tidak dapat diubah dari halaman ini."
  });
  if (!confirmed || state.attendanceSubmitting) return;

  state.attendanceSubmitting = true;
  updateAttendanceAvailability();
  const restore = withBusy(
    button,
    type === "check-in" ? "Menyimpan absen masuk..." : "Menyimpan absen pulang..."
  );
  let uploadedPath = "";
  try {
    if (!state.selfieBlob) {
      throw new Error("Foto absensi tidak tersedia. Ambil foto ulang lalu coba lagi.");
    }
    const uploaded = await uploadPhoto(
      state.selfieBlob,
      type === "check-in" ? "masuk" : "pulang"
    );
    uploadedPath = uploaded.path;
    const result = await rpc(type === "check-in" ? "app_check_in" : "app_check_out", {
      p_location: state.currentLocation,
      p_note: state.note || "",
      p_photo_url: uploaded.url,
      p_latitude: state.currentLat,
      p_longitude: state.currentLng,
      p_accuracy: state.locationAccuracy
    });
    toast((result && result.message) || "Absensi berhasil disimpan.", "success");
    state.note = "";
    state.selfieData = "";
    state.selfieBlob = null;
    stopCamera();
    await refresh({ silent: true, force: true });
  } catch (error) {
    if (uploadedPath) {
      try {
        await sb.storage.from(PHOTO_BUCKET).remove([uploadedPath]);
      } catch (removeError) {}
    }
    if (isNetworkError(error) && queueSupported() && state.selfieBlob) {
      try {
        const photoDataUrl = await blobToDataUrl(state.selfieBlob);
        await enqueueAttendance({
          user_id: user.id,
          username: user.username,
          type,
          date: snapshot.today,
          location: state.currentLocation,
          note: state.note || "",
          latitude: state.currentLat,
          longitude: state.currentLng,
          accuracy: state.locationAccuracy,
          photo_data_url: photoDataUrl
        });
        document.dispatchEvent(new CustomEvent("offline-queue:changed"));
        toast(
          "Koneksi terputus. Absensi disimpan di perangkat dan akan dikirim otomatis saat online.",
          "warning"
        );
        state.note = "";
        state.selfieData = "";
        state.selfieBlob = null;
        stopCamera();
        await refresh({ silent: true, force: true });
      } catch (queueError) {
        handleError(error);
      }
    } else {
      handleError(error);
    }
  } finally {
    state.attendanceSubmitting = false;
    restore();
    updateAttendanceAvailability();
  }
}