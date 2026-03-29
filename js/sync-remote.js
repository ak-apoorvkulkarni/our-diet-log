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
/** Avoid infinite “Creating…” if esm.sh / Supabase never responds (firewall, ad block, offline). */
const CLOUD_HYDRATE_TIMEOUT_MS = 18_000;

/**
 * Single flight: first successful load wins; import timeout / failure → null forever for this session
 * so every caller (auth, push, pull, realtime) never hangs on esm.sh / network.
 */
let supabaseClientPromise;

/** Suppress realtime echo right after our own push (ms since epoch). */
let lastOwnPushAt = 0;

function markVaultPushed() {
  lastOwnPushAt = Date.now();
}

async function loadSupabaseClient() {
  try {
    const { createClient } = await Promise.race([
      import("https://esm.sh/@supabase/supabase-js@2.45.0"),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("SUPABASE_IMPORT_TIMEOUT")), CLOUD_HYDRATE_TIMEOUT_MS);
      }),
    ]);
    return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (e) {
    const msg = e?.message === "SUPABASE_IMPORT_TIMEOUT" ? "timed out" : e?.message || String(e);
    console.warn("Supabase client unavailable (" + msg + "). App works offline on this device.");
    return null;
  }
}

async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!supabaseClientPromise) {
    supabaseClientPromise = loadSupabaseClient();
  }
  return supabaseClientPromise;
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
  try {
    await Promise.race([
      (async () => {
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
      })(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("CLOUD_PUSH_TIMEOUT")), CLOUD_HYDRATE_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    if (e?.message === "CLOUD_PUSH_TIMEOUT") {
      console.warn("Supabase push timed out — your save is still on this device.");
    } else {
      console.warn("Supabase push failed:", e);
    }
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
  try {
    return await Promise.race([
      (async () => {
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
      })(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("CLOUD_HYDRATE_TIMEOUT")), CLOUD_HYDRATE_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    if (e?.message === "CLOUD_HYDRATE_TIMEOUT") {
      console.warn(
        "Cloud lookup timed out — continuing on-device. Check network, ad blockers, or try again."
      );
    } else {
      console.warn("Cloud hydrate failed:", e);
    }
    return false;
  }
}

/**
 * After local decrypt: merge with remote vault and save + push.
 */
export async function mergeRemoteVault(password, localState) {
  if (!isSupabaseConfigured()) return ensureStateShape(localState);
  const base = ensureStateShape(localState);
  let row;
  try {
    const hid = await deriveHouseholdRowId(password);
    row = await Promise.race([
      pullVaultRow(hid),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("CLOUD_MERGE_TIMEOUT")), CLOUD_HYDRATE_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    if (e?.message === "CLOUD_MERGE_TIMEOUT") {
      console.warn("Cloud merge timed out — using data on this device only.");
    } else {
      console.warn("Cloud merge failed:", e);
    }
    return base;
  }
  if (!row) {
    return base;
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
    return base;
  }
  if (!remoteState) return base;
  return mergeAppState(base, remoteState);
}

export { isSupabaseConfigured };
