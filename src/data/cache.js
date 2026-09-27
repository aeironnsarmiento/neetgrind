import { storage } from "../platform/storage.js";

// Caches `load()`'s result under `name` until `key` changes (e.g. a new bundle hash).
export async function cached(name, key, load, { force = false } = {}) {
  const hit = storage.get(name, null);
  if (!force && hit && hit.key === key) return hit.value;
  const value = await load();
  storage.set(name, { key, value, fetchedAt: new Date().toISOString() });
  return value;
}
