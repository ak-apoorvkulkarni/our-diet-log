/**
 * Server login gate — plain script, no modules.
 * Login at /  →  after sign-in redirect to /app  →  load the diary app.
 */
(function () {
  "use strict";

  var SESSION_KEY = "ahar_session_token";

  function $(id) {
    return document.getElementById(id);
  }

  function isAppPage() {
    var p = location.pathname || "";
    return p === "/app" || p.endsWith("/app");
  }

  function setError(msg) {
    var el = $("server-login-error");
    if (el) el.textContent = msg || "";
  }

  function setBootError(msg) {
    var el = $("app-boot-error");
    if (el) el.textContent = msg || "";
    if (msg) showEl("app-boot-screen");
  }

  function getToken() {
    try {
      return localStorage.getItem(SESSION_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setToken(id) {
    try {
      if (id) localStorage.setItem(SESSION_KEY, String(id));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {
      throw new Error("Browser storage is blocked. Allow storage for this site and reload.");
    }
  }

  function apiFetch(path, opts) {
    opts = opts || {};
    var headers = {};
    if (opts.headers) {
      for (var k in opts.headers) headers[k] = opts.headers[k];
    }
    if (opts.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    var tok = getToken();
    if (tok) headers.Authorization = "Bearer " + tok;
    var timeoutMs = opts.timeoutMs || 20000;
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, timeoutMs);
    return fetch(path, {
      method: opts.method || "GET",
      credentials: "same-origin",
      headers: headers,
      body: opts.body,
      signal: controller.signal,
    })
      .catch(function (err) {
        if (err && err.name === "AbortError") {
          throw new Error("Request timed out: " + path);
        }
        throw err;
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  function hideEl(id) {
    var el = $(id);
    if (!el) return;
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("pointer-events", "none", "important");
  }

  function showEl(id) {
    var el = $(id);
    if (!el) return;
    el.hidden = false;
    el.removeAttribute("aria-hidden");
    el.style.removeProperty("display");
    el.style.removeProperty("pointer-events");
  }

  function hideAppShellOnly() {
    var el = $("app-shell");
    if (!el) return;
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
  }

  function hideAllScreens() {
    hideEl("marketing-landing");
    hideEl("landing-screen");
    hideEl("auth-screen");
    hideEl("server-login-screen");
    hideEl("app-boot-screen");
    hideAppShellOnly();
  }

  function showLoginScreen() {
    hideAllScreens();
    showEl("server-login-screen");
  }

  function showBootScreen() {
    hideAllScreens();
    showEl("app-boot-screen");
  }

  function startApp() {
    if (typeof window.__DIET_START_APP__ === "function") {
      window.__DIET_START_APP__();
      return;
    }
    if (window.__DIET_APP_LOADING__ || window.__DIET_APP_LOADED__) return;
    window.__DIET_APP_LOADING__ = true;
    import("/js/app.js?v=2.1.1")
      .then(function () {
        window.__DIET_APP_LOADED__ = true;
      })
      .catch(function (err) {
        console.error(err);
        window.__DIET_APP_LOADING__ = false;
        setBootError(
          "App failed to load: " + (err && err.message ? err.message : String(err))
        );
      });
  }

  function goApp(user) {
    window.__DIET_SERVER_MODE__ = true;
    window.__DIET_SERVER_API_USER__ = user;
    if (isAppPage()) {
      showBootScreen();
      startApp();
    } else {
      location.replace("/app");
    }
  }

  window.__DIET_SERVER_LOGOUT__ = function () {
    setToken("");
    window.__DIET_SERVER_API_USER__ = null;
    apiFetch("/api/auth/logout", { method: "POST" }).catch(function () {});
    location.href = "/";
  };

  function bindLoginForm() {
    var form = $("server-login-form");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      setError("");

      var username = (($("server-login-user") || {}).value || "").trim();
      var password = ($("server-login-pass") || {}).value || "";
      if (!username || !password) {
        setError("Enter username and password.");
        return;
      }

      var btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Signing in…";
      }

      fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username,
          password: password,
          remember_me: true,
        }),
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (data) {
              return { ok: res.ok, data: data };
            });
        })
        .then(function (result) {
          if (!result.ok) {
            var detail = result.data && result.data.detail;
            throw new Error(
              typeof detail === "string" ? detail : "Invalid username or password."
            );
          }
          if (!result.data || !result.data.session_id) {
            throw new Error("Server error — no session. Try again or contact admin.");
          }
          setToken(result.data.session_id);
          goApp(result.data.user);
        })
        .catch(function (err) {
          setError(err && err.message ? err.message : "Could not sign in.");
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Sign in";
          }
        });
    });
  }

  function checkExistingSession() {
    if (!getToken()) return Promise.resolve(null);
    return apiFetch("/api/auth/me").then(function (res) {
      if (!res.ok) {
        setToken("");
        return null;
      }
      return res.json();
    });
  }

  function runServerAppPage() {
    window.__DIET_SERVER_MODE__ = true;
    document.documentElement.classList.remove("diet-local-mode");
    showBootScreen();
    var bootTimer = setTimeout(function () {
      if (window.__DIET_APP_READY__) return;
      setBootError(
        "App is taking too long to start. Hard-refresh (Ctrl+Shift+R) or sign out and sign in again."
      );
    }, 20000);
    return checkExistingSession().then(function (user) {
      if (!user) {
        clearTimeout(bootTimer);
        location.replace("/");
        return;
      }
      window.__DIET_SERVER_API_USER__ = user;
      startApp();
      var readyPoll = setInterval(function () {
        if (window.__DIET_APP_READY__) {
          clearInterval(readyPoll);
          clearTimeout(bootTimer);
        }
      }, 200);
    });
  }

  function runServerLoginPage() {
    window.__DIET_SERVER_MODE__ = true;
    document.documentElement.classList.remove("diet-local-mode");
    showLoginScreen();
    bindLoginForm();
    return checkExistingSession().then(function (user) {
      if (user) {
        window.__DIET_SERVER_API_USER__ = user;
        location.replace("/app");
      }
    });
  }

  function run() {
    fetch("/api/health", { credentials: "same-origin" })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (health) {
        if (!health || !health.ok) {
          window.__DIET_SERVER_MODE__ = false;
          document.documentElement.classList.add("diet-local-mode");
          if (!isAppPage()) startApp();
          else location.replace("/");
          return;
        }

        if (isAppPage()) {
          return runServerAppPage();
        }
        return runServerLoginPage();
      })
      .catch(function () {
        window.__DIET_SERVER_MODE__ = false;
        document.documentElement.classList.add("diet-local-mode");
        if (!isAppPage()) startApp();
        else location.replace("/");
      });
  }

  window.__DIET_SET_BOOT_ERROR__ = setBootError;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
