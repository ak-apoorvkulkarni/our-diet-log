/**
 * Read-only aggregates for Insights: trends, heatmap, week compare, summary.
 * Does not mutate app state.
 */
import {
  startOfWeekMonday,
  endOfWeekSunday,
  mealsInRange,
  aggregateWeek,
  wellnessScore,
} from "./weekly.js";
import { labelForMealCategory } from "./meal-category.js";

/**
 * Mon–Sun totals per person for the week containing `weekStart` (local, Mon–Sun).
 * Indices 0–6 are Mon–Sun; aligns with the week picker on the dashboard.
 */
export function weekDailyByPerson(meals, weekStart) {
  const from = startOfWeekMonday(weekStart);
  const to = endOfWeekSunday(weekStart);
  const list = mealsInRange(meals, from, to);
  const u1Cal = [0, 0, 0, 0, 0, 0, 0];
  const u2Cal = [0, 0, 0, 0, 0, 0, 0];
  const u1N = [0, 0, 0, 0, 0, 0, 0];
  const u2N = [0, 0, 0, 0, 0, 0, 0];
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  for (const m of list) {
    const dt = new Date(m.datetime);
    const idx = (dt.getDay() + 6) % 7;
    const uid = m.userId === "u2" ? "u2" : "u1";
    if (uid === "u2") {
      u2N[idx] += 1;
      if (m.calories != null && !Number.isNaN(Number(m.calories))) {
        u2Cal[idx] += Number(m.calories);
      }
    } else {
      u1N[idx] += 1;
      if (m.calories != null && !Number.isNaN(Number(m.calories))) {
        u1Cal[idx] += Number(m.calories);
      }
    }
  }

  return { from, to, dayLabels, u1Cal, u2Cal, u1N, u2N };
}

/** Counts of rated meals in the selected Mon–Sun week (household). Unrated meals excluded from the pie. */
export function weekHealthRatingCounts(meals, weekStart) {
  const agg = aggregateWeek(meals, weekStart);
  return {
    healthy: agg.health.healthy,
    neutral: agg.health.okay,
    unhealthy: agg.health.unhealthy,
  };
}

export function dateKeyLocal(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Per-day calories + meal counts for u1 / u2 over the last `numDays` calendar days (local). */
export function dailyTrendSeries(meals, numDays) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (numDays - 1));
  start.setHours(0, 0, 0, 0);

  const keys = [];
  const labels = [];
  for (let i = 0; i < numDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    keys.push(dateKeyLocal(d));
    labels.push(
      d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    );
  }

  const byKey = new Map();
  for (const k of keys) {
    byKey.set(k, {
      u1: { cal: 0, n: 0 },
      u2: { cal: 0, n: 0 },
    });
  }

  const inRange = mealsInRange(meals, start, end);
  for (const m of inRange) {
    const k = dateKeyLocal(new Date(m.datetime));
    if (!byKey.has(k)) continue;
    const row = byKey.get(k);
    const uid = m.userId === "u2" ? "u2" : "u1";
    row[uid].n += 1;
    if (m.calories != null && !Number.isNaN(Number(m.calories))) {
      row[uid].cal += Number(m.calories);
    }
  }

  const u1Cal = keys.map((k) => byKey.get(k).u1.cal);
  const u2Cal = keys.map((k) => byKey.get(k).u2.cal);
  const u1N = keys.map((k) => byKey.get(k).u1.n);
  const u2N = keys.map((k) => byKey.get(k).u2.n);

  return { keys, labels, u1Cal, u2Cal, u1N, u2N };
}

/**
 * Heatmap: calendar grid. Each day: empty, unrated, or color by average rating.
 * Scores: healthy 100, okay 55, unhealthy 20 (average if multiple rated meals).
 * Bands: ≥77.5 healthy (green), ≥37.5 neutral (yellow), else unhealthy (red).
 */
export function heatmapSeries(meals, numWeeks) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const startMonday = startOfWeekMonday(end);
  startMonday.setDate(startMonday.getDate() - (numWeeks - 1) * 7);
  startMonday.setHours(0, 0, 0, 0);

  const days = [];
  const d0 = new Date(startMonday);
  while (d0 <= end) {
    const key = dateKeyLocal(d0);
    days.push({ key, date: new Date(d0) });
    d0.setDate(d0.getDate() + 1);
  }

  const byDay = new Map();
  for (const m of meals) {
    const t = new Date(m.datetime).getTime();
    if (t < startMonday.getTime() || t > end.getTime()) continue;
    const k = dateKeyLocal(new Date(m.datetime));
    if (!byDay.has(k)) {
      byDay.set(k, { meals: [], scores: [] });
    }
    const cell = byDay.get(k);
    cell.meals.push(m);
    if (m.health === "healthy") cell.scores.push(100);
    else if (m.health === "okay") cell.scores.push(55);
    else if (m.health === "unhealthy") cell.scores.push(20);
  }

  const cells = days.map(({ key, date }) => {
    const cell = byDay.get(key);
    if (!cell || cell.meals.length === 0) {
      return { key, date, kind: "empty", title: "No meals" };
    }
    if (cell.scores.length === 0) {
      return {
        key,
        date,
        kind: "unrated",
        title: `${cell.meals.length} meal(s) — add a health rating for color`,
      };
    }
    const avg = cell.scores.reduce((a, b) => a + b, 0) / cell.scores.length;
    let kind;
    if (avg >= 77.5) kind = "healthy";
    else if (avg >= 37.5) kind = "neutral";
    else kind = "unhealthy";
    const band =
      kind === "healthy" ? "Healthy" : kind === "neutral" ? "Neutral" : "Unhealthy";
    return {
      key,
      date,
      kind,
      title: `${date.toLocaleDateString()}: ${band} (~${Math.round(avg)} avg · ${cell.scores.length} rated meal(s))`,
    };
  });

  return { cells, startMonday, end, numWeeks };
}

export function compareWeekPair(meals, weekStart) {
  const thisWeek = aggregateWeek(meals, weekStart);
  const prevStart = new Date(weekStart);
  prevStart.setDate(prevStart.getDate() - 7);
  const prevWeek = aggregateWeek(meals, prevStart);
  return {
    thisWeek,
    prevWeek,
    prevLabel: `${prevStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} week`,
  };
}

/** Best calendar day in range by total household kcal; most common category label. */
export function weekSummaryExtras(agg) {
  const list = agg.list || [];
  if (list.length === 0) {
    return { bestDayLabel: "—", topCategory: "—", topCategoryCount: 0 };
  }

  const kcalByDayKey = new Map();
  const catCount = new Map();
  for (const m of list) {
    const k = dateKeyLocal(new Date(m.datetime));
    const cal = m.calories != null && !Number.isNaN(Number(m.calories)) ? Number(m.calories) : 0;
    kcalByDayKey.set(k, (kcalByDayKey.get(k) || 0) + cal);
    const c = m.category || "random";
    catCount.set(c, (catCount.get(c) || 0) + 1);
  }

  let bestKey = null;
  let bestVal = -1;
  for (const [k, v] of kcalByDayKey) {
    if (v > bestVal) {
      bestVal = v;
      bestKey = k;
    }
  }
  const bestDate = bestKey ? new Date(bestKey + "T12:00:00") : null;
  const bestDayLabel =
    bestDate && !Number.isNaN(bestDate.getTime())
      ? bestDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
      : "—";

  let topCat = "random";
  let topN = 0;
  for (const [c, n] of catCount) {
    if (n > topN) {
      topN = n;
      topCat = c;
    }
  }

  return {
    bestDayLabel,
    bestDayKcal: bestVal > 0 ? Math.round(bestVal) : null,
    topCategory: labelForMealCategory(topCat),
    topCategoryCount: topN,
  };
}

export { aggregateWeek, wellnessScore, startOfWeekMonday, endOfWeekSunday, mealsInRange };
