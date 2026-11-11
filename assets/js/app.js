import { state, resetSessionState } from "./core/store.js";
import {
  configured,
  sb,
  rpc,
  setSessionExpiredHandler,
  isSessionExpired
} from "./core/api.js";
import { APP_NAME, AUTO_REFRESH_MS } from "./core/config.js";
import { readToken, clearToken } from "./core/session.js";
import { esc } from "./lib/dom.js";
import { renderAvatar } from "./lib/avatar.js";
import { renderLogin } from "./views/login.js";
import { renderAdmin, attachAdminEvents } from "./views/admin.js";
import { renderIntern, attachInternEvents } from "./views/intern.js";
import { renderAccount, attachAccountEvents } from "./views/account.js";
import { exportData } from "./services/export.js";
import { stopCamera } from "./services/photo.js";

const app = document.getElementById("app");
const MOBILE_BREAKPOINT = 992;

const NAV = {
  admin: [
    { id: "attendance", label: "Absensi", icon: "bi-calendar2-check" },
    { id: "users", label: "Peserta", icon: "bi-people" },
    { id: "settings", label: "Pengaturan", icon: "bi-sliders" },
    { id: "account", label: "Akun", icon: "bi-person-gear" },
    { id: "guide", label: "Panduan", icon: "bi-book" }
  ],
  intern: [
    { id: "absen", label: "Absen Hari Ini", icon: "bi-fingerprint" },
    { id: "riwayat", label: "Riwayat", icon: "bi-clock-history" },
    { id: "account", label: "Akun", icon: "bi-person-gear" },
    { id: "guide", label: "Panduan", icon: "bi-book" }
  ]
};

const PAGE_META = {
  admin: {
    attendance: { title: "Absensi", subtitle: "Pantau kehadiran peserta hari ini" },
    users: { title: "Peserta", subtitle: "Kelola akun, role, dan password" },
    settings: { title: "Pengaturan", subtitle: "Atur jam masuk, zona waktu, dan lokasi kantor" },
    account: { title: "Akun Saya", subtitle: "Ubah nama dan password akun Anda" },
    guide: { title: "Panduan", subtitle: "Cara memakai website untuk admin" }
  },
  intern: {
    absen: { title: "Absen Hari Ini", subtitle: "Catat kehadiran dengan GPS dan selfie" },
    riwayat: { title: "Riwayat", subtitle: "Semua absensi pribadi Anda" },
    account: { title: "Akun Saya", subtitle: "Ubah nama dan password akun Anda" },
    guide: { title: "Panduan", subtitle: "Cara memakai website untuk peserta" }
  }
};

let listenersBound = false;
let shellListenersBound = false;

function roleKey() {
  return String((state.user && state.user.role) || "intern").toLowerCase() === "admin"
    ? "admin"
    : "intern";
}

function renderLoading(message) {
  app.innerHTML = `
    <div class="loading-shell">
      <div class="spinner-border spinner-pink" role="status"></div>
      <div>${esc(message || "Memuat...")}</div>
    </div>
  `;
}

function renderConfigError() {
  state.page = "config";
  app.innerHTML = `
    <div class="auth-shell">
      <div class="card rounded-4 border-0 shadow-sm auth-card">
        <div class="card-body p-4 p-md-5">
          <div class="text-center mb-4">
            <div class="brand-box mx-auto d-flex align-items-center justify-content-center mb-3">T</div>
            <h1 class="h4 fw-bold mb-1">Konfigurasi belum lengkap</h1>
            <p class="text-secondary small mb-0">Isi URL dan publishable key Supabase terlebih dahulu.</p>
          </div>
          <div class="alert alert-warning small">
            Buka <code>assets/js/config.js</code> lalu ganti:
            <ul class="mb-0 mt-2 ps-3">
              <li><code>supabaseUrl</code> dengan URL project Supabase.</li>
              <li><code>supabaseAnonKey</code> dengan publishable key.</li>
            </ul>
          </div>
          <ol class="small text-secondary ps-3 mb-0">
            <li class="mb-1">Isi kredensial di <code>.env</code>.</li>
            <li class="mb-1">Jalankan <code>npm run migrate</code> untuk membuat skema.</li>
            <li class="mb-1">Jalankan <code>npm run seed</code> untuk akun awal.</li>
            <li>Muat ulang halaman ini.</li>
          </ol>
        </div>
      </div>
    </div>
  `;
}

function renderDashboardError(message) {
  state.page = "error";
  app.innerHTML = `
    <div class="container py-5">
      <div class="row justify-content-center">
        <div class="col-lg-7">
          <div class="card rounded-4 border-0 shadow-sm">
            <div class="card-body text-center py-5">
              <div class="display-6 mb-3"><i class="bi bi-exclamation-triangle text-warning"></i></div>
              <h1 class="h4 fw-bold">Gagal memuat data</h1>
              <p class="text-secondary mb-4 text-break-anywhere">${esc(message)}</p>
              <div class="d-flex justify-content-center gap-2 flex-wrap">
                <button class="btn btn-primary rounded-pill px-4" id="retry-btn" type="button">Coba lagi</button>
                <button class="btn btn-outline-dark rounded-pill px-4" id="error-logout" type="button">Keluar</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById("retry-btn").addEventListener("click", () => loadDashboard());
  document.getElementById("error-logout").addEventListener("click", () => logout());
}

function applyBootstrap(data) {
  state.user = data.user || state.user;
  state.users = Array.isArray(data.users) ? data.users : [];
  state.attendance = Array.isArray(data.attendance) ? data.attendance : [];
  state.settings = data.settings || {};
  state.stats = data.stats || null;
  state.lastSyncAt = data.serverTime || "";
  state.syncError = "";
}

async function loadDashboard() {
  if (!sb) {
    renderConfigError();
    return;
  }
  if (!state.token) state.token = readToken();
  if (!state.token) {
    renderLogin("", loadDashboard);
    return;
  }
  renderLoading("Memuat data dari Supabase...");
  try {
    const data = await rpc("app_bootstrap");
    applyBootstrap(data);
    state.ui.tab = roleKey() === "admin" ? "attendance" : "absen";
    renderDashboard();
    startAutoRefresh();
  } catch (error) {
    if (isSessionExpired(error.message)) {
      state.token = "";
      clearToken();
      renderLogin("Sesi berakhir. Silakan login ulang.", loadDashboard);
      return;
    }
    renderDashboardError(error.message);
  }
}

async function refreshData(options) {
  const opts = options || {};
  if (!state.token) {
    renderLogin("Sesi tidak ditemukan. Silakan login ulang.", loadDashboard);
    return;
  }
  if (state.refreshing) {
    if (opts.force) {
      await state.refreshing;
      return refreshData({ silent: opts.silent });
    }
    return state.refreshing;
  }
  if (!opts.silent) renderLoading("Memuat data...");

  const request = (async () => {
    try {
      const data = await rpc("app_bootstrap");
      applyBootstrap(data);
      renderDashboard();
    } catch (error) {
      if (isSessionExpired(error.message)) {
        forceLogout("Sesi berakhir. Silakan login ulang.");
        return;
      }
      state.syncError = error.message;
      if (opts.silent) renderDashboard();
      else renderDashboardError(error.message);
    }
  })();

  state.refreshing = request;
  try {
    await request;
  } finally {
    state.refreshing = null;
  }
}

function canAutoRefresh() {
  if (!state.user || state.page !== "dashboard" || document.hidden) return false;
  if (state.cameraStream) return false;
  if (document.querySelector(".modal.show")) return false;
  if (state.ui.tab === "settings" || state.ui.tab === "guide" || state.ui.tab === "account")
    return false;
  const active = document.activeElement;
  if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return false;
  return true;
}

function autoRefreshTick() {
  if (canAutoRefresh()) refreshData({ silent: true });
}

function startAutoRefresh() {
  if (state.timer) return;
  state.timer = setInterval(autoRefreshTick, AUTO_REFRESH_MS);
  if (!listenersBound) {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) autoRefreshTick();
    });
    window.addEventListener("focus", autoRefreshTick);
    listenersBound = true;
  }
}

function stopAutoRefresh() {
  if (!state.timer) return;
  clearInterval(state.timer);
  state.timer = null;
}

async function forceLogout(message) {
  stopAutoRefresh();
  stopCamera();
  try {
    if (sb && state.token) await rpc("app_logout");
  } catch (error) {}
  clearToken();
  resetSessionState();
  renderLogin(message || "", loadDashboard);
}

async function logout() {
  stopAutoRefresh();
  stopCamera();
  try {
    if (sb && state.token) await rpc("app_logout");
  } catch (error) {}
  clearToken();
  resetSessionState();
  renderLogin("", loadDashboard);
}

function renderSidebar(role) {
  const items = NAV[role];

  const link = (item) => `
    <button class="sidebar-link ${state.ui.tab === item.id ? "active" : ""}" type="button" data-nav="${item.id}" ${state.ui.tab === item.id ? 'aria-current="page"' : ""}>
      <i class="bi ${item.icon}"></i>
      <span>${esc(item.label)}</span>
    </button>
  `;

  return `
    <aside class="app-sidebar" id="app-sidebar" aria-label="Navigasi utama">
      <div class="sidebar-brand">
        <span class="brand-box brand-box-sm">T</span>
        <strong>TELKOM AKSES</strong>
        <button class="sidebar-close" id="sidebar-close" type="button" aria-label="Tutup menu"><i class="bi bi-x-lg"></i></button>
      </div>
      <nav class="sidebar-nav">
        ${items.map(link).join("")}
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          ${renderAvatar(state.user, "avatar-sm")}
          <div class="min-w-0">
            <strong>${esc(state.user.name)}</strong>
            <small>${esc(state.user.role)}</small>
          </div>
        </div>
        <button class="sidebar-logout" id="sidebar-logout" type="button" aria-label="Keluar" title="Keluar">
          <i class="bi bi-box-arrow-right"></i>
        </button>
      </div>
    </aside>
    <div class="sidebar-overlay" id="sidebar-overlay" ${state.ui.sidebarOpen ? "" : "hidden"}></div>
  `;
}

function renderHeader(role, isAdmin) {
  const meta = (PAGE_META[role] && PAGE_META[role][state.ui.tab]) || {
    title: "Dashboard",
    subtitle: APP_NAME
  };
  const syncLabel = state.syncError ? "Bermasalah" : "Terhubung";

  return `
    <header class="app-header">
      <button class="header-icon-btn" id="sidebar-toggle" type="button" aria-label="Buka menu" aria-controls="app-sidebar" aria-expanded="${state.ui.sidebarOpen ? "true" : "false"}">
        <i class="bi bi-list"></i>
      </button>
      <div class="header-heading">
        <h1>${esc(meta.title)}</h1>
        <p>${esc(meta.subtitle)}</p>
      </div>
      <div class="header-actions">
        <span class="sync-status ${state.syncError ? "is-error" : ""}" title="${esc(state.syncError || "Terhubung ke server")}" aria-label="${syncLabel}">
          <span class="sync-dot"></span>
        </span>
        <button class="header-icon-btn d-none d-sm-inline-flex" id="refresh-btn" type="button" aria-label="Muat ulang data" title="Muat ulang">
          <i class="bi bi-arrow-clockwise"></i>
        </button>
        ${isAdmin ? '<button class="header-icon-btn d-none d-lg-inline-flex" id="export-btn" type="button" aria-label="Export Excel" title="Export Excel"><i class="bi bi-download"></i></button>' : ""}
        <div class="dropdown">
          <button class="user-chip" type="button" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Menu akun">
            ${renderAvatar(state.user, "avatar-sm")}
            <i class="bi bi-chevron-down"></i>
          </button>
          <ul class="dropdown-menu dropdown-menu-end account-menu">
            <li class="account-menu-head">
              ${renderAvatar(state.user, "avatar-sm")}
              <div class="min-w-0">
                <strong>${esc(state.user.name)}</strong>
                <small>${esc(state.user.username)} &middot; ${esc(state.user.role)}</small>
              </div>
            </li>
            <li><button class="dropdown-item" type="button" data-nav="account"><i class="bi bi-person-gear me-2"></i>Akun saya</button></li>
            <li><button class="dropdown-item" type="button" data-nav="guide"><i class="bi bi-book me-2"></i>Panduan penggunaan</button></li>
            <li><button class="dropdown-item" id="menu-refresh" type="button"><i class="bi bi-arrow-clockwise me-2"></i>Muat ulang data</button></li>
            ${isAdmin ? '<li><button class="dropdown-item" id="menu-export" type="button"><i class="bi bi-download me-2"></i>Export Excel</button></li>' : ""}
            <li><hr class="dropdown-divider" /></li>
            <li><button class="dropdown-item text-danger" id="menu-logout" type="button"><i class="bi bi-box-arrow-right me-2"></i>Keluar</button></li>
          </ul>
        </div>
      </div>
    </header>
  `;
}

function openSidebar() {
  const shell = document.getElementById("app-shell");
  const overlay = document.getElementById("sidebar-overlay");
  const toggle = document.getElementById("sidebar-toggle");
  if (!shell) return;
  state.ui.sidebarOpen = true;
  shell.classList.add("sidebar-open");
  if (overlay) overlay.hidden = false;
  if (toggle) toggle.setAttribute("aria-expanded", "true");
  document.body.classList.add("sidebar-locked");
}

function closeSidebar() {
  const shell = document.getElementById("app-shell");
  const overlay = document.getElementById("sidebar-overlay");
  const toggle = document.getElementById("sidebar-toggle");
  if (!shell) return;
  state.ui.sidebarOpen = false;
  shell.classList.remove("sidebar-open");
  if (overlay) overlay.hidden = true;
  if (toggle) toggle.setAttribute("aria-expanded", "false");
  document.body.classList.remove("sidebar-locked");
}

function navigate(tab) {
  closeSidebar();
  state.ui.tab = tab;
  renderDashboard();
}

function renderDashboard() {
  if (!state.user) {
    renderLogin("", loadDashboard);
    return;
  }
  state.page = "dashboard";
  const role = roleKey();
  const isAdmin = role === "admin";
  const nav = NAV[role];
  if (!nav.some((item) => item.id === state.ui.tab)) state.ui.tab = nav[0].id;

  const isAccount = state.ui.tab === "account";
  const content = isAccount ? renderAccount() : isAdmin ? renderAdmin() : renderIntern();

  app.innerHTML = `
    <div class="app-shell ${state.ui.sidebarOpen ? "sidebar-open" : ""}" id="app-shell">
      ${renderSidebar(role)}
      <div class="app-main">
        ${renderHeader(role, isAdmin)}
        <main class="app-content" id="app-content">
          ${content}
        </main>
        <footer class="app-footer">
          <span>${esc(APP_NAME)}</span>
          <span class="d-none d-sm-inline">Data server: ${esc(state.lastSyncAt || "belum disinkronkan")}</span>
        </footer>
      </div>
    </div>
  `;

  document.body.classList.toggle("sidebar-locked", Boolean(state.ui.sidebarOpen));
  attachHeaderEvents();
  attachShellEvents();
  if (isAccount) attachAccountEvents({ rerender: renderDashboard, refresh: refreshData, logout });
  else if (isAdmin) attachAdminEvents({ rerender: renderDashboard, refresh: refreshData });
  else attachInternEvents({ rerender: renderDashboard, refresh: refreshData });
}

function attachHeaderEvents() {
  const refresh = document.getElementById("refresh-btn");
  if (refresh) refresh.addEventListener("click", () => refreshData());
  const refreshMenu = document.getElementById("menu-refresh");
  if (refreshMenu) refreshMenu.addEventListener("click", () => refreshData());
  const logoutBtn = document.getElementById("menu-logout");
  if (logoutBtn) logoutBtn.addEventListener("click", () => logout());
  const exportBtn = document.getElementById("export-btn");
  if (exportBtn) exportBtn.addEventListener("click", () => exportData(exportBtn));
  const exportMenu = document.getElementById("menu-export");
  if (exportMenu) exportMenu.addEventListener("click", () => exportData(exportMenu));
}

function attachShellEvents() {
  const toggle = document.getElementById("sidebar-toggle");
  if (toggle) toggle.addEventListener("click", openSidebar);
  const close = document.getElementById("sidebar-close");
  if (close) close.addEventListener("click", closeSidebar);
  const overlay = document.getElementById("sidebar-overlay");
  if (overlay) overlay.addEventListener("click", closeSidebar);

  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      navigate(button.dataset.nav);
    });
  });

  const sidebarLogout = document.getElementById("sidebar-logout");
  if (sidebarLogout) sidebarLogout.addEventListener("click", () => logout());

  if (!shellListenersBound) {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSidebar();
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth >= MOBILE_BREAKPOINT) closeSidebar();
    });
    shellListenersBound = true;
  }
}

async function init() {
  if (!configured) {
    renderConfigError();
    return;
  }
  state.token = readToken();
  if (state.token) {
    await loadDashboard();
  } else {
    renderLogin("", loadDashboard);
  }
}

setSessionExpiredHandler((message) => forceLogout(message));
init();
