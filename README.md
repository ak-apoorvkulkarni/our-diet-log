# Our Diet Log

**Repository:** [github.com/ak-apoorvkulkarni/our-diet-log](https://github.com/ak-apoorvkulkarni/our-diet-log)  
**Live site (GitHub Pages):** [ak-apoorvkulkarni.github.io/our-diet-log](https://ak-apoorvkulkarni.github.io/our-diet-log/)

A small static website for two people to log meals with photos, optional calories, and health ratings (healthy / okay / unhealthy). Includes **Household** and **per-person** weekly dashboards with calorie trends, wellness score, and recommendations. **Guess ~kcal** fills in a rough calorie estimate from the food name (built-in list + optional USDA lookup) or, if needed, a very rough image guess (MobileNet — first load downloads a small model).

Optional `window.__DIET_USDA_API_KEY__` in `index.html` raises USDA rate limits; otherwise a shared demo key is used.

Current app version is defined in `js/version.js`.

## Privacy model (GitHub Pages)

This project is **fully static** — there is no backend. Meal data is stored only in the browser’s `localStorage`, **encrypted with AES-GCM** using a key derived from your password (PBKDF2).

- The public GitHub repo does **not** contain your meals; only the HTML/CSS/JS does.
- Anyone can open the site, but without the password they cannot decrypt the data.
- **Important:** The password gate is enforced in the browser; a motivated attacker could still inspect the page. The encryption protects stored data if someone copies your device storage. Choose a strong password and treat the backup file as sensitive.

## Sharing between two phones

**Recommended — cloud sync:** Configure **Supabase** (create project, run `supabase/schema.sql`, then run `node scripts/apply-supabase-config.mjs` or paste URL + anon key into `index.html`). Step-by-step: **[CLOUD_SYNC.md](./CLOUD_SYNC.md)**.

**Manual — backup file:** Browsers do not sync with each other automatically without cloud setup.

1. On device A: **Settings → Download backup** (encrypted blob + salt).
2. Copy the JSON file to device B (AirDrop, Signal, etc.).
3. On device B: on the login screen, use **Restore backup file**, then **Unlock** with the **same password**.

## Deploy on GitHub Pages

1. Create a new repository and push this folder (or make this folder the repo root).
2. In the repo: **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Choose branch `main` (or `master`) and folder **`/` (root)**.
5. Save. After a minute, the site will be at `https://<username>.github.io/<repo>/`.

No build step is required; `index.html` is the entry point.

## Local preview

```bash
cd diet_tracker
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## File layout

| Path | Role |
|------|------|
| `index.html` | Shell, views, modal |
| `css/` | Tokens, layout, components, auth, dashboard |
| `js/crypto.js` | PBKDF2 + AES-GCM |
| `js/storage.js` | Encrypted vault read/write |
| `js/models.js` | Default state (two people) |
| `js/meals-store.js` | Meal CRUD |
| `js/weekly.js` | Week ranges, aggregates, insights |
| `js/image-utils.js` | Image resize/compression |
| `js/ui-auth.js` | Login / create vault / restore backup |
| `js/ui-meals.js` | Log form, grid, edit modal |
| `js/ui-dashboard.js` | Weekly dashboard |
| `js/ui-settings.js` | Names, backup, lock |
| `js/app.js` | Navigation and wiring |

## License

Use and modify freely for personal use.
