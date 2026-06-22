/**
 * App shell: navigation, state, persistence, view wiring.
 */
import { ensureStateShape, mergeStateInPlace } from "./models.js";
import { saveEncrypted } from "./storage.js";
import { APP_VERSION, DEVELOPER_NAME, DEVELOPER_SITE } from "./version.js";
import { initAuthScreen } from "./ui/ui-auth.js";
import { getCurrentUser, logout, toSessionUser } from "./api-auth.js";
import { withTimeout } from "./api-client.js";
import { detectServerMode, isServerMode } from "./server-config.js";
import {
  buildDefaultStateForUser,
  ensureUserProfile,
  hydrateMealImagesForState,
  loadUserState,
  ensureHouseholdExists,
  householdIdForUser,
  saveUserState,
  stripServerMealImagesForSave,
} from "./api-store.js";
import {
  renderMealGrid,
  bindLogForm,
  openEditModal,
  initLogDefaults,
} from "./ui/ui-meals.js";
import {
  renderWeeklyDashboard,
  bindWeekNav,
  bindDashboardScope,
  weekCursorFromStorage,
  persistWeekCursor,
  getDashboardScope,
} from "./ui/ui-dashboard.js";
import { bindSettings, fillSettingsForm } from "./ui/ui-settings.js";
import { renderDashboardInsights } from "./ui/ui-insights.js";
let appState = ensureStateShape(null);
let cloudMyState = ensureStateShape(null);
let sessionPassword = "";
let weekCursor = weekCursorFromStorage();
let cloudUser = null;
let cloudHouseholdId = "";
let cloudUserId = "u1";

function viewState() {
  if (isServerMode()) return cloudMyState || ensureStateShape(null);
  return appState;
}

function passwordRef() {
  return sessionPassword;
}

/** @returns {Promise<boolean>} true if data was written to disk / cloud */
async function persist() {
  const FIREBASE_SAVE_TIMEOUT_MS = 45000;
  if (isServerMode()) {
    if (!cloudUser || !cloudHouseholdId) {
      showToast("Not signed in. Refresh and sign in again.");
      return false;
    }
    try {
      await Promise.race([
        (async () => {
          await ensureUserProfile(cloudUser.uid, {
            householdId: cloudHouseholdId,
          });
          await saveUserState(
            cloudUser.uid,
            cloudHouseholdId,
            stripServerMealImagesForSave(cloudMyState)
          );
        })(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("SAVE_TIMEOUT")), FIREBASE_SAVE_TIMEOUT_MS);
        }),
      ]);
      return true;
    } catch (e) {
      console.warn("Server save failed:", e);
      const msg = e?.message === "SAVE_TIMEOUT" ? "Save timed out. Check your connection and try again." : null;
      showToast(
        msg || "Could not save to cloud. Check your connection and try again."
      );
      return false;
    }
  }

  try {
    await saveEncrypted(sessionPassword, appState);
    return true;
  } catch (e) {
    console.warn("Local save failed:", e);
    showToast(e?.message ? String(e.message) : "Could not save. Try again.");
    return false;
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

function userPickerLabel(u) {
  const name = String(u.name || "").trim();
  if (name) return name;
  return u.id === "u2" ? "User 2" : "User 1";
}

function refreshUserSelects() {
  const target = viewState();
  mergeStateInPlace(target, target);
  const users = (target.users || []).filter((u) => u.id === "u1" || u.id === "u2");
  const opts = users.map((u) => `<option value="${escapeAttr(u.id)}">${escapeHtml(userPickerLabel(u))}</option>`).join("");
  ["meal-user", "edit-user", "filter-user"].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const v = sel.value;
    sel.innerHTML = id === "filter-user" ? `<option value="all">Both</option>${opts}` : opts;
    if ([...sel.options].some((o) => o.value === v)) sel.value = v;
    else if (id !== "filter-user" && sel.options.length) sel.value = "u1";
  });
}

function escapeAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const s = viewState();
  renderMealGrid(grid, s, {
    mealFilters,
    canEditMeal: (m) => {
      if (!isServerMode()) return true;
      const ownerUid = String(m?.ownerUid || "");
      if (!ownerUid) return true;
      return ownerUid === String(cloudUser?.uid || "");
    },
    onEdit: (id) => {
      if (isServerMode()) {
        const meal = s.meals.find((m) => m.id === id);
        const ownerUid = String(meal?.ownerUid || "");
        if (ownerUid && ownerUid !== String(cloudUser?.uid || "")) {
          showToast("You can only edit your own meals.");
          return;
        }
      }
      openEditModal(viewState(), id, passwordRef, persist, showToast, () => refreshMealsDashboardInsights());
    },
  });
}

function renderDashboardView() {
  const mount = document.getElementById("dashboard-weekly-mount");
  const s = viewState();
  if (mount) renderWeeklyDashboard(mount, s, weekCursor);
  const insightsMount = document.getElementById("dashboard-insights-mount");
  if (insightsMount) {
    renderDashboardInsights(insightsMount, s, weekCursor, showToast, getDashboardScope());
  }
}

function revealAppShell() {
  const shell = document.getElementById("app-shell");
  if (!shell) return;
  shell.hidden = false;
  shell.removeAttribute("aria-hidden");
  shell.style.removeProperty("display");
  shell.style.removeProperty("pointer-events");
}

function forceHideBlockingLayers() {
  ["server-login-screen", "app-boot-screen", "marketing-landing", "landing-screen", "auth-screen"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("pointer-events", "none", "important");
  });
  const backdrop = document.getElementById("sidebar-backdrop");
  if (backdrop) {
    backdrop.hidden = true;
    backdrop.setAttribute("aria-hidden", "true");
  }
  document.body.style.overflow = "";
}

function hideLoginScreen() {
  forceHideBlockingLayers();
}

function showServerLoginError(msg) {
  const text = msg || "";
  const errEl = document.getElementById("server-login-error");
  if (errEl) errEl.textContent = text;
  if (location.pathname === "/app" || location.pathname.endsWith("/app")) {
    if (typeof window.__DIET_SET_BOOT_ERROR__ === "function") {
      window.__DIET_SET_BOOT_ERROR__(text);
    } else {
      const bootErr = document.getElementById("app-boot-error");
      if (bootErr) bootErr.textContent = text;
    }
    return;
  }
  const screen = document.getElementById("server-login-screen");
  if (screen) {
    screen.hidden = false;
    screen.removeAttribute("aria-hidden");
  }
  const shell = document.getElementById("app-shell");
  if (shell) shell.hidden = true;
}

let mainAppInitialized = false;

function signOutServer() {
  if (typeof window.__DIET_SERVER_LOGOUT__ === "function") {
    window.__DIET_SERVER_LOGOUT__();
    return;
  }
  void logout()
    .catch((e) => console.warn("Sign out failed:", e))
    .finally(() => location.reload());
}

function handleNavTo(id, btn) {
  if (!id) return;
  setView(id);
  if (id === "meals") renderMealsView();
  if (id === "dashboard") renderDashboardView();
  if (id === "settings") fillSettingsForm(viewState());
  if (id === "log" && btn?.getAttribute("data-new-meal") === "true") {
    window.dispatchEvent(new CustomEvent("diet-open-new-meal"));
  }
}

function initMainApp() {
  if (mainAppInitialized) return;
  const shell = document.getElementById("app-shell");
  if (!shell) {
    throw new Error("Missing #app-shell. index.html may be incomplete.");
  }

  let closeMobileSidebarIfNeeded = () => {};

  try {
    const fv = document.getElementById("footer-version");
    if (fv) {
      const local =
        location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "";
      fv.innerHTML = `आहार Tracker · <code>v${APP_VERSION}</code> · <a href="${DEVELOPER_SITE}" target="_blank" rel="noopener noreferrer">${DEVELOPER_NAME}</a>${local ? " · running locally" : ""}`;
    }
    refreshUserSelects();
    fillSettingsForm(viewState());
    initLogDefaults();
    bindSettings(() => viewState(), passwordRef, persist, showToast, () => {
      if (isServerMode()) {
        signOutServer();
        return;
      }
      sessionPassword = "";
      location.reload();
    });
    closeMobileSidebarIfNeeded = function () {
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
    };

    (function bindMobileSidebar() {
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
    })();

    bindLogForm(() => viewState(), passwordRef, persist, showToast, () => {
      setView("meals");
      renderMealsView();
      closeMobileSidebarIfNeeded();
    });

    document.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = btn.getAttribute("data-nav");
        if (!id) return;
        e.preventDefault();
        handleNavTo(id, btn);
        closeMobileSidebarIfNeeded();
      });
    });

    shell.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-nav]");
      if (!btn || !shell.contains(btn)) return;
      e.preventDefault();
      handleNavTo(btn.getAttribute("data-nav"), btn);
      closeMobileSidebarIfNeeded();
    });

    document.getElementById("filter-user")?.addEventListener("change", renderMealsView);
    ["meals-search", "meals-filter-category", "meals-date-from", "meals-date-to"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", renderMealsView);
      document.getElementById(id)?.addEventListener("change", renderMealsView);
    });

    const mealsFiltersPanel = document.getElementById("meals-filters-panel");
    const btnMealsFiltersToggle = document.getElementById("btn-meals-filters-toggle");
    btnMealsFiltersToggle?.addEventListener("click", () => {
      if (!mealsFiltersPanel) return;
      mealsFiltersPanel.hidden = !mealsFiltersPanel.hidden;
      btnMealsFiltersToggle.setAttribute("aria-expanded", (!mealsFiltersPanel.hidden).toString());
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

    forceHideBlockingLayers();
    revealAppShell();
    mainAppInitialized = true;
    window.__DIET_APP_READY__ = true;
  } catch (e) {
    mainAppInitialized = false;
    shell.hidden = true;
    throw e;
  }
}

function showBootOrLoginError(msg) {
  if (typeof window.__DIET_SET_BOOT_ERROR__ === "function") {
    window.__DIET_SET_BOOT_ERROR__(msg);
  } else {
    showServerLoginError(msg);
  }
}

async function syncServerDataInBackground(user) {
  const syncLine = document.getElementById("sync-status-line");
  try {
    cloudHouseholdId = householdIdForUser(user.uid);

    await withTimeout(ensureHouseholdExists(cloudHouseholdId, user.uid), 15000, "Household setup timed out");
    await withTimeout(
      ensureUserProfile(user.uid, {
        householdId: cloudHouseholdId,
      }),
      15000,
      "Profile setup timed out"
    );

    let myState = await withTimeout(loadUserState(user.uid), 15000, "Loading data timed out");
    const usersBefore = JSON.stringify(cloudMyState.users || []);
    if (!myState) {
      myState = buildDefaultStateForUser(user.displayName);
      await withTimeout(saveUserState(user.uid, cloudHouseholdId, myState), 15000, "Saving data timed out");
    }

    mergeStateInPlace(cloudMyState, myState);
    appState = cloudMyState;

    if (JSON.stringify(cloudMyState.users) !== usersBefore) {
      try {
        await withTimeout(saveUserState(user.uid, cloudHouseholdId, cloudMyState), 15000, "Saving data timed out");
      } catch (e) {
        console.warn("User list migration save skipped:", e);
      }
    }

    try {
      await hydrateMealImagesForState(user.uid, cloudMyState);
    } catch (e) {
      console.warn("Image hydrate skipped:", e);
    }

    window.__DIET_CLOUD_SESSION__ = {
      uid: user.uid,
      householdId: cloudHouseholdId,
      userId: cloudUserId,
    };

    if (syncLine) {
      syncLine.textContent = "Cloud sync: on — data stored on this server (SQLite).";
    }
    refreshUserSelects();
    fillSettingsForm(viewState());
    refreshMealsDashboardInsights();
  } catch (e) {
    console.warn("Background sync failed:", e);
    if (syncLine) {
      syncLine.textContent = "Cloud sync: offline — showing defaults until server responds.";
    }
    showToast(e?.message ? String(e.message) : "Could not sync with server. Showing defaults.");
  }
}

function start() {
  void boot();
}

async function boot() {
  const serverMode = await detectServerMode();

  if (serverMode) {
    let started = false;

    async function startAuthedSession(user) {
      if (!user || started) return;
      started = true;
      cloudUser = user;
      cloudHouseholdId = householdIdForUser(user.uid);
      cloudUserId = "u1";
      mergeStateInPlace(cloudMyState, buildDefaultStateForUser(user.displayName));
      appState = cloudMyState;

      const syncLine = document.getElementById("sync-status-line");
      if (syncLine) {
        syncLine.textContent = "Loading your data from server…";
      }

      try {
        initMainApp();
      } catch (e) {
        started = false;
        console.error("Main app failed:", e);
        const msg = e?.message ? String(e.message) : "App failed to start. Try refresh.";
        showToast(msg);
        showBootOrLoginError(msg);
        return;
      }

      void syncServerDataInBackground(user);
    }

    const apiUser = window.__DIET_SERVER_API_USER__;
    let sessionUser = apiUser ? toSessionUser(apiUser) : null;
    if (!sessionUser) {
      try {
        const me = await getCurrentUser();
        sessionUser = toSessionUser(me);
      } catch (e) {
        console.warn("Session load failed:", e);
      }
    }
    if (sessionUser) {
      await startAuthedSession(sessionUser);
    } else if (location.pathname === "/app" || location.pathname.endsWith("/app")) {
      location.replace("/");
    } else {
      showServerLoginError("Not signed in. Enter your username and password.");
    }
    window.__DIET_AUTH_READY__ = true;
    return;
  }

  initAuthScreen({
    onAuthed: async (pwd, data) => {
      sessionPassword = pwd;
      appState = ensureStateShape(data);
      initMainApp();
    },
    showToast,
  });
  window.__DIET_AUTH_READY__ = true;
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
