/**
 * Login screen for self-hosted server mode (admin-created accounts only).
 */
import { getCurrentUser, login, logout, toSessionUser } from "./api-auth.js";

function hideEl(el) {
  if (!el) return;
  el.hidden = true;
  el.setAttribute("aria-hidden", "true");
  el.style.setProperty("display", "none", "important");
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

  hideEl(marketingEl);
  hideEl(landingEl);
  hideEl(localOnly);
  hideEl(document.getElementById("auth-back-wrap"));

  if (authEl) {
    authEl.hidden = false;
    authEl.removeAttribute("aria-hidden");
    authEl.style.removeProperty("display");
  }
  if (panelLogin) {
    panelLogin.hidden = false;
    panelLogin.removeAttribute("aria-hidden");
    panelLogin.style.removeProperty("display");
  }

  formLogin?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errLogin) errLogin.textContent = "";
    const username = document.getElementById("server-login-username")?.value?.trim();
    const password = document.getElementById("server-login-password")?.value || "";
    if (!username || !password) {
      if (errLogin) errLogin.textContent = "Enter username and password.";
      return;
    }
    const btn = formLogin.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const user = await login(username, password, true);
      await onAuthed(toSessionUser(user));
    } catch (err) {
      if (errLogin) errLogin.textContent = err?.message || "Could not sign in.";
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  void (async () => {
    try {
      const user = await getCurrentUser();
      if (user) await onAuthed(toSessionUser(user));
    } catch (e) {
      console.warn("Session check:", e);
    }
  })();
}

export { logout as signOutServer };
