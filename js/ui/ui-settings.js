/**
 * Settings: people names, sign out, delete account.
 */
import { isServerMode } from "../server-config.js";
import { deleteAllMealImagesFirestore } from "../api-store.js";
import { apiFetch } from "../api-client.js";

let _nameSaveTimer = null;

function readPeopleNamesFromInputs(state) {
  const u1 = state.users.find((x) => x.id === "u1");
  const u2 = state.users.find((x) => x.id === "u2");
  const i1 = document.getElementById("settings-user1-name");
  const i2 = document.getElementById("settings-user2-name");
  if (u1 && i1) u1.name = i1.value.trim() || "User 1";
  if (u2 && i2) u2.name = i2.value.trim() || "User 2";
}

async function savePeopleNames(state, passwordRef, persist, showToast) {
  readPeopleNamesFromInputs(state);
  const ok = await persist(passwordRef());
  if (ok) {
    showToast("Names saved.");
    window.dispatchEvent(new CustomEvent("diet-users-updated"));
  }
}

function bindPeopleNameInput(id, getState, passwordRef, persist, showToast) {
  const el = document.getElementById(id);
  if (!el || el.dataset.bound === "1") return;
  el.dataset.bound = "1";

  const scheduleSave = () => {
    if (_nameSaveTimer) clearTimeout(_nameSaveTimer);
    _nameSaveTimer = setTimeout(() => {
      const state = typeof getState === "function" ? getState() : getState;
      void savePeopleNames(state, passwordRef, persist, showToast);
    }, 600);
  };

  el.addEventListener("input", scheduleSave);
  el.addEventListener("change", () => {
    if (_nameSaveTimer) clearTimeout(_nameSaveTimer);
    const state = typeof getState === "function" ? getState() : getState;
    void savePeopleNames(state, passwordRef, persist, showToast);
  });
}

export function bindSettings(getState, passwordRef, persist, showToast, onLock) {
  bindPeopleNameInput("settings-user1-name", getState, passwordRef, persist, showToast);
  bindPeopleNameInput("settings-user2-name", getState, passwordRef, persist, showToast);

  document.getElementById("btn-lock")?.addEventListener("click", () => {
    onLock();
  });

  document.getElementById("btn-delete-account")?.addEventListener("click", async () => {
    if (!isServerMode()) {
      showToast("Account deletion is available on the self-hosted server only.");
      return;
    }

    const typed = prompt('Permanently delete your account and server data? Type "DELETE" to continue.');
    if (typed !== "DELETE") return;

    try {
      showToast("Deleting your account…");
      await deleteAllMealImagesFirestore();
      const res = await apiFetch("/api/auth/me", { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Delete failed");
      }
      showToast("Account deleted.");
      window.location.reload();
    } catch (e) {
      console.warn(e);
      showToast(e?.message ? String(e.message) : "Could not delete account.");
    }
  });
}

export function fillSettingsForm(state) {
  const u1 = state.users.find((x) => x.id === "u1");
  const u2 = state.users.find((x) => x.id === "u2");
  const i1 = document.getElementById("settings-user1-name");
  const i2 = document.getElementById("settings-user2-name");
  if (i1 && u1) i1.value = u1.name;
  if (i2 && u2) i2.value = u2.name;

  const syncLine = document.getElementById("sync-status-line");
  if (syncLine) {
    if (isServerMode()) {
      syncLine.textContent = "Cloud sync: on — data stored on this server (SQLite).";
    } else {
      syncLine.textContent = "Local only — encrypted in this browser. Run the server app for cloud sync.";
    }
  }
}
