import { state } from "../../core/store.js";
import { rpc, handleError } from "../../core/api.js";
import {
  esc,
  toast,
  withBusy,
  confirmDialog,
  passwordDialog,
  createModal
} from "../../lib/dom.js";
import { formatDateTime, isActiveUser } from "../../lib/format.js";
import { renderAvatar } from "../../lib/avatar.js";
import { openActionMenu } from "../../lib/action-menu.js";
import { paginate, renderPagination } from "../../lib/pagination.js";
import { removePhotos } from "../../services/photo.js";

const PAGE_SIZE = 8;

function getFilteredUsers() {
  const term = String(state.ui.userSearch || "").trim().toLowerCase();
  const role = String(state.ui.userRole || "").toLowerCase();
  return state.users.filter((user) => {
    if (role && String(user.role || "intern").toLowerCase() !== role) return false;
    if (term) {
      const haystack = [user.name, user.username, user.role].join(" ").toLowerCase();
      if (haystack.indexOf(term) === -1) return false;
    }
    return true;
  });
}

function usersSummary(filtered, pager) {
  const total = state.users.length;
  const base =
    filtered.length === total ? total + " akun" : filtered.length + " dari " + total + " akun";
  return pager.pages > 1 ? base + " · halaman " + pager.page + " dari " + pager.pages : base;
}

function renderUserRows(rows) {
  if (!rows.length) {
    return '<tr><td colspan="6" class="text-center text-secondary py-4">Tidak ada akun yang cocok.</td></tr>';
  }
  return rows
    .map((user) => {
      const role = String(user.role || "intern").toLowerCase();
      const accountLines = [
        '<div class="small text-secondary">Login: ' + esc(formatDateTime(user.last_login_at)) + "</div>",
        '<div class="small text-secondary">Password: ' + esc(formatDateTime(user.password_updated_at)) + "</div>"
      ];
      return `
        <tr>
          <td data-label="Nama">
            <div class="d-flex align-items-center gap-2">
              ${renderAvatar(user, "avatar-sm")}
              <div class="min-w-0">
                <div class="fw-semibold">${esc(user.name)}</div>
                <div class="small text-secondary">${esc(String(user.id).slice(0, 8))}</div>
              </div>
            </div>
          </td>
          <td data-label="Username">${esc(user.username)}</td>
          <td data-label="Role"><span class="badge ${role === "admin" ? "bg-dark" : "bg-light text-dark"} rounded-pill">${esc(role)}</span></td>
          <td data-label="Status">${isActiveUser(user) ? '<span class="badge bg-success rounded-pill">Aktif</span>' : '<span class="badge bg-secondary rounded-pill">Nonaktif</span>'}</td>
          <td class="small" data-label="Akun">${accountLines.join("")}</td>
          <td data-label="Aksi">
            <div class="table-actions">
              <button class="btn btn-sm btn-icon action-trigger" type="button" data-action="user-menu" data-user-id="${esc(user.id)}" aria-label="Aksi untuk ${esc(user.name)}" aria-haspopup="menu" aria-expanded="false" title="Aksi">
                <i class="bi bi-three-dots-vertical" aria-hidden="true"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function refreshUsersTable() {
  const filtered = getFilteredUsers();
  const pager = paginate(filtered, state.ui.userPage, PAGE_SIZE);
  state.ui.userPage = pager.page;

  const body = document.getElementById("users-table-body");
  if (body) body.innerHTML = renderUserRows(pager.items);
  const count = document.getElementById("users-count");
  if (count) count.textContent = usersSummary(filtered, pager);
  const pagerElement = document.getElementById("users-pagination");
  if (pagerElement) {
    pagerElement.innerHTML = renderPagination(pager.page, pager.pages, "Navigasi akun");
  }
}

export function renderAdminUsersTab() {
  const filtered = getFilteredUsers();
  const pager = paginate(filtered, state.ui.userPage, PAGE_SIZE);
  state.ui.userPage = pager.page;

  return `
    <div class="card rounded-4 border-0 shadow-sm">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div>
            <h2 class="h5 fw-bold mb-1">Daftar akun</h2>
            <div class="small text-secondary" id="users-count">${usersSummary(filtered, pager)}</div>
          </div>
          <button class="btn btn-primary rounded-pill px-4" id="user-add" type="button">
            <i class="bi bi-person-plus me-2"></i>Tambah peserta
          </button>
        </div>
        <div class="row g-2 mb-3">
          <div class="col-12 col-md-6">
            <input id="user-search" class="form-control rounded-3" type="search" placeholder="Cari nama atau username..." value="${esc(state.ui.userSearch)}" />
          </div>
          <div class="col-6 col-md-3">
            <select id="user-role-filter" class="form-select rounded-3">
              <option value="">Semua role</option>
              <option value="intern"${state.ui.userRole === "intern" ? " selected" : ""}>Intern</option>
              <option value="admin"${state.ui.userRole === "admin" ? " selected" : ""}>Admin</option>
            </select>
          </div>
          <div class="col-6 col-md-3">
            <button class="btn btn-outline-secondary rounded-3 w-100" id="user-reset" type="button">Reset filter</button>
          </div>
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
            <tbody id="users-table-body">${renderUserRows(pager.items)}</tbody>
          </table>
        </div>
        <div id="users-pagination" class="mt-3">${renderPagination(pager.page, pager.pages, "Navigasi akun")}</div>
        <div class="alert alert-light border small mt-3 mb-0">
          <div class="fw-semibold mb-1">Tentang penyimpanan password</div>
          Password disimpan sebagai hash bcrypt di kolom <code>users.password</code>. Hash tidak dapat dibaca kembali. Gunakan tombol <span class="fw-semibold">Reset password</span> untuk mengganti password peserta tanpa perlu melihat password lama.
        </div>
      </div>
    </div>
  `;
}

export function attachAdminUsers(context) {
  const rerender = context.rerender;
  const refresh = context.refresh;

  const add = document.getElementById("user-add");
  if (add) add.addEventListener("click", () => openUserDialog(context));

  const search = document.getElementById("user-search");
  if (search) {
    search.addEventListener("input", () => {
      state.ui.userSearch = search.value;
      state.ui.userPage = 1;
      refreshUsersTable();
    });
  }
  const role = document.getElementById("user-role-filter");
  if (role) {
    role.addEventListener("change", () => {
      state.ui.userRole = role.value;
      state.ui.userPage = 1;
      refreshUsersTable();
    });
  }
  const reset = document.getElementById("user-reset");
  if (reset) {
    reset.addEventListener("click", () => {
      state.ui.userSearch = "";
      state.ui.userRole = "";
      state.ui.userPage = 1;
      rerender();
    });
  }

  const pager = document.getElementById("users-pagination");
  if (pager) {
    pager.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button) return;
      state.ui.userPage = Number(button.dataset.page) || 1;
      refreshUsersTable();
    });
  }

  const body = document.getElementById("users-table-body");
  if (body) {
    body.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const userId = button.dataset.userId;
      if (button.dataset.action === "user-menu") {
        openUserMenu(button, userId, context);
        return;
      }
      if (button.dataset.action === "edit-user") {
        openUserDialog(context, userId);
      } else if (button.dataset.action === "reset-password") {
        handleResetPassword(userId, refresh);
      } else if (button.dataset.action === "delete-user") {
        handleDeleteUser(userId, refresh);
      } else if (button.dataset.action === "delete-user-attendance") {
        handleDeleteUserAttendance(userId, refresh);
      }
    });
  }
}

function openUserMenu(anchor, userId, context) {
  const user = state.users.find((item) => String(item.id) === String(userId));
  if (!user) return;
  const canDeleteAccount = String(user.id) !== String((state.user || {}).id || "");
  const items = [
    {
      label: "Edit peserta",
      icon: "bi-pencil-square",
      tone: "primary",
      onSelect: () => openUserDialog(context, userId)
    },
    {
      label: "Reset password",
      icon: "bi-key",
      onSelect: () => handleResetPassword(userId, context.refresh)
    },
    {
      label: "Hapus absensi",
      icon: "bi-calendar-x",
      tone: "warning",
      onSelect: () => handleDeleteUserAttendance(userId, context.refresh)
    }
  ];
  if (canDeleteAccount) {
    items.push({
      label: "Hapus akun",
      icon: "bi-trash3",
      tone: "danger",
      onSelect: () => handleDeleteUser(userId, context.refresh)
    });
  }
  openActionMenu(anchor, items);
}

function openUserDialog(context, userId) {
  const user = userId
    ? state.users.find((item) => String(item.id) === String(userId)) || null
    : null;
  const editing = Boolean(user);
  const dialogId = "user-dialog-" + Date.now();
  const initialRole = editing ? String(user.role || "intern").toLowerCase() : "intern";
  const initialActive = editing ? isActiveUser(user) : true;

  const { element, modal } = createModal(`
    <div class="modal fade" id="${dialogId}" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content rounded-4 border-0">
          <form novalidate>
            <div class="modal-header border-0 pb-0">
              <div>
                <h2 class="h5 fw-bold mb-0">${editing ? "Edit peserta" : "Tambah peserta"}</h2>
                <div class="small text-secondary">${editing ? "Perbarui data akun peserta." : "Buat akun peserta magang baru."}</div>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Tutup"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label small fw-semibold" for="${dialogId}-name">Nama lengkap</label>
                <input id="${dialogId}-name" class="form-control rounded-3" type="text" maxlength="100" value="${editing ? esc(user.name) : ""}" required />
              </div>
              <div class="mb-3">
                <label class="form-label small fw-semibold" for="${dialogId}-username">Username</label>
                <div class="input-group">
                  <span class="input-group-text rounded-start-3">@</span>
                  <input id="${dialogId}-username" class="form-control rounded-end-3" type="text" maxlength="40" autocomplete="off" autocapitalize="none" spellcheck="false" value="${editing ? esc(user.username) : ""}" required />
                </div>
                <div class="form-text">3&ndash;40 karakter: huruf kecil, angka, titik, garis bawah, atau strip. Untuk peserta magang gunakan nama depan, contoh <code>nayla</code>.</div>
              </div>
              <div class="mb-3">
                <label class="form-label small fw-semibold" for="${dialogId}-password">Password ${editing ? "(kosongkan jika tidak diubah)" : ""}</label>
                <div class="input-group">
                  <input id="${dialogId}-password" class="form-control rounded-start-3" type="password" autocomplete="new-password" maxlength="72" ${editing ? "" : "required"} />
                  <button class="btn btn-outline-secondary rounded-end-3" type="button" data-toggle-password aria-label="Lihat password"><i class="bi bi-eye"></i></button>
                </div>
                <div class="form-text">Minimal 6 karakter. Pola akun peserta: nama depan + <code>123</code>, contoh <code>nayla123</code>.</div>
                ${editing ? '<div class="form-text">Terakhir diubah: ' + esc(formatDateTime(user.password_updated_at)) + "</div>" : ""}
              </div>
              <div class="row g-2">
                <div class="col-6">
                  <label class="form-label small fw-semibold" for="${dialogId}-role">Role</label>
                  <select id="${dialogId}-role" class="form-select rounded-3">
                    <option value="intern"${initialRole === "intern" ? " selected" : ""}>Intern</option>
                    <option value="admin"${initialRole === "admin" ? " selected" : ""}>Admin</option>
                  </select>
                </div>
                <div class="col-6 d-flex align-items-end">
                  <div class="form-check mb-2">
                    <input id="${dialogId}-active" class="form-check-input" type="checkbox" ${initialActive ? "checked" : ""} />
                    <label class="form-check-label small fw-semibold" for="${dialogId}-active">Aktif</label>
                  </div>
                </div>
              </div>
              <div id="${dialogId}-profile" class="mt-3 ${initialRole === "intern" ? "" : "d-none"}">
                <hr class="my-3" />
                <div class="small fw-semibold mb-2">Profil magang</div>
                <div class="row g-2">
                  <div class="col-12 col-md-6">
                    <label class="form-label small fw-semibold" for="${dialogId}-division">Divisi</label>
                    <input id="${dialogId}-division" class="form-control rounded-3" type="text" maxlength="80" placeholder="Contoh: Access Network" value="${editing ? esc(user.division || "") : ""}" />
                  </div>
                  <div class="col-12 col-md-6">
                    <label class="form-label small fw-semibold" for="${dialogId}-mentor">Mentor</label>
                    <input id="${dialogId}-mentor" class="form-control rounded-3" type="text" maxlength="100" placeholder="Nama pembimbing" value="${editing ? esc(user.mentor || "") : ""}" />
                  </div>
                  <div class="col-6">
                    <label class="form-label small fw-semibold" for="${dialogId}-start">Mulai magang</label>
                    <input id="${dialogId}-start" class="form-control rounded-3" type="date" value="${editing && user.internship_start ? esc(user.internship_start) : ""}" />
                  </div>
                  <div class="col-6">
                    <label class="form-label small fw-semibold" for="${dialogId}-end">Selesai magang</label>
                    <input id="${dialogId}-end" class="form-control rounded-3" type="date" value="${editing && user.internship_end ? esc(user.internship_end) : ""}" />
                  </div>
                </div>
                <div class="form-text">Data ini tampil pada profil peserta dan laporan.</div>
              </div>
              <div class="alert alert-danger small py-2 px-3 mt-3 mb-0 d-none" data-error role="alert" aria-live="polite"></div>
            </div>
            <div class="modal-footer border-0 pt-0">
              <button class="btn btn-outline-secondary rounded-pill px-4" type="button" data-bs-dismiss="modal">Batal</button>
              <button class="btn btn-primary rounded-pill px-4" type="submit">${editing ? "Simpan perubahan" : "Tambah peserta"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);

  const form = element.querySelector("form");
  const nameInput = element.querySelector("#" + dialogId + "-name");
  const usernameInput = element.querySelector("#" + dialogId + "-username");
  const passwordInput = element.querySelector("#" + dialogId + "-password");
  const roleInput = element.querySelector("#" + dialogId + "-role");
  const activeInput = element.querySelector("#" + dialogId + "-active");
  const profileBox = element.querySelector("#" + dialogId + "-profile");
  const divisionInput = element.querySelector("#" + dialogId + "-division");
  const mentorInput = element.querySelector("#" + dialogId + "-mentor");
  const startInput = element.querySelector("#" + dialogId + "-start");
  const endInput = element.querySelector("#" + dialogId + "-end");
  const submit = element.querySelector('button[type="submit"]');
  const toggle = element.querySelector("[data-toggle-password]");
  const errorBox = element.querySelector("[data-error]");
  let usernameTouched = editing;

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.classList.remove("d-none");
  };
  const hideError = () => errorBox.classList.add("d-none");

  nameInput.addEventListener("input", () => {
    hideError();
    if (editing || usernameTouched) return;
    const suggestion = nameInput.value
      .trim()
      .toLowerCase()
      .split(/\s+/)[0]
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 40);
    usernameInput.value = suggestion;
  });
  usernameInput.addEventListener("input", () => {
    usernameTouched = true;
    hideError();
  });
  passwordInput.addEventListener("input", hideError);
  toggle.addEventListener("click", () => {
    const visible = passwordInput.type === "text";
    passwordInput.type = visible ? "password" : "text";
    toggle.innerHTML = visible ? '<i class="bi bi-eye"></i>' : '<i class="bi bi-eye-slash"></i>';
    toggle.setAttribute("aria-label", visible ? "Lihat password" : "Sembunyikan password");
  });
  roleInput.addEventListener("change", () => {
    profileBox.classList.toggle("d-none", roleInput.value !== "intern");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideError();

    const name = nameInput.value.trim();
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const role = roleInput.value;
    const active = activeInput.checked;
    const division = divisionInput.value.trim();
    const mentor = mentorInput.value.trim();
    const internshipStart = startInput.value || "";
    const internshipEnd = endInput.value || "";

    if (name.length < 2) {
      showError("Nama minimal 2 karakter.");
      nameInput.focus();
      return;
    }
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      showError("Username 3-40 karakter: huruf kecil, angka, titik, garis bawah, atau strip.");
      usernameInput.focus();
      return;
    }
    if (!editing && password.length < 6) {
      showError("Password minimal 6 karakter untuk akun baru.");
      passwordInput.focus();
      return;
    }
    if (editing && password && password.length < 6) {
      showError("Password minimal 6 karakter.");
      passwordInput.focus();
      return;
    }
    if (password && new TextEncoder().encode(password).length > 72) {
      showError("Password terlalu panjang (maksimal 72 byte).");
      passwordInput.focus();
      return;
    }
    if (role === "intern" && internshipStart && internshipEnd && internshipEnd < internshipStart) {
      showError("Tanggal selesai magang tidak boleh lebih awal dari tanggal mulai.");
      endInput.focus();
      return;
    }

    const confirmed = await confirmDialog({
      title: editing ? "Simpan perubahan akun?" : "Tambah peserta baru?",
      message:
        (editing ? "Perbarui akun " : "Buat akun ") +
        name +
        " (@" +
        username +
        ") sebagai " +
        (role === "admin" ? "admin" : "intern") +
        ".",
      confirmLabel: editing ? "Simpan perubahan" : "Tambah peserta",
      tone: "primary",
      secondMessage:
        "Periksa kembali nama, username, role, dan status aktif. Perubahan akun langsung berlaku setelah disimpan."
    });
    if (!confirmed) return;

    const restore = withBusy(submit, editing ? "Menyimpan..." : "Menambahkan...");
    try {
      const result = editing
        ? await rpc("admin_update_user", {
            p_id: user.id,
            p_username: username,
            p_name: name,
            p_role: role,
            p_active: active,
            p_password: password || ""
          })
        : await rpc("admin_create_user", {
            p_username: username,
            p_name: name,
            p_password: password,
            p_role: role,
            p_active: active
          });
      let profileWarning = "";
      if (role === "intern") {
        const targetId = editing ? user.id : result && result.user && result.user.id;
        if (targetId) {
          try {
            await rpc("admin_update_intern_profile", {
              p_id: targetId,
              p_division: division,
              p_mentor: mentor,
              p_internship_start: internshipStart || null,
              p_internship_end: internshipEnd || null
            });
          } catch (profileError) {
            profileWarning =
              String((profileError && profileError.message) || "") ||
              "Profil magang gagal diperbarui.";
          }
        }
      }
      modal.hide();
      toast(result.message || (editing ? "Akun berhasil diperbarui." : "Akun berhasil ditambahkan."), "success");
      if (profileWarning) {
        toast("Akun tersimpan, tetapi profil magang gagal diperbarui: " + profileWarning, "warning");
      }
      await context.refresh({ silent: true, force: true });
    } catch (error) {
      showError(String((error && error.message) || "Gagal menyimpan akun."));
      handleError(error);
      restore();
    }
  });

  element.addEventListener("shown.bs.modal", () => nameInput.focus());
  element.addEventListener("hidden.bs.modal", () => element.remove());
  modal.show();
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

  const confirmed = await confirmDialog({
    title: "Reset password?",
    message:
      "Password akun " + user.name + " (@" + user.username + ") akan diganti dengan password baru.",
    confirmLabel: "Reset password",
    tone: "warning",
    secondMessage:
      "Sampaikan password baru kepada pemilik akun melalui jalur yang aman. Sesi lama akun tersebut tidak lagi dapat memakai password lama."
  });
  if (!confirmed) return;

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
    tone: "danger",
    secondMessage:
      "Tindakan ini permanen. Akun, seluruh absensi, dan foto absensi peserta akan dihapus dan tidak dapat dikembalikan."
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
    tone: "warning",
    secondMessage:
      "Seluruh riwayat dan foto absensi peserta akan dihapus permanen. Akun peserta tetap dapat dipakai untuk absen berikutnya."
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
