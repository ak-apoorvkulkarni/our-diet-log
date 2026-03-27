# Cloud sync (two phones, same log)

The app is static and **defaults to local-only** storage. To share **one encrypted log** between Apoorv and Aditi on different phones, use **Supabase** (free tier).

## What you get

- Same **shared password** on both devices.
- Encrypted vault (salt + ciphertext) stored in **one row** per household; the row id is derived from the password — **no plain-text meals** in the database.
- On unlock, the app **pulls** remote data, **merges** meals with what’s on the phone, then **saves** and **pushes**.
- **Live updates:** when you’re both online with the app open (e.g. different countries), saves from one side show up on the other within a few seconds — no need to refresh. Requires **Realtime** on `household_vaults` (included in `schema.sql`; see below).

## Setup (once)

1. Create a project at [supabase.com](https://supabase.com) → **SQL Editor**.
2. Paste and run the contents of `supabase/schema.sql` in this repo. The last line adds `household_vaults` to the `supabase_realtime` publication so live updates work. If Postgres reports that the table is already in the publication, you can ignore that error.
3. In **Database → Publications** (or **Realtime** settings), confirm Realtime is enabled for your project; the SQL above is usually enough.
4. In the project: **Settings → API** — copy **Project URL** and **anon public** key.
5. In `index.html`, **above** the line `<script type="module" src="js/app.js">`, set:

```html
<script>
  window.__DIET_SUPABASE_URL__ = "https://YOUR-PROJECT.supabase.co";
  window.__DIET_SUPABASE_ANON_KEY__ = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
</script>
```

6. Commit and deploy (e.g. GitHub Pages). **Both** of you use the **same deployed site** and the **same password**.

## Security notes

- The **anon** key is public in the browser (normal for Supabase). RLS policies in `schema.sql` allow read/write on the table; **payloads are still AES-GCM encrypted** with your password. For higher assurance, later you can lock this down with Edge Functions + service role.
- Anyone who knows the **shared password** can derive the same row id and sync — treat the password like a family vault key.

## If sync fails

The app continues with **local** data and shows a short toast. Check the browser console, your Supabase project, and that `schema.sql` ran without errors.
