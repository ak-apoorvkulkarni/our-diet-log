/**
 * Web Crypto and storage require a secure context; many users hit unlock failures otherwise.
 */

export function getWebCryptoBlockReason() {
  if (typeof globalThis === "undefined") return null;
  if (globalThis.crypto?.subtle) return null;

  if (typeof location !== "undefined" && location.protocol === "file:") {
    return "This page was opened as a file. Run a local server and open http://127.0.0.1:8080 instead (see README). Encryption needs a proper URL, not file://.";
  }

  if (typeof location !== "undefined" && location.protocol === "http:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    return "Use http://127.0.0.1:PORT (not your LAN IP like 192.168.x.x) or https://. Your browser blocks Web Crypto on plain HTTP except localhost.";
  }

  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "This page needs a secure context (https:// or http://127.0.0.1).";
  }

  return "Web Crypto (crypto.subtle) is not available. Update your browser or try another one.";
}

export function localStorageAvailable() {
  try {
    const k = "__diet_ls_probe__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
