/**
 * Server login / register (cookie session).
 */

async function parseError(res) {
  try {
    const data = await res.json();
    return data?.detail || data?.message || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function login(username, password, rememberMe = true) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, remember_me: rememberMe }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.user;
}

export async function register(username, password, displayName = "", rememberMe = true) {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    credentials: "same-origin",
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
  return data.user;
}

export async function logout() {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
  });
}

export async function getCurrentUser() {
  const res = await fetch("/api/auth/me", { credentials: "same-origin" });
  if (res.status === 401) return null;
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
