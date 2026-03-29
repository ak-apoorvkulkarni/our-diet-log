/**
 * Gentle local-time reminders (13:00 and 21:00) — optional, user permission.
 */
const STORAGE_KEY = "diet_reminders_enabled_v1";
const LAST_FIRE = "diet_reminders_last_fire_v1";

const SLOTS = [
  { hour: 13, minute: 0, body: "A gentle nudge — log a meal when you have a moment." },
  { hour: 21, minute: 0, body: "Wind down — a quick meal log helps your week stay complete." },
];

export function isRemindersEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setRemindersEnabled(on) {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function sameMinuteKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;
}

function tick(showToast) {
  if (!isRemindersEnabled()) return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const now = new Date();
  const h = now.getHours();
  const min = now.getMinutes();

  for (const slot of SLOTS) {
    if (h !== slot.hour || min !== slot.minute) continue;
    const key = sameMinuteKey(now);
    let last = "";
    try {
      last = sessionStorage.getItem(LAST_FIRE) || "";
    } catch {
      /* ignore */
    }
    if (last === key) return;
    try {
      sessionStorage.setItem(LAST_FIRE, key);
    } catch {
      /* ignore */
    }
    try {
      new Notification("आहार Tracker", {
        body: slot.body,
        tag: "diet-daily-reminder",
        silent: false,
      });
    } catch (e) {
      console.warn("Notification failed:", e);
    }
  }
}

let intervalId = null;

export function startReminderScheduler(showToast) {
  if (intervalId != null) return;
  tick(showToast);
  intervalId = window.setInterval(() => tick(showToast), 60 * 1000);
}

export function stopReminderScheduler() {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

async function requestNotificationPermission(showToast) {
  if (typeof Notification === "undefined") {
    showToast("Notifications are not supported in this browser.");
    return false;
  }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") {
    showToast("Notifications are blocked — enable them in browser settings.");
    return false;
  }
  const r = await Notification.requestPermission();
  if (r === "granted") return true;
  showToast("Reminders need notification permission.");
  return false;
}

export function bindReminderSettings(showToast) {
  const btn = document.getElementById("btn-reminders-enable");
  const status = document.getElementById("reminders-status");
  if (!btn) return;

  function sync() {
    const on = isRemindersEnabled();
    btn.textContent = on ? "Turn off meal reminders" : "Turn on gentle reminders (13:00 & 21:00)";
    if (status) {
      status.textContent = on
        ? "On — we’ll remind you at 1:00 PM and 9:00 PM local time (when this tab can run)."
        : "Off — enable to get two gentle nudges per day.";
    }
  }
  sync();

  btn.addEventListener("click", async () => {
    if (isRemindersEnabled()) {
      setRemindersEnabled(false);
      sync();
      showToast("Reminders off.");
      return;
    }
    const ok = await requestNotificationPermission(showToast);
    if (!ok) return;
    setRemindersEnabled(true);
    startReminderScheduler(showToast);
    sync();
    showToast("Reminders on — thanks for taking care of your log.");
  });
}
