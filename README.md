# आहार Tracker

**Shared meal logging for two, built for privacy.**

[Try the app](https://ak-apoorvkulkarni.github.io/our-diet-log/) · [Source on GitHub](https://github.com/ak-apoorvkulkarni/our-diet-log)

---

## What it is

आहार Tracker is a simple web app for couples or housemates who want one place to log meals together. Add photos, optional calories, and a quick health rating (healthy, okay, or not so great). See weekly dashboards per person and for your household: trends, calories, a wellness-style score, and gentle suggestions based on what you logged.

Sign in with Google. Your data is stored in Firebase and shared with a partner only after you invite them.

## Why we built it

**Privacy first.** Meal logs can feel personal. Access is protected by Google sign in, and cloud data is locked down with Firestore security rules.

**Built for two.** Names, weekly views, and insights are tuned for a small household, not a crowd.

**Lightweight.** Open the site, unlock, log a meal in a few taps. Works in modern browsers with no app store install.

## What you can do

- Log meals with photos, notes, optional calories, and health ratings  
- See household and per-person weekly dashboards  
- Get calorie hints from food names (with optional richer nutrition lookup)  
- Share a household dashboard by inviting your partner  
- Works across devices with Firebase cloud storage

## Try it

Use the **[live site](https://ak-apoorvkulkarni.github.io/our-diet-log/)** on desktop or mobile. Sign in with Google, then optionally invite your partner to share one household dashboard.

Developers who want to run or fork the project locally can serve the folder with any static file server (for example `npm start`, `bash serve.sh`, or `python3 -m http.server 8080`) and open the local URL.

## Firebase setup (required)

1. Create a Firebase project.
2. Enable Authentication, then enable the Google provider.
3. Add authorized domains in Firebase Auth for:
   - `localhost`
   - your GitHub Pages domain (for example `ak-apoorvkulkarni.github.io`)
4. Create a Firestore database.
5. Deploy the included Firestore rules:
   - `firebase.json`
   - `firestore.rules`
6. In `index.html`, set `window.__DIET_FIREBASE_CONFIG__` with your Firebase web app config values.

## Project layout

| Path | Purpose |
|------|---------|
| `index.html` | App shell, marketing page, auth, views |
| `css/` | Design tokens, layout, components, auth, dashboard, insights |
| `js/` | UI modules, Firebase auth and storage, `app.js` entry |
| `assets/` | Images (for example `logo.png`) |

## Open source

The project is open for personal use and modification. Browse the **[repository](https://github.com/ak-apoorvkulkarni/our-diet-log)** for code, issues, and contributions.
