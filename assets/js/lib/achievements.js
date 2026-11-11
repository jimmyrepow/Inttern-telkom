import { esc } from "./dom.js";
import { getTodayDate } from "./format.js";

const BADGES = [
  {
    id: "first",
    title: "Langkah Pertama",
    description: "Catat absensi pertamamu.",
    icon: "bi-flag",
    target: 1,
    value: (stats) => stats.total
  },
  {
    id: "punctual",
    title: "Tepat Waktu 5x",
    description: "Kumpulkan 5 absensi tepat waktu.",
    icon: "bi-alarm",
    target: 5,
    value: (stats) => stats.onTime
  },
  {
    id: "ten-days",
    title: "Rajin 10 Hari",
    description: "Hadir pada 10 hari berbeda.",
    icon: "bi-calendar-check",
    target: 10,
    value: (stats) => stats.total
  },
  {
    id: "discipline",
    title: "Bulan Disiplin",
    description: "100% tepat waktu bulan ini (min. 5 hari).",
    icon: "bi-award",
    target: 5,
    value: (stats) => (stats.monthOnTime === stats.monthTotal ? stats.monthTotal : 0),
    unlocked: (stats) => stats.monthTotal >= 5 && stats.monthLate === 0
  },
  {
    id: "streak",
    title: "Streak 3 Hari",
    description: "3 absensi tepat waktu berturut-turut.",
    icon: "bi-fire",
    target: 3,
    value: (stats) => stats.maxStreak
  }
];

export function summarizeAttendance(rows, month) {
  const attended = (Array.isArray(rows) ? rows : []).filter((row) => Boolean(row.check_in));
  const monthKey = month || getTodayDate().slice(0, 7);
  const monthRows = attended.filter((row) => String(row.date).slice(0, 7) === monthKey);
  const sorted = attended
    .slice()
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));

  let currentStreak = 0;
  let maxStreak = 0;
  sorted.forEach((row) => {
    if (String(row.status) !== "late") {
      currentStreak += 1;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  });

  return {
    total: attended.length,
    onTime: attended.filter((row) => String(row.status) !== "late").length,
    late: attended.filter((row) => String(row.status) === "late").length,
    monthTotal: monthRows.length,
    monthOnTime: monthRows.filter((row) => String(row.status) !== "late").length,
    monthLate: monthRows.filter((row) => String(row.status) === "late").length,
    maxStreak,
    currentStreak
  };
}

export function computeBadges(rows, month) {
  const stats = summarizeAttendance(rows, month);
  return BADGES.map((badge) => {
    const current = Math.max(0, Number(badge.value(stats)) || 0);
    const unlocked = badge.unlocked
      ? Boolean(badge.unlocked(stats))
      : current >= badge.target;
    return {
      id: badge.id,
      title: badge.title,
      description: badge.description,
      icon: badge.icon,
      target: badge.target,
      current: Math.min(current, badge.target),
      progress: Math.min(100, Math.round((current / badge.target) * 100)),
      unlocked
    };
  });
}

export function renderAchievementsCard(rows, month) {
  const stats = summarizeAttendance(rows, month);
  const badges = computeBadges(rows, month);
  const unlockedCount = badges.filter((badge) => badge.unlocked).length;

  return `
    <div class="card rounded-4 border-0 shadow-sm mt-3">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div>
            <h2 class="h5 fw-bold mb-1"><i class="bi bi-trophy me-2 text-warning"></i>Pencapaian saya</h2>
            <div class="small text-secondary">${unlockedCount} dari ${badges.length} lencana terbuka. Rajin absen untuk membuka sisanya.</div>
          </div>
          <span class="badge badge-soft rounded-pill px-3 py-2"><i class="bi bi-fire me-1"></i>Streak ${stats.currentStreak} hari</span>
        </div>
        <div class="achievement-grid">
          ${badges
            .map(
              (badge) => `
            <div class="achievement ${badge.unlocked ? "is-unlocked" : "is-locked"}">
              <div class="achievement-icon"><i class="bi ${badge.icon}"></i></div>
              <div class="min-w-0">
                <div class="achievement-title">${esc(badge.title)}</div>
                <div class="achievement-desc">${esc(badge.description)}</div>
                <div class="progress achievement-progress" role="progressbar" aria-valuenow="${badge.progress}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(badge.title)}">
                  <div class="progress-bar" style="width:${badge.progress}%"></div>
                </div>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}
