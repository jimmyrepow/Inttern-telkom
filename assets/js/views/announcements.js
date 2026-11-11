import { state, invalidateAdminAchievements } from "../core/store.js";
import { rpc, handleError } from "../core/api.js";
import { esc, toast, withBusy, confirmDialog, createModal } from "../lib/dom.js";
import { formatDateTime } from "../lib/format.js";
import { statCard } from "../lib/render.js";
import { paginate, renderPagination } from "../lib/pagination.js";

const PAGE_SIZE = 8;
const CATEGORIES = { info: "Info", penting: "Penting", agenda: "Agenda" };

function roleKey() {
  return String((state.user && state.user.role) || "intern").toLowerCase() === "admin"
    ? "admin"
    : "intern";
}

function categoryLabel(value) {
  return CATEGORIES[value] || CATEGORIES.info;
}

function categoryBadge(value) {
  const category = String(value || "info");
  const tone =
    category === "penting"
      ? "bg-danger"
      : category === "agenda"
        ? "bg-primary"
        : "bg-info text-dark";
  return '<span class="badge ' + tone + ' rounded-pill">' + esc(categoryLabel(category)) + "</span>";
}

function adminItems() {
  if (state.announcementsLoadedFor === "admin") return state.adminAnnouncements || [];
  return state.announcements || [];
}

function filteredAdminItems() {
  const term = String(state.ui.announcementSearch || "").trim().toLowerCase();
  const status = String(state.ui.announcementStatus || "");
  return adminItems().filter((item) => {
    if (status === "active" && !item.active) return false;
    if (status === "inactive" && item.active) return false;
    if (!term) return true;
    return [item.title, item.body, item.category, item.created_by]
      .join(" ")
      .toLowerCase()
      .indexOf(term) !== -1;
  });
}

function renderAdminRows(rows) {
  if (!rows.length) {
    return '<tr><td colspan="6" class="text-center text-secondary py-4">Belum ada pengumuman.</td></tr>';
  }
  return rows
    .map(
      (item) => `
      <tr>
        <td data-label="Judul">
          <div class="fw-semibold">${esc(item.title)}</div>
          <div class="small text-secondary text-break-anywhere">${esc(item.body).slice(0, 140)}${String(item.body || "").length > 140 ? "..." : ""}</div>
        </td>
        <td data-label="Kategori">${categoryBadge(item.category)}</td>
        <td data-label="Tanggal kegiatan" class="text-nowrap">${esc(item.event_date || "-")}</td>
        <td data-label="Status">${item.active ? '<span class="badge bg-success rounded-pill">Aktif</span>' : '<span class="badge bg-secondary rounded-pill">Nonaktif</span>'}</td>
        <td data-label="Dibuat" class="small text-secondary">${esc(item.created_by || "-")}<br />${esc(formatDateTime(item.created_at))}</td>
        <td data-label="Aksi">
          <div class="table-actions">
            <button class="btn btn-sm btn-icon is-primary" type="button" data-announcement-action="edit" data-id="${esc(item.id)}" title="Edit" aria-label="Edit pengumuman ${esc(item.title)}"><i class="bi bi-pencil-square" aria-hidden="true"></i></button>
            <button class="btn btn-sm btn-icon is-warning" type="button" data-announcement-action="toggle" data-id="${esc(item.id)}" title="${item.active ? "Nonaktifkan" : "Aktifkan"}" aria-label="${item.active ? "Nonaktifkan" : "Aktifkan"} pengumuman ${esc(item.title)}"><i class="bi ${item.active ? "bi-eye-slash" : "bi-eye"}" aria-hidden="true"></i></button>
            <button class="btn btn-sm btn-icon is-danger" type="button" data-announcement-action="delete" data-id="${esc(item.id)}" title="Hapus" aria-label="Hapus pengumuman ${esc(item.title)}"><i class="bi bi-trash3" aria-hidden="true"></i></button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");
}

function renderAdmin() {
  const items = adminItems();
  const filtered = filteredAdminItems();
  const pager = paginate(filtered, state.ui.announcementPage, PAGE_SIZE);
  state.ui.announcementPage = pager.page;
  const active = items.filter((item) => item.active).length;
  const agenda = items.filter((item) => item.category === "agenda").length;
  const summary =
    filtered.length === items.length
      ? items.length + " pengumuman"
      : filtered.length + " dari " + items.length + " pengumuman";

  return `
    <div class="stats-grid mb-4">
      ${statCard("Total pengumuman", items.length)}
      ${statCard("Aktif", active, "Tampil ke peserta")}
      ${statCard("Agenda", agenda, "Memiliki tanggal kegiatan")}
      ${statCard("Nonaktif", items.length - active)}
    </div>
    <div class="card rounded-4 border-0 shadow-sm">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div>
            <h2 class="h5 fw-bold mb-1">Pengumuman &amp; agenda</h2>
            <div class="small text-secondary">${esc(summary)}</div>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-outline-secondary rounded-pill px-3" id="announcement-refresh" type="button"><i class="bi bi-arrow-clockwise me-2"></i>Muat ulang</button>
            <button class="btn btn-primary rounded-pill px-4" id="announcement-add" type="button"><i class="bi bi-plus-lg me-2"></i>Buat pengumuman</button>
          </div>
        </div>
        ${renderLoadAlert()}
        <div class="row g-2 mb-3">
          <div class="col-12 col-md-6">
            <input id="announcement-search" class="form-control rounded-3" type="search" placeholder="Cari judul, isi, atau pembuat..." value="${esc(state.ui.announcementSearch)}" />
          </div>
          <div class="col-7 col-md-4">
            <select id="announcement-status" class="form-select rounded-3">
              <option value="">Semua status</option>
              <option value="active"${state.ui.announcementStatus === "active" ? " selected" : ""}>Aktif</option>
              <option value="inactive"${state.ui.announcementStatus === "inactive" ? " selected" : ""}>Nonaktif</option>
            </select>
          </div>
          <div class="col-5 col-md-2">
            <button class="btn btn-outline-secondary rounded-3 w-100" id="announcement-reset" type="button">Reset</button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm align-middle table-stack mb-0">
            <thead>
              <tr>
                <th>Judul</th>
                <th>Kategori</th>
                <th>Tanggal kegiatan</th>
                <th>Status</th>
                <th>Dibuat</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody id="announcement-table-body">${renderAdminRows(pager.items)}</tbody>
          </table>
        </div>
        <div id="announcement-pagination" class="mt-3">${renderPagination(pager.page, pager.pages, "Navigasi pengumuman")}</div>
      </div>
    </div>
  `;
}

function renderLoadAlert() {
  if (state.announcementsError) {
    return `<div class="alert alert-danger small d-flex justify-content-between align-items-center flex-wrap gap-2" role="alert"><span>${esc(state.announcementsError)}</span><button class="btn btn-sm btn-outline-danger rounded-pill" id="announcement-retry" type="button">Coba lagi</button></div>`;
  }
  if (state.announcementsLoading && state.announcementsLoadedFor !== "admin") {
    return '<div class="alert alert-light border small" role="status"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Memuat pengumuman...</div>';
  }
  return "";
}

function renderInternCard(item) {
  return `
    <article class="announcement-card is-${esc(item.category || "info")}">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div>
          ${categoryBadge(item.category)}
          ${item.event_date ? '<span class="announcement-date"><i class="bi bi-calendar-event"></i> ' + esc(item.event_date) + "</span>" : ""}
        </div>
        <span class="small text-secondary text-nowrap">${esc(formatDateTime(item.created_at))}</span>
      </div>
      <h3>${esc(item.title)}</h3>
      <p>${esc(item.body)}</p>
      <div class="small text-secondary">Oleh ${esc(item.created_by || "admin")}</div>
    </article>
  `;
}

function renderIntern() {
  const items = state.announcements || [];
  return `
    <div class="card rounded-4 border-0 shadow-sm">
      <div class="card-body p-3 p-md-4">
        <div class="card-section-head">
          <span class="card-section-icon"><i class="bi bi-megaphone"></i></span>
          <div>
            <h2 class="h5 fw-bold mb-0">Pengumuman &amp; agenda</h2>
            <div class="small text-secondary">Informasi terbaru dari admin untuk peserta magang.</div>
          </div>
        </div>
        ${
          items.length
            ? '<div class="announcement-list">' + items.map(renderInternCard).join("") + "</div>"
            : '<div class="suggestion-empty"><i class="bi bi-megaphone"></i><div><strong>Belum ada pengumuman</strong><p>Pengumuman dari admin akan muncul di sini.</p></div></div>'
        }
      </div>
    </div>
  `;
}

export function renderAnnouncements() {
  return roleKey() === "admin" ? renderAdmin() : renderIntern();
}

function refreshAdminTable() {
  const filtered = filteredAdminItems();
  const pager = paginate(filtered, state.ui.announcementPage, PAGE_SIZE);
  state.ui.announcementPage = pager.page;
  const body = document.getElementById("announcement-table-body");
  if (body) body.innerHTML = renderAdminRows(pager.items);
  const pagerElement = document.getElementById("announcement-pagination");
  if (pagerElement) {
    pagerElement.innerHTML = renderPagination(pager.page, pager.pages, "Navigasi pengumuman");
  }
}

async function loadAdminAnnouncements(context, options) {
  const opts = options || {};
  if (state.announcementsLoading) return;
  if (!opts.force && state.announcementsLoadedFor === "admin") return;
  state.announcementsLoading = true;
  state.announcementsError = "";
  try {
    const result = await rpc("admin_list_announcements", { p_limit: 200 });
    state.adminAnnouncements = Array.isArray(result && result.announcements)
      ? result.announcements
      : [];
    state.announcementsLoadedFor = "admin";
  } catch (error) {
    state.announcementsError =
      (error && error.message) || "Gagal memuat pengumuman.";
    state.announcementsLoadedFor = "admin";
  } finally {
    state.announcementsLoading = false;
    if (context && typeof context.rerender === "function") context.rerender();
  }
}

export function attachAnnouncementsEvents(context) {
  if (roleKey() !== "admin") return;
  if (state.announcementsLoadedFor !== "admin") {
    loadAdminAnnouncements(context);
  }

  const add = document.getElementById("announcement-add");
  if (add) add.addEventListener("click", () => openAnnouncementDialog(context, null));

  const refresh = document.getElementById("announcement-refresh");
  if (refresh) {
    refresh.addEventListener("click", () =>
      loadAdminAnnouncements(context, { force: true })
    );
  }
  const retry = document.getElementById("announcement-retry");
  if (retry) {
    retry.addEventListener("click", () =>
      loadAdminAnnouncements(context, { force: true })
    );
  }

  const search = document.getElementById("announcement-search");
  if (search) {
    search.addEventListener("input", () => {
      state.ui.announcementSearch = search.value;
      state.ui.announcementPage = 1;
      refreshAdminTable();
    });
  }
  const status = document.getElementById("announcement-status");
  if (status) {
    status.addEventListener("change", () => {
      state.ui.announcementStatus = status.value;
      state.ui.announcementPage = 1;
      refreshAdminTable();
    });
  }
  const reset = document.getElementById("announcement-reset");
  if (reset) {
    reset.addEventListener("click", () => {
      state.ui.announcementSearch = "";
      state.ui.announcementStatus = "";
      state.ui.announcementPage = 1;
      if (typeof context.rerender === "function") context.rerender();
    });
  }

  const pager = document.getElementById("announcement-pagination");
  if (pager) {
    pager.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button) return;
      state.ui.announcementPage = Number(button.dataset.page) || 1;
      refreshAdminTable();
    });
  }

  const body = document.getElementById("announcement-table-body");
  if (body) {
    body.addEventListener("click", (event) => {
      const button = event.target.closest("[data-announcement-action]");
      if (!button) return;
      const item = adminItems().find((row) => String(row.id) === String(button.dataset.id));
      if (!item) return;
      if (button.dataset.announcementAction === "edit") {
        openAnnouncementDialog(context, item);
      } else if (button.dataset.announcementAction === "toggle") {
        toggleAnnouncement(item, context);
      } else if (button.dataset.announcementAction === "delete") {
        deleteAnnouncement(item, context);
      }
    });
  }
}

function openAnnouncementDialog(context, item) {
  const editing = Boolean(item);
  const dialogId = "announcement-dialog-" + Date.now();
  const initialCategory = editing ? item.category || "info" : "info";
  const { element, modal } = createModal(`
    <div class="modal fade" id="${dialogId}" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content rounded-4 border-0">
          <form novalidate>
            <div class="modal-header border-0 pb-0">
              <div>
                <h2 class="h5 fw-bold mb-0">${editing ? "Edit pengumuman" : "Buat pengumuman"}</h2>
                <div class="small text-secondary">${editing ? "Perbarui informasi untuk peserta." : "Bagikan informasi atau agenda baru."}</div>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Tutup"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label small fw-semibold" for="${dialogId}-title">Judul</label>
                <input id="${dialogId}-title" class="form-control rounded-3" type="text" minlength="3" maxlength="120" value="${editing ? esc(item.title) : ""}" required />
              </div>
              <div class="row g-2">
                <div class="col-7">
                  <label class="form-label small fw-semibold" for="${dialogId}-category">Kategori</label>
                  <select id="${dialogId}-category" class="form-select rounded-3">
                    ${Object.keys(CATEGORIES)
                      .map(
                        (value) =>
                          '<option value="' +
                          value +
                          '"' +
                          (value === initialCategory ? " selected" : "") +
                          ">" +
                          CATEGORIES[value] +
                          "</option>"
                      )
                      .join("")}
                  </select>
                </div>
                <div class="col-5">
                  <label class="form-label small fw-semibold" for="${dialogId}-date">Tanggal kegiatan</label>
                  <input id="${dialogId}-date" class="form-control rounded-3" type="date" value="${editing && item.event_date ? esc(item.event_date) : ""}" />
                </div>
              </div>
              <div class="mt-3">
                <label class="form-label small fw-semibold" for="${dialogId}-body">Isi pengumuman</label>
                <textarea id="${dialogId}-body" class="form-control rounded-3" rows="5" minlength="3" maxlength="2000" required>${editing ? esc(item.body) : ""}</textarea>
                <div class="form-text">3-2000 karakter. Untuk kategori agenda, tanggal kegiatan wajib diisi.</div>
              </div>
              <div class="form-check mt-3">
                <input id="${dialogId}-active" class="form-check-input" type="checkbox" ${editing && item.active === false ? "" : "checked"} />
                <label class="form-check-label small fw-semibold" for="${dialogId}-active">Tampilkan ke peserta</label>
              </div>
              <div class="alert alert-danger small py-2 px-3 mt-3 mb-0 d-none" data-error role="alert" aria-live="polite"></div>
            </div>
            <div class="modal-footer border-0 pt-0">
              <button class="btn btn-outline-secondary rounded-pill px-4" type="button" data-bs-dismiss="modal">Batal</button>
              <button class="btn btn-primary rounded-pill px-4" type="submit">${editing ? "Simpan perubahan" : "Buat pengumuman"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);

  const form = element.querySelector("form");
  const errorBox = element.querySelector("[data-error]");
  const categoryInput = element.querySelector("#" + dialogId + "-category");
  const dateInput = element.querySelector("#" + dialogId + "-date");
  const submit = element.querySelector('button[type="submit"]');

  categoryInput.addEventListener("change", () => {
    dateInput.disabled = categoryInput.value !== "agenda";
    if (categoryInput.value !== "agenda") dateInput.value = "";
  });
  dateInput.disabled = categoryInput.value !== "agenda";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.classList.add("d-none");
    const title = element.querySelector("#" + dialogId + "-title").value.trim();
    const body = element.querySelector("#" + dialogId + "-body").value.trim();
    const category = categoryInput.value;
    const eventDate = category === "agenda" ? dateInput.value : "";
    const active = element.querySelector("#" + dialogId + "-active").checked;

    if (title.length < 3) {
      errorBox.textContent = "Judul minimal 3 karakter.";
      errorBox.classList.remove("d-none");
      return;
    }
    if (body.length < 3) {
      errorBox.textContent = "Isi pengumuman minimal 3 karakter.";
      errorBox.classList.remove("d-none");
      return;
    }
    if (category === "agenda" && !eventDate) {
      errorBox.textContent = "Kategori agenda wajib memiliki tanggal kegiatan.";
      errorBox.classList.remove("d-none");
      return;
    }

    const restore = withBusy(submit, "Menyimpan...");
    try {
      const result = await rpc("admin_save_announcement", {
        p_id: editing ? item.id : null,
        p_title: title,
        p_body: body,
        p_category: category,
        p_event_date: eventDate || null,
        p_active: active
      });
      modal.hide();
      toast(
        (result && result.message) ||
          (editing ? "Pengumuman diperbarui." : "Pengumuman dibuat."),
        "success"
      );
      invalidateAdminAchievements();
      await loadAdminAnnouncements(context, { force: true });
    } catch (error) {
      errorBox.textContent = (error && error.message) || "Gagal menyimpan pengumuman.";
      errorBox.classList.remove("d-none");
      handleError(error);
    } finally {
      restore();
    }
  });

  element.addEventListener("hidden.bs.modal", () => element.remove());
  modal.show();
}

async function toggleAnnouncement(item, context) {
  const nextActive = item.active === false;
  try {
    const result = await rpc("admin_save_announcement", {
      p_id: item.id,
      p_title: item.title,
      p_body: item.body,
      p_category: item.category || "info",
      p_event_date: item.event_date || null,
      p_active: nextActive
    });
    toast(
      (result && result.message) ||
        (nextActive ? "Pengumuman diaktifkan." : "Pengumuman dinonaktifkan."),
      "success"
    );
    invalidateAdminAchievements();
    await loadAdminAnnouncements(context, { force: true });
  } catch (error) {
    handleError(error);
  }
}

async function deleteAnnouncement(item, context) {
  const confirmed = await confirmDialog({
    title: "Hapus pengumuman?",
    message: "Pengumuman \"" + item.title + "\" akan dihapus permanen.",
    confirmLabel: "Hapus pengumuman",
    tone: "danger",
    secondMessage: "Pengumuman tidak dapat dikembalikan setelah dihapus."
  });
  if (!confirmed) return;

  try {
    const result = await rpc("admin_delete_announcement", { p_id: item.id });
    toast((result && result.message) || "Pengumuman dihapus.", "success");
    invalidateAdminAchievements();
    await loadAdminAnnouncements(context, { force: true });
  } catch (error) {
    handleError(error);
  }
}
