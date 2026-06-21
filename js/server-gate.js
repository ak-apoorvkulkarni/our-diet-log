/**
 * Server login gate — plain script, no modules. Runs before app.js loads.
 */
(function () {
  "use strict";

  var SESSION_KEY = "ahar_session_token";

  function $(id) {
    return document.getElementById(id);
  }

  function setError(msg) {
    var el = $("server-login-error");
    if (el) el.textContent = msg || "";
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
    return fetch(path, {
      method: opts.method || "GET",
      credentials: "same-origin",
      headers: headers,
      body: opts.body,
    });
  }

  function hideEl(id) {
    var el = $(id);
    if (!el) return;
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
  }

  function showEl(id) {
    var el = $(id);
    if (!el) return;
    el.hidden = false;
    el.removeAttribute("aria-hidden");
  }

  function hideMarketingAndLocalAuth() {
    hideEl("marketing-landing");
    hideEl("landing-screen");
    hideEl("auth-screen");
    hideEl("app-shell");
  }

  function showLoginScreen() {
    hideMarketingAndLocalAuth();
    showEl("server-login-screen");
  }

  function hideLoginScreen() {
    hideEl("server-login-screen");
  }

  function startApp() {
    if (typeof window.__DIET_START_APP__ === "function") {
      window.__DIET_START_APP__();
    }
  }

  function onLoggedIn(user) {
    window.__DIET_SERVER_MODE__ = true;
    window.__DIET_SERVER_API_USER__ = user;
    setError("");
    hideLoginScreen();
    startApp();
  }

  window.__DIET_SERVER_LOGOUT__ = function () {
    setToken("");
    window.__DIET_SERVER_API_USER__ = null;
    apiFetch("/api/auth/logout", { method: "POST" }).catch(function () {});
    window.location.reload();
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
          if (btn) btn.textContent = "Opening…";
          onLoggedIn(result.data.user);
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

  function run() {
    fetch("/api/health", { credentials: "same-origin" })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (health) {
        if (!health || !health.ok) {
          window.__DIET_SERVER_MODE__ = false;
          startApp();
          return;
        }

        window.__DIET_SERVER_MODE__ = true;
        showLoginScreen();
        bindLoginForm();

        return checkExistingSession().then(function (user) {
          if (user) onLoggedIn(user);
        });
      })
      .catch(function () {
        window.__DIET_SERVER_MODE__ = false;
        startApp();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
