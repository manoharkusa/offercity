"""Dump BigRock MySQL database via SSH"""
import paramiko, os, sys

key = paramiko.Ed25519Key.from_private_key_file("/tmp/br_key")
c   = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())

host = os.environ["SSH_HOST"].strip()
user = os.environ["SSH_USER"].strip()
print(f"Connecting to {host} as {user} port 22...")
c.connect(hostname=host, username=user, pkey=key, port=22, timeout=30)
print("SSH connected OK")

def sh(cmd, timeout=30):
    _, o, e = c.exec_command(cmd, timeout=timeout)
    o.channel.set_combine_stderr(False)
    out = o.read().decode(errors="replace").strip()
    err = e.read().decode(errors="replace").strip()
    return out, err

# Verify connection with simple command
out, err = sh("echo OK && whoami && pwd")
print("Shell test:", out)

# Find .env files
out, err = sh(
    "cat /home1/a1751tyi/public_html/server/.env 2>/dev/null; "
    "echo '---ENV2---'; "
    "cat /home1/a1751tyi/staging.offerscity.co.in/server/.env 2>/dev/null; "
    "echo '---ENV3---'; "
    "cat /home1/a1751tyi/.env 2>/dev/null"
)
print("Env files:", out[:500])

db_user = "a1751tyi_offeruser"
db_pass = ""
db_name = "a1751tyi_offerscity"
for line in out.splitlines():
    parts = line.split("=", 1)
    if len(parts) < 2:
        continue
    k, v = parts[0].strip(), parts[1].strip().strip("\"'")
    if k == "DB_USER":                   db_user = v
    if k in ("DB_PASS", "DB_PASSWORD"):  db_pass = v
    if k == "DB_NAME":                   db_name = v

print(f"Using DB={db_name} user={db_user} pass={'YES' if db_pass else 'EMPTY'}")

# Check mysqldump exists
out, err = sh("which mysqldump || echo 'not found'")
print("mysqldump path:", out)

# Run dump — try with password, then without
if db_pass:
    pass_arg = "-p'" + db_pass + "'"
else:
    pass_arg = ""

cmd = f"mysqldump -u{db_user} {pass_arg} --single-transaction {db_name}"
print("Running dump...")
out, err = sh(cmd, timeout=180)
print(f"Dump stdout: {len(out)} bytes, stderr: {err[:300] if err else 'none'}")

# Check if dump looks valid
if "CREATE TABLE" not in out and "INSERT INTO" not in out:
    # Try without --single-transaction
    cmd2 = f"mysqldump -u{db_user} {pass_arg} {db_name}"
    print("Retrying without --single-transaction...")
    out, err = sh(cmd2, timeout=180)
    print(f"Retry dump: {len(out)} bytes")

if len(out) < 200:
    print("FAIL: dump too small. Last output:", out[-500:])
    sys.exit(1)

with open("/tmp/bigrock_dump.sql", "w") as f:
    f.write(out)
print(f"Saved {len(out):,} bytes to /tmp/bigrock_dump.sql")
c.close()
