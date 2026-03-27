/**
 * Log meal form + meal grid + edit modal.
 */
import { addMeal, updateMeal, deleteMeal, sortMealsDesc } from "./meals-store.js";
import { fileToCompressedDataUrl } from "./image-utils.js";

function healthBadge(h) {
  if (h === "healthy") return '<span class="badge badge--healthy">Healthy</span>';
  if (h === "okay") return '<span class="badge badge--okay">Okay</span>';
  if (h === "unhealthy") return '<span class="badge badge--unhealthy">Unhealthy</span>';
  return '<span class="badge badge--pending">Not rated</span>';
}

function formatWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function renderMealGrid(container, state, { onEdit, userFilter }) {
  let list = sortMealsDesc(state.meals);
  if (userFilter && userFilter !== "all") {
    list = list.filter((m) => m.userId === userFilter);
  }
  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state card">
        <div class="empty-state__icon">🍽</div>
        <p>No meals yet. Log your first meal with a photo.</p>
      </div>`;
    return;
  }
  container.innerHTML = `<div class="meal-grid">${list
    .map(
      (m) => `
    <article class="meal-card" data-id="${m.id}">
      <div class="meal-card__img-wrap">
        ${
          m.imageData
            ? `<img class="meal-card__img" src="${m.imageData}" alt="">`
            : `<div class="meal-card__placeholder" aria-hidden="true">📷</div>`
        }
      </div>
      <div class="meal-card__body">
        <h3 class="meal-card__title">${escapeHtml(m.title)}</h3>
        <div class="meal-card__meta">
          ${escapeHtml(userName(state, m.userId))} · ${formatWhen(m.datetime)}
          ${m.calories != null ? ` · ${m.calories} kcal` : ""}
        </div>
        <div style="margin-bottom:0.5rem">${healthBadge(m.health)}</div>
        <button type="button" class="btn btn--secondary" data-edit="${m.id}" style="width:100%">Edit details</button>
      </div>
    </article>`
    )
    .join("")}</div>`;

  container.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => onEdit(btn.getAttribute("data-edit")));
  });
}

function userName(state, userId) {
  const u = state.users.find((x) => x.id === userId);
  return u ? u.name : "Unknown";
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

export function bindLogForm(state, passwordRef, persist, showToast) {
  const form = document.getElementById("form-log-meal");
  const preview = document.getElementById("meal-photo-preview");
  const fileInput = document.getElementById("meal-photo");
  let pendingImage = null;

  fileInput?.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) {
      preview.innerHTML = "";
      pendingImage = null;
      return;
    }
    try {
      pendingImage = await fileToCompressedDataUrl(f);
      preview.innerHTML = `<img src="${pendingImage}" alt="Preview" style="max-height:200px;border-radius:12px;margin-top:0.5rem">`;
    } catch (e) {
      showToast(e.message || "Image error");
      pendingImage = null;
      preview.innerHTML = "";
    }
  });

  document.querySelectorAll("[data-health-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-health-pick]").forEach((b) => b.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      btn.dataset.selected = "1";
    });
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userId = document.getElementById("meal-user").value;
    const title = document.getElementById("meal-title").value;
    const date = document.getElementById("meal-date").value;
    const time = document.getElementById("meal-time").value;
    const calories = document.getElementById("meal-calories").value;
    const notes = document.getElementById("meal-notes").value;
    let health = null;
    const sel = document.querySelector("[data-health-pick].is-selected");
    if (sel) health = sel.getAttribute("data-health-pick");

    const dt = date && time ? new Date(`${date}T${time}`) : new Date();
    addMeal(state, {
      userId,
      datetime: dt.toISOString(),
      title,
      calories,
      notes,
      health,
      imageData: pendingImage,
    });
    await persist(passwordRef());
    showToast("Meal saved.");
    form.reset();
    preview.innerHTML = "";
    pendingImage = null;
    document.querySelectorAll("[data-health-pick]").forEach((b) => b.classList.remove("is-selected"));
    document.getElementById("meal-date").value = todayISODate();
    document.getElementById("meal-time").value = nowTimeLocal();
  });
}

export function openEditModal(state, mealId, passwordRef, persist, showToast, onClose) {
  const meal = state.meals.find((m) => m.id === mealId);
  if (!meal) return;
  const modal = document.getElementById("modal-edit");
  const form = document.getElementById("form-edit-meal");
  document.getElementById("edit-meal-id").value = meal.id;
  document.getElementById("edit-user").value = meal.userId;
  document.getElementById("edit-title").value = meal.title;
  document.getElementById("edit-date").value = toDateInput(meal.datetime);
  document.getElementById("edit-time").value = toTimeInput(meal.datetime);
  document.getElementById("edit-calories").value = meal.calories ?? "";
  document.getElementById("edit-notes").value = meal.notes || "";
  const prev = document.getElementById("edit-photo-preview");
  if (meal.imageData) {
    prev.innerHTML = `<img src="${meal.imageData}" alt="" style="max-height:160px;border-radius:12px">`;
  } else {
    prev.innerHTML = "";
  }

  document.querySelectorAll("[data-edit-health]").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.getAttribute("data-edit-health") === meal.health);
  });

  const fileInput = document.getElementById("edit-photo");
  fileInput.value = "";
  let newImage = meal.imageData;

  const onFile = async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      newImage = await fileToCompressedDataUrl(f);
      prev.innerHTML = `<img src="${newImage}" alt="" style="max-height:160px;border-radius:12px">`;
    } catch (err) {
      showToast(err.message);
    }
  };
  fileInput.onchange = onFile;

  const close = () => {
    modal.hidden = true;
    form.onsubmit = null;
    document.getElementById("btn-delete-meal").onclick = null;
    onClose?.();
  };

  modal.hidden = false;

  form.onsubmit = async (e) => {
    e.preventDefault();
    let health = null;
    const hSel = document.querySelector("[data-edit-health].is-selected");
    if (hSel) health = hSel.getAttribute("data-edit-health");

    const date = document.getElementById("edit-date").value;
    const time = document.getElementById("edit-time").value;
    const dt = date && time ? new Date(`${date}T${time}`).toISOString() : meal.datetime;

    updateMeal(state, meal.id, {
      userId: document.getElementById("edit-user").value,
      title: document.getElementById("edit-title").value,
      datetime: dt,
      calories: document.getElementById("edit-calories").value,
      notes: document.getElementById("edit-notes").value,
      health,
      imageData: newImage,
    });
    await persist(passwordRef());
    showToast("Meal updated.");
    close();
  };

  document.getElementById("btn-delete-meal").onclick = async () => {
    if (!confirm("Delete this meal?")) return;
    deleteMeal(state, meal.id);
    await persist(passwordRef());
    showToast("Meal deleted.");
    close();
  };

  document.querySelectorAll("[data-edit-health]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("[data-edit-health]").forEach((b) => b.classList.remove("is-selected"));
      btn.classList.add("is-selected");
    };
  });

  document.getElementById("modal-edit-close").onclick = close;
  modal.querySelector("[data-overlay]")?.addEventListener("click", close);
}

function todayISODate() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function nowTimeLocal() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function toDateInput(iso) {
  return iso.slice(0, 10);
}

function toTimeInput(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function initLogDefaults() {
  const d = document.getElementById("meal-date");
  const t = document.getElementById("meal-time");
  if (d && !d.value) d.value = todayISODate();
  if (t && !t.value) t.value = nowTimeLocal();
}

