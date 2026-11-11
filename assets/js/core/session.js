const TOKEN_KEY = "telkom_akses_token";

export function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch (error) {
    return "";
  }
}

export function saveToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (error) {}
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (error) {}
}
