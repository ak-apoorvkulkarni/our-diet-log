/**
 * Login / first-time setup screen.
 */
import { createEmptyState } from "./models.js";
import {
  hasStoredVault,
  createVault,
  loadDecrypted,
  clearVault,
  applyBackupToLocalStorage,
} from "./storage.js";
import { getWebCryptoBlockReason, localStorageAvailable } from "./crypto-env.js";

function hideAuthOverlay(el) {
  if (!el) return;
  el.hidden = true;
  el.setAttribute("aria-hidden", "true");
  el.style.setProperty("display", "none", "important");
}

function formatUnlockError(err) {
  if (err?.name === "OperationError" || err?.name === "InvalidCharacterError") {
    return "Wrong password — or the saved data is damaged. Try a backup file or reset below.";
  }
  const msg = err?.message || String(err);
  return msg || "Could not unlock.";
}

export function initAuthScreen({ onAuthed, showToast }) {
  const screen = document.getElementById("auth-screen");
  const formUnlock = document.getElementById("form-unlock");
  const formCreate = document.getElementById("form-create");
  const btnShowCreate = document.getElementById("btn-show-create");
  const btnShowUnlock = document.getElementById("btn-show-unlock");
  const errUnlock = document.getElementById("auth-error-unlock");
  const errCreate = document.getElementById("auth-error-create");
  const cryptoBanner = document.getElementById("auth-crypto-banner");

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

  if (existing) {
    formUnlock.hidden = false;
    formCreate.hidden = true;
    if (btnShowCreate) btnShowCreate.hidden = true;
    if (btnShowUnlock) btnShowUnlock.hidden = true;
  } else {
    formUnlock.hidden = true;
    formCreate.hidden = false;
    if (btnShowCreate) btnShowCreate.hidden = true;
    if (btnShowUnlock) btnShowUnlock.hidden = true;
  }

  btnShowCreate?.addEventListener("click", () => {
    formUnlock.hidden = true;
    formCreate.hidden = false;
    errUnlock.textContent = "";
    errCreate.textContent = "";
  });

  btnShowUnlock?.addEventListener("click", () => {
    formCreate.hidden = true;
    formUnlock.hidden = false;
    errUnlock.textContent = "";
    errCreate.textContent = "";
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
          "Could not read saved data. Restore a backup JSON, or reset and create a new log.";
        return;
      }
      try {
        onAuthed(pwd, data);
      } catch (inner) {
        console.error(inner);
        errUnlock.textContent =
          "Could not start the app: " +
          (inner?.message || String(inner)) +
          ". Try a hard refresh. If this persists, use Reset below and restore a backup.";
        return;
      }
      hideAuthOverlay(screen);
    } catch (err) {
      errUnlock.textContent = formatUnlockError(err);
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
    const createBtn = formCreate.querySelector('button[type="submit"]');
    if (createBtn) {
      createBtn.disabled = true;
      createBtn.dataset._label = createBtn.textContent;
      createBtn.textContent = "Creating…";
    }
    try {
      await new Promise((r) => setTimeout(r, 0));
      await createVault(p1, createEmptyState());
      const data = await loadDecrypted(p1);
      showToast("Vault created — your meals are encrypted on this device.");
      try {
        onAuthed(p1, data);
      } catch (inner) {
        console.error(inner);
        errCreate.textContent =
          "Could not start the app: " + (inner?.message || String(inner)) + ". Try a hard refresh.";
        return;
      }
      hideAuthOverlay(screen);
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
        "Erase this device’s diet log and password vault? This cannot be undone unless you have a backup file."
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
