import { esc } from "./dom.js";
import { initials } from "./format.js";

export const AVATAR_EMOJIS = [
  "😀",
  "😎",
  "🚀",
  "🌟",
  "🔥",
  "💡",
  "🌸",
  "🍀",
  "🐱",
  "🦊",
  "🐼",
  "🐨",
  "🦁",
  "🐧",
  "🎯",
  "🎨",
  "📚",
  "🎧",
  "☕",
  "🧠",
  "💪",
  "🏆",
  "🌈",
  "⚡",
  "🛸",
  "🌻",
  "🦋",
  "🧩"
];

export const AVATAR_COLORS = [
  "#ec4899",
  "#8b5cf6",
  "#6366f1",
  "#3b82f6",
  "#06b6d4",
  "#10b981",
  "#84cc16",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#64748b",
  "#0f172a"
];

export function avatarEmoji(user) {
  return String((user && user.avatar_emoji) || "").trim().slice(0, 8);
}

export function avatarColor(user) {
  const color = String((user && user.avatar_color) || "");
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#ec4899";
}

export function renderAvatar(user, className) {
  const classes = "avatar " + (className || "");
  const color = esc(avatarColor(user));
  const emoji = avatarEmoji(user);
  if (emoji) {
    return (
      '<span class="' +
      esc(classes.trim()) +
      ' avatar-emoji" style="background:' +
      color +
      '" aria-hidden="true">' +
      esc(emoji) +
      "</span>"
    );
  }
  return (
    '<span class="' +
    esc(classes.trim()) +
    '" style="background:' +
    color +
    '" aria-hidden="true">' +
    esc(initials(user && user.name)) +
    "</span>"
  );
}
