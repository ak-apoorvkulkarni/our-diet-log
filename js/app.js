/**
 * App shell: navigation, state, persistence, view wiring.
 */
import { ensureStateShape } from "./models.js";
import { saveEncrypted } from "./storage.js";
import { APP_VERSION, DEVELOPER_NAME, DEVELOPER_SITE } from "./version.js";
import { initAuthScreen } from "./ui/ui-auth.js";
import { getCurrentUser, logout, toSessionUser } from "./api-auth.js";
import { withTimeout } from "./api-client.js";
import { detectServerMode, isServerMode } from "./server-config.js";
import {
  acceptInvite,
  buildDefaultStateForUser,
  createInvite,
  ensureUserProfile,
  hydrateMealImagesForState,
  loadUserState,
  partnerUidFromHousehold,
  removePartner,
  ensureHouseholdExists,
  householdIdForUser,
  loadUserHouseholdIdFromProfile,
  loadHouseholdMeta,
  loadHouseholdState,
  listHouseholdConnections,
  listPartnerEntries,
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
import { bindReminderSettings, startReminderScheduler, isRemindersEnabled } from "./reminders.js";
let appState = ensureStateShape(null);
let cloudMyState = ensureStateShape(null);
let cloudPartnerState = null;
let cloudPartnerUid = "";
let cloudPartnerName = "";
let sessionPassword = "";
let weekCursor = weekCursorFromStorage();
let cloudUser = null;
let cloudHouseholdId = "";
let cloudUserId = "u1";

/** If the same meal id appears twice (e.g. merged household + duplicate save), keep the first occurrence. */
function dedupeMealsById(meals) {
  if (!Array.isArray(meals)) return [];
  const seen = new Set();
  const out = [];
  for (const m of meals) {
    if (!m || m.id == null) continue;
    const id = String(m.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(m);
  }
  return out;
}

function viewState() {
  if (!isServerMode()) return appState;
  const mine = cloudMyState || ensureStateShape(null);
  if (!cloudPartnerState || !cloudPartnerUid) return mine;
  const u1Name = mine.users?.find((u) => u.id === "u1")?.name || "You";
  const u2Name = String(cloudPartnerName || "Partner");
  const mineMeals = Array.isArray(mine.meals)
    ? mine.meals.map((m) => ({ ...m, userId: "u1", ownerUid: cloudUser?.uid || "" }))
    : [];
  const partnerMeals = Array.isArray(cloudPartnerState.meals)
    ? cloudPartnerState.meals.map((m) => ({ ...m, userId: "u2", ownerUid: cloudPartnerUid }))
    : [];
  return ensureStateShape({
    ...mine,
    users: [
      { id: "u1", name: u1Name },
      { id: "u2", name: u2Name },
    ],
    meals: dedupeMealsById([...mineMeals, ...partnerMeals]),
  });
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
            name: String(cloudUser.displayName || ""),
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

function refreshUserSelects() {
  const s = viewState();
  const opts = s.users
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
      openEditModal(cloudMyState, id, passwordRef, persist, showToast, () => refreshMealsDashboardInsights());
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
    const stateRef = isServerMode() ? cloudMyState : appState;
    fillSettingsForm(viewState());
    initLogDefaults();
    bindSettings(stateRef, passwordRef, persist, showToast, () => {
      if (isServerMode()) {
        signOutServer();
        return;
      }
      sessionPassword = "";
      location.reload();
    });
    bindReminderSettings(showToast);
    if (isRemindersEnabled()) {
      startReminderScheduler(showToast);
    }

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

    bindLogForm(stateRef, passwordRef, persist, showToast, () => {
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
      const inviteBtn = e.target.closest("[data-invite-partner]");
      if (inviteBtn && shell.contains(inviteBtn) && isServerMode()) {
        e.preventDefault();
        if (!cloudUser || !cloudHouseholdId) return;
        void (async () => {
          try {
            const toUsername = prompt("Partner username. Only that account can accept the invite.");
            if (!toUsername) return;
            const token = await createInvite(cloudHouseholdId, cloudUser.uid, toUsername);
            const u = new URL(location.href);
            u.searchParams.set("invite", token);
            const link = u.toString();
            const out = document.querySelector("[data-invite-link]");
            if (out) {
              out.style.display = "block";
              out.textContent = link;
            }
            try {
              await navigator.clipboard.writeText(link);
              showToast("Invite link copied.");
            } catch {
              showToast("Invite link created.");
            }
          } catch (err) {
            console.warn(err);
            showToast(err?.message ? String(err.message) : "Could not create invite link.");
          }
        })();
        return;
      }
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
    shell.hidden = false;
    shell.removeAttribute("aria-hidden");
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

async function mountPartnerInviteUi() {
  const about = document.querySelector("#view-settings .card:last-of-type");
  if (!about || document.getElementById("btn-invite-partner")) return;

  let metaNow = null;
  try {
    metaNow = await loadHouseholdMeta(cloudHouseholdId);
  } catch (e) {
    console.warn(e);
  }
  const ownerUid = String(metaNow?.slots?.u1 || "");
  const isOwner = Boolean(ownerUid && ownerUid === cloudUser?.uid);
  const metaSafe = metaNow || {};
  const connected = listHouseholdConnections(metaSafe, cloudUser?.uid || "");
  const partnersForRemove = listPartnerEntries(metaSafe, ownerUid);
  const maxPartners = 7;
  const inviteDisabled = !isOwner || partnersForRemove.length >= maxPartners;

  const partnersListHtml =
    connected.length > 0
      ? `<p class="field-hint" style="margin-bottom:0.35rem">Connected:</p><ul class="security-list partner-linked-list">${connected
          .map((p) => `<li>${escapeHtml(p.name)}</li>`)
          .join("")}</ul>`
      : `<p class="field-hint" style="margin-bottom:0.75rem">No partner has joined yet.</p>`;

  const removeBlock =
    isOwner && partnersForRemove.length > 0
      ? `<div class="field" style="margin-top:0.75rem;margin-bottom:0">
          <label for="partner-remove-select">Remove a partner</label>
          <div class="partner-remove-row">
            <select id="partner-remove-select" aria-label="Partner to remove">
              <option value="">Select…</option>
              ${partnersForRemove
                .map(
                  (p) =>
                    `<option value="${escapeAttr(p.uid)}">${escapeHtml(p.name)}</option>`
                )
                .join("")}
            </select>
            <button type="button" class="btn btn--danger" id="btn-remove-partner" disabled>Remove</button>
          </div>
          <p class="field-hint" style="margin-top:0.5rem;margin-bottom:0">Only the household owner can remove someone.</p>
        </div>`
      : !isOwner && connected.length > 0
        ? `<p class="field-hint" style="margin-top:0.75rem;margin-bottom:0">Only the household owner can remove a partner.</p>`
        : "";

  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.style.maxWidth = "560px";
  wrap.style.marginBottom = "1.5rem";
  wrap.innerHTML = `
          <h3 class="card__title" style="font-size: 1rem">Partner invite</h3>
          <p class="field-hint" style="margin-bottom: 0.75rem">
            Invite your partner by username. They register on this server, then open your invite link.
          </p>
          ${partnersListHtml}
          <button type="button" class="btn btn--secondary" id="btn-invite-partner" ${
            inviteDisabled ? "disabled" : ""
          }>Create invite link</button>
          ${removeBlock}
          <p class="field-hint" id="invite-link-line" style="margin-top: 0.75rem; word-break: break-word"></p>
        `;
  about.parentElement.insertBefore(wrap, about);

  document.getElementById("btn-invite-partner")?.addEventListener("click", async () => {
    if (!cloudUser || !cloudHouseholdId) return;
    try {
      const toUsername = prompt(
        "Partner username (they must register with this exact username before accepting)."
      );
      if (!toUsername) return;
      const token = await createInvite(cloudHouseholdId, cloudUser.uid, toUsername);
      const u = new URL(location.href);
      u.searchParams.set("invite", token);
      const line = document.getElementById("invite-link-line");
      if (line) line.textContent = u.toString();
      try {
        await navigator.clipboard.writeText(u.toString());
        showToast("Invite link copied.");
      } catch {
        showToast("Invite link created.");
      }
    } catch (e) {
      console.warn(e);
      showToast(e?.message ? String(e.message) : "Could not create invite link.");
    }
  });

  const removeSel = document.getElementById("partner-remove-select");
  const removeBtn = document.getElementById("btn-remove-partner");
  removeSel?.addEventListener("change", () => {
    if (removeBtn) removeBtn.disabled = !removeSel.value;
  });
  removeBtn?.addEventListener("click", async () => {
    if (!cloudUser || !cloudHouseholdId) return;
    const uid = removeSel?.value;
    if (!uid) {
      showToast("Select a partner to remove.");
      return;
    }
    const label = removeSel?.selectedOptions?.[0]?.textContent?.trim() || "this person";
    if (!confirm(`Remove ${label} from this household?`)) return;
    try {
      await removePartner(cloudHouseholdId, cloudUser.uid, uid);
      showToast("Partner removed.");
      window.location.reload();
    } catch (e) {
      console.warn(e);
      showToast(e?.message ? String(e.message) : "Could not remove partner.");
    }
  });
}

async function syncServerDataInBackground(user, inviteToken) {
  const syncLine = document.getElementById("sync-status-line");
  try {
    if (inviteToken) {
      cloudHouseholdId = await withTimeout(
        acceptInvite(inviteToken, user.uid, user.displayName, user.email || user.username),
        15000,
        "Invite acceptance timed out"
      );
      try {
        const u = new URL(location.href);
        u.searchParams.delete("invite");
        history.replaceState({}, "", u.toString());
      } catch (e) {}
    } else {
      cloudHouseholdId = householdIdForUser(user.uid);
    }

    await withTimeout(ensureHouseholdExists(cloudHouseholdId, user.uid), 15000, "Household setup timed out");
    await withTimeout(
      ensureUserProfile(user.uid, {
        householdId: cloudHouseholdId,
        name: String(user.displayName || ""),
      }),
      15000,
      "Profile setup timed out"
    );

    let myState = await withTimeout(loadUserState(user.uid), 15000, "Loading data timed out");
    if (!myState) {
      myState = buildDefaultStateForUser(user.displayName);
      await withTimeout(saveUserState(user.uid, cloudHouseholdId, myState), 15000, "Saving data timed out");
    }

    cloudMyState = ensureStateShape(myState);
    appState = cloudMyState;

    try {
      const meta = await withTimeout(loadHouseholdMeta(cloudHouseholdId), 10000, "Household meta timed out");
      cloudPartnerUid = (await partnerUidFromHousehold(cloudHouseholdId, user.uid)) || "";
      cloudPartnerName = cloudPartnerUid
        ? String(meta?.profiles?.[cloudPartnerUid]?.name || "Partner")
        : "";
      if (cloudPartnerUid) {
        cloudPartnerState = await withTimeout(loadUserState(cloudPartnerUid), 10000, "Partner data timed out");
      }
    } catch (e) {
      console.warn("Partner load skipped:", e);
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
      hasPartner: Boolean(cloudPartnerUid),
    };

    if (syncLine) {
      syncLine.textContent = "Cloud sync: on — data stored on this server (SQLite).";
    }
    refreshUserSelects();
    fillSettingsForm(viewState());
    refreshMealsDashboardInsights();
    void mountPartnerInviteUi();
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
    const params = new URLSearchParams(location.search || "");
    const inviteToken = String(params.get("invite") || "").trim();
    let started = false;

    async function startAuthedSession(user) {
      if (!user || started) return;
      started = true;
      cloudUser = user;
      cloudHouseholdId = householdIdForUser(user.uid);
      cloudUserId = "u1";
      cloudPartnerUid = "";
      cloudPartnerState = null;
      cloudMyState = ensureStateShape(buildDefaultStateForUser(user.displayName));
      appState = cloudMyState;

      const syncLine = document.getElementById("sync-status-line");
      if (syncLine) {
        syncLine.textContent = "Loading your data from server…";
      }

      try {
        hideLoginScreen();
        initMainApp();
      } catch (e) {
        started = false;
        console.error("Main app failed:", e);
        const msg = e?.message ? String(e.message) : "App failed to start. Try refresh.";
        showToast(msg);
        showBootOrLoginError(msg);
        return;
      }

      void syncServerDataInBackground(user, inviteToken);
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
