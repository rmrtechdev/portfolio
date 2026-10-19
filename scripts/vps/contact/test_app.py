"""Checks the contact relay without a mail server: python3 scripts/vps/contact/test_app.py"""

import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import app

sent = []
app.send = sent.append
server = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{server.server_port}/api/contact"


def post(body, ip="1.1.1.1", raw=None):
    req = urllib.request.Request(URL, data=raw or json.dumps(body).encode(), headers={"Content-Type": "application/json", "CF-Connecting-IP": ip})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


ok = {"name": "Ada", "email": "ada@example.com", "subject": "[Brief] Web · ASAP", "message": "Hi\nthere"}

assert post(ok) == 200
msg = sent[-1]
assert msg["To"] == "roman@rmrtech.dev" and msg["Reply-To"] == "Ada <ada@example.com>"
assert msg["From"].addresses[0].addr_spec == "form@rmrtech.dev"
assert "Hi\nthere" in msg.get_content()

# A visitor can't add recipients or headers through any field.
assert post({**ok, "subject": "x\r\nBcc: victim@example.com"}, ip="2.2.2.2") == 200
assert "Bcc" not in sent[-1] and "\n" not in sent[-1]["Subject"]
assert post({**ok, "email": "a@b.com\nBcc: c@d.com"}, ip="3.3.3.3") == 400
assert post({**ok, "email": "a@b.com, c@d.com"}, ip="3.3.3.3") == 400

assert post({**ok, "email": "nope"}, ip="4.4.4.4") == 400
assert post({**ok, "message": "x" * 5001}, ip="4.4.4.4") == 400
assert post(None, ip="4.4.4.4", raw=b"not json") == 400
assert post(None, ip="4.4.4.4", raw=b"x" * (17 * 1024)) == 413

# Five an hour per visitor; the sixth is refused and nothing more is sent.
for _ in range(5):
    assert post(ok, ip="9.9.9.9") == 200
before = len(sent)
assert post(ok, ip="9.9.9.9") == 429
assert len(sent) == before
assert post(ok, ip="8.8.8.8") == 200

print("contact relay: all checks passed")
