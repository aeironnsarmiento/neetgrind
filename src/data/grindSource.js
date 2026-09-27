// Loads the Grind 75 question dataset from the site's own JS at runtime.
// The dataset has no license, so it is fetched from the site, never bundled.

import { fetchText } from "../platform/http.js";
import { cached } from "./cache.js";

export const GRIND_ORIGIN = "https://www.techinterviewhandbook.org";
export const GRIND_PAGE = `${GRIND_ORIGIN}/grind75`;
const SIGNATURE = '"slug":"two-sum"';

// Decodes the body of a single-quoted JS string literal.
function decodeJsString(body) {
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, esc) => {
    if (esc[0] === "u" && esc[1] === "{") return String.fromCodePoint(parseInt(esc.slice(2, -1), 16));
    if (esc[0] === "u" && esc.length === 5) return String.fromCharCode(parseInt(esc.slice(1), 16));
    if (esc[0] === "x" && esc.length === 3) return String.fromCharCode(parseInt(esc.slice(1), 16));
    return { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", 0: "\0" }[esc] ?? esc;
  });
}

// Finds `JSON.parse('[...]')` around the two-sum record and returns the parsed array.
export function extractGrindQuestions(jsText) {
  const at = jsText.indexOf(SIGNATURE);
  if (at < 0) return null;
  const open = jsText.lastIndexOf("JSON.parse('", at);
  if (open < 0) return null;
  const start = open + "JSON.parse('".length;
  let i = start;
  while (i < jsText.length) {
    if (jsText[i] === "\\") i += 2;
    else if (jsText[i] === "'") break;
    else i += 1;
  }
  const data = JSON.parse(decodeJsString(jsText.slice(start, i)));
  if (!Array.isArray(data) || !data.every((q) => q.slug && q.difficulty && Number.isFinite(q.duration))) {
    throw new Error("Grind 75 dataset has an unexpected shape");
  }
  return data;
}

export function chunkUrlsFromHtml(html, base = GRIND_PAGE) {
  return [...html.matchAll(/src="([^"]*\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => new URL(m[1], base).href);
}

// On the Grind 75 page itself, chunks may be loaded dynamically, so also check resource timings.
export function chunkUrlsFromDocument(doc = document) {
  const fromTags = [...doc.querySelectorAll("script[src]")].map((s) => s.src);
  const fromPerf = performance.getEntriesByType("resource").map((e) => e.name);
  return [...new Set([...fromTags, ...fromPerf])].filter((u) => /\/grind75\/_next\/static\/chunks\/.+\.js/.test(u));
}

async function findDataset(urls) {
  for (const url of urls) {
    const text = await fetchText(url);
    if (text.includes(SIGNATURE)) return { url, questions: extractGrindQuestions(text) };
  }
  throw new Error("Couldn't find the Grind 75 question list in the site's scripts");
}

// `urls` is optional; without it the Grind 75 page is fetched to discover them.
export async function loadGrindQuestions({ urls, force = false } = {}) {
  const candidates = urls ?? chunkUrlsFromHtml(await fetchText(GRIND_PAGE));
  // Chunk names are content hashes, so the list of names is a good cache key.
  const key = candidates.map((u) => u.split("/").pop()).sort().join(",");
  const found = await cached("grind:data", key, () => findDataset(candidates), { force });
  return found.questions;
}
