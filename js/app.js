/**
 * App shell: navigation, state, persistence, view wiring.
 */
import { ensureStateShape } from "./models.js";
import { saveEncrypted } from "./storage.js";
import { APP_VERSION, DEVELOPER_NAME, DEVELOPER_SITE } from "./version.js";
import { initAuthScreen } from "./ui/ui-auth.js";
import { isFirebaseConfigured } from "./firebase-config.js";
import { getRedirectUser, onAuthStateChanged, signInWithGoogle, signOutFirebase } from "./firebase-auth.js";
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
  stripFirebaseMealImagesForSave,
} from "./firebase-store.js";
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
let firebaseMyState = ensureStateShape(null);
let firebasePartnerState = null;
let firebasePartnerUid = "";
let firebasePartnerName = "";
let sessionPassword = "";
let weekCursor = weekCursorFromStorage();
let firebaseUser = null;
let firebaseHouseholdId = "";
let firebaseUserId = "u1";

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
  if (!isFirebaseConfigured()) return appState;
  const mine = firebaseMyState || ensureStateShape(null);
  if (!firebasePartnerState || !firebasePartnerUid) return mine;
  const u1Name = mine.users?.find((u) => u.id === "u1")?.name || "You";
  const u2Name = String(firebasePartnerName || "Partner");
  const mineMeals = Array.isArray(mine.meals)
    ? mine.meals.map((m) => ({ ...m, userId: "u1", ownerUid: firebaseUser?.uid || "" }))
    : [];
  const partnerMeals = Array.isArray(firebasePartnerState.meals)
    ? firebasePartnerState.meals.map((m) => ({ ...m, userId: "u2", ownerUid: firebasePartnerUid }))
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
  if (isFirebaseConfigured()) {
    if (!firebaseUser || !firebaseHouseholdId) {
      showToast("Not signed in. Refresh and sign in again.");
      return false;
    }
    try {
      await Promise.race([
        (async () => {
          await ensureUserProfile(firebaseUser.uid, {
            householdId: firebaseHouseholdId,
            name: String(firebaseUser.displayName || ""),
          });
          await saveUserState(
            firebaseUser.uid,
            firebaseHouseholdId,
            stripFirebaseMealImagesForSave(firebaseMyState)
          );
        })(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("SAVE_TIMEOUT")), FIREBASE_SAVE_TIMEOUT_MS);
        }),
      ]);
      return true;
    } catch (e) {
      console.warn("Firebase save failed:", e);
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
      if (!isFirebaseConfigured()) return true;
      const ownerUid = String(m?.ownerUid || "");
      if (!ownerUid) return true;
      return ownerUid === String(firebaseUser?.uid || "");
    },
    onEdit: (id) => {
      if (isFirebaseConfigured()) {
        const meal = s.meals.find((m) => m.id === id);
        const ownerUid = String(meal?.ownerUid || "");
        if (ownerUid && ownerUid !== String(firebaseUser?.uid || "")) {
          showToast("You can only edit your own meals.");
          return;
        }
      }
      openEditModal(firebaseMyState, id, passwordRef, persist, showToast, () => refreshMealsDashboardInsights());
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

let mainAppInitialized = false;

function initMainApp() {
  if (mainAppInitialized) return;
  mainAppInitialized = true;
  const shell = document.getElementById("app-shell");
  if (!shell) {
    throw new Error("Missing #app-shell. index.html may be incomplete.");
  }
  shell.hidden = false;
  const fv = document.getElementById("footer-version");
  if (fv) {
    const local =
      location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "";
    fv.innerHTML = `आहार Tracker · <code>v${APP_VERSION}</code> · <a href="${DEVELOPER_SITE}" target="_blank" rel="noopener noreferrer">${DEVELOPER_NAME}</a>${local ? " · running locally" : ""}`;
  }
  refreshUserSelects();
  const stateRef = isFirebaseConfigured() ? firebaseMyState : appState;
  fillSettingsForm(viewState());
  initLogDefaults();
  bindSettings(stateRef, passwordRef, persist, showToast, () => {
    if (isFirebaseConfigured()) {
      void signOutFirebase()
        .catch((e) => console.warn("Sign out failed:", e))
        .finally(() => location.reload());
      return;
    }
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

  bindLogForm(stateRef, passwordRef, persist, showToast, () => {
    setView("meals");
    renderMealsView();
    closeMobileSidebarIfNeeded();
    requestAnimationFrame(() => {
      const main = document.querySelector(".app-main");
      if (main) main.scrollTop = 0;
      document.getElementById("view-meals")?.scrollIntoView({ behavior: "smooth", block: "start" });
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {
        window.scrollTo(0, 0);
      }
    });
  });

  shell.addEventListener("click", (e) => {
    const inviteBtn = e.target.closest("[data-invite-partner]");
    if (inviteBtn && shell.contains(inviteBtn) && isFirebaseConfigured()) {
      e.preventDefault();
      if (!firebaseUser || !firebaseHouseholdId) return;
      (async () => {
        try {
          const toEmail = prompt("Partner email (Google email). Only this email will be able to accept the invite.");
          if (!toEmail) return;
          const token = await createInvite(firebaseHouseholdId, firebaseUser.uid, toEmail);
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
          showToast(
            err?.message
              ? String(err.message)
              : "Could not create invite link. Check Firestore rules and that you are signed in."
          );
        }
      })();
      return;
    }
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

}

function start() {
  // Firebase mode: Google sign-in + Firestore persistence.
  if (isFirebaseConfigured()) {
    const marketingEl = document.getElementById("marketing-landing");
    const landingEl = document.getElementById("landing-screen");
    const authEl = document.getElementById("auth-screen");

    function showMarketing() {
      if (marketingEl) {
        marketingEl.hidden = false;
        marketingEl.removeAttribute("aria-hidden");
      }
      if (landingEl) {
        landingEl.hidden = true;
        landingEl.setAttribute("aria-hidden", "true");
      }
      if (authEl) {
        authEl.hidden = true;
        authEl.setAttribute("aria-hidden", "true");
      }
    }

    function showLanding() {
      if (marketingEl) {
        marketingEl.hidden = true;
        marketingEl.setAttribute("aria-hidden", "true");
      }
      if (landingEl) {
        landingEl.hidden = false;
        landingEl.removeAttribute("aria-hidden");
      }
      if (authEl) {
        authEl.hidden = true;
        authEl.setAttribute("aria-hidden", "true");
      }
    }

    // Default to marketing screen (first visit).
    if (marketingEl) {
      showMarketing();
    } else if (landingEl) {
      landingEl.hidden = false;
      landingEl.removeAttribute("aria-hidden");
    }

    // Wire marketing CTAs to Google sign-in directly (skip the extra landing step).
    document.querySelectorAll(".marketing-open-product").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          const u = await signInWithGoogle();
          if (u) {
            void startAuthedSession(u);
          } else {
            showToast("Continuing sign-in in this tab…");
          }
        } catch (err) {
          console.warn(err);
          const code = err && err.code ? String(err.code) : "";
          const msg = err && err.message ? String(err.message) : "";
          if (code === "auth/unauthorized-domain") {
            showToast(
              "Firebase blocked this domain. In Firebase Console → Authentication → Settings → Authorized domains, add localhost and your GitHub Pages domain, then try again."
            );
            return;
          }
          showToast(
            "Could not sign in. " +
              (code ? `(${code}) ` : "") +
              (msg ? msg : "Check popup blockers. If blocked, the app will redirect instead.")
          );
        }
      });
    });

    // Wire back button from product landing to marketing.
    document.getElementById("btn-landing-back-marketing")?.addEventListener("click", (e) => {
      e.preventDefault();
      showMarketing();
    });

    // Update the product landing button labels for Google sign in.
    const btn = document.getElementById("btn-landing-unlock");
    if (btn) btn.textContent = "Continue with Google";
    const btn2 = document.getElementById("btn-landing-create");
    if (btn2) btn2.textContent = "Get started with Google";

    // If an invite token is present in the URL, keep it for after sign-in.
    const params = new URLSearchParams(location.search || "");
    const inviteToken = String(params.get("invite") || "").trim();

    const FIRESTORE_BOOT_MS = 60000;

    let started = false;
    async function startAuthedSession(user) {
      if (!user || started) return;
      started = true;
      firebaseUser = user;
      try {
        await Promise.race([
          (async () => {
        if (inviteToken) {
          firebaseHouseholdId = await acceptInvite(
            inviteToken,
            user.uid,
            user.displayName,
            user.email
          );
          try {
            const u = new URL(location.href);
            u.searchParams.delete("invite");
            history.replaceState({}, "", u.toString());
          } catch (e) {}
        } else {
          const fromProfile = await loadUserHouseholdIdFromProfile(user.uid);
          firebaseHouseholdId = fromProfile || householdIdForUser(user.uid);
        }

        await ensureHouseholdExists(firebaseHouseholdId, user.uid);
        const meta = await loadHouseholdMeta(firebaseHouseholdId);
        firebaseUserId = "u1";
        firebasePartnerUid = (await partnerUidFromHousehold(firebaseHouseholdId, user.uid)) || "";
        firebasePartnerName = firebasePartnerUid
          ? String(meta?.profiles?.[firebasePartnerUid]?.name || "Partner")
          : "";

        await ensureUserProfile(user.uid, {
          householdId: firebaseHouseholdId,
          name: String(user.displayName || ""),
        });

        let myState = await loadUserState(user.uid);
        if (!myState) {
          // One-time migration for existing installs:
          // Split the legacy shared household state into per-user state for the currently signed-in user only.
          try {
            const legacy = await loadHouseholdState(firebaseHouseholdId);
            const slots = meta?.slots || {};
            const legacyUserId = slots.u2 === user.uid ? "u2" : "u1";
            if (legacy && Array.isArray(legacy.meals)) {
              const myMeals = legacy.meals
                .filter((m) => String(m.userId || "u1") === legacyUserId)
                .map((m) => ({ ...m, userId: "u1" }));
              const legacyName =
                legacy?.users?.find((u) => u.id === legacyUserId)?.name ||
                String(user.displayName || "You");
              myState = ensureStateShape({
                ...legacy,
                users: [{ id: "u1", name: legacyName }],
                meals: myMeals,
              });
              await saveUserState(user.uid, firebaseHouseholdId, myState);
            }
          } catch (e) {
            console.warn("Legacy migration skipped:", e);
          }
        }
        if (!myState) {
          myState = buildDefaultStateForUser(user.displayName);
          await saveUserState(user.uid, firebaseHouseholdId, myState);
        }
        firebaseMyState = ensureStateShape(myState);
        await hydrateMealImagesForState(user.uid, firebaseMyState);

        if (firebasePartnerUid) {
          try {
            firebasePartnerState = await loadUserState(firebasePartnerUid);
            if (firebasePartnerState) {
              await hydrateMealImagesForState(firebasePartnerUid, firebasePartnerState);
            }
          } catch (pe) {
            console.warn("Partner state unavailable (continuing solo):", pe);
            firebasePartnerState = null;
            const pCode = pe && pe.code ? String(pe.code) : "";
            if (pCode === "permission-denied") {
              showToast(
                "Could not load your partner's data (permissions). You can still use your log; try refresh or ask them to open the app once."
              );
            }
          }
        } else {
          firebasePartnerState = null;
        }

        // Solo account: remove stale second person from older saves (tabs showed "Aditi" with no partner).
        if (!firebasePartnerUid) {
          let dirty = false;
          if (firebaseMyState.users?.some((u) => u.id === "u2")) {
            firebaseMyState.users = firebaseMyState.users.filter((u) => u.id !== "u2");
            dirty = true;
          }
          if (firebaseMyState.meals?.some((m) => String(m.userId || "u1") === "u2")) {
            firebaseMyState.meals = firebaseMyState.meals.filter(
              (m) => String(m.userId || "u1") !== "u2"
            );
            dirty = true;
          }
          if (!firebaseMyState.users?.length) {
            firebaseMyState.users = [{ id: "u1", name: String(user.displayName || "You") }];
            dirty = true;
          }
          if (dirty) {
            await saveUserState(
              user.uid,
              firebaseHouseholdId,
              stripFirebaseMealImagesForSave(firebaseMyState)
            );
          }
        }

        appState = firebaseMyState;
          })(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Loading your data timed out. Check your network and try again.")),
              FIRESTORE_BOOT_MS
            )
          ),
        ]);
      } catch (e) {
        started = false;
        console.warn("Firebase load failed:", e);
        const code = e && e.code ? String(e.code) : "";
        const msg = e && e.message ? String(e.message) : "";
        if (code === "permission-denied") {
          const cfg =
            typeof window !== "undefined" && window.__DIET_FIREBASE_CONFIG__
              ? window.__DIET_FIREBASE_CONFIG__
              : null;
          const pid = cfg && cfg.projectId ? String(cfg.projectId) : "";
          showToast(
            pid
              ? `Firestore permission denied. Confirm Firestore rules are deployed to project ${pid} and you are signed in, then refresh.`
              : "Firestore permission denied. Confirm Firestore rules are deployed to this Firebase project and you are signed in, then refresh."
          );
          return;
        }
        showToast(
          msg && !code
            ? msg
            : "Could not load your data from the cloud. " +
                (code ? `(${code}) ` : "") +
                (msg ? msg : "Try a normal browser (Chrome/Safari) or refresh.")
        );
        return;
      }

      // Hide all pre-app overlays after successful sign-in.
      try {
        const marketingEl2 = document.getElementById("marketing-landing");
        const landingEl2 = document.getElementById("landing-screen");
        const authEl2 = document.getElementById("auth-screen");
        if (marketingEl2) {
          marketingEl2.hidden = true;
          marketingEl2.setAttribute("aria-hidden", "true");
        }
        if (landingEl2) {
          landingEl2.hidden = true;
          landingEl2.setAttribute("aria-hidden", "true");
        }
        if (authEl2) {
          authEl2.hidden = true;
          authEl2.setAttribute("aria-hidden", "true");
        }
      } catch (e) {}

      // Add a simple invite helper to Settings (safe no-op if missing elements).
      const syncLine = document.getElementById("sync-status-line");
      if (syncLine) {
        syncLine.textContent = "Cloud sync: on, powered by Firebase (shared household via invite).";
      }
      const about = document.querySelector("#view-settings .card:last-of-type");
      if (about && !document.getElementById("btn-invite-partner")) {
        void (async () => {
          let metaNow = null;
          try {
            metaNow = await loadHouseholdMeta(firebaseHouseholdId);
          } catch (e) {
            console.warn(e);
          }
          const ownerUid = String(metaNow?.slots?.u1 || "");
          const isOwner = Boolean(ownerUid && ownerUid === firebaseUser?.uid);
          const metaSafe = metaNow || {};
          const connected = listHouseholdConnections(metaSafe, firebaseUser?.uid || "");
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
          <p class="field-hint" style="margin-top:0.5rem;margin-bottom:0">Only the household owner can remove someone. Other partners stay connected.</p>
        </div>`
              : !isOwner && connected.length > 0
                ? `<p class="field-hint" style="margin-top:0.75rem;margin-bottom:0">Only the person who created the household can remove a partner.</p>`
                : "";

          const wrap = document.createElement("div");
          wrap.className = "card";
          wrap.style.maxWidth = "560px";
          wrap.style.marginBottom = "1.5rem";
          wrap.innerHTML = `
          <h3 class="card__title" style="font-size: 1rem">Partner invite</h3>
          <p class="field-hint" style="margin-bottom: 0.75rem">
            Invite your partner to share the same dashboard. They will sign in with Google and join your household.
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
            if (!firebaseUser || !firebaseHouseholdId) return;
            try {
              const toEmail = prompt(
                "Partner email (Google email). Only this email will be able to accept the invite."
              );
              if (!toEmail) return;
              const token = await createInvite(firebaseHouseholdId, firebaseUser.uid, toEmail);
              const u = new URL(location.href);
              u.searchParams.set("invite", token);
              const line = document.getElementById("invite-link-line");
              if (line) {
                line.textContent = u.toString();
              }
              try {
                await navigator.clipboard.writeText(u.toString());
                showToast("Invite link copied.");
              } catch {
                showToast("Invite link created.");
              }
            } catch (e) {
              console.warn(e);
              showToast(
                e?.message
                  ? String(e.message)
                  : "Could not create invite link. Check Firestore rules and that you are signed in."
              );
            }
          });

          const removeSel = document.getElementById("partner-remove-select");
          const removeBtn = document.getElementById("btn-remove-partner");
          removeSel?.addEventListener("change", () => {
            if (removeBtn) removeBtn.disabled = !removeSel.value;
          });
          removeBtn?.addEventListener("click", async () => {
            if (!firebaseUser || !firebaseHouseholdId) return;
            const uid = removeSel?.value;
            if (!uid) {
              showToast("Select a partner to remove.");
              return;
            }
            const label = removeSel?.selectedOptions?.[0]?.textContent?.trim() || "this person";
            if (!confirm(`Remove ${label} from this household? They will lose access to this dashboard.`)) return;
            if (
              !confirm(
                partnersForRemove.length > 1
                  ? `Remove ${label}? Everyone else in the household will stay connected.`
                  : "Are you sure? This will revert the app back to individual mode."
              )
            ) {
              return;
            }
            try {
              await removePartner(firebaseHouseholdId, firebaseUser.uid, uid);
              showToast("Partner removed.");
              window.location.reload();
            } catch (e) {
              console.warn(e);
              showToast(e?.message ? String(e.message) : "Could not remove partner.");
            }
          });
        })();
      }

      // Before first dashboard render: expose session so scope tabs use Firestore partner link, not stale state.users.
      try {
        window.__DIET_FIREBASE_SESSION__ = {
          uid: firebaseUser?.uid || "",
          householdId: firebaseHouseholdId || "",
          userId: firebaseUserId || "u1",
          hasPartner: Boolean(firebasePartnerUid),
        };
      } catch (e) {}

      initMainApp();

      // Invite partner buttons are wired via a single delegated handler in initMainApp().
    }

    // Wire landing CTA buttons to sign-in (kept for direct URL access, but marketing is now direct).
    ["btn-landing-create", "btn-landing-unlock"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          const u = await signInWithGoogle();
          if (u) {
            void startAuthedSession(u);
          }
        } catch (err) {
          console.warn(err);
          const code = err && err.code ? String(err.code) : "";
          const msg = err && err.message ? String(err.message) : "";
          if (code === "auth/unauthorized-domain") {
            showToast(
              "Firebase blocked this domain. In Firebase Console → Authentication → Settings → Authorized domains, add localhost and your GitHub Pages domain, then try again."
            );
            return;
          }
          showToast(
            "Could not sign in. " +
              (code ? `(${code}) ` : "") +
              (msg ? msg : "Check popup blockers. If blocked, the app will redirect instead.")
          );
        }
      });
    });

    void onAuthStateChanged((user) => {
      if (!user) return;
      void startAuthedSession(user);
    });

    // Finish redirect-based sign-in (embedded browsers often need this instead of popups).
    void (async () => {
      try {
        const ru = await getRedirectUser();
        if (ru) await startAuthedSession(ru);
      } catch (e) {
        console.warn("Redirect sign-in:", e);
      }
    })();

    if (typeof window !== "undefined") {
      window.__DIET_AUTH_READY__ = true;
    }
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
