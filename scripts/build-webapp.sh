#!/usr/bin/env bash
# Build the Happy web app for production. Set EXPO_PUBLIC_HAPPY_SERVER_URL to the
# public URL of your API (e.g. https://happy.romptele.com) before building.
# Output: packages/happy-app/dist/

set -e
cd "$(dirname "$0")/.."
export EXPO_PUBLIC_HAPPY_SERVER_URL="${EXPO_PUBLIC_HAPPY_SERVER_URL:-http://localhost:3006}"
echo "Building web app with API URL: $EXPO_PUBLIC_HAPPY_SERVER_URL"
yarn install --frozen-lockfile --ignore-engines 2>/dev/null || true
yarn workspace @happy-cursor/wire build 2>/dev/null || true
# Remove dist so expo export can create it (avoids EACCES if dist was created by another user)
rm -rf packages/happy-app/dist
cd packages/happy-app && yarn expo export --platform web --output-dir dist
REPO_ROOT="$(cd ../.. && pwd)"
mkdir -p "$REPO_ROOT/webapp-dist"
rm -rf "$REPO_ROOT/webapp-dist/"*
cp -r dist/* "$REPO_ROOT/webapp-dist/"
echo "Web app built and copied to webapp-dist/"
