/**
 * Meal category (Breakfast / Lunch / Dinner / Random) + time-based default.
 * Uses the device local clock for the chosen date+time.
 */

export const MEAL_CATEGORY_LABELS = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  random: "Random meal",
};

/** @param {string} id */
export function labelForMealCategory(id) {
  return MEAL_CATEGORY_LABELS[id] ?? MEAL_CATEGORY_LABELS.random;
}

/**
 * Pick category from local hours/minutes (same day).
 * Breakfast ~4:00–10:59, Lunch ~11:00–15:59, Dinner ~16:00–22:59, else Random (snacks, late night).
 * @param {Date} d
 */
export function categoryFromLocalTime(d) {
  const minutes = d.getHours() * 60 + d.getMinutes();
  if (minutes >= 4 * 60 && minutes < 11 * 60) return "breakfast";
  if (minutes >= 11 * 60 && minutes < 16 * 60) return "lunch";
  if (minutes >= 16 * 60 && minutes < 23 * 60) return "dinner";
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
