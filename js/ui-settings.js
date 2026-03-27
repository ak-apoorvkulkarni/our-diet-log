/**
 * Settings: rename people, backup / restore vault file, lock session.
 */
import { applyBackupToLocalStorage, getPbkdf2Iterations } from "./storage.js";
import { isSupabaseConfigured } from "./sync-remote.js";

export function bindSettings(state, passwordRef, persist, showToast, onLock) {
  document.getElementById("settings-user1-name")?.addEventListener("change", async (e) => {
    const u = state.users.find((x) => x.id === "u1");
    if (u) u.name = e.target.value.trim() || "Apoorv";
    await persist(passwordRef());
    showToast("Names saved.");
    window.dispatchEvent(new CustomEvent("diet-users-updated"));
  });
  document.getElementById("settings-user2-name")?.addEventListener("change", async (e) => {
    const u = state.users.find((x) => x.id === "u2");
    if (u) u.name = e.target.value.trim() || "Aditi";
    await persist(passwordRef());
    showToast("Names saved.");
    window.dispatchEvent(new CustomEvent("diet-users-updated"));
  });

  document.getElementById("btn-export-backup")?.addEventListener("click", () => {
    const salt = localStorage.getItem("diet_tracker_salt_v1");
    const payload = localStorage.getItem("diet_tracker_payload_v1");
    if (!salt || !payload) {
      showToast("Nothing to export.");
      return;
    }
    const pbkdf2Iterations = getPbkdf2Iterations();
    const blob = new Blob([JSON.stringify({ version: 1, salt, payload, pbkdf2Iterations }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `diet-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("Backup downloaded — store it somewhere safe.");
  });

  document.getElementById("backup-file")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (!data.salt || !data.payload) throw new Error("Invalid backup file");
      applyBackupToLocalStorage({
        salt: data.salt,
        payload: data.payload,
        pbkdf2Iterations: data.pbkdf2Iterations,
      });
      showToast("Backup restored — unlock with your password.");
      window.location.reload();
    } catch (err) {
      showToast(err.message || "Could not import backup.");
    }
    e.target.value = "";
  });

  document.getElementById("btn-lock")?.addEventListener("click", () => {
    onLock();
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
    syncLine.textContent = isSupabaseConfigured()
      ? "Cloud sync: on — saves merge with Supabase (same password on both phones)."
      : "Cloud sync: off — local only until you add Supabase keys in index.html (see CLOUD_SYNC.md).";
  }
}
