// NeetCode completion data (read-only). Three sources, newest wins:
// 1. Server: logged-in progress lives on NeetCode's server. We see it by watching the page's own
//    API calls (platform/netHook.js): getCompletedProblems gives a full snapshot, markProblem(In)complete
//    and an Accepted executeCodeFunctionHttp submission give single updates.
// 2. localStorage, for logged-out users (and as a fallback before the first snapshot):
//    Logged in:  synced-progress-cache = { completed: { [pattern]: ["slug/", ...] }, starred: ... }
//                (only refreshed when NeetCode renders a problem table, so often stale)
//    Logged out: completed-problem-list = { [pattern]: ["slug/", ...] }
// 3. lcDone: LeetCode-only questions, ticked inside NeetGrind.
// Set localStorage "neetgrind:debug" to "1" to log every captured API response.

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

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readCompletedSlugs(ls = localStorage) {
  const out = new Set();
  const synced = parseJson(ls.getItem("synced-progress-cache"));
  if (synced?.completed) collect(synced.completed, out);
  const local = parseJson(ls.getItem("completed-problem-list"));
  if (local) collect(local, out);
  return out;
}

// --- server progress, from captured API calls ----------------------------------------------

const FAILED = /^(wrong answer|time limit exceeded|memory limit exceeded|runtime error|compil(e|ation) error|output limit exceeded)$/i;

// The submission response format isn't documented, so look for an "Accepted" verdict anywhere
// in it, and refuse if a failure verdict shows up too (per-test-case results may say "Accepted").
export function isAcceptedResponse(res) {
  let accepted = false;
  let failed = false;
  const walk = (v, depth) => {
    if (depth > 6 || failed) return;
    if (typeof v === "string") {
      if (/^accepted$/i.test(v.trim())) accepted = true;
      else if (FAILED.test(v.trim())) failed = true;
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (/^(is)?accepted$/i.test(k) && typeof x === "boolean") x ? (accepted = true) : (failed = true);
        else walk(x, depth + 1);
      }
    }
  };
  walk(res, 0);
  return accepted && !failed;
}

const EMPTY = () => ({ server: null, marks: {}, accepted: {} });

// Folds one captured API call into the saved state. Returns the new state, or null if the call
// didn't say anything about progress.
//   server:   { at, slugs }            full snapshot (LeetCode slugs, like NeetCode's `link`)
//   marks:    { [slug]: { done, at } } checkbox clicks since the snapshot
//   accepted: { [problemId]: at }      Accepted submissions since the snapshot (NeetCode ids)
export function applyCapture(state, cap, now = new Date().toISOString()) {
  if (cap.status !== 200) return null;
  const req = parseJson(cap.body)?.data ?? {};
  const res = parseJson(cap.text)?.data;
  const next = { ...EMPTY(), ...state, marks: { ...state?.marks }, accepted: { ...state?.accepted } };

  if (/\/executeCodeFunctionHttp\b/.test(cap.url)) {
    if (!isAcceptedResponse(res)) return null;
    const ids = new Set([req.problemId, cap.path?.match(/^\/problems\/([^/]+)/)?.[1]].map(normalizeSlug).filter(Boolean));
    if (!ids.size) return null;
    for (const id of ids) next.accepted[id] = now;
    return next;
  }

  switch (req.functionId) {
    case "getCompletedProblems": {
      if (!res || typeof res !== "object") return null;
      const slugs = new Set();
      collect(res, slugs);
      // The snapshot already reflects everything before it.
      return { server: { at: now, slugs: [...slugs] }, marks: {}, accepted: {} };
    }
    case "markProblemComplete":
    case "markProblemIncomplete": {
      const slug = normalizeSlug(req.problem);
      if (!slug) return null;
      next.marks[slug] = { done: req.functionId === "markProblemComplete", at: now };
      return next;
    }
    default:
      return null;
  }
}

// Newest signal wins: an Accepted submission, a checkbox click, then the snapshot (or localStorage).
export function isSolved(q, state, fallback) {
  const acc = [q.ncLink, q.slug].map((k) => k && state?.accepted?.[normalizeSlug(k)]).filter(Boolean).sort().at(-1);
  const mark = state?.marks?.[q.slug];
  if (acc && (!mark || acc >= mark.at)) return true;
  if (mark) return mark.done;
  return state?.server ? state.server.slugs.includes(q.slug) : fallback.has(q.slug);
}

const listeners = new Set();
export const onProgress = (fn) => listeners.add(fn);

function debugOn() {
  try {
    return localStorage.getItem("neetgrind:debug") === "1";
  } catch {
    return false;
  }
}

function debugLog(cap, next) {
  const req = parseJson(cap.body)?.data ?? {};
  const { rawCode, ...reqShown } = req; // don't echo the user's code
  console.log(
    "[NeetGrind] captured",
    cap.url.replace(/^.*\//, ""),
    reqShown,
    `status ${cap.status}`,
    next ? "→ progress updated" : "→ ignored",
    "\nresponse:",
    cap.text.length > 4000 ? `${cap.text.slice(0, 4000)}… (${cap.text.length} chars)` : cap.text,
  );
}

export function recordCapture(cap) {
  const next = applyCapture(storage.get("ncProgress", null), cap);
  if (debugOn()) debugLog(cap, next);
  if (!next) return;
  storage.set("ncProgress", next);
  listeners.forEach((fn) => fn());
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
  const state = storage.get("ncProgress", null);
  const ls = readCompletedSlugs();
  const lc = lcDone.all();
  return (q) => (q.leetcodeOnly ? Boolean(lc[q.slug]) : isSolved(q, state, ls));
}
