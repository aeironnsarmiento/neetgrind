// Reads NeetCode's own completion data from localStorage (read-only).
// Logged in:  synced-progress-cache = { completed: { [pattern]: ["slug/", ...] }, starred: ... }
// Logged out: completed-problem-list = { [pattern]: ["slug/", ...] }

import { normalizeSlug } from "../core/mapping.js";
import { storage } from "../platform/storage.js";

function collect(value, out) {
  if (typeof value === "string") out.add(normalizeSlug(value));
  else if (Array.isArray(value)) value.forEach((v) => collect(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (v === true) out.add(normalizeSlug(k));
      else collect(v, out);
    }
  }
}

function readJson(ls, key) {
  try {
    return JSON.parse(ls.getItem(key));
  } catch {
    return null;
  }
}

export function readCompletedSlugs(ls = localStorage) {
  const out = new Set();
  const synced = readJson(ls, "synced-progress-cache");
  if (synced?.completed) collect(synced.completed, out);
  const local = readJson(ls, "completed-problem-list");
  if (local) collect(local, out);
  return out;
}

// LeetCode-only questions have no NeetCode checkbox, so they're ticked locally.
export const lcDone = {
  all: () => storage.get("lcDone", {}),
  toggle(slug) {
    const all = storage.get("lcDone", {});
    if (all[slug]) delete all[slug];
    else all[slug] = new Date().toISOString();
    storage.set("lcDone", all);
  },
};

export function makeIsDone() {
  const nc = readCompletedSlugs();
  const lc = lcDone.all();
  return (q) => (q.leetcodeOnly ? Boolean(lc[q.slug]) : nc.has(q.slug));
}
