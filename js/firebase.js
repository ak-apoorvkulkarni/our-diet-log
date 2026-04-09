import { getFirebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

let _appPromise;

async function loadFirebaseSdk() {
  // Using the official Firebase JS SDK via ESM CDN.
  const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const authMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  const fsMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  return { ...appMod, ...authMod, ...fsMod };
}

export async function getFirebase() {
  if (!isFirebaseConfigured()) return null;
  if (_appPromise) return _appPromise;
  _appPromise = (async () => {
    const sdk = await loadFirebaseSdk();
    const config = getFirebaseConfig();
    const app = sdk.initializeApp(config);
    const auth = sdk.getAuth(app);
    const db = sdk.getFirestore(app);
    return { sdk, app, auth, db };
  })().catch((e) => {
    console.warn("Firebase init failed:", e);
    return null;
  });
  return _appPromise;
}

