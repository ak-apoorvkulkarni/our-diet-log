/**
 * Meal CRUD and queries (operates on in-memory state; caller persists).
 */
import { newMealId } from "./models.js";
import { categoryFromLocalTime } from "./meal-category.js";

function normalizeCategory(c) {
  if (
    c === "breakfast" ||
    c === "lunch" ||
    c === "afternoon_snacks" ||
    c === "dinner" ||
    c === "evening_snacks" ||
    c === "random"
  )
    return c;
  return null;
}

export function addMeal(state, meal) {
  const id = newMealId();
  const dtIso = meal.datetime || new Date().toISOString();
  const row = {
    id,
    userId: meal.userId,
    datetime: dtIso,
    title: (meal.title || "").trim() || "Meal",
    notes: (meal.notes || "").trim(),
    calories: meal.calories != null && meal.calories !== "" ? Number(meal.calories) : null,
    health: meal.health ?? null,
    imageData: meal.imageData || null,
    category:
      normalizeCategory(meal.category) ??
      categoryFromLocalTime(new Date(dtIso)),
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
    category:
      patch.category !== undefined
        ? normalizeCategory(patch.category) ??
          categoryFromLocalTime(new Date(patch.datetime || cur.datetime))
        : cur.category ?? categoryFromLocalTime(new Date(cur.datetime)),
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

/**
 * Search + filters for All meals (query matches title/notes; dates are local calendar).
 */
export function filterMeals(meals, opts) {
  if (!opts) return [...meals];
  let list = [...meals];
  const q = opts.query && String(opts.query).trim().toLowerCase();
  if (q) {
    list = list.filter(
      (m) =>
        (m.title || "").toLowerCase().includes(q) ||
        (m.notes || "").toLowerCase().includes(q)
    );
  }
  const uid = opts.userId;
  if (uid && uid !== "all") {
    list = list.filter((m) => m.userId === uid);
  }
  const cat = opts.category;
  if (cat && cat !== "all") {
    list = list.filter((m) => (m.category || "") === cat);
  }
  if (opts.from) {
    const t = new Date(String(opts.from) + "T00:00:00").getTime();
    list = list.filter((m) => new Date(m.datetime).getTime() >= t);
  }
  if (opts.to) {
    const t = new Date(String(opts.to) + "T23:59:59.999").getTime();
    list = list.filter((m) => new Date(m.datetime).getTime() <= t);
  }
  return list;
}
