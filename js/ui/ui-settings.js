/**
 * Settings: rename people, backup / restore vault file, lock session.
 */
import { applyBackupToLocalStorage, getPbkdf2Iterations } from "../storage.js";
import { isServerMode } from "../server-config.js";
import { deleteAllMealImagesFirestore } from "../api-store.js";

export function bindSettings(state, passwordRef, persist, showToast, onLock) {
  document.getElementById("settings-user1-name")?.addEventListener("change", async (e) => {
    const u = state.users.find((x) => x.id === "u1");
    if (u) u.name = e.target.value.trim() || "You";
    await persist(passwordRef());
    showToast("Names saved.");
    window.dispatchEvent(new CustomEvent("diet-users-updated"));
  });
  document.getElementById("settings-user2-name")?.addEventListener("change", async (e) => {
    const u = state.users.find((x) => x.id === "u2");
    if (u) u.name = e.target.value.trim() || "Partner";
    await persist(passwordRef());
    showToast("Names saved.");
    window.dispatchEvent(new CustomEvent("diet-users-updated"));
  });

  document.getElementById("btn-export-backup")?.addEventListener("click", () => {
    const isCloud = isServerMode();
    let blob;
    if (isCloud) {
      blob = new Blob(
        [
          JSON.stringify(
            {
              version: 2,
              mode: "server",
              exportedAt: new Date().toISOString(),
              state,
            },
            null,
            2
          ),
        ],
        { type: "application/json" }
      );
    } else {
      const salt = localStorage.getItem("diet_tracker_salt_v1");
      const payload = localStorage.getItem("diet_tracker_payload_v1");
      if (!salt || !payload) {
        showToast("Nothing to export.");
        return;
      }
      const pbkdf2Iterations = getPbkdf2Iterations();
      blob = new Blob([JSON.stringify({ version: 1, salt, payload, pbkdf2Iterations }, null, 2)], {
        type: "application/json",
      });
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `diet-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("Backup downloaded. Store it somewhere safe.");
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

  document.getElementById("btn-delete-account")?.addEventListener("click", async () => {
    if (!isServerMode()) {
      showToast("Account deletion is available on the self-hosted server only.");
      return;
    }
    const session = window.__DIET_CLOUD_SESSION__;
    const hasPartner = Boolean(session?.hasPartner);
    if (hasPartner) {
      showToast("Remove your partner before deleting your account.");
      return;
    }

    const wantsBackup = confirm("Download a backup JSON before deleting your account?");
    if (wantsBackup) {
      try {
        const blob = new Blob(
          [
            JSON.stringify(
              { version: 2, mode: "server", exportedAt: new Date().toISOString(), state },
              null,
              2
            ),
          ],
          { type: "application/json" }
        );
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `diet-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (e) {
        console.warn(e);
        showToast("Could not download backup.");
        return;
      }
    }

    const typed = prompt('Permanently delete your account and server data? Type "DELETE" to continue.');
    if (typed !== "DELETE") return;

    try {
      showToast("Deleting your account…");
      await deleteAllMealImagesFirestore();
      const res = await fetch("/api/auth/me", { method: "DELETE", credentials: "same-origin" });
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

  const namesTitle = document.getElementById("settings-names-title");
  if (namesTitle) namesTitle.textContent = u2 ? "Names" : "Your name";
  const u2Field = document.querySelector('label[for="settings-user2-name"]')?.closest(".field");
  if (u2Field) u2Field.hidden = !u2;

  const syncLine = document.getElementById("sync-status-line");
  if (syncLine) {
    if (isServerMode()) {
      syncLine.textContent = "Cloud sync: on — data stored on this server (SQLite).";
    } else {
      syncLine.textContent = "Local only — encrypted in this browser. Run the server app for cloud sync.";
    }
  }
}
