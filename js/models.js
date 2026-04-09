/**
 * Default app state shape and helpers.
 */

export const DEFAULT_USERS = () => [
  { id: "u1", name: "You" },
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

export function newMealId() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
