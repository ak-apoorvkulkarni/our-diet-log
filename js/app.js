/**
 * App shell: navigation, state, persistence, view wiring.
 */
import { ensureStateShape } from "./models.js";
import { saveEncrypted } from "./storage.js";
import { APP_VERSION } from "./version.js";
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
} from "./ui-dashboard.js";
import { bindSettings, fillSettingsForm } from "./ui-settings.js";

let appState = ensureStateShape(null);
let sessionPassword = "";
let weekCursor = weekCursorFromStorage();

function passwordRef() {
  return sessionPassword;
}

async function persist() {
  await saveEncrypted(sessionPassword, appState);
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

function renderMealsView() {
  const grid = document.getElementById("meals-grid");
  const filter = document.getElementById("filter-user")?.value || "all";
  renderMealGrid(grid, appState, {
    userFilter: filter,
    onEdit: (id) =>
      openEditModal(appState, id, passwordRef, persist, showToast, () => renderMealsView()),
  });
}

function renderDashboardView() {
  const mount = document.getElementById("dashboard-weekly-mount");
  if (mount) renderWeeklyDashboard(mount, appState, weekCursor);
}

function initMainApp() {
  const shell = document.getElementById("app-shell");
  if (!shell) {
    throw new Error("Missing #app-shell — index.html may be incomplete.");
  }
  shell.hidden = false;
  const fv = document.getElementById("footer-version");
  if (fv) {
    const local =
      location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "";
    fv.innerHTML = `Our Diet Log · <code>v${APP_VERSION}</code>${local ? " · running locally" : ""}`;
  }
  refreshUserSelects();
  fillSettingsForm(appState);
  initLogDefaults();
  bindLogForm(appState, passwordRef, persist, showToast);
  bindSettings(appState, passwordRef, persist, showToast, () => {
    sessionPassword = "";
    location.reload();
  });

  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-nav");
      setView(id);
      if (id === "meals") renderMealsView();
      if (id === "dashboard") renderDashboardView();
      if (id === "settings") fillSettingsForm(appState);
    });
  });

  document.getElementById("filter-user")?.addEventListener("change", renderMealsView);

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
}

function start() {
  initAuthScreen({
    onAuthed: (pwd, data) => {
      sessionPassword = pwd;
      appState = ensureStateShape(data);
      initMainApp();
    },
    showToast,
  });
}

start();
