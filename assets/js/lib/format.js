import { state } from "../core/store.js";

export function getTodayDate() {
  const timeZone = (state.settings && state.settings.timezone) || "Asia/Jakarta";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  } catch (error) {
    return new Date().toISOString().slice(0, 10);
  }
}

export function formatDateTime(value) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: (state.settings && state.settings.timezone) || "Asia/Jakarta",
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch (error) {
    return String(value).replace("T", " ").slice(0, 19);
  }
}

export function shortTime(value) {
  if (!value) return "-";
  return String(value).slice(0, 5);
}

export function isActiveUser(user) {
  if (!user) return false;
  const value = user.active;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const text = String(value).trim().toLowerCase();
  return text !== "false" && text !== "0" && text !== "tidak";
}

export function statusBadge(status) {
  const late = String(status) === "late";
  return (
    '<span class="badge ' +
    (late ? "bg-warning text-dark" : "bg-success") +
    ' rounded-pill">' +
    (late ? "Telat" : "Tepat waktu") +
    "</span>"
  );
}
