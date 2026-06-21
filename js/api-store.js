import { createEmptyState, ensureStateShape } from "./models.js";
import { apiFetch } from "./api-client.js";

/**
 * Server-backed persistence (SQLite via REST API).
 * Mirrors the former Firestore client API.
 */

export function householdIdForUser(uid) {
  return `u_${uid}`;
}

export async function ensureHouseholdExists(householdId, uid) {
  const res = await apiFetch(`/api/households/${encodeURIComponent(householdId)}/ensure`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await _err(res));
}

export async function loadUserHouseholdIdFromProfile(uid) {
  const res = await apiFetch("/api/users/me/profile");
  if (!res.ok) return null;
  const data = await res.json();
  const hid = data?.household_id;
  return typeof hid === "string" && hid.trim() ? hid.trim() : null;
}

export async function loadHouseholdMeta(householdId) {
  const res = await apiFetch(`/api/households/${encodeURIComponent(householdId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await _err(res));
  return res.json();
}

export async function loadHouseholdState(householdId) {
  const res = await apiFetch(
    `/api/households/${encodeURIComponent(householdId)}/legacy-state`
  );
  if (!res.ok) return null;
  const data = await res.json();
  return ensureStateShape(data?.state);
}

export async function ensureUserProfile(uid, { householdId, name } = {}) {
  const patch = {};
  if (householdId != null) patch.household_id = String(householdId || "");
  if (name != null) patch.display_name = String(name || "");
  const res = await apiFetch("/api/users/me/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await _err(res));
}

export async function loadUserState(uid) {
  const path =
    uid && (await _myUid()) !== uid
      ? `/api/users/${encodeURIComponent(uid)}/state`
      : "/api/users/me/state";
  const res = await apiFetch(path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await _err(res));
  const data = await res.json();
  if (data?.state == null) return null;
  return ensureStateShape(data.state);
}

export function stripServerMealImagesForSave(state) {
  const s = ensureStateShape(state);
  return {
    ...s,
    meals: s.meals.map((m) => {
      if (!m || !m.imageFirestore) return m;
      const { imageData, ...rest } = m;
      return rest;
    }),
  };
}

/** @deprecated use stripServerMealImagesForSave */
export const stripFirebaseMealImagesForSave = stripServerMealImagesForSave;

export async function saveMealImageServer(uid, mealId, dataUrl) {
  const res = await apiFetch(`/api/users/me/meals/${encodeURIComponent(mealId)}/image`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data_url: String(dataUrl || "") }),
  });
  if (!res.ok) throw new Error(await _err(res));
}

export const saveMealImageFirestore = saveMealImageServer;

export async function loadMealImageServer(uid, mealId) {
  const res = await apiFetch(
    `/api/users/${encodeURIComponent(uid)}/meals/${encodeURIComponent(mealId)}/image`
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await _err(res));
  const data = await res.json();
  return typeof data?.data_url === "string" ? data.data_url : null;
}

export const loadMealImageFirestore = loadMealImageServer;

export async function deleteMealImageServer(uid, mealId) {
  await apiFetch(`/api/users/me/meals/${encodeURIComponent(mealId)}/image`, {
    method: "DELETE",
  });
}

export const deleteMealImageFirestore = deleteMealImageServer;

export async function deleteAllMealImagesServer() {
  await apiFetch("/api/users/me/meal-images", {
    method: "DELETE",
  });
}

export const deleteAllMealImagesFirestore = deleteAllMealImagesServer;

export async function hydrateMealImagesForState(uid, state) {
  if (!state?.meals?.length) return;
  for (const m of state.meals) {
    if (!m?.id || !m.imageFirestore || m.imageData) continue;
    const dataUrl = await loadMealImageServer(uid, m.id);
    if (dataUrl) m.imageData = dataUrl;
  }
}

export async function saveUserState(uid, householdId, state) {
  const res = await apiFetch("/api/users/me/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      household_id: String(householdId || ""),
      state: ensureStateShape(state),
    }),
  });
  if (!res.ok) throw new Error(await _err(res));
  await ensureUserProfile(uid, { householdId });
}

export async function partnerUidFromHousehold(householdId, myUid) {
  const res = await apiFetch(`/api/households/${encodeURIComponent(householdId)}/partner`);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.partner_uid || null;
}

export function listPartnerEntries(meta, ownerUid) {
  const owner = String(ownerUid || "");
  const profiles = meta?.profiles && typeof meta.profiles === "object" ? meta.profiles : {};
  const members = Array.isArray(meta?.members) ? meta.members.map(String) : [];
  const slots = meta?.slots && typeof meta.slots === "object" ? meta.slots : {};
  const slotOrder = ["u2", "u3", "u4", "u5", "u6", "u7", "u8"];
  const out = [];
  const seen = new Set();

  for (const uid of members) {
    if (!uid || uid === owner || seen.has(uid)) continue;
    seen.add(uid);
    out.push({ uid, name: String(profiles[uid]?.name || "").trim() || "Partner" });
  }
  if (out.length === 0) {
    for (const k of slotOrder) {
      const uid = slots[k];
      if (!uid || String(uid) === owner || seen.has(String(uid))) continue;
      seen.add(String(uid));
      out.push({ uid: String(uid), name: String(profiles[uid]?.name || "").trim() || "Partner" });
    }
  }
  return out;
}

export function listHouseholdConnections(meta, viewerUid) {
  const me = String(viewerUid || "");
  const profiles = meta?.profiles && typeof meta.profiles === "object" ? meta.profiles : {};
  const members = Array.isArray(meta?.members) ? meta.members.map(String) : [];
  const slots = meta?.slots && typeof meta.slots === "object" ? meta.slots : {};
  const out = [];
  const seen = new Set();

  for (const uid of members) {
    if (!uid || uid === me || seen.has(uid)) continue;
    seen.add(uid);
    out.push({ uid, name: String(profiles[uid]?.name || "").trim() || "Partner" });
  }
  if (out.length > 0) return out;

  const order = ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"];
  for (const k of order) {
    const uid = slots[k];
    if (!uid || String(uid) === me || seen.has(String(uid))) continue;
    seen.add(String(uid));
    out.push({ uid: String(uid), name: String(profiles[uid]?.name || "").trim() || "Partner" });
  }
  return out;
}

export async function createInvite(householdId, fromUid, toUsername) {
  const res = await apiFetch(`/api/households/${encodeURIComponent(householdId)}/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to_username: String(toUsername || "").trim().toLowerCase() }),
  });
  if (!res.ok) throw new Error(await _err(res));
  const data = await res.json();
  return data.token;
}

export async function acceptInvite(token, uid, displayName, username) {
  const res = await apiFetch(`/api/invites/${encodeURIComponent(token)}/accept`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await _err(res));
  const data = await res.json();
  return String(data.household_id || "");
}

export async function removePartner(householdId, actorUid, targetPartnerUid) {
  const res = await apiFetch(
    `/api/households/${encodeURIComponent(householdId)}/partners/remove`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partner_uid: targetPartnerUid }),
    }
  );
  if (!res.ok) throw new Error(await _err(res));
}

export function buildDefaultStateForUser(displayName) {
  const s = createEmptyState();
  const name = String(displayName || "").trim();
  if (name) {
    const u1 = s.users.find((u) => u.id === "u1");
    if (u1) u1.name = name;
  }
  return s;
}

let _cachedMyUid = null;

async function _myUid() {
  if (_cachedMyUid) return _cachedMyUid;
  const res = await apiFetch("/api/auth/me");
  if (!res.ok) return null;
  const data = await res.json();
  _cachedMyUid = data?.id || null;
  return _cachedMyUid;
}

async function _err(res) {
  try {
    const data = await res.json();
    const d = data?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0]?.msg) return d[0].msg;
    return `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}
