/**
 * Optional Supabase sync — set in index.html before app.js loads:
 *   window.__DIET_SUPABASE_URL__ = 'https://xxxx.supabase.co';
 *   window.__DIET_SUPABASE_ANON_KEY__ = 'eyJ...';
 */

export function getSupabaseUrl() {
  if (typeof window === "undefined") return "";
  return String(window.__DIET_SUPABASE_URL__ || "").trim();
}

export function getSupabaseAnonKey() {
  if (typeof window === "undefined") return "";
  return String(window.__DIET_SUPABASE_ANON_KEY__ || "").trim();
}

export function isSupabaseConfigured() {
  const u = getSupabaseUrl();
  const k = getSupabaseAnonKey();
  return u.startsWith("http") && k.length > 20;
}
