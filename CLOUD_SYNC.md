# Cloud sync (two phones, same log)

The app is static and **defaults to local-only** storage. To share **one encrypted log** between Apoorv and Aditi on different phones, use **Supabase** (free tier).

## What you must do (I can’t create your Supabase account for you)

1. Sign in at [supabase.com](https://supabase.com) and create a **new project** (choose a region, set a database password — save it somewhere safe).
2. Open **SQL Editor** → **New query** → paste the full contents of `supabase/schema.sql` from this repo → **Run**. If the last line errors with “already … publication”, that is OK.
3. Open **Settings → API** and copy **Project URL** and the **anon public** key (long `eyJ…` string).
4. In this repo, apply them to `index.html` in one of these ways:
   - **Easiest:** copy `.env.supabase.example` to `.env.supabase`, paste `SUPABASE_URL` and `SUPABASE_ANON_KEY`, then run:
     `node scripts/apply-supabase-config.mjs`
   - Or paste the two values when the script prompts you (same command, no `.env` file).
   - Or edit the `<script>` block in `index.html` by hand (same two `window.__DIET_*` lines as below).
5. Commit `index.html`, push to GitHub, wait for Pages to deploy.
6. On the **laptop** (where your data already lives): open the site → **Unlock** — that uploads the encrypted vault. On the **phone**: erase local data if you created a different log (**Forgot password / erase data**), then **Unlock** with the **same** shared password.

`.env.supabase` is listed in `.gitignore` so your keys stay only on your machine if you use that file; many people still commit the anon key in `index.html` because it is public in the browser anyway.

## What you get

- Same **shared password** on both devices.
- Encrypted vault (salt + ciphertext) stored in **one row** per household; the row id is derived from the password — **no plain-text meals** in the database.
- On unlock, the app **pulls** remote data, **merges** meals with what’s on the phone, then **saves** and **pushes**.
- **Live updates:** when you’re both online with the app open (e.g. different countries), saves from one side show up on the other within a few seconds — no need to refresh. Requires **Realtime** on `household_vaults` (included in `schema.sql`; see below).

## Manual `index.html` snippet (if you don’t use the script)

Above `<script type="module" src="js/app.js">`:

```html
<script>
  window.__DIET_SUPABASE_URL__ = "https://YOUR-PROJECT.supabase.co";
  window.__DIET_SUPABASE_ANON_KEY__ = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
</script>
```

**Both** of you use the **same deployed site** and the **same password**.

## Security notes

- The **anon** key is public in the browser (normal for Supabase). RLS policies in `schema.sql` allow read/write on the table; **payloads are still AES-GCM encrypted** with your password. For higher assurance, later you can lock this down with Edge Functions + service role.
- Anyone who knows the **shared password** can derive the same row id and sync — treat the password like a family vault key.

## If sync fails

The app continues with **local** data and shows a short toast. Check the browser console, your Supabase project, and that `schema.sql` ran without errors.
