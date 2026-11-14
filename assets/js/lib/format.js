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

export function isWeekendDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getDay();
  return day === 0 || day === 6;
}

export function isWorkdayDate(value) {
  return !isWeekendDate(value);
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

export function formatMonth(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})/);
  if (!match) return "-";
  const months = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember"
  ];
  const label = months[Number(match[2]) - 1] || match[2];
  return label + " " + match[1];
}

export function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export function isActiveUser(user) {
  if (!user) return false;
  const value = user.active;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const text = String(value).trim().toLowerCase();
  return text !== "false" && text !== "0" && text !== "tidak";
}

export function statusBadge(status, hasCheckIn) {
  if (hasCheckIn === false) {
    return '<span class="badge bg-secondary rounded-pill">Belum absen</span>';
  }
  const late = String(status) === "late";
  return (
    '<span class="badge ' +
    (late ? "bg-warning text-dark" : "bg-success") +
    ' rounded-pill">' +
    (late ? "Telat" : "Tepat waktu") +
    "</span>"
  );
}
