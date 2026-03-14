#!/usr/bin/env bash
# Build Android APK for p.romptele.com (Happy app with EXPO_PUBLIC_HAPPY_SERVER_URL=https://p.romptele.com).
# Requires EXPO_TOKEN to be set (Expo account token for EAS).
# Usage: EXPO_TOKEN=your_token ./scripts/build-android-apk-promptele.sh
# The build runs on Expo's servers; when done, you get a link to download the APK.

set -e
cd "$(dirname "$0")/.."

if [ -z "${EXPO_TOKEN}" ]; then
  echo "Error: EXPO_TOKEN is not set. Set it with: export EXPO_TOKEN=your_expo_token"
  echo "Get a token at: https://expo.dev/accounts/[your-account]/settings/access-tokens"
  exit 1
fi

echo "Building Android APK (profile: promptele, server: https://p.romptele.com)..."
cd packages/happy-app
npx eas-cli@latest build --profile promptele --platform android --non-interactive
