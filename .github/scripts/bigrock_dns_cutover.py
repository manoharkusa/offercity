"""Parse BigRock cPanel DNS zone, then optionally edit A records to point to EC2.

Phase controlled by env COMMIT=1. Without it, only parse + report (dry run).
"""
import paramiko, os, sys, json, base64

NEW_IP = "3.110.190.182"
OLD_IP = "192.185.129.210"
DOMAIN = "offerscity.co.in"
COMMIT = os.environ.get("COMMIT") == "1"

key = paramiko.Ed25519Key.from_private_key_file("/tmp/br_key")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
host = os.environ["SSH_HOST"].strip()
user = os.environ["SSH_USER"].strip()
print(f"Connecting to {host}...  COMMIT={COMMIT}")
c.connect(hostname=host, username=user, pkey=key, port=22, timeout=30)
print("SSH connected OK\n")

def sh(cmd, timeout=60):
    _, o, e = c.exec_command(cmd, timeout=timeout)
    o.channel.set_combine_stderr(False)
    return o.read().decode(errors="replace"), e.read().decode(errors="replace")

def b64d(s):
    try:
        return base64.b64decode(s).decode(errors="replace")
    except Exception:
        return s

# --- Parse the zone ---
out, err = sh(f"uapi --output=json DNS parse_zone zone={DOMAIN}")
if err.strip():
    print("parse_zone STDERR:", err[:500])
try:
    parsed = json.loads(out)
except Exception as ex:
    print("Could not parse JSON:", ex)
    print(out[:3000])
    sys.exit(1)

records = parsed["result"]["data"]
serial = None
a_records = []
print("=== A / SOA records in zone ===")
for r in records:
    rtype = r.get("record_type", "")
    if rtype == "SOA":
        # serial may be in data_b64 array or a 'serial' field
        data = [b64d(x) for x in r.get("data_b64", [])]
        print("SOA data:", data)
    if rtype == "A":
        dname = b64d(r.get("dname_b64", ""))
        data = [b64d(x) for x in r.get("data_b64", [])]
        li = r.get("line_index")
        ttl = r.get("ttl")
        a_records.append({"dname": dname, "data": data, "line_index": li, "ttl": ttl})
        print(f"  A  line={li}  ttl={ttl}  {dname} -> {data}")

# Get serial via the dedicated field if present
serial = parsed["result"].get("metadata", {}).get("serial")
# Fallback: re-read serial from SOA record structure
if serial is None:
    for r in records:
        if r.get("record_type") == "SOA":
            serial = r.get("serial")
print("\nZone serial:", serial)

# --- Identify records to change (root @ and www currently on OLD_IP) ---
targets = [r for r in a_records if OLD_IP in r["data"]]
print(f"\nRecords pointing to {OLD_IP} (to be changed -> {NEW_IP}):")
for t in targets:
    print(f"  line={t['line_index']}  {t['dname']} -> {t['data']}")

if not targets:
    print("\nNo A records on OLD_IP. Maybe already migrated? Listing all A above.")

if not COMMIT:
    print("\n[DRY RUN] COMMIT not set — no changes made.")
    c.close()
    sys.exit(0)

# --- Commit edits via mass_edit_zone ---
if serial is None:
    print("ERROR: no serial found, cannot safely edit.")
    sys.exit(1)

edit_args = ""
for t in targets:
    edit_obj = {
        "line_index": t["line_index"],
        "dname": t["dname"],
        "ttl": int(t["ttl"]) if t["ttl"] else 300,
        "record_type": "A",
        "data": [NEW_IP],
    }
    edit_json = json.dumps(edit_obj)
    edit_args += f" edit='{edit_json}'"

cmd = f"uapi --output=json DNS mass_edit_zone zone={DOMAIN} serial={serial}{edit_args}"
print("\nRunning mass_edit_zone...")
out, err = sh(cmd)
print("RESULT:", out[:2000])
if err.strip():
    print("STDERR:", err[:800])

res = {}
try:
    res = json.loads(out)
except Exception:
    pass
status = res.get("result", {}).get("status")
if status != 1:
    print("EDIT FAILED — status:", status, "errors:", res.get("result", {}).get("errors"))
    sys.exit(1)

print("\nEdit succeeded. Re-reading zone to confirm...")
out2, _ = sh(f"uapi --output=json DNS parse_zone zone={DOMAIN}")
try:
    recs2 = json.loads(out2)["result"]["data"]
    for r in recs2:
        if r.get("record_type") == "A":
            dn = b64d(r.get("dname_b64", ""))
            dt = [b64d(x) for x in r.get("data_b64", [])]
            print(f"  A  {dn} -> {dt}")
except Exception as ex:
    print("verify parse error:", ex)

c.close()
print("\nDone.")
