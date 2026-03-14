#!/usr/bin/env bash
# Deploy Happy Cursor Agent to p.romptele.com:
# 1. Build webapp image and copy static files to webapp-dist
# 2. Start backend (Postgres, Redis, Happy server) with docker compose
# 3. Reload nginx (run as root or with sudo)
# Run from repo root: ./scripts/deploy-p-romptele.sh

set -e
cd "$(dirname "$0")/.."
export EXPO_PUBLIC_HAPPY_SERVER_URL="${EXPO_PUBLIC_HAPPY_SERVER_URL:-https://p.romptele.com}"

echo "=== Building webapp (API URL: $EXPO_PUBLIC_HAPPY_SERVER_URL) ==="
echo "(This can take 10–20 minutes. You will see Docker build output below.)"
docker build -f Dockerfile.webapp --build-arg EXPO_PUBLIC_HAPPY_SERVER_URL="$EXPO_PUBLIC_HAPPY_SERVER_URL" -t happy-webapp .

echo "=== Copying webapp static files to webapp-dist ==="
mkdir -p webapp-dist
docker rm -f tmp-happy-webapp 2>/dev/null || true
docker create --name tmp-happy-webapp happy-webapp
docker cp tmp-happy-webapp:/usr/share/nginx/html/. webapp-dist/
docker rm tmp-happy-webapp
echo "Web app files copied to webapp-dist/"

echo "=== Starting backend (DB, Redis, API) ==="
docker compose up -d --build

echo "=== Reload nginx (run with sudo if needed) ==="
nginx -t && systemctl reload nginx && echo "Nginx reloaded."

echo "=== Done. Open https://p.romptele.com ==="
