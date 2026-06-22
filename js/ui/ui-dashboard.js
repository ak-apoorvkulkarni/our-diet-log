/**
 * Weekly overview — single-user dashboard.
 */
import {
  startOfWeekMonday,
  aggregateWeek,
  parseIsoWeek,
  wellnessScore,
} from "../weekly.js";

const SCOPE_KEY = "diet_dashboard_scope";

export function getDashboardScope() {
  return "u1";
}

export function setDashboardScope(_scope) {
  sessionStorage.setItem(SCOPE_KEY, "u1");
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function formatRange(from, to) {
  const a = from.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const b = to.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${a} – ${b}`;
}

function kpiCard(value, label, hint) {
  return `
    <div class="dash-kpi">
      <div class="dash-kpi__value">${value}</div>
      <div class="dash-kpi__label">${escapeHtml(label)}</div>
      ${hint ? `<div class="dash-kpi__hint">${escapeHtml(hint)}</div>` : ""}
    </div>`;
}

const WELLNESS_SCORE_HELP =
  "This number is for the selected week only. It uses meals you rated Healthy, Neutral, or Unhealthy — unrated meals are ignored. Each rated meal adds points (Healthy 100, Neutral 55, Unhealthy 20), and the score is the average, rounded to 0–100. If nothing was rated this week, you see a dash.";

function wellnessKpiCard(value) {
  const v = value != null ? escapeHtml(String(value)) : "—";
  return `
    <div class="dash-kpi dash-kpi--wellness">
      <details class="dash-kpi__info">
        <summary class="dash-kpi__info-btn" title="About wellness score" aria-label="About wellness score">
          <span class="dash-kpi__info-icon" aria-hidden="true">i</span>
        </summary>
        <p class="dash-kpi__info-popover">${escapeHtml(WELLNESS_SCORE_HELP)}</p>
      </details>
      <div class="dash-kpi__value">${v}</div>
      <div class="dash-kpi__label">Wellness score</div>
      <div class="dash-kpi__hint">0–100 from ratings</div>
    </div>`;
}

export function renderWeeklyDashboard(mount, state, weekCursor) {
  if (!mount) return;

  const u1 = state.users.find((x) => x.id === "u1");
  const personName = u1?.name || "You";

  const labelEl = document.getElementById("week-range-label");
  if (labelEl) {
    const agg = aggregateWeek(state.meals, weekCursor);
    labelEl.textContent = formatRange(agg.from, agg.to);
  }

  const agg = aggregateWeek(state.meals, weekCursor, "u1");
  const ws = wellnessScore(agg.health, agg.rated);

  mount.innerHTML = `
    <div class="dash-stack">
    <div class="dash-add-meal">
      <button type="button" class="btn btn--primary dash-add-meal__btn" data-nav="log" data-new-meal="true" aria-label="Add a new meal to your log">Add New Meal</button>
    </div>
    <div class="dash-hero dash-hero--solo">
      <p class="dash-hero__eyebrow">This week</p>
      <h3 class="dash-hero__title">${escapeHtml(personName)}</h3>
      <p class="dash-hero__sub">Your meals, calories, and ratings for the selected week.</p>
    </div>

    <div class="dash-kpi-grid dash-kpi-grid--solo">
      ${kpiCard(agg.totalMeals, "Meals logged", "this week")}
      ${kpiCard(agg.caloriesSum || "—", "Total kcal", "tracked")}
      ${kpiCard(agg.avgCalories ?? "—", "Avg kcal / meal", "where known")}
      ${wellnessKpiCard(ws)}
    </div>
    </div>
  `;
}

export function bindDashboardScope(_rerender) {}

export function bindWeekNav(getCursor, setCursor, rerender) {
  document.getElementById("week-prev")?.addEventListener("click", () => {
    const c = getCursor();
    const n = new Date(c);
    n.setDate(n.getDate() - 7);
    setCursor(startOfWeekMonday(n));
    rerender();
  });
  document.getElementById("week-next")?.addEventListener("click", () => {
    const c = getCursor();
    const n = new Date(c);
    n.setDate(n.getDate() + 7);
    setCursor(startOfWeekMonday(n));
    rerender();
  });
}

export function weekCursorFromStorage() {
  try {
    const raw = sessionStorage.getItem("diet_week_cursor");
    if (!raw) return startOfWeekMonday(new Date());
    const d = parseIsoWeek(raw);
    return d || startOfWeekMonday(new Date());
  } catch {
    return startOfWeekMonday(new Date());
  }
}

export function persistWeekCursor(d) {
  try {
    sessionStorage.setItem("diet_week_cursor", d.toISOString());
  } catch (e) {
    console.warn(e);
  }
}
