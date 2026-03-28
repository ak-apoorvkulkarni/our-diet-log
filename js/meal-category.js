/**
 * Meal category labels + time-based default.
 * Uses the device local clock for the chosen date+time.
 */

export const MEAL_CATEGORY_LABELS = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  afternoon_snacks: "Afternoon snacks",
  dinner: "Dinner",
  evening_snacks: "Evening snacks",
  random: "Random meal",
};

/** @param {string} id */
export function labelForMealCategory(id) {
  return MEAL_CATEGORY_LABELS[id] ?? MEAL_CATEGORY_LABELS.random;
}

/**
 * Pick category from local hours/minutes (same day).
 * Breakfast ~4–10:59, Lunch ~11–13:59, Afternoon snacks ~14–16:59, Dinner ~17–20:59,
 * Evening snacks ~21–22:59, else Random (late night / very early).
 * @param {Date} d
 */
export function categoryFromLocalTime(d) {
  const minutes = d.getHours() * 60 + d.getMinutes();
  if (minutes >= 4 * 60 && minutes < 11 * 60) return "breakfast";
  if (minutes >= 11 * 60 && minutes < 14 * 60) return "lunch";
  if (minutes >= 14 * 60 && minutes < 17 * 60) return "afternoon_snacks";
  if (minutes >= 17 * 60 && minutes < 21 * 60) return "dinner";
  if (minutes >= 21 * 60 && minutes < 23 * 60) return "evening_snacks";
  return "random";
}

/**
 * @param {string} [dateStr] YYYY-MM-DD
 * @param {string} [timeStr] HH:MM
 */
export function categoryFromDateAndTimeInputs(dateStr, timeStr) {
  if (!dateStr || !timeStr) return categoryFromLocalTime(new Date());
  const d = new Date(`${dateStr}T${timeStr}`);
  if (Number.isNaN(d.getTime())) return "random";
  return categoryFromLocalTime(d);
}

const VALID_MEAL_CATEGORIES = new Set([
  "breakfast",
  "lunch",
  "afternoon_snacks",
  "dinner",
  "evening_snacks",
  "random",
]);

/**
 * Ensure a value matches a real <select> option; otherwise derive from date+time.
 */
export function coerceMealCategorySelect(value, dateStr, timeStr) {
  if (value && VALID_MEAL_CATEGORIES.has(value)) return value;
  return categoryFromDateAndTimeInputs(dateStr, timeStr);
}
