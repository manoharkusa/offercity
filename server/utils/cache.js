const store = new Map();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { store.delete(key); return null; }
  return entry.value;
}

function set(key, value, ttlMs = DEFAULT_TTL) {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

// Delete all keys that start with a given prefix
function del(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

function clear() { store.clear(); }

function size() { return store.size; }

module.exports = { get, set, del, clear, size };
