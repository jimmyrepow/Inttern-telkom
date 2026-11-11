const STORAGE_KEY = "telkom-absensi-theme";

export function currentTheme() {
  return document.documentElement.getAttribute("data-bs-theme") === "dark"
    ? "dark"
    : "light";
}

export function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-bs-theme", next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch (error) {}
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", next === "dark" ? "#0b1220" : "#ec4899");
  document.dispatchEvent(new CustomEvent("theme:changed", { detail: { theme: next } }));
  return next;
}

export function initTheme() {
  let saved = "";
  try {
    saved = localStorage.getItem(STORAGE_KEY) || "";
  } catch (error) {}
  const prefersDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return applyTheme(saved || (prefersDark ? "dark" : "light"));
}

export function toggleTheme() {
  return applyTheme(currentTheme() === "dark" ? "light" : "dark");
}
