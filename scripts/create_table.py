# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Create the "Interface Feedback" table that feedback.tsx writes to.

    AIRTABLE_PAT=pat... uv run scripts/create_table.py appXXXXXXXXXXXXXX [--name "Interface Feedback"]

The token needs schema.bases:write on that base. Safe to re-run: if the table exists, any missing fields are added.
"""
import argparse, json, os, sys, urllib.request, urllib.error

LONG = {"type": "multilineText"}
FIELDS = [
    {"name": "Comment", **LONG},  # primary field
    {"name": "Status", "type": "singleSelect", "options": {"choices": [
        {"name": "Open", "color": "yellowLight2"}, {"name": "In Progress", "color": "blueLight2"},
        {"name": "Resolved", "color": "greenLight2"}, {"name": "Won't Fix", "color": "grayLight2"}]}},
    {"name": "Page", "type": "singleLineText"},
    {"name": "Context", **LONG},
    {"name": "Element", "type": "singleLineText"},
    {"name": "Element Text", **LONG},
    {"name": "Left By", "type": "singleLineText"},
    {"name": "Left By Email", "type": "email"},
    {"name": "Replies", **LONG},
    {"name": "Resolution", **LONG},
    {"name": "Build", "type": "singleLineText"},
    {"name": "Anchor", "type": "singleLineText"},
    {"name": "Position", "type": "singleLineText"},
    {"name": "Technical Detail", **LONG},
    {"name": "Created", "type": "createdTime", "options": {"result": {"type": "dateTime", "options": {
        "dateFormat": {"name": "iso"}, "timeFormat": {"name": "24hour"}, "timeZone": "client"}}}},
]


def call(method, url, token, body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {url} → {e.code}: {e.read().decode()}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base_id")
    ap.add_argument("--name", default="Interface Feedback")
    a = ap.parse_args()
    token = os.environ.get("AIRTABLE_PAT") or sys.exit("Set AIRTABLE_PAT")
    api = f"https://api.airtable.com/v0/meta/bases/{a.base_id}/tables"
    existing = next((t for t in call("GET", api, token)["tables"] if t["name"] == a.name), None)
    if not existing:
        t = call("POST", api, token, {"name": a.name, "description": "Review notes left on custom interfaces (airtable-interface-feedback).", "fields": FIELDS})
        print(f"Created {a.name} ({t['id']}) with {len(t['fields'])} fields")
        return
    have = {f["name"] for f in existing["fields"]}
    missing = [f for f in FIELDS if f["name"] not in have]
    for f in missing:
        call("POST", f"{api}/{existing['id']}/fields", token, f)
        print("added", f["name"])
    print(f"{a.name} ({existing['id']}) up to date" + ("" if missing else " — nothing to add"))


if __name__ == "__main__":
    main()
