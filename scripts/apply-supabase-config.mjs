#!/usr/bin/env node
/**
 * Writes Supabase URL + anon key into index.html (GitHub Pages needs them in the page).
 *
 * Usage (pick one):
 *   node scripts/apply-supabase-config.mjs
 *   node scripts/apply-supabase-config.mjs --url=https://xxx.supabase.co --anon-key=eyJ...
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/apply-supabase-config.mjs
 *
 * Or create .env.supabase (see .env.supabase.example) — gitignored — and run with no args.
 */
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const indexPath = path.join(root, "index.html");
const envFile = path.join(root, ".env.supabase");

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function parseArgs(argv) {
  let url = "";
  let key = "";
  for (const a of argv) {
    if (a.startsWith("--url=")) url = a.slice(6);
    if (a.startsWith("--anon-key=")) key = a.slice(11);
  }
  return { url, key };
}

async function promptLine(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  const fromEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
  };
  const fromFile = loadDotEnv(envFile);
  const args = parseArgs(process.argv.slice(2));

  let url = args.url || fromEnv.SUPABASE_URL || fromFile.SUPABASE_URL || "";
  let anonKey = args.key || fromEnv.SUPABASE_ANON_KEY || fromFile.SUPABASE_ANON_KEY || "";

  if (!url || !anonKey) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (!url) {
        url = (await promptLine(rl, "Supabase Project URL (https://xxxx.supabase.co): ")).trim();
      }
      if (!anonKey) {
        anonKey = (await promptLine(
          rl,
          "Supabase anon public key (Settings → API → anon public, starts with eyJ): "
        )).trim();
      }
    } finally {
      rl.close();
    }
  }

  if (!url.startsWith("http")) {
    console.error("Error: URL must start with https://");
    process.exit(1);
  }
  if (anonKey.length < 80) {
    console.error("Error: anon key looks too short — paste the full JWT from Supabase → Settings → API.");
    process.exit(1);
  }

  let html = fs.readFileSync(indexPath, "utf8");
  html = html.replace(
    /window\.__DIET_SUPABASE_URL__\s*=\s*[^;]+;/,
    `window.__DIET_SUPABASE_URL__ = ${JSON.stringify(url)};`
  );
  html = html.replace(
    /window\.__DIET_SUPABASE_ANON_KEY__\s*=\s*[^;]+;/,
    `window.__DIET_SUPABASE_ANON_KEY__ = ${JSON.stringify(anonKey)};`
  );

  fs.writeFileSync(indexPath, html);
  console.log("Updated index.html with Supabase URL and anon key.");
  console.log("Next: git add index.html && git commit && git push — then wait for GitHub Pages.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
