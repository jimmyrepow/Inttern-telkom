import { state } from "../core/store.js";
import { rpc, handleError } from "../core/api.js";
import { esc, toast, withBusy } from "../lib/dom.js";
import { formatDateTime, initials, isActiveUser } from "../lib/format.js";

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

  return `
    <section class="account-hero">
      <div class="account-hero-avatar" aria-hidden="true">${esc(initials(user.name))}</div>
      <div class="account-hero-body">
        <span class="badge ${admin ? "bg-dark" : "badge-soft"} rounded-pill">${esc(roleLabel(role))}</span>
        <h2>${esc(user.name || "-")}</h2>
        <p>
          <span><i class="bi bi-at"></i>${esc(user.username || "-")}</span>
          <span class="${active ? "text-success" : "text-secondary"}"><i class="bi ${active ? "bi-check-circle-fill" : "bi-pause-circle-fill"}"></i>${active ? "Akun aktif" : "Akun nonaktif"}</span>
        </p>
      </div>
      <div class="account-hero-actions">
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
  `;
}

export function attachAccountEvents(context) {
  const ctx = context || {};
  bindPasswordToggles();
  bindProfileForm(ctx);
  bindPasswordForm(ctx);

  const logoutBtn = document.getElementById("acct-logout");
  if (logoutBtn && typeof ctx.logout === "function") {
    logoutBtn.addEventListener("click", () => ctx.logout());
  }
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
