/**
 * Login / first-time setup screen.
 */
import { createEmptyState } from "../models.js";
import {
  hasStoredVault,
  createVault,
  loadDecrypted,
  clearVault,
  applyBackupToLocalStorage,
} from "../storage.js";
import { getWebCryptoBlockReason, localStorageAvailable } from "../crypto-env.js";

function hideAuthOverlay(el) {
  if (!el) return;
  el.hidden = true;
  el.setAttribute("aria-hidden", "true");
  el.style.setProperty("display", "none", "important");
}

function formatUnlockError(err) {
  if (err?.name === "OperationError" || err?.name === "InvalidCharacterError") {
    return "Wrong password, or the saved data is damaged. Try a backup file or reset below.";
  }
  const msg = err?.message || String(err);
  return msg || "Could not unlock.";
}

/** Browsers keep separate vaults per site address (localhost vs github.io, etc.). */
function storageOriginHint() {
  if (typeof location === "undefined") return "";
  const h = location.hostname;
  if (h === "localhost" || h === "127.0.0.1") {
    return ' If you recorded meals on the published site (GitHub Pages), that vault is not stored here. Use "Restore backup file" with a JSON from Settings → Download backup on the other address, then unlock.';
  }
  return "";
}

export function initAuthScreen({ onAuthed, showToast }) {
  /** Not named `screen` — that shadows `window.screen` (Screen) in some environments. */
  const authScreenEl = document.getElementById("auth-screen");
  const panelUnlock = document.getElementById("auth-panel-unlock");
  const panelCreate = document.getElementById("auth-panel-create");
  const formUnlock = document.getElementById("form-unlock");
  const formCreate = document.getElementById("form-create");
  const btnShowCreate = document.getElementById("btn-show-create");
  const btnShowUnlock = document.getElementById("btn-show-unlock");
  const errUnlock = document.getElementById("auth-error-unlock");
  const errCreate = document.getElementById("auth-error-create");
  const cryptoBanner = document.getElementById("auth-crypto-banner");
  const existingBanner = document.getElementById("auth-existing-banner");
  const marketingEl = document.getElementById("marketing-landing");
  const landingEl = document.getElementById("landing-screen");
  const btnLandingCreate = document.getElementById("btn-landing-create");
  const btnLandingUnlock = document.getElementById("btn-landing-unlock");
  const btnAuthBackLanding = document.getElementById("btn-auth-back-landing");
  const btnLandingBackMarketing = document.getElementById("btn-landing-back-marketing");

  const existing = hasStoredVault();

  function showEnvIssues() {
    if (!localStorageAvailable()) {
      if (cryptoBanner) {
        cryptoBanner.hidden = false;
        cryptoBanner.textContent =
          "Browser storage is disabled or full. Allow site data for this site, then reload.";
      }
      return;
    }
    const why = getWebCryptoBlockReason();
    if (why && cryptoBanner) {
      cryptoBanner.hidden = false;
      cryptoBanner.textContent = why;
    }
  }
  showEnvIssues();

  const localhostHint = document.getElementById("auth-localhost-hint");
  if (localhostHint && typeof location !== "undefined") {
    const h = location.hostname;
    if (h === "localhost" || h === "127.0.0.1") localhostHint.hidden = false;
  }

  if (existingBanner) {
    existingBanner.hidden = !existing;
  }

  /** One visible panel at a time — native `hidden` on wrappers (reliable across browsers). */
  function applyAuthMode(mode) {
    const showUnlock = mode === "unlock";
    if (panelUnlock) panelUnlock.hidden = !showUnlock;
    if (panelCreate) panelCreate.hidden = showUnlock;
    if (btnShowCreate) btnShowCreate.hidden = !showUnlock;
    if (btnShowUnlock) btnShowUnlock.hidden = showUnlock;
  }

  if (existing) {
    applyAuthMode("unlock");
    if (btnShowCreate) btnShowCreate.hidden = true;
    if (btnShowUnlock) btnShowUnlock.hidden = true;
  } else {
    applyAuthMode("create");
    if (btnShowCreate) btnShowCreate.hidden = true;
    if (btnShowUnlock) btnShowUnlock.hidden = false;
  }

  function onToggleUnlock(e) {
    e.preventDefault();
    applyAuthMode("unlock");
    if (errUnlock) errUnlock.textContent = "";
    if (errCreate) errCreate.textContent = "";
    requestAnimationFrame(() => document.getElementById("password-unlock")?.focus());
  }
  function onToggleCreate(e) {
    e.preventDefault();
    applyAuthMode("create");
    if (errUnlock) errUnlock.textContent = "";
    if (errCreate) errCreate.textContent = "";
    requestAnimationFrame(() => document.getElementById("password-new")?.focus());
  }
  btnShowUnlock?.addEventListener("click", onToggleUnlock);
  btnShowCreate?.addEventListener("click", onToggleCreate);

  function showMarketingView() {
    if (errUnlock) errUnlock.textContent = "";
    if (errCreate) errCreate.textContent = "";
    if (marketingEl) {
      marketingEl.hidden = false;
      marketingEl.removeAttribute("aria-hidden");
    }
    if (landingEl) {
      landingEl.hidden = true;
      landingEl.setAttribute("aria-hidden", "true");
    }
    if (authScreenEl) {
      authScreenEl.hidden = true;
      authScreenEl.setAttribute("aria-hidden", "true");
      authScreenEl.style.removeProperty("display");
    }
  }

  function showProductLandingFromMarketing() {
    if (marketingEl) {
      marketingEl.hidden = true;
      marketingEl.setAttribute("aria-hidden", "true");
    }
    if (landingEl) {
      landingEl.hidden = false;
      landingEl.removeAttribute("aria-hidden");
    }
    if (authScreenEl) {
      authScreenEl.hidden = true;
      authScreenEl.setAttribute("aria-hidden", "true");
      authScreenEl.style.removeProperty("display");
    }
  }

  function showLandingView() {
    if (errUnlock) errUnlock.textContent = "";
    if (errCreate) errCreate.textContent = "";
    if (landingEl) {
      landingEl.hidden = false;
      landingEl.removeAttribute("aria-hidden");
    }
    if (authScreenEl) {
      authScreenEl.hidden = true;
      authScreenEl.setAttribute("aria-hidden", "true");
      authScreenEl.style.removeProperty("display");
    }
  }

  function showAuthFromLanding(mode) {
    const localOnly = document.getElementById("auth-local-only");
    const serverLogin = document.getElementById("server-panel-login");
    const backWrap = document.getElementById("auth-back-wrap");
    if (localOnly) {
      localOnly.hidden = false;
      localOnly.removeAttribute("aria-hidden");
    }
    if (serverLogin) serverLogin.hidden = true;
    if (backWrap) backWrap.hidden = false;
    if (landingEl) {
      landingEl.hidden = true;
      landingEl.setAttribute("aria-hidden", "true");
    }
    if (authScreenEl) {
      authScreenEl.hidden = false;
      authScreenEl.removeAttribute("aria-hidden");
      authScreenEl.style.removeProperty("display");
    }
    const wantsCreate = mode === "create";
    if (wantsCreate && !existing) {
      applyAuthMode("create");
      requestAnimationFrame(() => document.getElementById("password-new")?.focus());
    } else {
      applyAuthMode("unlock");
      requestAnimationFrame(() => document.getElementById("password-unlock")?.focus());
    }
  }

  if (!marketingEl && !landingEl && authScreenEl) {
    authScreenEl.hidden = false;
    authScreenEl.removeAttribute("aria-hidden");
  } else if (!marketingEl && landingEl) {
    landingEl.hidden = false;
    landingEl.removeAttribute("aria-hidden");
  }

  document.querySelectorAll(".marketing-open-product").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      showProductLandingFromMarketing();
    });
  });

  btnLandingBackMarketing?.addEventListener("click", (e) => {
    e.preventDefault();
    showMarketingView();
  });

  btnLandingCreate?.addEventListener("click", (e) => {
    e.preventDefault();
    showAuthFromLanding("create");
  });
  btnLandingUnlock?.addEventListener("click", (e) => {
    e.preventDefault();
    showAuthFromLanding("unlock");
  });
  btnAuthBackLanding?.addEventListener("click", (e) => {
    e.preventDefault();
    showLandingView();
  });

  formUnlock?.addEventListener("submit", async (e) => {
    e.preventDefault();
    errUnlock.textContent = "";
    const why = getWebCryptoBlockReason();
    if (why) {
      errUnlock.textContent = why;
      return;
    }
    if (!localStorageAvailable()) {
      errUnlock.textContent = "Enable browser storage for this site and reload.";
      return;
    }
    const pwd = document.getElementById("password-unlock").value;
    if (!pwd) {
      errUnlock.textContent = "Enter your password.";
      return;
    }
    const submitBtn = formUnlock.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset._label = submitBtn.textContent;
      submitBtn.textContent = "Unlocking…";
    }
    try {
      await new Promise((r) => setTimeout(r, 0));
      const data = await loadDecrypted(pwd);
      if (!data) {
        errUnlock.textContent =
          "Could not read saved data. Restore a backup JSON, or reset and create a new log." +
          storageOriginHint();
        return;
      }
      try {
        await onAuthed(pwd, data);
      } catch (inner) {
        console.error(inner);
        errUnlock.textContent =
          "Could not start the app: " +
          (inner?.message || String(inner)) +
          ". Try a hard refresh. If this persists, use Reset below and restore a backup.";
        return;
      }
      hideAuthOverlay(authScreenEl);
    } catch (err) {
      errUnlock.textContent = formatUnlockError(err) + storageOriginHint();
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset._label || "Unlock";
      }
    }
  });

  document.getElementById("auth-restore-file")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.salt || !data.payload) throw new Error("Invalid backup file");
      applyBackupToLocalStorage({
        salt: data.salt,
        payload: data.payload,
        pbkdf2Iterations: data.pbkdf2Iterations,
      });
      window.location.reload();
    } catch (err) {
      errCreate.textContent = err.message || "Could not restore.";
      errUnlock.textContent = err.message || "Could not restore.";
    }
    e.target.value = "";
  });

  formCreate?.addEventListener("submit", async (e) => {
    e.preventDefault();
    errCreate.textContent = "";
    const why = getWebCryptoBlockReason();
    if (why) {
      errCreate.textContent = why;
      return;
    }
    if (!localStorageAvailable()) {
      errCreate.textContent = "Enable browser storage for this site and reload.";
      return;
    }
    const p1 = document.getElementById("password-new").value;
    const p2 = document.getElementById("password-new-confirm").value;
    if (!p1) {
      errCreate.textContent = "Enter a password.";
      return;
    }
    if (p1 !== p2) {
      errCreate.textContent = "Passwords do not match.";
      return;
    }
    if (hasStoredVault()) {
      errCreate.textContent =
        "This browser already has a log. Reload the page to unlock, or use Erase data below if you need a new password.";
      return;
    }
    const createBtn = formCreate.querySelector('button[type="submit"]');
    if (createBtn) {
      createBtn.disabled = true;
      createBtn.dataset._label = createBtn.textContent;
      createBtn.textContent = "Creating…";
    }
    try {
      await new Promise((r) => setTimeout(r, 0));
      if (hasStoredVault()) {
        const data = await loadDecrypted(p1);
        showToast("Loaded your shared log from the cloud.");
        try {
          await onAuthed(p1, data);
        } catch (inner) {
          console.error(inner);
          errCreate.textContent =
            "Could not start the app: " + (inner?.message || String(inner)) + ". Try a hard refresh.";
          return;
        }
        hideAuthOverlay(authScreenEl);
        return;
      }
      await createVault(p1, createEmptyState());
      const data = await loadDecrypted(p1);
      showToast("Vault created. Your meals are encrypted on this device.");
      try {
        await onAuthed(p1, data);
      } catch (inner) {
        console.error(inner);
        errCreate.textContent =
          "Could not start the app: " + (inner?.message || String(inner)) + ". Try a hard refresh.";
        return;
      }
      hideAuthOverlay(authScreenEl);
    } catch (err) {
      errCreate.textContent = err.message || "Could not create vault.";
    } finally {
      if (createBtn) {
        createBtn.disabled = false;
        createBtn.textContent = createBtn.dataset._label || "Create encrypted log";
      }
    }
  });

  document.getElementById("btn-auth-reset")?.addEventListener("click", () => {
    if (
      !confirm(
        "Erase this browser’s encrypted log and vault? You cannot undo this without a backup file. After this, you can create a new password on this device."
      )
    ) {
      return;
    }
    clearVault();
    sessionStorage.removeItem("diet_week_cursor");
    sessionStorage.removeItem("diet_dashboard_scope");
    location.reload();
  });
}
