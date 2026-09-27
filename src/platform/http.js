// Cross-origin requests go through GM_xmlhttpRequest (needs @connect); same-origin uses fetch.
/* global GM_xmlhttpRequest */

const hasGMXhr = typeof GM_xmlhttpRequest === "function";

function gmGet(url) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url,
      onload: (res) =>
        res.status >= 200 && res.status < 300 ? resolve(res.responseText) : reject(new Error(`${res.status} ${url}`)),
      onerror: () => reject(new Error(`Network error: ${url}`)),
      ontimeout: () => reject(new Error(`Timed out: ${url}`)),
      timeout: 30_000,
    });
  });
}

export async function fetchText(url) {
  const sameOrigin = typeof location !== "undefined" && new URL(url, location.href).origin === location.origin;
  if (!sameOrigin && hasGMXhr) return gmGet(url);
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

export async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}
