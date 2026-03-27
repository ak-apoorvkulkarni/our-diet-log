/**
 * Meal CRUD and queries (operates on in-memory state; caller persists).
 */
import { newMealId } from "./models.js";

export function addMeal(state, meal) {
  const id = newMealId();
  const row = {
    id,
    userId: meal.userId,
    datetime: meal.datetime || new Date().toISOString(),
    title: (meal.title || "").trim() || "Meal",
    notes: (meal.notes || "").trim(),
    calories: meal.calories != null && meal.calories !== "" ? Number(meal.calories) : null,
    health: meal.health ?? null,
    imageData: meal.imageData || null,
  };
  state.meals = [row, ...state.meals];
  return row;
}

export function updateMeal(state, id, patch) {
  const i = state.meals.findIndex((m) => m.id === id);
  if (i === -1) return null;
  const cur = state.meals[i];
  const next = {
    ...cur,
    ...patch,
    title: patch.title != null ? String(patch.title).trim() || cur.title : cur.title,
    notes: patch.notes != null ? String(patch.notes).trim() : cur.notes,
    calories:
      patch.calories === "" || patch.calories === undefined
        ? cur.calories
        : patch.calories != null
          ? Number(patch.calories)
          : null,
    health: patch.health !== undefined ? patch.health : cur.health,
    imageData: patch.imageData !== undefined ? patch.imageData : cur.imageData,
    datetime: patch.datetime || cur.datetime,
  };
  state.meals[i] = next;
  return next;
}

export function deleteMeal(state, id) {
  const before = state.meals.length;
  state.meals = state.meals.filter((m) => m.id !== id);
  return state.meals.length < before;
}

export function mealsForUser(state, userId) {
  return state.meals.filter((m) => m.userId === userId);
}

export function sortMealsDesc(meals) {
  return [...meals].sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
}
