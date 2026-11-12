export const GARDEN_STAGES = [
  { min: 10, emoji: "🌳", label: "Rindang" },
  { min: 8, emoji: "🌻", label: "Subur" },
  { min: 6, emoji: "🌷", label: "Berbunga" },
  { min: 4, emoji: "🪴", label: "Muda" },
  { min: 3, emoji: "🌿", label: "Tunas" },
  { min: 1, emoji: "🌱", label: "Bibit" }
];

export function gardenStage(level) {
  const value = Math.max(1, Number(level) || 1);
  return GARDEN_STAGES.find((stage) => value >= stage.min) || GARDEN_STAGES[GARDEN_STAGES.length - 1];
}

export function gardenProgress(value, start, end) {
  const current = Math.max(0, Number(value) || 0);
  const from = Math.max(0, Number(start) || 0);
  const to = Math.max(from + 1, Number(end) || 0);
  return Math.max(0, Math.min(100, Math.round(((current - from) / (to - from)) * 100)));
}

export function formatDuration(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  if (value < 60) return value + " mnt";
  if (value < 1440) {
    const hours = value / 60;
    return (Number.isInteger(hours) ? hours : hours.toFixed(1)) + " jam";
  }
  const days = value / 1440;
  return (Number.isInteger(days) ? days : days.toFixed(1)) + " hari";
}

export function formatCountdown(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (days > 0) return days + "h " + hours + "j";
  if (hours > 0) return hours + "j " + minutes + "m";
  if (minutes > 0) return minutes + "m " + secs + "d";
  return secs + "d";
}

export function plotUnlockLevel(index) {
  const value = Number(index) || 0;
  if (value >= 5) return 10;
  if (value >= 4) return 6;
  if (value >= 3) return 3;
  return 1;
}
