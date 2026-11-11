import { state } from "../core/store.js";
import { rpc, handleError } from "../core/api.js";
import {
  esc,
  toast,
  withBusy,
  confirmDialog,
  createModal
} from "../lib/dom.js";
import { formatDateTime } from "../lib/format.js";
import { renderAvatar } from "../lib/avatar.js";
import { paginate, renderPagination } from "../lib/pagination.js";
import { statCard } from "../lib/render.js";

const PAGE_SIZE = 8;
const CATEGORY_LABELS = {
  umum: "Umum",
  absensi: "Absensi",
  tampilan: "Tampilan",
  fitur: "Fitur",
  bug: "Bug",
  lainnya: "Lainnya"
};
const STATUS_LABELS = {
  baru: "Baru",
  dibaca: "Dibaca",
  diproses: "Diproses",
  selesai: "Selesai"
};

function roleKey() {
  return String((state.user && state.user.role) || "intern").toLowerCase() === "admin"
    ? "admin"
    : "intern";
}

function categoryLabel(value) {
  return CATEGORY_LABELS[value] || CATEGORY_LABELS.umum;
}

function statusLabel(value) {
  return STATUS_LABELS[value] || STATUS_LABELS.baru;
}

function statusBadge(value) {
  const status = String(value || "baru").toLowerCase();
  const tone =
    status === "selesai"
      ? "bg-success"
      : status === "diproses"
        ? "bg-primary"
        : status === "dibaca"
          ? "bg-info text-dark"
          : "bg-warning text-dark";
  return '<span class="badge ' + tone + ' rounded-pill">' + esc(statusLabel(status)) + "</span>";
}

function categoryBadge(value) {
  return (
    '<span class="badge bg-light text-dark border rounded-pill">' +
    esc(categoryLabel(value)) +
    "</span>"
  );
}

function categoryOptions(selected) {
  return Object.keys(CATEGORY_LABELS)
    .map(
      (value) =>
        '<option value="' +
        esc(value) +
        '"' +
        (value === selected ? " selected" : "") +
        ">" +
        esc(CATEGORY_LABELS[value]) +
        "</option>"
    )
    .join("");
}

function statusOptions(selected) {
  return Object.keys(STATUS_LABELS)
    .map(
      (value) =>
        '<option value="' +
        esc(value) +
        '"' +
        (value === selected ? " selected" : "") +
        ">" +
        esc(STATUS_LABELS[value]) +
        "</option>"
    )
    .join("");
}

function truncate(value, limit) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return text.slice(0, Math.max(0, limit - 3)) + "...";
}

function summaryCounts() {
  const summary = state.suggestionSummary || {};
  return {
    baru: Number(summary.baru) || 0,
    dibaca: Number(summary.dibaca) || 0,
    diproses: Number(summary.diproses) || 0,
    selesai: Number(summary.selesai) || 0,
    total: Number(summary.total) || state.suggestions.length || 0
  };
}

function filteredAdminSuggestions() {
  const term = String(state.ui.suggestionSearch || "").trim().toLowerCase();
  const status = String(state.ui.suggestionStatus || "").toLowerCase();
  return state.suggestions.filter((item) => {
    if (status && String(item.status || "baru") !== status) return false;
    if (!term) return true;
    const haystack = [
      item.name,
      item.username,
      item.message,
      item.admin_reply,
      categoryLabel(item.category),
      statusLabel(item.status)
    ]
      .join(" ")
      .toLowerCase();
    return haystack.indexOf(term) !== -1;
  });
}

function listReady() {
  return state.suggestionLoadedFor === roleKey();
}

function renderLoadAlert() {
  if (state.suggestionError) {
    return (
      '<div class="alert alert-danger small d-flex justify-content-between align-items-center flex-wrap gap-2" role="alert">' +
      "<span>" +
      esc(state.suggestionError) +
      "</span>" +
      '<button class="btn btn-sm btn-outline-danger rounded-pill" id="suggestion-retry" type="button">Coba lagi</button>' +
      "</div>"
    );
  }
  if (state.suggestionLoading && !listReady()) {
    return (
      '<div class="alert alert-light border small mb-0" role="status">' +
      '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Memuat kotak saran...</div>'
    );
  }
  return "";
}

function renderAdminRows(rows) {
  if (!listReady()) {
    return '<tr><td colspan="6" class="text-center text-secondary py-4">Memuat saran...</td></tr>';
  }
  if (!rows.length) {
    return '<tr><td colspan="6" class="text-center text-secondary py-4">Tidak ada saran yang cocok.</td></tr>';
  }
  return rows
    .map((item) => {
      const reply = item.admin_reply
        ? '<div class="suggestion-reply-preview">' + esc(truncate(item.admin_reply, 120)) + "</div>"
        : '<span class="text-secondary small">Belum dibalas</span>';
      return `
        <tr>
          <td data-label="Pengirim">
            <div class="d-flex align-items-center gap-2">
              ${renderAvatar(item, "avatar-sm")}
              <div class="min-w-0">
                <div class="fw-semibold">${esc(item.name || "-")}</div>
                <div class="small text-secondary">@${esc(item.username || "-")}</div>
              </div>
            </div>
          </td>
          <td data-label="Kategori">${categoryBadge(item.category)}</td>
          <td data-label="Saran">
            <div class="suggestion-message-preview">${esc(truncate(item.message, 180))}</div>
            <div class="small text-secondary">${esc(formatDateTime(item.created_at))}</div>
          </td>
          <td data-label="Status">${statusBadge(item.status)}</td>
          <td data-label="Balasan">${reply}</td>
          <td data-label="Aksi">
            <div class="table-actions">
              <button class="btn btn-sm btn-outline-primary rounded-pill" type="button" data-action="reply-suggestion" data-id="${esc(item.id)}">Balas</button>
              <button class="btn btn-sm btn-outline-danger rounded-pill" type="button" data-action="delete-suggestion" data-id="${esc(item.id)}">Hapus</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function adminListSummary(filtered, pager) {
  const total = state.suggestions.length;
  const base =
    filtered.length === total
      ? total + " saran"
      : filtered.length + " dari " + total + " saran";
  return pager.pages > 1
    ? base + " &middot; halaman " + pager.page + " dari " + pager.pages
    : base;
}

function renderAdminSuggestions() {
  const filtered = filteredAdminSuggestions();
  const pager = paginate(filtered, state.ui.suggestionPage, PAGE_SIZE);
  state.ui.suggestionPage = pager.page;
  const summary = summaryCounts();

  return `
    <div class="stats-grid mb-4">
      ${statCard("Saran baru", String(summary.baru), "Belum dibaca")}
      ${statCard("Dibaca", String(summary.dibaca), "Sudah dilihat")}
      ${statCard("Diproses", String(summary.diproses), "Sedang ditangani")}
      ${statCard("Selesai", String(summary.selesai), "Sudah ditindaklanjuti")}
    </div>
    <div class="card rounded-4 border-0 shadow-sm">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div>
            <h2 class="h5 fw-bold mb-1">Kotak saran peserta</h2>
            <div class="small text-secondary" id="suggestion-count">${adminListSummary(filtered, pager)}</div>
          </div>
          <button class="btn btn-outline-secondary rounded-pill px-3" id="suggestion-refresh" type="button">
            <i class="bi bi-arrow-clockwise me-2"></i>Muat ulang
          </button>
        </div>
        ${renderLoadAlert()}
        <div class="row g-2 mb-3 mt-1">
          <div class="col-12 col-md-6">
            <input id="suggestion-search" class="form-control rounded-3" type="search" placeholder="Cari nama, isi saran, atau balasan..." value="${esc(state.ui.suggestionSearch)}" />
          </div>
          <div class="col-7 col-md-4">
            <select id="suggestion-status-filter" class="form-select rounded-3">
              <option value="">Semua status</option>
              ${Object.keys(STATUS_LABELS)
                .map(
                  (value) =>
                    '<option value="' +
                    esc(value) +
                    '"' +
                    (state.ui.suggestionStatus === value ? " selected" : "") +
                    ">" +
                    esc(STATUS_LABELS[value]) +
                    "</option>"
                )
                .join("")}
            </select>
          </div>
          <div class="col-5 col-md-2">
            <button class="btn btn-outline-secondary rounded-3 w-100" id="suggestion-reset" type="button">Reset</button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm align-middle table-stack">
            <thead>
              <tr>
                <th>Pengirim</th>
                <th>Kategori</th>
                <th>Saran</th>
                <th>Status</th>
                <th>Balasan</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody id="suggestion-table-body">${renderAdminRows(pager.items)}</tbody>
          </table>
        </div>
        <div id="suggestion-pagination" class="mt-3">${renderPagination(pager.page, pager.pages, "Navigasi saran")}</div>
      </div>
    </div>
  `;
}

function renderInternList() {
  if (!listReady()) {
    return '<div class="suggestion-empty"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Memuat saran Anda...</div>';
  }
  if (!state.suggestions.length) {
    return '<div class="suggestion-empty"><i class="bi bi-chat-square-text"></i><div><strong>Belum ada saran</strong><p>Kirim masukan pertama Anda melalui formulir di samping.</p></div></div>';
  }
  return state.suggestions
    .map((item) => {
      const reply = item.admin_reply
        ? '<div class="suggestion-reply"><div class="suggestion-reply-title"><i class="bi bi-reply-fill"></i> Balasan admin</div><p>' +
          esc(item.admin_reply) +
          '</p><div class="small text-secondary">' +
          esc(formatDateTime(item.updated_at)) +
          "</div></div>"
        : '<div class="small text-secondary mt-2">Belum ada balasan dari admin.</div>';
      return `
        <article class="suggestion-item">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div>${categoryBadge(item.category)}</div>
            <div class="text-end">
              ${statusBadge(item.status)}
              <div class="small text-secondary mt-1">${esc(formatDateTime(item.created_at))}</div>
            </div>
          </div>
          <p class="suggestion-message">${esc(item.message)}</p>
          ${reply}
        </article>
      `;
    })
    .join("");
}

function renderInternSuggestions() {
  const draft = String(state.suggestionDraft || "");
  const length = draft.length;
  return `
    <div class="row g-3">
      <div class="col-12 col-lg-5">
        <div class="card rounded-4 border-0 shadow-sm h-100">
          <div class="card-body p-3 p-md-4">
            <div class="card-section-head">
              <span class="card-section-icon"><i class="bi bi-chat-square-text"></i></span>
              <div>
                <h2 class="h5 fw-bold mb-0">Kirim saran</h2>
                <div class="small text-secondary">Masukan Anda membantu perbaikan aplikasi absensi.</div>
              </div>
            </div>
            <form id="suggestion-form" novalidate>
              <div class="mb-3">
                <label class="form-label small fw-semibold" for="suggestion-category">Kategori</label>
                <select id="suggestion-category" class="form-select rounded-3">
                  ${categoryOptions(state.suggestionCategory || "umum")}
                </select>
              </div>
              <div class="mb-2">
                <label class="form-label small fw-semibold" for="suggestion-message">Isi saran</label>
                <textarea id="suggestion-message" class="form-control rounded-3" rows="6" minlength="5" maxlength="1500" placeholder="Tulis masukan, kendala, atau ide fitur..." required>${esc(draft)}</textarea>
                <div class="d-flex justify-content-between small text-secondary mt-1">
                  <span>Minimal 5 karakter.</span>
                  <span id="suggestion-length">${length} / 1500</span>
                </div>
              </div>
              <button class="btn btn-primary rounded-3 w-100" id="suggestion-submit" type="submit">
                <i class="bi bi-send me-2"></i>Kirim saran
              </button>
            </form>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-7">
        <div class="card rounded-4 border-0 shadow-sm h-100">
          <div class="card-body p-3 p-md-4">
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
              <div>
                <h2 class="h5 fw-bold mb-0">Saran saya</h2>
                <div class="small text-secondary">Status dan balasan admin untuk masukan Anda.</div>
              </div>
              <button class="btn btn-outline-secondary rounded-pill px-3" id="suggestion-refresh" type="button">
                <i class="bi bi-arrow-clockwise me-2"></i>Muat ulang
              </button>
            </div>
            ${renderLoadAlert()}
            <div class="suggestion-list">${renderInternList()}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderSuggestions() {
  return roleKey() === "admin" ? renderAdminSuggestions() : renderInternSuggestions();
}

async function loadSuggestions(role, context, options) {
  const opts = options || {};
  if (state.suggestionLoading) return;
  if (!opts.force && state.suggestionLoadedFor === role) return;

  state.suggestionLoading = true;
  state.suggestionError = "";
  if (context && typeof context.rerender === "function") context.rerender();

  try {
    if (role === "admin") {
      const result = await rpc("admin_list_suggestions", {
        p_status: "",
        p_limit: 200,
        p_offset: 0
      });
      state.suggestions = (result && result.suggestions) || [];
      state.suggestionSummary = (result && result.summary) || null;
    } else {
      const result = await rpc("app_my_suggestions", { p_limit: 100 });
      state.suggestions = (result && result.suggestions) || [];
      state.suggestionSummary = null;
    }
    state.suggestionLoadedFor = role;
  } catch (error) {
    state.suggestionError = error && error.message ? error.message : "Gagal memuat kotak saran.";
    state.suggestionLoadedFor = role;
  } finally {
    state.suggestionLoading = false;
    if (context && typeof context.rerender === "function") context.rerender();
  }
}

function refreshAdminTable() {
  const filtered = filteredAdminSuggestions();
  const pager = paginate(filtered, state.ui.suggestionPage, PAGE_SIZE);
  state.ui.suggestionPage = pager.page;

  const body = document.getElementById("suggestion-table-body");
  if (body) body.innerHTML = renderAdminRows(pager.items);
  const count = document.getElementById("suggestion-count");
  if (count) count.innerHTML = adminListSummary(filtered, pager);
  const pagerElement = document.getElementById("suggestion-pagination");
  if (pagerElement) {
    pagerElement.innerHTML = renderPagination(pager.page, pager.pages, "Navigasi saran");
  }
}

function bindRetry(context) {
  const retry = document.getElementById("suggestion-retry");
  if (retry) {
    retry.addEventListener("click", () => loadSuggestions(roleKey(), context, { force: true }));
  }
}

function bindRefresh(context) {
  const refresh = document.getElementById("suggestion-refresh");
  if (refresh) {
    refresh.addEventListener("click", () =>
      loadSuggestions(roleKey(), context, { force: true })
    );
  }
}

function bindAdminEvents(context) {
  const search = document.getElementById("suggestion-search");
  if (search) {
    search.addEventListener("input", () => {
      state.ui.suggestionSearch = search.value;
      state.ui.suggestionPage = 1;
      refreshAdminTable();
    });
  }
  const status = document.getElementById("suggestion-status-filter");
  if (status) {
    status.addEventListener("change", () => {
      state.ui.suggestionStatus = status.value;
      state.ui.suggestionPage = 1;
      refreshAdminTable();
    });
  }
  const reset = document.getElementById("suggestion-reset");
  if (reset) {
    reset.addEventListener("click", () => {
      state.ui.suggestionSearch = "";
      state.ui.suggestionStatus = "";
      state.ui.suggestionPage = 1;
      if (typeof context.rerender === "function") context.rerender();
    });
  }
  const pager = document.getElementById("suggestion-pagination");
  if (pager) {
    pager.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button) return;
      state.ui.suggestionPage = Number(button.dataset.page) || 1;
      refreshAdminTable();
    });
  }
  const body = document.getElementById("suggestion-table-body");
  if (body) {
    body.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const item = state.suggestions.find(
        (row) => String(row.id) === String(button.dataset.id)
      );
      if (!item) return;
      if (button.dataset.action === "reply-suggestion") {
        openSuggestionDialog(item, context);
      } else if (button.dataset.action === "delete-suggestion") {
        deleteSuggestion(item, button, context);
      }
    });
  }
}

function bindInternEvents(context) {
  const form = document.getElementById("suggestion-form");
  const message = document.getElementById("suggestion-message");
  const category = document.getElementById("suggestion-category");
  const length = document.getElementById("suggestion-length");

  if (message) {
    message.addEventListener("input", () => {
      state.suggestionDraft = message.value;
      if (length) length.textContent = message.value.length + " / 1500";
    });
  }
  if (category) {
    category.addEventListener("change", () => {
      state.suggestionCategory = category.value;
    });
  }
  if (form) {
    form.addEventListener("submit", (event) => submitSuggestion(event, context));
  }
}

export function attachSuggestionsEvents(context) {
  const ctx = context || {};
  const role = roleKey();
  if (state.suggestionLoadedFor !== role) {
    loadSuggestions(role, ctx);
  }
  bindRetry(ctx);
  bindRefresh(ctx);
  if (role === "admin") bindAdminEvents(ctx);
  else bindInternEvents(ctx);
}

async function submitSuggestion(event, context) {
  event.preventDefault();
  const message = String(state.suggestionDraft || "").trim();
  const category = String(state.suggestionCategory || "umum");
  if (message.length < 5) {
    toast("Saran minimal 5 karakter.", "danger");
    return;
  }
  if (message.length > 1500) {
    toast("Saran maksimal 1500 karakter.", "danger");
    return;
  }

  const confirmed = await confirmDialog({
    title: "Kirim saran?",
    message: "Saran akan dikirim ke admin dengan kategori " + categoryLabel(category) + ".",
    confirmLabel: "Kirim saran",
    tone: "primary",
    secondMessage:
      "Pastikan isi saran sudah benar. Admin dapat membaca dan membalas saran ini."
  });
  if (!confirmed) return;

  const button = document.getElementById("suggestion-submit");
  const restore = withBusy(button, "Mengirim...");
  try {
    const result = await rpc("app_submit_suggestion", {
      p_category: category,
      p_message: message
    });
    state.suggestionDraft = "";
    state.suggestionCategory = "umum";
    toast((result && result.message) || "Saran berhasil dikirim.", "success");
    await loadSuggestions("intern", context, { force: true });
  } catch (error) {
    handleError(error);
  } finally {
    restore();
  }
}

function openSuggestionDialog(item, context) {
  const dialogId = "suggestion-dialog-" + Date.now();
  const { element, modal } = createModal(`
    <div class="modal fade" id="${dialogId}" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content rounded-4 border-0">
          <form novalidate>
            <div class="modal-header border-0 pb-0">
              <div>
                <h2 class="h5 fw-bold mb-0">Balas saran</h2>
                <div class="small text-secondary">${esc(item.name || "-")} &middot; @${esc(item.username || "-")}</div>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Tutup"></button>
            </div>
            <div class="modal-body">
              <div class="suggestion-quote">${esc(item.message)}</div>
              <div class="mb-3 mt-3">
                <label class="form-label small fw-semibold" for="${dialogId}-status">Status</label>
                <select id="${dialogId}-status" class="form-select rounded-3">
                  ${statusOptions(item.status || "baru")}
                </select>
              </div>
              <div>
                <label class="form-label small fw-semibold" for="${dialogId}-reply">Balasan admin</label>
                <textarea id="${dialogId}-reply" class="form-control rounded-3" rows="5" maxlength="2000" placeholder="Tulis balasan atau catatan tindak lanjut...">${esc(item.admin_reply || "")}</textarea>
                <div class="form-text">Maksimal 2000 karakter. Balasan akan terlihat oleh peserta.</div>
              </div>
            </div>
            <div class="modal-footer border-0 pt-0">
              <button type="button" class="btn btn-outline-secondary rounded-pill px-4" data-bs-dismiss="modal">Batal</button>
              <button class="btn btn-primary rounded-pill px-4" id="${dialogId}-save" type="submit">Simpan</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);

  const form = element.querySelector("form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = element.querySelector("#" + dialogId + "-status").value;
    const reply = element.querySelector("#" + dialogId + "-reply").value.trim();
    if (reply.length > 2000) {
      toast("Balasan admin maksimal 2000 karakter.", "danger");
      return;
    }

    const confirmed = await confirmDialog({
      title: "Simpan balasan?",
      message: "Status akan diubah menjadi " + statusLabel(status) + ".",
      confirmLabel: "Simpan balasan",
      tone: "primary",
      secondMessage:
        "Balasan dan status akan langsung terlihat oleh peserta. Pastikan sudah diperiksa."
    });
    if (!confirmed) return;

    const button = element.querySelector("#" + dialogId + "-save");
    const restore = withBusy(button, "Menyimpan...");
    try {
      const result = await rpc("admin_update_suggestion", {
        p_id: item.id,
        p_status: status,
        p_reply: reply
      });
      modal.hide();
      toast((result && result.message) || "Saran berhasil diperbarui.", "success");
      await loadSuggestions("admin", context, { force: true });
    } catch (error) {
      handleError(error);
    } finally {
      restore();
    }
  });

  element.addEventListener("hidden.bs.modal", () => element.remove());
  modal.show();
}

async function deleteSuggestion(item, button, context) {
  const confirmed = await confirmDialog({
    title: "Hapus saran?",
    message: "Saran dari " + (item.name || "-") + " akan dihapus permanen.",
    confirmLabel: "Hapus saran",
    tone: "danger",
    secondMessage:
      "Saran, balasan, dan riwayat tindak lanjutnya tidak dapat dikembalikan."
  });
  if (!confirmed) return;

  const restore = withBusy(button, "Menghapus...");
  try {
    const result = await rpc("admin_delete_suggestion", { p_id: item.id });
    toast((result && result.message) || "Saran berhasil dihapus.", "success");
    await loadSuggestions("admin", context, { force: true });
  } catch (error) {
    handleError(error);
  } finally {
    restore();
  }
}
