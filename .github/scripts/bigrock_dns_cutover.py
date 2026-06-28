"""Inspect and (if possible) edit BigRock cPanel DNS A records to point to EC2."""
import paramiko, os, sys

NEW_IP = "3.110.190.182"
OLD_IP = "192.185.129.210"
DOMAIN = "offerscity.co.in"

key = paramiko.Ed25519Key.from_private_key_file("/tmp/br_key")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
host = os.environ["SSH_HOST"].strip()
user = os.environ["SSH_USER"].strip()
print(f"Connecting to {host} as {user}...")
c.connect(hostname=host, username=user, pkey=key, port=22, timeout=30)
print("SSH connected OK\n")

def sh(cmd, timeout=60):
    _, o, e = c.exec_command(cmd, timeout=timeout)
    o.channel.set_combine_stderr(False)
    return o.read().decode(errors="replace"), e.read().decode(errors="replace")

out, _ = sh("whoami; echo '---'; hostname")
print("Identity:", out.strip(), "\n")

# 1) Try to fetch the zone records via cpapi2 (cPanel account-level DNS control)
print("=== Attempt: cpapi2 ZoneEdit fetchzone_records (A records) ===")
out, err = sh(f"cpapi2 --user={user} ZoneEdit fetchzone_records domain={DOMAIN} type=A 2>&1")
print(out[:3000])
if err.strip():
    print("STDERR:", err[:800])

# 2) Also try UAPI DNS (newer cPanel)
print("\n=== Attempt: uapi DNS lookup ===")
out2, err2 = sh(f"uapi --output=jsonpretty DNS lookup domain={DOMAIN} 2>&1")
print(out2[:2000])
if err2.strip():
    print("STDERR:", err2[:800])

# 3) Check if a local named zone file exists (some cPanel setups keep one)
print("\n=== Local zone file check ===")
out3, _ = sh(f"ls -la /var/named/{DOMAIN}.db 2>&1; echo '---'; cat /var/named/{DOMAIN}.db 2>&1 | head -40")
print(out3[:2000])

c.close()
print("\nDone — inspection complete.")
