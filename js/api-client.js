/**
 * Authenticated fetch — session in localStorage (works when cookies fail on tunnels).
 */

const SESSION_KEY = "ahar_session_token";

function canUseStorage() {
  try {
    const k = "__ahar_storage_test__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function setSessionToken(sessionId) {
  try {
    if (sessionId) localStorage.setItem(SESSION_KEY, String(sessionId));
    else localStorage.removeItem(SESSION_KEY);
  } catch (e) {
    console.warn("Could not store session token:", e);
    throw new Error("Browser storage is blocked. Allow storage for this site and try again.");
  }
}

export function getSessionToken() {
  try {
    return localStorage.getItem(SESSION_KEY) || "";
  } catch {
    return "";
  }
}

export function storageAvailable() {
  return canUseStorage();
}

export function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getSessionToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, {
    ...options,
    headers,
    credentials: "same-origin",
  });
}
