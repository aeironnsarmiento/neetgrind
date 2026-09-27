// LeetCode company-tagged question lists from github.com/liquidslr/leetcode-company-wise-problems.
// One folder per company, one CSV per time window:
//   Difficulty,Title,Frequency,Acceptance Rate,Link,Topics
//   MEDIUM,3Sum,66.8,0.0039,https://leetcode.com/problems/3sum,"Array, Two Pointers, Sorting"
// The lists have no license, so they're fetched at runtime (pinned to a commit), never bundled.

import { normalizeSlug } from "../core/mapping.js";
import { fetchJson, fetchText } from "../platform/http.js";
import { storage } from "../platform/storage.js";
import { cached } from "./cache.js";

export const CO_REPO = "liquidslr/leetcode-company-wise-problems";
export const CO_REPO_URL = `https://github.com/${CO_REPO}`;
const API = `https://api.github.com/repos/${CO_REPO}`;
const RAW = `https://raw.githubusercontent.com/${CO_REPO}`;
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

export const WINDOWS = {
  "30d": "1. Thirty Days.csv",
  "3mo": "2. Three Months.csv",
  "6mo": "3. Six Months.csv",
  all: "5. All.csv",
};
export const WINDOW_LABELS = { "30d": "30 days", "3mo": "3 months", "6mo": "6 months", all: "All time" };

// RFC 4180: quoted fields may hold commas, newlines and "" escapes.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(field), (field = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows.filter((r) => r.some((f) => f.trim()));
}

const DIFF = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" };

export function slugFromLink(link) {
  const m = String(link ?? "").match(/\/problems\/([^/?#]+)/);
  return m ? normalizeSlug(m[1]) : "";
}

// Returns [{ slug, title, difficulty, frequency, lcTopics }], looking columns up by header name.
export function rowsFromCsv(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const col = Object.fromEntries(header.map((name, i) => [name.trim().toLowerCase(), i]));
  const get = (r, name) => (col[name] == null ? "" : (r[col[name]] ?? "").trim());
  const out = [];
  for (const r of rows) {
    const slug = slugFromLink(get(r, "link"));
    const difficulty = DIFF[get(r, "difficulty").toUpperCase()];
    if (!slug || !difficulty) continue;
    out.push({
      slug,
      title: get(r, "title") || slug,
      difficulty,
      frequency: Number(get(r, "frequency")) || 0,
      lcTopics: get(r, "topics").split(",").map((t) => t.trim()).filter(Boolean),
    });
  }
  return out;
}

// Merges each company's rows by slug: [{ slug, title, difficulty, lcTopics, tags: [{ company, frequency }] }],
// sorted by best frequency.
export function mergeCompanyRows(listsByCompany) {
  const bySlug = new Map();
  for (const [company, rows] of Object.entries(listsByCompany)) {
    for (const r of rows) {
      let q = bySlug.get(r.slug);
      if (!q) bySlug.set(r.slug, (q = { slug: r.slug, title: r.title, difficulty: r.difficulty, lcTopics: r.lcTopics, tags: [] }));
      if (!q.tags.some((t) => t.company === company)) q.tags.push({ company, frequency: r.frequency });
    }
  }
  const best = (q) => Math.max(...q.tags.map((t) => t.frequency));
  for (const q of bySlug.values()) q.tags.sort((a, b) => b.frequency - a.frequency);
  return [...bySlug.values()].sort((a, b) => best(b) - best(a));
}

// Latest commit on the list repo: { sha, date }. Checked at most once a day unless forced.
export async function latestVersion({ force = false } = {}) {
  const hit = storage.get("co:latest", null);
  if (!force && hit && Date.now() - hit.checkedAt < CHECK_EVERY_MS) return hit.version;
  const commit = await fetchJson(`${API}/commits/main`);
  const version = { sha: commit.sha, date: commit.commit?.committer?.date ?? commit.commit?.author?.date ?? null };
  storage.set("co:latest", { version, checkedAt: Date.now() });
  return version;
}

export async function loadCompanyNames(sha) {
  return cached("co:names", sha, async () => {
    const tree = await fetchJson(`${API}/git/trees/${sha}`);
    return tree.tree.filter((e) => e.type === "tree").map((e) => e.path).sort((a, b) => a.localeCompare(b));
  });
}

export async function loadCompanyList(company, window, sha) {
  const file = WINDOWS[window] ?? WINDOWS["6mo"];
  const url = `${RAW}/${sha}/${encodeURIComponent(company)}/${encodeURIComponent(file)}`;
  return cached(`co:list:${company}:${window}`, sha, async () => rowsFromCsv(await fetchText(url)));
}

// Everything a plan snapshots: the merged rows for `names` in `window`, at the latest commit.
export async function buildCompanyPool(names, window, { force = false } = {}) {
  if (!names?.length) return { companyPool: [], companyVersion: null };
  const version = await latestVersion({ force });
  const lists = {};
  for (const name of names) lists[name] = await loadCompanyList(name, window, version.sha);
  return { companyPool: mergeCompanyRows(lists), companyVersion: version };
}
