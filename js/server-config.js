/**
 * Detect self-hosted server mode (FastAPI + SQLite on same origin).
 */

let _serverModeCache = null;

export async function detectServerMode() {
  if (_serverModeCache !== null) return _serverModeCache;
  if (window.__DIET_SERVER_MODE__ === true) {
    _serverModeCache = true;
    return true;
  }
  try {
    const res = await fetch("/api/health", { credentials: "same-origin" });
    if (!res.ok) {
      _serverModeCache = false;
      return false;
    }
    const data = await res.json();
    _serverModeCache = Boolean(data && data.ok);
  } catch {
    _serverModeCache = false;
  }
  return _serverModeCache;
}

export function isServerMode() {
  return _serverModeCache === true;
}
