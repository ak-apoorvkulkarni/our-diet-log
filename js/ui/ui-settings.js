/**
 * Settings: people names, sign out, delete account.
 */
import { isServerMode } from "../server-config.js";
import { deleteAllMealImagesFirestore } from "../api-store.js";
import { apiFetch } from "../api-client.js";

export function bindSettings(state, passwordRef, persist, showToast, onLock) {
  document.getElementById("settings-user1-name")?.addEventListener("change", async (e) => {
    const u = state.users.find((x) => x.id === "u1");
    if (u) u.name = e.target.value.trim() || "User 1";
    await persist(passwordRef());
    showToast("Names saved.");
    window.dispatchEvent(new CustomEvent("diet-users-updated"));
  });
  document.getElementById("settings-user2-name")?.addEventListener("change", async (e) => {
    const u = state.users.find((x) => x.id === "u2");
    if (u) u.name = e.target.value.trim() || "User 2";
    await persist(passwordRef());
    showToast("Names saved.");
    window.dispatchEvent(new CustomEvent("diet-users-updated"));
  });

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
