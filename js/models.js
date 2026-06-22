/**
 * Default app state shape and helpers.
 */

export const DEFAULT_USERS = () => [
  { id: "u1", name: "User 1" },
  { id: "u2", name: "User 2" },
];

function normalizeUsers(users) {
  const list = Array.isArray(users) ? users.map((u) => ({ ...u })) : [];
  let u1 = list.find((u) => u.id === "u1");
  let u2 = list.find((u) => u.id === "u2");
  if (!u1) u1 = { id: "u1", name: "User 1" };
  if (!u2) u2 = { id: "u2", name: "User 2" };
  return [u1, u2];
}

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
  state.users = normalizeUsers(state.users);
  if (!Array.isArray(state.meals)) state.meals = [];
  return state;
}

export function newMealId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `m_${crypto.randomUUID()}`;
    }
  } catch (e) {}
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}
