/**
 * Log meal form + meal grid + edit modal.
 */
import { addMeal, updateMeal, deleteMeal, sortMealsDesc, filterMeals } from "../meals-store.js";
import { fileToCompressedDataUrl } from "../image-utils.js";
import { guessCalories } from "../calorie-estimate.js";
import { isServerMode } from "../server-config.js";
import { deleteMealImageFirestore, saveMealImageFirestore } from "../api-store.js";
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

function collectMealItemsFromList(listEl) {
  if (!listEl) return [];
  return [...listEl.querySelectorAll(".meal-item-row__input")]
    .map((el) => String(el.value || "").trim())
    .filter(Boolean);
}

function renderMealItemsRows(listEl, values) {
  if (!listEl) return;
  const safe = Array.isArray(values) ? values.filter((x) => String(x || "").trim()) : [];
  const rows = safe.length ? safe : [""];
  listEl.innerHTML = rows
    .map(
      (v, i) => `
      <div class="meal-item-row">
        <input type="text" class="meal-item-row__input" placeholder="e.g. Palak Paneer" value="${escapeHtml(v)}" />
        <button type="button" class="btn btn--ghost btn--sm meal-item-row__remove" ${
          rows.length === 1 ? "disabled" : ""
        } aria-label="Remove item">−</button>
      </div>`
    )
    .join("");
}

function addMealItemRow(listEl) {
  if (!listEl) return;
  const row = document.createElement("div");
  row.className = "meal-item-row";
  row.innerHTML = `
    <input type="text" class="meal-item-row__input" placeholder="e.g. Rice" />
    <button type="button" class="btn btn--ghost btn--sm meal-item-row__remove" aria-label="Remove item">−</button>
  `;
  listEl.appendChild(row);
  syncMealItemRemoveButtons(listEl);
  row.querySelector(".meal-item-row__input")?.focus();
}

function syncMealItemRemoveButtons(listEl) {
  if (!listEl) return;
  const rows = [...listEl.querySelectorAll(".meal-item-row")];
  rows.forEach((row) => {
    const btn = row.querySelector(".meal-item-row__remove");
    if (!btn) return;
    btn.disabled = rows.length <= 1;
  });
}

function bindMealItemsList(listEl, addBtnEl) {
  if (!listEl || !addBtnEl) return;
  if (listEl.dataset.bound === "1") return;
  listEl.dataset.bound = "1";
  addBtnEl.addEventListener("click", () => addMealItemRow(listEl));
  listEl.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const btn = target.closest(".meal-item-row__remove");
    if (!btn) return;
    const row = btn.closest(".meal-item-row");
    if (!row) return;
    row.remove();
    if (!listEl.querySelector(".meal-item-row")) {
      renderMealItemsRows(listEl, [""]);
    }
    syncMealItemRemoveButtons(listEl);
  });
}

function mealTitleDisplay(m) {
  const items = Array.isArray(m.items) ? m.items.filter(Boolean) : [];
  if (items.length <= 1) return m.title || items[0] || "Meal";
  return `${items[0]} +${items.length - 1} item${items.length - 1 === 1 ? "" : "s"}`;
}

function startOfWeekMondayLocal(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt;
}

function dayKeyLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatWeekHeading(weekStart) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const startText = weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endText = weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `Week: ${startText} - ${endText}`;
}

function formatDayHeading(d) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function groupMealsByWeekAndDay(meals) {
  const weeks = [];
  const weekMap = new Map();
  for (const meal of meals) {
    const dt = new Date(meal.datetime);
    const weekStart = startOfWeekMondayLocal(dt);
    const weekKey = dayKeyLocal(weekStart);
    let weekGroup = weekMap.get(weekKey);
    if (!weekGroup) {
      weekGroup = {
        key: weekKey,
        weekStart,
        days: [],
        dayMap: new Map(),
      };
      weekMap.set(weekKey, weekGroup);
      weeks.push(weekGroup);
    }
    const dayKey = dayKeyLocal(dt);
    let dayGroup = weekGroup.dayMap.get(dayKey);
    if (!dayGroup) {
      dayGroup = { key: dayKey, date: new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()), meals: [] };
      weekGroup.dayMap.set(dayKey, dayGroup);
      weekGroup.days.push(dayGroup);
    }
    dayGroup.meals.push(meal);
  }
  return weeks;
}

function renderMealCard(state, m, canEditMeal) {
  const editable = typeof canEditMeal === "function" ? Boolean(canEditMeal(m)) : true;
  const btnText = editable ? "Edit details" : "View details";
  const btnAttrs = editable ? `data-edit="${m.id}"` : `data-edit="${m.id}" disabled`;
  const imageSrc = m.imageUrl || m.imageData;
  return `
    <article class="meal-card${imageSrc ? " meal-card--has-thumb" : ""}" data-id="${m.id}">
      <div class="meal-card__body">
        ${
          imageSrc
            ? `<button type="button" class="meal-card__thumb-btn" data-meal-image="${escapeHtml(imageSrc)}" aria-label="View meal photo"><img class="meal-card__thumb" src="${escapeHtml(imageSrc)}" alt=""></button>`
            : ""
        }
        <h3 class="meal-card__title">${escapeHtml(mealTitleDisplay(m))}</h3>
        ${
          Array.isArray(m.items) && m.items.length > 1
            ? `<div class="meal-card__items">${escapeHtml(m.items.join(", "))}</div>`
            : ""
        }
        <div class="meal-card__meta">
          ${escapeHtml(userName(state, m.userId))} · ${escapeHtml(
            labelForMealCategory(m.category || categoryFromLocalTime(new Date(m.datetime)))
          )} · ${formatWhen(m.datetime)}
          ${m.calories != null ? ` · ${m.calories} kcal` : ""}
        </div>
        <div style="margin-bottom:0.5rem">${healthBadge(m.health)}</div>
        <button type="button" class="btn btn--secondary" ${btnAttrs} style="width:100%">${btnText}</button>
      </div>
    </article>`;
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
  const grouped = groupMealsByWeekAndDay(list);
  container.innerHTML = `<div class="meal-log-groups">${grouped
    .map(
      (week) => `
      <section class="meal-log-week">
        <h3 class="meal-log-week__title">${escapeHtml(formatWeekHeading(week.weekStart))}</h3>
        ${week.days
          .map(
            (day) => `
            <div class="meal-log-day">
              <h4 class="meal-log-day__title">${escapeHtml(formatDayHeading(day.date))}</h4>
              <div class="meal-grid">${day.meals.map((m) => renderMealCard(state, m, canEditMeal)).join("")}</div>
            </div>`
          )
          .join("")}
      </section>`
    )
    .join("")}</div>`;

  container.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => onEdit(btn.getAttribute("data-edit")));
  });
  container.querySelectorAll("[data-meal-image]").forEach((btn) => {
    btn.addEventListener("click", () => showMealImageOverlay(btn.getAttribute("data-meal-image")));
  });
}

function ensureMealImageOverlay() {
  let overlay = document.getElementById("meal-image-overlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "meal-image-overlay";
  overlay.className = "meal-image-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="meal-image-overlay__backdrop" data-close-meal-image="1"></div>
    <figure class="meal-image-overlay__panel" role="dialog" aria-modal="true" aria-label="Meal photo preview">
      <button type="button" class="meal-image-overlay__close" data-close-meal-image="1" aria-label="Close image preview">×</button>
      <img class="meal-image-overlay__img" alt="Meal photo preview">
    </figure>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-close-meal-image]")) {
      hideMealImageOverlay();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) {
      hideMealImageOverlay();
    }
  });
  return overlay;
}

function showMealImageOverlay(src) {
  if (!src) return;
  const overlay = ensureMealImageOverlay();
  const img = overlay.querySelector(".meal-image-overlay__img");
  if (img instanceof HTMLImageElement) {
    img.src = src;
  }
  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function hideMealImageOverlay() {
  const overlay = document.getElementById("meal-image-overlay");
  if (!overlay) return;
  const img = overlay.querySelector(".meal-image-overlay__img");
  if (img instanceof HTMLImageElement) img.src = "";
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
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
  let logSubmitInFlight = false;
  const mealItemsList = document.getElementById("meal-items-list");
  const mealItemsAddBtn = document.getElementById("btn-add-meal-item");
  bindMealItemsList(mealItemsList, mealItemsAddBtn);
  renderMealItemsRows(mealItemsList, [""]);

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
      getTitle: () => ({ value: collectMealItemsFromList(mealItemsList).join("\n") }),
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
      getTitle: () => ({
        value: collectMealItemsFromList(document.getElementById("edit-meal-items-list")).join("\n"),
      }),
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
    renderMealItemsRows(mealItemsList, [""]);
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
      mealItemsList?.querySelector(".meal-item-row__input")?.focus();
    });
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (logSubmitInFlight) return;
    const userId = document.getElementById("meal-user")?.value || "u1";
    const items = collectMealItemsFromList(mealItemsList);
    if (!items.length) {
      showToast("Add at least one food item.");
      mealItemsList?.querySelector(".meal-item-row__input")?.focus();
      return;
    }
    const date = document.getElementById("meal-date").value;
    const time = document.getElementById("meal-time").value;
    const calories = document.getElementById("meal-calories").value;
    const notes = document.getElementById("meal-notes").value;
    const category = document.getElementById("meal-category")?.value;
    let health = null;
    const sel = form.querySelector("[data-health-pick].is-selected");
    if (sel) health = sel.getAttribute("data-health-pick");
    if (!health) {
      showToast("Choose Healthy, Neutral, or Unhealthy.");
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    logSubmitInFlight = true;
    if (submitBtn) submitBtn.disabled = true;
    try {
      const dt = date && time ? new Date(`${date}T${time}`) : new Date();
      const added = addMeal(state, {
        userId,
        datetime: dt.toISOString(),
        title: items[0],
        items,
        calories,
        notes,
        health,
        category,
        imageData: pendingImage,
        imageUrl: null,
      });
      if (isServerMode() && pendingImage) {
        try {
          const mealId = added?.id || state.meals?.[0]?.id;
          const sess = window.__DIET_CLOUD_SESSION__ || {};
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
            const mealId = added?.id || state.meals?.[0]?.id;
            if (mealId) updateMeal(state, mealId, { imageData: null });
          } catch (e2) {}
        }
      }
      const saved = await persist(passwordRef());
      if (!saved) {
        deleteMeal(state, added.id);
        return;
      }
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
      renderMealItemsRows(mealItemsList, [""]);
      const mh = document.getElementById("meal-calories-hint");
      if (mh) {
        mh.hidden = true;
        mh.textContent = "";
      }
      document.querySelectorAll("[data-health-pick]").forEach((b) => b.classList.remove("is-selected"));
      document.getElementById("meal-date").value = todayISODate();
      document.getElementById("meal-time").value = nowTimeLocal();
      syncLogCategoryFromInputs();
    } finally {
      logSubmitInFlight = false;
      if (submitBtn) submitBtn.disabled = false;
    }
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
  const editUser = document.getElementById("edit-user");
  if (editUser) editUser.value = meal.userId || "u1";
  const editMealItemsList = document.getElementById("edit-meal-items-list");
  const editMealItemsAddBtn = document.getElementById("btn-add-edit-meal-item");
  bindMealItemsList(editMealItemsList, editMealItemsAddBtn);
  renderMealItemsRows(
    editMealItemsList,
    Array.isArray(meal.items) && meal.items.length ? meal.items : [meal.title]
  );
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

  let editSaving = false;
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (editSaving) return;
    let health = null;
    const hSel = form.querySelector("[data-edit-health].is-selected");
    if (hSel) health = hSel.getAttribute("data-edit-health");
    if (!health) {
      showToast("Choose Healthy, Neutral, or Unhealthy.");
      return;
    }

    const editSubmitBtn = form.querySelector('button[type="submit"]');
    editSaving = true;
    if (editSubmitBtn) editSubmitBtn.disabled = true;
    try {
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
      items: collectMealItemsFromList(editMealItemsList),
      userId: document.getElementById("edit-user")?.value || meal.userId || "u1",
      title: collectMealItemsFromList(editMealItemsList)[0] || meal.title,
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
    if (isServerMode() && newImage) {
      try {
        const sess = window.__DIET_CLOUD_SESSION__ || {};
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
    if (!(await persist(passwordRef()))) return;
    showToast("Meal updated.");
    close();
    } finally {
      editSaving = false;
      if (editSubmitBtn) editSubmitBtn.disabled = false;
    }
  };

  document.getElementById("btn-delete-meal").onclick = async () => {
    if (!confirm("Delete this meal?")) return;
    if (isServerMode() && meal.imageFirestore) {
      const sess = window.__DIET_CLOUD_SESSION__ || {};
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

