#!/usr/bin/env bash
# Builds the site for the VPS and syncs it into the rmrtech-site container's web root.
# Touches only /srv/rmrtech/site; the client stack on the same host (sf-*) is never involved.
set -euo pipefail

HOST="${VPS_HOST:-root@147.93.146.215}"
KEY="${VPS_KEY:-$HOME/.ssh/vps_key}"
ROOT=/srv/rmrtech/site
SSH=(ssh -i "$KEY" -o BatchMode=yes)

cd "$(dirname "$0")/.."
"${SSH[@]}" "$HOST" "test -s /srv/rmrtech/contact.env" || { echo "refusing: /srv/rmrtech/contact.env (form@rmrtech.dev SMTP_PASS) is missing" >&2; exit 1; }
# The VPS serves from the domain root; the default base is for GitHub Pages.
./node_modules/.bin/vite build --base=/ --outDir dist-rmrtech --emptyOutDir

if find dist-rmrtech -name '*.glb' | grep -q .; then
  echo "refusing to deploy: a plain .glb is in the build" >&2
  exit 1
fi

stamp=$("${SSH[@]}" "$HOST" date +%Y%m%d-%H%M%S)
"${SSH[@]}" "$HOST" "cp -a $ROOT $ROOT.bak-$stamp"
# Synced in place: the container bind-mounts this directory, so replacing it would strand nginx on the old one.
rsync -a --delete --delay-updates -e "${SSH[*]}" dist-rmrtech/ "$HOST:$ROOT/"

# Compose, nginx and the contact form follow the repo too; `up -d` only restarts what changed.
rsync -a -e "${SSH[*]}" scripts/vps/docker-compose.yml scripts/vps/nginx.conf "$HOST:/srv/rmrtech/"
rsync -a --delete --exclude test_app.py --exclude __pycache__ -e "${SSH[*]}" scripts/vps/contact/ "$HOST:/srv/rmrtech/contact/"
# app.py is a mounted file, which `up -d` doesn't notice changing, so the form service always restarts.
"${SSH[@]}" "$HOST" "cd /srv/rmrtech && docker compose up -d && docker compose restart contact"
"${SSH[@]}" "$HOST" "curl -fsS -o /dev/null http://127.0.0.1:8090/ && echo 'origin OK' && ls -d $ROOT.bak-* | head -n -3 | xargs -r rm -rf"

echo "deployed; backup at $ROOT.bak-$stamp"
