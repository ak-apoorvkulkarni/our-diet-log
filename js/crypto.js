/**
 * Web Crypto: PBKDF2 key derivation + AES-GCM encrypt/decrypt for local meal data.
 */
const PBKDF2_ITERATIONS = 210_000;
const SALT_LEN = 16;
const IV_LEN = 12;

function randomBytes(length) {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return buf;
}

function toBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function deriveKeyFromPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptJson(key, obj) {
  const iv = randomBytes(IV_LEN);
  const enc = new TextEncoder();
  const plain = enc.encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { iv: toBase64(iv), cipherText: toBase64(cipher) };
}

export async function decryptJson(key, ivB64, cipherB64) {
  const iv = fromBase64(ivB64);
  const cipher = fromBase64(cipherB64);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(plain));
}

export function generateSalt() {
  return randomBytes(SALT_LEN);
}

export { toBase64, fromBase64 };
