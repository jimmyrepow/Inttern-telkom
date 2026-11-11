import { state } from "../core/store.js";
import { rpc, handleError, sb } from "../core/api.js";
import { PHOTO_BUCKET } from "../core/config.js";
import { esc, toast, withBusy } from "../lib/dom.js";
import { getTodayDate, shortTime, statusBadge, formatMonth } from "../lib/format.js";
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
import { renderLocationDisplay, requestLocation } from "../services/location.js";
import { renderGuide } from "./guide.js";

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

function renderAbsenView(history) {
  const today = getTodayDate();
  const user = state.user;
  const todayRow = history.find((row) => String(row.date) === today);
  const hasIn = Boolean(todayRow && todayRow.check_in);
  const hasOut = Boolean(todayRow && todayRow.check_out);
  const settings = state.settings || {};
  const lateLimit = settings.late_limit || "08:15";
  const checkoutSettingReady = /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.checkout_limit || "");
  const checkoutLimit = checkoutSettingReady ? settings.checkout_limit : "17:00";
  const timezone = settings.timezone || "Asia/Jakarta";
  const checkoutReady = checkoutSettingReady && checkoutTimeReached(checkoutLimit, timezone);
  const recent = history.slice(0, 6);

  return `
    <div class="stats-grid mb-4">
      ${statCard("Status hari ini", hasIn ? (hasOut ? "Selesai" : "Sudah masuk") : "Belum absen", today)}
      ${statCard("Keterlambatan", todayRow ? (todayRow.status === "late" ? "Telat" : "Tepat waktu") : "-")}
      ${statCard("GPS", state.currentLocation ? "Aktif" : "Belum", "", "gps-stat")}
      ${statCard("Selfie", state.selfieData ? "Siap" : "Kosong", "", "selfie-stat")}
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
            <div class="location-box mb-3">
              <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
                <strong class="small">Lokasi GPS</strong>
                <button class="btn btn-sm btn-outline-primary rounded-pill" id="location-btn" type="button">Ambil GPS</button>
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
              <button class="btn btn-primary flex-fill rounded-3" id="check-in-btn" type="button" ${hasIn ? "disabled" : ""}>${hasIn ? "Sudah Absen Masuk" : "Absen Masuk"}</button>
              <button class="btn btn-danger flex-fill rounded-3" id="check-out-btn" type="button" ${!hasIn || hasOut || !checkoutReady ? "disabled" : ""}>${hasOut ? "Sudah Absen Pulang" : !checkoutSettingReady ? "Absen Pulang belum dikonfigurasi" : !checkoutReady ? "Absen Pulang (aktif pukul " + esc(checkoutLimit) + ")" : "Absen Pulang"}</button>
            </div>
            ${!hasOut ? '<div id="checkout-lock-hint" class="small text-secondary mt-2" aria-live="polite">' + (!checkoutSettingReady ? "Pengaturan jam pulang belum tersedia. Hubungi admin untuk menyiapkan database." : checkoutReady ? "Absen pulang sudah aktif." : "Absen pulang aktif mulai pukul " + esc(checkoutLimit) + " (" + esc(timezone) + ").") + "</div>" : ""}
            ${todayRow ? '<div class="small text-secondary mt-3">Absen hari ini: masuk ' + esc(shortTime(todayRow.check_in)) + " &middot; pulang " + esc(shortTime(todayRow.check_out)) + " &middot; " + statusBadge(todayRow.status, hasIn) + "</div>" : ""}
          </div>
        </div>
      </div>
      <div class="col-12 col-xl-5" id="riwayat-card">
        <div class="card rounded-4 border-0 shadow-sm h-100">
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
      const photos = renderPhoto(row.photo_url) + " " + renderPhoto(row.photo_out_url);
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
        <td data-label="Foto masuk">${renderPhoto(row.photo_url)}</td>
        <td data-label="Foto pulang">${renderPhoto(row.photo_out_url)}</td>
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

  const checkoutBtn = document.getElementById("check-out-btn");
  if (checkoutBtn) {
    const configuredCheckoutLimit = (state.settings && state.settings.checkout_limit) || "";
    const checkoutSettingReady = /^([01]\d|2[0-3]):[0-5]\d$/.test(configuredCheckoutLimit);
    const checkoutLimit = checkoutSettingReady ? configuredCheckoutLimit : "";
    const timezone = (state.settings && state.settings.timezone) || "Asia/Jakarta";
    const today = getTodayDate();
    const existing = state.attendance.find(
      (row) => String(row.user_id) === String(state.user.id) && String(row.date) === today
    );
    const hasIn = Boolean(existing && existing.check_in);
    const hasOut = Boolean(existing && existing.check_out);
    const updateCheckoutAvailability = () => {
      if (!checkoutBtn.isConnected) {
        clearInterval(state.checkoutTimer);
        state.checkoutTimer = null;
        return;
      }
      const ready = checkoutSettingReady && checkoutTimeReached(checkoutLimit, timezone);
      checkoutBtn.disabled = !hasIn || hasOut || !ready;
      if (!hasOut) {
        checkoutBtn.textContent = !checkoutSettingReady
          ? "Absen Pulang belum dikonfigurasi"
          : ready
            ? "Absen Pulang"
            : "Absen Pulang (aktif pukul " + checkoutLimit + ")";
      }
      const hint = document.getElementById("checkout-lock-hint");
      if (hint) {
        hint.textContent = !checkoutSettingReady
          ? "Pengaturan jam pulang belum tersedia. Hubungi admin untuk menyiapkan database."
          : ready
            ? "Absen pulang sudah aktif."
            : "Absen pulang aktif mulai pukul " + checkoutLimit + " (" + timezone + ").";
      }
    };
    updateCheckoutAvailability();
    state.checkoutTimer = setInterval(updateCheckoutAvailability, 1000);
  }

  const locationBtn = document.getElementById("location-btn");
  if (locationBtn) locationBtn.addEventListener("click", requestLocation);

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

  const checkInBtn = document.getElementById("check-in-btn");
  if (checkInBtn)
    checkInBtn.addEventListener("click", () =>
      handleAttendanceSubmit("check-in", checkInBtn, refresh)
    );

  const checkOutBtn = document.getElementById("check-out-btn");
  if (checkOutBtn)
    checkOutBtn.addEventListener("click", () =>
      handleAttendanceSubmit("check-out", checkOutBtn, refresh)
    );
}

async function handleAttendanceSubmit(type, button, refresh) {
  const user = state.user;
  if (!user) return;
  const today = getTodayDate();
  const existing = state.attendance.find(
    (row) => String(row.user_id) === String(user.id) && String(row.date) === today
  );

  if (type === "check-in" && existing && existing.check_in) {
    toast("Anda sudah absen masuk hari ini.", "danger");
    return;
  }
  if (type === "check-out") {
    if (!existing || !existing.check_in) {
      toast("Anda belum absen masuk hari ini.", "danger");
      return;
    }
    if (existing.check_out) {
      toast("Anda sudah absen pulang hari ini.", "danger");
      return;
    }
  }

  const restore = withBusy(
    button,
    type === "check-in" ? "Menyimpan absen masuk..." : "Menyimpan absen pulang..."
  );
  let uploadedPath = "";
  try {
    let photoUrl = "";
    if (state.selfieBlob) {
      const uploaded = await uploadPhoto(state.selfieBlob, type === "check-in" ? "masuk" : "pulang");
      photoUrl = uploaded.url;
      uploadedPath = uploaded.path;
    }
    const result = await rpc(type === "check-in" ? "app_check_in" : "app_check_out", {
      p_location: state.currentLocation || "Belum ada lokasi",
      p_note: state.note || "",
      p_photo_url: photoUrl
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
    handleError(error);
  } finally {
    restore();
  }
}
