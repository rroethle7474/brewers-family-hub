# Deployment Guide — Hetzner VPS + Cloudflare + GitHub Actions

> Read this end-to-end before deploying. It's the source of truth for the **VPS hosting path**.
>
> **This is one of two viable hosting options.** The other is the simpler Vercel + Fly.io path described in earlier drafts of SPEC.md. Both work; they differ in tradeoffs:
>
> | | Vercel + Fly.io | Hetzner VPS |
> |---|---|---|
> | Setup time | ~30 min | ~2-3 hours one-time |
> | Ongoing maintenance | Near zero | Light (monthly OS updates, occasional troubleshooting) |
> | Cost | ~$0-3/mo | ~$5-6/mo |
> | Control | Limited | Full |
> | Deploy mechanism | Git push (auto) | Git push (via GitHub Actions) |
> | Best if | You want it to "just work" | You want control or the VPS exists for other reasons |
>
> A hybrid is also fine: **Vercel for the frontend, VPS for the poller.** That keeps the frontend story simple while putting the always-on Python service somewhere you control.
>
> The decision can be made at end of Phase 1 (frontend only — Vercel is the clear win) and revisited at end of Phase 3 (when the poller arrives). Switching paths later is mostly config — application code doesn't change.

---

## Architecture Overview

```
┌──────────────┐
│  Family User │
└──────┬───────┘
       │ https://brewers.yourdomain.com
       ▼
┌─────────────────────────────────────┐
│         Cloudflare (proxy)          │
│  - DNS                              │
│  - DDoS protection                  │
│  - TLS edge (full strict mode)      │
└──────────────┬──────────────────────┘
               │ HTTPS via Cloudflare Origin Cert
               ▼
┌─────────────────────────────────────────────────────┐
│              Hetzner VPS (Ubuntu 24.04)              │
│  ┌───────────────────────────────────────────────┐  │
│  │              Caddy (reverse proxy)             │  │
│  │  - TLS termination via Cloudflare Origin Cert  │  │
│  │  - Routes /              → web container       │  │
│  │  - Routes /poller-health → poller container    │  │
│  └────────────┬─────────────────────┬──────────────┘  │
│               │                     │                 │
│      ┌────────▼─────────┐  ┌────────▼─────────┐       │
│      │  web container   │  │ poller container │       │
│      │  Nginx + static  │  │  FastAPI + uvicorn│      │
│      │  React build     │  │  Polls MLB API    │       │
│      │  port: 8080      │  │  port: 8001       │       │
│      └──────────────────┘  └────────┬─────────┘       │
│                                     │                  │
└─────────────────────────────────────┼──────────────────┘
                                      │ HTTPS (outbound)
                                      ▼
                          ┌──────────────────────┐
                          │  Supabase (managed)  │
                          │  Postgres + Auth     │
                          │  + Realtime          │
                          │  + Edge Functions    │
                          └──────────────────────┘
                                      ▲
                                      │ HTTPS
                          ┌───────────┴──────────┐
                          │   MLB Stats API      │
                          │  statsapi.mlb.com    │
                          └──────────────────────┘
```

### What lives where

| Service | Where | Why |
|---|---|---|
| Frontend (React build) | Hetzner VPS, Docker container | Self-hosted alongside the poller; no external dependency |
| Poller (FastAPI) | Hetzner VPS, Docker container | Same VPS, simpler than separate Fly.io |
| Postgres + Auth + Realtime | Supabase (managed) | Free tier works; no reason to self-host for family scale |
| Edge Functions (cron jobs) | Supabase | Already there, free, scheduled |
| DNS | Cloudflare | Free, fast, with proxy benefits |
| TLS | Cloudflare Origin Certs + Caddy | Clean chain, no certbot |
| CI/CD | GitHub Actions | Free for public/small repos |

### What changed from SPEC.md
- ~~Vercel hosting~~ → Hetzner VPS (Caddy + Nginx in container)
- ~~Fly.io for poller~~ → Same VPS, separate Docker container
- Estimated cost: ~$5-7/mo (just the Hetzner VPS) instead of ~$3/mo split across services. Worth it for control + everything-in-one-place.

---

## Part 1: One-Time Setup

Do these once. After this, deploys are automated.

### 1.1 Hetzner VPS Provisioning

**Recommended VPS:**
- **Hetzner CX22** (2 vCPU, 4 GB RAM, 40 GB SSD, ~€4.51/mo) — comfortable for family scale
- **Hetzner CX11** (1 vCPU, 2 GB RAM, 20 GB SSD) works but tight once the poller and frontend are both running
- **Location:** US East (Ashburn) for best latency to MLB API + Supabase US-East
- **Image:** Ubuntu 24.04 LTS

After provisioning, SSH in as root and harden the box:

```bash
# 1. Update system
apt update && apt upgrade -y

# 2. Create a non-root user
adduser ryan
usermod -aG sudo ryan

# 3. Copy your SSH key to the new user
mkdir -p /home/ryan/.ssh
cp /root/.ssh/authorized_keys /home/ryan/.ssh/
chown -R ryan:ryan /home/ryan/.ssh
chmod 700 /home/ryan/.ssh
chmod 600 /home/ryan/.ssh/authorized_keys

# 4. Disable root SSH and password auth
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# 5. Install firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 6. Install Docker + Docker Compose
curl -fsSL https://get.docker.com | sh
usermod -aG docker ryan

# 7. Install fail2ban (basic SSH brute-force protection)
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban
```

Verify by SSHing in as `ryan` from a fresh terminal. If that works, you're good. Don't disable root yet, but stop using it.

### 1.2 Cloudflare DNS + Origin Cert

**DNS records** (in the Cloudflare dashboard, your domain → DNS → Records):

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | brewers (or whatever subdomain) | [your VPS IP] | Proxied (orange cloud) |
| AAAA | brewers | [your VPS IPv6, if Hetzner gave you one] | Proxied |

Wait a few minutes for propagation. Verify with `dig brewers.yourdomain.com` — you should see Cloudflare IPs (104.x or 172.x), not your VPS IP. That's correct — the proxy hides your origin.

**SSL/TLS settings:**

1. Go to your domain → SSL/TLS → Overview
2. Set encryption mode to **Full (strict)** — this requires a valid cert at the origin
3. Go to SSL/TLS → Origin Server → "Create Certificate"
4. Use defaults: RSA 2048, hostnames `brewers.yourdomain.com` and `*.yourdomain.com`, validity 15 years
5. Save the **certificate** (PEM) and **private key** somewhere safe — you only see the private key once

You'll paste these onto the VPS in Part 2.

### 1.3 GitHub Repo + Secrets

Create the GitHub repo (or push your existing scaffold to it):

```bash
# From the project root on your laptop:
gh repo create brewers-family-hub --private --source=. --remote=origin
git push -u origin main
```

Then add the deploy secrets in **GitHub repo → Settings → Secrets and variables → Actions**:

| Secret name | Value |
|---|---|
| `SSH_PRIVATE_KEY` | A new SSH private key generated specifically for deploys (see below) |
| `SSH_HOST` | Your VPS IP (the actual one, not the Cloudflare proxy) |
| `SSH_USER` | `ryan` |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Your Supabase `anon` key (frontend-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase `service_role` key (poller only — NEVER frontend) |

**Generate the deploy SSH key:**

```bash
# On your laptop:
ssh-keygen -t ed25519 -f ~/.ssh/brewers_deploy -C "brewers-deploy"
# Don't set a passphrase — automation can't enter one

# Copy public key to VPS
ssh-copy-id -i ~/.ssh/brewers_deploy.pub ryan@your-vps-ip

# Copy the private key contents into the SSH_PRIVATE_KEY GitHub secret
cat ~/.ssh/brewers_deploy
```

Test it works: `ssh -i ~/.ssh/brewers_deploy ryan@your-vps-ip` should log you in without a password.

### 1.4 VPS Application Directory

```bash
# SSH to VPS as ryan
ssh ryan@your-vps-ip

# Create app directory
sudo mkdir -p /opt/brewers
sudo chown ryan:ryan /opt/brewers
cd /opt/brewers

# Create subdirectories
mkdir -p caddy/data caddy/config certs

# Paste Cloudflare Origin Cert + key
nano certs/origin.pem        # paste certificate
nano certs/origin.key        # paste private key
chmod 600 certs/origin.key   # lock down the key
```

The `caddy/data` and `caddy/config` directories will be Docker volumes for persistence.

---

## Part 2: Repo Files

These files live in your repo. Once they're in place, GitHub Actions handles deploys.

### 2.1 `infra/docker-compose.yml`

```yaml
# /opt/brewers/docker-compose.yml on the VPS
# Pulled from infra/docker-compose.yml in the repo by the deploy workflow
version: "3.8"

services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"  # HTTP/3
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./certs:/certs:ro
      - ./caddy/data:/data
      - ./caddy/config:/config
    networks:
      - brewers-net
    depends_on:
      - web
      - poller

  web:
    image: ghcr.io/${GITHUB_OWNER}/brewers-family-hub-web:${WEB_IMAGE_TAG:-latest}
    restart: unless-stopped
    expose:
      - "8080"
    networks:
      - brewers-net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3

  poller:
    image: ghcr.io/${GITHUB_OWNER}/brewers-family-hub-poller:${POLLER_IMAGE_TAG:-latest}
    restart: unless-stopped
    expose:
      - "8001"
    environment:
      SUPABASE_URL: ${SUPABASE_URL}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
      LOG_LEVEL: info
    networks:
      - brewers-net
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3

networks:
  brewers-net:
    driver: bridge
```

### 2.2 `infra/caddy/Caddyfile`

```
# /opt/brewers/caddy/Caddyfile on the VPS
brewers.yourdomain.com {
    # TLS via Cloudflare Origin Cert
    tls /certs/origin.pem /certs/origin.key

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
        Permissions-Policy "geolocation=(), microphone=(), camera=()"
    }

    # Frontend
    handle {
        reverse_proxy web:8080 {
            health_uri /healthz
            health_interval 30s
        }
    }

    # Poller health endpoint (admin only — protected by Cloudflare Access if you set it up)
    handle /poller/health {
        reverse_proxy poller:8001/healthz
    }

    # Logs
    log {
        output file /var/log/caddy/access.log {
            roll_size 10mb
            roll_keep 5
        }
        format json
    }
}
```

> Replace `brewers.yourdomain.com` with your actual subdomain.

### 2.3 `web/Dockerfile`

```dockerfile
# Multi-stage build for the React frontend
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# Inject env vars at build time (Vite reads VITE_*)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
```

### 2.4 `web/nginx.conf`

```nginx
server {
    listen 8080;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Health check
    location /healthz {
        access_log off;
        return 200 "ok\n";
        add_header Content-Type text/plain;
    }

    # Service worker — never cache
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        try_files $uri =404;
    }

    # Manifest — short cache
    location = /manifest.json {
        add_header Cache-Control "public, max-age=3600";
        try_files $uri =404;
    }

    # Static assets — long cache (filenames are hashed by Vite)
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # SPA fallback — everything else goes to index.html
    location / {
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;
    }

    # Gzip
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}
```

### 2.5 `poller/Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .

COPY . .

EXPOSE 8001

# uvicorn with one worker — single source of in-memory state
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
```

### 2.6 `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  WEB_IMAGE_NAME: ${{ github.repository }}-web
  POLLER_IMAGE_NAME: ${{ github.repository }}-poller

jobs:
  build-web:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image_tag: ${{ steps.meta.outputs.tags }}
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.WEB_IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=raw,value=latest

      - name: Build and push web image
        uses: docker/build-push-action@v5
        with:
          context: ./web
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: |
            VITE_SUPABASE_URL=${{ secrets.SUPABASE_URL }}
            VITE_SUPABASE_ANON_KEY=${{ secrets.SUPABASE_ANON_KEY }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  build-poller:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.POLLER_IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=raw,value=latest

      - name: Build and push poller image
        uses: docker/build-push-action@v5
        with:
          context: ./poller
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: [build-web, build-poller]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H ${{ secrets.SSH_HOST }} >> ~/.ssh/known_hosts

      - name: Copy infra files to VPS
        run: |
          scp -i ~/.ssh/deploy_key infra/docker-compose.yml \
            ${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}:/opt/brewers/docker-compose.yml
          scp -i ~/.ssh/deploy_key infra/caddy/Caddyfile \
            ${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}:/opt/brewers/caddy/Caddyfile

      - name: Deploy
        env:
          SHA: ${{ github.sha }}
        run: |
          ssh -i ~/.ssh/deploy_key ${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }} << EOF
            set -e
            cd /opt/brewers

            # Write .env (used by docker compose)
            cat > .env <<ENVEOF
          GITHUB_OWNER=${{ github.repository_owner }}
          WEB_IMAGE_TAG=${SHA}
          POLLER_IMAGE_TAG=${SHA}
          SUPABASE_URL=${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY=${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          ENVEOF
            chmod 600 .env

            # Pull new images
            echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
            docker compose pull

            # Zero-downtime restart
            docker compose up -d --remove-orphans

            # Cleanup old images
            docker image prune -f

            # Health check
            sleep 5
            docker compose ps
          EOF
```

### 2.7 Add to repo structure

Update `CLAUDE.md` "Repo Structure" section to include:

```
brewers-family-hub/
├── infra/
│   ├── docker-compose.yml
│   └── caddy/
│       └── Caddyfile
├── .github/
│   └── workflows/
│       └── deploy.yml
├── web/
│   ├── Dockerfile
│   └── nginx.conf
├── poller/
│   └── Dockerfile
└── docs/
    └── DEPLOYMENT.md           # this file
```

---

## Part 3: First Deploy

After all the setup above:

1. **Push to main** — GitHub Actions kicks off automatically.
2. **Watch the Actions tab** — three jobs run: `build-web`, `build-poller`, `deploy`.
3. **First deploy will take ~5-8 minutes** because Docker layer caching is cold.
4. **SSH in to verify:**
   ```bash
   ssh ryan@your-vps-ip
   cd /opt/brewers
   docker compose ps
   docker compose logs --tail 50
   ```
5. **Test in browser:** `https://brewers.yourdomain.com` should load. Cloudflare proxies, Caddy serves the React app.

If anything goes wrong, see "Troubleshooting" below.

---

## Part 4: Day-to-Day Operations

### Deploying changes

Just `git push` to main. GitHub Actions handles the rest. Subsequent deploys are 1-2 minutes thanks to Docker layer caching.

### Watching logs

```bash
# All services
ssh ryan@your-vps-ip 'cd /opt/brewers && docker compose logs -f'

# Just the poller (most useful during games)
ssh ryan@your-vps-ip 'cd /opt/brewers && docker compose logs -f poller'

# Caddy access logs
ssh ryan@your-vps-ip 'docker compose logs caddy --tail 100'
```

For comfort, add a shell alias on your laptop:

```bash
# in ~/.zshrc or ~/.bashrc
alias brewers-logs='ssh ryan@your-vps-ip "cd /opt/brewers && docker compose logs -f"'
alias brewers-poller='ssh ryan@your-vps-ip "cd /opt/brewers && docker compose logs -f poller"'
```

### Rolling back

GHCR keeps every image tagged by SHA. To roll back:

```bash
ssh ryan@your-vps-ip
cd /opt/brewers

# Find a previous SHA in the logs or GitHub
# Edit .env and set WEB_IMAGE_TAG and/or POLLER_IMAGE_TAG to the older SHA
nano .env

# Pull and restart
docker compose pull
docker compose up -d
```

### Backups

Supabase handles Postgres backups automatically (free tier: 7-day rolling). For the VPS itself:

- **Code:** lives in GitHub. No backup needed.
- **Configuration:** `/opt/brewers/.env`, `/opt/brewers/caddy/Caddyfile`, `/opt/brewers/certs/`. Back these up to a password manager or encrypted notes.
- **Hetzner Snapshots:** $0.011/GB/month. Take one after initial setup, then weekly. From the Hetzner Cloud Console → your server → Snapshots → Take snapshot.

### Updating system packages

Monthly:

```bash
ssh ryan@your-vps-ip
sudo apt update && sudo apt upgrade -y
sudo reboot   # if kernel updated
```

Docker handles its own updates if you `apt upgrade`. The Caddy and base images update on each new deploy automatically (if you pin to `2-alpine` it pulls the latest in that line on rebuild).

---

## Part 5: Monitoring

For a family site, you don't need a full observability stack. The minimum viable monitoring:

### Cloudflare uptime alerts

In Cloudflare → Notifications → Add → "Health Checks". Free, sends an email if the site goes down. Configure a check on `https://brewers.yourdomain.com/healthz`.

### Self-hosted Uptime Kuma (optional)

If you want more — response times, multi-endpoint checks, status page — add a third Docker service:

```yaml
# Add to docker-compose.yml
uptime-kuma:
  image: louislam/uptime-kuma:1
  restart: unless-stopped
  volumes:
    - ./uptime-kuma:/app/data
  expose:
    - "3001"
  networks:
    - brewers-net
```

Then add a Caddy route at `kuma.brewers.yourdomain.com` (with a separate Cloudflare DNS record). Free, runs on the same VPS, ~50MB RAM.

### Disk and resource alerts

Hetzner Cloud Console has built-in CPU/disk alerts. Configure them in the server's metrics tab.

---

## Part 6: Security Checklist

Before sharing the site link with family:

- [ ] SSH password auth disabled (`PasswordAuthentication no`)
- [ ] Root SSH disabled (`PermitRootLogin no`)
- [ ] UFW firewall enabled with only 22, 80, 443 open
- [ ] fail2ban running
- [ ] Cloudflare proxy enabled (orange cloud)
- [ ] Cloudflare SSL/TLS mode is **Full (strict)**
- [ ] Cloudflare → Security → "Bot Fight Mode" enabled
- [ ] `service_role` key only in poller container env, NEVER in frontend build
- [ ] `.env` file on VPS has `chmod 600`
- [ ] `certs/origin.key` has `chmod 600`
- [ ] GitHub repo is **private**
- [ ] Deploy SSH key has no passphrase but is dedicated (not your personal key)
- [ ] Supabase RLS enabled on every table (verified by `phase-reviewer` agent)
- [ ] Hetzner snapshot taken after initial setup

---

## Part 7: Troubleshooting

### Deploy fails at SSH step
- Check `SSH_HOST` is the actual VPS IP, not the Cloudflare proxy IP
- Verify the deploy public key is in `/home/ryan/.ssh/authorized_keys` on the VPS
- Run `ssh -i ~/.ssh/brewers_deploy ryan@your-vps-ip` from your laptop to confirm

### "502 Bad Gateway" from Cloudflare
- One of the containers is unhealthy
- SSH in and run `docker compose ps` — check the `STATUS` column
- `docker compose logs <service>` to see why
- Common causes: Supabase URL/key wrong, port mismatch, container crashed on startup

### TLS errors / "not secure"
- Cloudflare SSL/TLS mode must be **Full (strict)** — not "Flexible" or "Full"
- Origin cert must be valid and at the path Caddy expects (`/certs/origin.pem`, `/certs/origin.key`)
- Inside the Caddy container, run `caddy validate --config /etc/caddy/Caddyfile`

### Poller not detecting live games
- Check `docker compose logs poller` for errors
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set correctly (not the `anon` key)
- Verify the poller can reach Supabase: `docker compose exec poller curl -I https://your-project.supabase.co`

### High memory usage
- Hetzner CX22 has 4GB. Caddy + Nginx + Python should use < 500MB total.
- If memory creeps up, suspect a leak in the poller's in-memory state. Add a daily restart:
  ```yaml
  # Crude but effective
  poller:
    # ... existing config
    restart: unless-stopped
    healthcheck:
      # existing
  ```
  Then a cron on the VPS: `0 4 * * * cd /opt/brewers && docker compose restart poller`

### GitHub Actions can't push to GHCR
- Verify the workflow has `permissions: packages: write`
- First push to GHCR creates a private package — go to GitHub → your profile → Packages → set visibility / add the repo as a linked package

---

## Part 8: When the Season Ends

Several reasonable options:

1. **Leave it running.** Costs ~$5/mo regardless of usage. Family can browse final results, hot take hall of fame, etc.
2. **Stop the poller.** It's no-op when there are no games, but stopping saves a bit of CPU. `docker compose stop poller`.
3. **Spin down the VPS.** Take a Hetzner snapshot, delete the server, restore in March. Snapshot costs ~$0.50/mo for a 4GB image vs. ~$5/mo for the running server. Annual savings: ~$25-30.

Recommendation: option 1 the first year (you'll want to tinker), option 3 thereafter once it's stable.

---

## Cost Summary

| Item | Monthly |
|---|---|
| Hetzner CX22 VPS | ~$5 |
| Cloudflare DNS + proxy | $0 |
| Supabase free tier | $0 |
| GitHub Actions (private repo) | $0 (within 2,000 min/mo free) |
| GHCR storage | $0 (within free tier) |
| Domain | varies (~$1/mo amortized) |
| **Total** | **~$6/mo** |

Slightly more than the original Vercel + Fly.io plan (~$3/mo), but with full control, no platform lock-in, and everything in one place.
