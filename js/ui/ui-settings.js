/**
 * Settings: rename people, backup / restore vault file, lock session.
 */
import { applyBackupToLocalStorage, getPbkdf2Iterations } from "../storage.js";
import { isFirebaseConfigured } from "../firebase-config.js";
import { getFirebase } from "../firebase.js";
import { deleteAllMealImagesFirestore, deleteMealImageFirestore } from "../firebase-store.js";

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
    const isFb = isFirebaseConfigured();
    let blob;
    if (isFb) {
      blob = new Blob(
        [
          JSON.stringify(
            {
              version: 2,
              mode: "firebase",
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
    if (!isFirebaseConfigured()) {
      showToast("Account deletion is available in Firebase mode only.");
      return;
    }
    const session = window.__DIET_FIREBASE_SESSION__;
    const householdId = String(session?.householdId || "");
    const hasPartner = Boolean(session?.hasPartner);
    if (!householdId) {
      showToast("Could not find your cloud household. Refresh and try again.");
      return;
    }
    if (hasPartner) {
      showToast("Delete account is disabled after inviting a partner to avoid deleting shared data.");
      return;
    }

    const wantsBackup = confirm("Do you want to download a backup JSON file before deleting your account?");
    if (wantsBackup) {
      try {
        const blob = new Blob(
          [
            JSON.stringify(
              { version: 2, mode: "firebase", exportedAt: new Date().toISOString(), state },
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

    const typed = prompt('This will permanently delete your cloud data and account. Type "DELETE" to continue.');
    if (typed !== "DELETE") return;

    try {
      showToast("Deleting your cloud data…");
      const fb = await getFirebase();
      if (!fb) throw new Error("Firebase not configured");
      const { sdk, db, auth } = fb;
      const uid = String(session?.uid || "");

      // Delete meal images stored in Firestore (free tier; no Cloud Storage).
      try {
        for (const m of state.meals || []) {
          if (m?.id && m.imageFirestore) await deleteMealImageFirestore(uid, m.id);
        }
        await deleteAllMealImagesFirestore(uid);
      } catch (e) {
        console.warn("Meal image delete failed:", e);
      }

      // Delete Firestore docs (per-user state + user profile).
      await sdk.deleteDoc(sdk.doc(db, "users", String(session?.uid || ""), "state", "v1"));
      await sdk.deleteDoc(sdk.doc(db, "users", String(session?.uid || "")));

      // Delete household doc only if you are alone (kept as a safety net).
      if (!hasPartner) {
        await sdk.deleteDoc(sdk.doc(db, "households", householdId, "state", "v1"));
        await sdk.deleteDoc(sdk.doc(db, "households", householdId));
      }

      // Delete auth user (may require recent login).
      const u = auth.currentUser;
      if (!u) throw new Error("No signed-in user");
      await sdk.deleteUser(u);

      showToast("Account deleted.");
      try {
        window.location.reload();
      } catch {}
    } catch (e) {
      console.warn(e);
      const code = String(e?.code || "");
      const msg = e && e.message ? String(e.message) : "";
      if (code === "auth/requires-recent-login") {
        showToast("Please sign out, sign in again, then retry deleting your account.");
        return;
      }
      if (code === "permission-denied") {
        showToast(
          "Could not delete account (permission denied). Deploy the latest firestore.rules to your Firebase project, then try again."
        );
        return;
      }
      showToast("Could not delete account. " + (msg || code || "Check the console for details."));
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
    if (isFirebaseConfigured()) {
      syncLine.textContent = "Cloud sync: on, using Firebase (Google sign-in, shared household via invite).";
    } else {
      syncLine.textContent = "Cloud sync: off, local only until you configure Firebase in index.html.";
    }
  }
}
