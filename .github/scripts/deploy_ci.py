"""
CI deploy script — runs inside GitHub Actions.
Reads SSH credentials from environment variables (GitHub Secrets).
Uses paramiko so it works with older cPanel SSH key exchange algorithms.
"""
import os, time, paramiko

HOST     = os.environ["SSH_HOST"].strip()
USER     = os.environ["SSH_USER"].strip()
KEY_PATH = os.environ.get("SSH_KEY_PATH", "/tmp/ci_key").strip()

HOME_REMOTE  = "/home1/a1751tyi"
WEB          = f"{HOME_REMOTE}/public_html"
DIST_REMOTE  = f"{WEB}/client/dist"
APP          = f"{WEB}/server"

# ── Load private key from file (Ed25519, no passphrase) ───────────────────────
key = paramiko.Ed25519Key.from_private_key_file(KEY_PATH)

# ── Connect ────────────────────────────────────────────────────────────────────
print(f"Connecting to {HOST}...")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(hostname=HOST, username=USER, pkey=key, port=22, timeout=30)
print("Connected.\n")

def sh(cmd, label="", timeout=60):
    if label:
        print(f"--- {label} ---")
    _, o, _ = c.exec_command(cmd, timeout=timeout)
    o.channel.set_combine_stderr(True)
    try:
        out = o.read().decode("utf-8", errors="replace").strip()
    except Exception as e:
        out = f"(read error: {e})"
    if out:
        print(out)
    print()
    return out

sftp = c.open_sftp()

def sftp_mkdirs(path):
    """Create remote directories recursively."""
    parts = path.split("/")
    current = ""
    for part in parts:
        if not part:
            continue
        current = f"{current}/{part}"
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)

def upload_file(local, remote):
    sftp.put(local, remote)
    print(f"  OK {os.path.basename(local)} -> {remote}")

def upload_dir(local_dir, remote_dir):
    """Upload all files in local_dir to remote_dir (flat, no recursion needed for assets)."""
    sftp_mkdirs(remote_dir)
    for fname in os.listdir(local_dir):
        local_path  = os.path.join(local_dir, fname)
        remote_path = f"{remote_dir}/{fname}"
        if os.path.isfile(local_path):
            upload_file(local_path, remote_path)

# ── 1. Ensure remote dirs exist ───────────────────────────────────────────────
print("=== Ensuring remote directories ===")
sh(f"mkdir -p {DIST_REMOTE}/assets {APP}/config {APP}/middleware {APP}/routes {APP}/services {APP}/utils")

# ── 2. Upload client dist ─────────────────────────────────────────────────────
print("=== Uploading React dist ===")
dist_local = "client/dist"

upload_file(f"{dist_local}/index.html",  f"{DIST_REMOTE}/index.html")
upload_file("client/public/sw.js",       f"{DIST_REMOTE}/sw.js")
upload_dir(f"{dist_local}/assets",       f"{DIST_REMOTE}/assets")

# Clean old hashed bundles on server
asset_files = os.listdir(f"{dist_local}/assets")
new_js  = next((f for f in asset_files if f.startswith("index-") and f.endswith(".js")),  None)
new_css = next((f for f in asset_files if f.startswith("index-") and f.endswith(".css")), None)
if new_js:
    sh(f"cd {DIST_REMOTE}/assets && ls index-*.js 2>/dev/null | grep -v '{new_js}' | xargs -r rm -f",
       "clean old JS")
if new_css:
    sh(f"cd {DIST_REMOTE}/assets && ls index-*.css 2>/dev/null | grep -v '{new_css}' | xargs -r rm -f",
       "clean old CSS")

# ── 3. Upload server files — track whether any changed ───────────────────────
print("=== Uploading server files ===")
server_files = [
    ("server/Passengerfile.json",    f"{APP}/Passengerfile.json"),
    ("server/server.js",             f"{APP}/server.js"),
    ("server/utils/log.js",          f"{APP}/utils/log.js"),
    ("server/config/db.js",          f"{APP}/config/db.js"),
    ("server/middleware/auth.js",    f"{APP}/middleware/auth.js"),
    ("server/routes/auth.js",        f"{APP}/routes/auth.js"),
    ("server/routes/shops.js",       f"{APP}/routes/shops.js"),
    ("server/routes/offers.js",      f"{APP}/routes/offers.js"),
    ("server/routes/reviews.js",     f"{APP}/routes/reviews.js"),
    ("server/routes/campaigns.js",   f"{APP}/routes/campaigns.js"),
    ("server/routes/push.js",        f"{APP}/routes/push.js"),
    ("server/routes/admin.js",       f"{APP}/routes/admin.js"),
    ("server/routes/bdo.js",         f"{APP}/routes/bdo.js"),
    ("server/routes/coming.js",      f"{APP}/routes/coming.js"),
    ("server/routes/stamps.js",      f"{APP}/routes/stamps.js"),
    ("server/routes/leads.js",       f"{APP}/routes/leads.js"),
    ("server/services/push.js",      f"{APP}/services/push.js"),
    ("server/services/aichatbot.js", f"{APP}/services/aichatbot.js"),
    ("server/routes/chat.js",        f"{APP}/routes/chat.js"),
    ("server/services/whatsapp.js",  f"{APP}/services/whatsapp.js"),
]

import hashlib

def file_hash(path):
    try:
        return hashlib.md5(open(path, 'rb').read()).hexdigest()
    except:
        return None

def remote_hash(sftp_conn, remote):
    try:
        import io
        buf = io.BytesIO()
        sftp_conn.getfo(remote, buf)
        return hashlib.md5(buf.getvalue()).hexdigest()
    except:
        return None

server_changed = False
for local, remote in server_files:
    if not os.path.exists(local):
        print(f"  -- skipped (not found): {local}")
        continue
    lh = file_hash(local)
    rh = remote_hash(sftp, remote)
    if lh != rh:
        upload_file(local, remote)
        server_changed = True
    else:
        print(f"  == unchanged: {os.path.basename(local)}")

sftp.close()
print()
print(f"Server files changed: {server_changed}")

# ── 4. Inject secrets into production .env ────────────────────────────────────
env_path = f"{HOME_REMOTE}/.env"

def inject_env(key, value, label=""):
    if not value:
        print(f"=== {label or key} secret not set — skipping ===")
        return
    print(f"=== Injecting {label or key} into .env ===")
    sh(f"""if grep -q '^{key}=' {env_path} 2>/dev/null; then sed -i 's|^{key}=.*|{key}={value}|' {env_path} && echo "Updated"; else echo "{key}={value}" >> {env_path} && echo "Added"; fi""", f"update .env ({key})")

inject_env("GROQ_API_KEY",        os.environ.get("GROQ_API_KEY","").strip(),        "GROQ_API_KEY")
inject_env("ANTHROPIC_API_KEY",   os.environ.get("ANTHROPIC_API_KEY","").strip(),   "ANTHROPIC_API_KEY")
inject_env("VAPID_PUBLIC_KEY",    os.environ.get("VAPID_PUBLIC_KEY","").strip(),    "VAPID_PUBLIC_KEY")
inject_env("VAPID_PRIVATE_KEY",   os.environ.get("VAPID_PRIVATE_KEY","").strip(),   "VAPID_PRIVATE_KEY")

# ── 5. Restart only if server files changed ───────────────────────────────────
# Skipping restart for client-only deploys prevents unnecessary Passenger exits
# which can trigger crash protection when multiple deploys happen quickly.
DEPLOY_SECRET = os.environ.get("DEPLOY_SECRET", "offerscity-deploy-2025")
PORT_FILE = f"{HOME_REMOTE}/node_port.txt"

if not server_changed:
    print("=== Client-only deploy — skipping server restart ===")
    time.sleep(5)
else:
    print("=== Server files changed — restarting Node process ===")
    time.sleep(3)

    # Graceful HTTP restart first; if that fails, kill by PID
    sh(
        f"PORT=$(cat {PORT_FILE} 2>/dev/null || echo 5008); "
        f"curl -sf -X POST http://localhost:$PORT/api/deploy-restart "
        f"  -H 'x-deploy-secret: {DEPLOY_SECRET}' -H 'Content-Type: application/json' "
        f"&& echo 'graceful HTTP restart OK' "
        f"|| (PID=$(cat {HOME_REMOTE}/node.pid 2>/dev/null); "
        f"   [ -n \"$PID\" ] && kill $PID 2>/dev/null && echo \"killed PID $PID\" "
        f"   || pkill -u $(whoami) -f 'node.*server.js' && echo 'pkilled node' "
        f"   || echo 'server was already down')",
        "graceful restart"
    )
    time.sleep(2)
    # Always touch always_restart.txt — bypasses Passenger crash protection
    sh(
        f"mkdir -p {HOME_REMOTE}/public_html/tmp && "
        f"touch {HOME_REMOTE}/public_html/tmp/restart.txt && "
        f"touch {HOME_REMOTE}/public_html/tmp/always_restart.txt && "
        f"echo 'Passenger restart signals sent'",
        "passenger restart signal"
    )

    # Wait up to 200s for Passenger to spawn a fresh worker
    # (Passengerfile.json startup_timeout = 180s, so we need at least that)
    print("Waiting for server to come back up…")
    up = False
    for i in range(40):
        time.sleep(5)
        r = sh(f"curl -sf https://offerscity.co.in/api/health || echo 'not yet'")
        if 'running' in r or 'OfferCity' in r:
            print(f"✅ Server up after {(i+1)*5}s")
            up = True
            break
        print(f"  {(i+1)*5}s — still starting…")

    # Always download node.log before potentially exiting — gives crash diagnosis
    print("=== Downloading node.log ===")
    try:
        sftp2 = c.open_sftp()
        # node.log now lives next to server.js at public_html/server/node.log
        sftp2.get(f"{APP}/node.log", "/tmp/node.log")
        sftp2.close()
        with open("/tmp/node.log", "r", errors="replace") as f:
            lines = f.readlines()
        print(f"  ({len(lines)} lines total — last 100:)")
        for line in lines[-100:]:
            print(line, end="")
    except Exception as e:
        print(f"Could not download node.log: {e}")

    if not up:
        print("❌ ERROR: Server did not come up within 75s after deploy!")
        import sys; sys.exit(1)

sh(f"curl -s https://offerscity.co.in/api/health", "final health check")

c.close()
print("=== Deploy complete ===")
