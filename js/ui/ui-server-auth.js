/**
 * Login / register screen for self-hosted server mode.
 */
import { getCurrentUser, login, logout, register, toSessionUser } from "./api-auth.js";

function hideOverlay(el) {
  if (!el) return;
  el.hidden = true;
  el.setAttribute("aria-hidden", "true");
  el.style.setProperty("display", "none", "important");
}

export function initServerAuth({ onAuthed, showToast }) {
  const marketingEl = document.getElementById("marketing-landing");
  const landingEl = document.getElementById("landing-screen");
  const authEl = document.getElementById("auth-screen");
  const panelLogin = document.getElementById("server-panel-login");
  const panelRegister = document.getElementById("server-panel-register");
  const formLogin = document.getElementById("form-server-login");
  const formRegister = document.getElementById("form-server-register");
  const errLogin = document.getElementById("server-error-login");
  const errRegister = document.getElementById("server-error-register");

  function showMarketing() {
    if (marketingEl) {
      marketingEl.hidden = false;
      marketingEl.removeAttribute("aria-hidden");
    }
    hideOverlay(landingEl);
    hideOverlay(authEl);
  }

  function showLanding() {
    hideOverlay(marketingEl);
    if (landingEl) {
      landingEl.hidden = false;
      landingEl.removeAttribute("aria-hidden");
    }
    hideOverlay(authEl);
  }

  function showAuth(mode) {
    hideOverlay(marketingEl);
    hideOverlay(landingEl);
    if (authEl) {
      authEl.hidden = false;
      authEl.removeAttribute("aria-hidden");
      authEl.style.removeProperty("display");
    }
    const isLogin = mode === "login";
    if (panelLogin) panelLogin.hidden = !isLogin;
    if (panelRegister) panelRegister.hidden = isLogin;
    document.getElementById("auth-panel-unlock")?.setAttribute("hidden", "");
    document.getElementById("auth-panel-create")?.setAttribute("hidden", "");
    document.querySelector(".auth-note")?.setAttribute("hidden", "");
    document.getElementById("btn-show-create")?.setAttribute("hidden", "");
    document.getElementById("btn-show-unlock")?.setAttribute("hidden", "");
    document.getElementById("btn-auth-reset")?.setAttribute("hidden", "");
    document.querySelector('[for="auth-restore-file"]')?.parentElement?.setAttribute("hidden", "");
  }

  if (marketingEl) showMarketing();
  else showLanding();

  document.querySelectorAll(".marketing-open-product").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      showLanding();
    });
  });

  document.getElementById("btn-landing-back-marketing")?.addEventListener("click", (e) => {
    e.preventDefault();
    showMarketing();
  });

  document.getElementById("btn-landing-create")?.addEventListener("click", (e) => {
    e.preventDefault();
    showAuth("register");
  });

  document.getElementById("btn-landing-unlock")?.addEventListener("click", (e) => {
    e.preventDefault();
    showAuth("login");
  });

  document.getElementById("btn-auth-back-landing")?.addEventListener("click", (e) => {
    e.preventDefault();
    showLanding();
  });

  document.getElementById("btn-server-show-register")?.addEventListener("click", (e) => {
    e.preventDefault();
    showAuth("register");
  });

  document.getElementById("btn-server-show-login")?.addEventListener("click", (e) => {
    e.preventDefault();
    showAuth("login");
  });

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

  formRegister?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errRegister) errRegister.textContent = "";
    const username = document.getElementById("server-register-username")?.value?.trim();
    const displayName = document.getElementById("server-register-name")?.value?.trim() || username;
    const p1 = document.getElementById("server-register-password")?.value || "";
    const p2 = document.getElementById("server-register-password2")?.value || "";
    if (!username) {
      if (errRegister) errRegister.textContent = "Choose a username.";
      return;
    }
    if (p1.length < 8) {
      if (errRegister) errRegister.textContent = "Password must be at least 8 characters.";
      return;
    }
    if (p1 !== p2) {
      if (errRegister) errRegister.textContent = "Passwords do not match.";
      return;
    }
    const btn = formRegister.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const user = await register(username, p1, displayName, true);
      showToast("Account created.");
      await onAuthed(toSessionUser(user));
    } catch (err) {
      if (errRegister) errRegister.textContent = err?.message || "Could not register.";
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
