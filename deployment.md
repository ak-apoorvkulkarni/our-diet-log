# Ubuntu deployment — आहार Tracker

Self-hosted meal tracker with **SQLite on the server** (no Firebase).

**Result:** app on `0.0.0.0:8001`, SQLite at `data/ahar_tracker.db`, optional HTTPS via Cloudflare Quick Tunnel.

---

## Prerequisites

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip git curl
```

Install `cloudflared` for a free public URL (if not already on the server):

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
sudo dpkg -i /tmp/cloudflared.deb
```

Artha Chakshu uses port **8000** — this app uses **8001**.

---

## First-time setup

```bash
ssh apoorv-server@192.168.2.50

sudo mkdir -p /opt/ahar-tracker
sudo chown "$USER:$USER" /opt/ahar-tracker
git clone git@github.com:ak-apoorvkulkarni/our-diet-log.git /opt/ahar-tracker
cd /opt/ahar-tracker

cp .env.example .env
bash deploy/setup-server.sh

# Public HTTPS URL (recommended for phones)
sudo bash deploy/setup-quick-tunnel.sh
bash deploy/get-quick-tunnel-url.sh
```

The last command prints your public link, e.g. `https://something-random.trycloudflare.com` — open it in a browser and create an account.

---

## Day-to-day updates

**Mac:** `git push`

**Server:**

```bash
cd /opt/ahar-tracker
git pull origin main
.venv/bin/pip install -r requirements.txt   # if dependencies changed
bash deploy/restart-service.sh
```

---

## URLs

| Access | URL |
|--------|-----|
| LAN | `http://192.168.2.50:8001/` |
| Health | `http://127.0.0.1:8001/api/health` |
| Public (Quick Tunnel) | output of `bash deploy/get-quick-tunnel-url.sh` |

Quick Tunnel URL changes after reboot — re-run the get-url script.

---

## systemd

```bash
sudo systemctl status ahar-tracker
sudo journalctl -u ahar-tracker -f
sudo systemctl status cloudflared-quick-ahar
```

---

## Database

- Path: `/opt/ahar-tracker/data/ahar_tracker.db`
- Back up this file to preserve all meals and accounts
- Mac dev DB and server DB are separate

---

## Troubleshooting

```bash
sudo ss -tlnp | grep 8001
curl -sf http://127.0.0.1:8001/api/health
sudo journalctl -u ahar-tracker -n 50 --no-pager
```

Install tunnel from Mac:

```bash
bash deploy/install-quick-tunnel.sh apoorv-server@192.168.2.50
```
