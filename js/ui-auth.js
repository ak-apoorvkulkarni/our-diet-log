/**
 * Login / first-time setup screen.
 */
import { createEmptyState } from "./models.js";
import { hasStoredVault, createVault, loadDecrypted } from "./storage.js";

export function initAuthScreen({ onAuthed, showToast }) {
  const screen = document.getElementById("auth-screen");
  const formUnlock = document.getElementById("form-unlock");
  const formCreate = document.getElementById("form-create");
  const btnShowCreate = document.getElementById("btn-show-create");
  const btnShowUnlock = document.getElementById("btn-show-unlock");
  const errUnlock = document.getElementById("auth-error-unlock");
  const errCreate = document.getElementById("auth-error-create");

  const existing = hasStoredVault();

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
    const pwd = document.getElementById("password-unlock").value;
    if (!pwd) {
      errUnlock.textContent = "Enter your password.";
      return;
    }
    try {
      const data = await loadDecrypted(pwd);
      if (!data) {
        errUnlock.textContent = "Could not load data.";
        return;
      }
      screen.hidden = true;
      onAuthed(pwd, data);
    } catch {
      errUnlock.textContent = "Wrong password or corrupted data.";
    }
  });

  document.getElementById("auth-restore-file")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.salt || !data.payload) throw new Error("Invalid backup file");
      localStorage.setItem("diet_tracker_salt_v1", data.salt);
      localStorage.setItem("diet_tracker_payload_v1", data.payload);
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
    const p1 = document.getElementById("password-new").value;
    const p2 = document.getElementById("password-new-confirm").value;
    if (p1.length < 8) {
      errCreate.textContent = "Use at least 8 characters.";
      return;
    }
    if (p1 !== p2) {
      errCreate.textContent = "Passwords do not match.";
      return;
    }
    try {
      await createVault(p1, createEmptyState());
      const data = await loadDecrypted(p1);
      screen.hidden = true;
      showToast("Vault created — your meals are encrypted on this device.");
      onAuthed(p1, data);
    } catch (err) {
      errCreate.textContent = err.message || "Could not create vault.";
    }
  });
}
