#!/usr/bin/env bash
# Re-issues the rmrtech-dev tunnel token from Cloudflare and restarts only the tunnel container.
# Run when rmrtech.dev answers 530 and the tunnel logs "Invalid tunnel secret" (the secret was rotated).
set -euo pipefail

HOST="${VPS_HOST:-root@147.93.146.215}"
KEY="${VPS_KEY:-$HOME/.ssh/vps_key}"
ACCOUNT=bcbaa0701509f7c458762fa765d82f75
TUNNEL=26c4ed45-e14e-425a-8527-3ce9dd35921d

# Refreshes the wrangler OAuth login (it carries connectivity:admin) before reading it.
npx -y wrangler@4 whoami >/dev/null
oauth=$(sed -n 's/^oauth_token = "\(.*\)"/\1/p' "$HOME/Library/Preferences/.wrangler/config/default.toml")
token=$(curl -fsS -H "Authorization: Bearer $oauth" "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL/token" |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["result"])')

scp -q -i "$KEY" -o BatchMode=yes "$(dirname "$0")/vps/docker-compose.yml" "$HOST:/srv/rmrtech/docker-compose.yml"
# Over stdin, so the token never appears in a process list or shell history. Containers first started
# by hand (no compose label) are replaced once; after that only the tunnel is recreated.
printf 'TUNNEL_TOKEN=%s\n' "$token" | ssh -i "$KEY" -o BatchMode=yes "$HOST" '
  set -e
  umask 077 && cat > /srv/rmrtech/tunnel.env
  cd /srv/rmrtech
  for c in rmrtech-site rmrtech-tunnel; do
    [ -z "$(docker inspect -f "{{index .Config.Labels \"com.docker.compose.project\"}}" $c 2>/dev/null)" ] && docker rm -f $c >/dev/null 2>&1 || true
  done
  docker compose up -d
  docker compose up -d --force-recreate tunnel'

sleep 8
curl -fsS -o /dev/null -w 'rmrtech.dev %{http_code}\n' https://rmrtech.dev/
