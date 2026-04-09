/**
 * Firebase config for GitHub Pages static hosting.
 *
 * Set in index.html before app.js loads:
 *   window.__DIET_FIREBASE_CONFIG__ = { apiKey, authDomain, projectId, ... };
 */
export function getFirebaseConfig() {
  if (typeof window === "undefined") return null;
  const cfg = window.__DIET_FIREBASE_CONFIG__;
  if (!cfg || typeof cfg !== "object") return null;
  return cfg;
}

export function isFirebaseConfigured() {
  const cfg = getFirebaseConfig();
  if (!cfg) return false;
  const pid = String(cfg.projectId || "").trim();
  const key = String(cfg.apiKey || "").trim();
  return pid.length > 2 && key.length > 10;
}

