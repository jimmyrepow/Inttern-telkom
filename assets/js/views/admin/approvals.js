import { state, invalidateAdminAchievements } from "../../core/store.js";
import { rpc, handleError } from "../../core/api.js";
import { esc, toast, withBusy, createModal } from "../../lib/dom.js";
import { formatDateTime, shortTime } from "../../lib/format.js";
import { statCard } from "../../lib/render.js";
import { paginate, renderPagination } from "../../lib/pagination.js";

const PAGE_SIZE = 8;
const LEAVE_TYPES = { izin: "Izin", sakit: "Sakit", cuti: "Cuti" };

function typeLabel(value) {
  return LEAVE_TYPES[value] || "Izin";
}

function statusBadge(value) {
  const status = String(value || "pending").toLowerCase();
  if (status === "approved") return '<span class="badge bg-success rounded-pill">Disetujui</span>';
  if (status === "rejected") return '<span class="badge bg-danger rounded-pill">Ditolak</span>';
  return '<span class="badge bg-warning text-dark rounded-pill">Menunggu</span>';
}

function matchesTerm(row, term) {
  if (!term) return true;
  return [row.name, row.username, row.reason, row.date, row.start_date, row.end_date, row.type, row.admin_note]
    .join(" ")
    .toLowerCase()
    .indexOf(term) !== -1;
}

function filteredLeaves() {
  const term = String(state.ui.approvalSearch || "").trim().toLowerCase();
  const status = String(state.ui.approvalStatus || "").toLowerCase();
  return (state.leaves || []).filter((row) => {
    if (status && String(row.status) !== status) return false;
    return matchesTerm(row, term);
  });
}

function filteredCorrections() {
  const term = String(state.ui.approvalSearch || "").trim().toLowerCase();
  const status = String(state.ui.approvalStatus || "").toLowerCase();
  return (state.corrections || []).filter((row) => {
    if (status && String(row.status) !== status) return false;
    return matchesTerm(row, term);
  });
}

function leaveRows(rows) {
  if (!rows.length) {
    return '<tr><td colspan="6" class="text-center text-secondary py-4">Tidak ada pengajuan izin yang cocok.</td></tr>';
  }
  return rows
    .map(
      (row) => `
      <tr>
        <td data-label="Pemohon">
          <div class="fw-semibold">${esc(row.name || "-")}</div>
          <div class="small text-secondary">@${esc(row.username || "-")}</div>
        </td>
        <td data-label="Jenis"><span class="badge bg-light text-dark border rounded-pill">${esc(typeLabel(row.type))}</span></td>
        <td data-label="Tanggal" class="text-nowrap">${esc(row.start_date)}${row.end_date && row.end_date !== row.start_date ? " s/d " + esc(row.end_date) : ""}</td>
        <td data-label="Alasan"><div class="small text-break-anywhere">${esc(row.reason || "-")}</div></td>
        <td data-label="Status">${statusBadge(row.status)}</td>
        <td data-label="Aksi">
          ${
            String(row.status) === "pending"
              ? `<div class="table-actions">
                  <button class="btn btn-sm btn-icon is-primary" type="button" data-review="leave" data-id="${esc(row.id)}" data-status="approved" title="Setujui" aria-label="Setujui pengajuan ${esc(row.name || "")}"><i class="bi bi-check2" aria-hidden="true"></i></button>
                  <button class="btn btn-sm btn-icon is-danger" type="button" data-review="leave" data-id="${esc(row.id)}" data-status="rejected" title="Tolak" aria-label="Tolak pengajuan ${esc(row.name || "")}"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
                </div>`
              : `<div class="small text-secondary">${esc(row.reviewed_by || "-")}<br />${esc(formatDateTime(row.reviewed_at))}</div>`
          }
        </td>
      </tr>
    `
    )
    .join("");
}

function correctionRows(rows) {
  if (!rows.length) {
    return '<tr><td colspan="6" class="text-center text-secondary py-4">Tidak ada pengajuan koreksi yang cocok.</td></tr>';
  }
  return rows
    .map(
      (row) => `
      <tr>
        <td data-label="Peserta">
          <div class="fw-semibold">${esc(row.name || "-")}</div>
          <div class="small text-secondary">@${esc(row.username || "-")}</div>
        </td>
        <td data-label="Tanggal" class="text-nowrap">${esc(row.date)}</td>
        <td data-label="Koreksi" class="small">
          <div>Masuk: <strong>${esc(shortTime(row.requested_check_in))}</strong></div>
          <div>Pulang: <strong>${esc(shortTime(row.requested_check_out))}</strong></div>
        </td>
        <td data-label="Alasan"><div class="small text-break-anywhere">${esc(row.reason || "-")}</div></td>
        <td data-label="Status">${statusBadge(row.status)}</td>
        <td data-label="Aksi">
          ${
            String(row.status) === "pending"
              ? `<div class="table-actions">
                  <button class="btn btn-sm btn-icon is-primary" type="button" data-review="correction" data-id="${esc(row.id)}" data-status="approved" title="Setujui" aria-label="Setujui koreksi ${esc(row.name || "")}"><i class="bi bi-check2" aria-hidden="true"></i></button>
                  <button class="btn btn-sm btn-icon is-danger" type="button" data-review="correction" data-id="${esc(row.id)}" data-status="rejected" title="Tolak" aria-label="Tolak koreksi ${esc(row.name || "")}"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
                </div>`
              : `<div class="small text-secondary">${esc(row.reviewed_by || "-")}<br />${esc(formatDateTime(row.reviewed_at))}</div>`
          }
        </td>
      </tr>
    `
    )
    .join("");
}

function renderPanel(kind) {
  const isLeave = kind === "leave";
  const filtered = isLeave ? filteredLeaves() : filteredCorrections();
  const pageKey = "approvalPage";
  const pager = paginate(filtered, state.ui[pageKey], PAGE_SIZE);
  state.ui[pageKey] = pager.page;
  const total = isLeave ? (state.leaves || []).length : (state.corrections || []).length;
  const summary =
    filtered.length === total
      ? total + " pengajuan"
      : filtered.length + " dari " + total + " pengajuan";

  return `
    <div class="table-responsive">
      <table class="table table-sm align-middle table-stack mb-0">
        <thead>
          <tr>
            <th>${isLeave ? "Pemohon" : "Peserta"}</th>
            <th>${isLeave ? "Jenis" : "Tanggal"}</th>
            <th>${isLeave ? "Tanggal" : "Koreksi"}</th>
            <th>Alasan</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>${isLeave ? leaveRows(pager.items) : correctionRows(pager.items)}</tbody>
      </table>
    </div>
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3">
      <div class="small text-secondary">${summary}</div>
      <div id="approval-pagination">${renderPagination(pager.page, pager.pages, "Navigasi persetujuan")}</div>
    </div>
  `;
}

export function renderApprovals() {
  const stats = state.stats || {};
  const kind = state.ui.approvalKind === "correction" ? "correction" : "leave";
  const pendingLeaves = Number(stats.pendingLeaves) || 0;
  const pendingCorrections = Number(stats.pendingCorrections) || 0;

  return `
    <div class="stats-grid mb-4">
      ${statCard("Izin menunggu", pendingLeaves, "Perlu ditinjau")}
      ${statCard("Koreksi menunggu", pendingCorrections, "Perlu ditinjau")}
      ${statCard("Total izin", (state.leaves || []).length)}
      ${statCard("Total koreksi", (state.corrections || []).length)}
    </div>

    <div class="card rounded-4 border-0 shadow-sm">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div>
            <h2 class="h5 fw-bold mb-1">Persetujuan</h2>
            <div class="small text-secondary">Tinjau pengajuan izin dan koreksi absensi peserta.</div>
          </div>
          <button class="btn btn-outline-secondary rounded-pill px-3" id="approval-refresh" type="button">
            <i class="bi bi-arrow-clockwise me-2"></i>Muat ulang
          </button>
        </div>

        <ul class="nav nav-pills gap-2 mb-3" role="tablist">
          <li class="nav-item" role="presentation">
            <button class="nav-link ${kind === "leave" ? "active" : ""}" type="button" data-approval-kind="leave" role="tab" aria-selected="${kind === "leave"}"><i class="bi bi-calendar2-heart me-2"></i>Izin, sakit, cuti${pendingLeaves ? ' <span class="badge bg-danger rounded-pill">' + pendingLeaves + "</span>" : ""}</button>
          </li>
          <li class="nav-item" role="presentation">
            <button class="nav-link ${kind === "correction" ? "active" : ""}" type="button" data-approval-kind="correction" role="tab" aria-selected="${kind === "correction"}"><i class="bi bi-clock-history me-2"></i>Koreksi absensi${pendingCorrections ? ' <span class="badge bg-danger rounded-pill">' + pendingCorrections + "</span>" : ""}</button>
          </li>
        </ul>

        <div class="row g-2 mb-3">
          <div class="col-12 col-md-6">
            <input id="approval-search" class="form-control rounded-3" type="search" placeholder="Cari nama, username, atau alasan..." value="${esc(state.ui.approvalSearch)}" />
          </div>
          <div class="col-7 col-md-4">
            <select id="approval-status" class="form-select rounded-3">
              <option value="">Semua status</option>
              <option value="pending"${state.ui.approvalStatus === "pending" ? " selected" : ""}>Menunggu</option>
              <option value="approved"${state.ui.approvalStatus === "approved" ? " selected" : ""}>Disetujui</option>
              <option value="rejected"${state.ui.approvalStatus === "rejected" ? " selected" : ""}>Ditolak</option>
            </select>
          </div>
          <div class="col-5 col-md-2">
            <button class="btn btn-outline-secondary rounded-3 w-100" id="approval-reset" type="button">Reset</button>
          </div>
        </div>

        <div id="approval-panel">${renderPanel(kind)}</div>
      </div>
    </div>
  `;
}

function refreshPanel() {
  const kind = state.ui.approvalKind === "correction" ? "correction" : "leave";
  const panel = document.getElementById("approval-panel");
  if (panel) panel.innerHTML = renderPanel(kind);
}

function bindPanel(context) {
  const panel = document.getElementById("approval-panel");
  if (!panel) return;
  panel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-review]");
    if (button) {
      openReviewDialog(button.dataset.review, button.dataset.id, button.dataset.status, context);
      return;
    }
    const pageButton = event.target.closest("[data-page]");
    if (pageButton) {
      state.ui.approvalPage = Number(pageButton.dataset.page) || 1;
      refreshPanel();
    }
  });
}

export function attachApprovalsEvents(context) {
  const refresh = context.refresh;
  const rerender = context.rerender;

  document.querySelectorAll("[data-approval-kind]").forEach((button) => {
    button.addEventListener("click", () => {
      state.ui.approvalKind = button.dataset.approvalKind;
      state.ui.approvalPage = 1;
      if (typeof rerender === "function") rerender();
    });
  });

  const search = document.getElementById("approval-search");
  if (search) {
    search.addEventListener("input", () => {
      state.ui.approvalSearch = search.value;
      state.ui.approvalPage = 1;
      refreshPanel();
    });
  }
  const status = document.getElementById("approval-status");
  if (status) {
    status.addEventListener("change", () => {
      state.ui.approvalStatus = status.value;
      state.ui.approvalPage = 1;
      refreshPanel();
    });
  }
  const reset = document.getElementById("approval-reset");
  if (reset) {
    reset.addEventListener("click", () => {
      state.ui.approvalSearch = "";
      state.ui.approvalStatus = "pending";
      state.ui.approvalPage = 1;
      if (typeof rerender === "function") rerender();
    });
  }
  const refreshButton = document.getElementById("approval-refresh");
  if (refreshButton) {
    refreshButton.addEventListener("click", () => refresh({ silent: true, force: true }));
  }

  bindPanel(context);
}

function findItem(kind, id) {
  const list = kind === "correction" ? state.corrections : state.leaves;
  return (list || []).find((row) => String(row.id) === String(id)) || null;
}

function openReviewDialog(kind, id, status, context) {
  const item = findItem(kind, id);
  if (!item) {
    toast("Pengajuan tidak ditemukan. Muat ulang data lalu coba lagi.", "danger");
    return;
  }
  const isLeave = kind === "leave";
  const approving = status === "approved";
  const dialogId = "review-dialog-" + Date.now();
  const detail = isLeave
    ? `
      <div class="account-meta mb-3">
        <div class="account-meta-row"><span>Pemohon</span><strong>${esc(item.name || "-")} (@${esc(item.username || "-")})</strong></div>
        <div class="account-meta-row"><span>Jenis</span><strong>${esc(typeLabel(item.type))}</strong></div>
        <div class="account-meta-row"><span>Tanggal</span><strong>${esc(item.start_date)}${item.end_date && item.end_date !== item.start_date ? " s/d " + esc(item.end_date) : ""}</strong></div>
        <div class="account-meta-row"><span>Diajukan</span><strong>${esc(formatDateTime(item.created_at))}</strong></div>
      </div>
      <div class="suggestion-quote mb-3">${esc(item.reason || "-")}</div>
    `
    : `
      <div class="account-meta mb-3">
        <div class="account-meta-row"><span>Peserta</span><strong>${esc(item.name || "-")} (@${esc(item.username || "-")})</strong></div>
        <div class="account-meta-row"><span>Tanggal absensi</span><strong>${esc(item.date)}</strong></div>
        <div class="account-meta-row"><span>Jam masuk diminta</span><strong>${esc(shortTime(item.requested_check_in))}</strong></div>
        <div class="account-meta-row"><span>Jam pulang diminta</span><strong>${esc(shortTime(item.requested_check_out))}</strong></div>
        <div class="account-meta-row"><span>Diajukan</span><strong>${esc(formatDateTime(item.created_at))}</strong></div>
      </div>
      <div class="suggestion-quote mb-3">${esc(item.reason || "-")}</div>
      ${approving ? '<div class="alert alert-warning small">Menyetujui koreksi akan langsung memperbarui jam absensi peserta.</div>' : ""}
    `;

  const { element, modal } = createModal(`
    <div class="modal fade" id="${dialogId}" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content rounded-4 border-0">
          <form novalidate>
            <div class="modal-header border-0 pb-0">
              <div>
                <h2 class="h5 fw-bold mb-0">${approving ? "Setujui" : "Tolak"} ${isLeave ? "pengajuan" : "koreksi"}</h2>
                <div class="small text-secondary">${esc(item.name || "-")} &middot; ${esc(item.date || item.start_date || "")}</div>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Tutup"></button>
            </div>
            <div class="modal-body">
              ${detail}
              <label class="form-label small fw-semibold" for="${dialogId}-note">Catatan admin (opsional)</label>
              <textarea id="${dialogId}-note" class="form-control rounded-3" rows="3" maxlength="500" placeholder="Tambahkan catatan untuk peserta..."></textarea>
              <div class="form-text">Catatan akan terlihat oleh peserta pada riwayat pengajuan.</div>
            </div>
            <div class="modal-footer border-0 pt-0">
              <button class="btn btn-outline-secondary rounded-pill px-4" type="button" data-bs-dismiss="modal">Batal</button>
              <button class="btn ${approving ? "btn-primary" : "btn-danger"} rounded-pill px-4" type="submit">${approving ? "Setujui" : "Tolak"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);

  const form = element.querySelector("form");
  const submit = element.querySelector('button[type="submit"]');
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const note = element.querySelector("#" + dialogId + "-note").value.trim();
    const restore = withBusy(submit, "Menyimpan...");
    try {
      const result = isLeave
        ? await rpc("admin_review_leave", {
            p_id: item.id,
            p_status: status,
            p_admin_note: note
          })
        : await rpc("admin_review_correction", {
            p_id: item.id,
            p_status: status,
            p_admin_note: note
          });
      modal.hide();
      toast((result && result.message) || "Pengajuan berhasil diproses.", "success");
      invalidateAdminAchievements();
      await context.refresh({ silent: true, force: true });
    } catch (error) {
      handleError(error);
    } finally {
      restore();
    }
  });

  element.addEventListener("hidden.bs.modal", () => element.remove());
  modal.show();
}
