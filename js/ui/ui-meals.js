/**
 * Log meal form + meal grid + edit modal.
 */
import { addMeal, updateMeal, deleteMeal, sortMealsDesc, filterMeals } from "../meals-store.js";
import { fileToCompressedDataUrl } from "../image-utils.js";
import { guessCalories } from "../calorie-estimate.js";
import { isFirebaseConfigured } from "../firebase-config.js";
import { deleteMealImageFirestore, saveMealImageFirestore } from "../firebase-store.js";
import {
  categoryFromDateAndTimeInputs,
  coerceMealCategorySelect,
  labelForMealCategory,
  categoryFromLocalTime,
} from "../meal-category.js";

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function wireGuessCaloriesButton(
  buttonId,
  { getTitle, getCaloriesInput, getHintEl, getPreviewImg, getFileInput },
  showToast
) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const titleEl = getTitle();
    const calEl = getCaloriesInput();
    const hintEl = getHintEl?.();
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "…";
    try {
      const r = await guessCalories({
        title: titleEl?.value,
        imageElement: getPreviewImg?.(),
        imageFile: getFileInput?.()?.files?.[0],
      });
      if (r.kcal != null) {
        calEl.value = String(r.kcal);
        if (hintEl && r.reason && r.source) {
          hintEl.hidden = false;
          hintEl.innerHTML = `<span class="cal-guess-hint__source">${escapeHtml(r.source)}</span> — ${escapeHtml(r.reason)}`;
        }
        showToast(`~${r.kcal} kcal · ${r.source}`);
      } else {
        if (hintEl) {
          hintEl.hidden = true;
          hintEl.textContent = "";
        }
        showToast(r.message || "Could not estimate.");
      }
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  });
}

function healthBadge(h) {
  if (h === "healthy") return '<span class="badge badge--healthy">Healthy</span>';
  if (h === "okay") return '<span class="badge badge--okay">Neutral</span>';
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

export function renderMealGrid(container, state, { onEdit, userFilter, mealFilters, canEditMeal }) {
  if (!container) return;
  let list;
  if (mealFilters) {
    list = sortMealsDesc(filterMeals(state.meals, mealFilters));
  } else {
    list = sortMealsDesc(state.meals);
    if (userFilter && userFilter !== "all") {
      list = list.filter((m) => m.userId === userFilter);
    }
  }
  if (list.length === 0) {
    const filtered =
      mealFilters &&
      (mealFilters.query ||
        (mealFilters.userId && mealFilters.userId !== "all") ||
        (mealFilters.category && mealFilters.category !== "all") ||
        mealFilters.from ||
        mealFilters.to);
    container.innerHTML = `
      <div class="empty-state card">
        <div class="empty-state__icon">🍽</div>
        <p>${
          filtered
            ? "No meals match these filters — try widening the date range or clearing search."
            : "No meals yet. Log your first meal with a photo."
        }</p>
      </div>`;
    return;
  }
  container.innerHTML = `<div class="meal-grid">${list
    .map((m) => {
      const editable = typeof canEditMeal === "function" ? Boolean(canEditMeal(m)) : true;
      const btnText = editable ? "Edit details" : "View details";
      const btnAttrs = editable ? `data-edit="${m.id}"` : `data-edit="${m.id}" disabled`;
      return `
    <article class="meal-card" data-id="${m.id}">
      <div class="meal-card__img-wrap">
        ${
          m.imageUrl || m.imageData
            ? `<img class="meal-card__img" src="${escapeHtml(m.imageUrl || m.imageData)}" alt="">`
            : `<div class="meal-card__placeholder" aria-hidden="true">📷</div>`
        }
      </div>
      <div class="meal-card__body">
        <h3 class="meal-card__title">${escapeHtml(m.title)}</h3>
        <div class="meal-card__meta">
          ${escapeHtml(userName(state, m.userId))} · ${escapeHtml(
            labelForMealCategory(m.category || categoryFromLocalTime(new Date(m.datetime)))
          )} · ${formatWhen(m.datetime)}
          ${m.calories != null ? ` · ${m.calories} kcal` : ""}
        </div>
        <div style="margin-bottom:0.5rem">${healthBadge(m.health)}</div>
        <button type="button" class="btn btn--secondary" ${btnAttrs} style="width:100%">${btnText}</button>
      </div>
    </article>`
    })
    .join("")}</div>`;

  container.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => onEdit(btn.getAttribute("data-edit")));
  });
}

function userName(state, userId) {
  const u = state.users.find((x) => x.id === userId);
  return u ? u.name : "Unknown";
}

export function bindLogForm(state, passwordRef, persist, showToast, onMealSaved) {
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

  wireGuessCaloriesButton(
    "btn-guess-calories",
    {
      getTitle: () => document.getElementById("meal-title"),
      getCaloriesInput: () => document.getElementById("meal-calories"),
      getHintEl: () => document.getElementById("meal-calories-hint"),
      getPreviewImg: () => document.querySelector("#meal-photo-preview img"),
      getFileInput: () => document.getElementById("meal-photo"),
    },
    showToast
  );

  wireGuessCaloriesButton(
    "btn-guess-calories-edit",
    {
      getTitle: () => document.getElementById("edit-title"),
      getCaloriesInput: () => document.getElementById("edit-calories"),
      getHintEl: () => document.getElementById("edit-calories-hint"),
      getPreviewImg: () => document.querySelector("#edit-photo-preview img"),
      getFileInput: () => document.getElementById("edit-photo"),
    },
    showToast
  );

  document.getElementById("meal-calories")?.addEventListener("input", () => {
    const h = document.getElementById("meal-calories-hint");
    if (h) {
      h.hidden = true;
      h.textContent = "";
    }
  });
  document.getElementById("edit-calories")?.addEventListener("input", () => {
    const h = document.getElementById("edit-calories-hint");
    if (h) {
      h.hidden = true;
      h.textContent = "";
    }
  });

  const syncLogCategoryFromInputs = () => {
    const cat = document.getElementById("meal-category");
    if (!cat) return;
    const date = document.getElementById("meal-date")?.value;
    const time = document.getElementById("meal-time")?.value;
    cat.value = categoryFromDateAndTimeInputs(date, time);
  };

  document.getElementById("meal-date")?.addEventListener("input", syncLogCategoryFromInputs);
  document.getElementById("meal-time")?.addEventListener("input", syncLogCategoryFromInputs);

  function prepareNewMealEntry() {
    pendingImage = null;
    if (preview) preview.innerHTML = "";
    if (fileInput) fileInput.value = "";
    const mealTitle = document.getElementById("meal-title");
    if (mealTitle) mealTitle.value = "";
    const mealCal = document.getElementById("meal-calories");
    if (mealCal) mealCal.value = "";
    const mealNotes = document.getElementById("meal-notes");
    if (mealNotes) mealNotes.value = "";
    const d = document.getElementById("meal-date");
    const t = document.getElementById("meal-time");
    if (d) d.value = todayISODate();
    if (t) t.value = nowTimeLocal();
    syncLogCategoryFromInputs();
    document.querySelectorAll("[data-health-pick]").forEach((b) => b.classList.remove("is-selected"));
    const mh = document.getElementById("meal-calories-hint");
    if (mh) {
      mh.hidden = true;
      mh.textContent = "";
    }
  }

  window.addEventListener("diet-open-new-meal", () => {
    prepareNewMealEntry();
    requestAnimationFrame(() => {
      document.getElementById("meal-title")?.focus();
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
    const category = document.getElementById("meal-category")?.value;
    let health = null;
    const sel = document.querySelector("[data-health-pick].is-selected");
    if (sel) health = sel.getAttribute("data-health-pick");
    if (!health) {
      showToast("Choose Healthy, Neutral, or Unhealthy.");
      return;
    }

    const dt = date && time ? new Date(`${date}T${time}`) : new Date();
    addMeal(state, {
      userId,
      datetime: dt.toISOString(),
      title,
      calories,
      notes,
      health,
      category,
      imageData: pendingImage,
      imageUrl: null,
    });
    if (isFirebaseConfigured() && pendingImage) {
      try {
        // addMeal prepends the meal, so the newest is at index 0
        const mealId = state.meals?.[0]?.id;
        const sess = window.__DIET_FIREBASE_SESSION__ || {};
        if (sess.uid && mealId) {
          await saveMealImageFirestore(String(sess.uid), String(mealId), pendingImage);
          updateMeal(state, mealId, {
            imageFirestore: true,
            imageUrl: null,
            imagePath: null,
          });
        }
      } catch (err) {
        console.warn(err);
        showToast(err?.message || "Photo save failed. Saving the meal without a cloud photo.");
        try {
          const mealId = state.meals?.[0]?.id;
          if (mealId) updateMeal(state, mealId, { imageData: null });
        } catch (e2) {}
      }
    }
    await persist(passwordRef());
    showToast("Meal saved.");
    if (typeof onMealSaved === "function") {
      try {
        onMealSaved();
      } catch (err) {
        console.warn(err);
      }
    }
    form.reset();
    preview.innerHTML = "";
    pendingImage = null;
    const mh = document.getElementById("meal-calories-hint");
    if (mh) {
      mh.hidden = true;
      mh.textContent = "";
    }
    document.querySelectorAll("[data-health-pick]").forEach((b) => b.classList.remove("is-selected"));
    document.getElementById("meal-date").value = todayISODate();
    document.getElementById("meal-time").value = nowTimeLocal();
    syncLogCategoryFromInputs();
  });
}

export function openEditModal(state, mealId, passwordRef, persist, showToast, onClose) {
  const meal = state.meals.find((m) => m.id === mealId || String(m.id) === String(mealId));
  if (!meal) return;
  const modal = document.getElementById("modal-edit");
  const form = document.getElementById("form-edit-meal");
  const dateVal = safeDateInputForEdit(meal.datetime);
  const timeVal = safeTimeInputForEdit(meal.datetime);
  document.getElementById("edit-meal-id").value = meal.id;
  document.getElementById("edit-user").value = meal.userId;
  document.getElementById("edit-title").value = meal.title;
  document.getElementById("edit-date").value = dateVal;
  document.getElementById("edit-time").value = timeVal;
  document.getElementById("edit-calories").value = meal.calories ?? "";
  const editHint = document.getElementById("edit-calories-hint");
  if (editHint) {
    editHint.hidden = true;
    editHint.textContent = "";
  }
  document.getElementById("edit-notes").value = meal.notes || "";
  const editCat = document.getElementById("edit-category");
  if (editCat) {
    editCat.value = coerceMealCategorySelect(meal.category, dateVal, timeVal);
  }
  const prev = document.getElementById("edit-photo-preview");
  const img = meal.imageUrl || meal.imageData;
  if (img) {
    prev.innerHTML = `<img src="${escapeHtml(img)}" alt="" style="max-height:160px;border-radius:12px">`;
  } else {
    prev.innerHTML = "";
  }

  form.querySelectorAll("[data-edit-health]").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.getAttribute("data-edit-health") === meal.health);
  });

  const fileInput = document.getElementById("edit-photo");
  fileInput.value = "";
  let newImage = meal.imageData;
  let newImageUrl = meal.imageUrl || null;

  const onFile = async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      newImage = await fileToCompressedDataUrl(f);
      newImageUrl = null;
      prev.innerHTML = `<img src="${newImage}" alt="" style="max-height:160px;border-radius:12px">`;
    } catch (err) {
      showToast(err.message);
    }
  };
  fileInput.onchange = onFile;

  const editDateEl = document.getElementById("edit-date");
  const editTimeEl = document.getElementById("edit-time");
  const syncEditCategoryFromInputs = () => {
    const el = document.getElementById("edit-category");
    if (!el) return;
    el.value = categoryFromDateAndTimeInputs(editDateEl?.value, editTimeEl?.value);
  };
  if (editDateEl) editDateEl.oninput = syncEditCategoryFromInputs;
  if (editTimeEl) editTimeEl.oninput = syncEditCategoryFromInputs;

  const close = () => {
    modal.hidden = true;
    form.onsubmit = null;
    document.getElementById("btn-delete-meal").onclick = null;
    if (editDateEl) editDateEl.oninput = null;
    if (editTimeEl) editTimeEl.oninput = null;
    onClose?.();
  };

  modal.hidden = false;

  form.onsubmit = async (e) => {
    e.preventDefault();
    let health = null;
    const hSel = form.querySelector("[data-edit-health].is-selected");
    if (hSel) health = hSel.getAttribute("data-edit-health");
    if (!health) {
      showToast("Choose Healthy, Neutral, or Unhealthy.");
      return;
    }

    const date = document.getElementById("edit-date").value;
    const time = document.getElementById("edit-time").value;
    let dt = meal.datetime;
    if (date && time) {
      const parsed = new Date(`${date}T${time}`);
      if (Number.isNaN(parsed.getTime())) {
        showToast("Invalid date or time — check the fields and try again.");
        return;
      }
      dt = parsed.toISOString();
    }

    const updated = updateMeal(state, meal.id, {
      userId: document.getElementById("edit-user").value,
      title: document.getElementById("edit-title").value,
      datetime: dt,
      calories: document.getElementById("edit-calories").value,
      notes: document.getElementById("edit-notes").value,
      health,
      category: coerceMealCategorySelect(document.getElementById("edit-category")?.value, date, time),
      imageData: newImage,
      imageUrl: newImageUrl,
    });
    if (!updated) {
      showToast("That meal is no longer in your log — close and refresh the list.");
      close();
      return;
    }
    if (isFirebaseConfigured() && newImage) {
      try {
        const sess = window.__DIET_FIREBASE_SESSION__ || {};
        if (sess.uid) {
          await saveMealImageFirestore(String(sess.uid), String(meal.id), newImage);
          updateMeal(state, meal.id, {
            imageFirestore: true,
            imageUrl: null,
            imagePath: null,
          });
        }
      } catch (err) {
        console.warn(err);
        showToast(err?.message || "Photo save failed. Saving without a cloud photo.");
        updateMeal(state, meal.id, { imageData: null, imageUrl: null, imagePath: null, imageFirestore: false });
      }
    }
    await persist(passwordRef());
    showToast("Meal updated.");
    close();
  };

  document.getElementById("btn-delete-meal").onclick = async () => {
    if (!confirm("Delete this meal?")) return;
    if (isFirebaseConfigured() && meal.imageFirestore) {
      const sess = window.__DIET_FIREBASE_SESSION__ || {};
      if (sess.uid) await deleteMealImageFirestore(String(sess.uid), String(meal.id));
    }
    deleteMeal(state, meal.id);
    await persist(passwordRef());
    showToast("Meal deleted.");
    close();
  };

  form.querySelectorAll("[data-edit-health]").forEach((btn) => {
    btn.onclick = () => {
      form.querySelectorAll("[data-edit-health]").forEach((b) => b.classList.remove("is-selected"));
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

/** Avoid invalid <input type="date|time"> values (e.g. NaN:NaN) that block form submit. */
function safeDateInputForEdit(iso) {
  if (iso == null || iso === "") return todayISODate();
  const s = String(iso);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return todayISODate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function safeTimeInputForEdit(iso) {
  if (iso == null || iso === "") return nowTimeLocal();
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return nowTimeLocal();
  const hh = d.getHours();
  const mm = d.getMinutes();
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return nowTimeLocal();
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function initLogDefaults() {
  const d = document.getElementById("meal-date");
  const t = document.getElementById("meal-time");
  if (d && !d.value) d.value = todayISODate();
  if (t && !t.value) t.value = nowTimeLocal();
  const cat = document.getElementById("meal-category");
  if (cat && d && t) {
    cat.value = categoryFromDateAndTimeInputs(d.value, t.value);
  }
}

