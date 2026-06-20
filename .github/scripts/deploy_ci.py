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

# ── 5. Verify upload & restart ────────────────────────────────────────────────
print("=== Verifying uploaded server.js ===")
# Write diagnostics to node.log so we can read them via /api/logs
# Find where cPanel is ACTUALLY running the app from
sh(
    f"ALT={HOME_REMOTE}/server/server.js; "
    f"HAS_ALT=$(grep -c 'deploy-restart' $ALT 2>/dev/null || echo 0); "
    f"LS1=$(ls -la {APP}/server.js 2>/dev/null | awk '{{print $1,$5,$9}}'); "
    f"LS2=$(ls -la $ALT 2>/dev/null | awk '{{print $1,$5,$9}}'); "
    f"echo \"[DEPLOY PATHS] public_html/server=$LS1 has=$HAS alt_server=$LS2 alt_has=$HAS_ALT\" >> {HOME_REMOTE}/node.log; "
    f"ls {HOME_REMOTE}/ >> {HOME_REMOTE}/node.log 2>&1 || true",
    "find-app-path"
)

# Call /api/deploy-restart on the running server — it calls process.exit(0)
# and Passenger immediately spawns a fresh worker from the new files on disk.
DEPLOY_SECRET = os.environ.get("DEPLOY_SECRET", "offerscity-deploy-2025")
print("=== Restarting via /api/deploy-restart ===")
sh(
    f"curl -s -X POST https://offerscity.co.in/api/deploy-restart "
    f"-H 'x-deploy-secret: {DEPLOY_SECRET}' "
    f"-H 'Content-Type: application/json' || echo 'restart endpoint not yet available (manual cPanel restart needed)'",
    "deploy-restart"
)
time.sleep(25)
sh(f"curl -s https://offerscity.co.in/api/health", "health check")

c.close()
print("=== Deploy complete ===")
