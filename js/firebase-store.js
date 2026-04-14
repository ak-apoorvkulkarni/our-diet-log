import { getFirebase } from "./firebase.js";
import { createEmptyState, ensureStateShape } from "./models.js";

/**
 * Firestore data model (initial cut):
 * - households/{householdId}
 *     - members: string[] (Firebase Auth UIDs)
 *     - createdAt, updatedAt: server timestamps
 * - households/{householdId}/state/v1
 *     - state: object (app state)
 *     - updatedAt: server timestamp
 */

export function householdIdForUser(uid) {
  // Standalone account uses a personal household id.
  return `u_${uid}`;
}

/**
 * Create an empty household only if it does not exist yet.
 * Important: do not merge `members: [uid]` into an existing doc — that would wipe other members
 * (e.g. after a partner accepts an invite).
 */
export async function ensureHouseholdExists(householdId, uid) {
  const fb = await getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const { sdk, db } = fb;

  const ref = sdk.doc(db, "households", householdId);
  const snap = await sdk.getDoc(ref);
  if (!snap.exists()) {
    await sdk.setDoc(ref, {
      members: [uid],
      slots: { u1: uid },
      profiles: { [uid]: { name: "" } },
      createdAt: sdk.serverTimestamp(),
      updatedAt: sdk.serverTimestamp(),
    });
    return;
  }

  const d = snap.data() || {};
  const members = Array.isArray(d.members) ? d.members.map(String) : [];
  const slots = d.slots && typeof d.slots === "object" ? d.slots : {};
  const me = String(uid || "");
  const inMembers = me && members.includes(me);
  const inSlots =
    me &&
    ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"].some((k) => String(slots[k] || "") === me);
  if (inMembers || inSlots) return;

  // Corrupt / legacy household doc: only self-heal the personal vault id (u_<uid>).
  if (String(householdId) !== householdIdForUser(uid)) {
    throw new Error(
      "Your account is not listed on this household. Sign out, use a fresh invite, or contact support."
    );
  }
  await sdk.setDoc(
    ref,
    {
      members: [uid],
      slots: { u1: uid },
      profiles: {
        ...(typeof d.profiles === "object" && d.profiles ? d.profiles : {}),
        [uid]: typeof d.profiles === "object" && d.profiles?.[uid] ? d.profiles[uid] : { name: "" },
      },
      updatedAt: sdk.serverTimestamp(),
    },
    { merge: true }
  );
}

/** Household id saved on /users/{uid} after first session or invite join (used on refresh). */
export async function loadUserHouseholdIdFromProfile(uid) {
  const fb = await getFirebase();
  if (!fb) return null;
  const { sdk, db } = fb;
  const snap = await sdk.getDoc(sdk.doc(db, "users", uid));
  if (!snap.exists()) return null;
  const hid = snap.data()?.householdId;
  return typeof hid === "string" && hid.trim() ? hid.trim() : null;
}

export async function loadHouseholdMeta(householdId) {
  const fb = await getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const { sdk, db } = fb;
  const ref = sdk.doc(db, "households", householdId);
  const snap = await sdk.getDoc(ref);
  if (!snap.exists()) return null;
  const d = snap.data() || {};
  return {
    members: Array.isArray(d.members) ? d.members : [],
    slots: d.slots && typeof d.slots === "object" ? d.slots : {},
    profiles: d.profiles && typeof d.profiles === "object" ? d.profiles : {},
  };
}

export async function loadHouseholdState(householdId) {
  const fb = await getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const { sdk, db } = fb;
  const ref = sdk.doc(db, "households", householdId, "state", "v1");
  const snap = await sdk.getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return ensureStateShape(data?.state);
}

export async function saveHouseholdState(householdId, state) {
  const fb = await getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const { sdk, db } = fb;
  const ref = sdk.doc(db, "households", householdId, "state", "v1");
  await sdk.setDoc(
    ref,
    {
      state: ensureStateShape(state),
      updatedAt: sdk.serverTimestamp(),
    },
    { merge: true }
  );
  await sdk.setDoc(
    sdk.doc(db, "households", householdId),
    { updatedAt: sdk.serverTimestamp() },
    { merge: true }
  );
}

export async function ensureUserProfile(uid, { householdId, name } = {}) {
  const fb = await getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const { sdk, db } = fb;
  const ref = sdk.doc(db, "users", uid);
  const patch = {};
  if (householdId != null) patch.householdId = String(householdId || "");
  if (name != null) patch.name = String(name || "");
  patch.updatedAt = sdk.serverTimestamp();
  await sdk.setDoc(ref, patch, { merge: true });
}

export async function loadUserState(uid) {
  const fb = await getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const { sdk, db } = fb;
  const ref = sdk.doc(db, "users", uid, "state", "v1");
  const snap = await sdk.getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  return ensureStateShape(data?.state);
}

/** Max ~900KB UTF-8 per image doc (Firestore doc limit 1 MiB). */
const MEAL_IMAGE_MAX_BYTES = 900000;

export function stripFirebaseMealImagesForSave(state) {
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

export async function saveMealImageFirestore(uid, mealId, dataUrl) {
  const fb = await getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const { sdk, db } = fb;
  const s = String(dataUrl || "");
  const bytes = new TextEncoder().encode(s).length;
  if (bytes > MEAL_IMAGE_MAX_BYTES) {
    throw new Error("Photo is still too large. Try a smaller image or lower quality.");
  }
  const ref = sdk.doc(db, "users", uid, "mealImages", String(mealId));
  await sdk.setDoc(
    ref,
    {
      dataUrl: s,
      updatedAt: sdk.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function loadMealImageFirestore(uid, mealId) {
  const fb = await getFirebase();
  if (!fb) return null;
  const { sdk, db } = fb;
  const ref = sdk.doc(db, "users", uid, "mealImages", String(mealId));
  const snap = await sdk.getDoc(ref);
  if (!snap.exists()) return null;
  const d = snap.data() || {};
  return typeof d.dataUrl === "string" ? d.dataUrl : null;
}

export async function deleteMealImageFirestore(uid, mealId) {
  const fb = await getFirebase();
  if (!fb) return;
  const { sdk, db } = fb;
  try {
    await sdk.deleteDoc(sdk.doc(db, "users", uid, "mealImages", String(mealId)));
  } catch (e) {
    console.warn("deleteMealImageFirestore:", e);
  }
}

export async function deleteAllMealImagesFirestore(uid) {
  const fb = await getFirebase();
  if (!fb) return;
  const { sdk, db } = fb;
  if (!sdk.collection || !sdk.getDocs) return;
  try {
    const col = sdk.collection(db, "users", uid, "mealImages");
    const snap = await sdk.getDocs(col);
    await Promise.allSettled(snap.docs.map((d) => sdk.deleteDoc(d.ref)));
  } catch (e) {
    console.warn("deleteAllMealImagesFirestore:", e);
  }
}

/** Load image blobs into state.meals for display (mutates state). */
export async function hydrateMealImagesForState(uid, state) {
  if (!state?.meals?.length) return;
  const fb = await getFirebase();
  if (!fb) return;
  for (const m of state.meals) {
    if (!m?.id || !m.imageFirestore || m.imageData) continue;
    const dataUrl = await loadMealImageFirestore(uid, m.id);
    if (dataUrl) m.imageData = dataUrl;
  }
}

export async function saveUserState(uid, householdId, state) {
  const fb = await getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const { sdk, db } = fb;
  const ref = sdk.doc(db, "users", uid, "state", "v1");
  await sdk.setDoc(
    ref,
    {
      householdId: String(householdId || ""),
      state: ensureStateShape(state),
      updatedAt: sdk.serverTimestamp(),
    },
    { merge: true }
  );
  await ensureUserProfile(uid, { householdId });
}

export async function partnerUidFromHousehold(householdId, myUid) {
  const meta = await loadHouseholdMeta(householdId);
  const slots = meta?.slots || {};
  const u1 = String(slots.u1 || "");
  const me = String(myUid || "");
  if (!u1 || !me) return null;
  const slotOrder = ["u2", "u3", "u4", "u5", "u6", "u7", "u8"];
  if (me === u1) {
    for (const k of slotOrder) {
      const uid = slots[k];
      if (uid) return String(uid);
    }
    return null;
  }
  if (u1 && me !== u1) return u1;
  return null;
}

/**
 * Household members other than the owner (for Settings: names + per-partner remove).
 * Uses `members` when present; falls back to `slots` u2–u8.
 */
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
    const name = String(profiles[uid]?.name || "").trim() || "Partner";
    out.push({ uid, name });
  }
  if (out.length === 0) {
    for (const k of slotOrder) {
      const uid = slots[k];
      if (!uid || String(uid) === owner || seen.has(String(uid))) continue;
      seen.add(String(uid));
      const name = String(profiles[uid]?.name || "").trim() || "Partner";
      out.push({ uid: String(uid), name });
    }
  }
  return out;
}

/** Everyone in the household except the viewer (for “Connected” names in Settings). */
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
    out.push({
      uid,
      name: String(profiles[uid]?.name || "").trim() || "Partner",
    });
  }
  if (out.length > 0) return out;

  const order = ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"];
  for (const k of order) {
    const uid = slots[k];
    if (!uid || String(uid) === me || seen.has(String(uid))) continue;
    seen.add(String(uid));
    out.push({
      uid: String(uid),
      name: String(profiles[uid]?.name || "").trim() || "Partner",
    });
  }
  return out;
}

export async function createInvite(householdId, fromUid, toEmail) {
  const fb = await getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const { sdk, db } = fb;

  const token = `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  await sdk.setDoc(sdk.doc(db, "invites", token), {
    householdId,
    fromUid,
    toEmail: String(toEmail || "").trim().toLowerCase(),
    createdAt: sdk.serverTimestamp(),
    usedAt: null,
    usedBy: null,
  });
  return token;
}

export async function acceptInvite(token, uid, displayName, email) {
  const fb = await getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const { sdk, db } = fb;

  const invRef = sdk.doc(db, "invites", token);
  const invSnap = await sdk.getDoc(invRef);
  if (!invSnap.exists()) throw new Error("Invite not found.");
  const inv = invSnap.data();
  const expectedEmail = String(inv.toEmail || "").trim().toLowerCase();
  const userEmail = String(email || "").trim().toLowerCase();
  if (expectedEmail && userEmail && expectedEmail !== userEmail) {
    throw new Error("This invite was created for a different email address.");
  }

  const householdId = String(inv.householdId || "");
  if (!householdId) throw new Error("Invite missing household id.");
  const usedBy = String(inv.usedBy || "");
  if (inv.usedAt) {
    // Retry-safe accept: if the same signed-in user opens the invite again,
    // treat it as already joined and return the linked household.
    if (usedBy && usedBy === String(uid || "")) {
      await ensureUserProfile(uid, {
        householdId,
        name: String(displayName || "").trim(),
      });
      return householdId;
    }
    throw new Error("Invite already used by another account. Ask for a fresh invite.");
  }

  const hhRef = sdk.doc(db, "households", householdId);
  const hhSnap = await sdk.getDoc(hhRef);
  const data = hhSnap.exists() ? hhSnap.data() : {};
  const members = Array.isArray(data?.members) ? data.members : [];
  const nextMembers = [...new Set([...members, uid])];
  const slots = data?.slots && typeof data.slots === "object" ? { ...data.slots } : {};
  if (!slots.u1) slots.u1 = nextMembers[0] || uid;
  if (String(uid) !== String(slots.u1 || "")) {
    const slotKeys = ["u2", "u3", "u4", "u5", "u6", "u7", "u8"];
    let placed = false;
    for (const k of slotKeys) {
      if (!slots[k]) {
        slots[k] = uid;
        placed = true;
        break;
      }
    }
    if (!placed) {
      throw new Error("This household already has the maximum number of members.");
    }
  }
  const profiles = data?.profiles && typeof data.profiles === "object" ? { ...data.profiles } : {};
  profiles[uid] = { name: String(displayName || "").trim() };
  await sdk.setDoc(
    hhRef,
    { members: nextMembers, slots, profiles, updatedAt: sdk.serverTimestamp() },
    { merge: true }
  );
  await sdk.setDoc(invRef, { usedAt: sdk.serverTimestamp(), usedBy: uid }, { merge: true });

  // So partner reads (household membership) and later sessions resolve the shared household.
  await ensureUserProfile(uid, {
    householdId,
    name: String(displayName || "").trim(),
  });

  return householdId;
}

export async function removePartner(householdId, actorUid, targetPartnerUid) {
  const fb = await getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const { sdk, db } = fb;

  const target = String(targetPartnerUid || "").trim();
  if (!target) throw new Error("Choose a partner to remove.");

  const hhRef = sdk.doc(db, "households", householdId);
  const hhSnap = await sdk.getDoc(hhRef);
  if (!hhSnap.exists()) throw new Error("Household not found.");
  const data = hhSnap.data() || {};
  const slots = data?.slots && typeof data.slots === "object" ? { ...data.slots } : {};
  if (!slots.u1) throw new Error("Household missing owner slot.");
  const owner = String(slots.u1);
  if (owner !== String(actorUid)) {
    throw new Error("Only the household owner can remove a partner.");
  }
  if (target === owner) {
    throw new Error("You cannot remove the household owner.");
  }

  const members = Array.isArray(data.members) ? data.members.map(String) : [];
  const partners = listPartnerEntries(data, owner);
  if (!partners.some((p) => p.uid === target)) {
    throw new Error("That person is not a partner in this household.");
  }

  let nextMembers = members.filter((m) => m && m !== target);
  if (members.length === 0) {
    nextMembers = [owner, ...partners.map((p) => p.uid)].filter((u) => u && u !== target);
  } else if (!nextMembers.includes(owner)) {
    nextMembers.unshift(owner);
  }
  nextMembers = [...new Set(nextMembers)].filter(Boolean);

  const nextSlots = { ...slots };
  for (const k of Object.keys(nextSlots)) {
    if (k === "u1") continue;
    if (String(nextSlots[k]) === target) {
      delete nextSlots[k];
    }
  }
  nextSlots.u1 = owner;

  const profiles = data?.profiles && typeof data.profiles === "object" ? { ...data.profiles } : {};
  delete profiles[target];

  await sdk.setDoc(
    hhRef,
    {
      members: nextMembers,
      slots: nextSlots,
      profiles,
      updatedAt: sdk.serverTimestamp(),
    },
    { merge: true }
  );
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

