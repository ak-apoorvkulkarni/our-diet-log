# आहार Tracker

**Shared meal logging for two — self-hosted with your own database.**

---

## What it is

आहार Tracker is a web app for couples or housemates who want one place to log meals together. Add photos, optional calories, and a quick health rating. See weekly dashboards per person and for your household.

**No Firebase, no Google sign-in.** When you run the server app, accounts and meals are stored in **SQLite on your machine** (`data/ahar_tracker.db`).

## Run locally (development)

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
./start.sh
```

Open **http://127.0.0.1:8001** — create an account and start logging.

For a quick static preview without the database (encrypted local vault only):

```bash
bash serve.sh   # python3 -m http.server 8080
```

## Deploy on Ubuntu home server

See **[deployment.md](deployment.md)** for systemd, port **8001**, and Cloudflare Quick Tunnel (free public HTTPS URL, no domain needed).

| Item | Value |
|------|--------|
| Install path | `/opt/ahar-tracker` |
| Port | `8001` |
| Database | `data/ahar_tracker.db` |
| Public URL | `bash deploy/get-quick-tunnel-url.sh` on server |

## Project layout

| Path | Purpose |
|------|---------|
| `index.html` | App shell, marketing, auth UI |
| `js/` | UI modules, API client, `app.js` entry |
| `src/server/` | FastAPI backend + SQLite |
| `deploy/` | systemd unit, setup scripts, Quick Tunnel |
| `css/` | Styles |

## Partner sharing

Household owner creates an invite link (Settings → Partner invite). Partner must **register on the same server** with the username you specify, then open the invite URL.
