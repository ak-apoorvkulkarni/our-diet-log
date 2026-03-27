/**
 * Push / pull encrypted vault to Supabase so two people can share one log (same password).
 */
import { isSupabaseConfigured, getSupabaseUrl, getSupabaseAnonKey } from "./sync-config.js";
import {
  applyBackupToLocalStorage,
  decryptVaultFromParts,
  getVaultSnapshotForSync,
  hasStoredVault,
} from "./storage.js";
import { ensureStateShape, mergeAppState } from "./models.js";

const TABLE = "household_vaults";

let supabasePromise;
/** Suppress realtime echo right after our own push (ms since epoch). */
let lastOwnPushAt = 0;

function markVaultPushed() {
  lastOwnPushAt = Date.now();
}

async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!supabasePromise) {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    supabasePromise = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabasePromise;
}

/** Deterministic row id from shared password — same on Apoorv's and Aditi's phones. */
export async function deriveHouseholdRowId(password) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode("diet-tracker-household-v1|" + password));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pullVaultRow(householdId) {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from(TABLE).select("*").eq("id", householdId).maybeSingle();
  if (error) {
    console.warn("Supabase pull:", error.message);
    return null;
  }
  return data;
}

export async function pushVaultRow(householdId) {
  const snap = getVaultSnapshotForSync();
  if (!snap.salt || !snap.payload) return;
  const sb = await getSupabase();
  if (!sb) return;
  const iters = snap.pbkdf2Iterations != null ? parseInt(snap.pbkdf2Iterations, 10) : null;
  const { error } = await sb.from(TABLE).upsert(
    {
      id: householdId,
      salt_b64: snap.salt,
      payload: snap.payload,
      pbkdf2_iterations: Number.isNaN(iters) ? null : iters,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) {
    console.warn("Supabase push:", error.message);
  } else {
    markVaultPushed();
  }
}

/**
 * Live updates when the other person saves (e.g. different countries / time zones).
 * Merges remote into local state; caller should persist (and push) so both stay in sync.
 */
export async function subscribeHouseholdVaultRealtime(householdId, password, { getState, onMerged }) {
  const sb = await getSupabase();
  if (!sb) return () => {};

  let debounceTimer;

  const handleChange = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (Date.now() - lastOwnPushAt < 1000) return;
      const row = await pullVaultRow(householdId);
      if (!row) return;
      const payload =
        typeof row.payload === "string" ? row.payload : JSON.stringify(row.payload);
      let remoteState;
      try {
        remoteState = await decryptVaultFromParts(
          password,
          row.salt_b64,
          payload,
          row.pbkdf2_iterations
        );
      } catch (e) {
        console.warn("Realtime decrypt failed:", e);
        return;
      }
      if (!remoteState) return;
      const merged = mergeAppState(getState(), remoteState);
      if (JSON.stringify(getState()) === JSON.stringify(merged)) return;
      await onMerged(merged);
    }, 450);
  };

  const channel = sb
    .channel(`vault-live:${householdId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: TABLE,
        filter: `id=eq.${householdId}`,
      },
      handleChange
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: TABLE,
        filter: `id=eq.${householdId}`,
      },
      handleChange
    )
    .subscribe();

  return () => {
    clearTimeout(debounceTimer);
    sb.removeChannel(channel);
  };
}

/**
 * New device with no local vault: download encrypted blob from cloud before unlock.
 */
export async function hydrateLocalFromCloudIfEmpty(password) {
  if (!isSupabaseConfigured() || hasStoredVault()) return false;
  const hid = await deriveHouseholdRowId(password);
  const row = await pullVaultRow(hid);
  if (!row) return false;
  const payload =
    typeof row.payload === "string" ? row.payload : JSON.stringify(row.payload);
  applyBackupToLocalStorage({
    salt: row.salt_b64,
    payload,
    pbkdf2Iterations: row.pbkdf2_iterations,
  });
  return true;
}

/**
 * After local decrypt: merge with remote vault and save + push.
 */
export async function mergeRemoteVault(password, localState) {
  if (!isSupabaseConfigured()) return ensureStateShape(localState);
  const hid = await deriveHouseholdRowId(password);
  const row = await pullVaultRow(hid);
  if (!row) {
    return ensureStateShape(localState);
  }
  const payload =
    typeof row.payload === "string" ? row.payload : JSON.stringify(row.payload);
  let remoteState;
  try {
    remoteState = await decryptVaultFromParts(
      password,
      row.salt_b64,
      payload,
      row.pbkdf2_iterations
    );
  } catch (e) {
    console.warn("Could not decrypt remote vault for merge:", e);
    return ensureStateShape(localState);
  }
  if (!remoteState) return ensureStateShape(localState);
  return mergeAppState(localState, remoteState);
}

export { isSupabaseConfigured };
