"""Dump BigRock MySQL database via SSH and save to /tmp/bigrock_dump.sql"""
import paramiko, os, sys

key = paramiko.Ed25519Key.from_private_key_file("/tmp/br_key")
c   = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting to BigRock...")
c.connect(os.environ["SSH_HOST"], username=os.environ["SSH_USER"], pkey=key, timeout=30)
print("Connected!")

# Find DB credentials from .env files
_, o, _ = c.exec_command(
    "cat /home1/a1751tyi/public_html/server/.env 2>/dev/null; "
    "cat /home1/a1751tyi/staging.offerscity.co.in/server/.env 2>/dev/null; "
    "cat /home1/a1751tyi/.env 2>/dev/null"
)
env_content = o.read().decode()
print("Found .env:", len(env_content), "bytes")

db_user = "a1751tyi_offeruser"
db_pass = ""
db_name = "a1751tyi_offerscity"
for line in env_content.splitlines():
    parts = line.split("=", 1)
    if len(parts) < 2:
        continue
    k, v = parts[0].strip(), parts[1].strip().strip("\"'")
    if k == "DB_USER":     db_user = v
    if k in ("DB_PASS", "DB_PASSWORD"): db_pass = v
    if k == "DB_NAME":     db_name = v

print("DB:", db_name, "user:", db_user, "pass:", "(set)" if db_pass else "(empty)")

pass_arg = "-p'" + db_pass + "'" if db_pass else ""
cmd = "mysqldump -u" + db_user + " " + pass_arg + " --single-transaction --routines " + db_name
print("Running mysqldump...")
_, o, e = c.exec_command(cmd, timeout=180)
o.channel.set_combine_stderr(False)
sql = o.read().decode(errors="replace")
err = e.read().decode(errors="replace")
if err.strip():
    print("STDERR:", err[:1000])
print("Dump size:", len(sql), "bytes")

if len(sql) < 200:
    print("ERROR: dump too small — failed")
    sys.exit(1)

with open("/tmp/bigrock_dump.sql", "w") as f:
    f.write(sql)
print("Saved to /tmp/bigrock_dump.sql")
c.close()
