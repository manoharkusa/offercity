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
sh(f"mkdir -p {DIST_REMOTE}/assets {APP}/config {APP}/middleware {APP}/routes {APP}/services")

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

# ── 3. Upload server files ─────────────────────────────────────────────────────
print("=== Uploading server files ===")
server_files = [
    ("server/Passengerfile.json",    f"{APP}/Passengerfile.json"),
    ("server/server.js",             f"{APP}/server.js"),
    ("server/config/db.js",          f"{APP}/config/db.js"),
    ("server/middleware/auth.js",    f"{APP}/middleware/auth.js"),
    ("server/routes/auth.js",        f"{APP}/routes/auth.js"),
    ("server/routes/shops.js",       f"{APP}/routes/shops.js"),
    ("server/routes/offers.js",      f"{APP}/routes/offers.js"),
    ("server/routes/reviews.js",     f"{APP}/routes/reviews.js"),
    ("server/routes/campaigns.js",   f"{APP}/routes/campaigns.js"),
    ("server/routes/push.js",        f"{APP}/routes/push.js"),
    ("server/routes/admin.js",       f"{APP}/routes/admin.js"),
    ("server/routes/leads.js",       f"{APP}/routes/leads.js"),
    ("server/services/push.js",      f"{APP}/services/push.js"),
    ("server/services/aichatbot.js", f"{APP}/services/aichatbot.js"),
    ("server/services/whatsapp.js",  f"{APP}/services/whatsapp.js"),
]
for local, remote in server_files:
    if os.path.exists(local):
        upload_file(local, remote)
    else:
        print(f"  -- skipped (not found): {local}")

sftp.close()
print()

# ── 4. Inject GROQ_API_KEY into production .env ───────────────────────────────
groq_key = os.environ.get("GROQ_API_KEY", "").strip()
if groq_key:
    print("=== Injecting GROQ_API_KEY into .env ===")
    env_path = f"{HOME_REMOTE}/.env"
    sh(f"""if grep -q '^GROQ_API_KEY=' {env_path} 2>/dev/null; then sed -i 's|^GROQ_API_KEY=.*|GROQ_API_KEY={groq_key}|' {env_path} && echo "Updated"; else echo "GROQ_API_KEY={groq_key}" >> {env_path} && echo "Added"; fi""", "update .env")
else:
    print("=== GROQ_API_KEY secret not set — skipping ===")

# ── 5. Restart via localhost (avoids cPanel user-isolation issues) ────────────
# The running Node.js server has /api/deploy-restart — call it on localhost:PORT
# so the request hits Node directly without going through Passenger's proxy.
# Falls back to the public URL if localhost fails.
DEPLOY_SECRET = os.environ.get("DEPLOY_SECRET", "offerscity-deploy-2025")
PORT_FILE = f"{HOME_REMOTE}/node_port.txt"
print("=== Restarting Node process via localhost ===")
sh(
    f"PORT=$(cat {PORT_FILE} 2>/dev/null || echo 5008); "
    f"curl -sf -X POST http://localhost:$PORT/api/deploy-restart "
    f"  -H 'x-deploy-secret: {DEPLOY_SECRET}' -H 'Content-Type: application/json' "
    f"&& echo 'restart triggered via localhost' "
    f"|| curl -sf -X POST https://offerscity.co.in/api/deploy-restart "
    f"  -H 'x-deploy-secret: {DEPLOY_SECRET}' -H 'Content-Type: application/json' "
    f"&& echo 'restart triggered via public url' "
    f"|| echo 'NOTE: deploy-restart not yet available — do one manual cPanel restart'",
    "deploy-restart"
)
time.sleep(25)
sh(f"curl -s https://offerscity.co.in/api/health", "health check")

c.close()
print("=== Deploy complete ===")
