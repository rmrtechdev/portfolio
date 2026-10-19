"""Contact form relay for rmrtech.dev: POST /api/contact -> an email to roman@rmrtech.dev.

Sends through mail.rmrtech.dev as the send-only form@rmrtech.dev login. Unauthenticated mail from this host
would fail the domain's own SPF/DMARC and be greylisted, so the form logs in like any mail client.
Standard library only; configured by SMTP_USER and SMTP_PASS (contact.env on the VPS).
"""

import json
import os
import re
import smtplib
import ssl
import sys
import threading
import time
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SMTP_HOST = os.environ.get("SMTP_HOST", "mail.rmrtech.dev")
SMTP_USER = os.environ.get("SMTP_USER", "form@rmrtech.dev")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
TO = os.environ.get("CONTACT_TO", "roman@rmrtech.dev")

MAX_BODY = 16 * 1024
LIMITS = {"name": 100, "email": 200, "subject": 200, "message": 5000}
EMAIL_RE = re.compile(r"^[^\s@<>,;\"]+@[^\s@<>,;\"]+\.[^\s@<>,;\"]+$")
CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")

PER_IP = (5, 3600)
GLOBAL = (60, 3600)
_hits = {}
_lock = threading.Lock()


def allowed(ip, now=None):
    """Sliding-window limit: PER_IP sends per address and GLOBAL sends overall, per hour."""
    now = now or time.time()
    with _lock:
        for key, (cap, window) in ((ip, PER_IP), ("*", GLOBAL)):
            recent = [t for t in _hits.get(key, []) if now - t < window]
            _hits[key] = recent
            if len(recent) >= cap:
                return False
        _hits[ip].append(now)
        _hits["*"].append(now)
        return True


def clean(data):
    """Validated fields, or an error string. Header fields lose control characters, so they cannot add headers."""
    if not isinstance(data, dict):
        return "bad request"
    out = {}
    for key, cap in LIMITS.items():
        value = data.get(key, "")
        if not isinstance(value, str) or len(value) > cap:
            return f"{key} too long"
        out[key] = value.strip() if key == "message" else CONTROL_RE.sub(" ", value).strip()
    if not EMAIL_RE.match(out["email"]):
        return "invalid email"
    return out


def compose(f):
    msg = EmailMessage()
    msg["From"] = formataddr(("rmrtech.dev contact form", SMTP_USER))
    msg["To"] = TO
    msg["Reply-To"] = formataddr((f["name"], f["email"]))
    msg["Subject"] = f"[rmrtech.dev] {f['subject'] or 'New message'}"
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="rmrtech.dev")
    msg.set_content(f"From: {f['name'] or '(no name)'} <{f['email']}>\n\n{f['message'] or '(no message)'}\n")
    return msg


def send(msg):
    with smtplib.SMTP(SMTP_HOST, 587, timeout=20) as s:
        s.starttls(context=ssl.create_default_context())
        s.login(SMTP_USER, SMTP_PASS)
        s.send_message(msg)


class Handler(BaseHTTPRequestHandler):
    def reply(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/api/contact":
            return self.reply(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_BODY:
            return self.reply(413, {"error": "too large"})
        try:
            data = json.loads(self.rfile.read(length))
        except ValueError:
            return self.reply(400, {"error": "bad request"})
        fields = clean(data)
        if isinstance(fields, str):
            return self.reply(400, {"error": fields})
        # cloudflared is the only way in, and it always sets the visitor's address here.
        ip = self.headers.get("CF-Connecting-IP") or self.client_address[0]
        if not allowed(ip):
            return self.reply(429, {"error": "too many messages, try again later"})
        try:
            send(compose(fields))
        except (smtplib.SMTPException, OSError) as e:
            print(f"send failed: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
            return self.reply(502, {"error": "could not send"})
        return self.reply(200, {"ok": True})

    def do_GET(self):
        self.reply(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        # Status line only: no bodies or visitor addresses in the logs.
        print(f"{self.command} {self.path} {args[1] if len(args) > 1 else ''}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    if not SMTP_PASS:
        sys.exit("SMTP_PASS is not set")
    ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
