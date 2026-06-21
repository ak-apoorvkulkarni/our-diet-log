/**
 * Authenticated fetch — sends session cookie and Bearer token (tunnel-safe fallback).
 */

const SESSION_KEY = "ahar_session_token";

export function setSessionToken(sessionId) {
  try {
    if (sessionId) sessionStorage.setItem(SESSION_KEY, String(sessionId));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch (e) {
    console.warn("Could not store session token:", e);
  }
}

export function getSessionToken() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || "";
  } catch {
    return "";
  }
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
