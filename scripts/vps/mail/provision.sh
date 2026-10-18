#!/usr/bin/env bash
# Stands up mail.rmrtech.dev on the VPS under /srv/mail, idempotently. Needs /srv/mail/cloudflare.ini
# (a token limited to DNS edit on rmrtech.dev). Touches nothing outside /srv/mail except ufw rules
# for the four mail ports and one systemd timer for certificate renewal.
set -euo pipefail

HOST="${VPS_HOST:-root@147.93.146.215}"
KEY="${VPS_KEY:-$HOME/.ssh/vps_key}"
SSH=(ssh -i "$KEY" -o BatchMode=yes)
HERE="$(cd "$(dirname "$0")" && pwd)"

scp -q -i "$KEY" -o BatchMode=yes "$HERE/compose.yaml" "$HERE/dns.py" "$HOST:/srv/mail/"

"${SSH[@]}" "$HOST" bash -s <<'REMOTE'
set -euo pipefail
cd /srv/mail
test -s cloudflare.ini || { echo "missing /srv/mail/cloudflare.ini" >&2; exit 1; }
chmod 600 cloudflare.ini
mkdir -p data/config certs
# The token is IP-filtered to the IPv4 address; Docker egresses over IPv4, the host prefers IPv6.
dns() { docker run --rm -v /srv/mail:/srv/mail -w /srv/mail python:3.13-alpine python dns.py "$@"; }

dns

# DNS-01, because port 80 belongs to the client's nginx.
if [ ! -e certs/live/mail.rmrtech.dev/fullchain.pem ]; then
  docker run --rm -v /srv/mail/certs:/etc/letsencrypt -v /srv/mail/cloudflare.ini:/cloudflare.ini:ro \
    certbot/dns-cloudflare:v5.8.0 certonly --dns-cloudflare --dns-cloudflare-credentials /cloudflare.ini \
    --dns-cloudflare-propagation-seconds 30 -d mail.rmrtech.dev --key-type ecdsa \
    --agree-tos --no-eff-email -m postmaster@rmrtech.dev --non-interactive
fi

cat > /etc/systemd/system/mail-cert-renew.service <<'UNIT'
[Unit]
Description=Renew mail.rmrtech.dev certificate (DNS-01)
[Service]
Type=oneshot
ExecStart=/usr/bin/docker run --rm -v /srv/mail/certs:/etc/letsencrypt -v /srv/mail/cloudflare.ini:/cloudflare.ini:ro certbot/dns-cloudflare:v5.8.0 renew --dns-cloudflare --dns-cloudflare-credentials /cloudflare.ini --non-interactive
UNIT
cat > /etc/systemd/system/mail-cert-renew.timer <<'UNIT'
[Unit]
Description=Twice-daily mail certificate renewal check
[Timer]
OnCalendar=*-*-* 03,15:17
RandomizedDelaySec=1h
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now mail-cert-renew.timer >/dev/null

for p in 25 465 587 993; do ufw allow "$p/tcp" comment "mailserver" >/dev/null; done

docker compose up -d
# Dovecot and Postfix don't come up until an account exists, so create it before waiting on ports.

# Admin inbox: generated once and kept root-only on the server; never printed.
if ! grep -qs '^roman@rmrtech.dev|' data/config/postfix-accounts.cf; then
  umask 077
  head -c 24 /dev/urandom | base64 | tr -d '/+=' > admin-password
  docker exec -i mailserver setup email add roman@rmrtech.dev "$(cat admin-password)"
fi
for a in postmaster abuse dmarc; do
  grep -qs "^$a@rmrtech.dev " data/config/postfix-virtual.cf || docker exec mailserver setup alias add "$a@rmrtech.dev" roman@rmrtech.dev
done

dkim=data/config/rspamd/dkim/rsa-2048-mail-rmrtech.dev.public.dns.txt
[ -e "$dkim" ] || docker exec mailserver setup config dkim keysize 2048 domain rmrtech.dev
dns "$dkim"
docker compose up -d --force-recreate mailserver >/dev/null 2>&1
for i in $(seq 90); do docker exec mailserver ss -ltn 2>/dev/null | grep -q ':993 ' && break; sleep 2; done
docker exec mailserver ss -ltn | grep -q ':993 ' || { echo "mailserver did not come up" >&2; exit 1; }
echo provisioned
REMOTE
