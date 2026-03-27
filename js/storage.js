/**
 * Encrypted persistence in localStorage.
 */
import {
  deriveKeyFromPassword,
  encryptJson,
  decryptJson,
  generateSalt,
  toBase64,
  DEFAULT_PBKDF2_ITERATIONS,
  NEW_VAULT_PBKDF2_ITERATIONS,
} from "./crypto.js";

const KEY_SALT = "diet_tracker_salt_v1";
const KEY_PAYLOAD = "diet_tracker_payload_v1";
/** PBKDF2 iteration count for this vault (plaintext). Old installs omit → default 210000. */
const KEY_KDF_ITERS = "diet_tracker_kdf_iters_v1";

function saltBytesFromStorage() {
  const saltB64 = localStorage.getItem(KEY_SALT);
  if (!saltB64) return null;
  return Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
}

export function getPbkdf2Iterations() {
  const raw = localStorage.getItem(KEY_KDF_ITERS);
  if (raw == null || raw === "") return DEFAULT_PBKDF2_ITERATIONS;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 10000) return DEFAULT_PBKDF2_ITERATIONS;
  return n;
}

export function hasStoredVault() {
  return Boolean(localStorage.getItem(KEY_SALT) && localStorage.getItem(KEY_PAYLOAD));
}

export async function createVault(password, initialState) {
  if (hasStoredVault()) {
    throw new Error(
      "This browser already has an encrypted log. Unlock with your password, or erase local data first to start fresh."
    );
  }
  const salt = generateSalt();
  localStorage.setItem(KEY_SALT, toBase64(salt));
  localStorage.setItem(KEY_KDF_ITERS, String(NEW_VAULT_PBKDF2_ITERATIONS));
  const iters = getPbkdf2Iterations();
  const key = await deriveKeyFromPassword(password, salt, iters);
  const { iv, cipherText } = await encryptJson(key, initialState);
  localStorage.setItem(KEY_PAYLOAD, JSON.stringify({ iv, cipherText }));
}

export async function loadDecrypted(password) {
  const salt = saltBytesFromStorage();
  const payloadRaw = localStorage.getItem(KEY_PAYLOAD);
  if (!salt || !payloadRaw) return null;

  let payload;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return null;
  }
  if (!payload?.iv || !payload?.cipherText) return null;

  /** Try all plausible PBKDF2 counts — a wrong stored count makes the right password look "wrong". */
  const candidates = [
    ...new Set([getPbkdf2Iterations(), DEFAULT_PBKDF2_ITERATIONS, NEW_VAULT_PBKDF2_ITERATIONS]),
  ];
  let lastErr;

  for (const iters of candidates) {
    try {
      const key = await deriveKeyFromPassword(password, salt, iters);
      const data = await decryptJson(key, payload.iv, payload.cipherText);
      if (iters !== getPbkdf2Iterations()) {
        localStorage.setItem(KEY_KDF_ITERS, String(iters));
      }
      return data;
    } catch (e) {
      lastErr = e;
      if (e?.name === "OperationError") continue;
      throw e;
    }
  }
  throw lastErr;
}

/**
 * Decrypt vault bytes without reading localStorage (for cloud merge).
 * @param {string|null|undefined} iterationsHint - from Supabase row if known
 */
export async function decryptVaultFromParts(password, saltB64, payloadRawString, iterationsHint) {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  let payload;
  try {
    payload = JSON.parse(payloadRawString);
  } catch {
    return null;
  }
  if (!payload?.iv || !payload?.cipherText) return null;

  const hinted =
    iterationsHint != null && iterationsHint !== ""
      ? parseInt(String(iterationsHint), 10)
      : null;
  const candidates = [
    ...(hinted != null && !Number.isNaN(hinted) && hinted >= 10000 ? [hinted] : []),
    ...new Set([getPbkdf2Iterations(), DEFAULT_PBKDF2_ITERATIONS, NEW_VAULT_PBKDF2_ITERATIONS]),
  ];
  let lastErr;

  for (const iters of [...new Set(candidates)]) {
    try {
      const key = await deriveKeyFromPassword(password, salt, iters);
      return await decryptJson(key, payload.iv, payload.cipherText);
    } catch (e) {
      lastErr = e;
      if (e?.name === "OperationError") continue;
      throw e;
    }
  }
  throw lastErr;
}

export function getVaultSnapshotForSync() {
  return {
    salt: localStorage.getItem(KEY_SALT),
    payload: localStorage.getItem(KEY_PAYLOAD),
    pbkdf2Iterations: localStorage.getItem(KEY_KDF_ITERS),
  };
}

export async function saveEncrypted(password, dataObj) {
  const salt = saltBytesFromStorage();
  if (!salt) throw new Error("Missing salt");
  const iters = getPbkdf2Iterations();
  const key = await deriveKeyFromPassword(password, salt, iters);
  const { iv, cipherText } = await encryptJson(key, dataObj);
  localStorage.setItem(KEY_PAYLOAD, JSON.stringify({ iv, cipherText }));
}

export function clearVault() {
  localStorage.removeItem(KEY_SALT);
  localStorage.removeItem(KEY_PAYLOAD);
  localStorage.removeItem(KEY_KDF_ITERS);
}

/** Apply backup payload + optional iteration count (must run before unlock). */
export function applyBackupToLocalStorage({ salt, payload, pbkdf2Iterations }) {
  localStorage.setItem(KEY_SALT, salt);
  localStorage.setItem(KEY_PAYLOAD, payload);
  if (pbkdf2Iterations != null && pbkdf2Iterations !== "") {
    localStorage.setItem(KEY_KDF_ITERS, String(parseInt(String(pbkdf2Iterations), 10)));
  } else {
    localStorage.removeItem(KEY_KDF_ITERS);
  }
}
