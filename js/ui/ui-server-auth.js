/**
 * Login screen for self-hosted server mode (admin-created accounts only).
 */
import { getCurrentUser, login, logout, toSessionUser } from "./api-auth.js";
import { storageAvailable } from "./api-client.js";

function hideEl(el) {
  if (!el) return;
  el.hidden = true;
  el.setAttribute("aria-hidden", "true");
  el.style.setProperty("display", "none", "important");
}

function showEl(el) {
  if (!el) return;
  el.hidden = false;
  el.removeAttribute("aria-hidden");
  el.style.removeProperty("display");
}

export function hideLoginScreen() {
  hideEl(document.getElementById("marketing-landing"));
  hideEl(document.getElementById("landing-screen"));
  hideEl(document.getElementById("auth-screen"));
}

export function initServerAuth({ onAuthed, showToast }) {
  window.__DIET_SERVER_MODE__ = true;

  const marketingEl = document.getElementById("marketing-landing");
  const landingEl = document.getElementById("landing-screen");
  const authEl = document.getElementById("auth-screen");
  const panelLogin = document.getElementById("server-panel-login");
  const localOnly = document.getElementById("auth-local-only");
  const formLogin = document.getElementById("form-server-login");
  const errLogin = document.getElementById("server-error-login");
  let sessionChecked = false;
  let booting = false;

  hideEl(marketingEl);
  hideEl(landingEl);
  hideEl(localOnly);
  hideEl(document.getElementById("auth-back-wrap"));

  if (authEl) showEl(authEl);
  if (panelLogin) showEl(panelLogin);

  if (!storageAvailable()) {
    const msg = "Browser storage is blocked. Allow cookies/storage for this site, then reload.";
    if (errLogin) errLogin.textContent = msg;
    showToast(msg);
  }

  async function tryRestoreSession() {
    if (sessionChecked || booting) return;
    sessionChecked = true;
    try {
      const user = await getCurrentUser();
      if (user) {
        booting = true;
        await onAuthed(toSessionUser(user));
      }
    } catch (e) {
      console.warn("Session check:", e);
    } finally {
      booting = false;
    }
  }

  formLogin?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (booting) return;
    if (errLogin) errLogin.textContent = "";
    const username = document.getElementById("server-login-username")?.value?.trim();
    const password = document.getElementById("server-login-password")?.value || "";
    if (!username || !password) {
      if (errLogin) errLogin.textContent = "Enter username and password.";
      return;
    }
    if (!storageAvailable()) {
      if (errLogin) {
        errLogin.textContent = "Browser storage is blocked. Allow storage for this site and reload.";
      }
      return;
    }
    const btn = formLogin.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Signing in…";
    }
    booting = true;
    try {
      const user = await login(username, password, true);
      if (btn) btn.textContent = "Loading your diary…";
      await onAuthed(toSessionUser(user));
    } catch (err) {
      const msg = err?.message || "Could not sign in.";
      if (errLogin) errLogin.textContent = msg;
      showToast(msg);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Sign in";
      }
    } finally {
      booting = false;
    }
  });

  void tryRestoreSession();
}

export { logout as signOutServer };
