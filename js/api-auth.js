/**
 * Server login / register (cookie session + Bearer token fallback).
 */
import { apiFetch, setSessionToken } from "./api-client.js";

async function parseError(res) {
  try {
    const data = await res.json();
    return data?.detail || data?.message || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

function storeSessionFromResponse(data) {
  if (data?.session_id) setSessionToken(data.session_id);
}

export async function login(username, password, rememberMe = true) {
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, remember_me: rememberMe }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  storeSessionFromResponse(data);
  return data.user;
}

export async function register(username, password, displayName = "", rememberMe = true) {
  const res = await apiFetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      display_name: displayName,
      remember_me: rememberMe,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  storeSessionFromResponse(data);
  return data.user;
}

export async function logout() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } finally {
    setSessionToken("");
  }
}

export async function getCurrentUser() {
  const res = await apiFetch("/api/auth/me");
  if (res.status === 401) {
    setSessionToken("");
    return null;
  }
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

/** Map API user to session user shape used by app.js */
export function toSessionUser(apiUser) {
  if (!apiUser) return null;
  return {
    uid: apiUser.id,
    displayName: apiUser.display_name || apiUser.username,
    email: apiUser.username,
    username: apiUser.username,
  };
}
