/**
 * Default app state shape and helpers.
 */

export const DEFAULT_USERS = () => [
  { id: "u1", name: "Apoorv" },
  { id: "u2", name: "Aditi" },
];

export function createEmptyState() {
  return {
    version: 1,
    users: DEFAULT_USERS(),
    meals: [],
  };
}

export function ensureStateShape(raw) {
  if (!raw || typeof raw !== "object") return createEmptyState();
  const state = { ...createEmptyState(), ...raw };
  if (!Array.isArray(state.users) || state.users.length === 0) state.users = DEFAULT_USERS();
  if (!Array.isArray(state.meals)) state.meals = [];
  return state;
}

/** Merge two decrypted states (e.g. two phones). Meals by id: newer datetime wins. */
export function mergeAppState(local, remote) {
  const a = ensureStateShape(local);
  const b = ensureStateShape(remote);
  const byId = new Map();
  for (const m of b.meals) {
    if (m?.id) byId.set(m.id, m);
  }
  for (const m of a.meals) {
    if (!m?.id) continue;
    const r = byId.get(m.id);
    if (!r) {
      byId.set(m.id, m);
      continue;
    }
    const t = new Date(m.datetime || 0).getTime();
    const tr = new Date(r.datetime || 0).getTime();
    byId.set(m.id, t >= tr ? m : r);
  }
  const users = a.users.map((u, i) => {
    const o = b.users[i];
    if (!o) return u;
    const name = (u.name && String(u.name).trim()) || (o.name && String(o.name).trim()) || u.name;
    return { ...u, name };
  });
  return {
    ...a,
    version: Math.max(a.version || 1, b.version || 1),
    users,
    meals: [...byId.values()].sort((x, y) => new Date(y.datetime) - new Date(x.datetime)),
  };
}

export function newMealId() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
