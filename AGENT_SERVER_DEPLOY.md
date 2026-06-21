# Agent note — deploy आहार Tracker on the home server

Server: `apoorv-server@192.168.2.50` · Port **8001** · SQLite at `data/ahar_tracker.db`  
Artha Chakshu uses port 8000 — do not conflict.

**No Firebase.** Accounts + meals live in SQLite on the server.

---

## First-time setup on server

```bash
ssh apoorv-server@192.168.2.50

sudo mkdir -p /opt/ahar-tracker
sudo chown "$USER:$USER" /opt/ahar-tracker
git clone git@github.com:ak-apoorvkulkarni/our-diet-log.git /opt/ahar-tracker
cd /opt/ahar-tracker

cp .env.example .env
bash deploy/setup-server.sh

sudo bash deploy/setup-quick-tunnel.sh
bash deploy/get-quick-tunnel-url.sh
```

---

## Day-to-day deploy

```bash
# Mac
git push

# Server
cd /opt/ahar-tracker && git pull && bash deploy/restart-service.sh
```

---

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | Static HTML/JS |
| Backend | FastAPI (`src/server/`) |
| Database | SQLite (`data/ahar_tracker.db`) |
| Auth | Username + password, cookie sessions |
| Public URL | Cloudflare Quick Tunnel (`cloudflared-quick-ahar`) |

---

## URLs

| Access | URL |
|--------|-----|
| LAN | `http://192.168.2.50:8001/` |
| Health | `http://127.0.0.1:8001/api/health` |
| Public | `bash deploy/get-quick-tunnel-url.sh` |
