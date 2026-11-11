import { state } from "../core/store.js";
import { rpc, handleError } from "../core/api.js";
import { esc, toast, withBusy, confirmDialog } from "../lib/dom.js";
import { getTodayDate, shortTime } from "../lib/format.js";
import { statCard } from "../lib/render.js";

const LEAVE_TYPES = {
  izin: "Izin",
  sakit: "Sakit",
  cuti: "Cuti"
};

function myLeaves() {
  const userId = String((state.user && state.user.id) || "");
  return (state.leaves || [])
    .filter((row) => String(row.user_id) === userId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function myCorrections() {
  const userId = String((state.user && state.user.id) || "");
  return (state.corrections || [])
    .filter((row) => String(row.user_id) === userId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function typeLabel(value) {
  return LEAVE_TYPES[value] || "Izin";
}

function statusMeta(value) {
  const status = String(value || "pending").toLowerCase();
  if (status === "approved") return { label: "Disetujui", tone: "bg-success" };
  if (status === "rejected") return { label: "Ditolak", tone: "bg-danger" };
  return { label: "Menunggu", tone: "bg-warning text-dark" };
}

function statusBadge(value) {
  const meta = statusMeta(value);
  return '<span class="badge ' + meta.tone + ' rounded-pill">' + meta.label + "</span>";
}

function dateRangeLabel(start, end) {
  if (!end || start === end) return esc(start || "-");
  return esc(start) + " s/d " + esc(end);
}

function eligibleAttendance() {
  const userId = String((state.user && state.user.id) || "");
  const today = getTodayDate();
  const limit = new Date(today + "T00:00:00");
  limit.setDate(limit.getDate() - 60);
  return (state.attendance || [])
    .filter((row) => String(row.user_id) === userId)
    .filter((row) => Boolean(row.check_in) !== Boolean(row.check_out))
    .filter((row) => String(row.date) >= limit.toISOString().slice(0, 10))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function correctionOptions(rows) {
  if (!rows.length) {
    return '<option value="">Tidak ada absensi yang perlu dikoreksi</option>';
  }
  return rows
    .map(
      (row) =>
        '<option value="' +
        esc(row.id) +
        '">' +
        esc(row.date) +
        " &middot; masuk " +
        esc(shortTime(row.check_in)) +
        " &middot; pulang " +
        esc(shortTime(row.check_out)) +
        "</option>"
    )
    .join("");
}

function renderLeaveRows(rows) {
  if (!rows.length) {
    return '<tr><td colspan="5" class="text-center text-secondary py-4">Belum ada pengajuan izin.</td></tr>';
  }
  return rows
    .map(
      (row) => `
      <tr>
        <td data-label="Jenis"><span class="badge bg-light text-dark border rounded-pill">${esc(typeLabel(row.type))}</span></td>
        <td data-label="Tanggal" class="text-nowrap">${dateRangeLabel(row.start_date, row.end_date)}</td>
        <td data-label="Alasan"><div class="small text-secondary text-break-anywhere">${esc(row.reason || "-")}</div></td>
        <td data-label="Status">${statusBadge(row.status)}</td>
        <td data-label="Catatan admin"><div class="small text-secondary text-break-anywhere">${esc(row.admin_note || "-")}</div></td>
      </tr>
    `
    )
    .join("");
}

function renderCorrectionRows(rows) {
  if (!rows.length) {
    return '<tr><td colspan="5" class="text-center text-secondary py-4">Belum ada pengajuan koreksi.</td></tr>';
  }
  return rows
    .map(
      (row) => `
      <tr>
        <td data-label="Tanggal" class="text-nowrap">${esc(row.date)}</td>
        <td data-label="Koreksi" class="small">
          <div>Masuk: <strong>${esc(shortTime(row.requested_check_in))}</strong></div>
          <div>Pulang: <strong>${esc(shortTime(row.requested_check_out))}</strong></div>
        </td>
        <td data-label="Alasan"><div class="small text-secondary text-break-anywhere">${esc(row.reason || "-")}</div></td>
        <td data-label="Status">${statusBadge(row.status)}</td>
        <td data-label="Catatan admin"><div class="small text-secondary text-break-anywhere">${esc(row.admin_note || "-")}</div></td>
      </tr>
    `
    )
    .join("");
}

export function renderLeaves() {
  const leaves = myLeaves();
  const corrections = myCorrections();
  const eligible = eligibleAttendance();
  const today = getTodayDate();
  const pendingLeaves = leaves.filter((row) => row.status === "pending").length;
  const approvedLeaves = leaves.filter((row) => row.status === "approved").length;
  const pendingCorrections = corrections.filter((row) => row.status === "pending").length;
  const approvedCorrections = corrections.filter((row) => row.status === "approved").length;
  const activeTab = state.ui.leavesTab === "koreksi" ? "koreksi" : "izin";

  return `
    <div class="stats-grid mb-4">
      ${statCard("Izin menunggu", pendingLeaves, "Belum diproses admin")}
      ${statCard("Izin disetujui", approvedLeaves)}
      ${statCard("Koreksi menunggu", pendingCorrections, "Belum diproses admin")}
      ${statCard("Koreksi disetujui", approvedCorrections)}
    </div>

    <div class="card rounded-4 border-0 shadow-sm mb-4">
      <div class="card-body p-3 p-md-4">
        <ul class="nav nav-pills gap-2 mb-3" role="tablist">
          <li class="nav-item" role="presentation">
            <button class="nav-link ${activeTab === "izin" ? "active" : ""}" type="button" data-leaves-tab="izin" role="tab" aria-selected="${activeTab === "izin"}"><i class="bi bi-calendar2-heart me-2"></i>Izin, sakit, cuti</button>
          </li>
          <li class="nav-item" role="presentation">
            <button class="nav-link ${activeTab === "koreksi" ? "active" : ""}" type="button" data-leaves-tab="koreksi" role="tab" aria-selected="${activeTab === "koreksi"}"><i class="bi bi-clock-history me-2"></i>Koreksi absensi</button>
          </li>
        </ul>

        <div class="${activeTab === "izin" ? "" : "d-none"}" data-leaves-panel="izin">
          <div class="card-section-head">
            <span class="card-section-icon"><i class="bi bi-send-plus"></i></span>
            <div>
              <h2 class="h5 fw-bold mb-0">Ajukan izin, sakit, atau cuti</h2>
              <div class="small text-secondary">Pengajuan akan dikirim ke admin untuk disetujui.</div>
            </div>
          </div>
          <form id="leave-form" novalidate>
            <div class="row g-2">
              <div class="col-12 col-md-4">
                <label class="form-label small fw-semibold" for="leave-type">Jenis</label>
                <select id="leave-type" class="form-select rounded-3">
                  <option value="izin">Izin</option>
                  <option value="sakit">Sakit</option>
                  <option value="cuti">Cuti</option>
                </select>
              </div>
              <div class="col-6 col-md-4">
                <label class="form-label small fw-semibold" for="leave-start">Tanggal mulai</label>
                <input id="leave-start" class="form-control rounded-3" type="date" value="${esc(today)}" required />
              </div>
              <div class="col-6 col-md-4">
                <label class="form-label small fw-semibold" for="leave-end">Tanggal selesai</label>
                <input id="leave-end" class="form-control rounded-3" type="date" value="${esc(today)}" required />
              </div>
            </div>
            <div class="mt-3">
              <label class="form-label small fw-semibold" for="leave-reason">Alasan</label>
              <textarea id="leave-reason" class="form-control rounded-3" rows="3" minlength="5" maxlength="500" placeholder="Contoh: sakit demam, perlu istirahat di rumah" required></textarea>
              <div class="form-text">5-500 karakter. Sertakan keterangan singkat yang jelas.</div>
            </div>
            <button class="btn btn-primary rounded-3 mt-3" id="leave-submit" type="submit">
              <i class="bi bi-send me-2"></i>Kirim pengajuan
            </button>
          </form>
        </div>

        <div class="${activeTab === "koreksi" ? "" : "d-none"}" data-leaves-panel="koreksi">
          <div class="card-section-head">
            <span class="card-section-icon"><i class="bi bi-clock-history"></i></span>
            <div>
              <h2 class="h5 fw-bold mb-0">Ajukan koreksi absensi</h2>
              <div class="small text-secondary">Gunakan jika lupa absen masuk atau pulang. Koreksi hanya untuk absensi yang belum lengkap.</div>
            </div>
          </div>
          <form id="correction-form" novalidate>
            <div class="mb-3">
              <label class="form-label small fw-semibold" for="correction-attendance">Pilih absensi</label>
              <select id="correction-attendance" class="form-select rounded-3" ${eligible.length ? "" : "disabled"}>
                ${correctionOptions(eligible)}
              </select>
              <div class="form-text">Hanya absensi 60 hari terakhir yang belum lengkap yang dapat dikoreksi.</div>
            </div>
            <div class="row g-2">
              <div class="col-6">
                <label class="form-label small fw-semibold" for="correction-in">Jam masuk yang benar</label>
                <input id="correction-in" class="form-control rounded-3" type="time" />
              </div>
              <div class="col-6">
                <label class="form-label small fw-semibold" for="correction-out">Jam pulang yang benar</label>
                <input id="correction-out" class="form-control rounded-3" type="time" />
              </div>
            </div>
            <div class="mt-3">
              <label class="form-label small fw-semibold" for="correction-reason">Alasan koreksi</label>
              <textarea id="correction-reason" class="form-control rounded-3" rows="3" minlength="5" maxlength="500" placeholder="Contoh: lupa absen pulang karena langsung mengikuti rapat" required></textarea>
              <div class="form-text">Isi minimal salah satu jam. Alasan 5-500 karakter.</div>
            </div>
            <button class="btn btn-primary rounded-3 mt-3" id="correction-submit" type="submit" ${eligible.length ? "" : "disabled"}>
              <i class="bi bi-send me-2"></i>Kirim koreksi
            </button>
          </form>
        </div>
      </div>
    </div>

    <div class="card rounded-4 border-0 shadow-sm mb-4">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div>
            <h2 class="h5 fw-bold mb-1">Riwayat izin, sakit, dan cuti</h2>
            <div class="small text-secondary">${leaves.length} pengajuan</div>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm align-middle table-stack mb-0">
            <thead>
              <tr>
                <th>Jenis</th>
                <th>Tanggal</th>
                <th>Alasan</th>
                <th>Status</th>
                <th>Catatan admin</th>
              </tr>
            </thead>
            <tbody>${renderLeaveRows(leaves)}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card rounded-4 border-0 shadow-sm">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div>
            <h2 class="h5 fw-bold mb-1">Riwayat koreksi absensi</h2>
            <div class="small text-secondary">${corrections.length} pengajuan</div>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm align-middle table-stack mb-0">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Koreksi</th>
                <th>Alasan</th>
                <th>Status</th>
                <th>Catatan admin</th>
              </tr>
            </thead>
            <tbody>${renderCorrectionRows(corrections)}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function attachLeavesEvents(context) {
  const refresh = context.refresh;
  const rerender = context.rerender;

  document.querySelectorAll("[data-leaves-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.ui.leavesTab = button.dataset.leavesTab;
      if (typeof rerender === "function") rerender();
    });
  });

  const start = document.getElementById("leave-start");
  const end = document.getElementById("leave-end");
  if (start && end) {
    const syncRange = () => {
      end.min = start.value || "";
      if (end.value && start.value && end.value < start.value) end.value = start.value;
    };
    start.addEventListener("change", syncRange);
    syncRange();
  }

  const leaveForm = document.getElementById("leave-form");
  if (leaveForm) {
    leaveForm.addEventListener("submit", (event) =>
      submitLeave(event, context, refresh)
    );
  }

  const correctionForm = document.getElementById("correction-form");
  if (correctionForm) {
    correctionForm.addEventListener("submit", (event) =>
      submitCorrection(event, context, refresh)
    );
  }
}

async function submitLeave(event, context, refresh) {
  event.preventDefault();
  const type = document.getElementById("leave-type").value;
  const startDate = document.getElementById("leave-start").value;
  const endDate = document.getElementById("leave-end").value;
  const reason = document.getElementById("leave-reason").value.trim();

  if (!startDate || !endDate) {
    toast("Tanggal mulai dan selesai wajib diisi.", "danger");
    return;
  }
  if (endDate < startDate) {
    toast("Tanggal selesai tidak boleh lebih awal dari tanggal mulai.", "danger");
    return;
  }
  if (reason.length < 5) {
    toast("Alasan minimal 5 karakter.", "danger");
    return;
  }

  const confirmed = await confirmDialog({
    title: "Kirim pengajuan " + typeLabel(type).toLowerCase() + "?",
    message:
      "Pengajuan " +
      typeLabel(type).toLowerCase() +
      " untuk " +
      startDate +
      (endDate !== startDate ? " s/d " + endDate : "") +
      " akan dikirim ke admin.",
    confirmLabel: "Kirim pengajuan",
    tone: "primary",
    secondMessage: "Admin akan meninjau pengajuan ini. Status dapat dilihat pada riwayat di bawah."
  });
  if (!confirmed) return;

  const button = document.getElementById("leave-submit");
  const restore = withBusy(button, "Mengirim...");
  try {
    const result = await rpc("app_submit_leave", {
      p_type: type,
      p_start_date: startDate,
      p_end_date: endDate,
      p_reason: reason
    });
    toast((result && result.message) || "Pengajuan berhasil dikirim.", "success");
    state.ui.leavesTab = "izin";
    await refresh({ silent: true, force: true });
  } catch (error) {
    handleError(error);
  } finally {
    restore();
  }
}

async function submitCorrection(event, context, refresh) {
  event.preventDefault();
  const attendanceId = document.getElementById("correction-attendance").value;
  const checkIn = document.getElementById("correction-in").value;
  const checkOut = document.getElementById("correction-out").value;
  const reason = document.getElementById("correction-reason").value.trim();

  if (!attendanceId) {
    toast("Pilih data absensi yang ingin dikoreksi.", "danger");
    return;
  }
  if (!checkIn && !checkOut) {
    toast("Isi minimal salah satu jam masuk atau jam pulang.", "danger");
    return;
  }
  if (checkIn && checkOut && checkOut < checkIn) {
    toast("Jam pulang tidak boleh lebih awal dari jam masuk.", "danger");
    return;
  }
  if (reason.length < 5) {
    toast("Alasan koreksi minimal 5 karakter.", "danger");
    return;
  }

  const confirmed = await confirmDialog({
    title: "Kirim koreksi absensi?",
    message: "Pengajuan koreksi akan dikirim ke admin untuk disetujui.",
    confirmLabel: "Kirim koreksi",
    tone: "primary",
    secondMessage: "Jika disetujui, jam absensi akan diperbarui sesuai data yang Anda isi."
  });
  if (!confirmed) return;

  const button = document.getElementById("correction-submit");
  const restore = withBusy(button, "Mengirim...");
  try {
    const result = await rpc("app_submit_correction", {
      p_attendance_id: attendanceId,
      p_requested_check_in: checkIn || "",
      p_requested_check_out: checkOut || "",
      p_reason: reason
    });
    toast((result && result.message) || "Koreksi berhasil dikirim.", "success");
    state.ui.leavesTab = "koreksi";
    await refresh({ silent: true, force: true });
  } catch (error) {
    handleError(error);
  } finally {
    restore();
  }
}
