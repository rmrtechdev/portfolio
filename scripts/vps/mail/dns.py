"""Upserts rmrtech.dev's mail DNS records. Runs on the VPS: the Cloudflare token never leaves it.

usage: python3 dns.py [dkim-txt-file]
Refuses to replace an MX or apex SPF record that points somewhere else (e.g. Cloudflare Email Routing).
"""
import json
import re
import sys
import urllib.request

ZONE = "rmrtech.dev"
IP = "147.93.146.215"
TOKEN = re.search(r"=\s*(\S+)", open("/srv/mail/cloudflare.ini").read()).group(1)
API = "https://api.cloudflare.com/client/v4"


def call(path, data=None, method="GET"):
    req = urllib.request.Request(API + path, method=method, data=data and json.dumps(data).encode(),
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    try:
        body = json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        body = json.load(e)
    if not body["success"]:
        sys.exit(f"{method} {path}: {body['errors']}")
    return body["result"]


zone = call(f"/zones?name={ZONE}")[0]["id"]
existing = call(f"/zones/{zone}/dns_records?per_page=500")


def upsert(type_, name, content, match=None, **extra):
    """Replaces the record of this type/name whose content satisfies `match`, else creates one."""
    same = [r for r in existing if r["type"] == type_ and r["name"] == name and (match is None or match(r["content"]))]
    rec = {"type": type_, "name": name, "content": content, "ttl": 300, **extra}
    if same and same[0]["content"].strip('"') == content and all(same[0].get(k) == v for k, v in extra.items()):
        print(f"ok      {type_} {name}")
    elif same:
        call(f"/zones/{zone}/dns_records/{same[0]['id']}", rec, "PUT")
        print(f"updated {type_} {name}")
    else:
        call(f"/zones/{zone}/dns_records", rec, "POST")
        print(f"created {type_} {name}")


foreign_mx = [r["content"] for r in existing if r["type"] == "MX" and r["name"] == ZONE and r["content"] != f"mail.{ZONE}"]
foreign_spf = [r["content"] for r in existing if r["type"] == "TXT" and r["name"] == ZONE
               and "v=spf1" in r["content"] and r["content"].strip('"') != "v=spf1 mx -all"]
if foreign_mx or foreign_spf:
    sys.exit(f"refusing: {ZONE} already routes mail elsewhere (MX {foreign_mx}, SPF {foreign_spf}); resolve by hand")

# Mail can't ride Cloudflare's proxy or the tunnel, so this one name points straight at the VPS.
upsert("A", f"mail.{ZONE}", IP, proxied=False)
upsert("MX", ZONE, f"mail.{ZONE}", priority=10)
upsert("TXT", ZONE, "v=spf1 mx -all", match=lambda c: "v=spf1" in c)
upsert("TXT", f"mail.{ZONE}", "v=spf1 a -all", match=lambda c: "v=spf1" in c)
upsert("TXT", f"_dmarc.{ZONE}", f"v=DMARC1; p=quarantine; adkim=s; aspf=s; rua=mailto:dmarc@{ZONE}",
       match=lambda c: "v=DMARC1" in c)
if len(sys.argv) > 1:
    # Rspamd writes the bare record; OpenDKIM writes a quoted BIND snippet. Cloudflare wants the joined string.
    raw = open(sys.argv[1]).read()
    dkim = "".join(re.findall(r'"([^"]*)"', raw)) or raw.strip()
    upsert("TXT", f"mail._domainkey.{ZONE}", dkim, match=lambda c: "v=DKIM1" in c)
