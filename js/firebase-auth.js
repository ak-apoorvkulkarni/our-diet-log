import { getFirebase } from "./firebase.js";

function googleProvider(sdk) {
  const p = new sdk.GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  return p;
}

/** Embedded browsers (e.g. Cursor Simple Browser) often hang forever on Firebase redirect handler blank page. */
const POPUP_SIGN_IN_MS = 120000;

async function useAuthPersistence(auth, sdk) {
  const idx = sdk.indexedDBLocalPersistence;
  const local = sdk.browserLocalPersistence;
  try {
    if (idx) await sdk.setPersistence(auth, idx);
    else if (local) await sdk.setPersistence(auth, local);
  } catch {
    try {
      if (local) await sdk.setPersistence(auth, local);
    } catch {
      /* keep default */
    }
  }
}

export async function signInWithGoogle() {
  const fb = await getFirebase();
  if (!fb) throw new Error("Firebase is not configured.");
  const { sdk, auth } = fb;
  const provider = googleProvider(sdk);
  await useAuthPersistence(auth, sdk);

  try {
    const cred = await Promise.race([
      sdk.signInWithPopup(auth, provider),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(Object.assign(new Error("Popup sign-in timed out."), { code: "auth/popup-timeout" })),
          POPUP_SIGN_IN_MS
        )
      ),
    ]);
    return cred.user;
  } catch (e) {
    const code = String(e?.code || "");

    if (code === "auth/popup-timeout") {
      throw new Error(
        "Google sign-in timed out in this browser. Open the app in Chrome or Safari (or use Cursor Open in Browser), then try Get started again."
      );
    }

    // Only use full-page redirect when the popup is explicitly blocked. Redirect often breaks
    // in embedded webviews (blank page on firebaseapp.com/__/auth/handler).
    // Do not redirect on user-cancelled popup; avoid trapping users on firebaseapp.com in broken webviews.
    if (
      code === "auth/popup-blocked" ||
      code === "auth/operation-not-supported-in-this-environment"
    ) {
      await useAuthPersistence(auth, sdk);
      await sdk.signInWithRedirect(auth, provider);
      return null;
    }

    throw e;
  }
}

export async function getRedirectUser() {
  const fb = await getFirebase();
  if (!fb) return null;
  try {
    const res = await fb.sdk.getRedirectResult(fb.auth);
    return res?.user || null;
  } catch (e) {
    console.warn("Redirect result failed:", e);
    return null;
  }
}

export async function signOutFirebase() {
  const fb = await getFirebase();
  if (!fb) return;
  await fb.sdk.signOut(fb.auth);
}

export async function onAuthStateChanged(handler) {
  const fb = await getFirebase();
  if (!fb) return () => {};
  return fb.sdk.onAuthStateChanged(fb.auth, handler);
}

