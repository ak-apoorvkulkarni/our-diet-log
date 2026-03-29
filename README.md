# आहार Tracker

**Shared meal logging for two, built for privacy.**

[Try the app](https://ak-apoorvkulkarni.github.io/our-diet-log/) · [Source on GitHub](https://github.com/ak-apoorvkulkarni/our-diet-log)

---

## What it is

आहार Tracker is a simple web app for couples or housemates who want one place to log meals together. Add photos, optional calories, and a quick health rating (healthy, okay, or not so great). See weekly dashboards per person and for your household: trends, calories, a wellness-style score, and gentle suggestions based on what you logged.

No accounts on our servers. Your data lives on your devices, locked behind a password you choose.

## Why we built it

**Privacy first.** Meal logs can feel personal. This app keeps entries encrypted in the browser so nothing readable sits in plain text on your phone or laptop.

**Built for two.** Names, weekly views, and insights are tuned for a small household, not a crowd.

**Lightweight.** Open the site, unlock, log a meal in a few taps. Works in modern browsers with no app store install.

## What you can do

- Log meals with photos, notes, optional calories, and health ratings  
- See household and per-person weekly dashboards  
- Get calorie hints from food names (with optional richer nutrition lookup)  
- Back up an encrypted file and restore on another device  
- Optional cloud sync between phones via Supabase (setup described in the repo)

## Try it

Use the **[live site](https://ak-apoorvkulkarni.github.io/our-diet-log/)** on desktop or mobile. Pick a strong password: it protects your local encrypted data.

Developers who want to run or fork the project locally can serve the folder with any static file server (for example `python3 -m http.server`) and open the local URL. Cloud sync setup is documented in [`CLOUD_SYNC.md`](./CLOUD_SYNC.md).

## Open source

The project is open for personal use and modification. Browse the **[repository](https://github.com/ak-apoorvkulkarni/our-diet-log)** for code, issues, and contributions.
