#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# eoweb — Local Deploy Script
# Builds the static client, pushes to GHCR, deploys behind Traefik.
# The image is host-agnostic; the WS host is injected at runtime via
# a mounted config.json generated here from WS_URL.
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.deploy"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Missing $ENV_FILE — copy .env.deploy.example and fill it in"
  exit 1
fi
source "$ENV_FILE"

for var in VPS_HOST VPS_USER GHCR_USER GHCR_PAT CLIENT_DOMAIN WS_URL; do
  if [[ -z "${!var:-}" ]]; then echo "❌ $var not set in $ENV_FILE"; exit 1; fi
done

IMAGE="ghcr.io/${GHCR_USER}/eoweb:latest"
SSH_PORT="${SSH_PORT:-2222}"

echo "═══ eoweb deploy → $CLIENT_DOMAIN (ws=$WS_URL) ═══"

echo "📦 Building $IMAGE (large — bakes GFX) ..."
docker build --platform linux/amd64 -t "$IMAGE" "$SCRIPT_DIR"

echo "🚀 Pushing to GHCR ..."
echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
docker push "$IMAGE"

ssh -p "$SSH_PORT" "${VPS_USER}@${VPS_HOST}" bash -s -- \
  "$IMAGE" "$GHCR_USER" "$GHCR_PAT" "$CLIENT_DOMAIN" "$WS_URL" <<'REMOTE'
set -euo pipefail
IMAGE="$1"; GHCR_USER="$2"; GHCR_PAT="$3"; CLIENT_DOMAIN="$4"; WS_URL="$5"

echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin

# Runtime client config (overrides the baked default WS host).
mkdir -p ~/eoweb
cat > ~/eoweb/config.json <<CONFIG
{
  "host": "${WS_URL}",
  "staticHost": false,
  "title": "Project Origin",
  "creditsUrl": "https://origin-project.net",
  "soundFont": "TimGM6mb.sf2"
}
CONFIG

# Traefik dynamic router.
mkdir -p ~/traefik/dynamic
cat > ~/traefik/dynamic/origin-eoweb.yml <<TRAEFIK
http:
  routers:
    origin-eoweb:
      rule: "Host(\`${CLIENT_DOMAIN}\`)"
      service: origin-eoweb
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
  services:
    origin-eoweb:
      loadBalancer:
        servers:
          - url: "http://eoweb:80"
TRAEFIK

# Compose: static client, config.json mounted into the served root.
cat > ~/eoweb/docker-compose.yml <<COMPOSE
services:
  eoweb:
    image: ${IMAGE}
    container_name: eoweb
    restart: unless-stopped
    volumes:
      - ./config.json:/home/sws/public/config.json:ro
    networks:
      - web
networks:
  web:
    external: true
COMPOSE

cd ~/eoweb
docker compose pull
docker compose up -d --force-recreate
echo "✅ eoweb deployed → https://${CLIENT_DOMAIN}"
REMOTE

echo "✅ Done. Visit https://$CLIENT_DOMAIN"
