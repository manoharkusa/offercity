"""Find BigRock upload image files, tar them, and download the tarball to the runner."""
import paramiko, os, sys

OUT_TAR = os.environ.get("OUT_TAR", "/tmp/uploads.tar.gz")

key = paramiko.Ed25519Key.from_private_key_file("/tmp/br_key")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
host = os.environ["SSH_HOST"].strip()
user = os.environ["SSH_USER"].strip()
print(f"Connecting to {host} as {user}...")
c.connect(hostname=host, username=user, pkey=key, port=22, timeout=30)
print("SSH connected OK\n")

def sh(cmd, timeout=120):
    _, o, e = c.exec_command(cmd, timeout=timeout)
    o.channel.set_combine_stderr(False)
    return o.read().decode(errors="replace").strip(), e.read().decode(errors="replace").strip()

# Find every 'uploads' directory under the home, report file counts
home = "/home1/a1751tyi"
out, _ = sh(f"find {home} -type d -name uploads 2>/dev/null")
dirs = [d for d in out.splitlines() if d.strip()]
print("uploads dirs found:")
best = None
best_count = -1
for d in dirs:
    cnt_out, _ = sh(f"ls -1 '{d}' 2>/dev/null | wc -l")
    try:
        cnt = int(cnt_out.strip())
    except ValueError:
        cnt = 0
    print(f"  {d} -> {cnt} files")
    if cnt > best_count:
        best_count, best = cnt, d

if not best or best_count == 0:
    print("No non-empty uploads dir found on BigRock.")
    sys.exit(1)

print(f"\nSelected: {best} ({best_count} files)")
# Show a sample
sample, _ = sh(f"ls -1 '{best}' 2>/dev/null | head -10")
print("sample files:\n" + sample)

# Tar the chosen uploads dir (contents only, so it extracts directly into target)
rtar = "/tmp/br_uploads.tar.gz"
_, err = sh(f"tar -czf {rtar} -C '{best}' . && echo done", timeout=180)
size_out, _ = sh(f"stat -c %s {rtar} 2>/dev/null || wc -c < {rtar}")
print(f"\nRemote tar size: {size_out} bytes")
if err:
    print("tar stderr:", err[:300])

# Download via SFTP
print(f"Downloading to {OUT_TAR}...")
sftp = c.open_sftp()
sftp.get(rtar, OUT_TAR)
sftp.close()
print(f"Downloaded: {os.path.getsize(OUT_TAR)} bytes")
c.close()
print("Done.")
