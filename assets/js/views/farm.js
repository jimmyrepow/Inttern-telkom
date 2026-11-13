import { state } from "../core/store.js";
import { rpc, handleError, isSessionExpired } from "../core/api.js";
import { esc, toast, createModal, confirmDialog } from "../lib/dom.js";
import { statCard } from "../lib/render.js";
import { renderAvatar } from "../lib/avatar.js";
import { formatDateTime } from "../lib/format.js";
import { gardenStage, formatDuration, formatCountdown, plotUnlockLevel } from "../lib/garden.js";

function safeColor(value) {
  const color = String(value || "");
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#10b981";
}

export function applyFarmState(data) {
  if (!data || typeof data !== "object") return;
  if (data.profile) state.farmProfile = data.profile;
  if (Array.isArray(data.seeds)) state.farmSeeds = data.seeds;
  if (Array.isArray(data.plots)) state.farmPlots = data.plots;
  if (Array.isArray(data.recentSteals)) state.farmRecentSteals = data.recentSteals;
  if (data.serverNow) {
    state.farmServerNow = data.serverNow;
    state.farmServerOffset = new Date(data.serverNow).getTime() - Date.now();
  }
  state.farmLoadedFor = state.user ? state.user.id : "";
}

function plotProgress(plot) {
  const start = Date.parse(plot.planted_at || "");
  const end = Date.parse(plot.ready_at || "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const now = Date.now() + (Number(state.farmServerOffset) || 0);
  return Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
}

function plotHead(index, label, badgeClass) {
  return `
    <div class="farm-plot-head">
      <span class="farm-plot-index">Plot ${index}</span>
      <span class="badge ${badgeClass} rounded-pill">${esc(label)}</span>
    </div>
  `;
}

function renderPlot(plot) {
  const index = Number(plot.plot_index) || 0;
  if (plot.locked) {
    return `
      <article class="farm-plot is-locked">
        ${plotHead(index, "Terkunci", "bg-secondary")}
        <div class="farm-plot-locked">
          <i class="bi bi-lock-fill" aria-hidden="true"></i>
          <strong>Buka di Lv. ${plotUnlockLevel(index)}</strong>
          <span>Naikkan level kebun untuk membuka plot ini.</span>
        </div>
      </article>
    `;
  }

  if (!plot.seed_code) {
    return `
      <article class="farm-plot is-empty">
        ${plotHead(index, "Kosong", "bg-light text-dark")}
        <div class="farm-plot-empty">
          <i class="bi bi-plus-circle" aria-hidden="true"></i>
          <span>Siap ditanami</span>
        </div>
        <button class="btn btn-sm btn-primary rounded-pill w-100" type="button" data-farm-plant="${index}">
          <i class="bi bi-seedling me-1"></i>Tanam bibit
        </button>
      </article>
    `;
  }

  const status = String(plot.status || "growing");
  const statusLabel = { growing: "Tumbuh", ready: "Siap panen", withered: "Layu", dead: "Kering" }[status] || status;
  const badgeClass = status === "ready"
    ? "bg-success"
    : status === "withered"
      ? "bg-warning text-dark"
      : status === "dead"
        ? "bg-danger"
        : "bg-light text-dark";
  const color = safeColor(plot.seed_color);
  const seconds = Number(plot.seconds_left) || 0;
  const progress = plotProgress(plot);
  const canWater = status === "growing" && !plot.water_used && Number(state.farmProfile.water) > 0;
  const canFertilize = status !== "dead" && !plot.fertilizer_used && Number(state.farmProfile.fertilizer) > 0;
  const canHarvest = status === "ready" || status === "withered" || status === "dead";

  return `
    <article class="farm-plot is-${status}" style="--seed-color:${color}">
      ${plotHead(index, statusLabel, badgeClass)}
      <div class="farm-plot-plant">
        <span class="farm-plant-emoji" aria-hidden="true">${esc(plot.seed_emoji || "🌱")}</span>
        <strong>${esc(plot.seed_name || plot.seed_code)}</strong>
        <span class="small text-secondary">${formatDuration(plot.duration_minutes)} · ${Number(plot.points) || 0} poin · ${Number(plot.xp) || 0} XP</span>
      </div>
      ${status === "growing" ? `
        <div class="farm-timer" data-farm-countdown="${index}" data-ready-at="${esc(plot.ready_at || "")}" data-progress-start="${esc(plot.planted_at || "")}" data-progress-end="${esc(plot.ready_at || "")}">
          <i class="bi bi-hourglass-split" aria-hidden="true"></i>
          <span data-farm-countdown-text>${formatCountdown(seconds)}</span>
        </div>
        <div class="progress farm-progress" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100" aria-label="Kemajuan tanaman plot ${index}">
          <div class="progress-bar" data-farm-progress style="width:${progress}%"></div>
        </div>
      ` : `
        <div class="farm-status-line ${status === "ready" ? "is-ready" : status === "dead" ? "is-dead" : "is-withered"}">
          <i class="bi ${status === "ready" ? "bi-basket" : status === "dead" ? "bi-x-circle" : "bi-exclamation-triangle"}" aria-hidden="true"></i>
          <span>${status === "ready" ? "Siap dipanen" : status === "dead" ? "Harus dibersihkan" : "Hasil panen 50%"}</span>
        </div>
      `}
      <div class="farm-plot-badges">
        ${plot.water_used ? '<span class="farm-mini-badge"><i class="bi bi-droplet-fill"></i> Air</span>' : ""}
        ${plot.fertilizer_used ? '<span class="farm-mini-badge"><i class="bi bi-basket-fill"></i> Pupuk</span>' : ""}
        ${Number(plot.stolen_points) > 0 ? `<span class="farm-mini-badge is-stolen"><i class="bi bi-incognito"></i> Dicuri ${Number(plot.stolen_points)}</span>` : ""}
      </div>
      <div class="farm-plot-actions">
        ${canWater ? `<button class="btn btn-sm btn-outline-info rounded-pill" type="button" data-farm-boost="water" data-plot="${index}"><i class="bi bi-droplet me-1"></i>Siram</button>` : ""}
        ${canFertilize ? `<button class="btn btn-sm btn-outline-warning rounded-pill" type="button" data-farm-boost="fertilizer" data-plot="${index}"><i class="bi bi-basket me-1"></i>Pupuk</button>` : ""}
        ${canHarvest ? `<button class="btn btn-sm ${status === "ready" ? "btn-success" : "btn-outline-secondary"} rounded-pill" type="button" data-farm-harvest="${index}"><i class="bi ${status === "ready" ? "bi-basket" : "bi-eraser"} me-1"></i>${status === "dead" ? "Bersihkan" : "Panen"}</button>` : ""}
      </div>
    </article>
  `;
}

function renderSeedPicker(plotIndex) {
  const seeds = state.farmSeeds || [];
  return `
    <div class="modal fade" id="farm-seed-modal" tabindex="-1" aria-hidden="true" aria-labelledby="farm-seed-title">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content rounded-4 border-0">
          <div class="modal-header border-0">
            <div>
              <div class="garden-eyebrow">Plot ${plotIndex}</div>
              <h2 class="h5 fw-bold mb-1" id="farm-seed-title">Pilih bibit</h2>
              <div class="small text-secondary">Bibit terbuka saat level kebun naik.</div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Tutup"></button>
          </div>
          <div class="modal-body pt-0">
            <div class="farm-seed-grid">
              ${seeds.map((seed) => `
                <article class="farm-seed-card ${seed.unlocked ? "" : "is-locked"}" style="--seed-color:${safeColor(seed.color)}">
                  <div class="farm-seed-emoji" aria-hidden="true">${esc(seed.emoji)}</div>
                  <div class="farm-seed-copy">
                    <strong>${esc(seed.name)}</strong>
                    <div class="small text-secondary">${formatDuration(seed.duration_minutes)} · ${Number(seed.points) || 0} poin · ${Number(seed.xp) || 0} XP</div>
                    <div class="small text-secondary">${esc(seed.description)}</div>
                  </div>
                  ${seed.unlocked
                    ? `<button class="btn btn-sm btn-primary rounded-pill" type="button" data-farm-seed="${esc(seed.code)}">Tanam</button>`
                    : `<span class="badge bg-secondary rounded-pill align-self-start">Buka Lv. ${Number(seed.unlock_level) || 1}</span>`}
                </article>
              `).join("")}
            </div>
          </div>
          <div class="modal-footer border-0">
            <span class="small text-secondary">Air mempercepat 15 menit. Pupuk menambah 20% hasil.</span>
            <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill" data-bs-dismiss="modal">Tutup</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderStealTarget(target, remaining) {
  const points = Number(target.stealPoints) || 0;
  const disabled = remaining <= 0 ? " disabled" : "";
  return `
    <article class="farm-steal-target">
      <div class="farm-steal-owner">
        ${renderAvatar({ name: target.ownerName, avatar_emoji: target.avatarEmoji, avatar_color: target.avatarColor }, "avatar-sm")}
        <div class="min-w-0">
          <strong>${esc(target.ownerName || "-")}</strong>
          <span>@${esc(target.ownerUsername || "-")}</span>
        </div>
      </div>
      <div class="farm-steal-plant" style="--seed-color:${safeColor(target.seedColor)}">
        <span class="farm-steal-emoji" aria-hidden="true">${esc(target.seedEmoji || "🌱")}</span>
        <div class="min-w-0">
          <strong>${esc(target.seedName || "-")}</strong>
          <span>Plot ${Number(target.plotIndex) || 0} · siap panen</span>
        </div>
        <span class="farm-steal-points">+${points}</span>
      </div>
      <button class="btn btn-sm btn-outline-danger rounded-pill w-100" type="button"
        data-farm-steal
        data-steal-owner="${esc(target.ownerId)}"
        data-steal-plot="${Number(target.plotIndex) || 0}"
        data-steal-points="${points}"
        data-steal-seed="${esc(target.seedName || "")}"
        data-steal-owner-name="${esc(target.ownerName || "")}"
        ${disabled}>
        <i class="bi bi-incognito me-1"></i>${remaining > 0 ? "Curi " + points + " poin" : "Kuota habis"}
      </button>
    </article>
  `;
}

function renderStealSection() {
  const profile = state.farmProfile;
  if (!profile) return "";
  const unlockLevel = Number(profile.steal_unlock_level) || 3;
  if (Number(profile.level) < unlockLevel) {
    return `
      <div class="card rounded-4 border-0 shadow-sm farm-steal-card mb-3">
        <div class="card-body p-3 p-md-4 d-flex align-items-start gap-3">
          <div class="farm-steal-icon is-locked"><i class="bi bi-incognito" aria-hidden="true"></i></div>
          <div>
            <h2 class="h6 fw-bold mb-1">Curi panen</h2>
            <div class="small text-secondary">Fitur ini terbuka di <strong>Lv. ${unlockLevel}</strong>. Setelah itu Anda bisa mengambil sebagian panen peserta lain yang sudah siap.</div>
          </div>
        </div>
      </div>
    `;
  }

  const info = state.farmTargetsInfo || {};
  const remaining = Number.isFinite(Number(info.remaining)) ? Number(info.remaining) : Number(profile.steal_remaining) || 0;
  const used = Number.isFinite(Number(info.usedToday)) ? Number(info.usedToday) : Number(profile.steal_used_today) || 0;
  const limit = Number.isFinite(Number(info.dailyLimit)) ? Number(info.dailyLimit) : Number(profile.steal_daily_limit) || 3;
  const targets = Array.isArray(state.farmTargets) ? state.farmTargets : [];
  const loading = state.farmTargetsLoading && !targets.length;
  const empty = !loading && !targets.length && !state.farmTargetsError;

  return `
    <div class="card rounded-4 border-0 shadow-sm farm-steal-card mb-3">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
          <div class="d-flex align-items-start gap-3">
            <div class="farm-steal-icon"><i class="bi bi-incognito" aria-hidden="true"></i></div>
            <div>
              <h2 class="h6 fw-bold mb-1">Curi panen</h2>
              <div class="small text-secondary">Ambil sebagian panen siap milik peserta lain. Pemilik tetap bisa panen, hasilnya berkurang sesuai poin yang dicuri.</div>
            </div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="badge ${remaining > 0 ? "bg-danger" : "bg-secondary"} rounded-pill">Sisa ${remaining}/${limit} hari ini</span>
            <button class="btn btn-sm btn-outline-secondary rounded-pill" type="button" data-farm-targets-refresh aria-label="Muat ulang target curi panen" title="Muat ulang target" ${state.farmTargetsLoading ? "disabled" : ""}>
              <i class="bi bi-arrow-clockwise"></i>
            </button>
          </div>
        </div>
        <div class="small text-secondary mb-3">Maksimal ${limit} kali per hari, 1 kali per peserta, dan 1 kali per plot. Poin curian masuk ke peringkat Anda.</div>
        ${state.farmTargetsError ? `<div class="alert alert-danger d-flex justify-content-between align-items-center gap-2 flex-wrap"><span>${esc(state.farmTargetsError)}</span><button class="btn btn-sm btn-outline-danger rounded-pill" type="button" data-farm-targets-refresh>Coba lagi</button></div>` : ""}
        ${loading ? '<div class="d-flex align-items-center gap-2 text-secondary small py-2"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Mencari panen siap...</div>' : ""}
        ${empty ? '<div class="farm-steal-empty"><i class="bi bi-basket" aria-hidden="true"></i><span>Belum ada panen siap milik peserta lain.</span></div>' : ""}
        ${targets.length ? `<div class="farm-steal-grid">${targets.map((target) => renderStealTarget(target, remaining)).join("")}</div>` : ""}
        ${remaining <= 0 ? '<div class="small text-secondary mt-2">Kuota curi panen hari ini habis. Kembali besok atau gunakan panen sendiri.</div>' : ""}
        <div class="small text-secondary mt-2">Sudah dipakai: ${used} kali.</div>
      </div>
    </div>
  `;
}

function renderStealLog() {
  const steals = Array.isArray(state.farmRecentSteals) ? state.farmRecentSteals : [];
  if (!steals.length) return "";
  return `
    <div class="card rounded-4 border-0 shadow-sm farm-steal-log mb-3">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
          <h2 class="h6 fw-bold mb-0"><i class="bi bi-bell text-danger me-2" aria-hidden="true"></i>Kabar kebun</h2>
          <span class="small text-secondary">Panen Anda pernah dicuri</span>
        </div>
        <div class="farm-steal-log-list">
          ${steals.slice(0, 5).map((item) => `
            <div class="farm-steal-log-item">
              <span class="farm-steal-log-emoji" aria-hidden="true">${esc(item.seed_emoji || "🌱")}</span>
              <div class="min-w-0">
                <strong>${esc(item.thief_name || "Peserta")} mencuri ${Number(item.points) || 0} poin ${esc(item.seed_name || "panen")}</strong>
                <span>Plot ${Number(item.plot_index) || 0} · ${esc(formatDateTime(item.created_at))}</span>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderLoading() {
  return `
    <div class="card rounded-4 border-0 shadow-sm">
      <div class="card-body p-4 d-flex align-items-center gap-2 text-secondary">
        <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
        <span class="small">Menumbuhkan kebun Anda...</span>
      </div>
    </div>
  `;
}

function renderError() {
  return `
    <div class="card rounded-4 border-0 shadow-sm">
      <div class="card-body p-4 text-center">
        <div class="text-secondary mb-2">${esc(state.farmError || "Gagal memuat kebun.")}</div>
        <button class="btn btn-sm btn-primary rounded-pill" type="button" data-farm-retry><i class="bi bi-arrow-clockwise me-1"></i>Coba lagi</button>
      </div>
    </div>
  `;
}

export function renderFarm() {
  if (!state.farmProfile) {
    return state.farmError ? renderError() : renderLoading();
  }

  const profile = state.farmProfile;
  const stage = gardenStage(profile.level);
  const seeds = Array.isArray(state.farmSeeds) ? state.farmSeeds : [];
  const plots = Array.isArray(state.farmPlots) ? state.farmPlots : [];
  const unlockedSeeds = seeds.filter((seed) => seed.unlocked).length;
  const remainingXp = Math.max(0, Number(profile.next_xp) - Number(profile.xp));
  const progress = Math.max(0, Math.min(100, Number(profile.progress) || 0));
  const nextLevelLabel = profile.max_level ? "Maks" : "Lv. " + (profile.level + 1);
  const progressNote = profile.max_level
    ? "Level kebun sudah maksimal."
    : remainingXp + " XP lagi menuju Lv. " + (profile.level + 1);
  const plotNote = profile.next_plot_level
    ? "Plot baru di Lv. " + profile.next_plot_level
    : "Semua plot terbuka";

  return `
    <div class="stats-grid mb-4">
      ${statCard("Level kebun", "Lv. " + profile.level, stage.label)}
      ${statCard("XP kebun", String(profile.xp), profile.max_level ? "Level maksimal" : remainingXp + " XP lagi")}
      ${statCard("Air", String(profile.water), "Dari absen masuk")}
      ${statCard("Pupuk", String(profile.fertilizer), "Dari absen pulang")}
    </div>

    ${state.farmError ? `<div class="alert alert-danger d-flex justify-content-between align-items-center gap-2 flex-wrap"><span>${esc(state.farmError)}</span><button class="btn btn-sm btn-outline-danger rounded-pill" type="button" data-farm-retry>Coba lagi</button></div>` : ""}

    <div class="card rounded-4 border-0 shadow-sm garden-hero farm-hero mb-3">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div>
            <div class="garden-eyebrow">Kebun Anda</div>
            <h2 class="h5 fw-bold mb-1"><span class="garden-hero-emoji" aria-hidden="true">${stage.emoji}</span> ${esc(stage.label)} <span class="badge garden-level-badge rounded-pill">Lv. ${profile.level}</span></h2>
            <div class="small text-secondary">${Number(profile.total_points) || 0} poin panen · ${Number(profile.total_harvests) || 0} kali panen${Number(profile.stolen_points) > 0 ? " · " + Number(profile.stolen_points) + " poin dicuri" : ""}</div>
          </div>
          <div class="text-end">
            <div class="garden-streak"><i class="bi bi-basket"></i> ${Number(profile.plot_count) || 0} / ${Number(profile.max_plots) || 5} plot</div>
            <div class="small text-secondary">${unlockedSeeds} / ${seeds.length} bibit terbuka</div>
          </div>
        </div>
        <div class="progress garden-progress" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100" aria-label="Kemajuan kebun level ${profile.level}">
          <div class="progress-bar" style="width:${progress}%"></div>
        </div>
        <div class="d-flex justify-content-between small text-secondary mt-1">
          <span>Lv. ${profile.level}</span>
          <span>${progress}%</span>
          <span>${nextLevelLabel}</span>
        </div>
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3">
          <span class="small text-secondary">${progressNote}</span>
          <span class="badge bg-light text-dark rounded-pill">${plotNote}</span>
        </div>
      </div>
    </div>

    ${renderStealLog()}

    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
      <h2 class="h5 fw-bold mb-0"><i class="bi bi-grid-3x3-gap text-success me-2" aria-hidden="true"></i>Plot kebun</h2>
      <div class="small text-secondary">Pilih bibit, tanam, lalu panen saat siap.</div>
    </div>
    <div class="farm-grid mb-3">${plots.map(renderPlot).join("")}</div>

    ${renderStealSection()}

    <div class="card rounded-4 border-0 shadow-sm farm-tips-card">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex align-items-start gap-3">
          <div class="farm-tips-icon"><i class="bi bi-lightbulb" aria-hidden="true"></i></div>
          <div>
            <h2 class="h6 fw-bold mb-1">Tips merawat kebun</h2>
            <div class="small text-secondary">Tanaman siap panen tetap aman selama setengah durasi berikutnya. Setelah itu hasilnya layu 50%, lalu kering tanpa hasil. Gunakan air untuk mempercepat panen dan pupuk untuk menambah 20% poin panen.</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function openSeedPicker(plotIndex, context) {
  if (!state.farmSeeds.length) {
    toast("Data bibit belum siap. Coba muat ulang.", "warning");
    return;
  }
  state.farmSelectedPlot = plotIndex;
  const { element, modal } = createModal(renderSeedPicker(plotIndex));
  element.addEventListener("hidden.bs.modal", () => element.remove());
  element.querySelectorAll("[data-farm-seed]").forEach((button) => {
    button.addEventListener("click", () => {
      const code = button.getAttribute("data-farm-seed") || "";
      if (!code) return;
      plantSeed(plotIndex, code, context, button, modal);
    });
  });
  modal.show();
}

async function plantSeed(plot, code, context, button, modal) {
  if (state.farmAction) return;
  state.farmAction = "plant";
  if (button) button.disabled = true;
  try {
    const result = await rpc("app_farm_plant", { p_plot_index: plot, p_seed_code: code });
    applyFarmState(result && result.state);
    if (modal) modal.hide();
    toast((result && result.message) || "Bibit ditanam.", "success");
    if (typeof context.rerender === "function") context.rerender();
  } catch (error) {
    if (isSessionExpired(error && error.message)) handleError(error);
    else toast((error && error.message) || "Gagal menanam bibit.", "danger");
    if (button) button.disabled = false;
  } finally {
    state.farmAction = "";
  }
}

async function harvestPlot(plot, context, button) {
  if (state.farmAction) return;
  state.farmAction = "harvest";
  if (button) button.disabled = true;
  try {
    const result = await rpc("app_farm_harvest", { p_plot_index: plot });
    applyFarmState(result && result.state);
    const detail = Number(result && result.points) > 0
      ? ` +${Number(result.points)} poin, +${Number(result.xp)} XP.`
      : "";
    const levelNote = result && result.leveledUp ? ` Naik ke Lv. ${result.level}!` : "";
    toast(((result && result.message) || "Panen selesai.") + detail + levelNote, result && result.quality === "dead" ? "warning" : "success");
    if (typeof context.rerender === "function") context.rerender();
  } catch (error) {
    if (isSessionExpired(error && error.message)) handleError(error);
    else toast((error && error.message) || "Gagal memanen.", "danger");
    if (button) button.disabled = false;
  } finally {
    state.farmAction = "";
  }
}

async function boostPlot(plot, kind, context, button) {
  if (state.farmAction) return;
  state.farmAction = "boost";
  if (button) button.disabled = true;
  try {
    const result = await rpc("app_farm_boost", { p_plot_index: plot, p_kind: kind });
    applyFarmState(result && result.state);
    toast((result && result.message) || "Perawatan diberikan.", "success");
    if (typeof context.rerender === "function") context.rerender();
  } catch (error) {
    if (isSessionExpired(error && error.message)) handleError(error);
    else toast((error && error.message) || "Gagal merawat tanaman.", "danger");
    if (button) button.disabled = false;
  } finally {
    state.farmAction = "";
  }
}

async function loadFarmTargets(context, force) {
  const profile = state.farmProfile;
  if (!profile) return;
  const unlock = Number(profile.steal_unlock_level) || 3;
  if (Number(profile.level) < unlock) return;
  if (state.farmTargetsLoading) return;
  if (!force && state.farmTargetsLoadedFor === (state.user && state.user.id)) return;

  state.farmTargetsLoading = true;
  state.farmTargetsError = "";
  if (context && typeof context.rerender === "function") context.rerender();

  try {
    const result = await rpc("app_farm_targets");
    state.farmTargets = Array.isArray(result && result.targets) ? result.targets : [];
    state.farmTargetsInfo = result || null;
    state.farmTargetsLoadedFor = state.user ? state.user.id : "";
  } catch (error) {
    if (isSessionExpired(error && error.message)) handleError(error);
    state.farmTargets = [];
    state.farmTargetsInfo = null;
    state.farmTargetsLoadedFor = state.user ? state.user.id : "";
    state.farmTargetsError = (error && error.message) || "Gagal mencari panen yang bisa dicuri.";
  } finally {
    state.farmTargetsLoading = false;
    if (context && typeof context.rerender === "function") context.rerender();
  }
}

async function stealHarvest(ownerId, plotIndex, points, seedName, ownerName, context, button) {
  if (state.farmAction) return;
  const confirmed = await confirmDialog({
    title: "Curi panen?",
    message: `Ambil ${points} poin dari ${seedName} milik ${ownerName}? Pemilik tetap bisa panen, tetapi hasilnya berkurang.`,
    confirmLabel: "Curi sekarang",
    cancelLabel: "Batal",
    tone: "warning",
    requireSecond: false
  });
  if (!confirmed) return;

  state.farmAction = "steal";
  if (button) button.disabled = true;
  try {
    const result = await rpc("app_farm_steal", {
      p_owner_id: ownerId,
      p_plot_index: plotIndex
    });
    applyFarmState(result && result.state);
    toast((result && result.message) || "Panen berhasil dicuri.", "success");
    state.farmTargetsLoadedFor = "";
    await loadFarmTargets(context, true);
  } catch (error) {
    if (isSessionExpired(error && error.message)) handleError(error);
    else toast((error && error.message) || "Gagal mencuri panen.", "danger");
    if (button) button.disabled = false;
    await loadFarmTargets(context, true);
  } finally {
    state.farmAction = "";
  }
}

async function loadFarm(context, force) {
  if (!force && state.farmProfile && state.farmLoadedFor === (state.user && state.user.id)) return;
  if (state.farmLoading) return;
  state.farmLoading = true;
  state.farmError = "";
  if (context && typeof context.rerender === "function") context.rerender();
  try {
    const result = await rpc("app_farm_state");
    applyFarmState(result);
  } catch (error) {
    if (isSessionExpired(error && error.message)) handleError(error);
    state.farmError = (error && error.message) || "Gagal memuat kebun.";
  } finally {
    state.farmLoading = false;
    if (context && typeof context.rerender === "function") context.rerender();
  }
}

export function stopFarmTimer() {
  if (state.farmTick) {
    clearInterval(state.farmTick);
    state.farmTick = null;
  }
}

function startFarmTimer(context) {
  stopFarmTimer();
  let refreshPending = false;

  const update = () => {
    const now = Date.now() + (Number(state.farmServerOffset) || 0);
    let needsRefresh = false;

    document.querySelectorAll("[data-farm-countdown]").forEach((element) => {
      const readyAt = Date.parse(element.getAttribute("data-ready-at") || "");
      const text = element.querySelector("[data-farm-countdown-text]");
      if (!text || !Number.isFinite(readyAt)) return;

      const seconds = Math.max(0, Math.floor((readyAt - now) / 1000));
      text.textContent = formatCountdown(seconds);

      const progress = element.querySelector("[data-farm-progress]");
      const start = Date.parse(element.getAttribute("data-progress-start") || "");
      const end = Date.parse(element.getAttribute("data-progress-end") || "");
      if (progress && Number.isFinite(start) && Number.isFinite(end) && end > start) {
        const percent = Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
        progress.style.width = percent + "%";
      }

      if (seconds === 0) needsRefresh = true;
    });

    if (needsRefresh && !refreshPending && !state.farmLoading) {
      refreshPending = true;
      loadFarm(context, true).finally(() => {
        refreshPending = false;
      });
    }
  };

  update();
  state.farmTick = setInterval(update, 1000);
}

export function attachFarmEvents(context) {
  const ctx = context || {};

  if (!state.farmProfile && !state.farmError) {
    loadFarm(ctx, false);
  } else if (state.farmProfile && !state.farmError && state.farmLoadedFor !== (state.user && state.user.id)) {
    loadFarm(ctx, true);
  }
  startFarmTimer(ctx);

  document.querySelectorAll("[data-farm-plant]").forEach((button) => {
    button.addEventListener("click", () => openSeedPicker(Number(button.dataset.farmPlant), ctx));
  });

  document.querySelectorAll("[data-farm-harvest]").forEach((button) => {
    button.addEventListener("click", () => harvestPlot(Number(button.dataset.farmHarvest), ctx, button));
  });

  document.querySelectorAll("[data-farm-boost]").forEach((button) => {
    button.addEventListener("click", () => {
      boostPlot(Number(button.dataset.plot), button.dataset.farmBoost, ctx, button);
    });
  });

  document.querySelectorAll("[data-farm-retry]").forEach((button) => {
    button.addEventListener("click", () => loadFarm(ctx, true));
  });

  document.querySelectorAll("[data-farm-steal]").forEach((button) => {
    button.addEventListener("click", () => {
      stealHarvest(
        button.dataset.stealOwner,
        Number(button.dataset.stealPlot),
        Number(button.dataset.stealPoints),
        button.dataset.stealSeed || "panen",
        button.dataset.stealOwnerName || "peserta",
        ctx,
        button
      );
    });
  });

  document.querySelectorAll("[data-farm-targets-refresh]").forEach((button) => {
    button.addEventListener("click", () => loadFarmTargets(ctx, true));
  });

  if (state.farmProfile) loadFarmTargets(ctx, false);
}
