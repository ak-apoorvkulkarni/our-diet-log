/**
 * Encrypted persistence in localStorage.
 */
import {
  deriveKeyFromPassword,
  encryptJson,
  decryptJson,
  generateSalt,
  toBase64,
} from "./crypto.js";

const KEY_SALT = "diet_tracker_salt_v1";
const KEY_PAYLOAD = "diet_tracker_payload_v1";

function saltBytesFromStorage() {
  const saltB64 = localStorage.getItem(KEY_SALT);
  if (!saltB64) return null;
  return Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
}

export function hasStoredVault() {
  return Boolean(localStorage.getItem(KEY_SALT) && localStorage.getItem(KEY_PAYLOAD));
}

export async function createVault(password, initialState) {
  const salt = generateSalt();
  localStorage.setItem(KEY_SALT, toBase64(salt));
  const key = await deriveKeyFromPassword(password, salt);
  const { iv, cipherText } = await encryptJson(key, initialState);
  localStorage.setItem(KEY_PAYLOAD, JSON.stringify({ iv, cipherText }));
}

export async function loadDecrypted(password) {
  const salt = saltBytesFromStorage();
  const payloadRaw = localStorage.getItem(KEY_PAYLOAD);
  if (!salt || !payloadRaw) return null;
  const key = await deriveKeyFromPassword(password, salt);
  const payload = JSON.parse(payloadRaw);
  return decryptJson(key, payload.iv, payload.cipherText);
}

export async function saveEncrypted(password, dataObj) {
  const salt = saltBytesFromStorage();
  if (!salt) throw new Error("Missing salt");
  const key = await deriveKeyFromPassword(password, salt);
  const { iv, cipherText } = await encryptJson(key, dataObj);
  localStorage.setItem(KEY_PAYLOAD, JSON.stringify({ iv, cipherText }));
}

export function clearVault() {
  localStorage.removeItem(KEY_SALT);
  localStorage.removeItem(KEY_PAYLOAD);
}
