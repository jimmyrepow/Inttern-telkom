import { state } from "../core/store.js";
import { rpc, authErrorMessage } from "../core/api.js";
import { saveToken } from "../core/session.js";
import { esc, withBusy } from "../lib/dom.js";
import { APP_CREDITS } from "../core/config.js";

export function renderLogin(message, onSuccess) {
  state.page = "login";
  document.body.classList.remove("sidebar-locked");
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="auth-shell">
      <div class="card rounded-4 border-0 shadow-sm auth-card">
        <div class="card-body p-4 p-md-5">
          <div class="text-center mb-4">
            <div class="auth-brand mb-3">
              <img src="assets/logo.png" alt="Telkom Akses by Telkom Indonesia" class="brand-logo brand-logo-auth" width="1875" height="624" decoding="async" />
            </div>
            <h1 class="visually-hidden">TELKOM AKSES</h1>
            <p class="text-secondary small mb-0">Masuk dengan username dan password</p>
          </div>
          <form id="login-form" novalidate>
            <div class="mb-3">
              <label for="username" class="form-label small fw-semibold">Username</label>
              <input id="username" name="username" class="form-control form-control-lg rounded-3" autocomplete="username" autocapitalize="none" spellcheck="false" required />
            </div>
            <div class="mb-3">
              <label for="password" class="form-label small fw-semibold">Password</label>
              <div class="input-group">
                <input id="password" name="password" class="form-control form-control-lg rounded-start-3" type="password" autocomplete="current-password" required />
                <button id="password-toggle" class="btn btn-outline-secondary btn-lg rounded-end-3" type="button" aria-label="Lihat password"><i class="bi bi-eye"></i></button>
              </div>
            </div>
            <div id="login-error" class="small text-danger mb-3" role="alert" aria-live="polite">${esc(message || "")}</div>
            <button class="btn btn-pink btn-lg w-100 rounded-3 text-white fw-semibold" id="login-submit" type="submit">Masuk</button>
          </form>
          <div class="text-center small text-secondary mt-3">
            Lupa password? Hubungi admin untuk melakukan reset password.
          </div>
          <div class="auth-features">
            <div class="auth-feature"><span class="dot"></span><span>Absen masuk dan pulang dengan GPS otomatis dan selfie wajib.</span></div>
            <div class="auth-feature"><span class="dot"></span><span>Dashboard admin untuk peserta, rekap absensi, kotak saran, dan export Excel.</span></div>
            <div class="auth-feature"><span class="dot"></span><span>Data tersimpan aman di server.</span></div>
          </div>
          <div class="auth-credit"><i class="bi bi-stars"></i> ${esc(APP_CREDITS)}</div>
        </div>
      </div>
    </div>
  `;

  const form = document.getElementById("login-form");
  const errorBox = document.getElementById("login-error");
  const submit = document.getElementById("login-submit");
  const passwordInput = document.getElementById("password");
  const toggle = document.getElementById("password-toggle");

  toggle.addEventListener("click", () => {
    const visible = passwordInput.type === "text";
    passwordInput.type = visible ? "password" : "text";
    toggle.innerHTML = visible ? '<i class="bi bi-eye"></i>' : '<i class="bi bi-eye-slash"></i>';
    toggle.setAttribute("aria-label", visible ? "Lihat password" : "Sembunyikan password");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = form.elements.username.value.trim().toLowerCase();
    const password = form.elements.password.value;

    if (!username || !password) {
      errorBox.textContent = "Username dan password wajib diisi.";
      return;
    }

    errorBox.textContent = "";
    const restore = withBusy(submit, "Memeriksa...");
    try {
      const data = await rpc("app_login", { p_username: username, p_password: password });
      if (!data || !data.token) throw new Error("Login gagal.");
      state.token = data.token;
      state.user = data.user || null;
      saveToken(state.token);
      if (typeof onSuccess === "function") await onSuccess();
    } catch (error) {
      errorBox.textContent = authErrorMessage(error);
      passwordInput.focus();
      passwordInput.select();
    } finally {
      restore();
    }
  });

  document.getElementById("username").focus();
}
