/**
 * Weekly overview: household + per-person dashboards, professional layout.
 */
import {
  startOfWeekMonday,
  aggregateWeek,
  buildInsights,
  parseIsoWeek,
  wellnessScore,
} from "./weekly.js";

const SCOPE_KEY = "diet_dashboard_scope";

export function getDashboardScope() {
  const v = sessionStorage.getItem(SCOPE_KEY);
  if (v === "u1" || v === "u2" || v === "all") return v;
  return "all";
}

export function setDashboardScope(scope) {
  sessionStorage.setItem(SCOPE_KEY, scope);
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function donutGradient(h, rated) {
  if (rated === 0) {
    return "background: conic-gradient(var(--bg-muted) 0deg 360deg);";
  }
  const pHealthy = (h.healthy / rated) * 360;
  const pOkay = (h.okay / rated) * 360;
  const pUnhealthy = (h.unhealthy / rated) * 360;
  return `background: conic-gradient(
    var(--sage) 0deg ${pHealthy}deg,
    var(--amber) ${pHealthy}deg ${pHealthy + pOkay}deg,
    var(--coral) ${pHealthy + pOkay}deg ${pHealthy + pOkay + pUnhealthy}deg,
    var(--bg-muted) ${pHealthy + pOkay + pUnhealthy}deg 360deg
  );`;
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

function renderGroupedCalories(calA, calB, labels, nameA, nameB) {
  const max = Math.max(1, ...labels.map((_, i) => Math.max(calA[i] || 0, calB[i] || 0)));
  return labels
    .map((label, i) => {
      const a = calA[i] || 0;
      const b = calB[i] || 0;
      const ha = Math.round((a / max) * 100);
      const hb = Math.round((b / max) * 100);
      return `
      <div class="dash-bar-group">
        <span class="dash-bar-group__dow">${label}</span>
        <div class="dash-bar-group__tracks" role="group" aria-label="${label} calories">
          <div class="dash-bar-group__track dash-bar-group__track--a" title="${escapeHtml(nameA)}: ${a || "—"} kcal">
            <div class="dash-bar-group__fill" style="height:${ha}%"></div>
          </div>
          <div class="dash-bar-group__track dash-bar-group__track--b" title="${escapeHtml(nameB)}: ${b || "—"} kcal">
            <div class="dash-bar-group__fill" style="height:${hb}%"></div>
          </div>
        </div>
        <span class="dash-bar-group__pair">${a || "—"} <span class="dash-bar-group__sep">/</span> ${b || "—"}</span>
      </div>`;
    })
    .join("");
}

function renderSimpleCalories(calByDay, labels) {
  const max = Math.max(1, ...calByDay);
  return labels
    .map((label, i) => {
      const cals = calByDay[i] || 0;
      const pct = Math.round((cals / max) * 100);
      return `
      <div class="dash-hbar-row">
        <span class="dash-hbar-row__dow">${label}</span>
        <div class="dash-hbar-row__track"><div class="dash-hbar-row__fill" style="width:${pct}%"></div></div>
        <span class="dash-hbar-row__val">${cals || "—"}</span>
      </div>`;
    })
    .join("");
}

function syncScopeTabs(scope) {
  document.querySelectorAll("[data-dashboard-scope]").forEach((btn) => {
    const s = btn.getAttribute("data-dashboard-scope");
    const on = s === scope;
    btn.setAttribute("aria-selected", on ? "true" : "false");
    btn.classList.toggle("is-active", on);
  });
}

function updatePersonTabNames(state) {
  const u1 = state.users.find((x) => x.id === "u1");
  const u2 = state.users.find((x) => x.id === "u2");
  const n1 = document.querySelector('[data-scope-name="u1"]');
  const n2 = document.querySelector('[data-scope-name="u2"]');
  if (n1 && u1) n1.textContent = u1.name;
  if (n2 && u2) n2.textContent = u2.name;
}

export function renderWeeklyDashboard(mount, state, weekCursor) {
  if (!mount) return;
  const scope = getDashboardScope();
  syncScopeTabs(scope);
  updatePersonTabNames(state);

  const u1 = state.users.find((x) => x.id === "u1");
  const u2 = state.users.find((x) => x.id === "u2");
  const name1 = u1?.name || "Apoorv";
  const name2 = u2?.name || "Aditi";

  const labelEl = document.getElementById("week-range-label");
  if (labelEl) {
    const agg = aggregateWeek(state.meals, weekCursor);
    labelEl.textContent = formatRange(agg.from, agg.to);
  }

  if (scope === "all") {
    mount.innerHTML = renderHouseholdDashboard(state, weekCursor, name1, name2);
    return;
  }

  const uid = scope === "u1" ? "u1" : "u2";
  const personName = scope === "u1" ? name1 : name2;
  mount.innerHTML = renderIndividualDashboard(state, weekCursor, uid, personName);
}

function renderHouseholdDashboard(state, weekCursor, name1, name2) {
  const agg = aggregateWeek(state.meals, weekCursor);
  const a1 = aggregateWeek(state.meals, weekCursor, "u1");
  const a2 = aggregateWeek(state.meals, weekCursor, "u2");
  const ws = wellnessScore(agg.health, agg.rated);
  const tips = buildInsights(agg, { personLabel: "Household" });

  let compareNote = "";
  if (a1.totalMeals > 0 || a2.totalMeals > 0) {
    if (a1.totalMeals === a2.totalMeals) {
      compareNote = `<p class="dash-compare__note">Same number of meals logged (${a1.totalMeals}).</p>`;
    } else {
      const more = a1.totalMeals > a2.totalMeals ? name1 : name2;
      compareNote = `<p class="dash-compare__note">${escapeHtml(more)} logged more meals this week (${Math.max(
        a1.totalMeals,
        a2.totalMeals
      )} vs ${Math.min(a1.totalMeals, a2.totalMeals)}).</p>`;
    }
  }

  const grouped = renderGroupedCalories(a1.calByDay, a2.calByDay, agg.dayLabels, name1, name2);

  return `
    <div class="dash-hero">
      <p class="dash-hero__eyebrow">Weekly intelligence</p>
      <h3 class="dash-hero__title">Household overview</h3>
      <p class="dash-hero__sub">Combined nutrition and balance across both people.</p>
    </div>

    <div class="dash-kpi-grid">
      ${kpiCard(agg.totalMeals, "Meals logged", "household total")}
      ${kpiCard(agg.caloriesSum || "—", "Total kcal tracked", "with calories entered")}
      ${kpiCard(agg.avgCalories ?? "—", "Avg kcal / meal", "where known")}
      ${kpiCard(ws != null ? `${ws}` : "—", "Wellness score", "0–100 from ratings")}
    </div>

    <div class="dash-compare card">
      <h4 class="dash-section-title">People</h4>
      <p class="dash-section-lead">Side-by-side snapshot for the same week.</p>
      <div class="dash-compare__grid">
        <div class="dash-person-card">
          <div class="dash-person-card__name">${escapeHtml(name1)}</div>
          <div class="dash-person-card__stats">
            <span><strong>${a1.totalMeals}</strong> meals</span>
            <span><strong>${a1.caloriesSum || "—"}</strong> kcal</span>
            <span><strong>${wellnessScore(a1.health, a1.rated) ?? "—"}</strong> score</span>
          </div>
        </div>
        <div class="dash-person-card">
          <div class="dash-person-card__name">${escapeHtml(name2)}</div>
          <div class="dash-person-card__stats">
            <span><strong>${a2.totalMeals}</strong> meals</span>
            <span><strong>${a2.caloriesSum || "—"}</strong> kcal</span>
            <span><strong>${wellnessScore(a2.health, a2.rated) ?? "—"}</strong> score</span>
          </div>
        </div>
      </div>
      ${compareNote}
    </div>

    <div class="grid-2 dash-charts-row">
      <div class="card">
        <h4 class="dash-section-title">Calories by day</h4>
        <p class="dash-section-lead">Paired bars — each day shows both people (kcal where logged).</p>
        <div class="dash-bar-group__legend">
          <span><i class="dash-legend-dot dash-legend-dot--a"></i> ${escapeHtml(name1)}</span>
          <span><i class="dash-legend-dot dash-legend-dot--b"></i> ${escapeHtml(name2)}</span>
        </div>
        <div class="dash-grouped-wrap">${grouped}</div>
      </div>
      <div class="card">
        <h4 class="dash-section-title">Health mix (rated)</h4>
        <p class="dash-section-lead">Household totals for meals with a rating.</p>
        <div class="donut-wrap">
          <div class="donut donut--lg" style="${donutGradient(agg.health, agg.rated)}" role="img" aria-label="Health distribution"></div>
        </div>
        <div class="donut-legend">
          <span><i class="legend-healthy"></i> Healthy ${agg.health.healthy}</span>
          <span><i class="legend-okay"></i> Okay ${agg.health.okay}</span>
          <span><i class="legend-unhealthy"></i> Unhealthy ${agg.health.unhealthy}</span>
          <span><i class="legend-none"></i> Not rated ${agg.health.unrated}</span>
        </div>
      </div>
    </div>

    <div class="card dash-insights">
      <h4 class="dash-section-title">Recommendations</h4>
      <ul class="insights-list">
        ${tips.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderIndividualDashboard(state, weekCursor, userId, personName) {
  const agg = aggregateWeek(state.meals, weekCursor, userId);
  const ws = wellnessScore(agg.health, agg.rated);
  const tips = buildInsights(agg, { personLabel: personName });

  const simpleBars = renderSimpleCalories(agg.calByDay, agg.dayLabels);

  return `
    <div class="dash-hero dash-hero--solo">
      <p class="dash-hero__eyebrow">Individual view</p>
      <h3 class="dash-hero__title">${escapeHtml(personName)}</h3>
      <p class="dash-hero__sub">This week — your meals, calories, and ratings only.</p>
    </div>

    <div class="dash-kpi-grid dash-kpi-grid--solo">
      ${kpiCard(agg.totalMeals, "Meals logged", "this week")}
      ${kpiCard(agg.caloriesSum || "—", "Total kcal", "tracked")}
      ${kpiCard(agg.avgCalories ?? "—", "Avg kcal / meal", "where known")}
      ${kpiCard(ws != null ? `${ws}` : "—", "Wellness score", "0–100 from ratings")}
    </div>

    <div class="grid-2 dash-charts-row">
      <div class="card">
        <h4 class="dash-section-title">Calorie rhythm</h4>
        <p class="dash-section-lead">Daily kcal from your logged meals.</p>
        <div class="dash-grouped-wrap">${simpleBars}</div>
      </div>
      <div class="card">
        <h4 class="dash-section-title">Health mix</h4>
        <p class="dash-section-lead">How you rated meals this week.</p>
        <div class="donut-wrap">
          <div class="donut donut--lg" style="${donutGradient(agg.health, agg.rated)}" role="img" aria-label="Health distribution"></div>
        </div>
        <div class="donut-legend">
          <span><i class="legend-healthy"></i> Healthy ${agg.health.healthy}</span>
          <span><i class="legend-okay"></i> Okay ${agg.health.okay}</span>
          <span><i class="legend-unhealthy"></i> Unhealthy ${agg.health.unhealthy}</span>
          <span><i class="legend-none"></i> Not rated ${agg.health.unrated}</span>
        </div>
      </div>
    </div>

    <div class="card dash-insights">
      <h4 class="dash-section-title">Focus for ${escapeHtml(personName)}</h4>
      <ul class="insights-list">
        ${tips.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}
      </ul>
    </div>
  `;
}

export function bindDashboardScope(rerender) {
  document.querySelectorAll("[data-dashboard-scope]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-dashboard-scope");
      if (id === "all" || id === "u1" || id === "u2") {
        setDashboardScope(id);
        rerender();
      }
    });
  });
}

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
  const raw = sessionStorage.getItem("diet_week_cursor");
  if (raw) {
    try {
      return parseIsoWeek(raw);
    } catch {
      /* ignore */
    }
  }
  return startOfWeekMonday(new Date());
}

export function persistWeekCursor(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  sessionStorage.setItem("diet_week_cursor", `${y}-${m}-${day}`);
}
