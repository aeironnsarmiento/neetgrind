// Loads NeetCode's problem list. It's bundled as object literals in main.<hash>.js, e.g.
// {problem:"Contains Duplicate",pattern:"Arrays & Hashing",link:"contains-duplicate/",ncLink:"duplicate-integer/",neetcode150:!0,...}
// Parsed with a small scanner (no eval).

import { fetchJson, fetchText } from "../platform/http.js";
import { cached } from "./cache.js";

export const NC_ORIGIN = "https://neetcode.io";
const FALLBACK_URL = "https://raw.githubusercontent.com/neetcode-gh/leetcode/main/.problemSiteData.json";
const FIELD = /([A-Za-z_$][\w$]*):("(?:[^"\\]|\\.)*"|!0|!1|true|false|-?\d+(?:\.\d+)?)/y;

function parseValue(raw) {
  if (raw === "!0" || raw === "true") return true;
  if (raw === "!1" || raw === "false") return false;
  if (raw[0] === '"') {
    try {
      return JSON.parse(raw.replace(/\\'/g, "'"));
    } catch {
      return raw.slice(1, -1);
    }
  }
  return Number(raw);
}

// Parses `key:value,key:value` pairs starting right after a `{`. Stops at anything unexpected.
function parseObjectAt(text, start) {
  const obj = {};
  let i = start;
  while (i < text.length) {
    FIELD.lastIndex = i;
    const m = FIELD.exec(text);
    if (!m) return null;
    obj[m[1]] = parseValue(m[2]);
    i = FIELD.lastIndex;
    if (text[i] === ",") i += 1;
    else if (text[i] === "}") return obj;
    else return null;
  }
  return null;
}

export function extractNeetcodeProblems(jsText) {
  const out = [];
  let at = jsText.indexOf("{problem:");
  while (at >= 0) {
    const obj = parseObjectAt(jsText, at + 1);
    if (obj && obj.problem && obj.pattern && obj.link) out.push(obj);
    at = jsText.indexOf("{problem:", at + 1);
  }
  return out;
}

export function mainBundleUrl(docOrHtml) {
  if (typeof docOrHtml === "string") {
    const m = docOrHtml.match(/src="([^"]*main\.[a-f0-9]+\.js)"/);
    return m ? new URL(m[1], `${NC_ORIGIN}/`).href : null;
  }
  const el = docOrHtml.querySelector('script[src*="main."]');
  return el ? el.src : null;
}

// Returns { problems, source } where source is "bundle" or "github".
export async function loadNeetcodeProblems({ doc, force = false } = {}) {
  let url = doc ? mainBundleUrl(doc) : null;
  if (!url) url = mainBundleUrl(await fetchText(`${NC_ORIGIN}/roadmap`));
  try {
    if (!url) throw new Error("NeetCode main bundle not found");
    const problems = await cached("nc:problems", url, async () => {
      const list = extractNeetcodeProblems(await fetchText(url));
      if (list.length < 200) throw new Error(`Only found ${list.length} NeetCode problems`);
      return list;
    }, { force });
    return { problems, source: "bundle" };
  } catch (err) {
    console.warn("[NeetGrind] Falling back to GitHub problem data:", err);
    const problems = await cached("nc:problems:github", "v1", () => fetchJson(FALLBACK_URL), { force });
    return { problems, source: "github" };
  }
}
