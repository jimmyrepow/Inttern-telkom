import { state } from "../core/store.js";
import { rpc, handleError, isSessionExpired } from "../core/api.js";
import { esc } from "../lib/dom.js";
import { getTodayDate, formatMonth } from "../lib/format.js";
import { renderAvatar } from "../lib/avatar.js";
import { statCard } from "../lib/render.js";

let requestSerial = 0;

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

function rankIcon(rank) {
  if (rank === 1) return "bi-trophy-fill";
  if (rank === 2) return "bi-award-fill";
  if (rank === 3) return "bi-patch-check-fill";
  return "";
}

function renderPodiumCard(row) {
  const rankClass =
    row.rank === 1 ? "is-first" : row.rank === 2 ? "is-second" : "is-third";
  const icon = rankIcon(row.rank);
  return `
    <article class="leaderboard-podium-card ${rankClass} ${isMe(row) ? "is-me" : ""}">
      <div class="leaderboard-podium-rank">${icon ? '<i class="bi ' + icon + '"></i>' : ""} #${row.rank}</div>
      ${renderAvatar(row, "avatar-xl")}
      <div class="leaderboard-podium-name">${esc(row.name || "-")}</div>
      <div class="leaderboard-podium-user">@${esc(row.username || "-")}${isMe(row) ? ' <span class="badge bg-dark rounded-pill">Anda</span>' : ""}</div>
      <div class="leaderboard-podium-points">${Number(row.points) || 0} <span>poin</span></div>
      <div class="leaderboard-podium-metrics">
        <span><strong>${Number(row.present_days) || 0}</strong> hadir</span>
        <span><strong>${Number(row.on_time_days) || 0}</strong> tepat</span>
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
    return '<tr><td colspan="7" class="text-center text-secondary py-4"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Memuat peringkat...</td></tr>';
  }
  if (!rows.length) {
    return '<tr><td colspan="7" class="text-center text-secondary py-4">Belum ada peserta aktif.</td></tr>';
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
        <td data-label="Poin"><strong>${Number(row.points) || 0}</strong></td>
        <td data-label="Hadir">${Number(row.present_days) || 0} hari</td>
        <td data-label="Tepat waktu">${Number(row.on_time_days) || 0} hari</td>
        <td data-label="Telat">${Number(row.late_days) || 0} hari</td>
        <td data-label="Pulang lengkap">${Number(row.completed_days) || 0} hari</td>
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

export function renderLeaderboard() {
  const key = requestKey();
  const ready = isReady(key);
  const rows = ready ? state.leaderboardRows : [];
  const myRow = rows.find(isMe);
  const top = rows[0];
  const totalPresent = rows.reduce(
    (total, row) => total + (Number(row.present_days) || 0),
    0
  );
  const averagePoints = rows.length
    ? Math.round(
        rows.reduce((total, row) => total + (Number(row.points) || 0), 0) /
          rows.length
      )
    : 0;
  const isIntern = String((state.user && state.user.role) || "").toLowerCase() !== "admin";
  const selectedMonth = key === "all" ? "" : key;

  return `
    <div class="stats-grid mb-4">
      ${statCard("Peserta", String(rows.length), periodLabel(key))}
      ${statCard("Total hari hadir", String(totalPresent), "Akumulasi periode")}
      ${statCard("Poin tertinggi", ready && top ? String(top.points) : "-", ready && top ? top.name : "Belum ada data")}
      ${isIntern
        ? statCard("Peringkat Anda", ready && myRow ? "#" + myRow.rank : "-", ready && myRow ? myRow.points + " poin" : "Belum ada data")
        : statCard("Rata-rata poin", ready ? String(averagePoints) : "-", "Seluruh peserta")}
    </div>

    <div class="card rounded-4 border-0 shadow-sm">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div>
            <h2 class="h5 fw-bold mb-1">Peringkat kehadiran</h2>
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

        <div class="leaderboard-scoring mb-3">
          <span><i class="bi bi-calendar-check"></i> Hadir <strong>10 poin</strong></span>
          <span><i class="bi bi-alarm"></i> Tepat waktu <strong>+5 poin</strong></span>
          <span><i class="bi bi-box-arrow-right"></i> Pulang lengkap <strong>+2 poin</strong></span>
        </div>

        ${renderLoadAlert()}
        ${ready ? renderPodium(rows) : ""}

        <div class="table-responsive">
          <table class="table table-sm align-middle table-stack leaderboard-table mb-0">
            <thead>
              <tr>
                <th>Peringkat</th>
                <th>Peserta</th>
                <th>Poin</th>
                <th>Hadir</th>
                <th>Tepat waktu</th>
                <th>Telat</th>
                <th>Pulang lengkap</th>
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
