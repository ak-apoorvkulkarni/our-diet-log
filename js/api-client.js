/**
 * Authenticated fetch — session in localStorage (works when cookies fail on tunnels).
 */

const SESSION_KEY = "ahar_session_token";
const DEFAULT_TIMEOUT_MS = 20000;

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

export function withTimeout(promise, ms, label) {
  const timeout = ms || DEFAULT_TIMEOUT_MS;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(label || `Request timed out after ${Math.round(timeout / 1000)}s`)),
        timeout
      );
    }),
  ]);
}

export function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getSessionToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { timeoutMs: _drop, ...fetchOpts } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    ...fetchOpts,
    headers,
    credentials: "same-origin",
    signal: controller.signal,
  })
    .catch((err) => {
      if (err && err.name === "AbortError") {
        throw new Error(`Request timed out: ${url}`);
      }
      throw err;
    })
    .finally(() => clearTimeout(timer));
}
