/**
 * App shell: navigation, state, persistence, view wiring.
 */
import { ensureStateShape } from "./models.js";
import { saveEncrypted } from "./storage.js";
import { APP_VERSION, DEVELOPER_NAME, DEVELOPER_SITE } from "./version.js";
import { initAuthScreen } from "./ui-auth.js";
import {
  renderMealGrid,
  bindLogForm,
  openEditModal,
  initLogDefaults,
} from "./ui-meals.js";
import {
  renderWeeklyDashboard,
  bindWeekNav,
  bindDashboardScope,
  weekCursorFromStorage,
  persistWeekCursor,
  getDashboardScope,
} from "./ui-dashboard.js";
import { bindSettings, fillSettingsForm } from "./ui-settings.js";
import { renderDashboardInsights } from "./ui-insights.js";
import { bindReminderSettings, startReminderScheduler, isRemindersEnabled } from "./reminders.js";
import {
  mergeRemoteVault,
  pushVaultRow,
  deriveHouseholdRowId,
  isSupabaseConfigured,
  subscribeHouseholdVaultRealtime,
} from "./sync-remote.js";

let appState = ensureStateShape(null);
let sessionPassword = "";
let stopRealtime = null;
let weekCursor = weekCursorFromStorage();

function passwordRef() {
  return sessionPassword;
}

async function persist() {
  await saveEncrypted(sessionPassword, appState);
  if (isSupabaseConfigured() && sessionPassword) {
    try {
      const hid = await deriveHouseholdRowId(sessionPassword);
      await pushVaultRow(hid);
    } catch (e) {
      console.warn("Sync push failed:", e);
    }
  }
}

function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("is-visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("is-visible"), 3200);
}

function setView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("is-active"));
  document.querySelectorAll("[data-nav]").forEach((b) => b.setAttribute("aria-current", "false"));
  const view = document.getElementById(`view-${id}`);
  const nav = document.querySelector(`[data-nav="${id}"]`);
  if (view) view.classList.add("is-active");
  if (nav) nav.setAttribute("aria-current", "true");
}

function refreshUserSelects() {
  const opts = appState.users
    .map((u) => `<option value="${u.id}">${escapeAttr(u.name)}</option>`)
    .join("");
  ["meal-user", "edit-user", "filter-user"].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const v = sel.value;
    sel.innerHTML = id === "filter-user" ? `<option value="all">Both</option>${opts}` : opts;
    if ([...sel.options].some((o) => o.value === v)) sel.value = v;
  });
}

function escapeAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function buildMealFilters() {
  const search = document.getElementById("meals-search");
  if (!search) return null;
  return {
    query: document.getElementById("meals-search")?.value || "",
    userId: document.getElementById("filter-user")?.value || "all",
    category: document.getElementById("meals-filter-category")?.value || "all",
    from: document.getElementById("meals-date-from")?.value || "",
    to: document.getElementById("meals-date-to")?.value || "",
  };
}

function refreshMealsDashboardInsights() {
  renderMealsView();
  renderDashboardView();
}

function renderMealsView() {
  const grid = document.getElementById("meals-grid");
  const mealFilters = buildMealFilters();
  renderMealGrid(grid, appState, {
    mealFilters,
    onEdit: (id) =>
      openEditModal(appState, id, passwordRef, persist, showToast, () => refreshMealsDashboardInsights()),
  });
}

function renderDashboardView() {
  const mount = document.getElementById("dashboard-weekly-mount");
  if (mount) renderWeeklyDashboard(mount, appState, weekCursor);
  const insightsMount = document.getElementById("dashboard-insights-mount");
  if (insightsMount) {
    renderDashboardInsights(insightsMount, appState, weekCursor, showToast, getDashboardScope());
  }
}

function initMainApp() {
  const shell = document.getElementById("app-shell");
  if (!shell) {
    throw new Error("Missing #app-shell. index.html may be incomplete.");
  }
  shell.hidden = false;
  const fv = document.getElementById("footer-version");
  if (fv) {
    const local =
      location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "";
    let extra = "";
    if (isSupabaseConfigured()) {
      extra =
        ' · <span title="Saves go to the cloud; when you both have the app open, each other\'s changes show up within a few seconds">cloud sync + live updates</span>';
    }
    fv.innerHTML = `आहार Tracker · <code>v${APP_VERSION}</code> · <a href="${DEVELOPER_SITE}" target="_blank" rel="noopener noreferrer">${DEVELOPER_NAME}</a>${local ? " · running locally" : ""}${extra}`;
  }
  refreshUserSelects();
  fillSettingsForm(appState);
  initLogDefaults();
  bindLogForm(appState, passwordRef, persist, showToast);
  bindSettings(appState, passwordRef, persist, showToast, () => {
    sessionPassword = "";
    location.reload();
  });
  bindReminderSettings(showToast);
  if (isRemindersEnabled()) {
    startReminderScheduler(showToast);
  }

  function closeMobileSidebarIfNeeded() {
    if (!window.matchMedia("(max-width: 899px)").matches) return;
    const sidebar = document.getElementById("app-sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    const toggle = document.getElementById("sidebar-toggle");
    sidebar?.classList.remove("is-open");
    if (backdrop) {
      backdrop.hidden = true;
      backdrop.setAttribute("aria-hidden", "true");
    }
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");
    }
    document.body.style.overflow = "";
  }

  function bindMobileSidebar() {
    const sidebar = document.getElementById("app-sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    const btn = document.getElementById("sidebar-toggle");
    if (!sidebar || !backdrop || !btn) return;

    const mq = window.matchMedia("(max-width: 899px)");

    function setSidebarOpen(open) {
      if (!mq.matches) {
        sidebar.classList.remove("is-open");
        backdrop.hidden = true;
        backdrop.setAttribute("aria-hidden", "true");
        btn.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
        return;
      }
      sidebar.classList.toggle("is-open", open);
      backdrop.hidden = !open;
      backdrop.setAttribute("aria-hidden", open ? "false" : "true");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      document.body.style.overflow = open ? "hidden" : "";
    }

    btn.addEventListener("click", () => {
      const open = !sidebar.classList.contains("is-open");
      setSidebarOpen(open);
    });

    backdrop.addEventListener("click", () => setSidebarOpen(false));

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && mq.matches) setSidebarOpen(false);
    });

    mq.addEventListener("change", () => {
      if (!mq.matches) setSidebarOpen(false);
    });
  }

  bindMobileSidebar();

  shell.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-nav]");
    if (!btn || !shell.contains(btn)) return;
    const id = btn.getAttribute("data-nav");
    if (!id) return;
    setView(id);
    if (id === "meals") renderMealsView();
    if (id === "dashboard") renderDashboardView();
    if (id === "settings") fillSettingsForm(appState);
    if (id === "log" && btn.getAttribute("data-new-meal") === "true") {
      window.dispatchEvent(new CustomEvent("diet-open-new-meal"));
    }
    closeMobileSidebarIfNeeded();
  });

  document.getElementById("filter-user")?.addEventListener("change", renderMealsView);
  ["meals-search", "meals-filter-category", "meals-date-from", "meals-date-to"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", renderMealsView);
    document.getElementById(id)?.addEventListener("change", renderMealsView);
  });

  window.addEventListener("diet-insights-rerender", () => renderDashboardView());

  bindWeekNav(
    () => weekCursor,
    (d) => {
      weekCursor = d;
      persistWeekCursor(d);
    },
    () => renderDashboardView()
  );

  bindDashboardScope(() => renderDashboardView());

  window.addEventListener("diet-users-updated", () => {
    refreshUserSelects();
    renderMealsView();
    renderDashboardView();
  });

  setView("dashboard");
  renderDashboardView();
  renderMealsView();

  document.getElementById("modal-edit")?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.getElementById("modal-edit-close")?.click();
  });

  void startRealtimeSubscription();
}

async function startRealtimeSubscription() {
  if (!isSupabaseConfigured() || !sessionPassword) return;
  try {
    if (stopRealtime) {
      stopRealtime();
      stopRealtime = null;
    }
    const hid = await deriveHouseholdRowId(sessionPassword);
    stopRealtime = await subscribeHouseholdVaultRealtime(hid, sessionPassword, {
      getState: () => appState,
      onMerged: async (merged) => {
        appState = ensureStateShape(merged);
        await persist();
        refreshUserSelects();
        renderDashboardView();
        renderMealsView();
        showToast("Partner updated. Progress refreshed.");
      },
    });
  } catch (e) {
    console.warn("Realtime subscription failed:", e);
  }
}

function start() {
  initAuthScreen({
    onAuthed: async (pwd, data) => {
      sessionPassword = pwd;
      let next = ensureStateShape(data);
      if (isSupabaseConfigured()) {
        try {
          next = await mergeRemoteVault(pwd, next);
          await saveEncrypted(pwd, next);
          const hid = await deriveHouseholdRowId(pwd);
          void pushVaultRow(hid).catch((e) => console.warn("Background sync push:", e));
        } catch (e) {
          console.warn(e);
          showToast("Cloud sync issue. Continuing with data on this device.");
        }
      }
      appState = next;
      initMainApp();
    },
    showToast,
  });
  if (typeof window !== "undefined") {
    window.__DIET_AUTH_READY__ = true;
  }
}

try {
  start();
} catch (err) {
  console.error(err);
  if (typeof window !== "undefined" && typeof window.__dietReportLoadFailure === "function") {
    window.__dietReportLoadFailure(
      "Could not start the app: " + (err && err.message ? err.message : String(err))
    );
  }
}
