/**
 * Weekly overview: household + per-person dashboards, professional layout.
 */
import {
  startOfWeekMonday,
  aggregateWeek,
  parseIsoWeek,
  wellnessScore,
} from "../weekly.js";
import { isFirebaseConfigured } from "../firebase-config.js";

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

function hasDashboardPartner(state) {
  if (isFirebaseConfigured()) {
    return Boolean(
      typeof window !== "undefined" && window.__DIET_FIREBASE_SESSION__?.hasPartner
    );
  }
  return Boolean(state.users?.some((x) => x.id === "u2"));
}

export function renderWeeklyDashboard(mount, state, weekCursor) {
  if (!mount) return;
  const hasPartner = hasDashboardPartner(state);
  let scope = getDashboardScope();
  if (!hasPartner) scope = "u1";
  syncScopeTabs(scope);
  updatePersonTabNames(state);
  // Hide scope selector when solo.
  const scopeBar = document.querySelector(".dashboard-scope");
  if (scopeBar) scopeBar.hidden = !hasPartner;

  const u1 = state.users.find((x) => x.id === "u1");
  const u2 = state.users.find((x) => x.id === "u2");
  const name1 = u1?.name || "You";
  const name2 = u2?.name || "Partner";

  const labelEl = document.getElementById("week-range-label");
  if (labelEl) {
    const agg = aggregateWeek(state.meals, weekCursor);
    labelEl.textContent = formatRange(agg.from, agg.to);
  }

  if (hasPartner && scope === "all") {
    mount.innerHTML = renderHouseholdDashboard(state, weekCursor, name1, name2);
    return;
  }

  const uid = scope === "u2" && hasPartner ? "u2" : "u1";
  const personName = uid === "u2" ? name2 : name1;
  mount.innerHTML = renderIndividualDashboard(state, weekCursor, uid, personName, {
    hasPartner,
    name1,
    name2,
    scopeUserId: uid,
  });
}

function renderHouseholdDashboard(state, weekCursor, name1, name2) {
  const agg = aggregateWeek(state.meals, weekCursor);
  const a1 = aggregateWeek(state.meals, weekCursor, "u1");
  const a2 = aggregateWeek(state.meals, weekCursor, "u2");
  const ws = wellnessScore(agg.health, agg.rated);

  return `
    <div class="dash-stack">
    <div class="dash-add-meal">
      <button type="button" class="btn btn--primary dash-add-meal__btn" data-nav="log" data-new-meal="true" aria-label="Add a new meal to your log">Add New Meal</button>
      <button type="button" class="btn btn--secondary dash-add-meal__btn" data-invite-partner hidden>Invite partner</button>
    </div>

    <div class="dash-kpi-grid">
      ${kpiCard(agg.totalMeals, "Meals logged", "household total")}
      ${kpiCard(agg.caloriesSum || "—", "Total kcal tracked", "with calories entered")}
      ${kpiCard(agg.avgCalories ?? "—", "Avg kcal / meal", "where known")}
      ${wellnessKpiCard(ws)}
    </div>

    <div class="dash-compare card" role="region" aria-label="People">
      <div class="dash-people-table-wrap">
        <table class="dash-people-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col" class="dash-people-table__num">Meals</th>
              <th scope="col" class="dash-people-table__num">Calories</th>
              <th scope="col" class="dash-people-table__num">Score</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">${escapeHtml(name1)}</th>
              <td class="dash-people-table__num">${a1.totalMeals}</td>
              <td class="dash-people-table__num">${a1.caloriesSum != null ? a1.caloriesSum : "—"}</td>
              <td class="dash-people-table__num">${wellnessScore(a1.health, a1.rated) ?? "—"}</td>
            </tr>
            <tr>
              <th scope="row">${escapeHtml(name2)}</th>
              <td class="dash-people-table__num">${a2.totalMeals}</td>
              <td class="dash-people-table__num">${a2.caloriesSum != null ? a2.caloriesSum : "—"}</td>
              <td class="dash-people-table__num">${wellnessScore(a2.health, a2.rated) ?? "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    </div>
  `;
}

function renderIndividualDashboard(state, weekCursor, userId, personName, meta = {}) {
  const { hasPartner = false, name1 = "You", name2 = "Partner", scopeUserId = "u1" } = meta;
  const agg = aggregateWeek(state.meals, weekCursor, userId);
  const ws = wellnessScore(agg.health, agg.rated);

  const inviteHidden = hasPartner ? "hidden" : "";
  let sub =
    "This week — your meals, calories, and ratings only.";
  let partnerLine = "";
  if (hasPartner) {
    if (scopeUserId === "u1") {
      sub = "This week — your logged meals only.";
      partnerLine = `<p class="dash-hero__partner">Partner: ${escapeHtml(name2)}</p>`;
    } else {
      sub = "This week — their meals and ratings (read-only on their log).";
    }
  }

  return `
    <div class="dash-stack">
    <div class="dash-add-meal">
      <button type="button" class="btn btn--primary dash-add-meal__btn" data-nav="log" data-new-meal="true" aria-label="Add a new meal to your log">Add New Meal</button>
      <button type="button" class="btn btn--secondary dash-add-meal__btn" data-invite-partner ${inviteHidden}>Invite partner</button>
      <span class="dash-invite-link" data-invite-link style="display:none"></span>
    </div>
    <div class="dash-hero dash-hero--solo">
      <p class="dash-hero__eyebrow">${hasPartner ? "Individual view · shared household" : "Individual view"}</p>
      <h3 class="dash-hero__title">${escapeHtml(personName)}</h3>
      ${partnerLine}
      <p class="dash-hero__sub">${sub}</p>
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
