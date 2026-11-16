import { state } from "../core/store.js";
import { rpc, handleError, isSessionExpired } from "../core/api.js";
import { esc, toast, confirmDialog } from "../lib/dom.js";
import { renderAvatar } from "../lib/avatar.js";
import { statCard } from "../lib/render.js";
import { formatDateTime } from "../lib/format.js";

const LETTERS = ["A", "B", "C", "D"];

let expiryHandledFor = "";

function formatClock(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return String(minutes).padStart(2, "0") + ":" + String(rest).padStart(2, "0");
}

function applyQuizState(data) {
  if (!data || typeof data !== "object") return;
  if (data.profile) state.quizProfile = data.profile;
  if (Object.prototype.hasOwnProperty.call(data, "activeSession")) {
    state.quizSession = data.activeSession || null;
  }
  if (Array.isArray(data.recent)) state.quizRecent = data.recent;
  if (Array.isArray(data.leaders)) state.quizLeaders = data.leaders;
  if (data.serverNow) {
    state.quizServerOffset = new Date(data.serverNow).getTime() - Date.now();
  }
  state.quizLoadedFor = state.user ? state.user.id : "";
}

function renderNotice() {
  const notice = state.quizNotice;
  if (!notice) return "";
  const tone = notice.tone === "warning" ? "warning" : notice.tone === "danger" ? "danger" : "success";
  const icon =
    tone === "warning"
      ? "bi-exclamation-triangle"
      : tone === "danger"
        ? "bi-x-octagon"
        : "bi-check-circle";
  return `
    <div class="alert alert-${tone} d-flex align-items-start gap-2 quiz-notice" role="status">
      <i class="bi ${icon} fs-5" aria-hidden="true"></i>
      <div class="min-w-0">
        <div class="fw-semibold">${esc(notice.title || "")}</div>
        <div class="small">${esc(notice.message || "")}</div>
      </div>
    </div>
  `;
}

function renderLoading() {
  return `
    <div class="card rounded-4 border-0 shadow-sm">
      <div class="card-body p-4 d-flex align-items-center gap-2 text-secondary">
        <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
        <span class="small">Menyiapkan bank soal kuis...</span>
      </div>
    </div>
  `;
}

function renderError() {
  return `
    <div class="card rounded-4 border-0 shadow-sm">
      <div class="card-body p-4 text-center">
        <div class="text-secondary mb-2">${esc(state.quizError || "Gagal memuat kuis.")}</div>
        <button class="btn btn-sm btn-primary rounded-pill" type="button" data-quiz-retry>
          <i class="bi bi-arrow-clockwise me-1"></i>Coba lagi
        </button>
      </div>
    </div>
  `;
}

function renderRecent() {
  const recent = Array.isArray(state.quizRecent) ? state.quizRecent : [];
  if (!recent.length) {
    return '<div class="quiz-empty"><i class="bi bi-hourglass" aria-hidden="true"></i><span>Belum ada sesi kuis yang selesai.</span></div>';
  }
  return `
    <div class="quiz-recent-list">
      ${recent
        .map((item) => {
          const total = Number(item.answeredCount) || 0;
          const correct = Number(item.correctCount) || 0;
          const points = Number(item.pointsAwarded) || 0;
          const expired = item.status === "expired";
          return `
            <div class="quiz-recent-item">
              <span class="quiz-recent-icon ${expired ? "is-expired" : ""}">
                <i class="bi ${expired ? "bi-clock-history" : "bi-check2-circle"}" aria-hidden="true"></i>
              </span>
              <div class="min-w-0">
                <strong>${correct} / ${total} benar</strong>
                <small>${esc(formatDateTime(item.completedAt))}${expired ? " · waktu habis" : ""}</small>
              </div>
              <span class="quiz-recent-points">+${points}</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderLeaders() {
  const leaders = Array.isArray(state.quizLeaders) ? state.quizLeaders : [];
  if (!leaders.length) {
    return '<div class="quiz-empty"><i class="bi bi-trophy" aria-hidden="true"></i><span>Belum ada peringkat kuis. Jadilah yang pertama!</span></div>';
  }
  return `
    <div class="quiz-leader-list">
      ${leaders
        .map((row, index) => {
          const rank = index + 1;
          const isMe =
            String(row.username || "") === String((state.user && state.user.username) || "");
          return `
            <div class="quiz-leader-item ${isMe ? "is-me" : ""}">
              <span class="quiz-leader-rank">#${rank}</span>
              ${renderAvatar(
                {
                  name: row.name,
                  avatar_emoji: row.avatarEmoji,
                  avatar_color: row.avatarColor
                },
                "avatar-sm"
              )}
              <div class="min-w-0">
                <strong>${esc(row.name || "-")}${isMe ? ' <span class="badge bg-dark rounded-pill">Anda</span>' : ""}</strong>
                <small>@${esc(row.username || "-")} · ${Number(row.sessions) || 0} sesi · rekor ${Number(row.bestScore) || 0}</small>
              </div>
              <span class="quiz-leader-points">${Number(row.totalPoints) || 0}</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderRules() {
  return `
    <div class="card rounded-4 border-0 shadow-sm quiz-rules-card mb-3">
      <details>
        <summary class="quiz-rules-summary">
          <span><i class="bi bi-info-circle me-2" aria-hidden="true"></i>Cara kerja kuis</span>
          <i class="bi bi-chevron-down quiz-rules-chevron" aria-hidden="true"></i>
        </summary>
        <div class="quiz-rules-body">
          <div class="quiz-rule-grid">
            <span><i class="bi bi-list-ol"></i> 10 soal acak per sesi</span>
            <span><i class="bi bi-stopwatch"></i> 15 menit per sesi</span>
            <span><i class="bi bi-star"></i> +10 poin tiap jawaban benar</span>
            <span><i class="bi bi-gem"></i> +20 bonus jika 10 benar</span>
            <span><i class="bi bi-calendar3"></i> maksimal 3 sesi per hari</span>
            <span><i class="bi bi-arrow-repeat"></i> soal baru diprioritaskan</span>
          </div>
          <div class="small text-secondary mt-3">Jawaban yang sudah dikirim tidak dapat diubah. Jika waktu habis, sesi otomatis ditutup dan poin dari jawaban yang sudah masuk tetap dihitung. Soal yang belum pernah keluar akan diprioritaskan agar tidak mengulang soal yang sama.</div>
        </div>
      </details>
    </div>
  `;
}

function renderLobby() {
  const profile = state.quizProfile;
  const remaining = Number(profile.remaining_sessions) || 0;
  const bank = Number(profile.question_bank) || 0;
  const needed = Number(profile.question_count) || 10;
  const seen = Number(profile.seen_questions) || 0;
  const coverage = bank > 0 ? Math.min(100, Math.round((seen / bank) * 100)) : 0;
  const bankReady = bank >= needed;
  const canStart = remaining > 0 && bankReady;
  const startLabel = !bankReady
    ? "Bank soal belum siap"
    : remaining > 0
      ? "Mulai kuis"
      : "Kuota hari ini habis";

  return `
    ${renderNotice()}
    <div class="stats-grid mb-4">
      ${statCard("Total poin kuis", String(profile.total_points || 0), "Kumpulkan sebanyak mungkin")}
      ${statCard("Sesi hari ini", (Number(profile.today_sessions) || 0) + " / " + (Number(profile.daily_limit) || 3), remaining + " sesi tersisa")}
      ${statCard("Akurasi jawaban", (Number(profile.accuracy) || 0) + "%", (Number(profile.total_correct) || 0) + " benar dari " + (Number(profile.total_answered) || 0))}
      ${statCard("Rekor terbaik", (Number(profile.best_score) || 0) + " / " + needed, (Number(profile.best_points) || 0) + " poin dalam satu sesi")}
    </div>

    <div class="card rounded-4 border-0 shadow-sm quiz-hero mb-3">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">
          <div class="quiz-hero-copy">
            <div class="quiz-eyebrow"><i class="bi bi-patch-question" aria-hidden="true"></i> Kuis Telkom Akses</div>
            <h2 class="h4 fw-bold mb-2">Seberapa paham kamu tentang jaringan akses?</h2>
            <p class="text-secondary small mb-3">Kerjakan ${needed} soal acak dari ${bank} soal seputar fiber optic, FTTH, OSP, perangkat jaringan, K3, sampai studi kasus lapangan. Soal yang belum pernah keluar akan diprioritaskan supaya setiap sesi terasa baru.</p>
            <div class="quiz-chips">
              <span><i class="bi bi-list-ol"></i>${needed} soal</span>
              <span><i class="bi bi-stopwatch"></i>${Number(profile.duration_minutes) || 15} menit</span>
              <span><i class="bi bi-star"></i>+${Number(profile.points_per_correct) || 10} / benar</span>
              <span><i class="bi bi-gem"></i>+${Number(profile.perfect_bonus) || 20} sempurna</span>
            </div>
            <div class="d-flex align-items-center gap-2 flex-wrap mt-3">
              <button class="btn btn-primary rounded-pill px-4" type="button" data-quiz-start ${canStart ? "" : "disabled"}>
                <i class="bi bi-play-fill me-1"></i>${startLabel}
              </button>
              <span class="small text-secondary">${remaining > 0 ? remaining + " sesi tersisa hari ini" : "Kembali lagi besok untuk sesi baru"}</span>
            </div>
          </div>
          <div class="quiz-hero-badge" aria-hidden="true">
            <i class="bi bi-lightning-charge-fill"></i>
            <strong>${Number(profile.total_sessions) || 0}</strong>
            <span>sesi selesai</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card rounded-4 border-0 shadow-sm mb-3">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
          <h2 class="h6 fw-bold mb-0"><i class="bi bi-collection text-primary me-2" aria-hidden="true"></i>Cakupan bank soal</h2>
          <span class="badge bg-light text-dark rounded-pill">${seen} / ${bank} soal pernah keluar</span>
        </div>
        <div class="progress quiz-coverage" role="progressbar" aria-valuenow="${coverage}" aria-valuemin="0" aria-valuemax="100" aria-label="Cakupan bank soal">
          <div class="progress-bar" style="width:${coverage}%"></div>
        </div>
        <div class="small text-secondary mt-2">${Number(profile.unseen_questions) || 0} soal belum pernah keluar. Sistem memilih soal yang paling lama tidak muncul agar tidak mengulang soal yang sama.</div>
      </div>
    </div>

    ${renderRules()}

    <div class="row g-3">
      <div class="col-lg-6">
        <div class="card rounded-4 border-0 shadow-sm h-100">
          <div class="card-body p-3 p-md-4">
            <h2 class="h6 fw-bold mb-3"><i class="bi bi-clock-history text-secondary me-2" aria-hidden="true"></i>Sesi terakhir</h2>
            ${renderRecent()}
          </div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="card rounded-4 border-0 shadow-sm h-100">
          <div class="card-body p-3 p-md-4">
            <h2 class="h6 fw-bold mb-3"><i class="bi bi-trophy text-warning me-2" aria-hidden="true"></i>Peringkat kuis</h2>
            ${renderLeaders()}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderOption(question, option, index) {
  const letter = LETTERS[index];
  const answered = Boolean(question.answered);
  const selected = String(question.selected_option || "") === letter;
  const correct = String(question.correct_option || "") === letter;
  let className = "quiz-option";
  if (answered) {
    if (correct) className += " is-correct";
    else if (selected) className += " is-wrong";
    else className += " is-muted";
  }
  const icon = answered
    ? correct
      ? '<i class="bi bi-check-circle-fill" aria-hidden="true"></i>'
      : selected
        ? '<i class="bi bi-x-circle-fill" aria-hidden="true"></i>'
        : ""
    : "";
  return `
    <button class="${className}" type="button"
      data-quiz-answer="${Number(question.id) || 0}"
      data-quiz-question="${Number(question.id) || 0}"
      data-quiz-option="${letter}"
      ${answered ? "disabled" : ""}>
      <span class="quiz-option-letter">${letter}</span>
      <span class="quiz-option-text">${esc(option)}</span>
      ${icon}
    </button>
  `;
}

function renderQuestion(question, index) {
  const answered = Boolean(question.answered);
  const options = Array.isArray(question.options) ? question.options : [];
  return `
    <article class="quiz-question ${answered ? (question.is_correct ? "is-correct" : "is-wrong") : ""}">
      <div class="quiz-question-head">
        <span class="quiz-question-number">${index + 1}</span>
        <span class="badge bg-light text-dark rounded-pill">${esc(question.category || "Umum")}</span>
        ${answered ? `<span class="quiz-question-status">${question.is_correct ? '<i class="bi bi-check-circle-fill"></i> Benar' : '<i class="bi bi-x-circle-fill"></i> Kurang tepat'}</span>` : ""}
      </div>
      <h3 class="quiz-question-text">${esc(question.question || "")}</h3>
      <div class="quiz-options">
        ${options.map((option, optionIndex) => renderOption(question, option, optionIndex)).join("")}
      </div>
      ${answered ? `
        <div class="quiz-explanation">
          <i class="bi bi-lightbulb" aria-hidden="true"></i>
          <div>
            <strong>Jawaban benar: ${esc(question.correct_option || "-")}</strong>
            <div>${esc(question.explanation || "Tidak ada penjelasan tambahan.")}</div>
          </div>
        </div>
      ` : ""}
    </article>
  `;
}

function renderPlay(session) {
  const questions = Array.isArray(session.questions) ? session.questions : [];
  const total = Number(session.totalQuestions) || questions.length;
  const answered = Number(session.answeredCount) || 0;
  const correct = Number(session.correctCount) || 0;
  const progress = total > 0 ? Math.min(100, Math.round((answered / total) * 100)) : 0;
  const remainingMs =
    Date.parse(session.expiresAt || "") - (Date.now() + (Number(state.quizServerOffset) || 0));
  const remainingSeconds = Number.isFinite(remainingMs) ? Math.max(0, Math.floor(remainingMs / 1000)) : 0;

  return `
    ${renderNotice()}
    <div class="card rounded-4 border-0 shadow-sm quiz-play-head mb-3">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div>
            <div class="quiz-eyebrow"><i class="bi bi-broadcast" aria-hidden="true"></i> Sesi aktif</div>
            <h2 class="h5 fw-bold mb-1">Jawab semua soal sebelum waktu habis</h2>
            <div class="small text-secondary">Benar ${correct} dari ${answered} soal yang sudah dijawab. Jawaban tidak bisa diubah.</div>
          </div>
          <div class="quiz-timer" data-quiz-countdown data-quiz-session="${esc(session.id || "")}" data-expires-at="${esc(session.expiresAt || "")}" aria-live="polite">
            <i class="bi bi-stopwatch" aria-hidden="true"></i>
            <span data-quiz-countdown-text>${formatClock(remainingSeconds)}</span>
          </div>
        </div>
        <div class="d-flex justify-content-between small text-secondary mt-3 mb-1">
          <span>${answered} / ${total} soal dijawab</span>
          <span>${progress}%</span>
        </div>
        <div class="progress quiz-progress" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100" aria-label="Kemajuan menjawab soal">
          <div class="progress-bar" style="width:${progress}%"></div>
        </div>
      </div>
    </div>

    <div class="quiz-question-list">
      ${questions.map((question, index) => renderQuestion(question, index)).join("")}
    </div>

    <div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mt-3">
      <span class="small text-secondary">Poin dihitung otomatis di server setelah sesi selesai.</span>
      <button class="btn btn-outline-danger rounded-pill px-4" type="button" data-quiz-finish>
        <i class="bi bi-flag me-1"></i>Akhiri sesi
      </button>
    </div>
  `;
}

export function renderQuiz() {
  if (!state.quizProfile) {
    return state.quizError ? renderError() : renderLoading();
  }
  const session = state.quizSession;
  if (session && session.status === "active") {
    return renderPlay(session);
  }
  return renderLobby();
}

export function stopQuizTimer() {
  if (state.quizTick) {
    clearInterval(state.quizTick);
    state.quizTick = null;
  }
}

function startQuizTimer(context) {
  stopQuizTimer();

  const update = () => {
    const element = document.querySelector("[data-quiz-countdown]");
    if (!element) return;
    const expiresAt = Date.parse(element.getAttribute("data-expires-at") || "");
    if (!Number.isFinite(expiresAt)) return;
    const sessionId = element.getAttribute("data-quiz-session") || "";
    const now = Date.now() + (Number(state.quizServerOffset) || 0);
    const seconds = Math.max(0, Math.floor((expiresAt - now) / 1000));
    const text = element.querySelector("[data-quiz-countdown-text]");
    if (text) text.textContent = formatClock(seconds);
    element.classList.toggle("is-urgent", seconds > 0 && seconds <= 60);
    if (seconds > 0 && expiryHandledFor === sessionId) expiryHandledFor = "";
    if (seconds === 0 && sessionId && expiryHandledFor !== sessionId) {
      expiryHandledFor = sessionId;
      loadQuizState(context, true);
    }
  };

  update();
  state.quizTick = setInterval(update, 1000);
}

async function loadQuizState(context, force) {
  if (!force && state.quizProfile && state.quizLoadedFor === (state.user && state.user.id)) {
    return;
  }
  if (state.quizLoading) return;
  const hadActiveSession = Boolean(state.quizSession && state.quizSession.status === "active");
  state.quizLoading = true;
  state.quizError = "";
  if (context && typeof context.rerender === "function") context.rerender();
  try {
    const result = await rpc("app_quiz_state");
    applyQuizState(result);
    state.quizError = "";
    if (hadActiveSession && !state.quizSession) {
      const latest = Array.isArray(state.quizRecent) && state.quizRecent.length ? state.quizRecent[0] : null;
      state.quizNotice = {
        tone: "warning",
        title: "Sesi kuis berakhir",
        message: latest
          ? "Waktu habis. Benar " +
            (Number(latest.correctCount) || 0) +
            " dari " +
            (Number(latest.answeredCount) || 0) +
            " soal terjawab. Poin didapat: " +
            (Number(latest.pointsAwarded) || 0) +
            "."
          : "Waktu sesi habis. Sesi sudah ditutup oleh server."
      };
    }
  } catch (error) {
    if (isSessionExpired(error && error.message)) handleError(error);
    state.quizError = (error && error.message) || "Gagal memuat kuis.";
    if (hadActiveSession) {
      state.quizNotice = {
        tone: "warning",
        title: "Koneksi bermasalah",
        message: "Sesi kuis belum bisa disegarkan. Periksa koneksi, lalu coba lagi atau akhiri sesi."
      };
    }
  } finally {
    state.quizLoading = false;
    if (context && typeof context.rerender === "function") context.rerender();
  }
}

function rerender(context) {
  if (context && typeof context.rerender === "function") context.rerender();
}

async function startQuiz(context, button) {
  if (state.quizAction) return;
  state.quizAction = "start";
  if (button) button.disabled = true;
  try {
    const result = await rpc("app_quiz_start");
    if (result && result.profile) state.quizProfile = result.profile;
    if (result && result.session) state.quizSession = result.session;
    if (result && result.serverNow) {
      state.quizServerOffset = new Date(result.serverNow).getTime() - Date.now();
    }
    state.quizNotice = null;
    toast(result && result.resumed ? "Sesi kuis dilanjutkan." : "Kuis dimulai. Semoga berhasil!", "success");
    rerender(context);
  } catch (error) {
    if (isSessionExpired(error && error.message)) handleError(error);
    else toast((error && error.message) || "Gagal memulai kuis.", "danger");
    if (button) button.disabled = false;
  } finally {
    state.quizAction = "";
  }
}

async function answerQuestion(questionId, option, context) {
  const session = state.quizSession;
  if (!session || session.status !== "active" || state.quizAnswering) return;
  state.quizAnswering = questionId;

  document
    .querySelectorAll('[data-quiz-question="' + questionId + '"]')
    .forEach((element) => {
      element.disabled = true;
    });

  try {
    const result = await rpc("app_quiz_answer", {
      p_session_id: session.id,
      p_question_id: questionId,
      p_option: option
    });

    if (result && result.profile) state.quizProfile = result.profile;
    if (result && result.duplicate) {
      toast("Soal ini sudah pernah dijawab.", "warning");
    } else if (result && result.expired) {
      toast("Waktu sesi habis.", "warning");
    } else if (result && result.is_correct) {
      const gain = Number(state.quizProfile && state.quizProfile.points_per_correct) || 10;
      toast("Jawaban benar. +" + gain + " poin!", "success");
    } else {
      toast("Kurang tepat. Jawaban benar: " + String((result && result.correct_option) || "-") + ".", "warning");
    }

    if (result && result.finished) {
      const finishedSession = result.session || {};
      state.quizNotice = {
        tone: result.expired ? "warning" : "success",
        title: result.expired ? "Waktu habis" : "Sesi kuis selesai",
        message:
          "Benar " +
          (Number(finishedSession.correctCount) || 0) +
          " dari " +
          (Number(finishedSession.totalQuestions) || (session.questions || []).length) +
          " soal. Poin didapat: " +
          (Number(finishedSession.pointsAwarded) || 0) +
          "."
      };
      state.quizSession = null;
      await loadQuizState(context, true);
    } else if (result && result.session) {
      state.quizSession = result.session;
      rerender(context);
    }
  } catch (error) {
    if (isSessionExpired(error && error.message)) handleError(error);
    else toast((error && error.message) || "Gagal mengirim jawaban.", "danger");
    rerender(context);
  } finally {
    state.quizAnswering = 0;
  }
}

async function finishQuiz(context, button) {
  const session = state.quizSession;
  if (!session || state.quizAction) return;
  const confirmed = await confirmDialog({
    title: "Akhiri sesi kuis?",
    message:
      "Sesi akan ditutup sekarang. Soal yang belum dijawab dianggap kosong dan poin hanya dihitung dari jawaban yang sudah masuk.",
    confirmLabel: "Akhiri sesi",
    cancelLabel: "Lanjut menjawab",
    tone: "warning",
    requireSecond: false
  });
  if (!confirmed) return;

  state.quizAction = "finish";
  if (button) button.disabled = true;
  try {
    const result = await rpc("app_quiz_finish", { p_session_id: session.id });
    const finishedSession = (result && result.session) || {};
    if (result && result.profile) state.quizProfile = result.profile;
    state.quizNotice = {
      tone: "success",
      title: "Sesi kuis selesai",
      message:
        "Benar " +
        (Number(finishedSession.correctCount) || 0) +
        " dari " +
        (Number(finishedSession.totalQuestions) || 0) +
        " soal. Poin didapat: " +
        (Number(finishedSession.pointsAwarded) || 0) +
        "."
    };
    state.quizSession = null;
    await loadQuizState(context, true);
  } catch (error) {
    if (isSessionExpired(error && error.message)) handleError(error);
    else toast((error && error.message) || "Gagal mengakhiri sesi.", "danger");
    if (button) button.disabled = false;
  } finally {
    state.quizAction = "";
  }
}

export function attachQuizEvents(context) {
  const ctx = context || {};

  if (!state.quizProfile && !state.quizError) {
    loadQuizState(ctx, false);
  } else if (state.quizProfile && state.quizLoadedFor !== (state.user && state.user.id)) {
    loadQuizState(ctx, true);
  }
  if (document.querySelector("[data-quiz-countdown]")) {
    startQuizTimer(ctx);
  }

  const start = document.querySelector("[data-quiz-start]");
  if (start) {
    start.addEventListener("click", () => startQuiz(ctx, start));
  }

  document.querySelectorAll("[data-quiz-retry]").forEach((button) => {
    button.addEventListener("click", () => loadQuizState(ctx, true));
  });

  document.querySelectorAll("[data-quiz-answer]").forEach((button) => {
    button.addEventListener("click", () => {
      const questionId = Number(button.getAttribute("data-quiz-question"));
      const option = button.getAttribute("data-quiz-option") || "";
      if (!questionId || !option) return;
      answerQuestion(questionId, option, ctx);
    });
  });

  const finish = document.querySelector("[data-quiz-finish]");
  if (finish) {
    finish.addEventListener("click", () => finishQuiz(ctx, finish));
  }
}
