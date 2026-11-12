import { state } from "../core/store.js";
import { rpc, handleError, isSessionExpired } from "../core/api.js";
import { esc } from "../lib/dom.js";
import { getTodayDate, formatMonth } from "../lib/format.js";
import { renderAvatar } from "../lib/avatar.js";
import { statCard } from "../lib/render.js";
import { gardenStage, gardenProgress } from "../lib/garden.js";

let requestSerial = 0;

const LEVEL_UNIT = 40;

function currentMonth() {
  return getTodayDate().slice(0, 7);
}

function requestedMonth() {
  if (state.ui.leaderboardMonth === "all") return "";
  return state.ui.leaderboardMonth || currentMonth();
}

function requestKey() {
  return requestedMonth() || "all";
}

function periodLabel(key) {
  return key === "all" ? "Semua waktu" : formatMonth(key);
}

function isReady(key) {
  return state.leaderboardLoadedMonth === key;
}

function isMe(row) {
  return String(row.user_id) === String(state.user && state.user.id);
}

function pointsOf(row) {
  return Math.max(0, Number(row && row.points) || 0);
}

function gardenLevel(points) {
  const value = Math.max(0, Number(points) || 0);
  return 1 + Math.floor(Math.sqrt(value / LEVEL_UNIT));
}

function farmLevelOf(row) {
  const level = Number(row && row.farm_level);
  if (Number.isFinite(level) && level > 0) return Math.floor(level);
  return gardenLevel(pointsOf(row));
}

function gardenOf(row) {
  const points = pointsOf(row);
  const level = farmLevelOf(row);
  const stage = gardenStage(level);
  const hasFarm = row && row.farm_level !== undefined && row.farm_level !== null;
  const xp = hasFarm ? Math.max(0, Number(row.farm_xp) || 0) : points;
  const start = hasFarm
    ? Math.max(0, Number(row.farm_level_xp) || 0)
    : LEVEL_UNIT * (level - 1) * (level - 1);
  const next = hasFarm
    ? Math.max(start + 1, Number(row.farm_next_xp) || 0)
    : LEVEL_UNIT * level * level;
  const progress = gardenProgress(xp, start, next);
  return {
    points,
    level,
    start,
    next,
    progress,
    remaining: Math.max(0, next - xp),
    xp,
    maxed: hasFarm ? Boolean(row.farm_max_level) : false,
    emoji: stage.emoji,
    label: stage.label
  };
}

function rankIcon(rank) {
  if (rank === 1) return "bi-trophy-fill";
  if (rank === 2) return "bi-award-fill";
  if (rank === 3) return "bi-patch-check-fill";
  return "";
}

function renderGardenBadge(row) {
  const garden = gardenOf(row);
  return `
    <span class="garden-badge" title="Level ${garden.level} · ${esc(garden.label)} · ${garden.points} poin">
      <span class="garden-badge-emoji" aria-hidden="true">${garden.emoji}</span>
      <span class="garden-badge-text">
        <strong>Lv. ${garden.level}</strong>
        <small>${esc(garden.label)}</small>
      </span>
    </span>
  `;
}

function renderPodiumCard(row) {
  const garden = gardenOf(row);
  const rankClass =
    row.rank === 1 ? "is-first" : row.rank === 2 ? "is-second" : "is-third";
  const icon = rankIcon(row.rank);
  return `
    <article class="leaderboard-podium-card ${rankClass} ${isMe(row) ? "is-me" : ""}">
      <div class="leaderboard-podium-rank">${icon ? '<i class="bi ' + icon + '"></i>' : ""} #${row.rank}</div>
      <div class="leaderboard-podium-plant" aria-hidden="true">${garden.emoji}</div>
      ${renderAvatar(row, "avatar-xl")}
      <div class="leaderboard-podium-name">${esc(row.name || "-")}</div>
      <div class="leaderboard-podium-user">@${esc(row.username || "-")}${isMe(row) ? ' <span class="badge bg-dark rounded-pill">Anda</span>' : ""}</div>
      <div class="leaderboard-podium-points">${garden.points} <span>poin</span></div>
      <div class="leaderboard-podium-level">Lv. ${garden.level} · ${esc(garden.label)}</div>
      <div class="leaderboard-podium-metrics">
        <span><i class="bi bi-fire"></i> <strong>${Number(row.current_streak) || 0}</strong> streak</span>
        <span><i class="bi bi-basket"></i> <strong>${Number(row.farm_harvests) || 0}</strong> panen</span>
        <span><i class="bi bi-flower1"></i> <strong>${Number(row.farm_points) || 0}</strong> poin panen</span>
      </div>
    </article>
  `;
}

function renderPodium(rows) {
  if (!rows.length) return "";
  const top = rows.length >= 3 ? [rows[1], rows[0], rows[2]] : rows.slice(0, 3);
  return `<div class="leaderboard-podium mb-3">${top.map(renderPodiumCard).join("")}</div>`;
}

function renderRank(rank) {
  const icon = rankIcon(rank);
  return (
    '<span class="leaderboard-rank ' +
    (rank <= 3 ? "is-podium" : "") +
    '">' +
    (icon ? '<i class="bi ' + icon + '"></i>' : "") +
    rank +
    "</span>"
  );
}

function renderRows(rows, ready) {
  if (!ready) {
    return '<tr><td colspan="9" class="text-center text-secondary py-4"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Memuat kebun peserta...</td></tr>';
  }
  if (!rows.length) {
    return '<tr><td colspan="9" class="text-center text-secondary py-4">Belum ada peserta aktif.</td></tr>';
  }
  return rows
    .map(
      (row) => `
      <tr class="${isMe(row) ? "leaderboard-row is-me" : "leaderboard-row"}">
        <td data-label="Peringkat">${renderRank(Number(row.rank) || 0)}</td>
        <td data-label="Peserta">
          <div class="d-flex align-items-center gap-2">
            ${renderAvatar(row, "avatar-sm")}
            <div class="min-w-0">
              <div class="fw-semibold">${esc(row.name || "-")}${isMe(row) ? ' <span class="badge bg-dark rounded-pill ms-1">Anda</span>' : ""}</div>
              <div class="small text-secondary">@${esc(row.username || "-")}</div>
            </div>
          </div>
        </td>
        <td data-label="Kebun">${renderGardenBadge(row)}</td>
        <td data-label="Poin"><strong>${pointsOf(row)}</strong></td>
        <td data-label="Kehadiran">${Number(row.attendance_points) || 0}</td>
        <td data-label="Panen" title="Poin panen ${Number(row.farm_points) || 0} · curian ${Number(row.farm_steal_points) || 0} · bonus dihitung ${Number(row.farm_bonus) || 0}">${Number(row.farm_bonus) || 0}<div class="small text-secondary">${Number(row.farm_points) || 0} poin${Number(row.farm_steals) > 0 ? " · " + Number(row.farm_steals) + " curian" : ""}</div></td>
        <td data-label="Hadir">${Number(row.present_days) || 0} hari</td>
        <td data-label="Tepat waktu">${Number(row.on_time_days) || 0} hari</td>
        <td data-label="Streak"><span class="garden-streak"><i class="bi bi-fire"></i> ${Number(row.current_streak) || 0} hari</span></td>
      </tr>
    `
    )
    .join("");
}

function renderLoadAlert() {
  if (!state.leaderboardError) return "";
  return `
    <div class="alert alert-danger small d-flex justify-content-between align-items-center flex-wrap gap-2" role="alert">
      <span>${esc(state.leaderboardError)}</span>
      <button class="btn btn-sm btn-outline-danger rounded-pill" id="leaderboard-retry" type="button">Coba lagi</button>
    </div>
  `;
}

function todayRowForMe() {
  const today = getTodayDate();
  const userId = String(state.user && state.user.id);
  return (
    (state.attendance || []).find(
      (row) => String(row.user_id) === userId && String(row.date) === today
    ) || null
  );
}

function renderQuests(todayRow) {
  const quests = [
    {
      label: "Absen masuk",
      done: Boolean(todayRow && todayRow.check_in),
      reward: "+10"
    },
    {
      label: "Tepat waktu",
      done: Boolean(todayRow && todayRow.check_in && String(todayRow.status) !== "late"),
      reward: "+5"
    },
    {
      label: "Absen pulang",
      done: Boolean(todayRow && todayRow.check_out),
      reward: "+2"
    },
    {
      label: "Isi catatan",
      done: Boolean(todayRow && String(todayRow.note || "").trim()),
      reward: "+1"
    }
  ];
  return quests
    .map(
      (quest) => `
      <li class="garden-quest ${quest.done ? "is-done" : ""}">
        <i class="bi ${quest.done ? "bi-check-circle-fill" : "bi-circle"}" aria-hidden="true"></i>
        <span>${esc(quest.label)}</span>
        <small>${quest.reward}</small>
      </li>
    `
    )
    .join("");
}

function renderPersonalGarden(myRow, ready) {
  if (!ready) {
    return `
      <div class="card rounded-4 border-0 shadow-sm garden-hero mb-3">
        <div class="card-body p-4 d-flex align-items-center gap-2 text-secondary">
          <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
          <span class="small">Menumbuhkan kebun Anda...</span>
        </div>
      </div>
    `;
  }
  if (!myRow) return "";
  const garden = gardenOf(myRow);
  const todayRow = todayRowForMe();
  const attendedToday = Boolean(todayRow && todayRow.check_in);
  const nextLevelLabel = garden.maxed ? "Maks" : "Lv. " + (garden.level + 1);
  const progressNote = garden.maxed
    ? "Level kebun sudah maksimal."
    : garden.remaining + " XP lagi menuju Lv. " + (garden.level + 1);
  return `
    <div class="card rounded-4 border-0 shadow-sm garden-hero mb-3">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div>
            <div class="garden-eyebrow">Kebun Anda</div>
            <h2 class="h5 fw-bold mb-1"><span class="garden-hero-emoji" aria-hidden="true">${garden.emoji}</span> ${esc(garden.label)} <span class="badge garden-level-badge rounded-pill">Lv. ${garden.level}</span></h2>
            <div class="small text-secondary">${garden.points} poin · ${garden.xp} XP · ${Number(myRow.farm_total_harvests) || 0} kali panen</div>
          </div>
          <div class="text-end">
            <div class="garden-streak"><i class="bi bi-fire"></i> ${Number(myRow.current_streak) || 0} hari beruntun</div>
            <div class="small text-secondary">Rekor ${Number(myRow.best_streak) || 0} hari</div>
            <button class="btn btn-sm btn-primary rounded-pill mt-2" type="button" data-nav="farm"><i class="bi bi-flower1 me-1"></i>Buka Kebun</button>
          </div>
        </div>
        <div class="progress garden-progress" role="progressbar" aria-valuenow="${garden.progress}" aria-valuemin="0" aria-valuemax="100" aria-label="Kemajuan kebun level ${garden.level}">
          <div class="progress-bar" style="width:${garden.progress}%"></div>
        </div>
        <div class="d-flex justify-content-between small text-secondary mt-1">
          <span>Lv. ${garden.level}</span>
          <span>${garden.progress}%</span>
          <span>${nextLevelLabel}</span>
        </div>
        <div class="small text-secondary mt-1">${progressNote}</div>
        <div class="garden-metrics mt-3">
          <span><i class="bi bi-calendar-check"></i><strong>${Number(myRow.present_days) || 0}</strong> hadir</span>
          <span><i class="bi bi-basket"></i><strong>${Number(myRow.farm_harvests) || 0}</strong> panen</span>
          <span><i class="bi bi-flower1"></i><strong>${Number(myRow.farm_points) || 0}</strong> poin kebun</span>
          <span><i class="bi bi-incognito"></i><strong>${Number(myRow.farm_steal_points) || 0}</strong> curian</span>
          <span><i class="bi bi-sunrise"></i><strong>${Number(myRow.early_bird_days) || 0}</strong> datang awal</span>
        </div>
        <hr class="my-3" />
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
          <strong class="small">Misi hari ini</strong>
          ${attendedToday ? '<span class="badge bg-success rounded-pill">Sudah absen</span>' : '<button class="btn btn-sm btn-primary rounded-pill" type="button" data-nav="absen">Absen sekarang</button>'}
        </div>
        <ul class="garden-quests">${renderQuests(todayRow)}</ul>
        <div class="small text-secondary mt-2">Air tersedia: ${Number(myRow.farm_water) || 0} · Pupuk tersedia: ${Number(myRow.farm_fertilizer) || 0}. Absen masuk/pulang untuk menambah stok.</div>
      </div>
    </div>
  `;
}

function renderRulesCard() {
  const rules = [
    { icon: "bi-calendar-check", label: "Hadir", value: "+10" },
    { icon: "bi-alarm", label: "Tepat waktu", value: "+5" },
    { icon: "bi-box-arrow-right", label: "Pulang lengkap", value: "+2" },
    { icon: "bi-journal-text", label: "Isi catatan", value: "+1" },
    { icon: "bi-hourglass-split", label: "Durasi kerja", value: "+1/jam, maks +5" },
    { icon: "bi-fire", label: "Streak", value: "+1 s.d. +5/hari" },
    { icon: "bi-sunrise", label: "Datang awal", value: "+3 / +2 / +1" },
    { icon: "bi-flower1", label: "Panen bibit", value: "+1 s.d. +25" },
    { icon: "bi-incognito", label: "Curi panen", value: "25%, maks +5" }
  ];
  return `
    <div class="card rounded-4 border-0 shadow-sm garden-rules-card mb-3">
      <details open>
        <summary class="garden-rules-summary">
          <span class="garden-rules-heading"><i class="bi bi-flower1" aria-hidden="true"></i> Cara menumbuhkan kebun</span>
          <span class="small text-secondary">Poin tumbuh dari kebiasaan, bukan hanya hadir</span>
          <i class="bi bi-chevron-down garden-rules-chevron" aria-hidden="true"></i>
        </summary>
        <div class="garden-rules-body">
          <div class="garden-rule-grid">
            ${rules
              .map(
                (rule) => `
                <span class="garden-rule">
                  <i class="bi ${rule.icon}" aria-hidden="true"></i>
                  <span>${esc(rule.label)}</span>
                  <strong>${esc(rule.value)}</strong>
                </span>
              `
              )
              .join("")}
          </div>
          <div class="small text-secondary mt-3">Streak dihitung dari hari kerja berturut-turut. Datang awal diberikan kepada 3 peserta paling awal absen masuk setiap hari. Kebun naik level dari XP panen. Poin panen dan poin curian menjadi bonus peringkat maksimal sebesar poin kehadiran Anda. Air mempercepat 15 menit, pupuk menambah 20% hasil panen. Curi panen terbuka di Lv. 3, maksimal 3 kali/hari, 1 kali per peserta, dan 1 kali per plot.</div>
        </div>
      </details>
    </div>
  `;
}

export function renderLeaderboard() {
  const key = requestKey();
  const ready = isReady(key);
  const rows = ready ? state.leaderboardRows : [];
  const myRow = rows.find(isMe);
  const top = rows[0];
  const topGarden = top ? gardenOf(top) : null;
  const totalHarvest = rows.reduce(
    (total, row) => total + (Number(row.farm_harvests) || 0),
    0
  );
  const totalFarmPoints = rows.reduce(
    (total, row) => total + (Number(row.farm_points) || 0),
    0
  );
  const averagePoints = rows.length
    ? Math.round(
        rows.reduce((total, row) => total + pointsOf(row), 0) / rows.length
      )
    : 0;
  const isIntern = String((state.user && state.user.role) || "").toLowerCase() !== "admin";
  const selectedMonth = key === "all" ? "" : key;

  return `
    <div class="stats-grid mb-4">
      ${statCard("Peserta", ready ? String(rows.length) : "-", periodLabel(key))}
      ${statCard("Total panen", ready ? String(totalHarvest) : "-", ready ? totalFarmPoints + " poin kebun" : "Belum ada data")}
      ${statCard("Kebun teratas", ready && top ? topGarden.emoji + " " + top.name : "-", ready && top ? "Lv. " + topGarden.level + " · " + topGarden.xp + " XP" : "Belum ada data")}
      ${isIntern
        ? statCard("Peringkat Anda", ready && myRow ? "#" + myRow.rank : "-", ready && myRow ? pointsOf(myRow) + " poin · Lv. " + gardenOf(myRow).level : "Belum ada data")
        : statCard("Rata-rata poin", ready ? String(averagePoints) : "-", "Seluruh peserta")}
    </div>

    ${isIntern ? renderPersonalGarden(myRow, ready) : ""}
    ${renderRulesCard()}

    <div class="card rounded-4 border-0 shadow-sm">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div>
            <h2 class="h5 fw-bold mb-1"><i class="bi bi-trophy text-warning me-2"></i>Kebun Magang</h2>
            <div class="small text-secondary">${esc(periodLabel(key))} &middot; ${ready ? state.leaderboardRows.length + " peserta" : "memuat data"}${state.leaderboardGeneratedAt ? " &middot; diperbarui " + esc(String(state.leaderboardGeneratedAt).replace("T", " ")) : ""}</div>
          </div>
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <input id="leaderboard-month" class="form-control form-control-sm rounded-3" type="month" value="${esc(selectedMonth)}" max="${esc(currentMonth())}" aria-label="Pilih bulan peringkat" style="max-width: 170px" />
            <button class="btn btn-sm btn-outline-primary rounded-pill" id="leaderboard-current" type="button">Bulan ini</button>
            <button class="btn btn-sm btn-outline-secondary rounded-pill" id="leaderboard-all" type="button" ${key === "all" ? "disabled" : ""}>Semua waktu</button>
            <button class="btn btn-sm btn-outline-secondary rounded-pill" id="leaderboard-refresh" type="button" aria-label="Muat ulang peringkat" title="Muat ulang">
              <i class="bi bi-arrow-clockwise"></i>
            </button>
          </div>
        </div>

        ${renderLoadAlert()}
        ${ready ? renderPodium(rows) : ""}

        <div class="table-responsive">
          <table class="table table-sm align-middle table-stack leaderboard-table mb-0">
            <thead>
              <tr>
                <th>Peringkat</th>
                <th>Peserta</th>
                <th>Kebun</th>
                <th>Poin</th>
                <th>Kehadiran</th>
                <th>Panen</th>
                <th>Hadir</th>
                <th>Tepat waktu</th>
                <th>Streak</th>
              </tr>
            </thead>
            <tbody>${renderRows(rows, ready)}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

async function loadLeaderboard(key, context, options) {
  const opts = options || {};
  if (!opts.force && state.leaderboardLoadedMonth === key && !state.leaderboardError) {
    return;
  }
  if (state.leaderboardLoading && state.leaderboardLoadingKey === key) return;

  const serial = ++requestSerial;
  state.leaderboardLoading = true;
  state.leaderboardLoadingKey = key;
  state.leaderboardError = "";
  if (context && typeof context.rerender === "function") context.rerender();

  try {
    const result = await rpc("app_leaderboard", {
      p_month: key === "all" ? "" : key
    });
    if (serial !== requestSerial) return;
    state.leaderboardRows = Array.isArray(result && result.rows) ? result.rows : [];
    state.leaderboardGeneratedAt = (result && result.generatedAt) || "";
    state.leaderboardLoadedMonth = key;
  } catch (error) {
    if (serial !== requestSerial) return;
    if (isSessionExpired(error && error.message)) {
      handleError(error);
    }
    state.leaderboardRows = [];
    state.leaderboardGeneratedAt = "";
    state.leaderboardLoadedMonth = key;
    state.leaderboardError =
      error && error.message ? error.message : "Gagal memuat peringkat kehadiran.";
  } finally {
    if (serial === requestSerial) {
      state.leaderboardLoading = false;
      state.leaderboardLoadingKey = "";
      if (context && typeof context.rerender === "function") context.rerender();
    }
  }
}

export function attachLeaderboardEvents(context) {
  const ctx = context || {};
  const key = requestKey();

  if (state.leaderboardLoadedMonth !== key && state.leaderboardLoadingKey !== key) {
    loadLeaderboard(key, ctx);
  }

  const month = document.getElementById("leaderboard-month");
  if (month) {
    month.addEventListener("change", () => {
      state.ui.leaderboardMonth = month.value || currentMonth();
      if (typeof ctx.rerender === "function") ctx.rerender();
    });
  }

  const current = document.getElementById("leaderboard-current");
  if (current) {
    current.addEventListener("click", () => {
      state.ui.leaderboardMonth = currentMonth();
      if (typeof ctx.rerender === "function") ctx.rerender();
    });
  }

  const all = document.getElementById("leaderboard-all");
  if (all) {
    all.addEventListener("click", () => {
      state.ui.leaderboardMonth = "all";
      if (typeof ctx.rerender === "function") ctx.rerender();
    });
  }

  const refresh = document.getElementById("leaderboard-refresh");
  if (refresh) {
    refresh.addEventListener("click", () => loadLeaderboard(key, ctx, { force: true }));
  }

  const retry = document.getElementById("leaderboard-retry");
  if (retry) {
    retry.addEventListener("click", () => loadLeaderboard(key, ctx, { force: true }));
  }
}
