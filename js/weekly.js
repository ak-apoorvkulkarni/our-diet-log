/**
 * Week boundaries (local timezone) and aggregates for dashboard + insights.
 */

export function startOfWeekMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function endOfWeekSunday(d) {
  const start = startOfWeekMonday(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function isoWeekLabel(weekStart) {
  const y = weekStart.getFullYear();
  const m = String(weekStart.getMonth() + 1).padStart(2, "0");
  const day = String(weekStart.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseIsoWeek(s) {
  const [y, mo, d] = s.split("-").map(Number);
  return startOfWeekMonday(new Date(y, mo - 1, d));
}

export function mealsInRange(meals, from, to) {
  return meals.filter((m) => {
    const t = new Date(m.datetime).getTime();
    return t >= from.getTime() && t <= to.getTime();
  });
}

/**
 * @param {string|null|undefined} userIdFilter - omit or null for household (all people).
 */
export function aggregateWeek(meals, weekStart, userIdFilter) {
  const from = startOfWeekMonday(weekStart);
  const to = endOfWeekSunday(weekStart);
  let list = mealsInRange(meals, from, to);
  if (userIdFilter != null && userIdFilter !== "") {
    list = list.filter((m) => m.userId === userIdFilter);
  }
  let caloriesSum = 0;
  let caloriesCount = 0;
  const health = { healthy: 0, okay: 0, unhealthy: 0, unrated: 0 };
  const byDay = [0, 0, 0, 0, 0, 0, 0];
  const calByDay = [0, 0, 0, 0, 0, 0, 0];

  for (const m of list) {
    const dt = new Date(m.datetime);
    const idx = (dt.getDay() + 6) % 7;
    byDay[idx] += 1;
    if (m.calories != null && !Number.isNaN(m.calories)) {
      caloriesSum += m.calories;
      caloriesCount += 1;
      calByDay[idx] += m.calories;
    }
    const h = m.health;
    if (h === "healthy") health.healthy += 1;
    else if (h === "okay") health.okay += 1;
    else if (h === "unhealthy") health.unhealthy += 1;
    else health.unrated += 1;
  }

  const rated = health.healthy + health.okay + health.unhealthy;
  const totalMeals = list.length;

  return {
    from,
    to,
    list,
    totalMeals,
    caloriesSum,
    caloriesCount,
    avgCalories: caloriesCount ? Math.round(caloriesSum / caloriesCount) : null,
    health,
    rated,
    byDay,
    calByDay,
    dayLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  };
}

/** 0–100 blend from rated meals (healthy 100, okay 55, unhealthy 20). */
export function wellnessScore(health, rated) {
  if (rated <= 0) return null;
  const raw = health.healthy * 100 + health.okay * 55 + health.unhealthy * 20;
  return Math.round(raw / rated);
}

export function buildInsights(agg, opts = {}) {
  const label = opts.personLabel || "Household";
  const tips = [];
  const { health, totalMeals, rated, avgCalories, caloriesSum } = agg;
  if (totalMeals === 0) {
    tips.push(
      `No meals logged for ${label} this week — add a few entries to see patterns.`
    );
    return tips;
  }
  const unrated = health.unrated;
  if (unrated > 0) {
    tips.push(
      `${unrated} meal${unrated > 1 ? "s" : ""} still unrated — add healthy / neutral / unhealthy to sharpen your overview.`
    );
  }
  if (rated > 0) {
    const badRatio = health.unhealthy / rated;
    const goodRatio = health.healthy / rated;
    if (badRatio >= 0.4) {
      tips.push(
        "A large share of meals are marked unhealthy — try swapping one processed meal for whole foods or home-cooked options."
      );
    }
    if (goodRatio >= 0.5) {
      tips.push("Strong week for healthy-tagged meals — keep the momentum with variety (protein + fiber + color).");
    }
  }
  if (avgCalories != null && avgCalories > 800) {
    tips.push(
      "Average calories per logged meal is high — check portion sizes or add more vegetable-heavy plates if that fits your goals."
    );
  }
  if (caloriesSum > 0 && caloriesSum < 4000 && totalMeals >= 5) {
    tips.push("If calorie totals look low, you may be missing snacks — completeness helps weekly accuracy.");
  }
  if (tips.length === 0) {
    tips.push("Balanced mix this week — tweak one habit next week (e.g. one extra home-cooked dinner) and compare.");
  }
  return tips;
}
