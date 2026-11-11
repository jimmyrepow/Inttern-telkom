import { state } from "../core/store.js";
import { rpc, handleError, isSessionExpired } from "../core/api.js";
import { esc, toast, withBusy, createModal, confirmDialog } from "../lib/dom.js";
import { formatDateTime, isActiveUser } from "../lib/format.js";
import {
  renderAvatar,
  avatarEmoji,
  avatarColor,
  AVATAR_EMOJIS,
  AVATAR_COLORS
} from "../lib/avatar.js";
import {
  renderAchievementsCard,
  renderAdminAchievementsCard
} from "../lib/achievements.js";

const STRENGTH_LABELS = [
  "",
  "Sangat lemah",
  "Lemah",
  "Cukup",
  "Kuat",
  "Sangat kuat"
];

function roleLabel(role) {
  return String(role || "intern").toLowerCase() === "admin" ? "Admin" : "Peserta Magang";
}

function passwordScore(value) {
  const text = String(value || "");
  if (!text) return 0;
  let score = 0;
  if (text.length >= 6) score += 1;
  if (text.length >= 10) score += 1;
  if (/[a-z]/.test(text) && /[A-Z]/.test(text)) score += 1;
  if (/\d/.test(text)) score += 1;
  if (/[^A-Za-z0-9]/.test(text)) score += 1;
  return score;
}

export function renderAccount() {
  const user = state.user || {};
  const role = String(user.role || "intern").toLowerCase();
  const admin = role === "admin";
  const active = isActiveUser(user);
  const homeTab = admin ? "attendance" : "absen";
  const homeLabel = admin ? "Buka absensi" : "Absen sekarang";
  const myAttendance = (state.attendance || []).filter(
    (row) => String(row.user_id) === String(user.id)
  );
  const achievementsCard = admin
    ? renderAdminAchievementsCard(state.adminAchievements, {
        loading: state.adminAchievementsLoading,
        error: state.adminAchievementsError
      })
    : renderAchievementsCard(myAttendance);

  return `
    <section class="account-hero">
      <div class="account-hero-avatar">${renderAvatar(user, "avatar-xl")}</div>
      <div class="account-hero-body">
        <span class="badge ${admin ? "bg-dark" : "badge-soft"} rounded-pill">${esc(roleLabel(role))}</span>
        <h2>${esc(user.name || "-")}</h2>
        <p>
          <span><i class="bi bi-at"></i>${esc(user.username || "-")}</span>
          <span class="${active ? "text-success" : "text-secondary"}"><i class="bi ${active ? "bi-check-circle-fill" : "bi-pause-circle-fill"}"></i>${active ? "Akun aktif" : "Akun nonaktif"}</span>
        </p>
      </div>
      <div class="account-hero-actions">
        <button class="btn btn-outline-secondary rounded-pill px-4" id="acct-avatar-btn" type="button">
          <i class="bi bi-emoji-smile me-2"></i>Ubah avatar
        </button>
        <button class="btn btn-primary rounded-pill px-4" type="button" data-nav="${homeTab}">
          <i class="bi ${admin ? "bi-calendar2-check" : "bi-fingerprint"} me-2"></i>${esc(homeLabel)}
        </button>
      </div>
    </section>

    <div class="row g-3">
      <div class="col-12 col-lg-7">
        <div class="card rounded-4 border-0 shadow-sm h-100">
          <div class="card-body p-3 p-md-4">
            <div class="card-section-head">
              <span class="card-section-icon"><i class="bi bi-person-vcard"></i></span>
              <div>
                <h2 class="h5 fw-bold mb-0">Profil saya</h2>
                <div class="small text-secondary">Nama ini tampil di absensi dan daftar peserta.</div>
              </div>
            </div>
            <form id="profile-form" novalidate>
              <div class="mb-3">
                <label class="form-label small fw-semibold" for="acct-name">Nama lengkap</label>
                <input id="acct-name" class="form-control rounded-3" type="text" minlength="2" maxlength="100" autocomplete="name" value="${esc(user.name || "")}" required />
                <div class="form-text">Perubahan nama berlaku untuk absensi berikutnya. Riwayat lama tetap memakai nama saat dicatat.</div>
              </div>
              <div class="mb-3">
                <label class="form-label small fw-semibold" for="acct-username">Username</label>
                <div class="input-group">
                  <span class="input-group-text rounded-start-3">@</span>
                  <input id="acct-username" class="form-control rounded-end-3" type="text" value="${esc(user.username || "")}" readonly />
                </div>
                <div class="form-text">Username dipakai untuk login. Hubungi admin jika perlu mengubahnya.</div>
              </div>
              <button class="btn btn-primary rounded-3" id="profile-submit" type="submit" disabled>
                <i class="bi bi-check2-circle me-2"></i>Simpan nama
              </button>
            </form>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-5">
        <div class="card rounded-4 border-0 shadow-sm h-100">
          <div class="card-body p-3 p-md-4">
            <div class="card-section-head">
              <span class="card-section-icon"><i class="bi bi-clipboard-data"></i></span>
              <div>
                <h2 class="h5 fw-bold mb-0">Ringkasan akun</h2>
                <div class="small text-secondary">Informasi login dan keamanan.</div>
              </div>
            </div>
            <div class="account-meta">
              <div class="account-meta-row"><span>Role</span><strong>${esc(roleLabel(role))}</strong></div>
              <div class="account-meta-row"><span>Status</span><strong class="${active ? "text-success" : "text-secondary"}">${active ? "Aktif" : "Nonaktif"}</strong></div>
              <div class="account-meta-row"><span>Login terakhir</span><strong>${esc(formatDateTime(user.last_login_at))}</strong></div>
              <div class="account-meta-row"><span>Password diubah</span><strong>${esc(formatDateTime(user.password_updated_at))}</strong></div>
              <div class="account-meta-row"><span>Bergabung</span><strong>${esc(formatDateTime(user.created_at))}</strong></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="row g-3 mt-1">
      <div class="col-12 col-lg-7">
        <div class="card rounded-4 border-0 shadow-sm">
          <div class="card-body p-3 p-md-4">
            <div class="card-section-head">
              <span class="card-section-icon"><i class="bi bi-shield-lock"></i></span>
              <div>
                <h2 class="h5 fw-bold mb-0">Ubah password</h2>
                <div class="small text-secondary">Masukkan password lama untuk verifikasi, lalu buat password baru.</div>
              </div>
            </div>
            <form id="password-form" novalidate>
              <div class="mb-3">
                <label class="form-label small fw-semibold" for="acct-current">Password lama</label>
                <div class="input-group">
                  <input id="acct-current" class="form-control rounded-start-3" type="password" autocomplete="current-password" placeholder="Password yang sedang dipakai" required />
                  <button class="btn btn-outline-secondary rounded-end-3 password-toggle" type="button" data-target="acct-current" aria-label="Lihat password lama"><i class="bi bi-eye"></i></button>
                </div>
              </div>
              <div class="mb-2">
                <label class="form-label small fw-semibold" for="acct-new">Password baru</label>
                <div class="input-group">
                  <input id="acct-new" class="form-control rounded-start-3" type="password" autocomplete="new-password" minlength="6" maxlength="72" placeholder="Minimal 6 karakter" required />
                  <button class="btn btn-outline-secondary rounded-end-3 password-toggle" type="button" data-target="acct-new" aria-label="Lihat password baru"><i class="bi bi-eye"></i></button>
                </div>
                <div class="password-strength mt-2" id="acct-strength" data-level="0" aria-hidden="true">
                  <span></span><span></span><span></span><span></span><span></span>
                </div>
                <div class="small text-secondary mt-1" id="acct-strength-label" aria-live="polite">Minimal 6 karakter. Huruf besar, angka, dan simbol membuat password lebih kuat.</div>
              </div>
              <div class="mb-3">
                <label class="form-label small fw-semibold" for="acct-confirm">Ulangi password baru</label>
                <div class="input-group">
                  <input id="acct-confirm" class="form-control rounded-start-3" type="password" autocomplete="new-password" minlength="6" maxlength="72" placeholder="Ketik ulang password baru" required />
                  <button class="btn btn-outline-secondary rounded-end-3 password-toggle" type="button" data-target="acct-confirm" aria-label="Lihat konfirmasi password"><i class="bi bi-eye"></i></button>
                </div>
              </div>
              <ul class="password-requirements" id="acct-requirements">
                <li data-req="length"><i class="bi bi-circle"></i><span>Minimal 6 karakter</span></li>
                <li data-req="different"><i class="bi bi-circle"></i><span>Berbeda dari password lama</span></li>
                <li data-req="match"><i class="bi bi-circle"></i><span>Konfirmasi password sama</span></li>
              </ul>
              <button class="btn btn-primary rounded-3" id="password-submit" type="submit" disabled>
                <i class="bi bi-shield-check me-2"></i>Perbarui password
              </button>
              <div class="small text-secondary mt-2">Setelah berhasil, semua sesi di perangkat lain otomatis dikeluarkan. Perangkat ini tetap masuk.</div>
            </form>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-5">
        <div class="card rounded-4 border-0 shadow-sm h-100">
          <div class="card-body p-3 p-md-4">
            <div class="card-section-head">
              <span class="card-section-icon"><i class="bi bi-lightbulb"></i></span>
              <div>
                <h2 class="h5 fw-bold mb-0">Tips keamanan</h2>
                <div class="small text-secondary">Jaga akun absensi Anda tetap aman.</div>
              </div>
            </div>
            <ul class="account-tips">
              <li><i class="bi bi-check2-circle"></i><span>Jangan bagikan password ke orang lain, termasuk rekan kerja.</span></li>
              <li><i class="bi bi-check2-circle"></i><span>Gunakan kombinasi huruf besar, huruf kecil, angka, dan simbol.</span></li>
              <li><i class="bi bi-check2-circle"></i><span>Selalu keluar setelah memakai perangkat bersama.</span></li>
            </ul>
            <button class="btn btn-outline-danger rounded-pill w-100 mt-3" id="acct-logout" type="button">
              <i class="bi bi-box-arrow-right me-2"></i>Keluar dari akun
            </button>
          </div>
        </div>
      </div>
    </div>
    ${achievementsCard}
  `;
}

export function attachAccountEvents(context) {
  const ctx = context || {};
  bindPasswordToggles();
  bindProfileForm(ctx);
  bindPasswordForm(ctx);
  bindAvatarDialog(ctx);
  bindAdminAchievements(ctx);

  const logoutBtn = document.getElementById("acct-logout");
  if (logoutBtn && typeof ctx.logout === "function") {
    logoutBtn.addEventListener("click", () => ctx.logout());
  }
}

function bindAdminAchievements(context) {
  const user = state.user || {};
  if (String(user.role || "").toLowerCase() !== "admin") return;

  const retry = document.getElementById("admin-achievements-retry");
  if (retry) {
    retry.addEventListener("click", () => {
      state.adminAchievementsLoadedFor = "";
      state.adminAchievementsError = "";
      if (typeof context.rerender === "function") context.rerender();
    });
  }

  loadAdminAchievements(context);
}

function loadAdminAchievements(context) {
  const user = state.user || {};
  const key = String(user.username || user.id || "");
  if (!key) return;
  if (state.adminAchievementsLoading || state.adminAchievementsLoadedFor === key) return;

  state.adminAchievementsLoading = true;
  state.adminAchievementsError = "";
  rpc("app_admin_achievement_stats", {})
    .then((result) => {
      const stats = result && result.stats;
      state.adminAchievements =
        stats && typeof stats === "object"
          ? stats
          : { reviews: 0, approved: 0, announcements: 0, actions: 0, activeDays: 0 };
      state.adminAchievementsLoadedFor = key;
    })
    .catch((error) => {
      if (isSessionExpired(error && error.message)) {
        state.adminAchievementsLoadedFor = key;
        handleError(error);
        return;
      }
      state.adminAchievements = null;
      state.adminAchievementsError =
        (error && error.message) || "Gagal memuat pencapaian admin.";
      state.adminAchievementsLoadedFor = key;
    })
    .finally(() => {
      state.adminAchievementsLoading = false;
      if (typeof context.rerender === "function") context.rerender();
    });
}

function bindAvatarDialog(context) {
  const button = document.getElementById("acct-avatar-btn");
  if (!button) return;
  button.addEventListener("click", () => openAvatarDialog(context));
}

function openAvatarDialog(context) {
  const user = state.user || {};
  const dialogId = "avatar-dialog-" + Date.now();
  let selectedEmoji = avatarEmoji(user);
  let selectedColor = avatarColor(user);

  const { element, modal } = createModal(`
    <div class="modal fade" id="${dialogId}" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content rounded-4 border-0">
          <div class="modal-header border-0 pb-0">
            <div>
              <h2 class="h5 fw-bold mb-0">Ubah avatar</h2>
              <div class="small text-secondary">Pilih emoji dan warna yang mewakili dirimu.</div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Tutup"></button>
          </div>
          <div class="modal-body">
            <div class="avatar-preview-wrap">
              <div id="${dialogId}-preview">${renderAvatar(user, "avatar-xl")}</div>
              <div class="small text-secondary">Pratinjau avatar</div>
            </div>
            <div class="small fw-semibold mb-2">Emoji</div>
            <div class="avatar-emoji-grid">
              ${AVATAR_EMOJIS.map(
                (emoji) =>
                  '<button type="button" class="avatar-emoji-option' +
                  (emoji === selectedEmoji ? " is-selected" : "") +
                  '" data-emoji="' +
                  esc(emoji) +
                  '" aria-label="Pilih emoji ' +
                  esc(emoji) +
                  '" aria-pressed="' +
                  (emoji === selectedEmoji ? "true" : "false") +
                  '">' +
                  esc(emoji) +
                  "</button>"
              ).join("")}
            </div>
            <div class="small fw-semibold mt-3 mb-2">Warna latar</div>
            <div class="avatar-color-grid">
              ${AVATAR_COLORS.map(
                (color) =>
                  '<button type="button" class="avatar-color-option' +
                  (color === selectedColor ? " is-selected" : "") +
                  '" style="background:' +
                  color +
                  '" data-color="' +
                  color +
                  '" aria-label="Pilih warna ' +
                  color +
                  '" aria-pressed="' +
                  (color === selectedColor ? "true" : "false") +
                  '"></button>'
              ).join("")}
            </div>
            <div class="mt-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
              <button class="btn btn-outline-secondary btn-sm rounded-pill" type="button" data-reset-avatar>Kembali ke inisial</button>
              <span class="small text-secondary">Avatar tampil di menu dan daftar peserta.</span>
            </div>
            <div class="alert alert-danger small py-2 px-3 mt-3 mb-0 d-none" data-error role="alert" aria-live="polite"></div>
          </div>
          <div class="modal-footer border-0 pt-0">
            <button class="btn btn-outline-secondary rounded-pill px-4" type="button" data-bs-dismiss="modal">Batal</button>
            <button class="btn btn-primary rounded-pill px-4" type="button" data-save-avatar>Simpan avatar</button>
          </div>
        </div>
      </div>
    </div>
  `);

  const preview = element.querySelector("#" + dialogId + "-preview");
  const emojiButtons = Array.from(element.querySelectorAll("[data-emoji]"));
  const colorButtons = Array.from(element.querySelectorAll("[data-color]"));
  const resetButton = element.querySelector("[data-reset-avatar]");
  const saveButton = element.querySelector("[data-save-avatar]");
  const errorBox = element.querySelector("[data-error]");

  const paint = () => {
    preview.innerHTML = renderAvatar(
      Object.assign({}, user, { avatar_emoji: selectedEmoji, avatar_color: selectedColor }),
      "avatar-xl"
    );
    emojiButtons.forEach((button) => {
      const selected = button.dataset.emoji === selectedEmoji;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    colorButtons.forEach((button) => {
      const selected = button.dataset.color === selectedColor;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  };

  emojiButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedEmoji = button.dataset.emoji || "";
      errorBox.classList.add("d-none");
      paint();
    });
  });
  colorButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedColor = button.dataset.color || "#ec4899";
      errorBox.classList.add("d-none");
      paint();
    });
  });
  resetButton.addEventListener("click", () => {
    selectedEmoji = "";
    selectedColor = "#ec4899";
    errorBox.classList.add("d-none");
    paint();
  });

  saveButton.addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      title: "Simpan avatar?",
      message: "Avatar baru akan dipakai di menu, header, dan daftar peserta admin.",
      confirmLabel: "Simpan avatar",
      tone: "primary",
      secondMessage: "Pastikan emoji dan warna sudah sesuai. Avatar lama akan langsung diganti."
    });
    if (!confirmed) return;

    const restore = withBusy(saveButton, "Menyimpan...");
    try {
      const result = await rpc("app_update_avatar", {
        p_emoji: selectedEmoji,
        p_color: selectedColor
      });
      const updated = (result && result.user) || {};
      state.user = Object.assign({}, state.user, {
        avatar_emoji:
          updated.avatar_emoji !== undefined ? updated.avatar_emoji : selectedEmoji,
        avatar_color: updated.avatar_color || selectedColor
      });
      const index = state.users.findIndex((item) => String(item.id) === String(state.user.id));
      if (index !== -1) {
        state.users[index] = Object.assign({}, state.users[index], {
          avatar_emoji: state.user.avatar_emoji,
          avatar_color: state.user.avatar_color
        });
      }
      modal.hide();
      toast((result && result.message) || "Ikon profil berhasil diperbarui.", "success");
      if (typeof context.rerender === "function") context.rerender();
    } catch (error) {
      errorBox.textContent = String((error && error.message) || "Gagal menyimpan avatar.");
      errorBox.classList.remove("d-none");
      handleError(error);
      restore();
    }
  });

  element.addEventListener("hidden.bs.modal", () => element.remove());
  modal.show();
}

function bindPasswordToggles() {
  document.querySelectorAll(".password-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.target);
      if (!input) return;
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      button.innerHTML = visible ? '<i class="bi bi-eye"></i>' : '<i class="bi bi-eye-slash"></i>';
      button.setAttribute("aria-label", visible ? "Lihat password" : "Sembunyikan password");
    });
  });
}

function bindProfileForm(context) {
  const form = document.getElementById("profile-form");
  const input = document.getElementById("acct-name");
  const submit = document.getElementById("profile-submit");
  if (!form || !input || !submit) return;

  const sync = () => {
    const name = input.value.trim();
    submit.disabled = name.length < 2 || name === String((state.user && state.user.name) || "");
  };
  input.addEventListener("input", sync);
  sync();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (name.length < 2) {
      toast("Nama minimal 2 karakter.", "danger");
      input.focus();
      return;
    }
    if (name === String((state.user && state.user.name) || "")) {
      toast("Nama belum berubah.", "info");
      return;
    }

    const confirmed = await confirmDialog({
      title: "Simpan nama?",
      message:
        'Nama akan diubah dari "' +
        String((state.user && state.user.name) || "") +
        '" menjadi "' +
        name +
        '".',
      confirmLabel: "Simpan nama",
      tone: "primary",
      secondMessage:
        "Nama baru akan tampil pada menu, header, daftar peserta, dan absensi berikutnya."
    });
    if (!confirmed) return;

    const restore = withBusy(submit, "Menyimpan...");
    try {
      const result = await rpc("app_update_profile", { p_name: name });
      const updated = (result && result.user) || {};
      state.user = Object.assign({}, state.user, { name: updated.name || name });
      const index = state.users.findIndex((item) => String(item.id) === String(state.user.id));
      if (index !== -1) {
        state.users[index] = Object.assign({}, state.users[index], { name: state.user.name });
      }
      toast((result && result.message) || "Nama berhasil diperbarui.", "success");
      if (typeof context.rerender === "function") context.rerender();
    } catch (error) {
      handleError(error);
      restore();
    }
  });
}

function bindPasswordForm(context) {
  const form = document.getElementById("password-form");
  const currentInput = document.getElementById("acct-current");
  const newInput = document.getElementById("acct-new");
  const confirmInput = document.getElementById("acct-confirm");
  const submit = document.getElementById("password-submit");
  const strength = document.getElementById("acct-strength");
  const strengthLabel = document.getElementById("acct-strength-label");
  const requirementList = document.getElementById("acct-requirements");
  if (!form || !currentInput || !newInput || !confirmInput || !submit) return;

  const requirements = requirementList
    ? {
        length: requirementList.querySelector('[data-req="length"]'),
        different: requirementList.querySelector('[data-req="different"]'),
        match: requirementList.querySelector('[data-req="match"]')
      }
    : {};

  const updateRequirement = (item, ok, touched) => {
    if (!item) return;
    item.classList.toggle("is-ok", ok);
    item.classList.toggle("is-bad", Boolean(touched) && !ok);
    const icon = item.querySelector("i");
    if (icon) icon.className = ok ? "bi bi-check-circle-fill" : "bi bi-circle";
  };

  const sync = () => {
    const current = currentInput.value;
    const next = newInput.value;
    const confirm = confirmInput.value;
    const score = passwordScore(next);
    const byteLength = new TextEncoder().encode(next).length;
    const hasLength = next.length >= 6 && byteLength <= 72;
    const different = next.length > 0 && next !== current;
    const matches = confirm.length > 0 && next === confirm;

    if (strength) {
      strength.dataset.level = String(score);
      strength.querySelectorAll("span").forEach((span, index) => {
        span.classList.toggle("is-on", index < score);
      });
    }
    if (strengthLabel) {
      strengthLabel.textContent =
        byteLength > 72
          ? "Password terlalu panjang (maksimal 72 byte)."
          : next
            ? "Kekuatan password: " + STRENGTH_LABELS[score] + "."
            : "Minimal 6 karakter. Huruf besar, angka, dan simbol membuat password lebih kuat.";
    }

    updateRequirement(requirements.length, hasLength, next.length > 0);
    updateRequirement(requirements.different, different, next.length > 0);
    updateRequirement(requirements.match, matches, confirm.length > 0);

    submit.disabled = !(current.length > 0 && hasLength && different && matches);
  };

  [currentInput, newInput, confirmInput].forEach((input) => {
    input.addEventListener("input", sync);
  });
  sync();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const current = currentInput.value;
    const next = newInput.value;
    const confirm = confirmInput.value;

    if (!current) {
      toast("Password lama wajib diisi.", "danger");
      currentInput.focus();
      return;
    }
    if (next.length < 6) {
      toast("Password baru minimal 6 karakter.", "danger");
      newInput.focus();
      return;
    }
    if (new TextEncoder().encode(next).length > 72) {
      toast("Password baru terlalu panjang (maksimal 72 byte).", "danger");
      newInput.focus();
      return;
    }
    if (next === current) {
      toast("Password baru harus berbeda dari password lama.", "danger");
      newInput.focus();
      return;
    }
    if (next !== confirm) {
      toast("Konfirmasi password tidak sama.", "danger");
      confirmInput.focus();
      return;
    }

    const confirmed = await confirmDialog({
      title: "Perbarui password?",
      message: "Password akun Anda akan diganti dengan password baru.",
      confirmLabel: "Perbarui password",
      tone: "warning",
      secondMessage:
        "Sesi di perangkat lain akan otomatis keluar. Jika password baru lupa, Anda harus meminta admin melakukan reset."
    });
    if (!confirmed) return;

    const restore = withBusy(submit, "Memperbarui...");
    try {
      const result = await rpc("app_change_password", {
        p_current_password: current,
        p_new_password: next
      });
      state.user = Object.assign({}, state.user, {
        password_updated_at: (result && result.password_updated_at) || new Date().toISOString()
      });
      toast((result && result.message) || "Password berhasil diperbarui.", "success");
      if (typeof context.rerender === "function") context.rerender();
    } catch (error) {
      handleError(error);
      restore();
    }
  });
}
