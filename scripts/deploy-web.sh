#!/usr/bin/env bash
# Builds the Expo web export and ships it to Amplify Hosting.
#
# Note on the zip: PowerShell's Compress-Archive writes entry paths with
# backslashes, which Amplify reads as one flat filename, so the JS bundle 404s.
# Windows' bundled bsdtar writes spec-compliant forward slashes. Do not swap it
# back for Compress-Archive.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/app"

APP_ID="${AMPLIFY_APP_ID:-$(cat .appid)}"
REGION="${AWS_REGION:-us-east-1}"

echo "Building web export..."
npx expo export --platform web

echo "Packaging..."
rm -f dist.zip
(cd dist && /c/Windows/System32/tar.exe -a -c -f ../dist.zip *)

echo "Creating deployment..."
DEPLOY=$(aws amplify create-deployment --app-id "$APP_ID" --branch-name main --region "$REGION")
JOB=$(echo "$DEPLOY" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).jobId")
UPLOAD=$(echo "$DEPLOY" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).zipUploadUrl")

curl -s -X PUT --upload-file dist.zip "$UPLOAD"
aws amplify start-deployment --app-id "$APP_ID" --branch-name main --job-id "$JOB" --region "$REGION" >/dev/null

echo "Deploying job $JOB..."
for _ in $(seq 1 20); do
  STATUS=$(aws amplify get-job --app-id "$APP_ID" --branch-name main --job-id "$JOB" \
    --region "$REGION" --query 'job.summary.status' --output text)
  echo "  $STATUS"
  [ "$STATUS" = "SUCCEED" ] && break
  [ "$STATUS" = "FAILED" ] && exit 1
  sleep 8
done

echo "Live at https://main.$APP_ID.amplifyapp.com"
