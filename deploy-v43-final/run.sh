#!/usr/bin/env bash
set -Eeuo pipefail

SITE_DIR="${SITE_DIR:-/tmp/magicoffice-v43-final-site}"
LOCAL_DIR="${LOCAL_DIR:-/tmp/magicoffice-v43-final-local}"
TEAM_ID="${TEAM_ID:-team_44tkvxP20I5s9SUmlxfUEQM1}"
PROJECT_ID="${PROJECT_ID:-prj_JcF9cms6IGKkWJJsCaOWkwVVzA9D}"
RELEASE="${RELEASE:-magicoffice-v4.3-clean-replacement-2026-09-03}"
OFFICIAL_URL="${OFFICIAL_URL:-https://magicoffice.vercel.app}"
: "${VERCEL_TOKEN:?VERCEL_TOKEN is required}"
: "${CHROME_PATH:?CHROME_PATH is required}"

PREVIOUS_URL=""
PREVIEW_URL=""
PROMOTED=0

rollback_if_needed() {
  local exit_code=$?
  if [ "${PROMOTED}" = "1" ] && [ -n "${PREVIOUS_URL}" ]; then
    echo "Verification failed; rolling back to ${PREVIOUS_URL}" >&2
    (cd "${SITE_DIR}" && npx vercel rollback "${PREVIOUS_URL}" --yes --token "${VERCEL_TOKEN}" 2>&1 | tee /tmp/magicoffice-v43-rollback.log) || true
  fi
  exit "${exit_code}"
}
trap rollback_if_needed ERR

python -m py_compile deploy-v43-final/build.py rebuild-v43/build_site_v3.py
node --check deploy-v43-final/test.mjs
node --check rebuild-v43/assets/app.js
node --check rebuild-v43/api/menu.js
node --check rebuild-v43/api/schedule.js
SITE_DIR="${SITE_DIR}" python deploy-v43-final/build.py

test -s "${SITE_DIR}/index.html"
test -s "${SITE_DIR}/assets/site.css"
test -s "${SITE_DIR}/assets/app.js"
test -s "${SITE_DIR}/assets/video/hero-trial-12s-with-audio.mp4"
test -s "${SITE_DIR}/build-manifest.json"
grep -q "${RELEASE}" "${SITE_DIR}/index.html"
python - <<'PY'
import json, os
m=json.load(open(os.environ['SITE_DIR']+'/build-manifest.json',encoding='utf-8'))
assert all(m['checks'].values()), [k for k,v in m['checks'].items() if not v]
assert m['counts']=={'roster':16,'events':5,'eventSections':17,'menuWorlds':3,'menuItems':88}
PY

rm -rf "${LOCAL_DIR}"
mkdir -p "${LOCAL_DIR}"
cp -a "${SITE_DIR}/." "${LOCAL_DIR}/"
mkdir -p "${LOCAL_DIR}/api/menu" "${LOCAL_DIR}/api/schedule"
cp "${LOCAL_DIR}/content/menu-snapshot.json" "${LOCAL_DIR}/api/menu/index.html"
cp "${LOCAL_DIR}/content/schedule-snapshot.json" "${LOCAL_DIR}/api/schedule/index.html"
python -m http.server 4173 --directory "${LOCAL_DIR}" >/tmp/magicoffice-v43-final-http.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 40); do
  curl -fsS http://127.0.0.1:4173/ >/dev/null && break
  sleep 1
done
BASE_URL=http://127.0.0.1:4173/ SCREEN_DIR=/tmp/magicoffice-v43-final-local-evidence REQUIRE_VIDEO_PLAYBACK=0 node deploy-v43-final/test.mjs
kill "${SERVER_PID}" || true

mkdir -p "${SITE_DIR}/.vercel"
printf '%s\n' '{"orgId":"team_44tkvxP20I5s9SUmlxfUEQM1","projectId":"prj_JcF9cms6IGKkWJJsCaOWkwVVzA9D"}' > "${SITE_DIR}/.vercel/project.json"

curl -fsS -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  "https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&target=production&limit=1&teamId=${TEAM_ID}" \
  -o /tmp/magicoffice-v43-previous.json
PREVIOUS_HOST="$(python -c 'import json; d=json.load(open("/tmp/magicoffice-v43-previous.json")); print(d["deployments"][0]["url"])')"
test -n "${PREVIOUS_HOST}"
PREVIOUS_URL="https://${PREVIOUS_HOST}"

cd "${SITE_DIR}"
npx vercel deploy --yes --archive=tgz --token "${VERCEL_TOKEN}" 2>&1 | tee /tmp/magicoffice-v43-preview-deploy.log
PREVIEW_URL="$(grep -Eo 'https://[^[:space:]]+\.vercel\.app' /tmp/magicoffice-v43-preview-deploy.log | tail -1)"
test -n "${PREVIEW_URL}"

npx vercel inspect "${PREVIEW_URL}" --token "${VERCEL_TOKEN}" > /tmp/magicoffice-v43-preview-inspect.txt
npx vercel curl / --deployment "${PREVIEW_URL}" --token "${VERCEL_TOKEN}" > /tmp/magicoffice-v43-preview-home.html
grep -q "${RELEASE}" /tmp/magicoffice-v43-preview-home.html
npx vercel curl /content/roster.json --deployment "${PREVIEW_URL}" --token "${VERCEL_TOKEN}" > /tmp/magicoffice-v43-preview-roster.json
npx vercel curl /content/events.json --deployment "${PREVIEW_URL}" --token "${VERCEL_TOKEN}" > /tmp/magicoffice-v43-preview-events.json
npx vercel curl /content/menu-snapshot.json --deployment "${PREVIEW_URL}" --token "${VERCEL_TOKEN}" > /tmp/magicoffice-v43-preview-menu.json
python - <<'PY'
import json
r=json.load(open('/tmp/magicoffice-v43-preview-roster.json',encoding='utf-8'))
e=json.load(open('/tmp/magicoffice-v43-preview-events.json',encoding='utf-8'))
m=json.load(open('/tmp/magicoffice-v43-preview-menu.json',encoding='utf-8'))
assert len([p for p in r['people'] if p.get('active',True)])==16
assert len(e['events'])==5
assert len(m['worlds'])==3
PY

npx vercel promote "${PREVIEW_URL}" --yes --token "${VERCEL_TOKEN}" 2>&1 | tee /tmp/magicoffice-v43-promote.log
PROMOTED=1

READY=0
for i in $(seq 1 80); do
  if curl -fsS --max-time 30 "${OFFICIAL_URL}/?release-check=${RELEASE}-$(date +%s)" | grep -q "${RELEASE}"; then
    READY=1
    break
  fi
  sleep 3
done
test "${READY}" = "1"

BASE_URL="${OFFICIAL_URL}/?browser-check=${RELEASE}-$(date +%s)" SCREEN_DIR=/tmp/magicoffice-v43-final-production-evidence REQUIRE_VIDEO_PLAYBACK=0 node "${GITHUB_WORKSPACE}/deploy-v43-final/test.mjs"

curl -fsS -L -H 'Range: bytes=0-1023' -D /tmp/magicoffice-v43-video-headers.txt \
  "${OFFICIAL_URL}/assets/video/hero-trial-12s-with-audio.mp4?range-check=${RELEASE}" \
  -o /tmp/magicoffice-v43-video-range.bin
grep -Eiq '^HTTP/.* (200|206)' /tmp/magicoffice-v43-video-headers.txt
grep -Eiq '^content-type: *video/mp4' /tmp/magicoffice-v43-video-headers.txt
python -c 'from pathlib import Path; data=Path("/tmp/magicoffice-v43-video-range.bin").read_bytes(); assert b"ftyp" in data[:80]'

CURRENT_ID=""
for i in $(seq 1 30); do
  curl -fsS -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    "https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&target=production&limit=1&teamId=${TEAM_ID}" \
    -o /tmp/magicoffice-v43-current-production.json
  CURRENT_ID="$(python -c 'import json; d=json.load(open("/tmp/magicoffice-v43-current-production.json")); print(d["deployments"][0]["uid"])')"
  CURRENT_HOST="$(python -c 'import json; d=json.load(open("/tmp/magicoffice-v43-current-production.json")); print(d["deployments"][0]["url"])')"
  if [ "https://${CURRENT_HOST}" != "${PREVIOUS_URL}" ]; then break; fi
  sleep 2
done
test -n "${CURRENT_ID}"
test "https://${CURRENT_HOST}" != "${PREVIOUS_URL}"

export PREVIOUS_URL PREVIEW_URL CURRENT_ID CURRENT_HOST
python - <<'PY'
import json, os, time
receipt={
  'release':os.environ['RELEASE'],
  'officialUrl':os.environ['OFFICIAL_URL'],
  'previewUrl':os.environ['PREVIEW_URL'],
  'productionDeploymentId':os.environ['CURRENT_ID'],
  'productionDeploymentUrl':'https://'+os.environ['CURRENT_HOST'],
  'previousProduction':os.environ['PREVIOUS_URL'],
  'verified':True,
  'verifiedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
}
json.dump(receipt,open('/tmp/magicoffice-v43-production-receipt.json','w'),ensure_ascii=False,indent=2)
print(json.dumps(receipt,ensure_ascii=False,indent=2))
PY

PROMOTED=0
trap - ERR
